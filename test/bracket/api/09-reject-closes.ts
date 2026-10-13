import { makeSuite, live, waitFor, waitIdle, activate, deactivate } from '../../suite';

const { pass, fail, summary } = makeSuite('api 09 reject closes');
const { st, close } = live();

try {
  await waitFor('reconciled', 60000, () => st.reconciled);
  const r = await activate({ symbol: 'SPY', qty: 1, entry: 150.123456, stop: 150.11, target: 150.2, orderType: 'LMT' });
  if (!r.ok) throw new Error('reject-test activation call itself failed: ' + JSON.stringify(r));
  try {
    await waitFor('closed after reject', 15000, () => {
      const b = st.bracket;
      return !b || b.state === 'closed';
    });
    pass('rejected parent returns the machine to closed');
  } catch {
    fail('rejected parent returns the machine to closed', `state=${st.bracket ? st.bracket!.state : 'missing'}, expect the known gap`);
  }
  await deactivate('scenario 9 cleanup');
  await waitIdle(st);
} catch (e) {
  fail('suite aborted', String(e));
} finally {
  close();
}
summary();
