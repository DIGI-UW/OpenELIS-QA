# Deep-coverage build-out — Chains O–S (v6.16)

Graduates five previously **render-only** flat suites into deep round-trip
chains with a landing check at every handoff. Endpoints were captured live on
indonesiadev v3.2.1.10 (2026-06-18) and cross-checked against the
OpenELIS-Global-2 frontend source. Constants live in `_common.ts`.

| Chain | Workflow | Real endpoints driven | Round-trip / landing check |
|---|---|---|---|
| **O** | Referral (Referred-Out) | `GET /rest/ReferredOutTests` (+search), `/rest/test-list`, `/rest/user-test-sections/{role}` | form + filter sources → search returns `referralDisplayItems[]` (acc/analysisId/status) → analysisId feeds patient report |
| **P** | Patient merge (non-destructive) | `GET /rest/patient-search-results`, `GET /rest/patient/merge/details/{id}`, `POST /rest/patient/merge/validate` | search 2 patients → details preview → **validate (confirmed:false)** returns result; destructive `execute` documented, NOT run |
| **Q** | Batch order entry | `GET /rest/SamplePatientEntry`, `GET /rest/departments-for-site?refferingSiteId=`, `POST /rest/SampleBatchEntry` | preform site list → departments → batch submit advances wizard → shares standard create path |
| **R** | Sample shipment | `GET /rest/shipping-box`, `/generate-box-number`, `/box-label-prefix`, `displayList/REFERRAL_{ORGANIZATIONS,REASONS}`, `POST /rest/shipping-box`, `GET /rest/shipping-box/by-box-id/{id}`, `/rest/box-sample/items/by-box/{id}` | box list read-back + generators + dicts → **create box → verify it lands in the list** → reception read-back |
| **S** | Aliquot lineage | `GET /rest/SampleItem?accessionNumber=`, `POST /rest/Aliquot` | read parent items+analyses → **POST aliquot → re-read, assert lineage landed** → parent.{n} id convention |

## Resilience contract (same as Chains M/N)
Registered to run against any instance. When a domain is absent (older build →
404), no actionable data exists, or a mutating request **body shape** is
rejected (4xx), the affected step records `GAP` and continues with the
confirmed endpoint noted — it never fabricates a pass. Destructive operations
(patient merge `execute`) are deliberately not invoked.

## Remaining follow-up (to flip the last GAPs green)
Pin the exact request **bodies** for `POST /rest/SampleBatchEntry` (full batch
form + sampleXML), `POST /rest/shipping-box` (box create), and confirm the
`POST /rest/Aliquot` quantity-balance rules — the URLs and methods are
confirmed; only the payload shapes remain.

Run: `npx playwright test --project=chain-o` … `--project=chain-s`.
