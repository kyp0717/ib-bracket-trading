import { makeSuite, waitFor, getStatus } from '../util/suite';
import { guiPage, snap } from '../util/web';

const { pass, fail, summary } = makeSuite('interface 12 conn pill identity');
const { browser, page } = await guiPage('SPY');

try {
  const status = await getStatus();
  const pill = await page.waitForFunction(() => {
    const el = document.getElementById('conn-text');
    return el && /^(IBGW|TWS) \d+ (PAPER|LIVE) id \d+/.test(el.textContent ?? '')
      ? el.textContent
      : false;
  }, null, { timeout: 15000 }).then((h) => h.jsonValue() as Promise<string>);

  const want = status.label;

  if (pill.startsWith(want)) pass(`pill reads "${want}"`);
  else fail(`pill reads "${want}"`, 'pill="' + pill + '"');

  if (!/\d+\.\d+\.\d+\.\d+/.test(pill)) pass('pill shows no ip address');
  else fail('pill shows no ip address', 'pill="' + pill + '"');

  await snap(page, import.meta.url, 'conn-pill');
} catch (e) {
  fail('suite aborted', String(e));
  await snap(page, import.meta.url, 'aborted');
} finally {
  await browser.close();
}
summary();
