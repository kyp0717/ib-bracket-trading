import { audit } from "./log";
import { emit } from "./emit";
import type { Bracket, BracketSnapshot } from "./wire";
import type { BracketIntents, ReconciledLegEvent } from "./events";

let intents: BracketIntents;

export function bindIntents(i: BracketIntents): void {
  intents = i;
}

let current: Bracket | undefined;
let lastClosed: Bracket | undefined;
const legIndex = new Map<number, { br: Bracket; leg: "parent" | "stop" | "target" }>();

let activationsBlocked = true;

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

export function unblockActivations(): boolean {
  if (!activationsBlocked) return false;
  activationsBlocked = false;
  return true;
}

export function hasOrder(orderId: number): boolean {
  return legIndex.has(orderId);
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
  if (activationsBlocked || !intents.reconciled()) {
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
  const base = intents.takeOrderIds(3);
  const parentId = base;
  const stopId = base + 1;
  const targetId = base + 2;

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
  };

  current = br;
  indexLegs(br);
  intents.placeBracket({
    symbol: p.symbol,
    qty: p.qty,
    entry: p.entry,
    stop: p.stop,
    target: p.target,
    orderType: p.orderType,
    parentId,
    stopId,
    targetId,
  });
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
      intents.cancel(leg.orderId);
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
        intents.cancel(leg.orderId);
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
  intents.modifyLegs({
    symbol,
    parentId: br.parent.orderId,
    stopId: br.stopLeg.orderId,
    targetId: br.targetLeg.orderId,
    stopQty: br.qty - br.parent.filled > 0 ? br.qty - br.parent.filled : br.qty,
    targetQty: br.qty,
    stop,
    target,
  });
  audit("modify", `${symbol}: stop=${stop} target=${target} on ids ${br.stopLeg.orderId}/${br.targetLeg.orderId}`);
  emit("exec", { t: "bracket", bracket: snapshot() });
  return { ok: true };
}

export function onLegStatus(
  orderId: number,
  status: string,
  filled: number,
  avgFillPrice: number
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
        placeFlatten(flattenWanted.symbol, flattenWanted.offset);
        flattenWanted = undefined;
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
    if (flattenOrder && flattenOrder.symbol === br.symbol) intents.cancel(flattenOrder.orderId);
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

export function onReconciledLeg(evt: ReconciledLegEvent): void {
  let br = current;
  if (!br || br.state === "closed") {
    br = {
      symbol: evt.symbol,
      qty: evt.qty,
      entry: evt.entry,
      stop: 0,
      target: 0,
      orderType: evt.orderType,
      state: "working",
      entryLocked: false,
      parent: { orderId: evt.parentOrderId, status: "Submitted", filled: 0, avgPrice: 0 },
      stopLeg: { orderId: 0, status: "none", filled: 0, avgPrice: 0 },
      targetLeg: { orderId: 0, status: "none", filled: 0, avgPrice: 0 },
    };
    current = br;
    indexLegs(br);
  }
  if (evt.leg === "stop") {
    br.stopLeg = { orderId: evt.orderId, status: "Submitted", filled: 0, avgPrice: 0 };
    br.stop = evt.price;
  } else {
    br.targetLeg = { orderId: evt.orderId, status: "Submitted", filled: 0, avgPrice: 0 };
    br.target = evt.price;
  }
  indexLegs(br);
  audit("reconcile-order", `${br.symbol}: found ${evt.rawType} order ${evt.orderId} parent=${evt.parentId}`);
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
let flattenWanted: { symbol: string; offset: number } | undefined;

function placeFlatten(symbol: string, offset: number): void {
  const pos = positions.get(symbol) ?? 0;
  if (!pos) return;
  const book = intents.book();
  const raw = pos > 0 ? book.bids[0]?.price - offset : book.asks[0]?.price + offset;
  if (!raw || raw <= 0) {
    audit("flatten-refused", `${symbol}: no ${pos > 0 ? "bid" : "ask"} on the book`);
    return;
  }
  const px = Math.round(raw * 100) / 100;
  const orderId = intents.placeFlatten({
    symbol,
    action: pos > 0 ? "SELL" : "BUY",
    qty: Math.abs(pos),
    price: px,
  });
  flattenOrder = { orderId, symbol };
  audit("flatten", `${symbol}: ${pos > 0 ? "sell" : "buy"} ${Math.abs(pos)} at ${pos > 0 ? "bid" : "ask"} ${px} order ${orderId}`);
}

export function flatten(symbol: string, offset = 0): { ok: boolean; error?: string } {
  const pos = positions.get(symbol) ?? 0;
  if (pos === 0) return { ok: false, error: `no position for ${symbol}` };
  const book = intents.book();
  const px = pos > 0 ? book.bids[0]?.price : book.asks[0]?.price;
  if (!px) return { ok: false, error: `no ${pos > 0 ? "bid" : "ask"} on the book for ${symbol}, refusing blind flatten` };
  if (flattenOrder) {
    flattenWanted = { symbol, offset };
    intents.cancel(flattenOrder.orderId);
    audit("flatten-reprice", `${symbol}: cancel ${flattenOrder.orderId} for reprice`);
    return { ok: true };
  }
  placeFlatten(symbol, offset);
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
