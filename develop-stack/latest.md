# develop-stack: develop `e1f2b693`

fix(reports): Report Print Queue QA follow-ups from the 19 Oct pass (OGC-431) (#4771)

Run: https://github.com/DIGI-UW/OpenELIS-QA/actions/runs/39435789950 · TZ UTC · 2026-10-20T17:16:44.848Z

**13 NEW FAILURE(S)**: 144 failing = 131 known + 13 new; 2 known reds now pass.

| suite | passed | failing | new | known reds now passing |
| --- | ---: | ---: | ---: | ---: |
| all-tc | 349 | 11 | 4 | 1 |
| census | 126 | 3 | 0 | 0 |
| cfg | 3 | 0 | 0 | 0 |
| deep | 0 | 4 | 2 | 0 |
| disc | 1 | 0 | 0 | 0 |
| e2e | 15 | 3 | 0 | 0 |
| envseed | 3 | 0 | 0 | 0 |
| eqa | 3 | 0 | 0 | 0 |
| guards | 17 | 2 | 0 | 0 |
| lp | 7 | 3 | 0 | 0 |
| modify-order | 7 | 1 | 0 | 0 |
| modules | 1165 | 93 | 6 | 1 |
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
| regression-chains | 83 | 14 | 1 | 0 |
| regression-seed | 13 | 1 | 0 | 0 |
| reval2 | 4 | 0 | 0 | 0 |
| revalidate | 3 | 0 | 0 | 0 |
| revalidate-unauth | 3 | 0 | 0 | 0 |
| rtype | 2 | 2 | 0 | 0 |
| workplan | 4 | 0 | 0 | 0 |

## New failures (13)

- `modules|modules|tests/notebook-project.spec.ts|Notebook project form (TC-ELNW) > TC-ELNW-05: an edited project Objective is kept`
- `modules|modules|tests/order-entry.spec.ts|Add Order workflow > TC-AO-02: Patient search finds existing patient`
- `modules|modules|tests/reports-openpdf.spec.ts|Patient Status Report (PatientResultsPdf) > TC-RPTPDF-01 by lab number range: one OpenPDF document on the site paper, the patient, every order`
- `modules|modules|tests/reports-openpdf.spec.ts|Patient Status Report (PatientResultsPdf) > TC-RPTPDF-03 unvalidated results are not printed; a rejected sample says so`
- `modules|modules|tests/reports-openpdf.spec.ts|Patient Status Report (PatientResultsPdf) > TC-RPTPDF-04 every continuation page names the patient and order it belongs to`
- `modules|modules|tests/reports-openpdf.spec.ts|Printed Reports Configuration: paper size and page numbers > TC-RPTPDF-50 Letter with page numbers: the reports follow the setting, then the saved settings come back`
- `regression-chains|chain-a|tests/chains/chain-a-order-lifecycle.spec.ts|Chain A — Order Lifecycle > Step 6 — Lab number present on PDF (REPORTABLE)`
- `all-tc|test-catalog|test-catalog-chaos-links.spec.ts|Test Catalog chaos: Reagents (TC-CX-RE) > TC-CX-RE-01: a reagent save that fails keeps the quantity the admin typed, so a retry can send it`
- `all-tc|test-catalog|test-catalog-chaos-links.spec.ts|Test Catalog chaos: Reagents (TC-CX-RE) > TC-CX-RE-02: impossible quantities and over-long units are 4xx, never 500`
- `all-tc|test-catalog|test-catalog-chaos-links.spec.ts|Test Catalog chaos: Reagents (TC-CX-RE) > TC-CX-RE-03: lifecycle: link a reagent, change quantity and unit, unlink; a second unlink is a 404`
- `all-tc|test-catalog|test-catalog-chaos-links.spec.ts|Test Catalog chaos: Reagents (TC-CX-RE) > TC-CX-RE-04: linking two reagents where one link fails: the list shows the one that worked and a retry finishes the job`
- `deep||test-catalog-mgmt-deep.spec.ts|TC-DEEP-TERMINOLOGY: add a terminology mapping reads back via REST [ROUND-TRIP]`
- `deep||test-catalog-mgmt-deep.spec.ts|TC-DEEP-STORAGE: set storage condition reads back via REST [ROUND-TRIP]`

## Known reds now passing (remove from ci-known-reds.json, check the ticket) (2)

- `modules|modules|tests/session-security.spec.ts|Suite U-DEEP — Security Headers & Rate Limiting (TC-SESS-09–16) > TC-SESS-16: Session expiry returns 401/302, not 500`
- `all-tc|test-catalog|test-catalog-section-depth.spec.ts|Localization > TC-SD-21: a renamed test shows its new name in the test pickers`

## Known reds by ticket

- untriaged: 109
- OGC-730: 13
- harness: 2
- OGC-1448: 2
- OGC-189: 2
- OGC-1240: 1
- OGC-1446: 1
- OGC-1367: 1
