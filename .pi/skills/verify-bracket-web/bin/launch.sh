#!/usr/bin/env bash
set -euo pipefail

SKILL="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT="$(cd "$SKILL/../../.." && pwd)"
RUN="$SKILL/.run"
mkdir -p "$RUN"

HOST="$(hostname | cut -d. -f1)"
case "$HOST" in
  woodlawn) PAPER=4002 ;;
  linden)   PAPER=4002 ;;
  *)
    echo "unknown host '$HOST': add its paper port to $0 before driving" >&2
    exit 2
    ;;
esac

WEB_PORT="${WEB_PORT:-8080}"
if ss -ltn 2>/dev/null | grep -q ":${WEB_PORT} "; then
  echo "refusing: port $WEB_PORT is already owned" >&2
  echo "an app instance may be running; run cleanup.sh first, never double-drive the shared paper account" >&2
  exit 1
fi

LOG="$RUN/app.log"
: > "$LOG"
cd "$ROOT"
setsid npx tsx src/server.ts --ibport "$PAPER" --port "$WEB_PORT" > "$LOG" 2>&1 < /dev/null &
PID=$!

for _ in $(seq 1 20); do
  grep -q "web ui on" "$LOG" 2>/dev/null && break
  sleep 0.5
done
if ! grep -q "web ui on" "$LOG"; then
  echo "app failed to start; see $LOG" >&2
  kill -9 -"$PID" 2>/dev/null || true
  exit 1
fi

printf '%s' "$PID" > "$RUN/pid"
printf '%s' "$PAPER" > "$RUN/paper-port"
printf '%s' "$WEB_PORT" > "$RUN/web-port"
printf '%s' "$HOST" > "$RUN/host"

echo "app up: http://localhost:$WEB_PORT  paper ibPort=$PAPER  host=$HOST  pgroup=$PID"
echo "log: $LOG"
