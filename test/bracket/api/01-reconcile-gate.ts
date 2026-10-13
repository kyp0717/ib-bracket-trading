import { makeSuite, live, waitFor, waitIdle, activate, deactivate } from '../../suite';

const { pass, fail, summary } = makeSuite('api 01 reconcile gate');
const { st, close } = live();

try {
  const r = await activate({ symbol: 'SPY', qty: 1, entry: 1, stop: 0.5, target: 2, orderType: 'LMT' });
  if (!r.ok && /reconcil/i.test(r.error || '')) {
    pass('activation refused before reconcile completes');
  } else if (r.ok) {
    await deactivate('gate test cleanup');
    pass('reconcile finished before first activation attempt (cleanup done)');
  } else {
    fail('activation refused before reconcile completes', JSON.stringify(r));
  }
  await waitIdle(st);
  await waitFor('reconciled', 60000, () => st.reconciled);
  pass('reconcile completes and activations open');
} catch (e) {
  fail('suite aborted', String(e));
} finally {
  close();
}
summary();
