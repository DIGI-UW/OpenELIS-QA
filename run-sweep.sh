#!/bin/bash
# Run every runnable config in sequence and print a per-config tail.
# Usage:  BASE=https://your-instance ./run-sweep.sh
set -u
cd "$(dirname "$0")" || exit 1
export BASE=${BASE:-https://testing.openelis-global.org}
export BASE_URL=$BASE
for c in guards probes e2e deep cfg lp tc disc timing rbac all-tc regression-chains personas-admin; do
  if [ -f "$c.config.ts" ]; then
    echo "=====CONFIG $c"
    npx playwright test --config="$c.config.ts" --reporter=line 2>&1 | tail -12
  fi
done
echo =====SWEEP_DONE
