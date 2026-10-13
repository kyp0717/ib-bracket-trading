import { makeSuite, live, waitFor, quote } from '../../suite';

const { pass, fail, summary } = makeSuite('api 01 book arrives and shape');
const { st, close } = live();

try {
  await waitFor('reconciled', 60000, () => st.reconciled);
  await quote(st, 'SPY');
  await waitFor('depth book for SPY', 20000, () =>
    st.depth && st.depth!.bids.length > 0 && st.depth!.asks.length > 0);
  pass('depth book arrives after symbol load');

  const b = st.depth!;
  const bestBid = b.bids[0].price;
  const bestAsk = b.asks[0].price;
  if (bestBid > 0 && bestAsk > 0 && bestBid < bestAsk) pass('best bid below best ask');
  else fail('best bid below best ask', JSON.stringify({ bestBid, bestAsk }));
  if (b.bids.every((r, i) => i === 0 || b.bids[i - 1].price >= r.price)) pass('bids ordered best first');
  else fail('bids ordered best first', JSON.stringify(b.bids.map((r) => r.price)));
  if (b.asks.every((r, i) => i === 0 || b.asks[i - 1].price <= r.price)) pass('asks ordered best first');
  else fail('asks ordered best first', JSON.stringify(b.asks.map((r) => r.price)));
  if (b.bids.every((r) => r.size > 0) && b.asks.every((r) => r.size > 0)) pass('depth sizes positive');
  else fail('depth sizes positive', JSON.stringify(b));
} catch (e) {
  fail('suite aborted', String(e));
} finally {
  close();
}
summary();
