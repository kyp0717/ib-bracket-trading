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
  const { upload, evidenceKey } = await import('../../../src/s3');
  const local = evidencePath(metaUrl, name);
  const buf = await page.screenshot();
  const uri = await upload(evidenceKey(local), buf);
  if (uri) console.log('EVIDENCE ' + uri);
  else {
    const { writeFileSync, mkdirSync } = await import('node:fs');
    const { dirname } = await import('node:path');
    mkdirSync(dirname(local), { recursive: true });
    writeFileSync(local, buf);
    console.log('EVIDENCE local ' + local);
  }
}
