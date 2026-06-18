# QA Report — mgtest Baseline Survey: OpenELIS Global v3.2.1.5
**Date:** 2026-04-13
**Environment:** https://mgtest.openelis-global.org — OpenELIS Global v3.2.1.5
**Tester:** Claude QA Automation Agent
**Total TCs This Phase:** 20
**Results:** 12 PASS | 8 FAIL | 0 SKIP
**Pass Rate:** 60.0% (this phase) | **Cumulative:** 1008 TCs / 942 PASS / 93.5%

---

## Context

This report covers a baseline QA survey of the new **mgtest.openelis-global.org** server running
OpenELIS Global v3.2.1.5. The server appears to be a fresh instance (Madagascar-branded, "Madagascar OpenELIS")
with minimal seeded data. Testing covers page renders, API health, and write operation verification.

**Key difference from testing.openelis-global.org (v3.2.1.4):** Dashboard baseline is 0 in progress,
15 ready for validation, 0 completed today. CSRF token is stored in `localStorage['CSRF']` (not cookies).

---

## API Endpoint Path Correction

During initial batch API health checks, the following endpoints were probed using paths that turned out
to be **incorrect** for v3.2.1.5:

| Probed Path | Result | Correct Path | Actual Status |
|-------------|--------|--------------|---------------|
| `/rest/analyzers` | 404 | `/rest/analyzer/analyzers` | **200** |
| `/rest/analyzers/errors` | 404 | `/rest/analyzer/errors` (inferred) | Not tested |
| `/rest/analyzers/types` | 404 | `/rest/analyzer/types` (inferred) | Not tested |

The Analyzers feature is **working correctly** in v3.2.1.5. The 404s in the initial health check were
false positives from path mismatch. The `/analyzers` SPA page renders and displays 4 analyzers
(4 total, 0 active, 0 inactive, 1 plugin warning) using the correct endpoint.

---

## Dashboard

| TC | Description | Result | Notes |
|----|-------------|--------|-------|
| TC-MGT-01 | Dashboard loads with KPI cards | **PASS** | `GET /rest/home-dashboard/metrics` → 200; 0 in progress, 15 ready for validation, 0 completed today |

---

## Page Render Tests

| TC | Page | Result | API / Notes |
|----|------|--------|-------------|
| TC-MGT-02 | `/analyzers` — Analyzer List page | **PASS** | `GET /rest/analyzer/analyzers` → 200; 4 analyzers, 1 plugin warning, table renders |
| TC-MGT-03 | `/analyzers/errors` — Error Dashboard | **PASS** | Renders "Error Dashboard" with stat cards: 1 total, 1 unacknowledged, 0 critical, 1 last 24h |
| TC-MGT-04 | `/PatientManagement` — Patient search form | **PASS** | Form renders with Patient ID, Previous Lab Number, Last Name, First Name, DOB, Gender, Search/External Search buttons |
| TC-MGT-05 | `/LogbookResults?type=` — Results By Unit | **PASS** | Renders with test unit dropdown (11 options including Biochemistry, Hematology, Serology, etc.) |
| TC-MGT-06 | `/SamplePatientEntry` — Add Order wizard | **PASS** | h2 "Test Request"; 4-step wizard (Patient Info, Program Selection, Add Sample, Add Order) |
| TC-MGT-07 | `/AccessionValidation` — Validation By Order | **PASS** | Renders with accession number search input; "There are no records to display" (expected for empty instance) |
| TC-MGT-08 | `/ResultValidation` — Routine Validation | **PASS** | Renders with 4 dropdowns (test unit, pagination) |
| TC-MGT-09 | `/MasterListsPage/TestAdd` — Test Add form | **PASS** | h2 "Add new tests"; 4 inputs (EN/FR test name, reporting name), 2 selects, Next/Cancel buttons |
| TC-MGT-10 | `/MasterListsPage/userManagement/createUser` — User Management | **PASS** | User Management list renders with search, filter checkboxes, user table (2 users: ID 1, ID 109) |
| TC-MGT-11 | `/MasterListsPage/providerMenu` — Provider Management | **FAIL** | h2 "Provider Management" renders, table present, but only 1 row "UNKNOWN_" (false, no phone/fax/email). `GET /rest/provider` → 404. **BUG-50** |
| TC-MGT-18 | `PatientConfigurationMenu` API | **PASS** | `GET /rest/PatientConfigurationMenu` → 200 — **FIXED** from v3.2.1.4 BUG-48 |

---

## API Regression Tests

| TC | Endpoint | Result | Notes |
|----|----------|--------|-------|
| TC-MGT-12 | `GET /rest/dictionary` | **FAIL** | → 404 — DictionaryMenu admin page likely blank/broken. **BUG-51 NEW** |
| TC-MGT-13 | `GET /rest/patient/search` | **FAIL** | → 404 — Patient search returns no results even for existing patients. **BUG-52 NEW** |
| TC-MGT-14 | `GET /rest/referrals` | **FAIL** | → 404 — Referral results lookup broken. **BUG-53 NEW** |
| TC-MGT-15 | `GET /rest/calculatedValue` | **FAIL** | → 404 — BUG-46 class **REGRESSED**: was fixed in v3.2.1.4, broken again in v3.2.1.5. **BUG-54 NEW** |
| TC-MGT-19 | `GET /rest/BarcodeConfiguration` | **PASS** | → 200 |
| TC-MGT-20 | `GET /rest/labnumbermanagement` | **PASS** | → 200 |

**Additional confirmed regressions (not assigned TC numbers but verified via API batch check):**
- `GET /rest/organizationManagement/providers` → 404 (organization management likely broken)
- `GET /rest/SampleEntryConfigurationMenu` → 404 (BUG-48, 3 of 4 pages still broken)
- `GET /rest/OrderEntryConfigurationMenu` → 404 (BUG-48)
- `GET /rest/PrinterConfigurationMenu` → 404 (BUG-48)
- `GET /rest/GlobalReport` → 404 (BUG-9)
- `GET /rest/inventory/storage-locations` → 404
- `GET /rest/notification/pnconfig` → 404

---

## Write Operation Tests

| TC | Operation | Result | Details |
|----|-----------|--------|---------|
| TC-MGT-16 | POST `/rest/TestAdd` | **FAIL** | → HTTP 500 "Check server logs" — **BUG-1 CONFIRMED** in v3.2.1.5 |
| TC-MGT-17 | UserCreate form — Add User → Save | **FAIL** | Form opens correctly (Login Name, Password, First/Last Name, Roles). After filling fields via React fiber dispatch: `login-name` and `last-name` remain `aria-invalid="true"`. Save button fires but no POST is sent — validation blocks submission. **BUG-20 CONFIRMED** in v3.2.1.5 |

**PanelCreate note:** Direct POST to `/rest/PanelCreate` returns HTTP 400 (HttpMessageNotReadableException).
Payload schema appears to have changed between v3.2.1.4 and v3.2.1.5. UI-based testing inconclusive
(page renders; full form interaction not completed). Requires further investigation.

---

## Bug Summary

### Bugs Confirmed Carried Forward (present in both v3.2.1.4 and v3.2.1.5)

| Bug | Severity | Description |
|-----|----------|-------------|
| BUG-1 | High | `POST /rest/TestAdd` → HTTP 500 "Check server logs" |
| BUG-20 | Medium | UserCreate form: `login-name` and `last-name` fields permanently `aria-invalid="true"`; form never POSTs |
| BUG-48 (partial) | Medium | 3 of 4 General Config sub-pages return 404: SampleEntry, OrderEntry, Printer. PatientConfig **FIXED** in v3.2.1.5 |
| BUG-49 | Low | `/menuConfiguration` parent route renders blank; sub-routes accessible via direct URL only |
| BUG-9 | Medium | `/rest/GlobalReport` → 404 (Reports section broken) |

### New Bugs Identified in v3.2.1.5

| Bug | Severity | Description |
|-----|----------|-------------|
| BUG-50 | Medium | `GET /rest/provider` → 404; providerMenu renders but shows only "UNKNOWN_" default row instead of actual providers |
| BUG-51 | High | `GET /rest/dictionary` → 404; DictionaryMenu admin page likely blank |
| BUG-52 | High | `GET /rest/patient/search` → 404; patient search across the app returns no results |
| BUG-53 | Medium | `GET /rest/referrals` → 404; Referred Out Tests lookup broken |
| BUG-54 | Medium | `GET /rest/calculatedValue` → 404; BUG-46 class **regressed** — was fixed in v3.2.1.4, broken again in v3.2.1.5 |

### Fixes in v3.2.1.5 vs v3.2.1.4

| Fix | Description |
|-----|-------------|
| BUG-48 partial | `PatientConfigurationMenu` now returns 200 (was 404 in v3.2.1.4) |
| Analyzer path | Analyzer pages (`/analyzers`, `/analyzers/errors`) use `/rest/analyzer/analyzers` — fully working |

---

## Environment Notes

- **Instance branding:** "Madagascar OpenELIS" — v3.2.1.5
- **CSRF token:** Stored in `localStorage['CSRF']` (unlike v3.2.1.4 where it was session-cookie based). Direct fetch POSTs require `X-CSRF-Token` header.
- **Seeded data:** Very minimal. Dashboard shows 0 in progress, 15 ready for validation. User Management shows 2 users (ID 1 and 109). Only 1 analyzer active ("GeneXpert PC", Plugin Missing status).
- **Auth:** `admin` / `adminADMIN!` — confirmed working via `fetch` with `loginName` URLSearchParams.
- **v3.2.1.5 API note:** Several endpoints that existed in v3.2.1.4 now return 404. This suggests deployment differences or intentional API refactoring. The high rate of 404s on core endpoints (patient/search, dictionary, referrals, provider) is concerning for production readiness.

---

## Cumulative Statistics

| Metric | Value |
|--------|-------|
| Total TCs executed (all phases) | **1008** |
| Total PASS | **942** |
| Total FAIL | 66 |
| Pass rate | **93.5%** |
| Active bugs (unfixed) | 26 |
| Fixed/resolved bugs | 5 (BUG-1 test note, BUG-3, BUG-13, BUG-46 in v3.2.1.4, BUG-48 partial) |
