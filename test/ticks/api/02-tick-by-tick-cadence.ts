import { makeSuite, live, waitFor, quote } from '../../suite';

const { pass, fail, summary } = makeSuite('ticks 02 tick by tick cadence');
const { st, close } = live();

try {
  await quote(st, 'SPY');
  await waitFor('tape flowing', 20000, () => st.tapeMsgs > 0);
  const start = st.tapeMsgs;
  const t0 = Date.now();
  await waitFor('tape window', 15000, () => Date.now() - t0 >= 10000);
  const counted = st.tapeMsgs - start;
  if (counted >= 100) pass('tape cadence beats the 250ms snapshot cap');
  else fail('tape cadence beats the 250ms snapshot cap', `only ${counted} trades in 10s`);
} catch (e) {
  fail('suite aborted', String(e));
} finally {
  close();
}
summary();
