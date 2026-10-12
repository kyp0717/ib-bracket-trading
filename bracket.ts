// One bracket state machine per symbol.
// Arm, disarm, entry lock, cancel-replace before any fill,
// same-order-ID modify of the children after a fill.

import { OrderAction, OrderType } from "@stoqey/ib";
import * as ibmod from "./ib";
import { audit } from "./log";
import { emit } from "./emit";

export interface Leg {
  orderId: number;
  status: string;
  filled: number;
  avgPrice: number;
}

export interface Bracket {
  symbol: string;
  qty: number;
  entry: number;
  stop: number;
  target: number;
  orderType: "LMT" | "MKT";
  state: "working" | "partial" | "closed";
  entryLocked: boolean;
  parent: Leg;
  stopLeg: Leg;
  targetLeg: Leg;
  ocaGroup: string;
}

const brackets = new Map<string, Bracket>();
const legIndex = new Map<number, { br: Bracket; leg: "parent" | "stop" | "target" }>();

let armsBlocked = true;
let reconcilePending = { openOrders: false, positions: false };
let reconcileTimer: ReturnType<typeof setTimeout> | null = null;

// Order IDs waiting for a Cancelled/Inactive ack from the gateway.
// While a symbol has pending cancels, arm and cancel-replace for that
// symbol are refused. This keeps two brackets from ever coexisting.
const pendingCancels = new Map<string, Set<number>>();
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

function markPending(symbol: string, orderIds: number[]): void {
  if (!orderIds.length) return;
  let s = pendingCancels.get(symbol);
  if (!s) {
    s = new Set();
    pendingCancels.set(symbol, s);
  }
  for (const id of orderIds) s.add(id);
  clearTimeout(pendingTimers.get(symbol));
  pendingTimers.set(
    symbol,
    setTimeout(() => {
      pendingCancels.delete(symbol);
      pendingTimers.delete(symbol);
      emit({ t: "bracket", symbol, bracket: snapshot() });
    }, 10000)
  );
}

function resolvePending(br: Bracket, orderId: number): void {
  const s = pendingCancels.get(br.symbol);
  if (!s || !s.delete(orderId)) return;
  if (s.size === 0) {
    clearTimeout(pendingTimers.get(br.symbol));
    pendingTimers.delete(br.symbol);
    pendingCancels.delete(br.symbol);
    emit({ t: "bracket", symbol: br.symbol, bracket: snapshot() });
  }
}

function cancelsInFlight(symbol: string): boolean {
  return (pendingCancels.get(symbol)?.size ?? 0) > 0;
}

export function get(symbol: string): Bracket | undefined {
  return brackets.get(symbol);
}

export function blockArms(): void {
  armsBlocked = true;
}

export function beginReconcile(): void {
  armsBlocked = true;
  reconcilePending = { openOrders: true, positions: true };
  if (reconcileTimer) clearTimeout(reconcileTimer);
  reconcileTimer = setTimeout(finishReconcileIfDone, 5000);
  try {
    ibmod.ib.reqOpenOrders();
    ibmod.ib.reqPositions();
  } catch {
    /* connection not ready, the timer fallback releases arms */
  }
  emit({ t: "conn", ...ibmod.state });
}

export function onReconcileStep(which: "openOrders" | "positions"): void {
  reconcilePending[which] = false;
  finishReconcileIfDone();
}

function finishReconcileIfDone(): void {
  if (armsBlocked && !reconcilePending.openOrders && !reconcilePending.positions) {
    armsBlocked = false;
    ibmod.state.reconciled = true;
    if (reconcileTimer) clearTimeout(reconcileTimer);
    reconcileTimer = null;
    audit("reconcile", "open orders and positions replayed, arms open");
    emit({ t: "conn", ...ibmod.state });
    emit({ t: "bracket", symbol: "*", bracket: snapshot() });
  }
}

export interface ArmParams {
  symbol: string;
  qty: number;
  entry: number;
  stop: number;
  target: number;
  orderType: "LMT" | "MKT";
}

export function arm(p: ArmParams, replacing = false): { ok: boolean; error?: string } {
  if (armsBlocked || !ibmod.state.reconciled) {
    return { ok: false, error: "arms blocked until reconnect reconcile finishes" };
  }
  // A cancel-replace re-arms as one indivisible step and is exempt
  // from its own pending-cancels barrier.
  if (!replacing && cancelsInFlight(p.symbol)) {
    return { ok: false, error: `cancel in flight for ${p.symbol}, wait for acks` };
  }
  if (brackets.has(p.symbol) && brackets.get(p.symbol)!.state !== "closed") {
    return { ok: false, error: `bracket already working for ${p.symbol}` };
  }
  if (p.orderType === "LMT" && !(p.entry > 0)) {
    return { ok: false, error: "entry price required for limit parent" };
  }
  const contract = ibmod.contractFor(p.symbol);
  const base = ibmod.takeOrderIds(3);
  const parentId = base;
  const stopId = base + 1;
  const targetId = base + 2;
  const ocaGroup = `br-${p.symbol}-${parentId}`;

  const br: Bracket = {
    symbol: p.symbol,
    qty: p.qty,
    entry: p.orderType === "LMT" ? p.entry : 0,
    stop: p.stop,
    target: p.target,
    orderType: p.orderType,
    state: "working",
    entryLocked: false,
    parent: { orderId: parentId, status: "PendingSubmit", filled: 0, avgPrice: 0 },
    stopLeg: { orderId: stopId, status: "PendingSubmit", filled: 0, avgPrice: 0 },
    targetLeg: { orderId: targetId, status: "PendingSubmit", filled: 0, avgPrice: 0 },
    ocaGroup,
  };

  const parent: any = {
    orderId: parentId,
    action: OrderAction.BUY,
    orderType: p.orderType === "LMT" ? OrderType.LMT : OrderType.MKT,
    totalQuantity: p.qty,
    lmtPrice: p.orderType === "LMT" ? p.entry : undefined,
    tif: "DAY",
    transmit: false,
    outsideRth: true,
  };
  const stopOrder: any = {
    orderId: stopId,
    parentId,
    action: OrderAction.SELL,
    orderType: OrderType.STP,
    totalQuantity: p.qty,
    auxPrice: p.stop,
    tif: "GTC",
    transmit: false,
    ocaGroup,
    ocaType: 1,
    outsideRth: true,
  };
  const targetOrder: any = {
    orderId: targetId,
    parentId,
    action: OrderAction.SELL,
    orderType: OrderType.LMT,
    totalQuantity: p.qty,
    lmtPrice: p.target,
    tif: "GTC",
    transmit: true,
    ocaGroup,
    ocaType: 1,
    outsideRth: true,
  };

  brackets.set(p.symbol, br);
  indexLegs(br);
  ibmod.place(contract, parent);
  ibmod.place(contract, stopOrder);
  ibmod.place(contract, targetOrder);
  audit("arm", `${p.symbol} qty=${p.qty} ${p.orderType} entry=${p.entry} stop=${p.stop} target=${p.target} parent=${parentId} stop=${stopId} target=${targetId}`);
  emit({ t: "bracket", symbol: p.symbol, bracket: snapshot() });
  return { ok: true };
}

export function disarm(symbol: string, reason: string): { ok: boolean; error?: string } {
  const br = brackets.get(symbol);
  if (!br) return { ok: false, error: `no bracket for ${symbol}` };
  // Cancel is the escape hatch. It never waits for anything and is
  // always allowed. New arms for this symbol wait for the acks.
  const sent: number[] = [];
  for (const leg of [br.parent, br.stopLeg, br.targetLeg]) {
    if (!["Filled", "Cancelled", "Inactive"].includes(leg.status)) {
      ibmod.cancel(leg.orderId);
      sent.push(leg.orderId);
    }
  }
  markPending(symbol, sent);
  br.state = "closed";
  audit("disarm", `${symbol}: ${reason}`);
  emit({ t: "bracket", symbol, bracket: snapshot() });
  return { ok: true };
}

export interface Levels {
  entry?: number;
  stop?: number;
  target?: number;
}

export function editLevels(symbol: string, lv: Levels): { ok: boolean; error?: string } {
  const br = brackets.get(symbol);
  if (!br) return { ok: false, error: `no bracket for ${symbol}` };
  if (br.state === "closed") return { ok: false, error: `bracket for ${symbol} is closed` };
  if (!br.entryLocked && cancelsInFlight(symbol)) {
    return { ok: false, error: `cancel-replace in flight for ${symbol}` };
  }

  const entry = lv.entry ?? br.entry;
  const stop = lv.stop ?? br.stop;
  const target = lv.target ?? br.target;

  if (!br.entryLocked) {
    // No fill yet. Cancel the whole bracket and replace it. The new
    // bracket is not placed until this call, right after the cancels.
    br.state = "closed";
    const sent: number[] = [];
    for (const leg of [br.parent, br.stopLeg, br.targetLeg]) {
      if (!["Filled", "Cancelled", "Inactive"].includes(leg.status)) {
        ibmod.cancel(leg.orderId);
        sent.push(leg.orderId);
      }
    }
    markPending(symbol, sent);
    brackets.delete(symbol);
    for (const leg of [br.parent, br.stopLeg, br.targetLeg]) legIndex.delete(leg.orderId);
    audit("replace", `${symbol}: cancel parent=${br.parent.orderId} stop=${br.stopLeg.orderId} target=${br.targetLeg.orderId}`);
    return arm({
      symbol,
      qty: br.qty,
      entry,
      stop,
      target,
      orderType: br.orderType === "MKT" && br.parent.status !== "Submitted" ? br.orderType : "LMT",
    }, true);
  }

  // A fill arrived. The entry is locked. Move only the children,
  // in place, on the same order IDs.
  if (lv.entry !== undefined && lv.entry !== br.entry) {
    return { ok: false, error: `entry locked after fill for ${symbol}` };
  }
  br.stop = stop;
  br.target = target;
  const contract = ibmod.contractFor(symbol);
  ibmod.place(contract, {
    orderId: br.stopLeg.orderId,
    parentId: br.parent.orderId,
    action: OrderAction.SELL,
    orderType: OrderType.STP,
    totalQuantity: br.qty - br.parent.filled > 0 ? br.qty - br.parent.filled : br.qty,
    auxPrice: stop,
    tif: "GTC",
    transmit: true,
    ocaGroup: br.ocaGroup,
    ocaType: 1,
    outsideRth: true,
  });
  ibmod.place(contract, {
    orderId: br.targetLeg.orderId,
    parentId: br.parent.orderId,
    action: OrderAction.SELL,
    orderType: OrderType.LMT,
    totalQuantity: br.qty,
    lmtPrice: target,
    tif: "GTC",
    transmit: true,
    ocaGroup: br.ocaGroup,
    ocaType: 1,
    outsideRth: true,
  });
  audit("modify", `${symbol}: stop=${stop} target=${target} on ids ${br.stopLeg.orderId}/${br.targetLeg.orderId}`);
  emit({ t: "bracket", symbol, bracket: snapshot() });
  return { ok: true };
}

export function onOrderStatus(
  orderId: number,
  status: string,
  filled: number,
  remaining: number,
  avgFillPrice: number,
  parentId: number
): void {
  const hit = legIndex.get(orderId);
  if (!hit) return;
  const { br, leg } = hit;
  const l = leg === "parent" ? br.parent : leg === "stop" ? br.stopLeg : br.targetLeg;
  l.status = status;
  l.filled = filled;
  l.avgPrice = avgFillPrice || l.avgPrice;

  if (leg === "parent" && filled > 0) {
    br.entryLocked = true;
    if (br.state === "working") br.state = "partial";
  }
  if ((leg === "stop" || leg === "target") && status === "Filled" && br.state !== "closed") {
    br.state = "closed";
  }
  if (status === "Filled") {
    audit("fill", `${br.symbol} ${leg} order=${orderId} filled=${filled} avg=${avgFillPrice}`);
  }
  if (status === "Cancelled" || status === "Inactive") {
    resolvePending(br, orderId);
    audit("cancel-ack", `${br.symbol} ${leg} order=${orderId} ${status}`);
  }
  emit({ t: "bracket", symbol: br.symbol, bracket: snapshot() });
}

// Reconcile: rebuild a working bracket we find resting at the gateway.
const reconcileParents = new Map<number, any>();

export function onOpenOrder(orderId: number, symbol: string, order: any): void {
  const known = legIndex.get(orderId);
  if (known) {
    return;
  }
  if (!reconcilePending.openOrders) return;
  if (!order.parentId) {
    if (order.orderType === "LMT" || order.orderType === "MKT") {
      reconcileParents.set(orderId, { symbol, order });
    }
    return;
  }
  const parent = reconcileParents.get(order.parentId);
  if (!parent) return;
  const key = `${parent.symbol}`;
  let br = brackets.get(key);
  if (!br || br.state === "closed") {
    br = {
      symbol: parent.symbol,
      qty: order.totalQuantity,
      entry: parent.order.lmtPrice || 0,
      stop: 0,
      target: 0,
      orderType: parent.order.orderType,
      state: "working",
      entryLocked: false,
      parent: { orderId: parent.order.orderId ?? order.parentId, status: "Submitted", filled: 0, avgPrice: 0 },
      stopLeg: { orderId: 0, status: "none", filled: 0, avgPrice: 0 },
      targetLeg: { orderId: 0, status: "none", filled: 0, avgPrice: 0 },
      ocaGroup: order.ocaGroup || `br-${key}-${order.parentId}`,
    };
    brackets.set(key, br);
    indexLegs(br);
  }
  if (order.orderType === "STP") {
    br.stopLeg = { orderId, status: "Submitted", filled: 0, avgPrice: 0 };
    br.stop = order.auxPrice;
  } else {
    br.targetLeg = { orderId, status: "Submitted", filled: 0, avgPrice: 0 };
    br.target = order.lmtPrice;
  }
  indexLegs(br);
  audit("reconcile-order", `${key}: found ${order.orderType} order ${orderId} parent=${order.parentId}`);
  emit({ t: "bracket", symbol: key, bracket: snapshot() });
}

// Positions seen on the account, per symbol. Independent source of
// truth next to order status callbacks.
const positions = new Map<string, number>();

export function onPosition(symbol: string, pos: number): void {
  positions.set(symbol, pos);
  const br = brackets.get(symbol);
  if (!br) return;
  if (Math.abs(pos) > 0 && !br.entryLocked) {
    br.entryLocked = true;
    br.state = "partial";
    audit("reconcile-position", `${symbol}: position ${pos}, entry locked`);
    emit({ t: "bracket", symbol, bracket: snapshot() });
  }
}

function indexLegs(br: Bracket): void {
  if (br.parent.orderId) legIndex.set(br.parent.orderId, { br, leg: "parent" });
  if (br.stopLeg.orderId) legIndex.set(br.stopLeg.orderId, { br, leg: "stop" });
  if (br.targetLeg.orderId) legIndex.set(br.targetLeg.orderId, { br, leg: "target" });
}

export function pending(): string[] {
  return [...pendingCancels.keys()];
}

export function workingSymbols(): string[] {
  return [...brackets.entries()].filter(([, b]) => b.state !== "closed").map(([s]) => s);
}

// Close whatever position the account holds for a symbol. Needed
// when a filled bracket was disarmed and the children that would
// have exited the position are gone.
export function flatten(symbol: string): { ok: boolean; error?: string } {
  const pos = positions.get(symbol) ?? 0;
  if (pos === 0) return { ok: false, error: `no position for ${symbol}` };
  const orderId = ibmod.takeOrderIds(1);
  ibmod.place(ibmod.contractFor(symbol), {
    orderId,
    action: pos > 0 ? OrderAction.SELL : OrderAction.BUY,
    orderType: OrderType.MKT,
    totalQuantity: Math.abs(pos),
    tif: "DAY",
    transmit: true,
    outsideRth: true,
  });
  audit("flatten", `${symbol}: ${pos > 0 ? "sell" : "buy"} ${Math.abs(pos)} market order ${orderId}`);
  return { ok: true };
}

export function snapshot(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of brackets) out[k] = v;
  out._pending = [...pendingCancels.keys()];
  return out;
}
