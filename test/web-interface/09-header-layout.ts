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
    const head = document.querySelector('.ch-head')!.getBoundingClientRect();
    const input = document.getElementById('ch-input') as HTMLInputElement;
    const pos = document.getElementById('ch-pos')!.getBoundingClientRect();
    const pill = document.getElementById('conn-pill')!.getBoundingClientRect();
    const chart = document.getElementById('ch-second')!.getBoundingClientRect();
    const rail = document.getElementById('ch-col')!.getBoundingClientRect();
    const orders = document.getElementById('ch-orders')!.getBoundingClientRect();
    const wm = document.getElementById('ch-wm');
    const wmBox = wm!.getBoundingClientRect();
    return {
      headLeft: head.left, headRight: head.right,
      headCenter: (head.left + head.right) / 2,
      inputLeft: input.getBoundingClientRect().left,
      inputValue: input.value,
      posCenter: (pos.left + pos.right) / 2,
      pillRight: pill.right,
      chartTop: chart.top,
      chartCenterX: (chart.left + chart.right) / 2,
      chartCenterY: (chart.top + chart.bottom) / 2,
      railTop: rail.top,
      ordersTop: orders.top,
      subheadGone: document.querySelector('.ch-subhead') === null,
      sizeInHead: document.querySelector('.ch-head #ch-size') !== null,
      wmText: wm!.textContent ?? '',
      wmInChart: document.getElementById('ch-second')!.contains(wm),
      wmCenterX: (wmBox.left + wmBox.right) / 2,
      wmCenterY: (wmBox.top + wmBox.bottom) / 2,
      wmFontSize: parseFloat(getComputedStyle(wm!).fontSize),
    };
  });
  if (m.subheadGone) pass('second header removed');
  else fail('second header removed', '.ch-subhead still present');
  if (m.sizeInHead) pass('size buttons live in the top header');
  else fail('size buttons live in the top header', 'no #ch-size inside .ch-head');
  if (Math.abs(m.chartTop - m.railTop) < 2) pass('bracket rail top aligns with chart top');
  else fail('bracket rail top aligns with chart top', `chart=${m.chartTop} rail=${m.railTop}`);
  if (Math.abs(m.chartTop - m.ordersTop) < 2) pass('order rail top aligns with chart top');
  else fail('order rail top aligns with chart top', `chart=${m.chartTop} orders=${m.ordersTop}`);
  if (m.inputLeft - m.headLeft < 60) pass('ticker input sits at the left of the header');
  else fail('ticker input sits at the left of the header', `input=${m.inputLeft} head=${m.headLeft}`);
  if (m.inputValue.length > 0) pass('ticker input shows the viewed symbol');
  else fail('ticker input shows the viewed symbol', 'input is empty');
  if (m.wmInChart && m.wmText === m.inputValue) pass('chart watermark names the viewed ticker');
  else fail('chart watermark names the viewed ticker', `wm="${m.wmText}" input="${m.inputValue}"`);
  if (Math.abs(m.wmCenterX - m.chartCenterX) < 40 && Math.abs(m.wmCenterY - m.chartCenterY) < 40)
    pass('watermark sits inside the chart');
  else fail('watermark sits inside the chart', `wm=(${m.wmCenterX},${m.wmCenterY}) chart=(${m.chartCenterX},${m.chartCenterY})`);
  if (m.wmFontSize >= 40) pass('watermark renders large');
  else fail('watermark renders large', `fontSize=${m.wmFontSize}`);
  if (Math.abs(m.posCenter - m.headCenter) < 20) pass('position and pnl centered in the header');
  else fail('position and pnl centered in the header', `pos=${m.posCenter} head=${m.headCenter}`);
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
