import { makeSuite, live, waitFor, quote, waitAcked, waitIdle, auditLog, r2, activate, switchSymbol } from '../../suite';

const { pass, fail, summary } = makeSuite('api 07 cross-symbol');
const { st, close } = live();

try {
  await waitFor('reconciled', 60000, () => st.reconciled);
  const aq = await quote(st, 'AAPL');
  const aaplLv = { entry: r2(aq - 3), stop: r2(aq - 4), target: r2(aq + 1) };
  let r = await activate({ symbol: 'AAPL', qty: 1, ...aaplLv, orderType: 'LMT' });
  if (!r.ok) throw new Error('AAPL activation failed: ' + JSON.stringify(r));
  await waitFor('AAPL working', 10000, () => st.bracket && st.bracket!.symbol === 'AAPL' && st.bracket!.state === 'working');
  const aaplIds = [st.bracket!.parent.orderId, st.bracket!.stopLeg.orderId, st.bracket!.targetLeg.orderId];
  r = await activate({ symbol: 'SPY', qty: 1, ...aaplLv, orderType: 'LMT' });
  if (!r.ok && /already working/.test(r.error || '')) {
    pass('activation for another symbol refused while working');
  } else {
    fail('activation for another symbol refused while working', JSON.stringify(r));
  }
  if (st.bracket!.symbol === 'AAPL' && st.bracket!.parent.orderId === aaplIds[0]) pass('exactly one bracket on the book across symbols');
  else fail('exactly one bracket on the book across symbols', JSON.stringify(st.bracket));
  await switchSymbol('SPY');
  await waitAcked(aaplIds);
  if (auditLog().includes('symbol switch to SPY')) pass('symbol switch deactivates the live bracket');
  else fail('symbol switch deactivates the live bracket', 'no audit line');
  await waitIdle(st);
} catch (e) {
  fail('suite aborted', String(e));
} finally {
  close();
}
summary();
