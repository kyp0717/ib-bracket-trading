import { makeSuite, live, waitFor, quote } from '../../suite';

const { pass, fail, summary } = makeSuite('depth 04 venue per level');
const { st, close } = live();

try {
  await quote(st, 'SPY');
  await waitFor('depth book with venue tags', 20000, () => st.depth && st.depth.bids.length > 0 && st.depth.asks.length > 0);
  const levels = [...st.depth!.bids, ...st.depth!.asks];
  const venueRe = /^[A-Z][A-Z.]*$/;
  if (levels.every((l) => venueRe.test(l.mm))) pass('every depth level carries a venue');
  else fail('every depth level carries a venue', JSON.stringify(levels.slice(0, 5).map((l) => l.mm)));
  const venues = new Set(levels.map((l) => l.mm));
  if (venues.size >= 2) pass('book merges multiple venues');
  else fail('book merges multiple venues', [...venues].join(','));
  if (!venues.has('SMART')) pass('venues are real exchanges, not the SMART aggregate');
  else fail('venues are real exchanges, not the SMART aggregate', 'SMART');
} catch (e) {
  fail('suite aborted', String(e));
} finally {
  close();
}
summary();
