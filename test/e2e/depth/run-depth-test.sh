#!/usr/bin/env bash
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

IB_PORT="${1:-4001}"
LOG=/tmp/depth-e2e.log
export E2E_APP_ADDR="${E2E_APP_ADDR:-http://127.0.0.1:8080}"

start_app() {
  pkill -f "tsx server.ts" 2>/dev/null
  sleep 1
  setsid nohup npx tsx server.ts --ibport "$IB_PORT" > "$LOG" 2>&1 < /dev/null &
}

wait_handshake() {
  for _ in $(seq 1 30); do
    if grep -q "connected to" "$LOG" 2>/dev/null; then
      return 0
    fi
    sleep 1
  done
  echo "IB handshake failed on port $IB_PORT, see $LOG"
  exit 1
}

echo "== start app on paper port $IB_PORT =="
start_app
wait_handshake
echo "IB handshake ok"

echo "== depth data scenarios =="
node test/e2e/depth/depth-api.mjs
p1=$?

echo "== depth rendering scenarios =="
node test/e2e/depth/depth.spec.mjs
p2=$?

pkill -f "tsx server.ts" 2>/dev/null

echo "== summary =="
[ $p1 -eq 0 ] && echo "depth api: pass" || echo "depth api: FAIL"
[ $p2 -eq 0 ] && echo "depth playwright: pass" || echo "depth playwright: FAIL"
[ $p1 -eq 0 ] && [ $p2 -eq 0 ]
