import { makeSuite, live, waitFor, api, waitIdle, quote, r2 } from '../../suite.mjs';
import { guiPage, snap } from '../../web.mjs';

const { pass, fail, summary } = makeSuite('web 03 locked entry');
const { st, close } = live();
const { browser, page } = await guiPage('SPY');

try {
  const q = await quote(st, 'SPY');
  const entry = r2(q + 0.02);
  const r = await api('/api/bracket/activate', {
    symbol: 'SPY', qty: 1, entry, stop: r2(entry - 2), target: r2(entry + 2), orderType: 'LMT',
  });
  if (!r.ok) throw new Error('fill activation failed: ' + JSON.stringify(r));
  await waitFor('entry locked', 60000, () => st.bracket && st.bracket.entryLocked);
  await page.waitForFunction(() => {
    return document.getElementById('ch-col').textContent.includes('LOCKED');
  }, null, { timeout: 15000 });
  await page.waitForTimeout(500);
  pass('entry row renders LOCKED after fill');

  const box = await page.$eval('#ch-col .tc-hnd', (el) => {
    const b = el.getBoundingClientRect();
    return { x: b.x, y: b.y, width: b.width, height: b.height };
  });
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx, cy + 40, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(600);
  const fb = await page.$eval('#ch-feedback', (el) => el.textContent);
  if (fb.includes('entry locked')) {
    pass('entry drag rejected with feedback after fill');
  } else {
    fail('entry drag rejected with feedback after fill', 'feedback=' + fb);
    await snap(page, import.meta.url, 'locked-drag');
  }
  if (st.bracket && st.bracket.entry === entry) {
    pass('server entry unchanged after locked drag');
  } else {
    fail('server entry unchanged after locked drag', JSON.stringify(st.bracket && st.bracket.entry));
  }

  await api('/api/bracket/deactivate', { reason: 'cleanup' });
  await waitIdle(st);
  await api('/api/bracket/flatten', { symbol: 'SPY' });
} catch (e) {
  await snap(page, import.meta.url, 'aborted');
  fail('suite aborted', String(e));
} finally {
  close();
  await browser.close();
}
summary();
