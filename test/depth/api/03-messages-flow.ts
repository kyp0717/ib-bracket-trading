import { makeSuite, live, waitFor, quote } from '../../suite';

const { pass, fail, summary } = makeSuite('api 03 messages flow');
const { st, close } = live();

try {
  await waitFor('reconciled', 60000, () => st.reconciled);
  await quote(st, 'SPY');
  await waitFor('depth book for SPY', 20000, () =>
    st.depth && st.depth!.bids.length > 0 && st.depth!.asks.length > 0);
  const n0 = st.depthMsgs;
  await waitFor('depth messages keep flowing', 20000, () => st.depthMsgs > n0)
    .then(() => pass('depth messages keep flowing'))
    .catch(() => fail('depth messages keep flowing', 'no depth message in 20s'));
} catch (e) {
  fail('suite aborted', String(e));
} finally {
  close();
}
summary();
