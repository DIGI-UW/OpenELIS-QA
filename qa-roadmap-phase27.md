# Phase 27 DEEP Interaction Testing — Roadmap

**Server:** testing.openelis-global.org (v3.2.1.4)
**Started:** 2026-04-01 21:00 UTC-7
**Status:** IN PROGRESS

---

## Testing Steps

| Step | Module | TCs | Status | Pass | Fail | Notes |
|------|--------|-----|--------|------|------|-------|
| 1 | Storage & Cold Storage | 12 | COMPLETED | 12 | 0 | Room CRUD, tabs, Cold Storage monitoring — 100% PASS |
| 2 | EQA Tests & Management | ~6 | PENDING | - | - | Orders, Programs, Distribution |
| 3 | Reports (all types) | ~12 | PENDING | - | - | All 11 report types + PDF generation |
| 4 | Admin CRUD | ~10 | PENDING | - | - | Test mgmt, dictionary, users, site info |
| 5 | Patient Management | 6 | COMPLETED | 6 | 0 | Search by last name, edit form loaded, Patient History page shows "no test results", Merge Patient sidebar verified |
| 6 | Order Entry Workflow | 8 | COMPLETED | 8 | 0 | Order DEV01260000000000003 created, patient Alpha TestPatient, 3 tests (GPT/ALAT, HIV VIRAL LOAD, HEPATITIS B VIRAL LOAD), Serum sample. Dashboard shows 21 orders in progress. |
| 7 | Results & Validation | ~8 | IN PROGRESS | - | - | Results By Unit page loads, Validation pages accessible |
| 8 | Referrals & Workplan | ~6 | PENDING | - | - | Workplan by test/panel, referral flow |
| 9 | API Endpoints | 14 | PARTIALLY DONE | 7 | 7 | Batch 1: 7/14 pass (panels, test-sections, dashboard-metrics, patient-search, notifications, alerts, test-list all 200 OK). Some endpoints return 404 with different paths on this version. |

**Estimated total: ~74 DEEP test cases**

---

## Open Bugs Being Tracked

| Bug | Priority | Description |
|-----|----------|-------------|
| BUG-8 | HIGH | TestModify data corruption |
| BUG-22 | HIGH | No rate limiting on login |
| BUG-30 | MED | SiteInfo JS crash |
| BUG-10 | LOW | Billing empty href — CONFIRMED v3.2.1.4 |
| BUG-12 | LOW | Panel Create POST 500 |

---

## Update Log

- **21:00** — Phase 27 started. Dashboard and roadmap created.
- **23:45** — Phase 27 DEEP — Order created (DEV01260000000000003), Patient Mgmt 6/6 pass, API batch 7/14 pass
