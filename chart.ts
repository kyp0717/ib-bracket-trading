
import { BarSizeSetting, TickByTickDataType, WhatToShow } from "@stoqey/ib";
import * as ibmod from "./ib";
import { emit } from "./emit";

export interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Trade {
  time: number;
  price: number;
  size: number;
}

let lastQuote: Trade | null = null;

export function quote(): Trade | null {
  return lastQuote;
}

let symbol = "";
let reqIds: Record<string, number> = {};

const buckets: Record<"10s" | "1m", Map<number, Bar>> = {
  "10s": new Map(),
  "1m": new Map(),
};
const daily: Bar[] = [];
const tape: Trade[] = [];
const book: { bids: Map<number, { price: number; size: number }>; asks: Map<number, { price: number; size: number }> } = {
  bids: new Map(),
  asks: new Map(),
};
const TAPE_MAX = 300;

export function getSymbol(): string {
  return symbol;
}

export function setSymbol(sym: string): void {
  if (sym === symbol) return;
  cancelAll();
  symbol = sym.toUpperCase();
  buckets["10s"].clear();
  buckets["1m"].clear();
  daily.length = 0;
  tape.length = 0;
  book.bids.clear();
  book.asks.clear();

  const contract = ibmod.contractFor(symbol);
  reqIds = {
    rt: ibmod.takeOrderIds(1),
    hist10s: ibmod.takeOrderIds(1),
    hist1m: ibmod.takeOrderIds(1),
    hist1d: ibmod.takeOrderIds(1),
    tape: ibmod.takeOrderIds(1),
    depth: ibmod.takeOrderIds(1),
  };

  try {
    ibmod.ib.reqRealTimeBars(reqIds.rt, contract, 5, WhatToShow.TRADES, false);
    ibmod.ib.reqHistoricalData(reqIds.hist10s, contract, "", "14400 S", BarSizeSetting.SECONDS_TEN, WhatToShow.TRADES, 0, 2, false);
    ibmod.ib.reqHistoricalData(reqIds.hist1m, contract, "", "2 D", BarSizeSetting.MINUTES_ONE, WhatToShow.TRADES, 0, 2, true);
    ibmod.ib.reqHistoricalData(reqIds.hist1d, contract, "", "6 M", BarSizeSetting.DAYS_ONE, WhatToShow.TRADES, 1, 2, false);
    ibmod.ib.reqTickByTickData(reqIds.tape, contract, TickByTickDataType.AllLast, 0, false);

    ibmod.ib.reqMktDepth(reqIds.depth, contract, 10, true);
  } catch (e) {
    console.error("subscribe failed", e);
  }
  emit("market", { t: "info", msg: `subscribed ${symbol}` });
}

function cancelAll(): void {
  if (!symbol) return;
  try {
    ibmod.ib.cancelRealTimeBars(reqIds.rt);
    ibmod.ib.cancelHistoricalData(reqIds.hist10s);
    ibmod.ib.cancelHistoricalData(reqIds.hist1m);
    ibmod.ib.cancelHistoricalData(reqIds.hist1d);
    ibmod.ib.cancelTickByTickData(reqIds.tape);
    ibmod.ib.cancelMktDepth(reqIds.depth, true);
  } catch (e) {
    console.error("cancel failed", e);
  }
}

function bucket(tf: "10s" | "1m", time: number, bar: Bar): Bar {
  const size = tf === "10s" ? 10 : 60;
  const bt = Math.floor(time / size) * size;
  const m = buckets[tf];
  const cur = m.get(bt);
  if (cur) {
    cur.high = Math.max(cur.high, bar.high);
    cur.low = Math.min(cur.low, bar.low);
    cur.close = bar.close;
    cur.volume += bar.volume;
    return cur;
  }
  const nb = { ...bar, time: bt };
  m.set(bt, nb);
  return nb;
}

export function onRealtimeBar(reqId: number, time: number, open: number, high: number, low: number, close: number, volume: number): void {
  if (reqId !== reqIds.rt) return;
  const bar: Bar = { time, open, high, low, close, volume };
  for (const tf of ["10s", "1m"] as const) {
    emit("market", { t: "bar", tf, bar: bucket(tf, time, bar) });
  }
}

export function onHistoricalData(reqId: number, time: number, open: number, high: number, low: number, close: number, volume: number): void {
  if (!Number.isFinite(time)) return;
  if (reqId === reqIds.hist10s) bucket("10s", time, { time, open, high, low, close, volume });
  else if (reqId === reqIds.hist1m) bucket("1m", time, { time, open, high, low, close, volume });
  else if (reqId === reqIds.hist1d) daily.push({ time, open, high, low, close, volume });
}

export function onHistoricalDataEnd(reqId: number): void {
  if (reqId === reqIds.hist10s) {
    emit("market", { t: "hist", tf: "10s", bars: sortedBars(buckets["10s"]) });
  } else if (reqId === reqIds.hist1m) {
    emit("market", { t: "hist", tf: "1m", bars: sortedBars(buckets["1m"]) });
  } else if (reqId === reqIds.hist1d) {
    daily.sort((a, b) => a.time - b.time);
    emit("market", { t: "hist", tf: "1d", bars: daily });
  }
}

export function onHistoricalDataUpdate(reqId: number, bar: any): void {
  if (reqId !== reqIds.hist1m) return;
  const nb = bucket("1m", Number(bar.time), {
    time: Number(bar.time), open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume || 0,
  });
  emit("market", { t: "bar", tf: "1m", bar: nb });
}

export function onTick(reqId: number, time: number, price: number, size: number): void {
  if (reqId !== reqIds.tape) return;
  const trade: Trade = { time, price, size };
  lastQuote = trade;
  tape.push(trade);
  if (tape.length > TAPE_MAX) tape.shift();
  emit("market", { t: "tape", trade });
}

export function onDepth(reqId: number, pos: number, op: number, side: number, price: number, size: number): void {
  if (reqId !== reqIds.depth) return;
  const m = side === 1 ? book.bids : book.asks;
  if (op === 2) m.delete(pos);
  else m.set(pos, { price, size });
  emit("market", { t: "depth", book: bookSnapshot() });
}

export function bookSnapshot(): { bids: { price: number; size: number }[]; asks: { price: number; size: number }[] } {
  const arr = (m: Map<number, { price: number; size: number }>) =>
    [...m.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
  return { bids: arr(book.bids), asks: arr(book.asks) };
}

export function histSnapshot(tf: "10s" | "1m" | "1d"): Bar[] {
  if (tf === "1d") return daily.slice();
  return sortedBars(buckets[tf]);
}

export function tapeSnapshot(): Trade[] {
  return tape.slice(-100).reverse();
}

function sortedBars(m: Map<number, Bar>): Bar[] {
  return [...m.values()].sort((a, b) => a.time - b.time);
}
