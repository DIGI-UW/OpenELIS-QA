# OpenELIS v3.2.1.6 Test Case Gaps & Updates Report

**Date:** 2026-04-21  
**Baseline:** v3.2.1.3 test cases vs v3.2.1.6 actual behavior  
**Instance:** testing.openelis-global.org

---

## SECTION 1: TEST CASES REQUIRING EXPECTED RESULT UPDATES

### BUG-9 RESOLVED: Reports Sidebar Links (Phase 23, Suite FJ-01)
- **TC-FJ-01: BUG-9 Resolution — Reports Routes Load (was 404)**
  - **Current Status:** PASS (already updated in Phase 23)
  - **Action:** No update needed — already reflects v3.2.1.6 resolution
  - **Details:** All 33 report links now resolve to form pages (HTTP 200), no 404

---

### BUG-10 RESOLVED: Aliquot Search Form (Phase 23, Suite FJ-02)
- **TC-FJ-02: BUG-10 Resolution — Aliquot Page Loads**
  - **Current Status:** PASS (already updated in Phase 23)
  - **Action:** No update needed — already reflects v3.2.1.6 resolution
  - **Details:** `/Aliquot` renders "Search Sample" form with HTTP 200

---

### BUG-11 RESOLVED: NotebookDashboard HTTP 200 (Phase 23, Suite FJ-03)
- **TC-FJ-03: BUG-11/15 Resolution — NoteBook Dashboard**
  - **Current Status:** PASS (API-verified; visual blocked by OGC-591)
  - **Action:** Mark visual retest needed post-Vite config fix; API confirmed 200
  - **Details:** HTTP 200 confirmed; blank page issue resolved (React component now mounts)

---

### BUG-21 RESOLVED: Patient Photos HTTP 200 (Phase 23, Suite FJ-04)
- **TC-FJ-04: BUG-21 Resolution — Patient Photos Return 200**
  - **Current Status:** PASS (already updated in Phase 23)
  - **Action:** No update needed — already reflects v3.2.1.6 resolution
  - **Details:** All `/rest/patient-photos/{id}/true` endpoints return HTTP 200

---

### CSRF ENFORCEMENT ACTIVE: HTTP 403 for Missing Token (Phase 23, Suite FQ-02 + Earlier Phases)

#### Test Cases Expecting POST 500 That Should Now Expect HTTP 403:

**BUG-1: TestAdd POST without CSRF**
- **Affected Suites:** BS-DEEP (Phase 5), BT-DEEP (Phase 8), TC-MGT-16 (Phase 23 regression)
- **Current State:** Documented as HTTP 500 in all phases
- **Update Required:** 
  - Expected: HTTP 403 (CSRF enforcement) when X-CSRF-Token header missing
  - Note: BUG-1 (underlying TestAdd bug) still unverified with proper CSRF token
  - Action: Add new variants of these tests WITH CSRF token to verify actual bug vs CSRF masking

**BUG-3: UserCreate POST without CSRF**
- **Affected Suites:** BT-DEEP (Phase 8), TC-MGT-17 (Phase 23 regression)
- **Current State:** Documented as HTTP 500
- **Update Required:**
  - Expected: HTTP 403 (CSRF enforcement) when X-CSRF-Token header missing
  - Note: BUG-3 (UserCreate 500) + BUG-20 (form validation) still unverified with CSRF token
  - Action: Add variant tests WITH CSRF token for both header validation and form submission

**BUG-7a: PanelCreate POST without CSRF**
- **Affected Suites:** BU-DEEP (Phase 8)
- **Current State:** Documented as HTTP 500
- **Update Required:**
  - Expected: HTTP 403 (CSRF enforcement) when X-CSRF-Token header missing
  - Action: Add variant WITH CSRF token to verify if BUG-7a persists or was CSRF-masked

---

## SECTION 2: NEW TEST COVERAGE GAPS (v3.2.1.6 Features)

### Analyzer QC Module (NEW in v3.2.1.6)
- **Current Coverage:** Phase 23, Suite FI (3 TCs) — load tests only
- **Gap:** No CRUD or write operation tests for Analyzer QC
- **Missing Test Cases:**
  1. **TC-FI-04: Create QC Rule** — POST to `/rest/analyzer-qc/rules` with Westgard rule data
  2. **TC-FI-05: Update QC Rule** — PUT to rule ID with modified parameters
  3. **TC-FI-06: Delete QC Rule** — DELETE rule endpoint
  4. **TC-FI-07: Create Control Lot** — POST to `/rest/analyzer-qc/control-lots`
  5. **TC-FI-08: Assign Control Material to Analyzer** — Link control lot to analyzer
  6. **TC-FI-09: QC Report Generation** — Export QC results/trends report
- **Phase Assignment:** Recommend Phase 24 or dedicated Analyzer QC suite

---

### CSRF Token Enforcement (NEW in v3.2.1.6)
- **Current Coverage:** Phase 23, Suite FQ-02 (negative test only)
- **Gap:** No positive tests verifying CSRF token header is required/accepted
- **Missing Test Cases:**
  1. **TC-FQ-02a: CSRF Token Present — POST Success** — Verify POST WITH valid X-CSRF-Token returns appropriate status (200/403 depends on bug)
  2. **TC-FQ-02b: CSRF Token Missing — POST Fails** — Confirm HTTP 403 for missing header (already covered, just needs Phase 23 update)
  3. **TC-FQ-02c: CSRF Token Invalid** — POST with malformed/expired token
- **Phase Assignment:** Phase 23 Suite FQ (already started)

---

## SECTION 3: RETESTING REQUIRED (CSRF-Masked Bugs)

### BUG-1, BUG-3, BUG-7a: Distinguish Real Bugs from CSRF Masking
- **Issue:** v3.2.1.3 tests showed HTTP 500; v3.2.1.6 now enforces CSRF (HTTP 403 without token)
- **Uncertainty:** Are the 500 errors real bugs or just CSRF-token-missing errors?
- **Action Required:**
  1. Re-run BS-DEEP TC-01, BT-DEEP TC-01, BU-DEEP TC-01 with:
     - Header: `X-CSRF-Token: <from localStorage['CSRF']>`
     - Verify if POST succeeds (bug fixed) or fails with different error code
  2. Create new test cases for each: `*-WITH-CSRF` variants
  3. Update bug status in registry:
     - If POST+CSRF succeeds → bug is FIXED
     - If POST+CSRF fails with 500 → bug is REAL and unresolved
     - If POST+CSRF fails with 403/422 → different issue (not CSRF-masked)

### BUG-20: Form Validation (UserCreate Login Name)
- **Status:** Documented in Phase 8, BT-DEEP TC-01 as permanently broken field state
- **Dependency:** Cannot test until BUG-3 (POST 500) is resolved with CSRF token
- **Action:** Retest after CSRF fix confirmed

---

## SECTION 4: PHASE COVERAGE ANALYSIS

### Phases with v3.2.1.6 Resolved Bug Test Coverage (Complete)
- **Phase 23:** Full coverage of BUG-9, BUG-10, BUG-11/15, BUG-21 (Suites FJ + FN + FO + FP)
- **Coverage Status:** ✅ Complete

### Phases Missing Analyzer QC Coverage
- **Phases 1–22:** Pre-date Analyzer QC module (v3.2.1.6 new)
- **Phase 23:** Load tests only (FI-01, FI-02, FI-03)
- **Gap:** No CRUD, write operations, or integration tests for QC module
- **Recommendation:** Create Phase 24 "Analyzer QC CRUD & Integration" with 9–12 TCs

### Phases Missing CSRF Enforcement Tests (v3.2.1.6)
- **Phases 1–22:** Pre-CSRF enforcement
- **Phase 23:** Negative test only (FQ-02)
- **Gap:** No positive CSRF token validation or per-operation CSRF verification
- **Recommendation:** Expand Phase 23 Suite FQ with 3–4 additional CSRF test cases

### Phases Missing BUG-1/3/7a Retests (CSRF-Masked)
- **Phases 5, 8:** Original BUG-1/3/7a documentation
- **Phase 23:** Regression tests (MGT-16/17) also need CSRF variant
- **Gap:** All assume token-less POST; must add token-included variants
- **Recommendation:** Create Phase 24 "CSRF Bug Retest Suite" to clarify which bugs are real

---

## SECTION 5: OGC-591 IMPACT (Vite allowedHosts)

### Affected Test Cases (Cannot Verify Visually)
- **TC-FJ-03: NoteBook Dashboard visual render** — blocked by HTTP 403 on new browser tabs
- **TC-FI-01/02/03: Analyzer QC pages** — HTML navigation blocked (API calls work)
- **Any test requiring fresh browser tab navigation** — Vite config blocks `testing.openelis-global.org`
- **Status:** API-level confirmation possible; visual confirmation blocked until Vite fix

### Recommendation
- Mark all affected TCs as "PASS (API verified; visual pending OGC-591 fix)"
- Revalidate after allowedHosts configured in vite.config.js

---

## SUMMARY OF ACTIONABLE ITEMS

| Priority | Item | Phase | Owner | Est. TCs |
|----------|------|-------|-------|----------|
| HIGH | Retest BUG-1/3/7a WITH CSRF token to distinguish real bugs | 24 | QA | 6 |
| HIGH | Add Analyzer QC CRUD test cases | 24 | QA | 9 |
| MEDIUM | Expand CSRF Suite FQ with positive validation tests | 23 | QA | 4 |
| MEDIUM | Update Phase 5/8/23 TestAdd/UserCreate/PanelCreate TC expected results (500→403 without token) | 5,8,23 | QA | 6 |
| LOW | Revalidate BUG-11/NotebookDashboard visual render | 23 | QA | 1 |
| LOW | Confirm OGC-558 (dashboard metric typos) still present | 23 | QA | 1 |

**Total:** ~27 TC updates/additions needed for v3.2.1.6 completeness.
