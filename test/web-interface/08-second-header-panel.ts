import { chromium } from 'playwright-core';
import { APP, makeSuite } from '../util/suite';
import { snap } from '../util/web';

const { pass, fail, summary } = makeSuite('interface 08 second header panel');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });

try {
  await page.goto(APP + '/');
  await page.waitForTimeout(1500);
  const m = await page.evaluate(() => {
    const sub = document.querySelector('.ch-subhead') as HTMLElement | null;
    const head = document.querySelector('.ch-head') as HTMLElement;
    const chart = document.getElementById('ch-second') as HTMLElement;
    if (!sub) return { missing: true };
    const s = sub.getBoundingClientRect();
    const c = chart.getBoundingClientRect();
    const h = head.getBoundingClientRect();
    return {
      missing: false,
      inSub: ['ch-otype', 'ch-size', 'ch-pos', 'ch-reset'].every((id) => !!sub.querySelector('#' + id)),
      inHead: !!head.querySelector('#ch-otype, #ch-size, #ch-pos, #ch-reset'),
      subLeft: s.left, chartRight: c.right,
      subRight: s.right, headRight: h.right,
      subTop: s.top, headBottom: h.bottom,
    };
  });
  if (m.missing || m.subLeft === undefined) throw new Error('no .ch-subhead element');
  if (m.inSub && !m.inHead) pass('type, size, position, and reset live in the second header');
  else fail('type, size, position, and reset live in the second header', `inSub=${m.inSub} inHead=${m.inHead}`);
  if (Math.abs(m.subLeft - m.chartRight) < 3) pass('second header starts at the chart right border');
  else fail('second header starts at the chart right border', `subLeft=${m.subLeft} chartRight=${m.chartRight}`);
  if (Math.abs(m.subRight - m.headRight) < 3) pass('second header reaches the right edge with the main header');
  else fail('second header reaches the right edge with the main header', `subRight=${m.subRight} headRight=${m.headRight}`);
  if (m.subTop >= m.headBottom - 1) pass('second header sits directly below the main header');
  else fail('second header sits directly below the main header', `subTop=${m.subTop} headBottom=${m.headBottom}`);

  const pos = await page.evaluate(() => {
    const a = document.getElementById('ch-pos-shares')!.getBoundingClientRect();
    const b = document.getElementById('ch-pos-pl')!.getBoundingClientRect();
    return { topA: a.top, topB: b.top, leftA: a.left, leftB: b.left };
  });
  if (Math.abs(pos.topA - pos.topB) < 2 && pos.leftB > pos.leftA) pass('position and pnl sit side by side');
  else fail('position and pnl sit side by side', JSON.stringify(pos));

  await snap(page, import.meta.url, 'layout');
  pass('layout screenshot recorded as evidence');
} catch (e) {
  await snap(page, import.meta.url, 'aborted');
  fail('suite aborted', String(e));
} finally {
  await browser.close();
}
summary();
