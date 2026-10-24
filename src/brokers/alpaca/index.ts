import { emit } from "../../core/emit";
import { audit } from "../../core/log";
import * as chart from "./chart";
import type { ConnState } from "../../core/wire";
import type { Broker, BrokerResult } from "../../core/broker";

function argVal(name: string, dflt: string): string {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : dflt;
}

export const state: ConnState = {
  webPort: Number(argVal("--port", "8080")),
  provider: "alpaca",
  accountMode: "paper",
  label: "ALPACA PAPER",
  connected: false,
  reconciled: false,
};

function publish(): void {
  emit("exec", { t: "conn", ...state });
}

export function keys(): { key: string; secret: string } | null {
  const key = process.env["APCA-API-KEY_ID"];
  const secret = process.env["APCA-API-SECRET-KEY"];
  return key && secret ? { key, secret } : null;
}

interface Feed {
  name: "stock" | "crypto";
  url: string;
  ws: WebSocket | null;
  authed: boolean;
  backoffMs: number;
  symbol: string;
}

const BACKOFF_START_MS = 1000;
const BACKOFF_MAX_MS = 30000;

const feeds: Feed[] = [
  { name: "stock", url: "wss://stream.data.alpaca.markets/v2/iex", ws: null, authed: false, backoffMs: BACKOFF_START_MS, symbol: "" },
  { name: "crypto", url: "wss://stream.data.alpaca.markets/v1beta3/crypto", ws: null, authed: false, backoffMs: BACKOFF_START_MS, symbol: "" },
];

function feedFor(sym: string): Feed {
  return chart.isCrypto(sym) ? feeds[1] : feeds[0];
}

function subscribeMsg(f: Feed, sym: string): Record<string, unknown> {
  return f.name === "crypto"
    ? { action: "subscribe", trades: [sym], orderbooks: [sym] }
    : { action: "subscribe", trades: [sym], quotes: [sym] };
}

function unsubscribeMsg(f: Feed, sym: string): Record<string, unknown> {
  return f.name === "crypto"
    ? { action: "unsubscribe", trades: [sym], orderbooks: [sym] }
    : { action: "unsubscribe", trades: [sym], quotes: [sym] };
}

function send(f: Feed, msg: Record<string, unknown>): void {
  if (f.ws && f.authed) f.ws.send(JSON.stringify(msg));
}

export function requestSubscribe(sym: string): void {
  const f = feedFor(sym);
  f.symbol = sym;
  if (state.reconciled) {
    state.reconciled = false;
    publish();
  }
  send(f, subscribeMsg(f, sym));
}

export function requestUnsubscribe(sym: string): void {
  const f = feedFor(sym);
  if (f.symbol === sym) f.symbol = "";
  send(f, unsubscribeMsg(f, sym));
}

export function historyLoaded(sym: string): void {
  if (sym !== chart.getSymbol()) return;
  state.reconciled = true;
  publish();
}

function epochSeconds(iso: unknown): number {
  const ms = new Date(String(iso)).getTime();
  return Number.isFinite(ms) ? ms / 1000 : NaN;
}

function onFirstData(): void {
  if (state.connected) return;
  state.connected = true;
  publish();
}

interface AlpacaMsg {
  T?: string;
  S?: string;
  msg?: string;
  code?: number;
  t?: string;
  p?: number;
  s?: number;
  x?: string;
  bp?: number;
  bs?: number;
  ap?: number;
  as?: number;
  b?: chart.BookRow[];
  a?: chart.BookRow[];
}

function onFeedMessage(f: Feed, data: unknown): void {
  if (typeof data !== "string") return;
  let msgs: AlpacaMsg[];
  try {
    const parsed = JSON.parse(data) as unknown;
    msgs = Array.isArray(parsed) ? (parsed as AlpacaMsg[]) : [parsed as AlpacaMsg];
  } catch {
    return;
  }
  for (const m of msgs) {
    if (m.T === "success" && m.msg === "authenticated") {
      f.authed = true;
      f.backoffMs = BACKOFF_START_MS;
      audit("connect", `alpaca ${f.name} feed authenticated`);
      if (f.symbol) send(f, subscribeMsg(f, f.symbol));
      continue;
    }
    if (m.T === "error") {
      audit("error", `alpaca ${f.name} feed error ${m.code}: ${m.msg}`);
      emit("exec", { t: "info", msg: `alpaca ${f.name} ERR ${m.code}: ${m.msg}` });
      continue;
    }
    if (!f.authed || !m.S || m.S !== chart.getSymbol()) continue;
    if (m.T === "t" && typeof m.p === "number" && typeof m.s === "number") {
      onFirstData();
      chart.onTrade(epochSeconds(m.t), m.p, m.s);
    } else if (m.T === "q" && typeof m.bp === "number" && typeof m.ap === "number") {
      onFirstData();
      const mm = m.x || (f.name === "stock" ? "IEX" : "CRYPTO");
      chart.onQuote(mm, m.bp, m.bs ?? 0, m.ap, m.as ?? 0);
    } else if (m.T === "o" && Array.isArray(m.b) && Array.isArray(m.a)) {
      onFirstData();
      chart.onOrderbook(m.x || "CRYPTO", m.b, m.a);
    }
  }
}

function onFeedDown(f: Feed): void {
  if (f.ws === null && !f.authed) return;
  f.ws = null;
  f.authed = false;
  if (state.connected || state.reconciled) {
    state.connected = false;
    state.reconciled = false;
    publish();
  }
  audit("disconnect", `alpaca ${f.name} feed down, retry in ${f.backoffMs}ms`);
  console.log(`alpaca ${f.name} feed down, retrying in ${f.backoffMs}ms`);
  const delay = f.backoffMs;
  f.backoffMs = Math.min(f.backoffMs * 2, BACKOFF_MAX_MS);
  setTimeout(() => openFeed(f), delay);
}

function openFeed(f: Feed): void {
  const k = keys();
  if (!k) return;
  const ws = new WebSocket(f.url);
  f.ws = ws;
  ws.onopen = () => {
    ws.send(JSON.stringify({ action: "auth", key: k.key, secret: k.secret }));
  };
  ws.onmessage = (ev) => onFeedMessage(f, ev.data);
  ws.onerror = () => {
    ws.close();
  };
  ws.onclose = () => {
    if (f.ws === ws) onFeedDown(f);
  };
}

let started = false;

export function connect(): void {
  if (!keys()) {
    state.connected = false;
    state.reconciled = false;
    state.label = "ALPACA PAPER (no keys)";
    console.log("missing Alpaca credentials: set APCA-API-KEY_ID and APCA-API-SECRET-KEY");
    audit("error", "missing Alpaca credentials");
    publish();
    return;
  }
  state.label = "ALPACA PAPER";
  if (started) return;
  started = true;
  for (const f of feeds) openFeed(f);
}

const PHASE5: BrokerResult = { ok: false, error: "alpaca orders land in phase 5" };

export function createBroker(): Broker {
  return {
    state,
    connect,
    subscribe: (symbol: string) => chart.setSymbol(symbol),
    unsubscribe: (symbol: string) => chart.clearSymbol(symbol),
    quote: () => chart.quote(),
    activate: () => PHASE5,
    deactivate: () => PHASE5,
    editLevels: () => PHASE5,
    flatten: () => PHASE5,
    pending: () => false,
    hasWorking: () => false,
    position: () => 0,
    snapshot: () => ({ current: null, _pending: false }),
    getSymbol: () => chart.getSymbol(),
    histSnapshot: (tf) => chart.histSnapshot(tf),
    tapeSnapshot: () => chart.tapeSnapshot(),
    bookSnapshot: () => chart.bookSnapshot(),
  };
}
