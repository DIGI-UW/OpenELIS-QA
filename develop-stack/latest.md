# develop-stack: develop `a2e66aed`

fix(microbiology): keyboard focus, contrast and offline handling on the V2 case pages (OGC-890)

Run: https://github.com/DIGI-UW/OpenELIS-QA/actions/runs/43961492669 · TZ UTC · 2026-11-17T00:17:55.820Z

**6 NEW FAILURE(S)**: 154 failing = 148 known + 6 new; 12 known reds now pass.

| suite | passed | failing | new | known reds now passing |
| --- | ---: | ---: | ---: | ---: |
| all-tc | 360 | 9 | 0 | 0 |
| census | 125 | 4 | 0 | 0 |
| cfg | 3 | 0 | 0 | 0 |
| deep | 0 | 1 | 0 | 0 |
| disc | 1 | 0 | 0 | 0 |
| e2e | 15 | 3 | 0 | 0 |
| envseed | 3 | 0 | 0 | 0 |
| eqa | 3 | 0 | 0 | 0 |
| guards | 17 | 2 | 0 | 0 |
| lp | 10 | 0 | 0 | 3 |
| modify-order | 7 | 1 | 0 | 0 |
| modules | 1323 | 110 | 6 | 9 |
| multicomponent | 3 | 0 | 0 | 0 |
| ogc1192 | 4 | 1 | 0 | 0 |
| panel-leak | 5 | 0 | 0 | 0 |
| personas-admin | 10 | 2 | 0 | 0 |
| personas-roles | 13 | 1 | 0 | 0 |
| pr3987 | 10 | 3 | 0 | 0 |
| preflight | 4 | 0 | 0 | 0 |
| probe-combo | 3 | 0 | 0 | 0 |
| qa | 0 | 1 | 0 | 0 |
| rbac | 57 | 0 | 0 | 0 |
| regression-chains | 84 | 13 | 0 | 0 |
| regression-seed | 13 | 1 | 0 | 0 |
| reval2 | 4 | 0 | 0 | 0 |
| revalidate | 3 | 0 | 0 | 0 |
| revalidate-unauth | 3 | 0 | 0 | 0 |
| rtype | 2 | 2 | 0 | 0 |
| workplan | 4 | 0 | 0 | 0 |

## New failures (6)

- `modules|modules|tests/generic-sample-roundtrip.spec.ts|Generic Sample round trip > TC-GSR-00: a generic sample order saves`
- `modules|modules|tests/generic-sample.spec.ts|Suite GEN-EXT — Generic Sample Extended > TC-GEN-EXT-03: Generic Sample Order form has required accession field`
- `modules|modules|tests/notebook-project.spec.ts|Notebook project form (TC-ELNW) > TC-ELNW-05: an edited project Objective is kept`
- `modules|modules|tests/order-entry-defaults.spec.ts|Add Order defaults (UTC+10) > TC-OED-00: CANARY the order saved with the received date and time entered`
- `modules|modules|tests/reports-openpdf.spec.ts|Activity, rejection and referral reports (ManagementReportPdf, ReferredOutReport) > TC-RPTPDF-11 Activity Report by test produces the report (not a 500)`
- `modules|modules|tests/reports-output-correctness.spec.ts|Date pickers on a full page load (R26) > TC-DP-01: after a full load the picker maxDate is today, not 9 January`

## Known reds now passing (remove from ci-known-reds.json, check the ticket) (12)

- `modules|modules|tests/calculated-values.spec.ts|Calculated Values Management (Phase 28) > TC-CALC-03: Formula builder supports autocomplete test selection`
- `modules|modules|tests/cphl-field-report.spec.ts|Site Information: a translated setting saves (OGC-1609) > TC-CPHL-50: changing the banner on Site Information saves, shows in the header and survives a reload`
- `modules|modules|tests/electronic-signature.spec.ts|Suite AY-ESIG-ADMIN — Site Information & Electronic Signature Config > TC-ESIG-02: Site Information sub-sections are visible`
- `modules|modules|tests/order-creation-e2e.spec.ts|Phase 32 — Order Creation E2E via UI > TC-ORD-13: Submit order and verify success message`
- `modules|modules|tests/performance.spec.ts|Performance Smoke (TC-PERF) > TC-PERF-02: Add Order wizard step transition time`
- `modules|modules|tests/reports.spec.ts|Phase 4 — L-DEEP: Reports Generation > TC-L-DEEP-01: Patient Status Report has Report By Lab Number accordion`
- `modules|modules|tests/reports.spec.ts|Phase 4 — L-DEEP: Reports Generation > TC-L-DEEP-02: Generate Printable Version button is present`
- `modules|modules|tests/ui-text-sweep.spec.ts|TC-UIX-01: no page in the menu shows [object Object], NaN, undefined, raw i18n keys or a server error, or gets a 5xx while loading`
- `modules|modules|tests/ui-text-sweep.spec.ts|TC-UIX-02: no Admin page shows [object Object], NaN, undefined, raw i18n keys or a server error, or gets a 5xx while loading`
- `lp||label-presets.spec.ts|TC-LP-03: filter narrows the list (FUNCTION)`
- `lp||label-presets.spec.ts|TC-LP-05: editing a preset dimension in the UI saves and reads back [ROUND-TRIP]`
- `lp||label-presets.spec.ts|TC-LP-09: a successful save shows a confirmation [FUNCTION]`

## Known reds by ticket

- untriaged: 104
- ci-env: 20
- OGC-730: 12
- harness: 8
- OGC-189: 2
- OGC-1446: 1
- OGC-1367: 1
