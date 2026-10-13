import { makeSuite, live, waitIdle, deactivate } from '../../suite';
import { guiPage, snap } from '../../web';

const { pass, fail, summary } = makeSuite('web 01 modal cancel');
const { st, close } = live();
const { browser, page } = await guiPage('SPY');

try {
  await deactivate('cleanup').catch(() => {});
  await waitIdle(st).catch(() => {});
  await page.click('#ch-arm');
  await page.waitForSelector('#modal', { state: 'visible' });
  await page.click('#confirmNo');
  await page.waitForTimeout(800);
  if (!st.bracket || st.bracket!.state !== 'working') {
    pass('activate cancel in the modal places nothing');
  } else {
    fail('activate cancel in the modal places nothing', 'bracket is working after cancel');
    await snap(page, import.meta.url, 'modal-cancel');
  }
} catch (e) {
  await snap(page, import.meta.url, 'aborted');
  fail('suite aborted', String(e));
} finally {
  close();
  await browser.close();
}
summary();
