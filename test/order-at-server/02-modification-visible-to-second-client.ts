import { makeSuite, live, waitFor, waitIdle, r2, setLevels } from '../util/suite';
import { serverOrders } from '../util/ib-probe';

const IB_PORT = Number(process.env.E2E_IB_PORT || 4001);

const { pass, fail, summary } = makeSuite('api 02 modification visible to second client');
const { st, close } = live();

try {
  await waitFor('working bracket from previous scenario', 15000, () => st.bracket && st.bracket!.state === 'working');
  const b = st.bracket!;
  const oldIds = [b.parent.orderId, b.stopLeg.orderId, b.targetLeg.orderId];
  const newStop = r2(b.stop - 1);

  const r = await setLevels({ stop: newStop });
  if (r.ok) pass('stop move accepted');
  else fail('stop move accepted', JSON.stringify(r));
  await waitFor('stop moved', 15000, () => st.bracket && st.bracket!.stop === newStop);
  await waitIdle(st);

  const orders = (await serverOrders(IB_PORT, 91)).filter((o) => o.symbol === 'SPY');
  const stop = orders.find((o) => o.orderType === 'STP LMT');
  if (stop && stop.auxPrice === newStop && !oldIds.includes(stop.orderId))
    pass('server shows the moved stop as a new generation');
  else
    fail('server shows the moved stop as a new generation', JSON.stringify(stop));

  if (orders.every((o) => !oldIds.includes(o.orderId)))
    pass('old generation gone from the server');
  else
    fail('old generation gone from the server', JSON.stringify(orders.map((o) => o.orderId)));

  if (orders.length === 3) pass('server still holds exactly three orders');
  else fail('server still holds exactly three orders', JSON.stringify(orders.map((o) => `${o.orderType}:${o.status}`)));
} catch (e) {
  fail('suite aborted', String(e));
} finally {
  close();
}
summary();
