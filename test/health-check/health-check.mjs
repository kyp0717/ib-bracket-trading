// Health check, the doctor step every runner calls before any suite.
// Three fast read-only probes:
//   1. the IB port accepts connections
//   2. the app answers HTTP
//   3. /status reports connected and reconciled
// Usage: node test/health-check/health-check.mjs [ib-port]

import { connect } from 'node:net';

const APP = process.env.E2E_APP_ADDR || 'http://127.0.0.1:8080';
const IB_PORT = Number(process.argv[2] || 4001);

let failures = 0;
function pass(name) { console.log('PASS ' + name); }
function fail(name, why) { console.log('FAIL ' + name + ': ' + why); failures++; }

function portOpen(port) {
  return new Promise((resolve) => {
    const s = connect(port, '127.0.0.1');
    s.once('connect', () => { s.end(); resolve(true); });
    s.once('error', () => resolve(false));
    setTimeout(() => { s.destroy(); resolve(false); }, 3000);
  });
}

async function main() {
  if (await portOpen(IB_PORT)) {
    pass(`ib port ${IB_PORT} accepting connections`);
  } else {
    fail(`ib port ${IB_PORT} accepting connections`,
      IB_PORT === 7497 ? 'start TWS with the paper API port 7497' : 'start IB Gateway with the paper port 4001');
  }

  let status = null;
  try {
    const r = await fetch(APP + '/status');
    if (r.ok) status = await r.json();
  } catch {
  }
  if (status) pass('app answers http');
  else fail('app answers http', `no response from ${APP}/status, is the app running?`);

  if (status) {
    if (status.connected && status.reconciled) pass('app connected and reconciled to ib');
    else fail('app connected and reconciled to ib', JSON.stringify({ connected: status.connected, reconciled: status.reconciled }));
  }
}

await main();
console.log(failures === 0 ? 'health check: all pass' : `health check: ${failures} failures`);
process.exit(failures === 0 ? 0 : 1);
