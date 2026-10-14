import { makeSuite, live, waitFor, waitIdle, deactivate, flatten, flattenUntilFlat } from '../util/suite';

const { pass, fail, summary } = makeSuite('api 09 deactivate filled');
const { st, close } = live();

try {
  await waitFor('filled bracket from previous scenario', 15000, () => st.bracket && st.bracket!.state !== 'closed' && st.bracket!.entryLocked);

  const r = await deactivate('scenario 9');
  if (!r.ok && /flatten first/.test(r.error || '')) {
    pass('deactivate while filled and open refused with flatten pointer');
  } else {
    fail('deactivate while filled and open refused with flatten pointer', JSON.stringify(r));
  }
  const kept = st.bracket && st.bracket!.state !== 'closed' &&
    !['Cancelled', 'Inactive', 'ApiCancelled', 'Filled'].includes(st.bracket!.stopLeg.status) &&
    !['Cancelled', 'Inactive', 'ApiCancelled', 'Filled'].includes(st.bracket!.targetLeg.status);
  if (kept) pass('children untouched after refused deactivate');
  else fail('children untouched after refused deactivate', JSON.stringify(st.bracket));

  const r2 = await flatten('SPY');
  if (r2.ok) pass('flatten accepted');
  else fail('flatten accepted', JSON.stringify(r2));

  if (await flattenUntilFlat('SPY')) pass('broker position flat after flatten');
  else fail('broker position flat after flatten', 'position still open after 90s of repricing');

  const r3 = await deactivate('scenario 9 flat');
  if (r3.ok) pass('deactivate accepted once flat');
  else fail('deactivate accepted once flat', JSON.stringify(r3));
  await waitFor('children cancelled', 20000, () => {
    const b = st.bracket;
    const dead = (s: string) => s === 'Cancelled' || s === 'Inactive' || s === 'ApiCancelled';
    return b && dead(b.stopLeg.status) && dead(b.targetLeg.status);
  });
  pass('live children cancelled after flat deactivate');
  await waitIdle(st);
} catch (e) {
  fail('suite aborted', String(e));
} finally {
  close();
}
summary();
