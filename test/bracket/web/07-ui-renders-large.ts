import { chromium } from 'playwright-core';
import { APP, makeSuite } from '../../util/suite';
import { snap } from '../../util/web';

const { pass, fail, summary } = makeSuite('web 07 ui renders large');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });

try {
  await page.goto(APP + '/');
  await page.waitForTimeout(1500);
  const m = await page.evaluate(() => {
    const b = document.body;
    const wrap = document.querySelector('.charts-wrap') as HTMLElement;
    return {
      zoom: Number(getComputedStyle(b).zoom),
      innerH: window.innerHeight,
      bodyH: b.clientHeight,
      wrapH: wrap.clientHeight,
      bodyVisibleH: b.getBoundingClientRect().height,
    };
  });
  if (Math.abs(m.zoom - 1.25) < 0.01) pass('page launches at 125 percent scale');
  else fail('page launches at 125 percent scale', 'zoom=' + m.zoom);
  if (Math.abs(m.bodyVisibleH - m.innerH) < 2) pass('scaled body exactly fills the window');
  else fail('scaled body exactly fills the window', `visible=${m.bodyVisibleH} inner=${m.innerH}`);
  if (Math.abs(m.wrapH - m.bodyH) < 2) pass('chart stack fills the scaled body');
  else fail('chart stack fills the scaled body', `wrap=${m.wrapH} body=${m.bodyH}`);
} catch (e) {
  await snap(page, import.meta.url, 'aborted');
  fail('suite aborted', String(e));
} finally {
  await browser.close();
}
summary();
