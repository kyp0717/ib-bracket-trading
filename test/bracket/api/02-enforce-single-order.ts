import { makeSuite, live, waitFor, quote, r2, activate } from '../../util/suite';

const { pass, fail, summary } = makeSuite('api 02 enforce single order');
const { st, close } = live();

try {
  await waitFor('reconciled', 60000, () => st.reconciled);
  const q0 = await quote(st, 'SPY');
  const lv = { entry: r2(q0 - 3), stop: r2(q0 - 4), target: r2(q0 + 1) };
  let r = await activate({ symbol: 'SPY', qty: 1, ...lv, orderType: 'LMT' });
  if (!r.ok) throw new Error('activation failed: ' + JSON.stringify(r));
  await waitFor('working bracket', 10000, () => st.bracket && st.bracket!.state === 'working');
  const first = st.bracket!.parent.orderId;
  r = await activate({ symbol: 'SPY', qty: 1, ...lv, orderType: 'LMT' });
  if (!r.ok && /already working/.test(r.error || '')) {
    pass('second activation while working is refused (single-flight)');
  } else {
    fail('second activation while working is refused (single-flight)', JSON.stringify(r));
  }
  if (st.bracket!.parent.orderId === first) pass('exactly one bracket on the book');
  else fail('exactly one bracket on the book', 'parent id changed after second activation');
} catch (e) {
  fail('suite aborted', String(e));
} finally {
  close();
}
summary();
