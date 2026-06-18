# Phase 31 — Deep Endpoint Testing — Roadmap

**Server:** testing.openelis-global.org (v3.2.1.4)
**Started:** 2026-04-02
**Status:** COMPLETED

---

## Testing Steps

| Step | Module | TCs | Status | Pass | Fail | Blocked | Notes |
|------|--------|-----|--------|------|------|---------|-------|
| 1 | Deep GET Structure Tests | 11 | COMPLETED | 11 | 0 | 0 | All 11 endpoints validated with full structure |
| 2 | Parameterized GET Tests | 4 | COMPLETED | 4 | 0 | 0 | WorkPlan, ReferredOutTests, patient-search params |
| 3 | POST Operation Probing | 4 | COMPLETED | 4 | 0 | 0 | TestSectionCreate, SampleBatchEntrySetup methods |
| 4 | Config Endpoint Validation | 3 | COMPLETED | 3 | 0 | 0 | SampleEntryConfig, ResultConfig, PatientConfig |
| 5 | Admin Form Structure | 3 | COMPLETED | 3 | 0 | 0 | TestAdd, PanelCreate, SiteInformation metadata |
| 6 | Playwright Spec Build | — | COMPLETED | — | — | — | 25 TCs in deep-endpoint-testing.spec.ts |

**Total TCs: 25 (25 PASS, 0 FAIL, 0 BLOCKED)**

---

## Update Log

- **Started** — Phase 31 planned. Focus: deep structural validation of all 29 known endpoints.
- **Completed** — 25 TCs all passing. Full form bean structures documented for TestSectionCreate, PanelCreate, TestAdd, TestModifyEntry. POST probing confirmed TestSectionCreate needs exact Java form bean payload. 4 parameterized GET queries tested. Playwright spec created. Phase 31 report generated.
