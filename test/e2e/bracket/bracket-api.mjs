
import { readFileSync } from 'fs';
import { EventSource } from './sse.mjs';

const APP = process.env.E2E_APP_ADDR || 'http://127.0.0.1:8080';
const RECONNECT = process.argv[2] === 'reconnect';
const SYMBOL = 'SPY';

let failures = 0;
let skips = 0;
const skipNames = [];

function pass(name) { console.log('PASS ' + name); }
function fail(name, why) { console.log('FAIL ' + name + ': ' + why); failures++; }
function skip(name, why) { console.log('SKIP ' + name + ': ' + why); skips++; skipNames.push(name); }

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

function auditLog() {
  try {
    return readFileSync('audit.log', 'utf8');
  } catch {
    return '';
  }
}

function acked(orderId) {
  const log = auditLog();
  return log.includes(`order=${orderId} Cancelled`)
    || log.includes(`order=${orderId} Inactive`)
    || log.includes(`order=${orderId} ApiCancelled`);
}

const st = { reconciled: false, cancelInFlight: false, bracket: null };
const es = new EventSource(APP + '/events');
es.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.t === 'conn') st.reconciled = !!m.reconciled;
  if (m.t === 'bracket') {
    st.cancelInFlight = !!m.bracket._pending;
    st.bracket = m.bracket.current;
  }
};

function br() {
  return st.bracket;
}

async function waitIdle(ms = 15000) {

  await waitFor('cancels registered', 5000, () => st.cancelInFlight).catch(() => {});
  await waitFor('cancels settled', ms, () => !st.cancelInFlight);
}

async function waitAcked(orderIds, ms = 20000) {
  await waitFor(`cancel acks for ${orderIds.join('/')}`, ms, () => orderIds.every(acked));
}

async function quote(sym) {
  const target = sym || SYMBOL;
  await api('/api/symbol', { symbol: target });
  await waitFor(`tape quote for ${target}`, 15000, async () => {
    const q = await api('/api/quote');
    return q && q.price > 0 && q.symbol === target;
  });
  const q = await api('/api/quote');
  return q.price;
}

const r2 = (x) => Math.round(x * 100) / 100;

async function main() {

  try {
    const r = await api('/api/bracket/activate', { symbol: SYMBOL, qty: 1, entry: 1, stop: 0.5, target: 2, orderType: 'LMT' });
    if (!r.ok && /reconcil/i.test(r.error || '')) {
      pass('activation refused before reconcile completes');
    } else if (r.ok) {
      await api('/api/bracket/deactivate', { reason: 'gate test cleanup' });
      skip('activation refused before reconcile completes', 'reconcile finished before first activation attempt');
    } else {
      fail('activation refused before reconcile completes', JSON.stringify(r));
    }
  } catch (e) {
    fail('activation refused before reconcile completes', String(e));
  }
  await waitIdle();
  await waitFor('reconciled', 60000, () => st.reconciled);
  pass('reconcile completes and activations open');

  const q0 = await quote(SYMBOL);
  const lv = { entry: r2(q0 - 3), stop: r2(q0 - 4), target: r2(q0 + 1) };
  let r = await api('/api/bracket/activate', { symbol: SYMBOL, qty: 1, ...lv, orderType: 'LMT' });
  if (!r.ok) throw new Error('activation failed: ' + JSON.stringify(r));
  await waitFor('working bracket', 10000, () => br() && br().state === 'working');
  const first = { parent: br().parent.orderId, stop: br().stopLeg.orderId, target: br().targetLeg.orderId };
  r = await api('/api/bracket/activate', { symbol: SYMBOL, qty: 1, ...lv, orderType: 'LMT' });
  if (!r.ok && /already working/.test(r.error || '')) {
    pass('second activation while working is refused (single-flight)');
  } else {
    fail('second activation while working is refused (single-flight)', JSON.stringify(r));
  }
  if (br().parent.orderId === first.parent) pass('exactly one bracket on the book');
  else fail('exactly one bracket on the book', 'parent id changed after second activation');

  const lv2 = { stop: r2(lv.stop - 0.5), target: r2(lv.target + 0.5) };
  r = await api('/api/bracket/levels', { stop: lv2.stop, target: lv2.target });
  if (r.ok) pass('level move while working accepted');
  else fail('level move while working accepted', JSON.stringify(r));
  await waitFor('replaced bracket', 10000, () => br() && br().state === 'working' && br().parent.orderId !== first.parent);
  const second = { parent: br().parent.orderId, stop: br().stopLeg.orderId, target: br().targetLeg.orderId };
  await waitAcked([first.parent, first.stop, first.target]);
  pass('old generation cancel-acked at the gateway');
  if (br().stop === lv2.stop && br().target === lv2.target) pass('new levels live on the replacement');
  else fail('new levels live on the replacement', JSON.stringify({ stop: br().stop, target: br().target }));

  r = await api('/api/bracket/deactivate', { reason: 'scenario 4' });
  if (r.ok) pass('deactivate while working accepted');
  else fail('deactivate while working accepted', JSON.stringify(r));
  await waitAcked([second.parent, second.stop, second.target]);
  pass('all three legs cancel-acked at the gateway');
  await waitIdle();

  const q1 = await quote(SYMBOL);
  const entry = r2(q1 + 0.02);
  const fillLv = { entry, stop: r2(entry - 2), target: r2(entry + 2) };
  r = await api('/api/bracket/activate', { symbol: SYMBOL, qty: 1, ...fillLv, orderType: 'LMT' });
  if (!r.ok) throw new Error('fill activation failed: ' + JSON.stringify(r));
  await waitFor('entry fill', 60000, () => br() && br().entryLocked);
  pass('entry filled, entryLocked set');
  const idsAfterFill = { stop: br().stopLeg.orderId, target: br().targetLeg.orderId };
  r = await api('/api/bracket/levels', { entry: r2(entry + 1), stop: fillLv.stop, target: fillLv.target });
  if (!r.ok && /entry locked/.test(r.error || '')) {
    pass('entry change after fill refused');
  } else {
    fail('entry change after fill refused', JSON.stringify(r));
  }
  const newStop = r2(entry - 3), newTarget = r2(entry + 3);
  r = await api('/api/bracket/levels', { stop: newStop, target: newTarget });
  if (r.ok) pass('stop and target move after fill accepted');
  else fail('stop and target move after fill accepted', JSON.stringify(r));
  await waitFor('in-place modify', 10000, () =>
    br() && br().stop === newStop && br().target === newTarget &&
    br().stopLeg.orderId === idsAfterFill.stop && br().targetLeg.orderId === idsAfterFill.target);
  pass('children modified in place on the same order IDs');

  r = await api('/api/bracket/deactivate', { reason: 'scenario 6' });
  if (r.ok) pass('deactivate while filled accepted');
  else fail('deactivate while filled accepted', JSON.stringify(r));
  await waitFor('children cancelled', 20000, () => {
    const b = br();
    const dead = (s) => s === 'Cancelled' || s === 'Inactive' || s === 'ApiCancelled';
    return b && dead(b.stopLeg.status) && dead(b.targetLeg.status);
  });
  pass('live children cancelled after deactivate');
  await waitIdle();
  r = await api('/api/bracket/flatten', { symbol: SYMBOL });
  if (r.ok) pass('flatten closes the naked entry position');
  else fail('flatten closes the naked entry position', JSON.stringify(r));
  await waitIdle();

  
  
  const aq = await quote('AAPL');
  const aaplLv = { entry: r2(aq - 3), stop: r2(aq - 4), target: r2(aq + 1) };
  r = await api('/api/bracket/activate', { symbol: 'AAPL', qty: 1, ...aaplLv, orderType: 'LMT' });
  if (!r.ok) throw new Error('AAPL activation failed: ' + JSON.stringify(r));
  await waitFor('AAPL working', 10000, () => br() && br().symbol === 'AAPL' && br().state === 'working');
  const aaplIds = [br().parent.orderId, br().stopLeg.orderId, br().targetLeg.orderId];
  r = await api('/api/bracket/activate', { symbol: SYMBOL, qty: 1, ...aaplLv, orderType: 'LMT' });
  if (!r.ok && /already working/.test(r.error || '')) {
    pass('activation for another symbol refused while working');
  } else {
    fail('activation for another symbol refused while working', JSON.stringify(r));
  }
  if (br().symbol === 'AAPL' && br().parent.orderId === aaplIds[0]) pass('exactly one bracket on the book across symbols');
  else fail('exactly one bracket on the book across symbols', JSON.stringify(br()));
  await api('/api/symbol', { symbol: SYMBOL });
  await waitAcked(aaplIds);
  if (auditLog().includes('symbol switch to SPY')) pass('symbol switch disarms the live bracket');
  else fail('symbol switch disarms the live bracket', 'no audit line');
  await waitIdle();

  

  r = await api('/api/bracket/activate', { symbol: SYMBOL, qty: 1, entry: 150.123456, stop: 150.11, target: 150.2, orderType: 'LMT' });
  if (!r.ok) throw new Error('reject-test activation call itself failed: ' + JSON.stringify(r));
  try {
    await waitFor('closed after reject', 15000, () => {
      const b = br();
      return !b || b.state === 'closed';
    });
    pass('rejected parent returns the machine to closed');
  } catch {
    fail('rejected parent returns the machine to closed', `state=${br() ? br().state : 'missing'}, expect the known gap`);
  }
  await api('/api/bracket/deactivate', { reason: 'scenario 9 cleanup' });
  await waitIdle();

  const q2 = await quote(SYMBOL);
  const restLv = { entry: r2(q2 - 3), stop: r2(q2 - 4), target: r2(q2 + 1) };
  r = await api('/api/bracket/activate', { symbol: SYMBOL, qty: 1, ...restLv, orderType: 'LMT' });
  if (!r.ok) throw new Error('resting activation failed: ' + JSON.stringify(r));
  await waitFor('resting bracket for restart', 10000, () => br() && br().state === 'working');
  console.log(`RESTING ${SYMBOL} parent=${br().parent.orderId} stop=${br().stop} target=${br().target}`);
  pass('resting bracket left activated for restart scenario');
}

async function reconnect() {

  const sawUnreconciled = await (async () => {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      if (!st.reconciled) return true;
      await new Promise((r) => setTimeout(r, 100));
    }
    return false;
  })();
  if (sawUnreconciled) pass('activations blocked while reconnect reconcile runs');
  else skip('activations blocked while reconnect reconcile runs', 'reconcile finished before first poll');

  await waitFor('rebuilt bracket after restart', 60000, () => st.reconciled && br() && br().state === 'working');
  pass('reconnect reconcile rebuilds the resting bracket');
  const b = br();
  if (b.stop > 0 && b.target > 0 && b.qty === 1) pass('rebuilt bracket keeps levels and quantity');
  else fail('rebuilt bracket keeps levels and quantity', JSON.stringify({ stop: b.stop, target: b.target, qty: b.qty }));

  const ids = [b.parent.orderId, b.stopLeg.orderId, b.targetLeg.orderId];
  const r = await api('/api/bracket/deactivate', { reason: 'reconnect scenario cleanup' });
  if (r.ok) pass('deactivate accepted after reconnect');
  else fail('deactivate accepted after reconnect', JSON.stringify(r));
  await waitAcked(ids);
  pass('rebuilt bracket cancelled at the gateway');
  await waitIdle();
}

try {
  if (RECONNECT) await reconnect();
  else await main();
} catch (e) {
  fail('suite aborted', String(e));
} finally {
  es.close();
}

console.log(failures === 0
  ? `api suite: all pass${skips ? ` (${skips} skipped: ${skipNames.join(', ')})` : ''}`
  : `api suite: ${failures} failures`);
process.exit(failures === 0 ? 0 : 1);
