import { connect } from 'node:net';
import { getStatus } from '../util/suite';
import type { Status } from '../util/suite';

const IB_PORT = Number(process.argv[2] || 4002);

let failures = 0;
function pass(name: string) { console.log('PASS ' + name); }
function fail(name: string, why: string) { console.log('FAIL ' + name + ': ' + why); failures++; }

function portOpen(port: number): Promise<boolean> {
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
      'start the paper session on this port: IB Gateway paper is 4002, TWS paper is unconfirmed (believed 7497), and 4001 is IB Gateway live');
  }

  let status: Status | null = null;
  try {
    status = await getStatus();
  } catch {
  }
  if (status) pass('app answers http');
  else fail('app answers http', `no response from /status, is the app running?`);

  if (status) {
    if (status.connected && status.reconciled) pass('app connected and reconciled to ib');
    else fail('app connected and reconciled to ib', JSON.stringify({ connected: status.connected, reconciled: status.reconciled }));
  }
}

await main();
console.log(failures === 0 ? 'health check: all pass' : `health check: ${failures} failures`);
process.exit(failures === 0 ? 0 : 1);
