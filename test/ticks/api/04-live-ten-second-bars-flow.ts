import { makeSuite, live, waitFor, quote } from '../../util/suite';

const { pass, fail, summary } = makeSuite('ticks 04 live ten second bars flow');
const { st, close } = live();

try {
  await quote(st, 'SPY');
  await waitFor('live 10s bar messages', 20000, () => st.bar10Msgs >= 2);
  pass('live 10s bars keep arriving');

  const b = st.lastBar10;
  if (b && b.time % 10 === 0 && b.close > 0) pass('10s bar time sits on a 10 second boundary');
  else fail('10s bar time sits on a 10 second boundary', JSON.stringify(b));
} catch (e) {
  fail('suite aborted', String(e));
} finally {
  close();
}
summary();
