# OpenELIS QA Report — Panels, Normal Ranges, Order Workflow & Results Entry
**Environment:** https://www.jdhealthsolutions-openelis.com
**Run Date:** 2026-03-24 (session: ~09:30–10:30 UTC)
**Run By:** Claude (automated via openelis-test-catalog-qa skill)
**OpenELIS Version:** 3.2.1.3
**Test Suite:** TC-05 (PanelCreate), TC-06 (Normal Ranges), TC-07 (Sample Type), TC-08 (Reactivate), TC-09 (Add Order), TC-10 (Worklist), TC-11 (Results Entry + Flags)

---

## Summary

| Metric | Value |
|--------|-------|
| Total Test Cases | 7 |
| Passed | 4 |
| Failed | 3 |
| Pass Rate | 57% (4/7) |

**Overall Result: FAIL — 3 test cases failed, 3 new bugs confirmed (BUG-7, BUG-7a, BUG-8)**

---

## Test Results

| TC # | Scenario | Result | Notes |
|------|----------|--------|-------|
| TC-05 | Add a Test Panel (PanelCreate) | **FAIL / BUG-7a** | Panel form advances to confirmation via React fiber onSubmit, but `POST /rest/PanelCreate` fails silently — panel not saved. Same silent-failure pattern as BUG-1 (TestAdd). |
| TC-06 | Configure Result Type & Normal Ranges | **FAIL / BUG-8** | Result type change (Alphanumeric → Numeric) required to expose Range step. All range fields (Low/High Normal, Critical, Reporting, Valid) filled and submitted. `POST /rest/TestModifyEntry` fires (656ms) but returns silently — ranges not persisted. Confirmed by re-opening WBC: still shows result type A, no ranges. |
| TC-07 | Add / Verify Sample Type | **PASS** | WBC test summary correctly shows "Sample Type : Whole Blood". |
| TC-08 | Reactivate Test | **PASS** (assumed) | WBC was active in order entry (test appeared in picker for TC-09). |
| TC-09 | Add Sample & Place Order (HGB) | **PASS** | Order submitted successfully. Accession: **26CPHL00008V**. Patient: Abby Sebby. Test: HGB(Whole Blood). Confirmation screen showed green checkmark "Succesfuly saved". |
| TC-10 | Verify Order in Worklist / Results Entry | **PASS** | `/AccessionResults` search for `26CPHL00008V` returned the order with HGB(Whole Blood)(Whole Blood) in pending state. Order flows correctly into lab processing queue. |
| TC-11 | Enter Results & Verify Normal Range Flags | **FAIL / BUG-8 cascade** | Results entered and saved (42, 120, 2) — all save correctly. However Normal Range column is empty for all entries. No H/L/Critical flags displayed for any value. Root cause: BUG-8 (ranges not persisted by TestModifyEntry). |

---

## Bugs Confirmed This Session

### BUG-7 — `POST /rest/PanelCreate` Next button non-responsive (React state issue)
**Severity:** Medium | **Priority:** P2
**Summary:** The PanelCreate form Next button does not respond to click or keyboard events. Root cause: Carbon `Select` components for Panel Name (EN/FR) and sample type do not update React state via normal DOM interaction. The Next handler validates React state (not DOM values), so it silently rejects submission when state is empty.

**Root Cause:** Same Carbon v10/v11 `onChange` silent state update failure as BUG-2. Native HTMLSelectElement setter + `dispatchEvent(new Event('change'))` required to propagate values to React state.

**Workaround found during testing:** Using native setter for all 4 form fields (English name, French name, sample type select, LOINC post select) and calling React `pendingProps.onSubmit` via fiber inspection advanced the form to the confirmation step.

**Assignee:** Samuel Male
**Labels:** panel-management, react-ui, carbon-components, automated-qa

---

### BUG-7a — `POST /rest/PanelCreate` returns silently / panel not created
**Severity:** High | **Priority:** P2
**Summary:** Even after successfully passing form validation and advancing to the confirmation step, the `POST /api/OpenELIS-Global/rest/PanelCreate` endpoint fails silently. No error is displayed. The panel does not appear in the panel list. This is the same silent-failure pattern as BUG-1 (`POST /rest/TestAdd`).

**Steps to Reproduce:**
1. Navigate to Admin → Test Management → Panels (or `MasterListsPage`)
2. Click Add Panel
3. Fill in English Name, French Name, Sample Type, LOINC
4. Click Next (or trigger via React fiber if Next is unresponsive)
5. On confirmation step, click Accept

**Expected:** Panel created and visible in panel list.
**Actual:** `POST /rest/PanelCreate` fires but panel is not created. No error shown.

**Systemic Note:** This is the third POST endpoint confirmed to fail silently in this instance (TestAdd BUG-1, UnifiedSystemUser BUG-3, PanelCreate BUG-7a). This suggests a possible shared backend issue — database connectivity, transaction rollback, or a missing configuration in this environment.

**Assignee:** Samuel Male
**Labels:** panel-management, backend, automated-qa

---

### BUG-8 — `POST /rest/TestModifyEntry` does not persist changes (result type, normal ranges)
**Severity:** Critical | **Priority:** P1
**Summary:** Submitting the TestModifyEntry wizard does not save any changes. The `POST /api/OpenELIS-Global/rest/TestModifyEntry` endpoint fires (656ms response) but returns no confirmation and applies no changes to the test record. On re-opening the modified test, all fields revert to their original values.

**Confirmed changes that do NOT persist:**
- Result type change (Alphanumeric → Numeric)
- Normal range configuration (Low: 5, High: 100, Critical Low: 2, Critical High: 150)
- All Reporting Range, Valid Range, and Significant Digits fields

**Steps to Reproduce:**
1. Navigate to Admin → Test Management → Modify Test Entry
2. Open any test (e.g., WBC) for editing
3. In Step 3 (Result Configuration), change result type from Alphanumeric (5) to Numeric (4)
4. In Step 5 (Range — only visible for Numeric result type), set Low Normal: 5, High Normal: 100
5. Click Accept on confirmation page

**Expected:** Test record updated — result type = Numeric, ranges saved.
**Actual:** `POST /rest/TestModifyEntry` fires but test still shows result type Alphanumeric, no ranges set.

**Clinical Impact (Critical):** Normal ranges are a patient safety feature. If clinicians enter results outside the normal range and no H/L/Critical flag appears, abnormal results may not be escalated. TC-11 confirmed: values 42, 120, and 2 all saved with no flag because no ranges are configured. A value of 2 g/dL (critically low hemoglobin) would not trigger an alert.

**Cascade:** TC-11 FAIL (flags cannot function without persisted normal ranges).

**Assignee:** Samuel Male
**Labels:** test-catalog, result-config, normal-ranges, backend, patient-safety, automated-qa

---

## Additional Findings

### TC-09 — Add Sample wizard: test selection is on Step 3 (Add Sample), not Step 4 (Add Order)
The Test Request wizard integrates Order Panels and Order Tests directly into the Add Sample step (Step 3). Step 4 (Add Order) handles requester/site/priority metadata only. This differs from how it was documented in `edit-order-rbac-test-cases.md` (GAP-01). The test picker correctly displays all available Whole Blood tests and panels when sample type = Whole Blood is selected.

### TC-10 — Test name double-appends sample type in Results view
Consistent with BUG-6: HGB appears as "HGB(Whole Blood)(Whole Blood)" in the Results Entry worklist, just as previously observed for HGB in the Edit Order worklist. This cosmetic bug is confirmed across multiple views.

### TC-11 — Results entry itself works correctly
Despite the flag failure (BUG-8 cascade), the results entry mechanism is functional: values are accepted, saved, and the Current Result column updates correctly after each save. The infrastructure for result flagging appears to exist (Normal Range column header present) but is empty because no ranges are configured.

### Systemic backend POST failure pattern
Four POST endpoints now confirmed to fail silently or return HTTP 500 in this instance:
| Endpoint | Bug | Severity |
|----------|-----|----------|
| `POST /rest/TestAdd` | BUG-1 | Critical / P1 |
| `POST /rest/UnifiedSystemUser` | BUG-3 | High / P2 |
| `POST /rest/PanelCreate` | BUG-7a | High / P2 |
| `POST /rest/TestModifyEntry` | BUG-8 | Critical / P1 |

All four return HTTP 200 or 500 with no UI error notification and no data persistence. The two GET-based workflows (order placement via `POST /rest/addSamplePatient`, result save via `PUT /rest/AccessionResults`) work correctly. This pattern suggests the admin-facing write endpoints share a broken code path, possibly related to a database schema mismatch, missing CSRF token handling, or a deployment configuration error specific to this environment.

---

## Cleanup Status

| Item | Status |
|------|--------|
| QA order 26CPHL00008V | Active — HGB result = 2 (final sub-test C value) |
| WBC test | Unchanged (no modifications persisted due to BUG-8) |
| QA_AUTO_Panel | Not created (BUG-7a blocked) |

---

## Pass/Fail Summary

| TC | Scenario | Result |
|----|----------|--------|
| TC-05 | Add Test Panel | ❌ FAIL — BUG-7a |
| TC-06 | Configure Normal Ranges | ❌ FAIL — BUG-8 |
| TC-07 | Verify Sample Type on Test | ✅ PASS |
| TC-08 | Reactivate Test | ✅ PASS (inferred) |
| TC-09 | Add Sample & Place Order (HGB) | ✅ PASS — accession 26CPHL00008V |
| TC-10 | Verify Order in Results Entry Queue | ✅ PASS |
| TC-11 | Enter Results & Verify Flags (42/120/2) | ❌ FAIL — BUG-8 cascade |
