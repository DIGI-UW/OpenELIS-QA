#!/usr/bin/env bash
#
# scripts/mint-returned-referral.sh <referralId> [timeoutSeconds]
#
# Move one referral into the "Returned — needs action" bucket by simulating the peer
# laboratory, so that the OGC-803 Accept action and the OGC-804 Reject action have a
# subject to act on.
#
# WHY THIS EXISTS
# ---------------
# Accept and Reject are both RETURNED-only in the UI (`ExpandPanel`, mode === "returned"),
# and a referral only reaches RETURNED when its status is COMPLETED. Nothing inside this
# instance can write COMPLETED:
#
#   * `markReferralCompleted` is called from exactly one place —
#     `FhirApiWorkFlowServiceImpl.beginTaskImportResultsPath`, a @Scheduled poll that runs
#     every `org.openelisglobal.remote.poll.frequency` ms (default 120000) against
#     `org.openelisglobal.remote.source.uri`; and
#   * `markReferralCompletedFromManualEntry` sets `manually_entered`, which
#     `belongsInBucket` routes to History, never to Returned.
#
# So the only honest way to fill the bucket is to BE the peer lab: write the four
# resources the poll looks for into the FHIR store, then let the poll find them. That is
# what this does. It writes no rows in the OpenELIS database; every state change is made
# by the application itself.
#
# WHAT THE POLL LOOKS FOR (FhirApiWorkFlowServiceImpl.fetchReturnedResultsFromStore)
#   Task?_id=<referral fhirTaskUuid>&status=completed&_include=Task:based-on
#        &_include=ServiceRequest:requester
#   ServiceRequest?status=completed&based-on=ServiceRequest/<original>
#        &_revinclude=Observation:based-on&_revinclude=DiagnosticReport:based-on
#
# Both must answer non-empty. The four resources below are the minimum set that does it;
# they are the `fixtures/fhir/referral/peer-*.json` captures, re-pointed at the referral
# named on the command line.
#
# LOCAL STACK ONLY. The store requires a client certificate that lives in the webapp
# container's keystore, and the keystore is pbeWithSHA1And40BitRC2-CBC, which OpenSSL 3
# refuses without `-legacy`. Both are why this is a script and not a Playwright fixture.
#
#   ./scripts/mint-returned-referral.sh 4
#   ./scripts/mint-returned-referral.sh 4 420        # longer wait for a slow poll
#
# Environment overrides: WEBAPP_CONTAINER, DB_CONTAINER, STORE_URL.
set -euo pipefail

REFERRAL_ID="${1:?usage: mint-returned-referral.sh <referralId> [timeoutSeconds]}"
TIMEOUT="${2:-300}"
WEBAPP_CONTAINER="${WEBAPP_CONTAINER:-openelisglobal-webapp-dev}"
DB_CONTAINER="${DB_CONTAINER:-openelisglobal-database-dev}"
STORE_URL="${STORE_URL:-https://localhost:19444/fhir}"
CERT_DIR="${TMPDIR:-/tmp}/oeqa-fhir-cert"

psql_() { docker exec "$DB_CONTAINER" psql -U clinlims -d clinlims -tAc "$1"; }

row=$(psql_ "select coalesce(fhir_uuid::text,'') || '|' || status from clinlims.referral where id = '${REFERRAL_ID}'")
[ -n "$row" ] || { echo "no referral with id ${REFERRAL_ID}" >&2; exit 1; }
TASK_UUID="${row%%|*}"
STATUS="${row##*|}"
[ -n "$TASK_UUID" ] || { echo "referral ${REFERRAL_ID} has no fhir_uuid; it was not created through the order-entry path and has no Task in the store" >&2; exit 1; }

case "$STATUS" in
  COMPLETED) echo "referral ${REFERRAL_ID} is already COMPLETED; nothing to mint"; exit 0 ;;
  REQUESTED|RECEIVED|IN_PROGRESS) ;;
  *) echo "referral ${REFERRAL_ID} is ${STATUS}; the poll only advances REQUESTED/RECEIVED/IN_PROGRESS (getSentReferrals)" >&2; exit 1 ;;
esac

# ---- client certificate ------------------------------------------------------------
mkdir -p "$CERT_DIR"
if [ ! -s "$CERT_DIR/cc.pem" ] || [ ! -s "$CERT_DIR/ck.pem" ]; then
  docker exec "$WEBAPP_CONTAINER" sh -c '
    cd /tmp
    openssl pkcs12 -in /etc/openelis-global/keystore -passin pass:kspass -nokeys  -legacy -out cc.pem
    openssl pkcs12 -in /etc/openelis-global/keystore -passin pass:kspass -nocerts -nodes -legacy -out ck.pem' >/dev/null 2>&1
  docker cp "$WEBAPP_CONTAINER":/tmp/cc.pem "$CERT_DIR/cc.pem" >/dev/null
  docker cp "$WEBAPP_CONTAINER":/tmp/ck.pem "$CERT_DIR/ck.pem" >/dev/null
fi
CURL=(curl -sk --cert "$CERT_DIR/cc.pem" --key "$CERT_DIR/ck.pem")

# ---- read the instance's own Task, then answer it as the peer would ----------------
task_json=$("${CURL[@]}" -H 'Accept: application/fhir+json' "${STORE_URL}/Task/${TASK_UUID}")
echo "$task_json" | grep -q '"resourceType": *"Task"' || {
  echo "no Task ${TASK_UUID} in ${STORE_URL}; the referral was dispatched but its Task never reached the store" >&2
  echo "${task_json:0:400}" >&2
  exit 1
}

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
printf '%s' "$task_json" > "$work/task.json"

python3 - "$work" "$REFERRAL_ID" <<'PY'
import json, sys
work, ref = sys.argv[1], sys.argv[2]
task = json.load(open(f"{work}/task.json"))

orig_sr = (task.get("focus") or {}).get("reference") or (task.get("basedOn") or [{}])[0].get("reference")
subject = (task.get("for") or {}).get("reference")
if not orig_sr or not subject:
    raise SystemExit(f"Task {task.get('id')} carries no focus/for; nothing to base a peer answer on")

sr_id  = f"qa-auto-peer-sr-ref{ref}"
obs_id = f"qa-auto-peer-obs-ref{ref}"
dr_id  = f"qa-auto-peer-dr-ref{ref}"
LOINC  = {"coding": [{"system": "http://loinc.org", "code": "2345-7", "display": "Glucose"}], "text": "Glucose"}

# 1. the instance's own Task, acknowledged completed — what a peer OpenELIS does.
task["status"] = "completed"

# 2. the peer's filler order, basedOn the original ServiceRequest.
sr = {"resourceType": "ServiceRequest", "id": sr_id,
      "basedOn": [{"reference": orig_sr}], "status": "completed", "intent": "filler-order",
      "code": LOINC, "subject": {"reference": subject}}

# 3. the returned Observation. Deliberately flagged High with a reference range: that is
#    what makes acceptReferral raise the OGC-803 critical-result Alert, and a fixture
#    that never exercises the flag would leave that branch untested.
obs = {"resourceType": "Observation", "id": obs_id,
       "basedOn": [{"reference": f"ServiceRequest/{sr_id}"}], "status": "final",
       "code": LOINC, "subject": {"reference": subject},
       "effectiveDateTime": "2026-09-14T10:00:00+00:00",
       "valueQuantity": {"value": 11.2, "unit": "mmol/L",
                         "system": "http://unitsofmeasure.org", "code": "mmol/L"},
       "interpretation": [{"coding": [{"system": "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation",
                                       "code": "H", "display": "High"}]}],
       "referenceRange": [{"low": {"value": 3.9, "unit": "mmol/L"},
                           "high": {"value": 5.6, "unit": "mmol/L"}}],
       "note": [{"text": f"QA_AUTO peer-returned result for referral {ref}"}]}

# 4. the report that carries it — OGC-805's payload.
dr = {"resourceType": "DiagnosticReport", "id": dr_id,
      "basedOn": [{"reference": f"ServiceRequest/{sr_id}"}], "status": "final",
      "code": LOINC, "subject": {"reference": subject},
      "issued": "2026-09-14T10:05:00+00:00",
      "result": [{"reference": f"Observation/{obs_id}"}],
      "conclusion": f"QA_AUTO peer-returned report for referral {ref}"}

for name, res in (("task", task), ("sr", sr), ("obs", obs), ("dr", dr)):
    json.dump(res, open(f"{work}/{name}.out.json", "w"))
PY

put() { # put <resourceType> <id> <file>
  code=$("${CURL[@]}" -o /dev/null -w '%{http_code}' -X PUT \
    -H 'Content-Type: application/fhir+json' --data-binary @"$3" "${STORE_URL}/$1/$2")
  echo "  PUT $1/$2 -> $code"
  case "$code" in 200|201) ;; *) echo "peer write failed" >&2; exit 1 ;; esac
}
echo "minting a peer answer for referral ${REFERRAL_ID} (Task ${TASK_UUID}):"
put Task             "$TASK_UUID"                  "$work/task.out.json"
put ServiceRequest   "qa-auto-peer-sr-ref${REFERRAL_ID}"  "$work/sr.out.json"
put Observation      "qa-auto-peer-obs-ref${REFERRAL_ID}" "$work/obs.out.json"
put DiagnosticReport "qa-auto-peer-dr-ref${REFERRAL_ID}"  "$work/dr.out.json"

# ---- wait for the application's own poll to notice ---------------------------------
echo "waiting up to ${TIMEOUT}s for the import poll (default cadence 120s)..."
deadline=$(( $(date +%s) + TIMEOUT ))
while [ "$(date +%s)" -lt "$deadline" ]; do
  now=$(psql_ "select status from clinlims.referral where id = '${REFERRAL_ID}'")
  if [ "$now" = "COMPLETED" ]; then
    echo "referral ${REFERRAL_ID} is COMPLETED — it is now in the Returned bucket"
    exit 0
  fi
  sleep 10
done
echo "referral ${REFERRAL_ID} is still ${now} after ${TIMEOUT}s." >&2
echo "Check that org.openelisglobal.remote.source.uri is set in the stack's common.properties;" >&2
echo "fetchReturnedResultsFromStore returns empty immediately when getRemoteStoreIdentifier() is empty." >&2
exit 1
