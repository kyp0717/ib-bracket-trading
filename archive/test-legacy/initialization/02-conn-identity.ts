import { makeSuite, getStatus, waitFor, EventSource, APP } from '../util/suite';
import type { SseMsg } from '../util/suite';

const { pass, fail, summary } = makeSuite('init 02 conn identity');

const IB_PORT = Number(process.env.E2E_IB_PORT || 4002);
const expectProg = IB_PORT === 4001 || IB_PORT === 4002 ? 'IBGW'
  : IB_PORT === 7496 || IB_PORT === 7497 ? 'TWS' : 'IB?';
const wantLabel = `${expectProg} ${IB_PORT} PAPER id 90`;

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

  if (s.provider === 'ib') pass('status provider is ib');
  else fail('status provider is ib', 'provider=' + s.provider);

  if (s.accountMode === 'paper') pass('status account mode is paper (DU-prefix managed account)');
  else fail('status account mode is paper (DU-prefix managed account)', 'accountMode=' + s.accountMode);

  if (s.label === wantLabel) pass(`status label is "${wantLabel}"`);
  else fail(`status label is "${wantLabel}"`, 'label=' + s.label);

  if (s.ibProg === undefined && s.ibAcct === undefined && s.ibPort === undefined && s.clientId === undefined && s.nextValidId === undefined)
    pass('status carries no ib-internal identity fields');
  else
    fail('status carries no ib-internal identity fields',
      JSON.stringify({ ibProg: s.ibProg, ibAcct: s.ibAcct, ibPort: s.ibPort, clientId: s.clientId, nextValidId: s.nextValidId }));

  await waitFor('sse conn message', 5000, () => connMsg !== null);
  const c = connMsg!;
  if (c.provider === s.provider && c.accountMode === s.accountMode && c.label === s.label)
    pass('sse conn payload carries the same identity');
  else
    fail('sse conn payload carries the same identity',
      JSON.stringify({ sse: { provider: c.provider, accountMode: c.accountMode, label: c.label }, status: { provider: s.provider, accountMode: s.accountMode, label: s.label } }));
} catch (e) {
  fail('suite aborted', String(e));
} finally {
  es.close();
}
summary();
