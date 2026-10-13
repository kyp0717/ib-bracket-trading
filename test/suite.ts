import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Bar, Bracket, BracketSnapshot, ConnState, DepthBook, Trade } from '../wire';

export const APP = process.env.E2E_APP_ADDR || 'http://127.0.0.1:8080';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export interface Status extends ConnState {
  symbol: string;
  cancelInFlight: boolean;
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
export const flatten = (symbol: string) => api('/api/bracket/flatten', { symbol });
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
  symbol: string;
}

export function live(): { st: LiveState; close(): void } {
  const st: LiveState = { reconciled: false, cancelInFlight: false, bracket: null, depth: null, depthMsgs: 0, symbol: '' };
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

export function auditLog(): string {
  try {
    return readFileSync('audit.log', 'utf8');
  } catch {
    return '';
  }
}

export function acked(orderId: number): boolean {
  const log = auditLog();
  return log.includes(`order=${orderId} Cancelled`)
    || log.includes(`order=${orderId} Inactive`)
    || log.includes(`order=${orderId} ApiCancelled`);
}

export async function waitAcked(orderIds: number[], ms = 20000): Promise<void> {
  await waitFor(`cancel acks for ${orderIds.join('/')}`, ms, () => orderIds.every(acked));
}

export const r2 = (x: number) => Math.round(x * 100) / 100;

export function evidencePath(metaUrl: string, name: string, ext = 'png'): string {
  const dir = new URL('./evidence/', import.meta.url);
  mkdirSync(dir, { recursive: true });
  const file = fileURLToPath(metaUrl).split('/test/')[1].replace(/\.ts$/, '');
  const key = file.replace(/\//g, '-');
  return fileURLToPath(new URL(`${key}-${name}.${ext}`, dir));
}
