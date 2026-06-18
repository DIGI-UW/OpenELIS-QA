# Phase 30 — Extended API Discovery & Playwright Specs — Roadmap

**Server:** testing.openelis-global.org (v3.2.1.4)
**Started:** 2026-04-02
**Status:** COMPLETED

---

## Testing Steps

| Step | Module | TCs | Status | Pass | Fail | Blocked | Notes |
|------|--------|-----|--------|------|------|---------|-------|
| 1 | Extended API Discovery R1 | 6 | COMPLETED | 6 | 0 | 0 | 6 new endpoints: reports, ElectronicOrders, SampleEdit, alerts, notifications, menu |
| 2 | Extended API Discovery R2 | 8 | COMPLETED | 8 | 0 | 0 | 8 new endpoints: WorkPlan×2, ReferredOutTests, BatchSetup, Config×3, TestSectionCreate |
| 3 | Order Creation via UI | 1 | BLOCKED | 0 | 0 | 1 | Chrome extension instability — 3 tabs disconnected |
| 4 | Playwright Spec Build | — | COMPLETED | — | — | — | 34 TCs across 2 spec files + POM enhancement |

**Total New API Endpoints: 14 discovered (29 total known working)**
**Playwright TCs Written: 34 (api-crud-survey: 22, order-creation: 12)**

---

## Cumulative API Endpoint Status

| Category | Working (200) | Broken (500) | Not Found (404) |
|----------|---------------|--------------|-----------------|
| Core Data | 4 | 0 | 0 |
| Order Entry | 4 | 0 | 0 |
| Results | 1 | 0 | 0 |
| Workplan | 2 | 0 | 1 |
| Referrals | 1 | 0 | 1 |
| Admin Users | 2 | 0 | 0 |
| Admin Tests | 4 | 0 | 0 |
| Admin Config | 6 | 2 (Dictionary, Organization) | 0 |
| System | 4 | 1 (fhir/metadata) | 0 |
| **Total** | **29** | **3** | **2** |

---

## Update Log

- **Started** — Phase 30 planned. Focus: order creation, extended API discovery, Playwright specs.
- **Completed** — 14 new API endpoints discovered (29 total working). 34 Playwright TCs written. Order creation via UI blocked by Chrome extension instability. Phase 30 report generated.
