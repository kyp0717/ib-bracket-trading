import { emit } from "../../core/emit";
import { audit } from "../../core/log";
import type { Bar, DepthBook, Trade } from "../../core/wire";
import * as feed from "./index";

export type { Bar, Trade } from "../../core/wire";

export interface BookRow {
  p: number;
  s: number;
}

const TAPE_MAX = 300;
const HISTORY_RETRIES = 3;
const HISTORY_RETRY_MS = 5000;

let symbol = "";
let lastQuote: Trade | null = null;

const buckets: Record<"10s" | "1m", Map<number, Bar>> = {
  "10s": new Map(),
  "1m": new Map(),
};
const daily: Bar[] = [];
const tape: Trade[] = [];
let book: DepthBook = { bids: [], asks: [] };

export function isCrypto(sym: string): boolean {
  return sym.includes("/");
}

export function getSymbol(): string {
  return symbol;
}

export function quote(): Trade | null {
  return lastQuote;
}

export function setSymbol(sym: string): void {
  if (sym === symbol) return;
  const prev = symbol;
  symbol = sym;
  buckets["10s"].clear();
  buckets["1m"].clear();
  daily.length = 0;
  tape.length = 0;
  book = { bids: [], asks: [] };
  lastQuote = null;
  if (prev) feed.requestUnsubscribe(prev);
  feed.requestSubscribe(symbol);
  audit("subscribe", `alpaca ${symbol} ${isCrypto(symbol) ? "crypto" : "stock"}`);
  emit("market", { t: "info", msg: `subscribed ${symbol}` });
  emit("market", { t: "hist", tf: "10s", bars: [] });
  loadHistory(symbol, HISTORY_RETRIES);
}

export function clearSymbol(sym: string): void {
  if (sym !== symbol) return;
  feed.requestUnsubscribe(symbol);
  symbol = "";
  buckets["10s"].clear();
  buckets["1m"].clear();
  daily.length = 0;
  tape.length = 0;
  book = { bids: [], asks: [] };
  lastQuote = null;
}

interface AlpacaBar {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

interface AlpacaBarsBody {
  bars?: AlpacaBar[] | Record<string, AlpacaBar[]>;
}

function barsUrl(sym: string, tf: "1Min" | "1Day", limit: number): string {
  if (isCrypto(sym)) {
    return `https://data.alpaca.markets/v1beta3/crypto/us/bars?symbols=${encodeURIComponent(sym)}&timeframe=${tf}&limit=${limit}`;
  }
  return `https://data.alpaca.markets/v2/stocks/${encodeURIComponent(sym)}/bars?timeframe=${tf}&limit=${limit}&feed=iex`;
}

async function fetchBars(sym: string, tf: "1Min" | "1Day", limit: number): Promise<Bar[]> {
  const k = feed.keys();
  if (!k) throw new Error("missing Alpaca credentials");
  const res = await fetch(barsUrl(sym, tf, limit), {
    headers: { "APCA-API-KEY-ID": k.key, "APCA-API-SECRET-KEY": k.secret },
  });
  if (!res.ok) throw new Error(`bars ${tf} ${sym}: HTTP ${res.status}`);
  const body = (await res.json()) as AlpacaBarsBody;
  const raw = Array.isArray(body.bars)
    ? body.bars
    : (body.bars?.[sym] ?? []);
  return raw.map((r) => ({
    time: Math.floor(new Date(r.t).getTime() / 1000),
    open: r.o,
    high: r.h,
    low: r.l,
    close: r.c,
    volume: r.v,
  }));
}

async function loadHistory(sym: string, attemptsLeft: number): Promise<void> {
  if (!feed.keys()) return;
  try {
    const [mins, days] = await Promise.all([
      fetchBars(sym, "1Min", 1000),
      fetchBars(sym, "1Day", 180),
    ]);
    if (sym !== symbol) return;
    buckets["1m"].clear();
    for (const b of mins) buckets["1m"].set(b.time, b);
    daily.length = 0;
    daily.push(...days);
    daily.sort((a, b) => a.time - b.time);
    emit("market", { t: "hist", tf: "1m", bars: sortedBars(buckets["1m"]) });
    emit("market", { t: "hist", tf: "1d", bars: daily.slice() });
    feed.historyLoaded(sym);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    audit("error", `alpaca history ${sym}: ${msg}`);
    if (attemptsLeft > 0) {
      setTimeout(() => {
        if (sym === symbol) loadHistory(sym, attemptsLeft - 1);
      }, HISTORY_RETRY_MS);
    }
  }
}

function bucketStart(tf: "10s" | "1m", time: number): number {
  const size = tf === "10s" ? 10 : 60;
  return Math.floor(time / size) * size;
}

export function onTrade(time: number, price: number, size: number): void {
  if (!Number.isFinite(time) || !(price > 0)) return;
  const trade: Trade = { time, price, size };
  lastQuote = trade;
  tape.push(trade);
  if (tape.length > TAPE_MAX) tape.shift();
  emit("market", { t: "tape", trade });
  for (const tf of ["10s", "1m"] as const) {
    const bt = bucketStart(tf, time);
    const cur = buckets[tf].get(bt);
    const nb: Bar = cur
      ? { ...cur, high: Math.max(cur.high, price), low: Math.min(cur.low, price), close: price, volume: cur.volume + size }
      : { time: bt, open: price, high: price, low: price, close: price, volume: size };
    buckets[tf].set(bt, nb);
    emit("market", { t: "bar", tf, bar: nb });
  }
}

export function onQuote(mm: string, bidPrice: number, bidSize: number, askPrice: number, askSize: number): void {
  book = {
    bids: bidPrice > 0 && bidSize > 0 ? [{ price: bidPrice, size: bidSize, mm }] : [],
    asks: askPrice > 0 && askSize > 0 ? [{ price: askPrice, size: askSize, mm }] : [],
  };
  emit("market", { t: "depth", book });
}

export function onOrderbook(mm: string, bids: BookRow[], asks: BookRow[]): void {
  const rows = (rs: BookRow[]) =>
    rs.filter((r) => r.p > 0 && r.s > 0).map((r) => ({ price: r.p, size: r.s, mm }));
  book = { bids: rows(bids), asks: rows(asks) };
  emit("market", { t: "depth", book });
}

export function histSnapshot(tf: "10s" | "1m" | "1d"): Bar[] {
  if (tf === "1d") return daily.slice();
  return sortedBars(buckets[tf]);
}

export function tapeSnapshot(): Trade[] {
  return tape.slice(-100).reverse();
}

export function bookSnapshot(): DepthBook {
  return book;
}

function sortedBars(m: Map<number, Bar>): Bar[] {
  return [...m.values()].sort((a, b) => a.time - b.time);
}
