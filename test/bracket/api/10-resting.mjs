import { makeSuite, live, waitFor, api, quote, r2 } from '../../suite.mjs';

const { pass, fail, summary } = makeSuite('api 10 resting');
const { st, close } = live();

try {
  await waitFor('reconciled', 60000, () => st.reconciled);
  const q2 = await quote(st, 'SPY');
  const restLv = { entry: r2(q2 - 3), stop: r2(q2 - 4), target: r2(q2 + 1) };
  const r = await api('/api/bracket/activate', { symbol: 'SPY', qty: 1, ...restLv, orderType: 'LMT' });
  if (!r.ok) throw new Error('resting activation failed: ' + JSON.stringify(r));
  await waitFor('resting bracket for restart', 10000, () => st.bracket && st.bracket.state === 'working');
  console.log(`RESTING SPY parent=${st.bracket.parent.orderId} stop=${st.bracket.stop} target=${st.bracket.target}`);
  pass('resting bracket left activated for restart scenario');
} catch (e) {
  fail('suite aborted', String(e));
} finally {
  close();
}
summary();
