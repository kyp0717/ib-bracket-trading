// GUI layer of the bracket validation suite. Assumes the app is
// running on paper 4002 with a flat book. Covers what only the
// browser can prove: the confirm modal, the locked-entry drag
// feedback, and the LOCKED leg row.

import { chromium } from '/home/phage/.nvm/versions/node/v24.18.0/lib/node_modules/playwright/index.mjs';

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

const st = { reconciled: false, pending: [], brackets: {} };
const es = new EventSource(APP + '/events');
es.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.t === 'conn') st.reconciled = !!m.reconciled;
  if (m.t === 'bracket') {
    st.pending = m.bracket._pending || [];
    st.brackets = m.bracket;
  }
};
const br = (sym = SYMBOL) => st.brackets[sym];
async function waitIdle(sym, ms = 15000) {
  await waitFor(`cancels settled for ${sym}`, ms, () => !st.pending.includes(sym));
}
const r2 = (x) => Math.round(x * 100) / 100;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
page.on('dialog', (d) => d.accept());

try {
  await waitFor('reconciled', 60000, () => st.reconciled);
  await api('/api/disarm', { symbol: SYMBOL, reason: 'spec cleanup' }).catch(() => {});
  await waitIdle(SYMBOL).catch(() => {});

  await page.goto(APP + '/');
  await page.waitForTimeout(1500);
  await page.fill('#symbol', SYMBOL);
  await page.click('#go');
  await waitFor('tape quote', 15000, async () => {
    const q = await api('/api/quote');
    return q && q.symbol === SYMBOL && q.price > 0;
  });

  // Confirm modal: cancel places nothing, confirm places one.
  await page.click('#arm');
  await page.waitForSelector('#modal', { state: 'visible' });
  await page.click('#confirmNo');
  await page.waitForTimeout(800);
  if (!br() || br().state !== 'working') {
    pass('arm cancel in the modal places nothing');
  } else {
    fail('arm cancel in the modal places nothing', 'bracket is working after cancel');
  }

  await page.click('#arm');
  await page.waitForSelector('#modal', { state: 'visible' });
  await page.click('#confirmYes');
  await waitFor('working bracket', 10000, () => br() && br().state === 'working');
  pass('confirm modal places a working bracket');

  await page.click('#disarm');
  await waitFor('closed bracket', 15000, () => br() && br().state === 'closed');
  pass('disarm button cancels the bracket');
  await waitIdle(SYMBOL);

  // Fill a bracket, then try to drag the entry line.
  const q = (await api('/api/quote')).price;
  const entry = r2(q + 0.02);
  const r = await api('/api/arm', {
    symbol: SYMBOL, qty: 1, entry, stop: r2(entry - 2), target: r2(entry + 2), orderType: 'LMT',
  });
  if (!r.ok) throw new Error('fill arm failed: ' + JSON.stringify(r));
  await waitFor('entry locked', 30000, () => br() && br().entryLocked);
  await page.waitForTimeout(1500);

  const legsText = await page.$eval('#legs', (el) => el.textContent);
  if (legsText.includes('LOCKED')) {
    pass('entry row renders LOCKED after fill');
  } else {
    fail('entry row renders LOCKED after fill', legsText);
  }

  const y = await page.evaluate((p) => window.__priceToY(p), entry);
  const box = await page.$eval('#dragOverlay', (el) => {
    const b = el.getBoundingClientRect();
    return { x: b.x, y: b.y, width: b.width };
  });
  if (y == null) {
    fail('entry drag rejected with feedback after fill', 'entry line off screen');
  } else {
    const cx = box.x + box.width / 2;
    const cy = box.y + y;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx, cy + 40, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(600);
    const note = await page.$eval('#note', (el) => el.textContent);
    if (note.includes('entry locked')) {
      pass('entry drag rejected with feedback after fill');
    } else {
      fail('entry drag rejected with feedback after fill', 'note=' + note);
    }
  }
  if (br() && br().entry === entry) {
    pass('server entry unchanged after locked drag');
  } else {
    fail('server entry unchanged after locked drag', JSON.stringify(br() && br().entry));
  }

  await api('/api/disarm', { symbol: SYMBOL, reason: 'spec cleanup' });
  await waitIdle(SYMBOL);
  await api('/api/flatten', { symbol: SYMBOL });
} catch (e) {
  fail('suite aborted', String(e));
} finally {
  es.close();
  await browser.close();
}

console.log(failures === 0 ? 'playwright suite: all pass' : `playwright suite: ${failures} failures`);
process.exit(failures === 0 ? 0 : 1);
