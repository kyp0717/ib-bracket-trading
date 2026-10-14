import { makeSuite, live, waitFor, quote } from '../util/suite';

const { pass, fail, summary } = makeSuite('ticks 01 tape subscription audited');
const { st, close } = live();

try {
  await quote(st, 'SPY');
  await waitFor('tape subscribe audit line', 15000, () =>
    st.auditLines.some((l) => l.includes('subscribe | tape SPY reqTickByTickData AllLast')));
  pass('subscribing SPY audits tape via reqTickByTickData AllLast');

  await quote(st, 'QQQ');
  await waitFor('tape cancel audit line', 15000, () =>
    st.auditLines.some((l) => l.includes('cancel | tape SPY reqTickByTickData')));
  pass('switching symbol audits the tape cancel');
} catch (e) {
  fail('suite aborted', String(e));
} finally {
  close();
}
summary();
