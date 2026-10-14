import { chromium } from 'playwright-core';
import { APP, makeSuite } from '../util/suite';
import { snap } from '../util/web';

const { pass, fail, summary } = makeSuite('interface 10 keyboard escape hatch');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });

try {
  await page.goto(APP + '/');
  await page.waitForTimeout(1500);

  await page.keyboard.press('Delete');
  await page.waitForTimeout(500);
  const fb1 = await page.$eval('#ch-feedback', (el) => el.textContent!);
  if (fb1.includes('escape rejected') && fb1.includes('no position')) pass('delete with no position refuses safely');
  else fail('delete with no position refuses safely', 'feedback=' + fb1);

  await page.keyboard.press('Shift+Delete');
  await page.waitForTimeout(500);
  const fb2 = await page.$eval('#ch-feedback', (el) => el.textContent!);
  if (fb2.includes('escape rejected') && fb2.includes('no position')) pass('shift-delete with no position refuses safely');
  else fail('shift-delete with no position refuses safely', 'feedback=' + fb2);

  await page.click('#ch-input');
  await page.fill('#ch-input', 'SPY');
  await page.keyboard.press('Home');
  await page.keyboard.press('Delete');
  await page.waitForTimeout(300);
  const val = await page.$eval('#ch-input', (el) => (el as HTMLInputElement).value);
  const fb3 = await page.$eval('#ch-feedback', (el) => el.textContent!);
  if (val === 'PY' && fb3 === fb2) pass('delete inside the ticker input edits text, never sells');
  else fail('delete inside the ticker input edits text, never sells', `val=${val} feedback changed=${fb3 !== fb2}`);
} catch (e) {
  await snap(page, import.meta.url, 'aborted');
  fail('suite aborted', String(e));
} finally {
  await browser.close();
}
summary();
