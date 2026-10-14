import { makeSuite, live, waitFor, waitIdle, quote, r2, activate, deactivate, flatten } from '../../suite';
import { guiPage, snap } from '../../web';

const { pass, fail, summary } = makeSuite('web 04 reload keeps children');
const { st, close } = live();
const { browser, page } = await guiPage('SPY');

try {
  const q = await quote(st, 'SPY');
  const entry = r2(q + 0.02);
  const r = await activate({
    symbol: 'SPY', qty: 1, entry, stop: r2(entry - 2), target: r2(entry + 2), orderType: 'LMT',
  });
  if (!r.ok) throw new Error('fill activation failed: ' + JSON.stringify(r));
  await waitFor('entry locked', 60000, () => st.bracket && st.bracket!.entryLocked);

  await page.reload();
  await page.waitForTimeout(2000);

  await page.waitForFunction(() => {
    return document.getElementById('ch-col')!.textContent!.includes('LOCKED');
  }, null, { timeout: 20000 });
  pass('bracket still rendered LOCKED after reload');

  const b = st.bracket;
  const dead = (s: string) => ['Cancelled', 'Inactive', 'ApiCancelled', 'Filled'].includes(s);
  if (b && b.state !== 'closed' && !dead(b.stopLeg.status) && !dead(b.targetLeg.status)) {
    pass('stop and target still live after reload');
  } else {
    fail('stop and target still live after reload', JSON.stringify(b));
    await snap(page, import.meta.url, 'children-dead');
  }

  await flatten('SPY');
  await waitFor('deactivate accepted after flatten', 60000, async () => (await deactivate('cleanup')).ok);
  await waitIdle(st);
} catch (e) {
  await snap(page, import.meta.url, 'aborted');
  fail('suite aborted', String(e));
} finally {
  close();
  await browser.close();
}
summary();
