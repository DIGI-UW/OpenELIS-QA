# develop-stack: develop `5f48f702`

feat(notifications): Result Delivery foundation (OGC-439) (#4755)

Run: https://github.com/DIGI-UW/OpenELIS-QA/actions/runs/38980249078 · TZ UTC · 2026-10-17T02:27:06.014Z

**12 NEW FAILURE(S)**: 142 failing = 130 known + 12 new; 2 known reds now pass.

| suite | passed | failing | new | known reds now passing |
| --- | ---: | ---: | ---: | ---: |
| all-tc | 348 | 12 | 4 | 0 |
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
| modules | 1170 | 93 | 7 | 2 |
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

## New failures (12)

- `modules|modules|tests/order-entry-defaults.spec.ts|Add Order defaults (UTC+10) > TC-I18NK-04: payment status options are labels, not message keys`
- `modules|modules|tests/order-entry-duplicate-patient.spec.ts|TC-DUPPAT-03 existing patient chosen from the search stays one patient (guard)`
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

## Known reds now passing (remove from ci-known-reds.json, check the ticket) (2)

- `modules|modules|tests/order-entry-defaults.spec.ts|Add Order defaults (UTC+10) > TC-OED-00: CANARY the order saved with the received date and time entered`
- `modules|modules|tests/reports-output-correctness.spec.ts|Date pickers on a full page load (R26) > TC-DP-01: after a full load the picker maxDate is today, not 9 January`

## Known reds by ticket

- untriaged: 108
- OGC-730: 13
- harness: 2
- OGC-1448: 2
- OGC-189: 2
- OGC-1240: 1
- OGC-1446: 1
- OGC-1367: 1
