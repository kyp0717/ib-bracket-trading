#!/usr/bin/env bash
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

IB_PORT="${1:-4001}"
LOG=/tmp/ticks-e2e.log
export E2E_APP_ADDR="${E2E_APP_ADDR:-http://127.0.0.1:8080}"
export E2E_IB_PORT="$IB_PORT"

start_app() {
  pkill -f "server[.]ts" 2>/dev/null
  sleep 1
  for _ in $(seq 1 20); do ss -tln 2>/dev/null | grep -q ":8080 " && sleep 0.5 || break; done
  setsid nohup npx tsx src/server.ts --ibport "$IB_PORT" > "$LOG" 2>&1 < /dev/null &
}

wait_app() {
  for _ in $(seq 1 15); do
    if grep -q "web ui on" "$LOG" 2>/dev/null; then
      return 0
    fi
    sleep 1
  done
  echo "app failed to start, see $LOG"
  exit 1
}

doctor() {
  if ! npx tsx test/health-check/health-check.ts "$IB_PORT"; then
    echo "health check failed, suites not run"
    pkill -f "server[.]ts" 2>/dev/null
    exit 1
  fi
}

EV=test/evidence

run_files() {
  local rc=0
  local f
  for f in "$@"; do
    echo "-- $f"
    npx tsx "$f" || rc=1
  done
  return $rc
}

save_evidence() {
  mkdir -p "$EV"
  local f="$EV/web-ui-app-$(date +%Y%m%d-%H%M%S).log"
  cp "$LOG" "$f"
  npx tsx test/aws-s3/upload-evidence.ts "$f" 2>/dev/null || true
  echo "evidence saved under $EV"
}

echo "== start app on paper port $IB_PORT =="
start_app
wait_app
doctor
echo "health check ok"

echo "== web-ui scenarios =="
run_files test/web-ui/*.ts
p1=$?

pkill -f "server[.]ts" 2>/dev/null

echo "== summary =="
[ $p1 -eq 0 ] && echo "api: pass" || echo "api: FAIL"
if [ $p1 -ne 0 ]; then
  save_evidence
fi
[ $p1 -eq 0 ]
