# Phase 28 Advanced Feature Testing — Roadmap

**Server:** testing.openelis-global.org (v3.2.1.4)
**Started:** 2026-04-01 22:30 UTC-7
**Status:** COMPLETED

---

## Testing Steps

| Step | Module | TCs | Status | Pass | Fail | Blocked | Notes |
|------|--------|-----|--------|------|------|---------|-------|
| 1 | Storage CRUD | 6 | COMPLETED | 6 | 0 | 0 | Room create/edit, stat cards, Cold Storage — 100% PASS |
| 2 | Calculated Values | 6 | COMPLETED | 5 | 0 | 1 | De Ritis Ratio test created, formula built & persisted, POST works (BUG-36 RESOLVED). 1 blocked by BUG-31 |
| 3 | Reflex Testing | 6 | COMPLETED | 5 | 0 | 1 | High ALT Reflex rule created + verified via API, result entry BLOCKED (BUG-31) |

**Total: 18 test cases — 16 pass, 0 fail, 2 blocked**
**Pass Rate: 88.9%**

---

## Open Bugs Being Tracked

| Bug | Priority | Description |
|-----|----------|-------------|
| BUG-8 | HIGH | TestModify data corruption |
| BUG-22 | HIGH | No rate limiting on login |
| BUG-31 | HIGH | Accept checkbox 60s renderer hang (blocks result entry) |
| ~~BUG-36~~ | ~~HIGH~~ | ~~Calculated Value POST API 500~~ — RESOLVED (malformed payloads) |
| BUG-30 | MED | SiteInfo JS crash |
| BUG-32 | MED | LogbookResults API 500 |
| BUG-33 | MED | Dictionary API 500 |
| BUG-10 | LOW | Billing empty href |
| BUG-12 | LOW | Panel Create POST 500 |
| BUG-34 | LOW | Organization API 500 |
| BUG-35 | LOW | Legacy Admin opens new tab |

---

## Update Log

- **22:30** — Phase 28 started. Storage CRUD testing from prior session.
- **23:00** — Storage CRUD complete: 6/6 pass.
- **00:00** — De Ritis Ratio test created via TestAdd wizard (id=689).
- **01:00** — Calculated Value formula built in UI. POST /rest/test-calculation returns 500 (BUG-36).
- **02:00** — Reflex rule "High ALT Reflex" created and verified via API.
- **21:00** — Order DEV01260000000000004 created with 3 tests. Result entry blocked by BUG-31.
- **21:30** — Phase 28 COMPLETED. Final report generated. GitHub commit pending.
- **22:00** — BUG-36 RESOLVED: Retested POST `/rest/test-calculation` with correct payloads. Create (200 OK, id=6) and update (200 OK) both work. Prior 500s were from malformed payloads. Pass rate corrected to 88.9% (16/18).
