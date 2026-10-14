import { makeSuite, live, waitFor, waitIdle, deactivate } from '../../util/suite';
import { serverOrders } from '../../util/ib-probe';

const IB_PORT = Number(process.env.E2E_IB_PORT || 4001);

const { pass, fail, summary } = makeSuite('api 03 cancel empties the server');
const { st, close } = live();

try {
  await waitFor('working bracket from previous scenario', 15000, () => st.bracket && st.bracket!.state === 'working');

  const r = await deactivate('scenario 3');
  if (r.ok) pass('deactivate accepted');
  else fail('deactivate accepted', JSON.stringify(r));
  await waitIdle(st);

  const orders = (await serverOrders(IB_PORT, 91)).filter((o) => o.symbol === 'SPY');
  if (orders.length === 0) pass('deactivate empties the server');
  else fail('deactivate empties the server', JSON.stringify(orders.map((o) => `${o.orderId}:${o.orderType}:${o.status}`)));
} catch (e) {
  fail('suite aborted', String(e));
} finally {
  close();
}
summary();
