import { makeSuite, live, waitFor, quote, r2, activate } from '../util/suite';
import { serverOrders } from '../util/ib-probe';

const IB_PORT = Number(process.env.E2E_IB_PORT || 4002);

const { pass, fail, summary } = makeSuite('api 01 bracket visible to second client');
const { st, close } = live();

try {
  await waitFor('reconciled', 60000, () => st.reconciled);
  const q = await quote(st, 'SPY');
  const entry = r2(q - 3);
  const lv = { entry, stop: r2(entry - 1), target: r2(entry + 4) };
  const r = await activate({ symbol: 'SPY', qty: 1, ...lv, orderType: 'LMT' });
  if (!r.ok) throw new Error('activation failed: ' + JSON.stringify(r));
  await waitFor('bracket working', 15000, () => st.bracket && st.bracket!.state === 'working');
  pass('working bracket placed through the app');

  const orders = (await serverOrders(IB_PORT, 91)).filter((o) => o.symbol === 'SPY');
  if (orders.length === 3) pass('server holds exactly three orders for the symbol');
  else fail('server holds exactly three orders for the symbol', JSON.stringify(orders));

  const b = st.bracket!;
  const parent = orders.find((o) => o.orderId === b.parent.orderId);
  if (parent && parent.action === 'BUY' && parent.orderType === 'LMT' &&
      parent.lmtPrice === b.entry && parent.totalQuantity === b.qty && parent.status === 'Submitted')
    pass('parent sits on the server at the entry price');
  else
    fail('parent sits on the server at the entry price', JSON.stringify(parent));

  const stop = orders.find((o) => o.orderId === b.stopLeg.orderId);
  if (stop && stop.action === 'SELL' && stop.orderType === 'STP LMT' &&
      stop.auxPrice === b.stop && stop.lmtPrice === b.stop && stop.parentId === b.parent.orderId && stop.status === 'PreSubmitted')
    pass('stop sits on the server under the parent as a stop-limit');
  else
    fail('stop sits on the server under the parent as a stop-limit', JSON.stringify(stop));

  const target = orders.find((o) => o.orderId === b.targetLeg.orderId);
  if (target && target.action === 'SELL' && target.orderType === 'LMT' &&
      target.lmtPrice === b.target && target.parentId === b.parent.orderId &&
      ['Submitted', 'PreSubmitted'].includes(target.status))
    pass('target sits on the server under the parent');
  else
    fail('target sits on the server under the parent', JSON.stringify(target));

  if (stop && target && stop.ocaGroup && stop.ocaGroup === target.ocaGroup)
    pass('children share one oca group on the server');
  else
    fail('children share one oca group on the server', `stop=${stop?.ocaGroup} target=${target?.ocaGroup}`);
} catch (e) {
  fail('suite aborted', String(e));
} finally {
  close();
}
summary();
