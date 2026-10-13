#!/usr/bin/env bash
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

IB_PORT="${1:-4001}"
LOG=/tmp/depth-e2e.log
export E2E_APP_ADDR="${E2E_APP_ADDR:-http://127.0.0.1:8080}"

start_app() {
  pkill -f "tsx server.ts" 2>/dev/null
  sleep 1
  setsid nohup npx tsx server.ts --ibport "$IB_PORT" > "$LOG" 2>&1 < /dev/null &
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
    pkill -f "tsx server.ts" 2>/dev/null
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
  cp "$LOG" "$EV/depth-app-$(date +%Y%m%d-%H%M%S).log"
  echo "evidence saved under $EV"
}

echo "== start app on paper port $IB_PORT =="
start_app
wait_app
doctor
echo "health check ok"

echo "== api scenarios =="
run_files test/depth/api/*.ts
p1=$?

echo "== gui scenarios =="
run_files test/depth/web/*.ts
p2=$?

pkill -f "tsx server.ts" 2>/dev/null

echo "== summary =="
[ $p1 -eq 0 ] && echo "api: pass" || echo "api: FAIL"
[ $p2 -eq 0 ] && echo "gui: pass" || echo "gui: FAIL"
if [ $p1 -ne 0 ] || [ $p2 -ne 0 ]; then
  save_evidence
fi
[ $p1 -eq 0 ] && [ $p2 -eq 0 ]
