import { makeSuite, live, waitFor, waitIdle, deactivate, flatten } from '../../suite';

const { pass, fail, summary } = makeSuite('api 09 deactivate filled');
const { st, close } = live();

try {
  await waitFor('filled bracket from previous scenario', 15000, () => st.bracket && st.bracket!.state !== 'closed' && st.bracket!.entryLocked);
  const r = await deactivate('scenario 6');
  if (r.ok) pass('deactivate while filled accepted');
  else fail('deactivate while filled accepted', JSON.stringify(r));
  await waitFor('children cancelled', 20000, () => {
    const b = st.bracket;
    const dead = (s: string) => s === 'Cancelled' || s === 'Inactive' || s === 'ApiCancelled';
    return b && dead(b.stopLeg.status) && dead(b.targetLeg.status);
  });
  pass('live children cancelled after deactivate');
  await waitIdle(st);
  const r2 = await flatten('SPY');
  if (r2.ok) pass('flatten closes the naked entry position');
  else fail('flatten closes the naked entry position', JSON.stringify(r2));
  await waitIdle(st);
} catch (e) {
  fail('suite aborted', String(e));
} finally {
  close();
}
summary();
