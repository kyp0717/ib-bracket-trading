import { makeSuite, live, waitFor, quote, waitIdle, r2, activate, deactivate } from '../../util/suite';

const { pass, fail, summary } = makeSuite('api 10 cross symbol');
const { st, close } = live();

try {
  await waitFor('reconciled', 60000, () => st.reconciled);
  const aq = await quote(st, 'AAPL');
  await waitIdle(st);
  const aaplLv = { entry: r2(aq - 3), stop: r2(aq - 4), target: r2(aq + 1) };
  const r = await activate({ symbol: 'AAPL', qty: 1, ...aaplLv, orderType: 'LMT' });
  if (!r.ok) throw new Error('AAPL activation failed: ' + JSON.stringify(r));
  await waitFor('AAPL working', 10000, () => st.bracket && st.bracket!.symbol === 'AAPL' && st.bracket!.state === 'working');
  const parentId = st.bracket!.parent.orderId;
  const r2r = await activate({ symbol: 'SPY', qty: 1, ...aaplLv, orderType: 'LMT' });
  if (!r2r.ok && /already working/.test(r2r.error || '')) {
    pass('activation for another symbol refused while working');
  } else {
    fail('activation for another symbol refused while working', JSON.stringify(r2r));
  }
  if (st.bracket!.symbol === 'AAPL' && st.bracket!.parent.orderId === parentId) pass('exactly one bracket on the book across symbols');
  else fail('exactly one bracket on the book across symbols', JSON.stringify(st.bracket));
  await deactivate('cross symbol cleanup');
  await waitIdle(st);
} catch (e) {
  fail('suite aborted', String(e));
} finally {
  close();
}
summary();
