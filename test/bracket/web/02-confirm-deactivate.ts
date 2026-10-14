import { makeSuite, live, waitFor, waitIdle, deactivate } from '../../util/suite';
import { guiPage, snap } from '../../util/web';

const { pass, fail, summary } = makeSuite('web 02 confirm and deactivate');
const { st, close } = live();
const { browser, page } = await guiPage('SPY');

try {
  await deactivate('cleanup').catch(() => {});
  await waitIdle(st).catch(() => {});
  await page.click('#ch-arm');
  await page.waitForSelector('#modal', { state: 'visible' });
  await page.click('#confirmYes');
  await waitFor('working bracket', 10000, () => st.bracket && st.bracket!.state === 'working');
  pass('confirm modal places a working bracket');

  await page.click('#ch-arm');
  await waitFor('closed bracket', 15000, () => st.bracket && st.bracket!.state === 'closed');
  pass('deactivate button cancels the bracket');
  await waitIdle(st);
} catch (e) {
  await snap(page, import.meta.url, 'aborted');
  fail('suite aborted', String(e));
} finally {
  close();
  await browser.close();
}
summary();
