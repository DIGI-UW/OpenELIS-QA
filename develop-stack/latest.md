# develop-stack: develop `199b15d0`

Module assets: compressed responses and a 304 before reading the JAR (OGC-1637) (#5103)

Run: https://github.com/DIGI-UW/OpenELIS-QA/actions/runs/43998431265 · TZ UTC · 2026-11-17T04:55:22.884Z

**3 NEW FAILURE(S)**: 43 failing = 40 known + 3 new; 6 known reds now pass.

| suite | passed | failing | new | known reds now passing |
| --- | ---: | ---: | ---: | ---: |
| all-tc | 358 | 11 | 3 | 1 |
| census | 125 | 4 | 0 | 0 |
| cfg | 3 | 0 | 0 | 0 |
| deep | 0 | 1 | 0 | 0 |
| disc | 1 | 0 | 0 | 0 |
| e2e | 16 | 2 | 0 | 1 |
| envseed | 3 | 0 | 0 | 0 |
| eqa | 3 | 0 | 0 | 0 |
| guards | 18 | 1 | 0 | 1 |
| lp | 10 | 0 | 0 | 3 |
| modify-order | 7 | 1 | 0 | 0 |
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
| regression-chains | 83 | 13 | 0 | 0 |
| regression-seed | 13 | 1 | 0 | 0 |
| reval2 | 4 | 0 | 0 | 0 |
| revalidate | 3 | 0 | 0 | 0 |
| revalidate-unauth | 3 | 0 | 0 | 0 |
| rtype | 2 | 2 | 0 | 0 |
| workplan | 4 | 0 | 0 | 0 |

## New failures (3)

- `all-tc|test-catalog|tests/results-by-range.spec.ts|Suite BF-DEEP — Results By Range API & Cross-Module (TC-RBR-06–10) > TC-RBR-10: Results By Range page loads within acceptable time`
- `all-tc|test-catalog|tests/results-by-status.spec.ts|Suite BG — Results By Status Core (TC-RBS) > TC-RBS-03: Status dropdown enumerates multiple test types`
- `all-tc|test-catalog|tests/results-by-status.spec.ts|Suite BG — Results By Status Core (TC-RBS) > TC-RBS-05: Results By Status page loads within acceptable time`

## Known reds now passing (remove from ci-known-reds.json, check the ticket) (6)

- `all-tc|test-catalog|tests/results-entry.spec.ts|Phase 6 — BG-DEEP: Results By Status Tests > TC-BG-DEEP-01: Results By Status page has all required filters`
- `e2e|e2e|test-catalog-sections-roundtrip.spec.ts|Test Catalog editor — section round-trips (A–G) > TCF-03 Methods: Link Method persists`
- `guards|guards|test-catalog-sections-roundtrip.spec.ts|Test Catalog editor — section round-trips (A–G) > TCF-03 Methods: Link Method persists`
- `lp||label-presets.spec.ts|TC-LP-03: filter narrows the list (FUNCTION)`
- `lp||label-presets.spec.ts|TC-LP-05: editing a preset dimension in the UI saves and reads back [ROUND-TRIP]`
- `lp||label-presets.spec.ts|TC-LP-09: a successful save shows a confirmation [FUNCTION]`

## Known reds by ticket

- untriaged: 33
- harness: 2
- OGC-189: 2
- OGC-730: 1
- question: 1
- lead: 1
