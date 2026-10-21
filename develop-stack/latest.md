# develop-stack: develop `8a870f78`

Update OpenELIS translations from Transifex (#4785)

Run: https://github.com/DIGI-UW/OpenELIS-QA/actions/runs/39564841127 · TZ Pacific/Port_Moresby · 2026-10-21T11:32:03.878Z

**14 NEW FAILURE(S)**: 142 failing = 128 known + 14 new; 4 known reds now pass.

| suite | passed | failing | new | known reds now passing |
| --- | ---: | ---: | ---: | ---: |
| all-tc | 350 | 11 | 4 | 1 |
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
| modules | 1195 | 94 | 9 | 3 |
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

## New failures (14)

- `modules|modules|tests/order-entry-defaults.spec.ts|Add Order defaults (UTC+10) > TC-TZ-05: Reception Time defaults to the local clock`
- `modules|modules|tests/order-entry.spec.ts|Add Order workflow > TC-AO-02: Patient search finds existing patient`
- `modules|modules|tests/report-print-queue.spec.ts|Report Print Queue: printing and versions > TC-RPQ-13 a changed printed result makes it Amended; the reprint is an amended version with the corrected banner, and later releases keep Amended (AC-5)`
- `modules|modules|tests/report-print-queue.spec.ts|Report Print Queue: through the screens > TC-RPQ-44 a Reports user on Hematology sees no Biochemistry order: not listed, not found by lookup, 404 on detail, print and archived PDF (BR-9)`
- `modules|modules|tests/reports-openpdf.spec.ts|Patient Status Report (PatientResultsPdf) > TC-RPTPDF-01 by lab number range: one OpenPDF document on the site paper, the patient, every order`
- `modules|modules|tests/reports-openpdf.spec.ts|Patient Status Report (PatientResultsPdf) > TC-RPTPDF-03 unvalidated results are not printed; a rejected sample says so`
- `modules|modules|tests/reports-openpdf.spec.ts|Patient Status Report (PatientResultsPdf) > TC-RPTPDF-04 every continuation page names the patient and order it belongs to`
- `modules|modules|tests/reports-openpdf.spec.ts|Printed Reports Configuration: paper size and page numbers > TC-RPTPDF-50 Letter with page numbers: the reports follow the setting, then the saved settings come back`
- `modules|modules|tests/validation-review-panel.spec.ts|Validation review panel provenance > TC-TZ-06: "Entered on" shows the local time the result was saved`
- `regression-chains|chain-a|tests/chains/chain-a-order-lifecycle.spec.ts|Chain A — Order Lifecycle > Step 6 — Lab number present on PDF (REPORTABLE)`
- `all-tc|test-catalog|test-catalog-chaos-links.spec.ts|Test Catalog chaos: Reagents (TC-CX-RE) > TC-CX-RE-01: a reagent save that fails keeps the quantity the admin typed, so a retry can send it`
- `all-tc|test-catalog|test-catalog-chaos-links.spec.ts|Test Catalog chaos: Reagents (TC-CX-RE) > TC-CX-RE-02: impossible quantities and over-long units are 4xx, never 500`
- `all-tc|test-catalog|test-catalog-chaos-links.spec.ts|Test Catalog chaos: Reagents (TC-CX-RE) > TC-CX-RE-03: lifecycle: link a reagent, change quantity and unit, unlink; a second unlink is a 404`
- `all-tc|test-catalog|test-catalog-chaos-links.spec.ts|Test Catalog chaos: Reagents (TC-CX-RE) > TC-CX-RE-04: linking two reagents where one link fails: the list shows the one that worked and a retry finishes the job`

## Known reds now passing (remove from ci-known-reds.json, check the ticket) (4)

- `modules|modules|tests/order-entry-defaults.spec.ts|Add Order defaults (UTC+10) > TC-OED-00: CANARY the order saved with the received date and time entered`
- `modules|modules|tests/reports-output-correctness.spec.ts|Date pickers on a full page load (R26) > TC-DP-01: after a full load the picker maxDate is today, not 9 January`
- `modules|modules|tests/session-security.spec.ts|Suite U-DEEP — Security Headers & Rate Limiting (TC-SESS-09–16) > TC-SESS-16: Session expiry returns 401/302, not 500`
- `all-tc|test-catalog|test-catalog-section-depth.spec.ts|Localization > TC-SD-21: a renamed test shows its new name in the test pickers`

## Known reds by ticket

- untriaged: 106
- OGC-730: 13
- harness: 2
- OGC-1448: 2
- OGC-189: 2
- OGC-1240: 1
- OGC-1446: 1
- OGC-1367: 1
