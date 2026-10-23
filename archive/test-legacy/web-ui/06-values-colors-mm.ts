import { makeSuite, live, waitFor } from '../util/suite';
import { guiPage, snap } from '../util/web';

const { pass, fail, summary } = makeSuite('interface 06 values colors mm');
const { st, close } = live();
const { browser, page } = await guiPage('SPY');

try {
  await waitFor('depth rows in the DOM', 20000, async () =>
    (await page.$$('#ch-depth .tc-depth-row')).length > 0);
  await waitFor('depth payload', 20000, () => st.depth && st.depth!.bids.length > 0);

  const rendered = await page.$$eval('#ch-depth .tc-depth-row', (rows) =>
    rows.map((r) => {
      const c = [...r.querySelectorAll<HTMLElement>('.tc-depth-cell')];
      return { bidPx: c[2] ? c[2].textContent!.trim() : '', color: c[2] ? c[2].style.color : '' };
    }));
  const payloadBids = new Set(st.depth!.bids.map((r) => r.price.toFixed(2)));
  const renderedBids = rendered.map((r) => r.bidPx).filter((t) => t !== '');
  if (renderedBids.length > 0 && renderedBids.every((p) => payloadBids.has(p))) {
    pass('rendered bid prices match the SSE payload');
  } else {
    fail('rendered bid prices match the SSE payload', JSON.stringify(renderedBids.slice(0, 5)));
  }

  const colored = rendered.slice(0, 5).map((r) => r.color);
  if (colored.length > 0 && colored.every((c) => c !== '')) pass('depth price cells carry tier colors');
  else fail('depth price cells carry tier colors', JSON.stringify(colored));

  const mmCells = await page.$$eval('#ch-depth .tc-depth-row .bid-mm, #ch-depth .tc-depth-row .ask-mm', (els) => els.length);
  const rowCount = rendered.length;
  if (mmCells === rowCount * 2) pass('MM cells exist for every row');
  else fail('MM cells exist for every row', `mm=${mmCells} rows=${rowCount}`);

  const mmRendered = await page.$$eval('#ch-depth .tc-depth-row', (rows) =>
    rows.map((r) => {
      const c = [...r.querySelectorAll<HTMLElement>('.tc-depth-cell')];
      return { bid: c[0] ? c[0].textContent!.trim() : '', ask: c[5] ? c[5].textContent!.trim() : '' };
    }));
  const payloadVenues = new Set([...st.depth!.bids.map((r) => r.mm), ...st.depth!.asks.map((r) => r.mm)]);
  const shown = mmRendered.flatMap((r) => [r.bid, r.ask]).filter((t) => t !== '');
  if (shown.length > 0 && shown.every((m) => payloadVenues.has(m))) pass('MM cells render the venue from the payload');
  else fail('MM cells render the venue from the payload', JSON.stringify(shown.slice(0, 6)));
} catch (e) {
  await snap(page, import.meta.url, 'aborted');
  fail('suite aborted', String(e));
} finally {
  close();
  await browser.close();
}
summary();
