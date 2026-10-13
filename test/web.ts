import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { APP, waitFor, getQuote } from './suite';

export async function guiPage(symbol: string) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
  page.on('pageerror', (e) => console.log('PAGEERR ' + e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(APP + '/');
  await page.waitForTimeout(1500);
  await page.fill('#ch-input', symbol);
  await page.click('#ch-switch-btn');
  await waitFor('tape quote', 15000, async () => {
    const q = await getQuote();
    return q && q.symbol === symbol && q.price > 0;
  });
  await page.waitForFunction(() => {
    const row = document.querySelector<HTMLElement>('#ch-col .tc-hnd');
    return row && row.style.display === 'flex';
  }, null, { timeout: 20000 });
  return { browser, page };
}

export async function snap(page: Page, metaUrl: string, name: string): Promise<void> {
  const { evidencePath } = await import('./suite');
  await page.screenshot({ path: evidencePath(metaUrl, name) });
}
