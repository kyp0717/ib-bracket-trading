import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { AuditRecent, Bar, Bracket, BracketSnapshot, ConnState, DepthBook, Trade } from '../../../src/wire';

export const APP = process.env.E2E_APP_ADDR || 'http://127.0.0.1:8080';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export interface Status extends ConnState {
  symbol: string;
  cancelInFlight: boolean;
  position: number;
}

export interface Quote extends Trade {
  symbol: string;
}

export type SseMsg =
  | ({ t: 'conn' } & ConnState)
  | { t: 'bracket'; bracket: BracketSnapshot }
  | { t: 'depth'; book: DepthBook }
  | { t: 'hist'; tf: string; bars: Bar[] }
  | { t: 'bar'; tf: string; bar: Bar }
  | { t: 'tape'; trade: Trade }
  | { t: 'tapeFull'; trades: Trade[] }
  | { t: 'audit'; line: string }
  | { t: 'info'; msg: string };

export function makeSuite(label: string) {
  let failures = 0;
  return {
    pass(name: string) { console.log('PASS ' + name); },
    fail(name: string, why: string) { console.log('FAIL ' + name + ': ' + why); failures++; },
    summary() {
      console.log(failures === 0 ? `${label}: all pass` : `${label}: ${failures} failures`);
      process.exit(failures === 0 ? 0 : 1);
    },
  };
}

export async function api<T = ActionResult>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(APP + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return r.json() as Promise<T>;
}

export const activate = (body: unknown) => api('/api/bracket/activate', body);
export const deactivate = (reason: string) => api('/api/bracket/deactivate', { reason });
export const setLevels = (body: unknown) => api('/api/bracket/levels', body);
export const flatten = (symbol: string, offset?: number) => api('/api/bracket/flatten', { symbol, offset: offset ?? 0 });
export const switchSymbol = (symbol: string) => api('/api/symbol', { symbol });
export const getStatus = () => api<Status>('/status');
export const getQuote = () => api<Quote>('/api/quote');

export async function waitFor(what: string, timeoutMs: number, cond: () => unknown): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await cond()) return;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('timed out waiting for ' + what);
}

import { EventSource } from './sse';
export { EventSource };

export interface LiveState {
  reconciled: boolean;
  cancelInFlight: boolean;
  bracket: Bracket | null;
  depth: DepthBook | null;
  depthMsgs: number;
  tapeMsgs: number;
  tapeTimes: number[];
  lastTapePrice: number | null;
  bar10Msgs: number;
  lastBar10: { time: number; close: number } | null;
  bars1m: Bar[];
  auditLines: string[];
  symbol: string;
}

export function live(): { st: LiveState; close(): void } {
  const st: LiveState = { reconciled: false, cancelInFlight: false, bracket: null, depth: null, depthMsgs: 0, tapeMsgs: 0, tapeTimes: [], lastTapePrice: null, bar10Msgs: 0, lastBar10: null, bars1m: [], auditLines: [], symbol: '' };
  const onmsg = (e: { data: string }) => {
    const m = JSON.parse(e.data) as SseMsg;
    if (m.t === 'conn') st.reconciled = m.reconciled;
    if (m.t === 'bracket') {
      st.cancelInFlight = m.bracket._pending;
      st.bracket = m.bracket.current;
    }
    if (m.t === 'depth') {
      st.depth = m.book;
      st.depthMsgs++;
    }
    if (m.t === 'tape') {
      st.tapeMsgs++;
      st.lastTapePrice = m.trade.price;
      st.tapeTimes.push(Date.now());
      if (st.tapeTimes.length > 600) st.tapeTimes.shift();
    }
    if (m.t === 'bar' && m.tf === '10s') {
      st.bar10Msgs++;
      st.lastBar10 = { time: m.bar.time, close: m.bar.close };
    }
    if (m.t === 'hist' && m.tf === '1m') {
      st.bars1m = m.bars.slice(-400);
    }
    if (m.t === 'bar' && m.tf === '1m') {
      st.bars1m.push(m.bar);
      if (st.bars1m.length > 400) st.bars1m.shift();
    }
    if (m.t === 'audit') st.auditLines.push(m.line);
  };
  const es = new EventSource(APP + '/events');
  const mkt = new EventSource(APP + '/market');
  es.onmessage = onmsg;
  mkt.onmessage = onmsg;
  return { st, close() { es.close(); mkt.close(); } };
}

export async function quote(st: LiveState, sym: string): Promise<number> {
  st.symbol = sym;
  await switchSymbol(sym);
  await waitFor(`tape quote for ${sym}`, 15000, async () => {
    const q = await getQuote();
    return q && q.price > 0 && q.symbol === sym;
  });
  const q = await getQuote();
  return q.price;
}

export async function waitIdle(st: LiveState, ms = 15000): Promise<void> {
  await waitFor('cancels registered', 5000, () => st.cancelInFlight).catch(() => {});
  await waitFor('cancels settled', ms, () => !st.cancelInFlight);
}

export async function auditLines(): Promise<string[]> {
  const r = await api<AuditRecent>('/api/audit');
  return r.lines;
}

export async function acked(orderId: number): Promise<boolean> {
  const lines = await auditLines();
  return lines.some((l) => l.includes(`order=${orderId} Cancelled`)
    || l.includes(`order=${orderId} Inactive`)
    || l.includes(`order=${orderId} ApiCancelled`));
}

export async function waitAcked(orderIds: number[], ms = 20000): Promise<void> {
  await waitFor(`cancel acks for ${orderIds.join('/')}`, ms, async () => {
    const lines = await auditLines();
    return orderIds.every((id) => lines.some((l) => l.includes(`order=${id} Cancelled`)
      || l.includes(`order=${id} Inactive`)
      || l.includes(`order=${id} ApiCancelled`)));
  });
}

export async function flattenUntilFlat(symbol: string, ms = 90000): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if ((await getStatus()).position === 0) return true;
    await flatten(symbol);
    await new Promise((r) => setTimeout(r, 2000));
  }
  return (await getStatus()).position === 0;
}

export const r2 = (x: number) => Math.round(x * 100) / 100;

export function evidencePath(metaUrl: string, name: string, ext = 'png'): string {
  const dir = new URL('../evidence/', import.meta.url);
  mkdirSync(dir, { recursive: true });
  const file = fileURLToPath(metaUrl).split('/test-legacy/')[1].replace(/\.ts$/, '');
  const key = file.replace(/\//g, '-');
  return fileURLToPath(new URL(`${key}-${name}.${ext}`, dir));
}
