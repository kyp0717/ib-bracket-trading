import { makeSuite, live, waitFor, waitAcked, r2, setLevels } from '../util/suite';

const { pass, fail, summary } = makeSuite('api 03 stoploss change');
const { st, close } = live();

try {
  await waitFor('working bracket from previous scenario', 15000, () => st.bracket && st.bracket!.state === 'working');
  const first = { parent: st.bracket!.parent.orderId, stop: st.bracket!.stopLeg.orderId, target: st.bracket!.targetLeg.orderId };
  const keepTarget = st.bracket!.target;
  const lv = { stop: r2(st.bracket!.stop - 0.5) };
  const r = await setLevels(lv);
  if (r.ok) pass('stop move while working accepted');
  else fail('stop move while working accepted', JSON.stringify(r));
  await waitFor('replaced bracket', 10000, () => st.bracket && st.bracket!.state === 'working' && st.bracket!.parent.orderId !== first.parent);
  await waitAcked([first.parent, first.stop, first.target]);
  pass('old generation cancel-acked at the gateway');
  if (st.bracket!.stop === lv.stop) pass('new stop live on the replacement');
  else fail('new stop live on the replacement', JSON.stringify({ stop: st.bracket!.stop }));
  if (st.bracket!.target === keepTarget) pass('untouched target carried over');
  else fail('untouched target carried over', JSON.stringify({ target: st.bracket!.target }));
} catch (e) {
  fail('suite aborted', String(e));
} finally {
  close();
}
summary();
