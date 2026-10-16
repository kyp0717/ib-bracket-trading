
import { BarSizeSetting, Stock, TickByTickDataType, WhatToShow } from "@stoqey/ib";
import * as ibmod from "./ib";
import { emit } from "./emit";
import { audit } from "./log";
import type { Bar, DepthBook, DepthLevel, Trade } from "./wire";

export type { Bar, Trade } from "./wire";

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
interface VenueBook {
  venue: string;
  smart: boolean;
  bids: Map<number, DepthLevel>;
  asks: Map<number, DepthLevel>;
}

const books = new Map<number, VenueBook>();
let cdReqId = 0;

const DEPTH_ROWS = 10;
const DEPTH_VENUE_LIMIT = 3;
const VENUE_PRIORITY = ["NASDAQ", "ARCA", "BATS", "IEX", "NYSE", "ISLAND", "CHX", "NYSENAT"];

function pickVenues(primary: string, validCsv: string): string[] {
  const valid = new Set(validCsv.split(",").map((s) => s.trim()).filter(Boolean));
  const out: string[] = [];
  const add = (v: string) => {
    const ex = v.trim();
    if (ex && ex !== "SMART" && valid.has(ex) && !out.includes(ex) && out.length < DEPTH_VENUE_LIMIT) out.push(ex);
  };
  add(primary);
  for (const v of VENUE_PRIORITY) add(v);
  return out;
}

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
  books.clear();
  lastTickTime = 0;

  const contract = ibmod.contractFor(symbol);
  reqIds = {
    hist10s: ibmod.takeOrderIds(1),
    hist1m: ibmod.takeOrderIds(1),
    hist1d: ibmod.takeOrderIds(1),
    tape: ibmod.takeOrderIds(1),
  };

  try {
    ibmod.ib.reqHistoricalData(reqIds.hist10s, contract, "", "14400 S", BarSizeSetting.SECONDS_TEN, WhatToShow.TRADES, 0, 2, true);
    ibmod.ib.reqHistoricalData(reqIds.hist1m, contract, "", "2 D", BarSizeSetting.MINUTES_ONE, WhatToShow.TRADES, 0, 2, true);
    ibmod.ib.reqHistoricalData(reqIds.hist1d, contract, "", "6 M", BarSizeSetting.DAYS_ONE, WhatToShow.TRADES, 1, 2, false);
    ibmod.ib.reqTickByTickData(reqIds.tape, contract, TickByTickDataType.AllLast, 0, false);
    audit("subscribe", `tape ${symbol} reqTickByTickData AllLast`);

    cdReqId = ibmod.takeOrderIds(1);
    ibmod.ib.reqContractDetails(cdReqId, contract);
  } catch (e) {
    console.error("subscribe failed", e);
  }
  emit("market", { t: "info", msg: `subscribed ${symbol}` });
}

function cancelAll(): void {
  if (!symbol) return;
  try {
    ibmod.ib.cancelHistoricalData(reqIds.hist10s);
    ibmod.ib.cancelHistoricalData(reqIds.hist1m);
    ibmod.ib.cancelHistoricalData(reqIds.hist1d);
    ibmod.ib.cancelTickByTickData(reqIds.tape);
    audit("cancel", `tape ${symbol} reqTickByTickData`);
    for (const [vid, vb] of books) {
      ibmod.ib.cancelMktDepth(vid, vb.smart);
    }
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
  const tf = reqId === reqIds.hist10s ? "10s" : reqId === reqIds.hist1m ? "1m" : undefined;
  if (!tf) return;
  const bt = Number(bar.time);
  if (lastTickTime > 0 && bt >= bucketStart(tf, lastTickTime)) return;
  const nb = {
    time: bt, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume || 0,
  };
  buckets[tf].set(bt, nb);
  emit("market", { t: "bar", tf, bar: nb });
}

let lastTickTime = 0;

function bucketStart(tf: "10s" | "1m", time: number): number {
  const size = tf === "10s" ? 10 : 60;
  return Math.floor(time / size) * size;
}

export function onTick(reqId: number, time: number, price: number, size: number): void {
  if (reqId !== reqIds.tape) return;
  const trade: Trade = { time, price, size };
  lastQuote = trade;
  tape.push(trade);
  if (tape.length > TAPE_MAX) tape.shift();
  emit("market", { t: "tape", trade });
  lastTickTime = time;
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

export function onContractDetails(reqId: number, primary: string, validCsv: string): void {
  if (reqId !== cdReqId) return;
  for (const venue of pickVenues(primary, validCsv)) {
    const vid = ibmod.takeOrderIds(1);
    books.set(vid, { venue, smart: false, bids: new Map(), asks: new Map() });
    ibmod.ib.reqMktDepth(vid, new Stock(symbol, venue, "USD"), DEPTH_ROWS, false);
  }
}

export function onContractDetailsEnd(reqId: number): void {
  if (reqId !== cdReqId) return;
  if (books.size > 0) return;
  const vid = ibmod.takeOrderIds(1);
  books.set(vid, { venue: "SMART", smart: true, bids: new Map(), asks: new Map() });
  ibmod.ib.reqMktDepth(vid, ibmod.contractFor(symbol), DEPTH_ROWS, true);
}

export function onDepth(reqId: number, pos: number, op: number, side: number, price: number, size: number): void {
  const vb = books.get(reqId);
  if (!vb) return;
  const m = side === 1 ? vb.bids : vb.asks;
  if (op === 2) m.delete(pos);
  else m.set(pos, { price, size, mm: vb.venue });
  emit("market", { t: "depth", book: bookSnapshot() });
}

export function bookSnapshot(): DepthBook {
  const side = (key: "bids" | "asks") => {
    const rows: DepthLevel[] = [];
    for (const vb of books.values()) {
      for (const lvl of vb[key].values()) {
        if (lvl.price > 0 && lvl.size > 0) rows.push(lvl);
      }
    }
    rows.sort((a, b) => (key === "bids" ? b.price - a.price : a.price - b.price));
    return rows;
  };
  return { bids: side("bids"), asks: side("asks") };
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
