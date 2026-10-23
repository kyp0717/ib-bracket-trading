import { makeSuite, live, waitFor, quote } from '../util/suite';

const { pass, fail, summary } = makeSuite('ticks 06 forming bar follows ticks');
const { st, close } = live();

try {
  await quote(st, 'SPY');
  await waitFor('tape flowing', 20000, () => st.tapeMsgs > 0);

  for (let i = 0; i < 3; i++) {
    const seen = st.tapeMsgs;
    await waitFor('fresh tape trade', 15000, () => st.tapeMsgs > seen);
    const p = st.lastTapePrice!;
    await waitFor('10s bar close equals last trade', 3000,
      () => st.lastBar10 !== null && st.lastBar10.close === p);
    await waitFor('1m bar close equals last trade', 3000,
      () => st.bars1m.length > 0 && st.bars1m[st.bars1m.length - 1].close === p);
  }
  pass('forming 10s and 1m bars update on every tape trade');

  const bars0 = st.bar10Msgs;
  const t0 = Date.now();
  await waitFor('10s bar window', 15000, () => Date.now() - t0 >= 10000);
  const tapes = st.tapeTimes.filter((t) => t >= t0).length;
  const bars = st.bar10Msgs - bars0;
  if (tapes > 0 && bars >= tapes) pass('10s bar messages stream at tape cadence');
  else fail('10s bar messages stream at tape cadence', `bars=${bars} tapes=${tapes} in 10s`);
} catch (e) {
  fail('suite aborted', String(e));
} finally {
  close();
}
summary();
