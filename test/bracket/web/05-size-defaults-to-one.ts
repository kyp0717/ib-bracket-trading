import { makeSuite } from '../../suite';
import { guiPage } from '../../web';

const { pass, fail, summary } = makeSuite('web 05 size defaults to one');
const { browser, page } = await guiPage('SPY');

try {
  const active = await page.$eval('#ch-size .tc-size-btn.active', (el) => (el as HTMLElement).dataset.qty);
  if (active === '1') pass('size 1 selected on fresh load');
  else fail('size 1 selected on fresh load', 'active=' + active);
} catch (e) {
  fail('suite aborted', String(e));
} finally {
  await browser.close();
}
summary();
