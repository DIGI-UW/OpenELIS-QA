#!/bin/bash
# Push one bundle from build.py to the simulated external lab (qa-extlab-fhir) on testing.
# The simulator has no public port, so the transaction goes through the webapp container.
# usage: scripts/fhir-sim/push.sh scripts/fhir-sim/bundles/01-happy-and-skips.json
set -euo pipefail
HOST="${QA_SSH_HOST:-ubuntu@testing.openelis-global.org}"
ssh -o ConnectTimeout=10 "$HOST" \
  "docker exec -i openelisglobal-webapp curl -s -X POST -H 'Content-Type: application/fhir+json' --data-binary @- http://qa-extlab-fhir:8080/fhir" \
  < "$1" | python3 -c "import json,sys; d=json.load(sys.stdin); print([e['response']['status'] for e in d.get('entry',[])] or d)"
