# develop-stack: develop `75047cde`

Module SDK: typed openelis_core surface, shared federation settings, test doubles, one contract version source (OGC-1640) (#5105)

Run: https://github.com/DIGI-UW/OpenELIS-QA/actions/runs/44034171172 · TZ UTC · 2026-11-17T08:45:17.272Z

**3 NEW FAILURE(S)**: 42 failing = 39 known + 3 new; 1 known reds now pass.

| suite | passed | failing | new | known reds now passing | minutes | helper waits over 5 s |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| all-tc | 356 | 8 | 0 | 1 | 21 | 0 |
| census | 124 | 5 | 0 | 0 | 5 | 0 |
| cfg | 3 | 0 | 0 | 0 | 1 | 0 |
| deep | 0 | 1 | 0 | 0 | 1 | 0 |
| disc | 1 | 0 | 0 | 0 | 1 | 0 |
| e2e | 15 | 3 | 1 | 0 | 14 | 0 |
| envseed | 3 | 0 | 0 | 0 | 0 | 0 |
| eqa | 3 | 0 | 0 | 0 | 0 | 0 |
| guards | 17 | 2 | 1 | 0 | 4 | 0 |
| lp | 10 | 0 | 0 | 0 | 3 | 0 |
| modify-order | 7 | 1 | 0 | 0 | 1 | 0 |
| multicomponent | 3 | 0 | 0 | 0 | 0 | 0 |
| ogc1192 | 9 | 0 | 0 | 0 | 0 | 0 |
| panel-leak | 5 | 0 | 0 | 0 | 0 | 0 |
| personas-admin | 8 | 2 | 1 | 0 | 0 | 0 |
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

- 360 s `e2e|e2e|test-catalog-titer-runtime.spec.ts|Test Catalog editor — Titer result type at runtime > TCC-T: Titer test → order → renders an interactive result-entry control → save → validate`
- 194 s `e2e|e2e|test-catalog-sections-roundtrip.spec.ts|Test Catalog editor — section round-trips (A–G) > TCF-03 Methods: Link Method persists`
- 125 s `qa|setup|auth.setup.ts|authenticate`
- 88 s `e2e|e2e|test-catalog-critical-indicator.spec.ts|OGC-1121 — critical vs abnormal result indicator (patient safety) [GUARD] > TCG-02: a CRITICAL value is styled identically to an ABNORMAL value at result entry (bug present → PASS; flips when a distinct critical marker ships)`
- 75 s `all-tc|test-catalog|test-catalog-lab-unit-management-write.spec.ts|Lab Unit Management — write paths (OGC-189, PR #4121) > LU-W-10: deactivating a lab unit that still holds an assigned test is allowed without a prompt (CONTRACT FACT — unbuilt OGC-189 AC, FLIP-WHEN-FIXED)`
- 63 s `all-tc|test-catalog|tests/calculated-results-bounded.spec.ts|Calculated results run on the bounded evaluator (#4852) > TC-CALCB-01 a whole-number result is stored with no trailing .0`
- 62 s `all-tc|test-catalog|test-catalog-lab-unit-management-write.spec.ts|Lab Unit Management — write paths (OGC-189, PR #4121) > LU-W-5: Basic Info save round-trips the name, the French name, the Active toggle and a truncated description`
- 53 s `pr3987|pr3987-patient|patient-photo-pr3987.spec.ts|item 10 — photo dialogs escape the disabled fieldset and keep their controls live`
- 45 s `guards|guards|test-catalog-critical-indicator.spec.ts|OGC-1121 — critical vs abnormal result indicator (patient safety) [GUARD] > TCG-02: a CRITICAL value is styled identically to an ABNORMAL value at result entry (bug present → PASS; flips when a distinct critical marker ships)`
- 36 s `disc||_discover.spec.ts|radio label click + mouse-click save`

## New failures (3)

- `e2e|e2e|test-catalog-sections-roundtrip.spec.ts|Test Catalog editor — section round-trips (A–G) > TCF-03 Methods: Link Method persists`
- `guards|guards|test-catalog-sections-roundtrip.spec.ts|Test Catalog editor — section round-trips (A–G) > TCF-03 Methods: Link Method persists`
- `personas-admin|persona-pf|tests/personas/persona-pf-lab-administrator.spec.ts|Persona PF — Lab Administrator (first-time setup) > Step 2 — Configure barcode formats (PERSIST)`

## Known reds now passing (remove from ci-known-reds.json, check the ticket) (1)

- `all-tc|test-catalog|test-catalog-lab-unit-visibility.spec.ts|Lab unit visibility — choosers vs viewers (OGC-189) > G-2: [FLIP-WHEN-FIXED] the filtering is inverted — the VIEWER hides inactive units while the CHOOSER offers them`

## Known reds by ticket

- untriaged: 33
- harness: 2
- OGC-730: 1
- OGC-189: 1
- question: 1
- lead: 1
