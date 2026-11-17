# develop-stack: develop `75047cde`

Module SDK: typed openelis_core surface, shared federation settings, test doubles, one contract version source (OGC-1640) (#5105)

Run: https://github.com/DIGI-UW/OpenELIS-QA/actions/runs/44020392687 · TZ UTC · 2026-11-17T07:34:21.647Z

**16 NEW FAILURE(S)**: 108 failing = 92 known + 16 new; 32 known reds now pass.

| suite | passed | failing | new | known reds now passing |
| --- | ---: | ---: | ---: | ---: |
| all-tc | 361 | 8 | 0 | 1 |
| census | 124 | 5 | 1 | 0 |
| cfg | 3 | 0 | 0 | 0 |
| deep | 0 | 1 | 0 | 0 |
| disc | 1 | 0 | 0 | 0 |
| e2e | 15 | 3 | 0 | 0 |
| envseed | 3 | 0 | 0 | 0 |
| eqa | 3 | 0 | 0 | 0 |
| guards | 17 | 2 | 0 | 0 |
| lp | 10 | 0 | 0 | 3 |
| modify-order | 7 | 1 | 0 | 0 |
| modules | 1391 | 65 | 15 | 28 |
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
| regression-chains | 84 | 13 | 0 | 0 |
| regression-seed | 13 | 1 | 0 | 0 |
| reval2 | 4 | 0 | 0 | 0 |
| revalidate | 3 | 0 | 0 | 0 |
| revalidate-unauth | 3 | 0 | 0 | 0 |
| rtype | 2 | 2 | 0 | 0 |
| workplan | 4 | 0 | 0 | 0 |

## New failures (16)

- `modules|modules|tests/dashboard.spec.ts|Suite DASH-DEEP — Dashboard API Deep Validation (TC-DASH-DEEP) > TC-DASH-DEEP-03: Dashboard KPI values are numeric (non-negative)`
- `modules|modules|tests/data-export.spec.ts|Suite S — Data Export Core (TC-EXP) > TC-EXP-08: Reports page loads within acceptable time`
- `modules|modules|tests/inventory-board.spec.ts|Row actions (OGC-438 #4358) > TC-INVB-20: Log usage records a consumption: on hand drops, a usage record is written and the lot logs CONSUMPTION, not an adjustment`
- `modules|modules|tests/loinc-dictionary.spec.ts|Suite O-DEEP — LOINC & Dictionary Deep Validation (TC-LOINC-09–16) > TC-LOINC-10: LOINC mapping page loads within acceptable time`
- `modules|modules|tests/loinc-dictionary.spec.ts|Suite O-DEEP — LOINC & Dictionary Deep Validation (TC-LOINC-09–16) > TC-LOINC-11: Dictionary management page loads within acceptable time`
- `modules|modules|tests/notebook-project.spec.ts|Notebook project form (TC-ELNW) > TC-ELNW-05: an edited project Objective is kept`
- `modules|modules|tests/ogc-1515-searchable-lists.spec.ts|OGC-1515 part 1: searchable lists (#4922) > TC-1515-04 Activity report activityReportByTest: Search By is searchable and the report prints a PDF`
- `modules|modules|tests/ogc-1515-searchable-lists.spec.ts|OGC-1515 part 1: searchable lists (#4922) > TC-1515-05 Activity report activityReportByPanel: Search By is searchable and the report prints a PDF`
- `modules|modules|tests/ogc-1515-searchable-lists.spec.ts|OGC-1515 part 1: searchable lists (#4922) > TC-1515-06 Activity report activityReportByTestSection: Search By is searchable and the report prints a PDF`
- `modules|modules|tests/ogc-1515-searchable-lists.spec.ts|OGC-1515 part 1: searchable lists (#4922) > TC-1515-07 Referred Out: lab is searchable; printing without a lab asks for it; with a lab prints`
- `modules|modules|tests/order-entry-duplicate-patient.spec.ts|TC-DUPPAT-03 existing patient chosen from the search stays one patient (guard)`
- `modules|modules|tests/order-entry-v4-handoff.spec.ts|R-TIME one clock > TC-OEV4-TIME-04 order entry and its dashboard use one date format (R-TIME-4)`
- `modules|modules|tests/programs-admin.spec.ts|Programs admin (TC-PRGW) > TC-PRGW-03: Order Programs lists each order once`
- `modules|modules|tests/system-misc.spec.ts|Phase 4 — S-DEEP: Order Extended Fields > TC-S-DEEP-01: Order entry step structure`
- `modules|modules|tests/system-misc.spec.ts|Phase 4 — S-DEEP: Order Extended Fields > TC-S-DEEP-02: New Patient extended fields`
- `census|census|tests/app-route-census.spec.ts|TC-APP-CENSUS — every working route renders > TC-APPCENSUS-PatientEntry-initial: Patient Initial Entry renders`

## Known reds now passing (remove from ci-known-reds.json, check the ticket) (32)

- `modules|modules|tests/accessibility.spec.ts|Phase 5 — V-DEEP: Accessibility Audit Tests > TC-V-DEEP-02: Color contrast adequate`
- `modules|modules|tests/accessibility.spec.ts|Phase 5 — V-DEEP: Accessibility Audit Tests > TC-V-DEEP-03: Heading structure and focus`
- `modules|modules|tests/app-shell.spec.ts|Page titles (OGC-1448) > TC-SHELL-10: each screen #4681 walked has exactly one h1, its title`
- `modules|modules|tests/calculated-values.spec.ts|Calculated Values Management (Phase 28) > TC-CALC-03: Formula builder supports autocomplete test selection`
- `modules|modules|tests/cphl-field-report.spec.ts|Site Information: a translated setting saves (OGC-1609) > TC-CPHL-50: changing the banner on Site Information saves, shows in the header and survives a reload`
- `modules|modules|tests/dashboard.spec.ts|Suite DASH-DEEP — Dashboard API Deep Validation (TC-DASH-DEEP) > TC-DASH-DEEP-02: Dashboard renders all 5 KPI tiles by label`
- `modules|modules|tests/dashboard.spec.ts|Suite DASH-DEEP — Dashboard API Deep Validation (TC-DASH-DEEP) > TC-DASH-DEEP-04: Dashboard sidebar navigation items cover all major modules`
- `modules|modules|tests/electronic-signature.spec.ts|Suite AY-ESIG-ADMIN — Site Information & Electronic Signature Config > TC-ESIG-02: Site Information sub-sections are visible`
- `modules|modules|tests/electronic-signature.spec.ts|Suite AY-ESIG-ADMIN — Site Information & Electronic Signature Config > TC-ESIG-03: Modify button is present and opens edit mode`
- `modules|modules|tests/eqa-workflow.spec.ts|Suite AZ-EQA-ADMIN — EQA Program & Distribution Administration > TC-EQA-ADMIN-02: EQA Program list or empty state renders`
- `modules|modules|tests/generic-sample.spec.ts|Generic Sample — Import Samples (US-GEN-3) > TC-GEN-08: Import page supports CSV and Excel file formats`
- `modules|modules|tests/locations-organizations.spec.ts|Locations & Organizations (OGC-1363) > TC-LORG-01: SideNav, the four routes, the legacy redirects and URL-restored filters (AC1)`
- `modules|modules|tests/non-conforming.spec.ts|Suite NC-EXT — Non-Conforming Extended Tests (TC-NC-EXT) > TC-NC-EXT-03: NC event naming consistency — heading variants`
- `modules|modules|tests/non-conforming.spec.ts|Phase 5 — G-DEEP: NCE Interaction Tests > TC-G-DEEP-01: Report NCE form loads with required fields`
- `modules|modules|tests/ogc1159-save-failure-visibility.spec.ts|OGC-1159 — a failed order save must say so, readably > ENV-2: the message an Environmental failure shows is a sentence, not a raw i18n key`
- `modules|modules|tests/order-creation-e2e.spec.ts|Phase 32 — Order Creation E2E via UI > TC-ORD-14: Print labels and Done buttons appear after submission`
- `modules|modules|tests/patient-management.spec.ts|Phase 4 — H-DEEP: Patient Interaction Tests > TC-H-DEEP-01: Search by national ID finds known patient`
- `modules|modules|tests/patient-management.spec.ts|Phase 6 — BD-DEEP: Patient History Tests > TC-BD-DEEP-01: Patient History page has required search fields`
- `modules|modules|tests/performance.spec.ts|Performance Smoke (TC-PERF) > TC-PERF-02: Add Order wizard step transition time`
- `modules|modules|tests/reflex-testing.spec.ts|Reflex Tests Management (Phase 28) > TC-REFLEX-01b: Rule builder has required form fields`
- `modules|modules|tests/reflex-testing.spec.ts|Reflex Testing — Over All Option Validation > Over All Option dropdown has ANY and ALL options`
- `modules|modules|tests/reports.spec.ts|Phase 4 — L-DEEP: Reports Generation > TC-L-DEEP-01: Patient Status Report has Report By Lab Number accordion`
- `modules|modules|tests/reports.spec.ts|Phase 4 — L-DEEP: Reports Generation > TC-L-DEEP-02: Generate Printable Version button is present`
- `modules|modules|tests/sample-shipment.spec.ts|Create Box Form (US-SHIP-1, US-SHIP-2) > TC-SHIP-04: Auto-generated box ID follows expected format`
- `modules|modules|tests/storage-crud.spec.ts|Storage CRUD (Phase 28) > TC-STOR-CRUD-06b: Cold Storage has multiple tabs (Dashboard, Corrective Actions, etc.)`
- `modules|modules|tests/storage-crud.spec.ts|Suite STOR-DEEP — Storage API & Cross-Module > TC-STOR-DEEP-02: Cold Storage (FreezerMonitoring) page loads all tabs`
- `modules|modules|tests/ui-text-sweep.spec.ts|TC-UIX-01: no page in the menu shows [object Object], NaN, undefined, raw i18n keys or a server error, or gets a 5xx while loading`
- `modules|modules|tests/ui-text-sweep.spec.ts|TC-UIX-02: no Admin page shows [object Object], NaN, undefined, raw i18n keys or a server error, or gets a 5xx while loading`
- `all-tc|test-catalog|tests/results-entry.spec.ts|Phase 6 — BG-DEEP: Results By Status Tests > TC-BG-DEEP-01: Results By Status page has all required filters`
- `lp||label-presets.spec.ts|TC-LP-03: filter narrows the list (FUNCTION)`
- `lp||label-presets.spec.ts|TC-LP-05: editing a preset dimension in the UI saves and reads back [ROUND-TRIP]`
- `lp||label-presets.spec.ts|TC-LP-09: a successful save shows a confirmation [FUNCTION]`

## Known reds by ticket

- untriaged: 58
- OGC-730: 12
- harness: 9
- ci-env: 6
- lead: 2
- OGC-189: 2
- OGC-1446: 1
- OGC-1367: 1
- question: 1
