# Phase 32 — UI Order Creation End-to-End — Roadmap

**Server:** testing.openelis-global.org (v3.2.1.4)
**Started:** 2026-04-02
**Status:** COMPLETED

---

## Testing Steps

| Step | Module | TCs | Status | Pass | Fail | Blocked | Notes |
|------|--------|-----|--------|------|------|---------|-------|
| 1 | Order Wizard Navigation (4 steps) | 4 | COMPLETED | 4 | 0 | 0 | All 4 wizard steps navigable |
| 2 | Patient Info Entry | 3 | COMPLETED | 2 | 0 | 1 partial | First Name React resistance |
| 3 | Sample & Test Selection | 3 | COMPLETED | 3 | 0 | 0 | Serum + 3 tests selected |
| 4 | Order Details & Submission | 4 | COMPLETED | 3 | 0 | 1 partial | Submit success, site/requester no match |
| 5 | Post-Submission Verification | 1 | COMPLETED | 0 | 1 | 0 | Patient-order linkage failure |
| 6 | Playwright Spec Build | — | COMPLETED | — | — | — | 15 TCs in order-creation-e2e.spec.ts |

**Total TCs: 15 (12 PASS, 1 FAIL, 2 PARTIAL)**

---

## Update Log

- **Started** — Phase 32 planned. Focus: end-to-end order creation through UI wizard.
- **Completed** — 15 TCs executed. Order successfully submitted (DEV0126000000000005) but patient-order linkage fails (BUG-37). Submit button off-screen (BUG-38). React First Name input resistance confirmed. Patient created (PatientID=6). Playwright spec created. Phase 32 report generated.
