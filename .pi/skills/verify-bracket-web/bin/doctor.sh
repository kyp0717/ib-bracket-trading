#!/usr/bin/env bash
set -uo pipefail

SKILL="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT="$(cd "$SKILL/../../.." && pwd)"
RUN="$SKILL/.run"

[ -f "$RUN/pid" ] || { echo "FAIL no launched app: run launch.sh first"; exit 1; }
PID="$(cat "$RUN/pid")"
PAPER="$(cat "$RUN/paper-port")"
WEB="$(cat "$RUN/web-port")"

echo "== app process =="
if kill -0 -"$PID" 2>/dev/null; then
  echo "PASS app process group $PID alive"
else
  echo "FAIL app process group $PID not alive; relaunch with launch.sh"
  exit 1
fi

echo "== http =="
STATUS="$(curl -sf "http://127.0.0.1:$WEB/status" 2>/dev/null || echo '')"
if [ -n "$STATUS" ]; then
  echo "PASS /status answers: $STATUS"
else
  echo "FAIL /status no answer on http://127.0.0.1:$WEB/status"
fi

echo "== ib paper port =="
if ss -ltn 2>/dev/null | grep -q ":$PAPER "; then
  echo "PASS ib paper port $PAPER accepting connections"
else
  echo "FAIL ib paper port $PAPER not listening: start IB Gateway paper and log in"
fi

echo "== repo health-check (connected + reconciled gate) =="
cd "$ROOT"
E2E_APP_ADDR="http://127.0.0.1:$WEB" npx tsx test/health-check/health-check.ts "$PAPER" \
  || echo "gate: order/data features are blocked until connected and reconciled"
