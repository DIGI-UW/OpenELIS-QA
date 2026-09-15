# Reference-lab referral — captured FHIR

Every file here is a **verbatim capture from a running instance**, pretty-printed and
otherwise unedited. Nothing was hand-authored except the four `peer-*.json` files, which
are the peer-lab simulation described below; those were written into the store and then
read back, so they too are what the server holds.

## Provenance

| | |
|---|---|
| Stack | `~/dev/oe-develop-qa`, `docker compose -p oedevqa -f docker-compose.develop.yml` |
| Images | `itechuw/openelis-global-2:develop`, `itechuw/openelis-global-2-fhir:develop` |
| Product source | DIGI-UW/OpenELIS-Global-2 `develop` @ `5fe0ecb` (OGC-782, PR #4196) |
| FHIR server | HAPI FHIR 6.6.0, R4 (4.0.1), `http://fhir.openelis.org:8080/fhir/` |
| Captured | 2026-09-15 |
| Captured by | `curl` against the store over mutual TLS (see below) |
| Subject | referral id 3, accession `DEV01260000000000129`, seeded by `helpers/referral-seed.ts` |

## There are TWO FHIR surfaces and they are not the same thing

This tripped up the whole investigation, so it is recorded first.

1. **`https://localhost:10443/api/OpenELIS-Global/fhir`** — the webapp's own read facade.
   It answers `application/fhir+json` and a valid R4 `CapabilityStatement`, and it is the
   one reachable from the browser with an ordinary session cookie. It serves only
   `[Device, DiagnosticReport, Location, Observation, Organization, Patient, Practitioner,
   ServiceRequest, Specimen]`. **It does not serve `Task`** — `GET .../fhir/Task` returns
   `HAPI-0302: Unknown resource type 'Task'`. No referral Task can be read or written here.

2. **`https://fhir.openelis.org:8443/fhir/`** (container `external-fhir-api-dev`, host
   ports 19081/19444) — the HAPI JPA **store**, which is what
   `org.openelisglobal.fhirstore.uri` points at and where OpenELIS actually pushes referral
   resources. This is the only place referral `Task`s exist.

   It **requires a client certificate**. Plain `curl -k` gets
   `tlsv13 alert certificate required` and host ports 19081/19444 answer nothing usable
   without one. Everything in this directory was captured through it:

   ```sh
   docker exec openelisglobal-webapp-dev sh -c '
     cd /tmp
     openssl pkcs12 -in /etc/openelis-global/keystore -passin pass:kspass -nokeys  -legacy -out cc.pem
     openssl pkcs12 -in /etc/openelis-global/keystore -passin pass:kspass -nocerts -nodes -legacy -out ck.pem
     curl -sk --cert /tmp/cc.pem --key /tmp/ck.pem \
       https://fhir.openelis.org:8443/fhir/Task/<referral fhirTaskUuid>'
   ```

   The `-legacy` flag is required: the keystore is `pbeWithSHA1And40BitRC2-CBC` and
   OpenSSL 3 refuses it without the legacy provider.

## What is in here

### Outbound — what the instance EMITS for a referral

| File | Notes |
|---|---|
| `task.json` | The referral Task as written on `DRAFT → REQUESTED`. `status: "requested"`, `basedOn`/`focus` → the ServiceRequest, `owner` → the reference-lab Organization, `for` → Patient, `reasonCode.coding[0].system = http://openelis-global.org/refer_reason`. Its `id` **is** the `fhirTaskUuid` the dashboard DTO returns. |
| `servicerequest.json` | The originating analysis. `requisition.value` is the accession. `status: active`, `intent: original-order`, LOINC-coded test. |
| `specimen.json` | `accessionIdentifier` = `<accession>-1`, `request` → the ServiceRequest. |
| `patient.json` | Subject. |
| `practitioner.json` | Requester. |
| `organization-referencelab.json` | The reference lab, `type.coding[0] = {system: .../orgType, code: referralLab}` — this is the org-type link that makes `displayList/REFERRAL_ORGANIZATIONS` non-empty. |

`reasonCode.coding[0]` carries a `system` and **no `code`** even though the referral was
saved with `referralReasonId: 2` ("Confirmation requested"). That is what the server emits.

### Inbound — the peer-lab simulation

`ReferenceLabResultsServiceImpl.acceptReferral` and the OGC-803 poll both go through
`FhirApiWorkFlowServiceImpl.fetchReturnedResultsFromStore`, which runs exactly two searches
against `org.openelisglobal.remote.source.uri`:

```
Task?_id=<referralTaskUuid>&status=completed&_include=Task:based-on&_include=ServiceRequest:requester
ServiceRequest?status=completed&based-on=ServiceRequest/<original>&_revinclude=Observation:based-on&_revinclude=DiagnosticReport:based-on
```

The four `peer-*.json` files are the minimum set that satisfies both. They were `PUT` into
the store (`200`, `201`, `201`, `201`) and both searches then returned what OpenELIS
expects — the bundles in `poll-completed-task-bundle.json` (`total: 1`) and
`poll-returned-results-bundle.json` (ServiceRequest + Observation + DiagnosticReport).

| File | Notes |
|---|---|
| `peer-task-completed.json` | The instance's own Task with `status` flipped to `completed`. This is what a peer OpenELIS does to acknowledge completion. |
| `peer-servicerequest.json` | The peer's filler order: `basedOn` → the ORIGINAL ServiceRequest, `status: completed`. Both are required by the second search. |
| `peer-observation.json` | `basedOn` → the peer ServiceRequest. Exercises every branch of `toResultCard`: `valueQuantity` + unit, `interpretation` (H), `referenceRange` low/high, and a `note`. |
| `peer-diagnosticreport.json` | `basedOn` → the peer ServiceRequest, `result` → the Observation. **This is OGC-805's payload.** |

**These are pull-side fixtures, not push-side.** There is no endpoint on this instance that
accepts an inbound DiagnosticReport. Routing is a poll OpenELIS runs against
`remote.source.uri`; see the QA notes in `tests/reference-lab-results-fhir-contract.spec.ts`.

## Synthetic data statement

The only person-shaped data is the QA harness's own fixture patient, **Abby Sebby,
nationalId `0123456`**, created by `data.setup.ts` and already named in that file and in
`helpers/test-helpers.ts`. The practitioner is "QA Seeder", the organization is
"QA_AUTO Reference Lab Alpha", the phone/email are `555-0101` / `qa_auto@example.invalid`.
Nothing here originates from a real patient, provider or facility.
