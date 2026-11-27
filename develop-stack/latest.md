# develop-stack: develop ``

{"message":"No commit found for SHA: ","documentation_url":"https://docs.github.com/rest/commits/commits#get-a-commit","status":"422"}fix(calendar): reject impossible holiday dates instead of saving a different day (#5176) (#5179)

Run: https://github.com/DIGI-UW/OpenELIS-QA/actions/runs/46030062707 · TZ UTC · 2026-11-27T16:59:45.384Z

**1 NEW FAILURE(S)**: 40 failing = 39 known + 1 new; 1 known reds now pass.

| suite | passed | failing | new | known reds now passing | minutes | helper waits over 5 s |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| all-tc | 356 | 8 | 0 | 1 | 28 | 0 |
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
| multicomponent | 3 | 0 | 0 | 0 | 0 | 0 |
| ogc1192 | 9 | 0 | 0 | 0 | 0 | 0 |
| panel-leak | 5 | 0 | 0 | 0 | 0 | 0 |
| personas-admin | 9 | 2 | 1 | 0 | 1 | 0 |
| personas-roles | 13 | 1 | 0 | 0 | 1 | 0 |
| pr3987 | 10 | 3 | 0 | 0 | 2 | 0 |
| preflight | 4 | 0 | 0 | 0 | 0 | 0 |
| probe-combo | 3 | 0 | 0 | 0 | 0 | 0 |
| qa | 0 | 1 | 0 | 0 | 2 | 0 |
| rbac | 57 | 0 | 0 | 0 | 5 | 0 |
| regression-chains | 84 | 13 | 0 | 0 | 5 | 0 |
| regression-seed | 16 | 0 | 0 | 0 | 0 | 0 |
| reval2 | 4 | 0 | 0 | 0 | 0 | 0 |
| revalidate | 3 | 0 | 0 | 0 | 0 | 0 |
| revalidate-unauth | 3 | 0 | 0 | 0 | 0 | 0 |
| rtype | 2 | 2 | 0 | 0 | 0 | 0 |
| workplan | 4 | 0 | 0 | 0 | 0 | 0 |

## Slowest tests

- 360 s `e2e|e2e|test-catalog-titer-runtime.spec.ts|Test Catalog editor — Titer result type at runtime > TCC-T: Titer test → order → renders an interactive result-entry control → save → validate`
- 125 s `qa|setup|auth.setup.ts|authenticate`
- 99 s `e2e|e2e|test-catalog-critical-indicator.spec.ts|OGC-1121 — critical vs abnormal result indicator (patient safety) [GUARD] > TCG-02: a CRITICAL value is styled identically to an ABNORMAL value at result entry (bug present → PASS; flips when a distinct critical marker ships)`
- 80 s `all-tc|test-catalog|test-catalog-lab-unit-management-write.spec.ts|Lab Unit Management — write paths (OGC-189, PR #4121) > LU-W-10: deactivating a lab unit that still holds an assigned test is allowed without a prompt (CONTRACT FACT — unbuilt OGC-189 AC, FLIP-WHEN-FIXED)`
- 64 s `all-tc|test-catalog|test-catalog-lab-unit-management-write.spec.ts|Lab Unit Management — write paths (OGC-189, PR #4121) > LU-W-5: Basic Info save round-trips the name, the French name, the Active toggle and a truncated description`
- 64 s `all-tc|test-catalog|tests/calculated-results-bounded.spec.ts|Calculated results run on the bounded evaluator (#4852) > TC-CALCB-01 a whole-number result is stored with no trailing .0`
- 56 s `pr3987|pr3987-patient|patient-photo-pr3987.spec.ts|item 10 — photo dialogs escape the disabled fieldset and keep their controls live`
- 50 s `guards|guards|test-catalog-critical-indicator.spec.ts|OGC-1121 — critical vs abnormal result indicator (patient safety) [GUARD] > TCG-02: a CRITICAL value is styled identically to an ABNORMAL value at result entry (bug present → PASS; flips when a distinct critical marker ships)`
- 37 s `disc||_discover.spec.ts|radio label click + mouse-click save`
- 35 s `rbac|rbac-matrix|tests/rbac/rbac-matrix.spec.ts|RBAC matrix — Receptionist (qa_recept) > INV-03 [invariant] jsp:/api/OpenELIS-Global/TestAdd → expect deny`

## New failures (1)

- `personas-admin|persona-pf|tests/personas/persona-pf-lab-administrator.spec.ts|Persona PF — Lab Administrator (first-time setup) > Step 3 — Create a new test (PERSIST, BUG-1/BUG-12 catch)`

## Known reds now passing (remove from ci-known-reds.json, check the ticket) (1)

- `all-tc|test-catalog|test-catalog-lab-unit-visibility.spec.ts|Lab unit visibility — choosers vs viewers (OGC-189) > G-2: [FLIP-WHEN-FIXED] the filtering is inverted — the VIEWER hides inactive units while the CHOOSER offers them`

## Known reds by ticket

- untriaged: 33
- harness: 2
- OGC-730: 1
- OGC-189: 1
- question: 1
- lead: 1
