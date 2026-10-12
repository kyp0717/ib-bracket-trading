#!/usr/bin/env bash
# Bracket validation suite. Restarts the app against a paper IB API
# endpoint, runs the API scenario layer, restarts again for the
# reconnect scenario, then runs the Playwright layer.
#
# Usage: run-bracket-test.sh [ib-port]
#   ib-port defaults to 4001 (IB Gateway paper). Use 7497 for TWS
#   paper. Both endpoints are paper accounts, fills cost nothing.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

IB_PORT="${1:-4001}"
LOG=/tmp/bracket-e2e.log
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

echo "== api scenarios, part 1 =="
node test/e2e/bracket/bracket-api.mjs
p1=$?

echo "== restart for reconnect scenario =="
start_app
wait_handshake
echo "IB handshake ok"

echo "== api scenarios, reconnect =="
node test/e2e/bracket/bracket-api.mjs reconnect
p2=$?

echo "== playwright specs =="
node test/e2e/bracket/bracket.spec.mjs
p3=$?

pkill -f "tsx server.ts" 2>/dev/null

echo "== summary =="
[ $p1 -eq 0 ] && echo "api part 1: pass" || echo "api part 1: FAIL"
[ $p2 -eq 0 ] && echo "api reconnect: pass" || echo "api reconnect: FAIL"
[ $p3 -eq 0 ] && echo "playwright: pass" || echo "playwright: FAIL"
[ $p1 -eq 0 ] && [ $p2 -eq 0 ] && [ $p3 -eq 0 ]
