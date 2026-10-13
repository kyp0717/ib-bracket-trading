
import { EventSource } from '../bracket/sse.mjs';

const APP = process.env.E2E_APP_ADDR || 'http://127.0.0.1:8080';

let failures = 0;

function pass(name) { console.log('PASS ' + name); }
function fail(name, why) { console.log('FAIL ' + name + ': ' + why); failures++; }

async function api(path, body) {
  const r = await fetch(APP + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.json();
}

async function waitFor(what, timeoutMs, cond) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await cond()) return;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('timed out waiting for ' + what);
}

const st = { reconciled: false, symbol: '', book: null, depthMsgs: 0 };
const onmsg = (e) => {
  const m = JSON.parse(e.data);
  if (m.t === 'conn') st.reconciled = !!m.reconciled;
  if (m.t === 'depth') {
    st.book = m.book;
    st.depthMsgs++;
  }
};
const es = new EventSource(APP + '/events');
es.onmessage = onmsg;
const mkt = new EventSource(APP + '/market');
mkt.onmessage = onmsg;

async function loadSymbol(sym) {
  await api('/api/symbol', { symbol: sym });
  st.symbol = sym;
}

async function waitBook(timeoutMs = 20000) {
  await waitFor(`depth book for ${st.symbol}`, timeoutMs, () =>
    st.book && st.book.bids.length > 0 && st.book.asks.length > 0);
  return st.book;
}

async function main() {
  await waitFor('reconciled', 60000, () => st.reconciled);
  pass('connected and reconciled');

  await loadSymbol('SPY');
  await waitBook();
  pass('depth book arrives after symbol load');

  const b = st.book;
  const bestBid = b.bids[0].price;
  const bestAsk = b.asks[0].price;
  if (bestBid > 0 && bestAsk > 0 && bestBid < bestAsk) pass('best bid below best ask');
  else fail('best bid below best ask', JSON.stringify({ bestBid, bestAsk }));
  const bidsDesc = b.bids.every((r, i) => i === 0 || b.bids[i - 1].price >= r.price);
  if (bidsDesc) pass('bids ordered best first');
  else fail('bids ordered best first', JSON.stringify(b.bids.map((r) => r.price)));
  const asksAsc = b.asks.every((r, i) => i === 0 || b.asks[i - 1].price <= r.price);
  if (asksAsc) pass('asks ordered best first');
  else fail('asks ordered best first', JSON.stringify(b.asks.map((r) => r.price)));

  if (b.bids.every((r) => r.size > 0) && b.asks.every((r) => r.size > 0)) {
    pass('depth sizes positive');
  } else {
    fail('depth sizes positive', JSON.stringify(b));
  }

  
  const spyBest = bestBid;
  await loadSymbol('QQQ');
  await waitFor('book change after switch', 20000, () =>
    st.book && st.book.bids.length > 0 && st.book.bids[0].price !== spyBest);
  if (Math.abs(st.book.bids[0].price - spyBest) > 1) pass('book refreshes on symbol switch');
  else fail('book refreshes on symbol switch', `best bid moved only to ${st.book.bids[0].price} from ${spyBest}`);

  
  const n0 = st.depthMsgs;
  await waitFor('depth messages keep flowing', 20000, () => st.depthMsgs > n0)
    .then(() => pass('depth messages keep flowing'))
    .catch(() => fail('depth messages keep flowing', 'no depth message in 20s'));

  await loadSymbol('SPY');
  await waitBook();
}

try {
  await main();
} catch (e) {
  fail('suite aborted', String(e));
} finally {
  es.close();
  mkt.close();
}

console.log(failures === 0 ? 'depth api suite: all pass' : `depth api suite: ${failures} failures`);
process.exit(failures === 0 ? 0 : 1);
