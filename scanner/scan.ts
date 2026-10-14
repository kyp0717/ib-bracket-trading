import { BarSizeSetting, EventName, IBApi, Stock, WhatToShow } from "@stoqey/ib";
import type { ScannerSubscription } from "@stoqey/ib";

export interface Candidate {
  rank: number;
  symbol: string;
  exchange: string;
  distance: string;
  close: number;
  avgDollarVolume: number;
  avgRangePct: number;
}

export interface ScanInput {
  subscription?: ScannerSubscription;
  symbols?: string[];
}

export class ScannerDisabledError extends Error {}

interface ScannerRow {
  rank: number;
  symbol: string;
  exchange: string;
  distance: string;
}

function connect(ib: IBApi, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("ib connect timeout")), timeoutMs);
    ib.on(EventName.connected, () => {
      clearTimeout(timer);
      resolve();
    });
    ib.connect();
  });
}

function scanRows(ib: IBApi, subscription: ScannerSubscription, timeoutMs: number): Promise<ScannerRow[]> {
  return new Promise((resolve, reject) => {
    const fail = (e: Error) => {
      if (done) return;
      done = true;
      cleanup();
      reject(e);
    };
    const rows: ScannerRow[] = [];
    let done = false;
    const cleanup = () => {
      clearInterval(poll);
      clearTimeout(timer);
      try { ib.cancelScannerSubscription(1); } catch { /* already closed */ }
    };
    const finish = () => {
      if (done) return;
      done = true;
      cleanup();
      resolve(rows.sort((a, b) => a.rank - b.rank));
    };
    const timer = setTimeout(finish, timeoutMs);
    const poll = setInterval(finish, 3000);
    ib.on(EventName.error, (err) => {
      const msg = String(err);
      if (/Scanner type with code \d+ is disabled/.test(msg)) fail(new ScannerDisabledError(msg));
      else if (!/2104|2106|2158/.test(msg)) fail(new Error(msg));
    });
    ib.on(EventName.scannerData, (reqId, rank, details, distance) => {
      if (reqId !== 1 || done) return;
      poll.refresh();
      const contract = (details as any)?.contract;
      const symbol = contract?.symbol;
      if (!symbol) return;
      rows.push({ rank, symbol, exchange: contract?.primaryExch ?? contract?.exchange ?? "", distance });
    });
    ib.on(EventName.scannerDataEnd, (reqId) => {
      if (reqId === 1) finish();
    });
    ib.reqScannerSubscription(1, subscription, [], []);
  });
}

function dailyBars(ib: IBApi, reqId: number, symbol: string, timeoutMs: number): Promise<{ close: number; dollarVol: number; rangePct: number }[]> {
  return new Promise((resolve) => {
    const bars: { close: number; dollarVol: number; rangePct: number }[] = [];
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      ib.off(EventName.historicalData, onBar);
      resolve(bars);
    };
    const timer = setTimeout(finish, timeoutMs);
    const onBar = (rid: number, time: string, open: number, high: number, low: number, close: number, volume: number) => {
      if (rid !== reqId) return;
      if (typeof time === "string" && time.startsWith("finished")) {
        finish();
        return;
      }
      if (close > 0) bars.push({ close, dollarVol: close * volume, rangePct: (high - low) / close });
    };
    ib.on(EventName.historicalData, onBar);
    ib.reqHistoricalData(reqId, new Stock(symbol, "SMART", "USD"), "", "1 M", BarSizeSetting.DAYS_ONE, WhatToShow.TRADES, 1, 2, false);
  });
}

async function mapPool<T, R>(items: T[], width: number, f: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(width, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await f(items[idx]);
    }
  }));
  return out;
}

export async function runScan(port: number, input: ScanInput, rowsWanted = 25, histTimeoutMs = 8000, onSymbol?: (symbol: string) => void): Promise<Candidate[]> {
  const ib = new IBApi({ host: "127.0.0.1", port, clientId: 95 });
  try {
    await connect(ib, 10000);
    let rows: ScannerRow[];
    if (input.subscription) {
      rows = (await scanRows(ib, input.subscription, 15000)).slice(0, rowsWanted);
    } else {
      rows = (input.symbols ?? []).map((symbol, i) => ({ rank: i + 1, symbol, exchange: "", distance: "" }));
    }
    const enriched = await mapPool(rows, 5, async (row) => {
      const bars = await dailyBars(ib, 100 + row.rank, row.symbol, histTimeoutMs);
      if (onSymbol) onSymbol(row.symbol);
      if (!bars.length) return null;
      const avg = (f: (b: typeof bars[0]) => number) => bars.reduce((s, b) => s + f(b), 0) / bars.length;
      return {
        rank: row.rank,
        symbol: row.symbol,
        exchange: row.exchange,
        distance: row.distance,
        close: bars[bars.length - 1].close,
        avgDollarVolume: avg((b) => b.dollarVol),
        avgRangePct: avg((b) => b.rangePct),
      } satisfies Candidate;
    });
    return enriched.filter((c): c is Candidate => c !== null);
  } finally {
    ib.disconnect();
  }
}
