import { makeSuite, live, waitFor, quote, r2, activate, setLevels } from '../../util/suite';

const { pass, fail, summary } = makeSuite('api 07 fill locks entry');
const { st, close } = live();

try {
  await waitFor('reconciled', 60000, () => st.reconciled);
  const q1 = await quote(st, 'SPY');
  const entry = r2(q1 + 0.02);
  const fillLv = { entry, stop: r2(entry - 2), target: r2(entry + 2) };
  const r = await activate({ symbol: 'SPY', qty: 1, ...fillLv, orderType: 'LMT' });
  if (!r.ok) throw new Error('fill activation failed: ' + JSON.stringify(r));
  await waitFor('entry fill', 60000, () => st.bracket && st.bracket!.entryLocked);
  pass('entry filled, entryLocked set');
  const r2r = await setLevels({ entry: r2(entry + 1), stop: fillLv.stop, target: fillLv.target });
  if (!r2r.ok && /entry locked/.test(r2r.error || '')) {
    pass('entry change after fill refused');
  } else {
    fail('entry change after fill refused', JSON.stringify(r2r));
  }
} catch (e) {
  fail('suite aborted', String(e));
} finally {
  close();
}
summary();
