# develop-stack: develop `2411d711`

Merge pull request #5058 from samuelmale/feat/ogc-1610-ebola-pcr-results

Run: https://github.com/DIGI-UW/OpenELIS-QA/actions/runs/44144119684 · TZ UTC · 2026-11-17T20:04:52.977Z

**2 NEW FAILURE(S)**: 91 failing = 89 known + 2 new; 4 known reds now pass.

| suite | passed | failing | new | known reds now passing | minutes | helper waits over 5 s |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| all-tc | 356 | 8 | 0 | 1 | 21 | 0 |
| census | 124 | 5 | 0 | 0 | 6 | 0 |
| cfg | 3 | 0 | 0 | 0 | 1 | 0 |
| deep | 0 | 1 | 0 | 0 | 1 | 0 |
| disc | 1 | 0 | 0 | 0 | 1 | 0 |
| e2e | 16 | 2 | 0 | 0 | 11 | 0 |
| envseed | 3 | 0 | 0 | 0 | 0 | 0 |
| eqa | 3 | 0 | 0 | 0 | 0 | 0 |
| guards | 18 | 1 | 0 | 0 | 4 | 0 |
| lp | 10 | 0 | 0 | 0 | 3 | 0 |
| modify-order | 7 | 1 | 0 | 0 | 1 | 0 |
| modules | 1350 | 51 | 1 | 3 | 108 | 8 |
| multicomponent | 3 | 0 | 0 | 0 | 0 | 0 |
| ogc1192 | 9 | 0 | 0 | 0 | 0 | 0 |
| panel-leak | 5 | 0 | 0 | 0 | 0 | 0 |
| personas-admin | 9 | 2 | 1 | 0 | 0 | 0 |
| personas-roles | 13 | 1 | 0 | 0 | 1 | 0 |
| pr3987 | 10 | 3 | 0 | 0 | 2 | 0 |
| preflight | 4 | 0 | 0 | 0 | 0 | 0 |
| probe-combo | 3 | 0 | 0 | 0 | 0 | 0 |
| qa | 0 | 1 | 0 | 0 | 2 | 0 |
| rbac | 57 | 0 | 0 | 0 | 4 | 0 |
| regression-chains | 84 | 13 | 0 | 0 | 3 | 0 |
| regression-seed | 16 | 0 | 0 | 0 | 0 | 0 |
| reval2 | 4 | 0 | 0 | 0 | 0 | 0 |
| revalidate | 3 | 0 | 0 | 0 | 0 | 0 |
| revalidate-unauth | 3 | 0 | 0 | 0 | 0 | 0 |
| rtype | 2 | 2 | 0 | 0 | 0 | 0 |
| workplan | 4 | 0 | 0 | 0 | 0 | 0 |

## Slowest tests

- 459 s `modules|modules|tests/ux-heuristics-sweep.spec.ts|TC-HEUR-00: heuristic pass over every menu page`
- 360 s `e2e|e2e|test-catalog-titer-runtime.spec.ts|Test Catalog editor — Titer result type at runtime > TCC-T: Titer test → order → renders an interactive result-entry control → save → validate`
- 236 s `modules|modules|tests/ui-text-sweep.spec.ts|TC-UIX-01: no page in the menu shows [object Object], NaN, undefined, raw i18n keys or a server error, or gets a 5xx while loading`
- 225 s `modules|modules|tests/a11y-control-names.spec.ts|TC-AXE-03: every visible form control on every menu page has an accessible name`
- 132 s `modules|modules|tests/ui-text-sweep.spec.ts|TC-UIX-02: no Admin page shows [object Object], NaN, undefined, raw i18n keys or a server error, or gets a 5xx while loading`
- 125 s `qa|setup|auth.setup.ts|authenticate`
- 122 s `modules|modules|tests/order-creation-e2e.spec.ts|Phase 32 — Order Creation E2E via UI > TC-ORD-13: Submit order and verify success message`
- 96 s `modules|modules|tests/order-creation-e2e.spec.ts|Phase 32 — Order Creation E2E via UI > TC-ORD-12: Fill order details (dates, requester, site)`
- 90 s `e2e|e2e|test-catalog-critical-indicator.spec.ts|OGC-1121 — critical vs abnormal result indicator (patient safety) [GUARD] > TCG-02: a CRITICAL value is styled identically to an ABNORMAL value at result entry (bug present → PASS; flips when a distinct critical marker ships)`
- 76 s `all-tc|test-catalog|test-catalog-lab-unit-management-write.spec.ts|Lab Unit Management — write paths (OGC-189, PR #4121) > LU-W-10: deactivating a lab unit that still holds an assigned test is allowed without a prompt (CONTRACT FACT — unbuilt OGC-189 AC, FLIP-WHEN-FIXED)`

## New failures (2)

- `modules|modules|tests/order-entry-defaults.spec.ts|Add Order defaults (UTC+10) > TC-OED-00: CANARY the order saved with the received date and time entered`
- `personas-admin|persona-pf|tests/personas/persona-pf-lab-administrator.spec.ts|Persona PF — Lab Administrator (first-time setup) > Step 3 — Create a new test (PERSIST, BUG-1/BUG-12 catch)`

## Known reds now passing (remove from ci-known-reds.json, check the ticket) (4)

- `modules|modules|tests/cphl-field-report.spec.ts|Results entry Method list (OGC-1614) > TC-CPHL-31: the Method list offers the test's linked active methods, A to Z`
- `modules|modules|tests/dashboard.spec.ts|Suite DASH-DEEP — Dashboard API Deep Validation (TC-DASH-DEEP) > TC-DASH-DEEP-03: Dashboard KPI values are numeric (non-negative)`
- `modules|modules|tests/ogc-1515-part3.spec.ts|OGC-1515 part 3: searchable lists (#4929) > TC-1515-22 TAT report: sample type and ordering site are searchable`
- `all-tc|test-catalog|test-catalog-lab-unit-visibility.spec.ts|Lab unit visibility — choosers vs viewers (OGC-189) > G-2: [FLIP-WHEN-FIXED] the filtering is inverted — the VIEWER hides inactive units while the CHOOSER offers them`

## Known reds by ticket

- untriaged: 58
- OGC-730: 12
- harness: 8
- ci-env: 4
- lead: 2
- R49: 1
- OGC-1446: 1
- OGC-1367: 1
- OGC-189: 1
- question: 1
