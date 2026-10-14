#!/usr/bin/env bash
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ -z "${1:-}" ]; then
  echo "IB port required. 4002 is paper on linden, 4001 is paper on woodlawn, and 4001 is LIVE on linden. See AGENTS.md 'IB endpoints, live vs paper'."
  exit 2
fi
PORT="$1"

echo "== static gate: tsc --noEmit =="
if ! ./node_modules/.bin/tsc --noEmit; then
  echo "type check failed, suites not run"
  exit 1
fi
echo "types ok"

bash test/initialization/run-initialization-test.sh "$PORT"
i=$?

if [ $i -ne 0 ]; then
  echo "initialization failed: bracket and depth suites not started, apps not launched"
  echo "read the FAIL lines above; the init runner saved its app log under test/evidence/init-app-<timestamp>.log"
  exit 1
fi

bash test/bracket/run-bracket-test.sh "$PORT"
b=$?

bash test/depth/run-depth-test.sh "$PORT"
d=$?

bash test/ticks/run-ticks-test.sh "$PORT"
t=$?

bash test/order-at-server/run-order-at-server-test.sh "$PORT"
o=$?

bash test/scanner/run-scanner-test.sh "$PORT"
sc=$?

bash test/web-interface/run-web-interface-test.sh "$PORT"
wi=$?

echo "== overall =="
[ $i -eq 0 ] && echo "initialization: pass" || echo "initialization: FAIL"
[ $b -eq 0 ] && echo "bracket: pass" || echo "bracket: FAIL"
[ $d -eq 0 ] && echo "depth: pass" || echo "depth: FAIL"
[ $t -eq 0 ] && echo "ticks: pass" || echo "ticks: FAIL"
[ $o -eq 0 ] && echo "order-at-server: pass" || echo "order-at-server: FAIL"
[ $sc -eq 0 ] && echo "scanner: pass" || echo "scanner: FAIL"
[ $wi -eq 0 ] && echo "web-interface: pass" || echo "web-interface: FAIL"
[ $i -eq 0 ] && [ $b -eq 0 ] && [ $d -eq 0 ] && [ $t -eq 0 ] && [ $o -eq 0 ] && [ $sc -eq 0 ] && [ $wi -eq 0 ]
