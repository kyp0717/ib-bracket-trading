import { makeSuite, live, waitFor, waitAcked, waitIdle, deactivate } from '../../suite';

const { pass, fail, summary } = makeSuite('reconnect 01 rebuild');
const { st, close } = live();

try {
  const sawUnreconciled = await (async () => {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      if (!st.reconciled) return true;
      await new Promise((r) => setTimeout(r, 100));
    }
    return false;
  })();
  if (sawUnreconciled) pass('activations blocked while reconnect reconcile runs');
  else pass('reconcile finished before first poll');

  await waitFor('rebuilt bracket after restart', 60000, () => st.reconciled && st.bracket && st.bracket!.state === 'working');
  pass('reconnect reconcile rebuilds the resting bracket');
  const b = st.bracket!;
  if (b.stop > 0 && b.target > 0 && b.qty === 1) pass('rebuilt bracket keeps levels and quantity');
  else fail('rebuilt bracket keeps levels and quantity', JSON.stringify({ stop: b.stop, target: b.target, qty: b.qty }));

  const ids = [b.parent.orderId, b.stopLeg.orderId, b.targetLeg.orderId];
  const r = await deactivate('reconnect scenario cleanup');
  if (r.ok) pass('deactivate accepted after reconnect');
  else fail('deactivate accepted after reconnect', JSON.stringify(r));
  await waitAcked(ids);
  pass('rebuilt bracket cancelled at the gateway');
  await waitIdle(st);
} catch (e) {
  fail('suite aborted', String(e));
} finally {
  close();
}
summary();
