import { makeSuite, live, waitFor } from '../../util/suite';
import { guiPage, snap } from '../../util/web';

const { pass, fail, summary } = makeSuite('web 03 grid refresh');
const { st, close } = live();
const { browser, page } = await guiPage('SPY');

try {
  await waitFor('depth rows in the DOM', 20000, async () =>
    (await page.$$('#ch-depth .tc-depth-row')).length > 0);
  const before = await page.$$eval('#ch-depth .tc-depth-row .bid-px', (els) =>
    els.map((el) => el.textContent!.trim()).filter((t) => t !== '').slice(0, 3));
  await page.fill('#ch-input', 'QQQ');
  await page.click('#ch-switch-btn');
  await waitFor('depth refresh after switch', 20000, async () => {
    const now = await page.$$eval('#ch-depth .tc-depth-row .bid-px', (els) =>
      els.map((el) => el.textContent!.trim()).filter((t) => t !== '').slice(0, 3));
    return now.length > 0 && JSON.stringify(now) !== JSON.stringify(before);
  });
  pass('depth grid refreshes on symbol switch');
} catch (e) {
  await snap(page, import.meta.url, 'aborted');
  fail('suite aborted', String(e));
} finally {
  close();
  await browser.close();
}
summary();
