import { makeSuite, live, waitFor, api, quote, r2 } from '../../suite.mjs';

const { pass, fail, summary } = makeSuite('api 05 fill locks entry');
const { st, close } = live();

try {
  await waitFor('reconciled', 60000, () => st.reconciled);
  const q1 = await quote(st, 'SPY');
  const entry = r2(q1 + 0.02);
  const fillLv = { entry, stop: r2(entry - 2), target: r2(entry + 2) };
  const r = await api('/api/bracket/activate', { symbol: 'SPY', qty: 1, ...fillLv, orderType: 'LMT' });
  if (!r.ok) throw new Error('fill activation failed: ' + JSON.stringify(r));
  await waitFor('entry fill', 60000, () => st.bracket && st.bracket.entryLocked);
  pass('entry filled, entryLocked set');
  const ids = { stop: st.bracket.stopLeg.orderId, target: st.bracket.targetLeg.orderId };
  const r2r = await api('/api/bracket/levels', { entry: r2(entry + 1), stop: fillLv.stop, target: fillLv.target });
  if (!r2r.ok && /entry locked/.test(r2r.error || '')) {
    pass('entry change after fill refused');
  } else {
    fail('entry change after fill refused', JSON.stringify(r2r));
  }
  const newStop = r2(entry - 3), newTarget = r2(entry + 3);
  const r3 = await api('/api/bracket/levels', { stop: newStop, target: newTarget });
  if (r3.ok) pass('stop and target move after fill accepted');
  else fail('stop and target move after fill accepted', JSON.stringify(r3));
  await waitFor('in-place modify', 10000, () =>
    st.bracket && st.bracket.stop === newStop && st.bracket.target === newTarget &&
    st.bracket.stopLeg.orderId === ids.stop && st.bracket.targetLeg.orderId === ids.target);
  pass('children modified in place on the same order IDs');
} catch (e) {
  fail('suite aborted', String(e));
} finally {
  close();
}
summary();
