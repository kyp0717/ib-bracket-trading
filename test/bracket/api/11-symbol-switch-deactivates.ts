import { makeSuite, live, waitFor, quote, waitAcked, waitIdle, auditLog, r2, activate, switchSymbol } from '../../suite';

const { pass, fail, summary } = makeSuite('api 11 symbol switch deactivates');
const { st, close } = live();

try {
  await waitFor('reconciled', 60000, () => st.reconciled);
  const aq = await quote(st, 'AAPL');
  await waitIdle(st);
  const aaplLv = { entry: r2(aq - 3), stop: r2(aq - 4), target: r2(aq + 1) };
  const r = await activate({ symbol: 'AAPL', qty: 1, ...aaplLv, orderType: 'LMT' });
  if (!r.ok) throw new Error('AAPL activation failed: ' + JSON.stringify(r));
  await waitFor('AAPL working', 10000, () => st.bracket && st.bracket!.symbol === 'AAPL' && st.bracket!.state === 'working');
  const aaplIds = [st.bracket!.parent.orderId, st.bracket!.stopLeg.orderId, st.bracket!.targetLeg.orderId];
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
