import { makeSuite, live, waitFor, waitAcked, r2, setLevels } from '../util/suite';

const { pass, fail, summary } = makeSuite('api 04 exit leg change');
const { st, close } = live();

try {
  await waitFor('working bracket from previous scenario', 15000, () => st.bracket && st.bracket!.state === 'working');
  const first = { parent: st.bracket!.parent.orderId, stop: st.bracket!.stopLeg.orderId, target: st.bracket!.targetLeg.orderId };
  const keepStop = st.bracket!.stop;
  const lv = { target: r2(st.bracket!.target + 0.5) };
  const r = await setLevels(lv);
  if (r.ok) pass('target move while working accepted');
  else fail('target move while working accepted', JSON.stringify(r));
  await waitFor('replaced bracket', 10000, () => st.bracket && st.bracket!.state === 'working' && st.bracket!.parent.orderId !== first.parent);
  await waitAcked([first.parent, first.stop, first.target]);
  pass('old generation cancel-acked at the gateway');
  if (st.bracket!.target === lv.target) pass('new target live on the replacement');
  else fail('new target live on the replacement', JSON.stringify({ target: st.bracket!.target }));
  if (st.bracket!.stop === keepStop) pass('untouched stop carried over');
  else fail('untouched stop carried over', JSON.stringify({ stop: st.bracket!.stop }));
} catch (e) {
  fail('suite aborted', String(e));
} finally {
  close();
}
summary();
