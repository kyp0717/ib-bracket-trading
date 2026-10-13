import { makeSuite, live, waitFor, quote, waitAcked, r2, setLevels } from '../../suite';

const { pass, fail, summary } = makeSuite('api 03 cancel-replace');
const { st, close } = live();

try {
  await waitFor('working bracket from previous scenario', 15000, () => st.bracket && st.bracket!.state === 'working');
  const first = { parent: st.bracket!.parent.orderId, stop: st.bracket!.stopLeg.orderId, target: st.bracket!.targetLeg.orderId };
  const lv2 = { stop: r2(st.bracket!.stop - 0.5), target: r2(st.bracket!.target + 0.5) };
  const r = await setLevels({ stop: lv2.stop, target: lv2.target });
  if (r.ok) pass('level move while working accepted');
  else fail('level move while working accepted', JSON.stringify(r));
  await waitFor('replaced bracket', 10000, () => st.bracket && st.bracket!.state === 'working' && st.bracket!.parent.orderId !== first.parent);
  await waitAcked([first.parent, first.stop, first.target]);
  pass('old generation cancel-acked at the gateway');
  if (st.bracket!.stop === lv2.stop && st.bracket!.target === lv2.target) pass('new levels live on the replacement');
  else fail('new levels live on the replacement', JSON.stringify({ stop: st.bracket!.stop, target: st.bracket!.target }));
} catch (e) {
  fail('suite aborted', String(e));
} finally {
  close();
}
summary();
