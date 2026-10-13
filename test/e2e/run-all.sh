#!/usr/bin/env bash
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

PORT="${1:-4001}"

bash test/e2e/bracket/run-bracket-test.sh "$PORT"
b=$?

bash test/e2e/depth/run-depth-test.sh "$PORT"
d=$?

echo "== overall =="
[ $b -eq 0 ] && echo "bracket: pass" || echo "bracket: FAIL"
[ $d -eq 0 ] && echo "depth: pass" || echo "depth: FAIL"
[ $b -eq 0 ] && [ $d -eq 0 ]
