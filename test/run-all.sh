#!/usr/bin/env bash
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PORT="${1:-4001}"

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

echo "== overall =="
[ $i -eq 0 ] && echo "initialization: pass" || echo "initialization: FAIL"
[ $b -eq 0 ] && echo "bracket: pass" || echo "bracket: FAIL"
[ $d -eq 0 ] && echo "depth: pass" || echo "depth: FAIL"
[ $i -eq 0 ] && [ $b -eq 0 ] && [ $d -eq 0 ]
