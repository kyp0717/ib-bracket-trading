import { chromium } from 'playwright-core';
import { APP, makeSuite } from '../util/suite';
import { snap } from '../util/web';

const { pass, fail, summary } = makeSuite('interface 09 header layout');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });

try {
  await page.goto(APP + '/');
  await page.waitForTimeout(1500);
  const m = await page.evaluate(() => {
    const head = document.querySelector('.ch-head') as HTMLElement;
    const h = head.getBoundingClientRect();
    const f = document.getElementById('ch-form')!.getBoundingClientRect();
    const p = document.getElementById('conn-pill')!.getBoundingClientRect();
    const arm = document.getElementById('ch-arm')!;
    return {
      headLeft: h.left, headRight: h.right, headCenter: (h.left + h.right) / 2,
      formCenter: (f.left + f.right) / 2,
      pillRight: p.right,
      switchPillGone: document.getElementById('ch-switch-pill') === null,
      resetGone: document.getElementById('ch-reset') === null,
      armLabel: arm.textContent ?? '',
    };
  });
  if (m.switchPillGone) pass('streaming pill removed');
  else fail('streaming pill removed', 'ch-switch-pill still present');
  if (m.resetGone) pass('reset button removed');
  else fail('reset button removed', 'ch-reset still present');
  if (!/bracket/i.test(m.armLabel)) pass('arm button carries no bracket label');
  else fail('arm button carries no bracket label', 'label=' + m.armLabel);
  if (Math.abs(m.formCenter - m.headCenter) < 20) pass('ticker input centered in the header');
  else fail('ticker input centered in the header', `form=${m.formCenter} head=${m.headCenter}`);
  if (Math.abs(m.pillRight - m.headRight) < 16) pass('connection pill sits at the far right');
  else fail('connection pill sits at the far right', `pill=${m.pillRight} head=${m.headRight}`);

  await snap(page, import.meta.url, 'layout');
  pass('header screenshot recorded as evidence');
} catch (e) {
  await snap(page, import.meta.url, 'aborted');
  fail('suite aborted', String(e));
} finally {
  await browser.close();
}
summary();
