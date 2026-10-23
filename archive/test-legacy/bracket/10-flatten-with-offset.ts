import { makeSuite, live, waitFor, waitIdle, quote, r2, activate, deactivate, flatten, getQuote, getStatus, auditLines } from '../util/suite';

const { pass, fail, summary } = makeSuite('api 10 flatten with offset');
const { st, close } = live();

try {
  await waitFor('reconciled', 60000, () => st.reconciled);
  const q = await quote(st, 'SPY');
  const entry = r2(q + 0.02);
  const lv = { entry, stop: r2(entry - 2), target: r2(entry + 2) };
  const r = await activate({ symbol: 'SPY', qty: 1, ...lv, orderType: 'LMT' });
  if (!r.ok) throw new Error('fill activation failed: ' + JSON.stringify(r));
  await waitFor('entry locked', 60000, () => st.bracket && st.bracket!.entryLocked);
  const last = (await getQuote()).price;

  const f = await flatten('SPY', 0.02);
  if (f.ok) pass('flatten with offset accepted');
  else fail('flatten with offset accepted', JSON.stringify(f));

  const t0 = Date.now();
  let flat = false;
  while (Date.now() - t0 < 90000) {
    if ((await getStatus()).position === 0) { flat = true; break; }
    await flatten('SPY', 0.02);
    await new Promise((r2p) => setTimeout(r2p, 2000));
  }
  if (flat) pass('broker position flat after offset flatten');
  else fail('broker position flat after offset flatten', 'position still open after 90s');

  const lines = await auditLines();
  const fl = lines.filter((l) => l.includes('| flatten |'));
  const m = fl.length ? /(?:bid|ask) (\d+(?:\.\d+)?)/.exec(fl[fl.length - 1]) : null;
  const px = m ? Number(m[1]) : NaN;
  if (Number.isFinite(px) && px <= last) pass('offset flatten priced at or below the last trade');
  else fail('offset flatten priced at or below the last trade', `px=${px} last=${last}`);

  await waitFor('deactivate accepted once flat', 30000, async () => (await deactivate('scenario 10')).ok);
  pass('deactivate accepted once flat');
  await waitIdle(st);
} catch (e) {
  fail('suite aborted', String(e));
} finally {
  close();
}
summary();
