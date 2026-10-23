import { chromium } from 'playwright-core';
import { APP, makeSuite } from '../util/suite';
import { snap } from '../util/web';

const { pass, fail, summary } = makeSuite('interface 02 tf buttons inside chart');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });

try {
  await page.goto(APP + '/');
  await page.waitForTimeout(1500);
  const m = await page.evaluate(() => {
    const tf = document.getElementById('ch-tf')!;
    return {
      inChart: tf.closest('#ch-second') !== null,
      inHead: tf.closest('.ch-head') !== null,
      tfs: [...tf.querySelectorAll('.tc-size-btn')].map((b) => (b as HTMLElement).dataset.tf),
    };
  });
  if (m.inChart && !m.inHead) pass('tf buttons live inside the chart, not the header');
  else fail('tf buttons live inside the chart, not the header', `inChart=${m.inChart} inHead=${m.inHead}`);
  if (m.tfs.length === 3 && m.tfs.join(',') === '10s,1m,1d') pass('all three timeframe buttons present');
  else fail('all three timeframe buttons present', JSON.stringify(m.tfs));
  const labelGone = await page.evaluate(() => document.getElementById('ch-tf-tag') === null);
  if (labelGone) pass('chart label removed, active button is the indicator');
  else fail('chart label removed, active button is the indicator', 'ch-tf-tag still exists');

  await page.click('#ch-tf .tc-size-btn[data-tf="1m"]');
  await page.waitForTimeout(300);
  const active = await page.$eval('#ch-tf .tc-size-btn.active', (el) => (el as HTMLElement).dataset.tf);
  if (active === '1m') pass('clicking a moved button still switches the chart');
  else fail('clicking a moved button still switches the chart', 'active=' + active);
} catch (e) {
  await snap(page, import.meta.url, 'aborted');
  fail('suite aborted', String(e));
} finally {
  await browser.close();
}
summary();
