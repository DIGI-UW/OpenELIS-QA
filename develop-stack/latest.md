# develop-stack: develop `14a0dd5c`

fix(admin): show names for configuration settings listed by raw keys (OGC-1547) (#4836)

Run: https://github.com/DIGI-UW/OpenELIS-QA/actions/runs/40444566874 · TZ UTC · 2026-10-27T07:42:21.034Z

**5 NEW FAILURE(S)**: 99 failing = 94 known + 5 new; 3 known reds now pass.

| suite | passed | failing | new | known reds now passing |
| --- | ---: | ---: | ---: | ---: |
| all-tc | 350 | 10 | 3 | 0 |
| census | 126 | 3 | 0 | 0 |
| cfg | 3 | 0 | 0 | 0 |
| deep | 0 | 4 | 1 | 0 |
| disc | 1 | 0 | 0 | 0 |
| e2e | 15 | 3 | 0 | 0 |
| envseed | 3 | 0 | 0 | 0 |
| eqa | 3 | 0 | 0 | 0 |
| guards | 17 | 2 | 0 | 0 |
| lp | 7 | 3 | 0 | 0 |
| modify-order | 7 | 1 | 0 | 0 |
| modules | 1265 | 49 | 1 | 3 |
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

## New failures (5)

- `modules|modules|tests/order-entry-duplicate-patient.spec.ts|TC-DUPPAT-03 existing patient chosen from the search stays one patient (guard)`
- `all-tc|test-catalog|test-catalog-chaos-results.spec.ts|Test Catalog chaos: Terminology (TC-CX-TM) > TC-CX-TM-01: a Terminology save that meets 500 JSON is reported as failed and stores nothing`
- `all-tc|test-catalog|test-catalog-chaos-results.spec.ts|Test Catalog chaos: Terminology (TC-CX-TM) > TC-CX-TM-02: a Terminology save that meets login page with a 200 is reported as failed and stores nothing`
- `all-tc|test-catalog|test-catalog-mgmt-deep.spec.ts|TC-DEEP-TERMINOLOGY: add a terminology mapping reads back via REST [ROUND-TRIP]`
- `deep||test-catalog-mgmt-deep.spec.ts|TC-DEEP-TERMINOLOGY: add a terminology mapping reads back via REST [ROUND-TRIP]`

## Known reds now passing (remove from ci-known-reds.json, check the ticket) (3)

- `modules|modules|tests/order-entry-off-happy-path.spec.ts|Order entry off the happy path > TC-OEX-11: Enter Order: a late response for the previous sample type does not replace the list (OGC-1266)`
- `modules|modules|tests/order-entry-off-happy-path.spec.ts|Order entry off the happy path > TC-OEX-12: Enter Order: a failed tests request does not leave "Loading" forever (OGC-1266)`
- `modules|modules|tests/order-entry-release-blockers.spec.ts|Order entry — release blockers > BLK-LAB-4 — a field marked required to sighted users is marked required in the DOM`

## Known reds by ticket

- untriaged: 66
- OGC-730: 13
- harness: 9
- OGC-1448: 2
- OGC-189: 2
- OGC-1446: 1
- OGC-1367: 1
