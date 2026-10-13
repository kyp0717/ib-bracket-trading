import { makeSuite, live, waitFor } from '../../suite.mjs';
import { guiPage, snap } from '../../web.mjs';

const { pass, fail, summary } = makeSuite('web 01 grid populates');
const { st, close } = live();
const { browser, page } = await guiPage('SPY');

try {
  await waitFor('depth rows in the DOM', 20000, async () =>
    (await page.$$('#ch-depth .tc-depth-row')).length > 0);
  await waitFor('depth payload', 20000, () => st.depth && st.depth.bids.length > 0);
  pass('depth grid populates after symbol load');

  const header = await page.$$eval('#ch-depth .tc-depth-hdr .tc-depth-cell', (els) =>
    els.map((el) => el.textContent.trim()));
  if (header.join(' ') === 'MM SIZE BID ASK SIZE MM') pass('depth header renders MM SIZE BID ASK SIZE MM');
  else fail('depth header renders MM SIZE BID ASK SIZE MM', header.join(' '));

  const domRows = await page.$$eval('#ch-depth .tc-depth-row', (rows) =>
    rows.map((r) => [...r.querySelectorAll('.tc-depth-cell')].length));
  const levels = Math.max(st.depth.bids.length, st.depth.asks.length);
  if (domRows.length === levels) pass(`row count matches payload (${levels} levels)`);
  else fail(`row count matches payload (${levels} levels)`, `dom=${domRows.length}`);
  if (domRows.every((n) => n === 6)) pass('every depth row has six cells');
  else fail('every depth row has six cells', JSON.stringify(domRows.slice(0, 3)));
} catch (e) {
  await snap(page, import.meta.url, 'aborted');
  fail('suite aborted', String(e));
} finally {
  close();
  await browser.close();
}
summary();
