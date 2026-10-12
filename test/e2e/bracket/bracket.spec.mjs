// GUI layer of the bracket validation suite. Assumes the app is
// running against a paper IB API endpoint (4001 IB Gateway or 7497
// TWS) with a flat book. Covers what only the browser can prove: the
// confirm modal, the locked-entry drag feedback, and the LOCKED entry
// row.

import { chromium } from '/home/phage/.nvm/versions/node/v24.18.0/lib/node_modules/playwright/index.mjs';
import { EventSource } from './sse.mjs';

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

const st = { reconciled: false, cancelInFlight: false, bracket: null };
const es = new EventSource(APP + '/events');
es.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.t === 'conn') st.reconciled = !!m.reconciled;
  if (m.t === 'bracket') {
    st.cancelInFlight = !!m.bracket._pending;
    st.bracket = m.bracket.current;
  }
};
const br = () => st.bracket;
async function waitIdle(ms = 15000) {
  // observe the pending state first, then its clearing. Guards
  // against reading a stale pre-cancel snapshot and returning early.
  await waitFor('cancels registered', 5000, () => st.cancelInFlight).catch(() => {});
  await waitFor('cancels settled', ms, () => !st.cancelInFlight);
}
const r2 = (x) => Math.round(x * 100) / 100;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
page.on('dialog', (d) => d.accept());
page.on('pageerror', (e) => console.log('PAGEERR ' + e.message));

try {
  await waitFor('reconciled', 60000, () => st.reconciled);
  await api('/api/bracket/deactivate', { reason: 'spec cleanup' }).catch(() => {});
  await waitIdle().catch(() => {});

  await page.goto(APP + '/');
  await page.waitForTimeout(1500);
  await page.fill('#ch-input', SYMBOL);
  await page.click('#ch-switch-btn');
  await waitFor('tape quote', 15000, async () => {
    const q = await api('/api/quote');
    return q && q.symbol === SYMBOL && q.price > 0;
  });
  // page-side readiness: the entry handle must be placed before the
  // arm click, otherwise the toggle sees no levels and no modal opens
  await page.waitForFunction(() => {
    const row = document.querySelector('#ch-col .tc-hnd');
    return row && row.style.display === 'flex';
  }, null, { timeout: 20000 });

  // Confirm modal: cancel places nothing, confirm places one.
  await page.click('#ch-arm');
  await page.waitForSelector('#modal', { state: 'visible' });
  await page.click('#confirmNo');
  await page.waitForTimeout(800);
  if (!br() || br().state !== 'working') {
    pass('activate cancel in the modal places nothing');
  } else {
    fail('activate cancel in the modal places nothing', 'bracket is working after cancel');
  }

  await page.click('#ch-arm');
  await page.waitForSelector('#modal', { state: 'visible' });
  await page.click('#confirmYes');
  await waitFor('working bracket', 10000, () => br() && br().state === 'working');
  pass('confirm modal places a working bracket');

  await page.click('#ch-arm');
  await waitFor('closed bracket', 15000, () => br() && br().state === 'closed');
  pass('deactivate button cancels the bracket');
  await waitIdle();

  // Fill a bracket, then try to drag the entry line.
  const q = (await api('/api/quote')).price;
  const entry = r2(q + 0.02);
  const r = await api('/api/bracket/activate', {
    symbol: SYMBOL, qty: 1, entry, stop: r2(entry - 2), target: r2(entry + 2), orderType: 'LMT',
  });
  if (!r.ok) throw new Error('fill activation failed: ' + JSON.stringify(r));
  await waitFor('entry locked', 60000, () => br() && br().entryLocked);
  await page.waitForFunction(
    () => document.getElementById('ch-col').textContent.includes('LOCKED'),
    null, { timeout: 15000 },
  );
  await page.waitForTimeout(500);

  const colText = await page.$eval('#ch-col', (el) => el.textContent);
  if (colText.includes('LOCKED')) {
    pass('entry row renders LOCKED after fill');
  } else {
    fail('entry row renders LOCKED after fill', colText);
  }

  // Drag the entry handle down. The pointerdown must be rejected and
  // the level must not move.
  const box = await page.$eval('#ch-col .tc-hnd', (el) => {
    const b = el.getBoundingClientRect();
    return { x: b.x, y: b.y, width: b.width, height: b.height };
  });
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx, cy + 40, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(600);
  const fb = await page.$eval('#ch-feedback', (el) => el.textContent);
  if (fb.includes('entry locked')) {
    pass('entry drag rejected with feedback after fill');
  } else {
    fail('entry drag rejected with feedback after fill', 'feedback=' + fb);
  }
  if (br() && br().entry === entry) {
    pass('server entry unchanged after locked drag');
  } else {
    fail('server entry unchanged after locked drag', JSON.stringify(br() && br().entry));
  }

  await api('/api/bracket/deactivate', { reason: 'spec cleanup' });
  await waitIdle();
  await api('/api/bracket/flatten', { symbol: SYMBOL });
} catch (e) {
  fail('suite aborted', String(e));
} finally {
  es.close();
  await browser.close();
}

console.log(failures === 0 ? 'playwright suite: all pass' : `playwright suite: ${failures} failures`);
process.exit(failures === 0 ? 0 : 1);
