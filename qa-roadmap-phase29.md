# Phase 29 — Bug Retest & Write Operations Deep Testing — Roadmap

**Server:** testing.openelis-global.org (v3.2.1.4)
**Started:** 2026-04-02
**Status:** IN PROGRESS

---

## Testing Steps

| Step | Module | TCs | Status | Pass | Fail | Blocked | Notes |
|------|--------|-----|--------|------|------|---------|-------|
| 1 | BUG-31 Workaround | 4 | COMPLETED | 0 | 0 | 4 | All 13 logbook sections empty — no data to test |
| 2 | API CRUD Survey | 18 | COMPLETED | 16 | 2 | 0 | Dictionary 500, Organization 500. BUG-1/3/13 FIXED |
| 3 | Write Ops POST | 2 | COMPLETED | 0 | 0 | 2 | UserCreate 400 (payload format), SamplePatientEntry 500 (needs full wizard) |

**Total: 22 test cases — 16 pass, 2 fail, 4 blocked**
**Pass Rate: 72.7%**

### Major Discoveries
- **BUG-1 FIXED**: TestAdd GET returns 200 (was 500 in v3.2.1.3)
- **BUG-3 IMPROVED**: UserCreate GET 200, POST 400 not 500
- **BUG-13 FIXED**: TestModifyEntry GET returns 200 (was 500)
- **BUG-33 CONFIRMED**: Dictionary GET still 500
- **BUG-34 CONFIRMED**: Organization GET still 500
- **170 tests** in catalog (up from 164)
- **All 13 logbook sections empty** — test data wiped

---

## Open Bugs Being Tracked

| Bug | Priority | Description |
|-----|----------|-------------|
| BUG-8 | HIGH | TestModify data corruption |
| BUG-22 | HIGH | No rate limiting on login |
| BUG-31 | HIGH | Accept checkbox 60s renderer hang (blocks result entry) |
| BUG-30 | MED | SiteInfo JS crash |
| BUG-32 | MED | LogbookResults API 500 |
| BUG-33 | MED | Dictionary API 500 |
| BUG-10 | LOW | Billing empty href |
| BUG-12 | LOW | Panel Create POST 500 |
| BUG-34 | LOW | Organization API 500 |
| BUG-35 | LOW | Legacy Admin opens new tab |

---

## Update Log

- **Started** — Phase 29 planned. Focus: BUG-31 workaround, write ops retest, E2E results.
- **Completed** — 22 TCs executed. BUG-31 workaround blocked (no data). API CRUD survey revealed 3 bugs fixed in v3.2.1.4 (BUG-1, BUG-3, BUG-13). Dictionary and Organization APIs still 500.
