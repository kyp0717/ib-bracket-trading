#!/usr/bin/env bash
set -uo pipefail

SKILL="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN="$SKILL/.run"

if [ -f "$RUN/pid" ]; then
  PID="$(cat "$RUN/pid")"
  kill -9 -"$PID" 2>/dev/null || true
  rm -f "$RUN/pid"
fi

WEB="$(cat "$RUN/web-port" 2>/dev/null || echo 8080)"
for _ in $(seq 1 20); do
  ss -ltn 2>/dev/null | grep -q ":$WEB " || break
  sleep 0.5
done
if ss -ltn 2>/dev/null | grep -q ":$WEB "; then
  echo "FAIL port $WEB still owned after kill; find and kill the owner manually" >&2
  exit 1
fi
echo "cleanup: app stopped, port $WEB free, evidence left in $SKILL/evidence/"
