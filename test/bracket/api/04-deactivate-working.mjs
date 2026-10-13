import { makeSuite, live, waitFor, api, waitAcked, waitIdle } from '../../suite.mjs';

const { pass, fail, summary } = makeSuite('api 04 deactivate working');
const { st, close } = live();

try {
  await waitFor('working bracket from previous scenario', 15000, () => st.bracket && st.bracket.state === 'working');
  const ids = [st.bracket.parent.orderId, st.bracket.stopLeg.orderId, st.bracket.targetLeg.orderId];
  const r = await api('/api/bracket/deactivate', { reason: 'scenario 4' });
  if (r.ok) pass('deactivate while working accepted');
  else fail('deactivate while working accepted', JSON.stringify(r));
  await waitAcked(ids);
  pass('all three legs cancel-acked at the gateway');
  await waitIdle(st);
} catch (e) {
  fail('suite aborted', String(e));
} finally {
  close();
}
summary();
