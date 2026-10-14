import { makeSuite, live, waitFor, waitAcked, r2, setLevels } from '../../util/suite';

const { pass, fail, summary } = makeSuite('api 05 entry leg change');
const { st, close } = live();

try {
  await waitFor('working bracket from previous scenario', 15000, () => st.bracket && st.bracket!.state === 'working');
  const first = { parent: st.bracket!.parent.orderId, stop: st.bracket!.stopLeg.orderId, target: st.bracket!.targetLeg.orderId };
  const keepStop = st.bracket!.stop;
  const keepTarget = st.bracket!.target;
  const lv = { entry: r2(st.bracket!.entry - 0.5) };
  const r = await setLevels(lv);
  if (r.ok) pass('entry move while working accepted');
  else fail('entry move while working accepted', JSON.stringify(r));
  await waitFor('replaced bracket', 10000, () => st.bracket && st.bracket!.state === 'working' && st.bracket!.parent.orderId !== first.parent);
  await waitAcked([first.parent, first.stop, first.target]);
  pass('old generation cancel-acked at the gateway');
  const b = st.bracket!;
  if (b.parent.orderId !== first.parent && b.stopLeg.orderId !== first.stop && b.targetLeg.orderId !== first.target) {
    pass('all three legs replaced with new ids');
  } else {
    fail('all three legs replaced with new ids', JSON.stringify({ parent: b.parent.orderId, stop: b.stopLeg.orderId, target: b.targetLeg.orderId }));
  }
  if (b.entry === lv.entry) pass('new entry live on the replacement');
  else fail('new entry live on the replacement', JSON.stringify({ entry: b.entry }));
  if (b.stop === keepStop && b.target === keepTarget) pass('untouched stop and target carried over');
  else fail('untouched stop and target carried over', JSON.stringify({ stop: b.stop, target: b.target }));
} catch (e) {
  fail('suite aborted', String(e));
} finally {
  close();
}
summary();
