import { OrderAction, OrderType } from "@stoqey/ib";
import * as ibmod from "./ib";
import { bookSnapshot } from "./chart";
import { audit } from "./log";
import { emit } from "./emit";
import type { Bracket, BracketSnapshot, Leg } from "./wire";

export type { Bracket, Leg } from "./wire";

let current: Bracket | undefined;
let lastClosed: Bracket | undefined;
const legIndex = new Map<number, { br: Bracket; leg: "parent" | "stop" | "target" }>();

let activationsBlocked = true;
let reconcilePending = { openOrders: false, positions: false };
let reconcileTimer: ReturnType<typeof setTimeout> | null = null;

const pendingCancelIds = new Set<number>();
let pendingTimer: ReturnType<typeof setTimeout> | null = null;

function markPending(orderIds: number[]): void {
  if (!orderIds.length) return;
  for (const id of orderIds) pendingCancelIds.add(id);
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = setTimeout(() => {
    pendingCancelIds.clear();
    pendingTimer = null;
    emit("exec", { t: "bracket", bracket: snapshot() });
  }, 10000);
}

function resolvePending(orderId: number): void {
  if (!pendingCancelIds.delete(orderId)) return;
  if (pendingCancelIds.size === 0) {
    if (pendingTimer) clearTimeout(pendingTimer);
    pendingTimer = null;
    emit("exec", { t: "bracket", bracket: snapshot() });
  }
}

function cancelsInFlight(): boolean {
  return pendingCancelIds.size > 0;
}

export function get(): Bracket | undefined {
  return current;
}

export function blockActivations(): void {
  activationsBlocked = true;
}

export function beginReconcile(): void {
  activationsBlocked = true;
  reconcilePending = { openOrders: true, positions: true };
  reconcileParents.clear();
  reconcileOrphans.clear();
  reconcileAdopted.clear();
  if (reconcileTimer) clearTimeout(reconcileTimer);
  reconcileTimer = setTimeout(finishReconcileIfDone, 5000);
  try {
    ibmod.ib.reqOpenOrders();
    ibmod.ib.reqPositions();
  } catch {
  }
  emit("exec", { t: "conn", ...ibmod.state });
}

export function onReconcileStep(which: "openOrders" | "positions"): void {
  reconcilePending[which] = false;
  finishReconcileIfDone();
}

function finishReconcileIfDone(): void {
  if (activationsBlocked && !reconcilePending.openOrders && !reconcilePending.positions) {
    activationsBlocked = false;
    ibmod.state.reconciled = true;
    if (reconcileTimer) clearTimeout(reconcileTimer);
    reconcileTimer = null;
    audit("reconcile", "open orders and positions replayed, activations open");
    for (const [parentId, orphans] of reconcileOrphans) {
      for (const o of orphans) {
        ibmod.cancel(o.orderId);
        audit("reconcile-orphan-cancel", `${o.symbol}: child of missing parent ${parentId}, order ${o.orderId}`);
      }
    }
    reconcileOrphans.clear();
    for (const [orderId, parent] of reconcileParents) {
      if (reconcileAdopted.has(orderId)) continue;
      ibmod.cancel(orderId);
      audit("reconcile-orphan-cancel", `${parent.symbol}: parent without live children, order ${orderId}`);
    }
    reconcileParents.clear();
    emit("exec", { t: "conn", ...ibmod.state });
    emit("exec", { t: "bracket", bracket: snapshot() });
  }
}

export interface ActivateParams {
  symbol: string;
  qty: number;
  entry: number;
  stop: number;
  target: number;
  orderType: "LMT" | "MKT";
}

export function activate(p: ActivateParams, replacing = false): { ok: boolean; error?: string } {
  if (activationsBlocked || !ibmod.state.reconciled) {
    return { ok: false, error: "activation blocked until reconnect reconcile finishes" };
  }

  if (!replacing && cancelsInFlight()) {
    return { ok: false, error: "cancel in flight, wait for acks" };
  }
  if (current && current.state !== "closed") {
    return { ok: false, error: `bracket already working for ${current.symbol}` };
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

  current = br;
  indexLegs(br);
  ibmod.place(contract, parent);
  ibmod.place(contract, stopOrder);
  ibmod.place(contract, targetOrder);
  audit("activate", `${p.symbol} qty=${p.qty} ${p.orderType} entry=${p.entry} stop=${p.stop} target=${p.target} parent=${parentId} stop=${stopId} target=${targetId}`);
  emit("exec", { t: "bracket", bracket: snapshot() });
  return { ok: true };
}

const TERMINAL = ["Filled", "Cancelled", "Inactive", "ApiCancelled"];

export function deactivate(reason: string): { ok: boolean; error?: string } {
  const br = current;
  if (!br) return { ok: false, error: "no bracket" };
  if (br.entryLocked && (positions.get(br.symbol) ?? 0) !== 0) {
    audit("deactivate-refused", `${br.symbol}: ${reason}`);
    return { ok: false, error: `entry filled and position open for ${br.symbol}, flatten first` };
  }

  const sent: number[] = [];
  for (const leg of [br.parent, br.stopLeg, br.targetLeg]) {
    if (!TERMINAL.includes(leg.status)) {
      ibmod.cancel(leg.orderId);
      sent.push(leg.orderId);
    }
  }
  markPending(sent);
  br.state = "closed";
  lastClosed = br;
  audit("deactivate", `${br.symbol}: ${reason}`);
  emit("exec", { t: "bracket", bracket: snapshot() });
  return { ok: true };
}

export interface Levels {
  entry?: number;
  stop?: number;
  target?: number;
}

export function editLevels(lv: Levels): { ok: boolean; error?: string } {
  const br = current;
  if (!br) return { ok: false, error: "no bracket" };
  if (br.state === "closed") return { ok: false, error: "bracket is closed" };
  const symbol = br.symbol;
  if (!br.entryLocked && cancelsInFlight()) {
    return { ok: false, error: "cancel-replace in flight" };
  }

  const entry = lv.entry ?? br.entry;
  const stop = lv.stop ?? br.stop;
  const target = lv.target ?? br.target;

  if (!br.entryLocked) {

    br.state = "closed";
    const sent: number[] = [];
    for (const leg of [br.parent, br.stopLeg, br.targetLeg]) {
      if (!TERMINAL.includes(leg.status)) {
        ibmod.cancel(leg.orderId);
        sent.push(leg.orderId);
      }
    }
    markPending(sent);
    current = undefined;
    lastClosed = br;

    audit("replace", `${symbol}: cancel parent=${br.parent.orderId} stop=${br.stopLeg.orderId} target=${br.targetLeg.orderId}`);
    return activate({
      symbol,
      qty: br.qty,
      entry,
      stop,
      target,
      orderType: br.orderType === "MKT" && br.parent.status !== "Submitted" ? br.orderType : "LMT",
    }, true);
  }

  
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
  emit("exec", { t: "bracket", bracket: snapshot() });
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
  if (flattenOrder && orderId === flattenOrder.orderId) {
    const sym = flattenOrder.symbol;
    if (status === "Filled") {
      positions.set(sym, 0);
      audit("fill", `flatten order=${orderId} filled=${filled} avg=${avgFillPrice}`);
      flattenOrder = undefined;
    } else if (status === "Cancelled" || status === "Inactive" || status === "ApiCancelled") {
      flattenOrder = undefined;
      if (flattenWanted) {
        const wanted = flattenWanted.symbol;
        flattenWanted = undefined;
        placeFlatten(wanted);
      }
    }
    return;
  }
  const hit = legIndex.get(orderId);
  if (!hit) return;
  const { br, leg } = hit;
  const l = leg === "parent" ? br.parent : leg === "stop" ? br.stopLeg : br.targetLeg;
  l.status = status;
  l.filled = filled;
  l.avgPrice = avgFillPrice || l.avgPrice;

  if (leg === "parent" && filled > 0) {
    positions.set(br.symbol, filled);
    br.entryLocked = true;
    if (br.state === "working") br.state = "partial";
  }
  if ((leg === "stop" || leg === "target") && status === "Filled" && br.state !== "closed") {
    positions.set(br.symbol, 0);
    br.state = "closed";
    if (flattenOrder && flattenOrder.symbol === br.symbol) ibmod.cancel(flattenOrder.orderId);
  }
  if (status === "Filled") {
    audit("fill", `${br.symbol} ${leg} order=${orderId} filled=${filled} avg=${avgFillPrice}`);
  }
  if (status === "Cancelled" || status === "Inactive" || status === "ApiCancelled") {
    resolvePending(orderId);
    audit("cancel-ack", `${br.symbol} ${leg} order=${orderId} ${status}`);
  }
  emit("exec", { t: "bracket", bracket: snapshot() });
}

const reconcileParents = new Map<number, any>();
const reconcileOrphans = new Map<number, { orderId: number; symbol: string; order: any }[]>();
const reconcileAdopted = new Set<number>();

export function onOpenOrder(orderId: number, symbol: string, order: any): void {
  const known = legIndex.get(orderId);
  if (known) {
    return;
  }
  if (!reconcilePending.openOrders) return;
  if (!order.parentId) {
    if (order.orderType === "LMT" || order.orderType === "MKT") {
      reconcileParents.set(orderId, { symbol, order });
      const orphans = reconcileOrphans.get(orderId);
      if (orphans) {
        reconcileOrphans.delete(orderId);
        for (const o of orphans) attachReconciledLeg(o.orderId, o.symbol, o.order);
      }
    }
    return;
  }
  if (!reconcileParents.has(order.parentId)) {
    const list = reconcileOrphans.get(order.parentId) ?? [];
    list.push({ orderId, symbol, order });
    reconcileOrphans.set(order.parentId, list);
    return;
  }
  attachReconciledLeg(orderId, symbol, order);
}

function attachReconciledLeg(orderId: number, symbol: string, order: any): void {
  const parent = reconcileParents.get(order.parentId);
  if (!parent) return;
  reconcileAdopted.add(order.parentId);
  let br = current;
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
      ocaGroup: order.ocaGroup || `br-${parent.symbol}-${order.parentId}`,
    };
    current = br;
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
  audit("reconcile-order", `${br.symbol}: found ${order.orderType} order ${orderId} parent=${order.parentId}`);
  emit("exec", { t: "bracket", bracket: snapshot() });
}

const positions = new Map<string, number>();

export function onPosition(symbol: string, pos: number): void {
  positions.set(symbol, pos);
  const br = current;
  if (!br || br.symbol !== symbol) return;
  if (Math.abs(pos) > 0 && !br.entryLocked) {
    br.entryLocked = true;
    br.state = "partial";
    audit("reconcile-position", `${symbol}: position ${pos}, entry locked`);
    emit("exec", { t: "bracket", bracket: snapshot() });
  }
}

function indexLegs(br: Bracket): void {
  if (br.parent.orderId) legIndex.set(br.parent.orderId, { br, leg: "parent" });
  if (br.stopLeg.orderId) legIndex.set(br.stopLeg.orderId, { br, leg: "stop" });
  if (br.targetLeg.orderId) legIndex.set(br.targetLeg.orderId, { br, leg: "target" });
}

export function pending(): boolean {
  return cancelsInFlight();
}

export function hasWorking(): boolean {
  return !!current && current.state !== "closed";
}

let flattenOrder: { orderId: number; symbol: string } | undefined;
let flattenWanted: { symbol: string } | undefined;

function placeFlatten(symbol: string): void {
  const pos = positions.get(symbol) ?? 0;
  if (!pos) return;
  const book = bookSnapshot();
  const px = pos > 0 ? book.bids[0]?.price : book.asks[0]?.price;
  if (!px) {
    audit("flatten-refused", `${symbol}: no ${pos > 0 ? "bid" : "ask"} on the book`);
    return;
  }
  const orderId = ibmod.takeOrderIds(1);
  ibmod.place(ibmod.contractFor(symbol), {
    orderId,
    action: pos > 0 ? OrderAction.SELL : OrderAction.BUY,
    orderType: OrderType.LMT,
    totalQuantity: Math.abs(pos),
    lmtPrice: px,
    tif: "DAY",
    transmit: true,
    outsideRth: true,
  });
  flattenOrder = { orderId, symbol };
  audit("flatten", `${symbol}: ${pos > 0 ? "sell" : "buy"} ${Math.abs(pos)} at ${pos > 0 ? "bid" : "ask"} ${px} order ${orderId}`);
}

export function flatten(symbol: string): { ok: boolean; error?: string } {
  const pos = positions.get(symbol) ?? 0;
  if (pos === 0) return { ok: false, error: `no position for ${symbol}` };
  const book = bookSnapshot();
  const px = pos > 0 ? book.bids[0]?.price : book.asks[0]?.price;
  if (!px) return { ok: false, error: `no ${pos > 0 ? "bid" : "ask"} on the book for ${symbol}, refusing blind flatten` };
  if (flattenOrder) {
    flattenWanted = { symbol };
    ibmod.cancel(flattenOrder.orderId);
    audit("flatten-reprice", `${symbol}: cancel ${flattenOrder.orderId} for reprice`);
    return { ok: true };
  }
  placeFlatten(symbol);
  return { ok: true };
}

export function position(symbol: string): number {
  return positions.get(symbol) ?? 0;
}

export function snapshot(): BracketSnapshot {
  return {
    current: current ?? lastClosed ?? null,
    _pending: cancelsInFlight(),
  };
}
