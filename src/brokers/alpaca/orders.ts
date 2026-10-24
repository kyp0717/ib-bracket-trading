import { emit } from "../../core/emit";
import { audit } from "../../core/log";
import * as core from "../../core/bracket";
import * as feed from "./index";
import * as chart from "./chart";
import type { ModifyLegsIntent, PlaceBracketIntent, PlaceFlattenIntent } from "../../core/events";

const REST_BASE = "https://paper-api.alpaca.markets/v2";
const STREAM_URL = "wss://paper-api.alpaca.markets/stream";
const BACKOFF_START_MS = 1000;
const BACKOFF_MAX_MS = 30000;

interface AlpacaLeg {
  id: string;
  client_order_id?: string;
  type?: string;
  qty?: string;
  limit_price?: string | null;
  stop_price?: string | null;
}

interface AlpacaOrder {
  id: string;
  client_order_id?: string;
  symbol: string;
  side?: string;
  type?: string;
  order_class?: string;
  qty?: string;
  filled_qty?: string;
  filled_avg_price?: string | null;
  limit_price?: string | null;
  stop_price?: string | null;
  status?: string;
  legs?: AlpacaLeg[] | null;
}

interface AlpacaPosition {
  symbol: string;
  qty: string;
}

interface TradeUpdate {
  event?: string;
  position_qty?: string;
  order?: AlpacaOrder;
}

interface StreamMsg {
  T?: string;
  msg?: string;
  stream?: string;
  data?: TradeUpdate & { status?: string };
}

async function api(method: string, path: string, body?: unknown): Promise<unknown> {
  const k = feed.keys();
  if (!k) throw new Error("missing Alpaca credentials");
  const res = await fetch(REST_BASE + path, {
    method,
    headers: {
      "APCA-API-KEY-ID": k.key,
      "APCA-API-SECRET-KEY": k.secret,
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path}: HTTP ${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

const px = (n: number): string => (Math.round(n * 100) / 100).toFixed(2);

let nextId = 1;
const numToUuid = new Map<number, string>();
const uuidToNum = new Map<string, number>();

function takeOrderIds(n: number): number {
  const base = nextId;
  nextId += n;
  return base;
}

function register(num: number, orderId: string, clientOrderId?: string): void {
  numToUuid.set(num, orderId);
  uuidToNum.set(orderId, num);
  if (clientOrderId) uuidToNum.set(clientOrderId, num);
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function placeBracket(p: PlaceBracketIntent): void {
  const body = {
    symbol: p.symbol,
    qty: String(p.qty),
    side: "buy",
    type: p.orderType === "LMT" ? "limit" : "market",
    time_in_force: "day",
    order_class: "bracket",
    ...(p.orderType === "LMT" ? { limit_price: px(p.entry) } : {}),
    take_profit: { limit_price: px(p.target) },
    stop_loss: { stop_price: px(p.stop), limit_price: px(p.stop) },
    client_order_id: crypto.randomUUID(),
  };
  void submitBracket(p, body);
}

function splitLegs(legs: AlpacaLeg[]): { stop?: AlpacaLeg; target?: AlpacaLeg } {
  const stop = legs.find((l) => l.type === "stop" || l.type === "stop_limit" || Number(l.stop_price ?? 0) > 0);
  const target = legs.find((l) => l !== stop);
  return { stop, target };
}

async function submitBracket(p: PlaceBracketIntent, body: unknown): Promise<void> {
  try {
    let order = (await api("POST", "/orders", body)) as AlpacaOrder;
    if ((order.legs?.length ?? 0) < 2) {
      order = (await api("GET", `/orders/${order.id}`)) as AlpacaOrder;
    }
    register(p.parentId, order.id, order.client_order_id);
    const { stop, target } = splitLegs(order.legs ?? []);
    if (stop) register(p.stopId, stop.id, stop.client_order_id);
    if (target) register(p.targetId, target.id, target.client_order_id);
    if (!stop || !target) {
      audit("error", `alpaca bracket ${p.symbol}: legs missing on ${order.id}`);
    }
    audit("place", `alpaca bracket ${p.symbol} qty=${p.qty} parent=${order.id} stop=${stop?.id ?? "?"} target=${target?.id ?? "?"}`);
  } catch (e) {
    audit("error", `alpaca place bracket ${p.symbol}: ${errMsg(e)}`);
    core.onLegStatus(p.parentId, "Inactive", 0, 0);
    core.onLegStatus(p.stopId, "Inactive", 0, 0);
    core.onLegStatus(p.targetId, "Inactive", 0, 0);
  }
}

function cancel(orderId: number): void {
  const uuid = numToUuid.get(orderId);
  if (!uuid) {
    audit("error", `alpaca cancel: unknown order ${orderId}`);
    return;
  }
  void api("DELETE", `/orders/${uuid}`).catch((e) => {
    audit("error", `alpaca cancel ${uuid}: ${errMsg(e)}`);
  });
}

function modifyLegs(m: ModifyLegsIntent): void {
  const stopUuid = numToUuid.get(m.stopId);
  const targetUuid = numToUuid.get(m.targetId);
  if (stopUuid) {
    void api("PATCH", `/orders/${stopUuid}`, {
      qty: String(m.stopQty),
      stop_price: px(m.stop),
      limit_price: px(m.stop),
    }).catch((e) => audit("error", `alpaca modify stop ${stopUuid}: ${errMsg(e)}`));
  } else {
    audit("error", `alpaca modify: unknown stop leg ${m.stopId}`);
  }
  if (targetUuid) {
    void api("PATCH", `/orders/${targetUuid}`, {
      qty: String(m.targetQty),
      limit_price: px(m.target),
    }).catch((e) => audit("error", `alpaca modify target ${targetUuid}: ${errMsg(e)}`));
  } else {
    audit("error", `alpaca modify: unknown target leg ${m.targetId}`);
  }
  audit("modify", `alpaca ${m.symbol}: stop=${m.stop} target=${m.target}`);
}

function placeFlatten(f: PlaceFlattenIntent): number {
  const orderId = takeOrderIds(1);
  const book = chart.bookSnapshot();
  const best = f.action === "SELL" ? book.bids[0]?.price : book.asks[0]?.price;
  const offsetZero = best !== undefined && Math.abs(f.price - Math.round(best * 100) / 100) < 0.005;
  if (offsetZero) void closePosition(orderId, f.symbol);
  else void submitFlattenLimit(orderId, f);
  return orderId;
}

async function closePosition(orderId: number, symbol: string): Promise<void> {
  try {
    const order = (await api("DELETE", `/positions/${encodeURIComponent(symbol)}`)) as AlpacaOrder;
    register(orderId, order.id, order.client_order_id);
    audit("flatten", `alpaca close position ${symbol} order=${order.id}`);
  } catch (e) {
    audit("error", `alpaca flatten ${symbol}: ${errMsg(e)}`);
    core.onLegStatus(orderId, "Inactive", 0, 0);
  }
}

async function submitFlattenLimit(orderId: number, f: PlaceFlattenIntent): Promise<void> {
  try {
    const order = (await api("POST", "/orders", {
      symbol: f.symbol,
      qty: String(f.qty),
      side: f.action.toLowerCase(),
      type: "limit",
      time_in_force: "day",
      limit_price: px(f.price),
      client_order_id: crypto.randomUUID(),
    })) as AlpacaOrder;
    register(orderId, order.id, order.client_order_id);
    audit("flatten", `alpaca ${f.action.toLowerCase()} ${f.qty} ${f.symbol} at ${px(f.price)} order=${order.id}`);
  } catch (e) {
    audit("error", `alpaca flatten ${f.symbol}: ${errMsg(e)}`);
    core.onLegStatus(orderId, "Inactive", 0, 0);
  }
}

function onTradeUpdate(u: TradeUpdate): void {
  const o = u.order;
  if (!o || !u.event) return;
  const num = (o.client_order_id ? uuidToNum.get(o.client_order_id) : undefined) ?? uuidToNum.get(o.id);
  const filled = Number(o.filled_qty ?? 0);
  const avg = Number(o.filled_avg_price ?? 0);
  if (u.position_qty !== undefined) {
    const pq = Number(u.position_qty);
    if (Number.isFinite(pq)) core.onPosition(o.symbol, pq);
  }
  if (num === undefined) {
    if (["fill", "canceled", "expired", "rejected"].includes(u.event)) {
      audit("order-update", `alpaca ${o.symbol} ${u.event} untracked order=${o.id}`);
    }
    return;
  }
  switch (u.event) {
    case "fill":
      core.onLegStatus(num, "Filled", filled, avg);
      break;
    case "partial_fill":
      core.onLegStatus(num, "PartiallyFilled", filled, avg);
      break;
    case "canceled":
    case "expired":
      core.onLegStatus(num, "Cancelled", filled, avg);
      break;
    case "rejected":
      core.onLegStatus(num, "Inactive", filled, avg);
      break;
  }
}

let ws: WebSocket | null = null;
let authed = false;
let backoffMs = BACKOFF_START_MS;
let ordersReconciled = false;
let reconciling = false;

function onStreamMessage(data: unknown): void {
  if (typeof data !== "string") return;
  let msgs: StreamMsg[];
  try {
    const parsed = JSON.parse(data) as unknown;
    msgs = Array.isArray(parsed) ? (parsed as StreamMsg[]) : [parsed as StreamMsg];
  } catch {
    return;
  }
  for (const m of msgs) {
    const authOk = m.msg === "authenticated" || (m.stream === "authorization" && m.data?.status === "authorized");
    if (authOk) {
      authed = true;
      backoffMs = BACKOFF_START_MS;
      audit("connect", "alpaca trade stream authenticated");
      ws?.send(JSON.stringify({ action: "listen", data: { streams: ["trade_updates"] } }));
      void reconcile();
      continue;
    }
    if ((m.stream === "trade_updates" || m.T === "trade_updates") && m.data) {
      onTradeUpdate(m.data);
    }
  }
}

function openStream(): void {
  const k = feed.keys();
  if (!k) return;
  const sock = new WebSocket(STREAM_URL);
  ws = sock;
  sock.onopen = () => {
    sock.send(JSON.stringify({ action: "authenticate", data: { key_id: k.key, secret_key: k.secret } }));
  };
  sock.onmessage = (ev) => onStreamMessage(ev.data);
  sock.onerror = () => {
    sock.close();
  };
  sock.onclose = () => {
    if (ws !== sock) return;
    ws = null;
    authed = false;
    ordersReconciled = false;
    audit("disconnect", `alpaca trade stream down, retry in ${backoffMs}ms`);
    const delay = backoffMs;
    backoffMs = Math.min(backoffMs * 2, BACKOFF_MAX_MS);
    setTimeout(openStream, delay);
  };
}

export function connect(): void {
  if (!feed.keys() || ws) return;
  openStream();
}

function adoptBracket(o: AlpacaOrder): void {
  const { stop, target } = splitLegs(o.legs ?? []);
  if (!stop || !target) {
    audit("error", `alpaca reconcile ${o.symbol}: bracket ${o.id} legs missing`);
    return;
  }
  const parentNum = takeOrderIds(1);
  register(parentNum, o.id, o.client_order_id);
  const entry = Number(o.limit_price ?? 0);
  const qty = Number(o.qty ?? 0);
  const orderType = o.type === "market" ? "MKT" : "LMT";
  const legs: [("stop" | "target"), AlpacaLeg][] = [["stop", stop], ["target", target]];
  for (const [leg, l] of legs) {
    const num = takeOrderIds(1);
    register(num, l.id, l.client_order_id);
    core.onReconciledLeg({
      parentId: parentNum,
      parentOrderId: parentNum,
      symbol: o.symbol,
      entry,
      orderType,
      leg,
      orderId: num,
      qty: Number(l.qty ?? 0) || qty,
      price: leg === "stop" ? Number(l.stop_price ?? 0) : Number(l.limit_price ?? 0),
      rawType: `alpaca:${l.type ?? "leg"}`,
    });
  }
}

export async function reconcile(): Promise<void> {
  if (reconciling || !feed.keys()) return;
  reconciling = true;
  core.blockActivations();
  try {
    const [ordersRaw, positionsRaw] = await Promise.all([
      api("GET", "/orders?status=open&limit=500"),
      api("GET", "/positions"),
    ]);
    const orders = (Array.isArray(ordersRaw) ? ordersRaw : []) as AlpacaOrder[];
    const positions = (Array.isArray(positionsRaw) ? positionsRaw : []) as AlpacaPosition[];
    for (const p of positions) {
      const qty = Number(p.qty);
      if (Number.isFinite(qty) && qty !== 0) core.onPosition(p.symbol, qty);
    }
    const strays: AlpacaOrder[] = [];
    for (const o of orders) {
      if (uuidToNum.has(o.id)) continue;
      const adoptable =
        o.order_class === "bracket" &&
        o.side === "buy" &&
        !o.symbol.includes("/") &&
        (o.legs?.length ?? 0) >= 2 &&
        !core.hasWorking();
      if (adoptable) adoptBracket(o);
      else strays.push(o);
    }
    for (const s of strays) {
      try {
        await api("DELETE", `/orders/${s.id}`);
        audit("reconcile-orphan-cancel", `${s.symbol}: unadopted order ${s.id}`);
      } catch (e) {
        audit("error", `alpaca reconcile cancel ${s.id}: ${errMsg(e)}`);
      }
    }
    ordersReconciled = true;
    core.unblockActivations();
    audit("reconcile", `alpaca open orders=${orders.length} positions=${positions.length}, activations open`);
    emit("exec", { t: "bracket", bracket: core.snapshot() });
  } catch (e) {
    audit("error", `alpaca reconcile: ${errMsg(e)}`);
  } finally {
    reconciling = false;
  }
}

core.bindIntents({
  reconciled: () => ordersReconciled,
  takeOrderIds,
  placeBracket,
  modifyLegs,
  placeFlatten,
  cancel,
  book: () => chart.bookSnapshot(),
});
