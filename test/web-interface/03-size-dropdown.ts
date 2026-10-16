import { makeSuite } from '../util/suite';
import { guiPage } from '../util/web';

const { pass, fail, summary } = makeSuite('interface 03 size dropdown');
const { browser, page } = await guiPage('SPY');

try {
  const opts = await page.$$eval('#ch-size option', (els) =>
    els.map((e) => (e as HTMLOptionElement).value));
  if (opts.join(',') === '10,100,500') pass('size dropdown offers 10 100 500');
  else fail('size dropdown offers 10 100 500', 'options=' + opts.join(','));

  const val = await page.$eval('#ch-size', (el) => (el as HTMLSelectElement).value);
  if (val === '10') pass('size defaults to 10');
  else fail('size defaults to 10', 'value=' + val);

  const order = await page.evaluate(() =>
    [...document.getElementById('ch-form')!.children].map((e) => e.id).join(','));
  if (order === 'ch-input,ch-size,ch-switch-btn')
    pass('dropdown sits between ticker input and switch icon');
  else fail('dropdown sits between ticker input and switch icon', 'order=' + order);

  const btn = await page.evaluate(() => {
    const b = document.getElementById('ch-switch-btn')!;
    const t = b.textContent ?? '';
    return { text: t, hasLetters: /[A-Za-z]/.test(t) };
  });
  if (btn.text.length > 0 && !btn.hasLetters) pass('switch control is an icon, not a word');
  else fail('switch control is an icon, not a word', 'text="' + btn.text + '"');

  await page.selectOption('#ch-size', '100');
  const fb = await page.$eval('#ch-feedback', (el) => el.textContent ?? '');
  if (fb === 'size 100') pass('choosing a size updates the size');
  else fail('choosing a size updates the size', 'feedback="' + fb + '"');
} catch (e) {
  fail('suite aborted', String(e));
} finally {
  await browser.close();
}
summary();
