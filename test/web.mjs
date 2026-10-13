import { chromium } from '/home/phage/.nvm/versions/node/v24.18.0/lib/node_modules/playwright/index.mjs';
import { APP, waitFor, api } from './suite.mjs';

export async function guiPage(symbol) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
  page.on('pageerror', (e) => console.log('PAGEERR ' + e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(APP + '/');
  await page.waitForTimeout(1500);
  await page.fill('#ch-input', symbol);
  await page.click('#ch-switch-btn');
  await waitFor('tape quote', 15000, async () => {
    const q = await api('/api/quote');
    return q && q.symbol === symbol && q.price > 0;
  });
  await page.waitForFunction(() => {
    const row = document.querySelector('#ch-col .tc-hnd');
    return row && row.style.display === 'flex';
  }, null, { timeout: 20000 });
  return { browser, page };
}

export async function snap(page, metaUrl, name) {
  const { evidencePath } = await import('./suite.mjs');
  await page.screenshot({ path: evidencePath(metaUrl, name) });
}
