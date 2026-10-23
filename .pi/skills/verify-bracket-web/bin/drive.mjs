#!/usr/bin/env node
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const bin = dirname(fileURLToPath(import.meta.url));
const skill = dirname(bin);
const run = join(skill, '.run');

let web = 'http://127.0.0.1:8080';
try {
  const port = readFileSync(`${run}/web-port`, 'utf8').trim();
  if (port) web = `http://127.0.0.1:${port}`;
} catch {}

const feature = process.argv[2] ?? 'render';
const evidenceDir = join(skill, 'evidence', feature);
mkdirSync(evidenceDir, { recursive: true });

let failures = 0;
const pass = (n) => console.log('PASS ' + n);
const fail = (n, why) => { console.log('FAIL ' + n + ': ' + why); failures++; };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
page.on('pageerror', (e) => console.log('PAGEERR ' + e.message));
await page.goto(web + '/');
await page.waitForTimeout(1200);

const shot = async (what) => {
  const path = `${evidenceDir}/${what}.png`;
  await page.screenshot({ path });
  console.log('EVIDENCE ' + path);
  return path;
};

const saveState = async (name, obj) => {
  const path = `${evidenceDir}/${name}.state.json`;
  writeFileSync(path, JSON.stringify(obj, null, 2));
  console.log('EVIDENCE ' + path);
};

async function driveRender() {
  const ids = ['ch-input', 'ch-size', 'ch-switch-btn', 'ch-pos', 'conn-pill', 'ch-wm', 'ch-arm', 'ch-tape', 'ch-depth', 'ch-orders', 'ch-macd'];
  for (const id of ids) {
    const n = await page.locator('#' + id).count();
    n > 0 ? pass(`#${id} present`) : fail(`#${id} present`, 'element missing');
  }
  await shot('render');
  await saveState('render', {
    title: await page.title(),
    url: page.url(),
    symbol: await page.locator('#ch-input').inputValue(),
    watermark: await page.textContent('#ch-wm'),
  });
}

async function driveHeaderTickerForm() {
  const input = page.locator('#ch-input');
  const before = await input.inputValue();
  console.log('symbol before switch: ' + before);

  const wmBefore = (await page.textContent('#ch-wm'))?.trim();
  (wmBefore || '').toUpperCase() === (before || '').toUpperCase()
    ? pass('watermark matches input before switch')
    : fail('watermark matches input before switch', `wm=${wmBefore} input=${before}`);

  await page.selectOption('#ch-size', '100');
  await page.waitForFunction(() => {
    const el = document.querySelector('#ch-feedback');
    return el && el.textContent.includes('size 100');
  }, null, { timeout: 5000 });
  const sizeFb = (await page.textContent('#ch-feedback'))?.trim();
  sizeFb === 'size 100'
    ? pass('size dropdown sets feedback size 100')
    : fail('size dropdown sets feedback size 100', `feedback=${sizeFb}`);

  await shot('header-before');

  await page.fill('#ch-input', 'AAPL');
  await page.click('#ch-switch-btn');
  await page.waitForFunction(() => {
    const el = document.querySelector('#ch-wm');
    return el && el.textContent.trim().toUpperCase() === 'AAPL';
  }, null, { timeout: 8000 });
  const after = await input.inputValue();
  const wmAfter = (await page.textContent('#ch-wm'))?.trim();
  after === 'AAPL'
    ? pass('input keeps AAPL after submit')
    : fail('input keeps AAPL after submit', `input=${after}`);
  wmAfter === 'AAPL'
    ? pass('watermark follows switch to AAPL')
    : fail('watermark follows switch to AAPL', `wm=${wmAfter}`);

  await shot('header-after');
  await saveState('header-ticker-form', {
    before,
    after,
    watermark: wmAfter,
    size: await page.locator('#ch-size').inputValue(),
    feedback: (await page.textContent('#ch-feedback'))?.trim(),
  });
}

const drivers = { render: driveRender, 'header-ticker-form': driveHeaderTickerForm };
if (!drivers[feature]) {
  console.error(`unknown feature '${feature}'. known: ${Object.keys(drivers).join(', ')}`);
  console.error('IB-dependent features are driven per features/<name>.md, not here.');
  await browser.close();
  process.exit(2);
}
await drivers[feature]();

await browser.close();
console.log(failures === 0 ? `${feature}: all pass` : `${feature}: ${failures} failures`);
process.exit(failures === 0 ? 0 : 1);
