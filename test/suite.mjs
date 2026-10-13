import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const APP = process.env.E2E_APP_ADDR || 'http://127.0.0.1:8080';

export function makeSuite(label) {
  let failures = 0;
  return {
    pass(name) { console.log('PASS ' + name); },
    fail(name, why) { console.log('FAIL ' + name + ': ' + why); failures++; },
    summary() {
      console.log(failures === 0 ? `${label}: all pass` : `${label}: ${failures} failures`);
      process.exit(failures === 0 ? 0 : 1);
    },
  };
}

export async function api(path, body) {
  const r = await fetch(APP + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.json();
}

export async function waitFor(what, timeoutMs, cond) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await cond()) return;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('timed out waiting for ' + what);
}

export { EventSource } from './sse.mjs';

export function live() {
  const st = { reconciled: false, cancelInFlight: false, bracket: null, depth: null, depthMsgs: 0, symbol: '' };
  const onmsg = (e) => {
    const m = JSON.parse(e.data);
    if (m.t === 'conn') st.reconciled = !!m.reconciled;
    if (m.t === 'bracket') {
      st.cancelInFlight = !!m.bracket._pending;
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

export async function quote(st, sym) {
  st.symbol = sym;
  await api('/api/symbol', { symbol: sym });
  await waitFor(`tape quote for ${sym}`, 15000, async () => {
    const q = await api('/api/quote');
    return q && q.price > 0 && q.symbol === sym;
  });
  const q = await api('/api/quote');
  return q.price;
}

export async function waitIdle(st, ms = 15000) {
  await waitFor('cancels registered', 5000, () => st.cancelInFlight).catch(() => {});
  await waitFor('cancels settled', ms, () => !st.cancelInFlight);
}

export function auditLog() {
  try {
    return readFileSync('audit.log', 'utf8');
  } catch {
    return '';
  }
}

export function acked(orderId) {
  const log = auditLog();
  return log.includes(`order=${orderId} Cancelled`)
    || log.includes(`order=${orderId} Inactive`)
    || log.includes(`order=${orderId} ApiCancelled`);
}

export async function waitAcked(orderIds, ms = 20000) {
  await waitFor(`cancel acks for ${orderIds.join('/')}`, ms, () => orderIds.every(acked));
}

export const r2 = (x) => Math.round(x * 100) / 100;

export function evidencePath(metaUrl, name, ext = 'png') {
  const dir = new URL('./evidence/', import.meta.url);
  mkdirSync(dir, { recursive: true });
  const file = fileURLToPath(metaUrl).split('/test/')[1].replace(/\.mjs$/, '');
  const key = file.replace(/\//g, '-');
  return fileURLToPath(new URL(`${key}-${name}.${ext}`, dir));
}
