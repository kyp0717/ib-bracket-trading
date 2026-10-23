import { makeSuite, live, waitFor, quote } from '../util/suite';

const { pass, fail, summary } = makeSuite('ticks 02 tick by tick cadence');
const { st, close } = live();

try {
  await quote(st, 'SPY');
  await waitFor('tape flowing', 20000, () => st.tapeMsgs > 0);
  const t0 = Date.now();
  await waitFor('tape window', 15000, () => Date.now() - t0 >= 10000);
  const times = st.tapeTimes.filter((t) => t >= t0);
  let burst = false;
  for (let i = 1; i < times.length; i++) {
    if (times[i] - times[i - 1] < 250) { burst = true; break; }
  }
  if (burst) pass('tape cadence beats the 250ms snapshot cap');
  else fail('tape cadence beats the 250ms snapshot cap', `no inter-arrival under 250ms across ${times.length} trades in 10s`);
} catch (e) {
  fail('suite aborted', String(e));
} finally {
  close();
}
summary();
