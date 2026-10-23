import { makeSuite } from '../util/suite';
import { guiPage, snap } from '../util/web';

const { pass, fail, summary } = makeSuite('web-ui 11 forming data refreshes per tick');
const { browser, page } = await guiPage('SPY');

try {
  await page.click('#ch-tf .tc-size-btn[data-tf="1m"]');
  await page.waitForTimeout(3000);
  const vwap = () => page.$eval('#ch-ind-vwap', (el) => el.textContent ?? '');
  const first = await vwap();
  if (first.length > 0) pass('vwap renders on the 1m timeframe');
  else fail('vwap renders on the 1m timeframe', 'empty after switching to 1m');

  const before = await vwap();
  let changed = false;
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if ((await vwap()) !== before) { changed = true; break; }
    await page.waitForTimeout(200);
  }
  if (changed) pass('indicator values refresh at tick cadence');
  else fail('indicator values refresh at tick cadence', `stale value "${before}" for 8s`);

  await snap(page, import.meta.url, 'forming');
  pass('chart screenshot recorded as evidence');
} catch (e) {
  await snap(page, import.meta.url, 'aborted');
  fail('suite aborted', String(e));
} finally {
  await browser.close();
}
summary();
