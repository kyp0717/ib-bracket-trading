import { makeSuite, getStatus, waitFor, EventSource, APP } from '../util/suite';
import type { SseMsg } from '../util/suite';

const { pass, fail, summary } = makeSuite('init 02 conn identity');

const IB_PORT = Number(process.env.E2E_IB_PORT || 4002);
const expectProg = IB_PORT === 4001 || IB_PORT === 4002 ? 'ibgw'
  : IB_PORT === 7496 || IB_PORT === 7497 ? 'tws' : 'unknown';

let connMsg: (SseMsg & { t: 'conn' }) | null = null;
const es = new EventSource(APP + '/events');
es.onmessage = (e) => {
  const m = JSON.parse(e.data) as SseMsg;
  if (m.t === 'conn') connMsg = m;
};

try {
  await waitFor('connected and reconciled', 60000, async () => {
    const s = await getStatus();
    return s.connected && s.reconciled;
  });
  const s = await getStatus();

  if (s.ibProg === expectProg) pass(`status program is ${expectProg} for port ${IB_PORT}`);
  else fail(`status program is ${expectProg} for port ${IB_PORT}`, 'ibProg=' + s.ibProg);

  if (s.ibAcct === 'paper') pass('status account is paper (DU-prefix managed account)');
  else fail('status account is paper (DU-prefix managed account)', 'ibAcct=' + s.ibAcct);

  if (s.clientId === 90) pass('status carries client id 90');
  else fail('status carries client id 90', 'clientId=' + s.clientId);

  await waitFor('sse conn message', 5000, () => connMsg !== null);
  const c = connMsg!;
  if (c.ibProg === s.ibProg && c.ibAcct === s.ibAcct && c.clientId === s.clientId)
    pass('sse conn payload carries the same identity');
  else
    fail('sse conn payload carries the same identity',
      JSON.stringify({ sse: { ibProg: c.ibProg, ibAcct: c.ibAcct, clientId: c.clientId }, status: { ibProg: s.ibProg, ibAcct: s.ibAcct, clientId: s.clientId } }));
} catch (e) {
  fail('suite aborted', String(e));
} finally {
  es.close();
}
summary();
