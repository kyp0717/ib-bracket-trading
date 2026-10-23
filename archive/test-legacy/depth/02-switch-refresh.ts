import { makeSuite, live, waitFor, quote } from '../util/suite';

const { pass, fail, summary } = makeSuite('api 02 switch refresh');
const { st, close } = live();

try {
  await waitFor('reconciled', 60000, () => st.reconciled);
  const spyBest = await (async () => {
    await quote(st, 'SPY');
    await waitFor('depth book for SPY', 20000, () =>
      st.depth && st.depth!.bids.length > 0 && st.depth!.asks.length > 0);
    return st.depth!.bids[0].price;
  })();
  await quote(st, 'QQQ');
  await waitFor('book change after switch', 20000, () =>
    st.depth && st.depth!.bids.length > 0 && st.depth!.bids[0].price !== spyBest);
  if (Math.abs(st.depth!.bids[0].price - spyBest) > 1) pass('book refreshes on symbol switch');
  else fail('book refreshes on symbol switch', `best bid moved only to ${st.depth!.bids[0].price} from ${spyBest}`);
  await quote(st, 'SPY');
} catch (e) {
  fail('suite aborted', String(e));
} finally {
  close();
}
summary();
