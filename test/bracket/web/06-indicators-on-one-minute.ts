import { makeSuite, live, waitFor, quote } from '../../suite';
import type { Bar } from '../../../wire';
import { guiPage, snap } from '../../web';

const { pass, fail, summary } = makeSuite('web 06 indicators on one minute');
const { st, close } = live();
const { browser, page } = await guiPage('SPY');

function expectedIndicators(): { vwap: number; ema9: number } | null {
  const byTime = new Map<number, Bar>();
  for (const b of st.bars1m) byTime.set(b.time, b);
  const data = [...byTime.values()].sort((a, b) => a.time - b.time);
  if (data.length < 9) return null;
  let day = -1, cumPV = 0, cumV = 0, vwap = 0;
  for (const b of data) {
    const d = Math.floor(b.time / 86400);
    if (d !== day) { day = d; cumPV = 0; cumV = 0; }
    cumPV += ((b.high + b.low + b.close) / 3) * b.volume;
    cumV += b.volume;
    if (cumV > 0) vwap = cumPV / cumV;
  }
  const k = 2 / (9 + 1);
  let ema = data[0].close;
  for (let i = 1; i < data.length; i++) ema = data[i].close * k + ema * (1 - k);
  return { vwap, ema9: ema };
}

try {
  await quote(st, 'SPY');
  await waitFor('1m bars captured', 30000, () => st.bars1m.length >= 100);

  await page.click('#ch-tf .tc-size-btn[data-tf="1m"]');
  await page.waitForFunction(() => {
    return document.getElementById('ch-ind-tag')!.style.display !== 'none' &&
      document.getElementById('ch-ind-vwap')!.textContent !== '';
  }, null, { timeout: 15000 });
  pass('indicator legend appears on 1m');

  const exp = expectedIndicators();
  const vwapText = await page.$eval('#ch-ind-vwap', (el) => el.textContent!);
  const emaText = await page.$eval('#ch-ind-ema9', (el) => el.textContent!);
  if (exp && Math.abs(Number(vwapText) - exp.vwap) <= 0.25) pass('rendered vwap matches bars');
  else fail('rendered vwap matches bars', `legend=${vwapText} expected=${exp ? exp.vwap.toFixed(2) : 'none'}`);
  if (exp && Math.abs(Number(emaText) - exp.ema9) <= 0.25) pass('rendered ema9 matches bars');
  else fail('rendered ema9 matches bars', `legend=${emaText} expected=${exp ? exp.ema9.toFixed(2) : 'none'}`);

  await page.click('#ch-tf .tc-size-btn[data-tf="10s"]');
  await page.waitForTimeout(300);
  const hidden = await page.$eval('#ch-ind-tag', (el) => el.style.display === 'none');
  if (hidden) pass('legend hides off the 1m chart');
  else fail('legend hides off the 1m chart', 'still visible');
} catch (e) {
  await snap(page, import.meta.url, 'aborted');
  fail('suite aborted', String(e));
} finally {
  close();
  await browser.close();
}
summary();
