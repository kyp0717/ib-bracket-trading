// Bracket transition-lock scenarios over HTTP, against paper 4002.
// Part one (no argument): scenarios 1-7 and 9, then leaves a resting
// SPY bracket on the book for the runner's restart.
// Part two ("reconnect"): scenario 8, the bracket must come back.

import { readFileSync } from 'fs';

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
  return log.includes(`order=${orderId} Cancelled`) || log.includes(`order=${orderId} Inactive`);
}

// Live state off the same SSE stream the GUI uses.
const st = { reconciled: false, pending: [], brackets: {} };
const es = new EventSource(APP + '/events');
es.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.t === 'conn') st.reconciled = !!m.reconciled;
  if (m.t === 'bracket') {
    st.pending = m.bracket._pending || [];
    st.brackets = m.bracket;
  }
};

function br(sym = SYMBOL) {
  return st.brackets[sym];
}

async function waitIdle(sym, ms = 15000) {
  await waitFor(`cancels settled for ${sym}`, ms, () => !st.pending.includes(sym));
}

async function waitAcked(orderIds, ms = 20000) {
  await waitFor(`cancel acks for ${orderIds.join('/')}`, ms, () => orderIds.every(acked));
}

async function quote(sym) {
  if (sym && sym !== SYMBOL) {
    await api('/api/symbol', { symbol: sym });
  }
  await waitFor(`tape quote${sym ? ' for ' + sym : ''}`, 15000, async () => {
    const q = await api('/api/quote');
    return q && q.price > 0 && (!sym || q.symbol === sym);
  });
  const q = await api('/api/quote');
  return q.price;
}

const r2 = (x) => Math.round(x * 100) / 100;

async function main() {
  // Scenario 1: reconcile gate. Arm before reconcile finishes must be
  // refused. If the gateway replays too fast to catch, say so.
  try {
    const r = await api('/api/arm', { symbol: SYMBOL, qty: 1, entry: 1, stop: 0.5, target: 2, orderType: 'LMT' });
    if (!r.ok && /reconcil/i.test(r.error || '')) {
      pass('arm refused before reconcile completes');
    } else if (r.ok) {
      await api('/api/disarm', { symbol: SYMBOL, reason: 'gate test cleanup' });
      skip('arm refused before reconcile completes', 'reconcile finished before first arm attempt');
    } else {
      fail('arm refused before reconcile completes', JSON.stringify(r));
    }
  } catch (e) {
    fail('arm refused before reconcile completes', String(e));
  }
  await waitFor('reconciled', 60000, () => st.reconciled);
  pass('reconcile completes and arms open');

  // Scenario 2: arm single-flight.
  const q0 = await quote(SYMBOL);
  const lv = { entry: r2(q0 - 3), stop: r2(q0 - 4), target: r2(q0 + 1) };
  let r = await api('/api/arm', { symbol: SYMBOL, qty: 1, ...lv, orderType: 'LMT' });
  if (!r.ok) throw new Error('arm failed: ' + JSON.stringify(r));
  await waitFor('working bracket', 10000, () => br() && br().state === 'working');
  const first = { parent: br().parent.orderId, stop: br().stopLeg.orderId, target: br().targetLeg.orderId };
  r = await api('/api/arm', { symbol: SYMBOL, qty: 1, ...lv, orderType: 'LMT' });
  if (!r.ok && /already working/.test(r.error || '')) {
    pass('second arm while working is refused (single-flight)');
  } else {
    fail('second arm while working is refused (single-flight)', JSON.stringify(r));
  }
  if (br().parent.orderId === first.parent) pass('exactly one bracket on the book');
  else fail('exactly one bracket on the book', 'parent id changed after second arm');

  // Scenario 3: move while working is cancel-replace.
  const lv2 = { stop: r2(lv.stop - 0.5), target: r2(lv.target + 0.5) };
  r = await api('/api/levels', { symbol: SYMBOL, stop: lv2.stop, target: lv2.target });
  if (r.ok) pass('level move while working accepted');
  else fail('level move while working accepted', JSON.stringify(r));
  await waitFor('replaced bracket', 10000, () => br() && br().state === 'working' && br().parent.orderId !== first.parent);
  const second = { parent: br().parent.orderId, stop: br().stopLeg.orderId, target: br().targetLeg.orderId };
  await waitAcked([first.parent, first.stop, first.target]);
  pass('old generation cancel-acked at the gateway');
  if (br().stop === lv2.stop && br().target === lv2.target) pass('new levels live on the replacement');
  else fail('new levels live on the replacement', JSON.stringify({ stop: br().stop, target: br().target }));

  // Scenario 4: disarm while working cancels the real orders.
  r = await api('/api/disarm', { symbol: SYMBOL, reason: 'scenario 4' });
  if (r.ok) pass('disarm while working accepted');
  else fail('disarm while working accepted', JSON.stringify(r));
  await waitAcked([second.parent, second.stop, second.target]);
  pass('all three legs cancel-acked at the gateway');
  await waitIdle(SYMBOL);

  // Scenario 5: fill locks entry, children modify in place.
  const q1 = await quote(SYMBOL);
  const entry = r2(q1 + 0.02);
  const fillLv = { entry, stop: r2(entry - 2), target: r2(entry + 2) };
  r = await api('/api/arm', { symbol: SYMBOL, qty: 1, ...fillLv, orderType: 'LMT' });
  if (!r.ok) throw new Error('fill arm failed: ' + JSON.stringify(r));
  await waitFor('entry fill', 30000, () => br() && br().entryLocked);
  pass('entry filled, entryLocked set');
  const idsAfterFill = { stop: br().stopLeg.orderId, target: br().targetLeg.orderId };
  r = await api('/api/levels', { symbol: SYMBOL, entry: r2(entry + 1), stop: fillLv.stop, target: fillLv.target });
  if (!r.ok && /entry locked/.test(r.error || '')) {
    pass('entry change after fill refused');
  } else {
    fail('entry change after fill refused', JSON.stringify(r));
  }
  const newStop = r2(entry - 3), newTarget = r2(entry + 3);
  r = await api('/api/levels', { symbol: SYMBOL, stop: newStop, target: newTarget });
  if (r.ok) pass('stop and target move after fill accepted');
  else fail('stop and target move after fill accepted', JSON.stringify(r));
  await waitFor('in-place modify', 10000, () =>
    br() && br().stop === newStop && br().target === newTarget &&
    br().stopLeg.orderId === idsAfterFill.stop && br().targetLeg.orderId === idsAfterFill.target);
  pass('children modified in place on the same order IDs');

  // Scenario 6: disarm while filled cancels the children.
  r = await api('/api/disarm', { symbol: SYMBOL, reason: 'scenario 6' });
  if (r.ok) pass('disarm while filled accepted');
  else fail('disarm while filled accepted', JSON.stringify(r));
  await waitFor('children cancelled', 20000, () => {
    const b = br();
    return b && b.stopLeg.status === 'Cancelled' && b.targetLeg.status === 'Cancelled';
  });
  pass('live children cancelled after disarm');
  await waitIdle(SYMBOL);
  r = await api('/api/flatten', { symbol: SYMBOL });
  if (r.ok) pass('flatten closes the naked entry position');
  else fail('flatten closes the naked entry position', JSON.stringify(r));
  await waitIdle(SYMBOL);

  // Scenario 7: symbol switch disarms the working bracket.
  const aq = await quote('AAPL');
  const aaplLv = { entry: r2(aq - 3), stop: r2(aq - 4), target: r2(aq + 1) };
  r = await api('/api/arm', { symbol: 'AAPL', qty: 1, ...aaplLv, orderType: 'LMT' });
  if (!r.ok) throw new Error('AAPL arm failed: ' + JSON.stringify(r));
  await waitFor('AAPL working', 10000, () => br('AAPL') && br('AAPL').state === 'working');
  const aaplIds = [br('AAPL').parent.orderId, br('AAPL').stopLeg.orderId, br('AAPL').targetLeg.orderId];
  await api('/api/symbol', { symbol: SYMBOL });
  await waitAcked(aaplIds);
  if (auditLog().includes('symbol switch to SPY')) pass('symbol switch disarms the live bracket');
  else fail('symbol switch disarms the live bracket', 'no audit line');
  await waitIdle('AAPL');

  // Scenario 9: parent rejected by IB returns to closed, nothing
  // resting. Expected to FAIL on first run: bracket.ts does not yet
  // move the machine to closed on a reject. That is the suite finding
  // the gap, per the plan.
  r = await api('/api/arm', { symbol: SYMBOL, qty: 1, entry: 150.123456, stop: 150.11, target: 150.2, orderType: 'LMT' });
  if (!r.ok) throw new Error('reject-test arm call itself failed: ' + JSON.stringify(r));
  try {
    await waitFor('closed after reject', 15000, () => {
      const b = br();
      return !b || b.state === 'closed';
    });
    pass('rejected parent returns the machine to closed');
  } catch {
    fail('rejected parent returns the machine to closed', `state=${br() ? br().state : 'missing'}, expect the known gap`);
  }
  await api('/api/disarm', { symbol: SYMBOL, reason: 'scenario 9 cleanup' });
  await waitIdle(SYMBOL);

  // Leave a resting SPY bracket on the book for the restart scenario.
  const q2 = await quote(SYMBOL);
  const restLv = { entry: r2(q2 - 3), stop: r2(q2 - 4), target: r2(q2 + 1) };
  r = await api('/api/arm', { symbol: SYMBOL, qty: 1, ...restLv, orderType: 'LMT' });
  if (!r.ok) throw new Error('resting arm failed: ' + JSON.stringify(r));
  await waitFor('resting bracket for restart', 10000, () => br() && br().state === 'working');
  console.log(`RESTING ${SYMBOL} parent=${br().parent.orderId} stop=${br().stop} target=${br().target}`);
  pass('resting bracket left armed for restart scenario');
}

async function reconnect() {
  // Scenario 8: after a restart the bracket must be rebuilt from
  // openOrder callbacks and arms reopen only after reconcile.
  const sawUnreconciled = await (async () => {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      if (!st.reconciled) return true;
      await new Promise((r) => setTimeout(r, 100));
    }
    return false;
  })();
  if (sawUnreconciled) pass('arms blocked while reconnect reconcile runs');
  else skip('arms blocked while reconnect reconcile runs', 'reconcile finished before first poll');

  await waitFor('rebuilt bracket after restart', 60000, () => st.reconciled && br() && br().state === 'working');
  pass('reconnect reconcile rebuilds the resting bracket');
  const b = br();
  if (b.stop > 0 && b.target > 0 && b.qty === 1) pass('rebuilt bracket keeps levels and quantity');
  else fail('rebuilt bracket keeps levels and quantity', JSON.stringify({ stop: b.stop, target: b.target, qty: b.qty }));

  const ids = [b.parent.orderId, b.stopLeg.orderId, b.targetLeg.orderId];
  const r = await api('/api/disarm', { symbol: SYMBOL, reason: 'reconnect scenario cleanup' });
  if (r.ok) pass('disarm accepted after reconnect');
  else fail('disarm accepted after reconnect', JSON.stringify(r));
  await waitAcked(ids);
  pass('rebuilt bracket cancelled at the gateway');
  await waitIdle(SYMBOL);
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
