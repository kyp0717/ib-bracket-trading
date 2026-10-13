
import { chromium } from '/home/phage/.nvm/versions/node/v24.18.0/lib/node_modules/playwright/index.mjs';
import { EventSource } from '../bracket/sse.mjs';

const APP = process.env.E2E_APP_ADDR || 'http://127.0.0.1:8080';
const SYMBOL = 'SPY';
let failures = 0;

function pass(name) { console.log('PASS ' + name); }
function fail(name, why) { console.log('FAIL ' + name + ': ' + why); failures++; }

async function api(path, body) {
  const r = await fetch(APP + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.json();
}

async function waitFor(what, timeoutMs, cond) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await cond()) return;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('timed out waiting for ' + what);
}

const st = { book: null };
const onmsg = (e) => {
  const m = JSON.parse(e.data);
  if (m.t === 'depth') st.book = m.book;
};
const es = new EventSource(APP + '/events');
es.onmessage = onmsg;
const mkt = new EventSource(APP + '/market');
mkt.onmessage = onmsg;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
page.on('pageerror', (e) => console.log('PAGEERR ' + e.message));

try {
  await page.goto(APP + '/');
  await page.waitForTimeout(1500);
  await page.fill('#ch-input', SYMBOL);
  await page.click('#ch-switch-btn');

  await waitFor('depth rows in the DOM', 20000, async () =>
    (await page.$$('#ch-depth .tc-depth-row')).length > 0);
  await waitFor('depth payload', 20000, () => st.book && st.book.bids.length > 0);
  pass('depth grid populates after symbol load');

  const header = await page.$$eval('#ch-depth .tc-depth-hdr .tc-depth-cell', (els) =>
    els.map((el) => el.textContent.trim()));
  if (header.join(' ') === 'MM SIZE BID ASK SIZE MM') pass('depth header renders MM SIZE BID ASK SIZE MM');
  else fail('depth header renders MM SIZE BID ASK SIZE MM', header.join(' '));

  const domRows = await page.$$eval('#ch-depth .tc-depth-row', (rows) =>
    rows.map((r) => {
      const cells = [...r.querySelectorAll('.tc-depth-cell')];
      return {
        cells: cells.length,
        bidPx: cells[2] ? cells[2].textContent.trim() : '',
        askPx: cells[3] ? cells[3].textContent.trim() : '',
      };
    }));
  const levels = Math.max(st.book.bids.length, st.book.asks.length);
  if (domRows.length === levels) pass(`row count matches payload (${levels} levels)`);
  else fail(`row count matches payload (${levels} levels)`, `dom=${domRows.length}`);
  if (domRows.every((r) => r.cells === 6)) pass('every depth row has six cells');
  else fail('every depth row has six cells', JSON.stringify(domRows.slice(0, 3)));

  const payloadBids = new Set(st.book.bids.map((r) => r.price.toFixed(2)));
  const renderedBids = domRows.map((r) => r.bidPx).filter((t) => t !== '');
  if (renderedBids.length > 0 && renderedBids.every((p) => payloadBids.has(p))) {
    pass('rendered bid prices match the SSE payload');
  } else {
    fail('rendered bid prices match the SSE payload', JSON.stringify(renderedBids.slice(0, 5)));
  }

  const colored = await page.$$eval('#ch-depth .tc-depth-row', (rows) =>
    rows.slice(0, 5).map((r) => {
      const c = r.querySelector('.bid-px');
      return c ? c.style.color : '';
    }));
  if (colored.length > 0 && colored.every((c) => c !== '')) pass('depth price cells carry tier colors');
  else fail('depth price cells carry tier colors', JSON.stringify(colored));

  
  
  const mmCells = await page.$$eval('#ch-depth .tc-depth-row .bid-mm, #ch-depth .tc-depth-row .ask-mm', (els) =>
    els.length);
  if (mmCells === domRows.length * 2) pass('MM cells exist for every row');
  else fail('MM cells exist for every row', `mm=${mmCells} rows=${domRows.length}`);

  const before = await page.$$eval('#ch-depth .tc-depth-row .bid-px', (els) =>
    els.map((el) => el.textContent.trim()).filter((t) => t !== '').slice(0, 3));
  await page.fill('#ch-input', 'QQQ');
  await page.click('#ch-switch-btn');
  await waitFor('depth refresh after switch', 20000, async () => {
    const now = await page.$$eval('#ch-depth .tc-depth-row .bid-px', (els) =>
      els.map((el) => el.textContent.trim()).filter((t) => t !== '').slice(0, 3));
    return now.length > 0 && JSON.stringify(now) !== JSON.stringify(before);
  });
  pass('depth grid refreshes on symbol switch');
} catch (e) {
  fail('suite aborted', String(e));
} finally {
  es.close();
  mkt.close();
  await browser.close();
}

console.log(failures === 0 ? 'depth playwright suite: all pass' : `depth playwright suite: ${failures} failures`);
process.exit(failures === 0 ? 0 : 1);
