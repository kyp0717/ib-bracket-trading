import { makeSuite, live, waitFor, r2, setLevels } from '../../util/suite';

const { pass, fail, summary } = makeSuite('api 08 filled modify in place');
const { st, close } = live();

try {
  await waitFor('filled bracket from previous scenario', 15000, () => st.bracket && st.bracket!.state !== 'closed' && st.bracket!.entryLocked);
  const ids = { stop: st.bracket!.stopLeg.orderId, target: st.bracket!.targetLeg.orderId };
  const newStop = r2(st.bracket!.stop - 1), newTarget = r2(st.bracket!.target + 1);
  const r = await setLevels({ stop: newStop, target: newTarget });
  if (r.ok) pass('stop and target move after fill accepted');
  else fail('stop and target move after fill accepted', JSON.stringify(r));
  await waitFor('in-place modify', 10000, () =>
    st.bracket && st.bracket!.stop === newStop && st.bracket!.target === newTarget &&
    st.bracket!.stopLeg.orderId === ids.stop && st.bracket!.targetLeg.orderId === ids.target);
  pass('children modified in place on the same order IDs');
} catch (e) {
  fail('suite aborted', String(e));
} finally {
  close();
}
summary();
