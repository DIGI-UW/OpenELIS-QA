# develop-stack: develop `ee6340a8`

feat: add PatientIdDocumentService integration tests (#4228)

Run: https://github.com/DIGI-UW/OpenELIS-QA/actions/runs/40022918778 · TZ UTC · 2026-10-24T00:29:16.363Z

**4 NEW FAILURE(S)**: 95 failing = 91 known + 4 new; 3 known reds now pass.

| suite | passed | failing | new | known reds now passing |
| --- | ---: | ---: | ---: | ---: |
| all-tc | 353 | 7 | 0 | 0 |
| census | 126 | 3 | 0 | 0 |
| cfg | 3 | 0 | 0 | 0 |
| deep | 0 | 1 | 0 | 0 |
| disc | 1 | 0 | 0 | 0 |
| e2e | 15 | 3 | 0 | 0 |
| envseed | 3 | 0 | 0 | 0 |
| eqa | 3 | 0 | 0 | 0 |
| guards | 17 | 2 | 0 | 0 |
| lp | 7 | 3 | 0 | 0 |
| modify-order | 7 | 1 | 0 | 0 |
| modules | 1258 | 51 | 4 | 3 |
| multicomponent | 3 | 0 | 0 | 0 |
| ogc1192 | 9 | 0 | 0 | 0 |
| panel-leak | 5 | 0 | 0 | 0 |
| personas-admin | 10 | 2 | 0 | 0 |
| personas-roles | 13 | 1 | 0 | 0 |
| pr3987 | 10 | 3 | 0 | 0 |
| preflight | 4 | 0 | 0 | 0 |
| probe-combo | 3 | 0 | 0 | 0 |
| qa | 0 | 1 | 0 | 0 |
| rbac | 57 | 0 | 0 | 0 |
| regression-chains | 83 | 14 | 0 | 0 |
| regression-seed | 13 | 1 | 0 | 0 |
| reval2 | 4 | 0 | 0 | 0 |
| revalidate | 3 | 0 | 0 | 0 |
| revalidate-unauth | 3 | 0 | 0 | 0 |
| rtype | 2 | 2 | 0 | 0 |
| workplan | 4 | 0 | 0 | 0 |

## New failures (4)

- `modules|modules|tests/eqa-workflow.spec.ts|Suite AZ-EQA-ADMIN — EQA Program & Distribution Administration > TC-EQA-ADMIN-01: EQA Program Management page loads`
- `modules|modules|tests/notebook-project.spec.ts|Notebook project form (TC-ELNW) > TC-ELNW-05: an edited project Objective is kept`
- `modules|modules|tests/order-entry-defaults.spec.ts|Add Order defaults (UTC+10) > TC-OED-00: CANARY the order saved with the received date and time entered`
- `modules|modules|tests/reports-output-correctness.spec.ts|Date pickers on a full page load (R26) > TC-DP-01: after a full load the picker maxDate is today, not 9 January`

## Known reds now passing (remove from ci-known-reds.json, check the ticket) (3)

- `modules|modules|tests/order-entry-off-happy-path.spec.ts|Order entry off the happy path > TC-OEX-11: Enter Order: a late response for the previous sample type does not replace the list (OGC-1266)`
- `modules|modules|tests/order-entry-off-happy-path.spec.ts|Order entry off the happy path > TC-OEX-12: Enter Order: a failed tests request does not leave "Loading" forever (OGC-1266)`
- `modules|modules|tests/order-entry-release-blockers.spec.ts|Order entry — release blockers > BLK-LAB-4 — a field marked required to sighted users is marked required in the DOM`

## Known reds by ticket

- untriaged: 64
- OGC-730: 13
- harness: 8
- OGC-1448: 2
- OGC-189: 2
- OGC-1446: 1
- OGC-1367: 1
