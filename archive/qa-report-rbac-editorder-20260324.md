# OpenELIS QA Report — RBAC, Edit Order & Referral
**Environment:** https://www.jdhealthsolutions-openelis.com
**Run Date:** 2026-03-24 (sessions: ~06:30–09:00 UTC)
**Run By:** Claude (automated via openelis-test-catalog-qa skill)
**OpenELIS Version:** 3.2.1.3
**Test Suite:** Edit Order (TC-EO-01/02), RBAC URL checks, Referral dropdown (BUG-2 expanded), BUG-3/BUG-4 documentation

---

## Summary

| Metric | Value |
|--------|-------|
| Total Test Cases | 16 |
| Passed | 9 |
| Failed | 4 |
| Skipped / Degraded | 3 |
| Pass Rate | 56% (9/16) |

**Overall Result: FAIL — 4 bugs confirmed, 2 new bugs discovered**

---

## Test Results

| TC # | Scenario | Result | Notes |
|------|----------|--------|-------|
| TC-EO-01 | Remove test from placed order (Cancel Test) | **PASS** | WBC cancelled via ModifyOrder Cancel Test checkbox. Accession 26-CPHL-000-08T confirmed in Results → By Order showing only HGB (1 of 1). |
| TC-EO-02 | Add test to placed order (Assign) | **PASS** | WBC added via ModifyOrder Available Tests Assign checkbox. Accession 26-CPHL-000-08R confirmed in Results showing both WBC and HGB. |
| TC-EO-03 | ModifyOrder generates new accession on each save | **FAIL / BUG-4** | Each ModifyOrder submission creates a new revision accession (26CPHL00008P → R → T). Labs cannot reuse the original label — clinical workflow impact. See BUG-4. |
| TC-EO-04 | Patient name on ModifyOrder confirmation | **FAIL / COSMETIC** | Confirmation page shows "undefined undefined ♀ Female" instead of patient name. |
| TC-EO-05 | Duplicate sample type in Results view | **FAIL / COSMETIC** | Tests display as "HGB(Whole Blood)(Whole Blood)" — sample type appended twice in results view. |
| TC-RBAC-URL-01 | `GET /SamplePatientEntry` returns 200 | **PASS** | Add Order page accessible (admin). |
| TC-RBAC-URL-02 | `GET /SampleEdit?type=readwrite` returns 200 | **PASS** | Edit Order page accessible (admin). |
| TC-RBAC-URL-03 | `GET /AccessionResults` returns 200 | **PASS** | Result entry accessible (admin). |
| TC-RBAC-URL-04 | `GET /MasterListsPage/TestAdd` returns 200 | **PASS** | Test Catalog Add accessible (admin). |
| TC-RBAC-URL-05 | `GET /MasterListsPage/TestModifyEntry` returns 200 | **PASS** | Test Catalog Modify accessible (admin). |
| TC-RBAC-URL-06 | `GET /Dashboard` returns 200 | **PASS** | Dashboard accessible (admin). |
| TC-RBAC-ROLE-01 | Receptionist blocked from Test Catalog | **SKIP/DEGRADED** | Blocked by BUG-3 — qa_recept account could not be created. Tested admin-only. |
| TC-RBAC-ROLE-02 | Lab Tech blocked from Add Order | **SKIP/DEGRADED** | Blocked by BUG-3 — qa_labtech account could not be created. |
| TC-RBAC-ROLE-03 | User account creation (admin UI) | **FAIL / BUG-3** | `POST /rest/UnifiedSystemUser` returns HTTP 500. No new user accounts can be created. |
| TC-REFERRAL-01 | Referral section: checkbox enables table | **PASS (conditional)** | Checkbox enables referral table, but row only renders when ≥1 test is selected first — undocumented requirement. |
| TC-REFERRAL-02 | Referral dropdowns accept selection | **FAIL / BUG-2** | All 3 Carbon Select dropdowns (Referral Reason, Institute, Select Test Name) revert to "Select..." on every interaction. 6 reference labs confirmed available but untestable. Full referral workflow blocked. |

---

## Bugs

### BUG-1 — `POST /rest/TestAdd` returns HTTP 500 (from previous run)
**Severity:** Critical | **Priority:** P1
**Summary:** Test catalog creation is completely blocked. The `POST /api/OpenELIS-Global/rest/TestAdd` endpoint returns HTTP 500 "Check server logs" on every attempt from both the React wizard and Legacy Admin JSP.
**Impact:** New tests cannot be added to the catalog. All downstream catalog operations are blocked.
**Documented in:** `qa-report-20260324-0612.md`, `jira-handoff-2tickets.md` (TICKET 1)

---

### BUG-2 — Carbon Select `onChange` fails silently in referral section (EXPANDED)
**Severity:** High | **Priority:** P2
**Summary:** All three Carbon `Select` components in the referral row (Referral Reason, Institute, Select Test Name) fail to persist user selections. The DOM value is immediately reverted to the default "Select..." after every interaction.

**Root Cause (confirmed):** The React controlled component's `onChange` handler is not updating the React state. When a user selects an option, the controlled component re-renders with the unchanged state value (empty string), overriding the DOM selection. Confirmed via:
- React fiber inspection: `referralRequests[0].referralLaboratoryId` remains `""` after every selection attempt
- DOM inspection: `referredInstituteId_0_743.value` reverts to `""` immediately after the event fires
- No console error is thrown — failure is completely silent to the user

**Available labs (confirmed via React state, all untestable):**
| id | Lab Name |
|----|----------|
| 2 | Central Public Health Laboratory |
| 14 | Doherty Institute |
| 3 | Queensland Mycobacterium Reference Laboratory |
| 20 | Research Institute for Tropical Medicine |
| 6 | SYD PATH Pathology |
| 7 | Victorian Infectious Diseases Reference Laboratory |

**Additional finding (BUG-2a — UX):** The referral table header renders when the checkbox is checked but the input row only appears when ≥1 test is already selected. There is no on-screen instruction informing users of this requirement. Users who check "Refer test to a reference lab" before selecting a test will see an empty table with no explanation.

**Affected elements:**
- `select#referralReasonId_0_{testId}` — Referral Reason
- `select#referredInstituteId_0_{testId}` — Institute (lab)
- `select#shadowReferredTest_0_{testId}` — Select Test Name

**Likely root cause:** Carbon v10/v11 `Select` component migration issue. The `onChange` handler likely receives `event.target.value` (v10 signature) when it expects a raw value (v11 signature), or vice versa. This causes a silent type error that leaves state unchanged.

**Workaround:** Use Legacy Admin referral entry if available.
**Assignee:** Samuel Male
**Labels:** react-ui, carbon-components, referral, automated-qa

---

### BUG-3 — `POST /rest/UnifiedSystemUser` returns HTTP 500
**Severity:** High | **Priority:** P2
**Summary:** Creating new user accounts via Admin → User Management → Add User fails. The form submission triggers `POST /api/OpenELIS-Global/rest/UnifiedSystemUser` which returns HTTP 500 "Check server logs".

**Steps to reproduce:**
1. Log in as admin
2. Navigate to Admin Management → User Management
3. Click Add User
4. Fill in all required fields (First Name, Last Name, Login Name, Password, Role)
5. Click Save

**Expected:** User account created and visible in User Management list.

**Actual:** `POST /rest/UnifiedSystemUser` → HTTP 500. No account is created.

**Impact:** High — RBAC role-isolation testing is completely blocked. No Receptionist or Lab Technician accounts can be created to verify that role boundaries are enforced. All RBAC tests that require non-admin credentials are degraded to admin-only URL checks.

**Cascade:** TC-RBAC-ROLE-01, TC-RBAC-ROLE-02 — Skipped. TC-RECEPT-01 through TC-LABTECH-06 from the Edit Order test case file — all blocked.

**Assignee:** Samuel Male
**Labels:** user-management, rbac, backend, automated-qa

---

### BUG-4 — ModifyOrder forces new accession number on every save
**Severity:** Medium | **Priority:** P2
**Summary:** Every submission of the ModifyOrder workflow generates a new accession number regardless of what changed. The original accession is preserved in an audit trail but the active accession changes, requiring label reprints.

**Observed accession trail:**
- Original order: `26CPHL00008P`
- After TC-EO-02 (Add WBC): → `26CPHL00008R`
- After TC-EO-01 (Cancel WBC): → `26CPHL00008T`

**Clinical impact (raised by Casey):** Labs operating with limited budgets that have already printed labels for the original collected sample cannot reuse those labels. Every modification requires reprinting new barcode labels for the same physical sample. This creates a cost burden and increases labelling errors (old label still on tube, new accession in system).

**Expected behavior:** For internal modifications (add/remove tests) to an existing sample, the accession number should remain unchanged. A new accession should only be generated for new physical samples.

**Affected page:** `/ModifyOrder` (reached via Order → Edit Order → `/SampleEdit?type=readwrite`)

**Suggested fix:** Add a toggle in ModifyOrder: "Reuse existing accession" (default) vs. "Generate new accession" (for cases where a new sample is actually being collected). Or: generate a new accession only when a new sample is physically added, not when tests are added/removed from an existing sample.

**Assignee:** Samuel Male
**Labels:** modify-order, accession, label-printing, clinical-workflow, automated-qa

---

### BUG-5 (Cosmetic) — "undefined undefined" patient name on ModifyOrder confirmation
**Severity:** Low | **Priority:** P3
**Summary:** The ModifyOrder submission confirmation screen displays "undefined undefined ♀ Female" in the patient name field instead of the patient's actual name.
**Affected page:** `/ModifyOrder` confirmation step
**Note:** Order data is correct — only the display rendering is broken.
**Labels:** modify-order, react-ui, display-bug

---

### BUG-6 (Cosmetic) — Duplicate sample type in Results view test names
**Severity:** Low | **Priority:** P3
**Summary:** In Results → By Order, test names display with sample type appended twice: "HGB(Whole Blood)(Whole Blood)" instead of "HGB(Whole Blood)".
**Affected page:** `/AccessionResults` (Results → By Order view)
**Labels:** results, react-ui, display-bug

---

## Additional Findings

### Referral section UX — requires test selection before row appears
When the user checks "Refer test to a reference lab" without first selecting any tests, the table header renders but the row with input fields does not appear. There is no instructional text to guide the user. The correct workflow is:
1. Select at least one test from the Order Tests list
2. Check "Refer test to a reference lab"
3. The referral row then appears, pre-populated with the selected test in the "Select Test Name" column

This interaction sequence is not documented in the UI and is counterintuitive — most users would check the referral checkbox first, then select tests.

### RBAC navigation structure confirmed (admin)
The following navigation items are confirmed accessible to admin:

**Order menu:** Add Order, Edit Order, Incoming Orders, Batch Order Entry, Barcode

**Results menu:** By Unit, By Patient, By Order, Referred Out, By Range of Order Numbers, By Test Date or Status

All 6 key role-relevant URLs return HTTP 200 as admin:
- `/SamplePatientEntry` (Receptionist primary)
- `/SampleEdit?type=readwrite` (Receptionist secondary)
- `/AccessionResults` (Lab Tech primary)
- `/MasterListsPage/TestAdd` (Admin only)
- `/MasterListsPage/TestModifyEntry` (Admin only)
- `/Dashboard` (All roles)

Role-isolation verification (non-admin credentials) remains **blocked by BUG-3**.

### Edit Order (ModifyOrder) — workflow confirmed working
Despite BUG-4 (new accession on every save), the core Edit Order functionality works:
- **Cancel Test** (remove test from placed order): ✅ Working — Cancel Test checkbox in Current Tests table removes the test on next submit
- **Assign test** (add test to placed order): ✅ Working — Assign checkbox in Available Tests table adds the test on next submit
- Navigation path: Order → Edit Order → `/SampleEdit?type=readwrite` → search by accession → `/ModifyOrder?accessionNumber=XXXX`
- ModifyOrder flow: Step 1 (Program Selection) → Step 2 (Add Sample: Current Tests + Available Tests) → Step 3 (Add Order: new lab number + requester → Submit)

**Correction to prior documentation:** `edit-order-rbac-test-cases.md` (GAP-01) documented "no UI path to add a new test to an existing placed order." This is **incorrect**. The Edit Order workflow via `/SampleEdit?type=readwrite` DOES support adding tests to existing orders. GAP-01 should be closed.

---

## Cleanup Status

| Item | Status |
|------|--------|
| QA order 26CPHL00008P (original) | In system, audit trail only |
| QA order 26CPHL00008R (WBC added) | In system, audit trail only |
| QA order 26CPHL00008T (WBC cancelled, active) | Active — HGB result 42 saved |
| qa_recept account | Not created (BUG-3 blocked) |
| qa_labtech account | Not created (BUG-3 blocked) |

---

## Pass/Fail Summary

| TC | Scenario | Result |
|----|----------|--------|
| TC-EO-01 | Cancel Test (remove WBC from placed order) | ✅ PASS |
| TC-EO-02 | Assign (add WBC to placed order) | ✅ PASS |
| TC-EO-03 | New accession on ModifyOrder save | ❌ FAIL — BUG-4 |
| TC-EO-04 | Patient name on confirmation | ❌ FAIL — BUG-5 (cosmetic) |
| TC-EO-05 | Sample type in results view | ❌ FAIL — BUG-6 (cosmetic) |
| TC-RBAC-URL-01 | Add Order returns 200 | ✅ PASS |
| TC-RBAC-URL-02 | Edit Order returns 200 | ✅ PASS |
| TC-RBAC-URL-03 | Result Entry returns 200 | ✅ PASS |
| TC-RBAC-URL-04 | TestAdd returns 200 | ✅ PASS |
| TC-RBAC-URL-05 | TestModifyEntry returns 200 | ✅ PASS |
| TC-RBAC-URL-06 | Dashboard returns 200 | ✅ PASS |
| TC-RBAC-ROLE-01 | Receptionist role isolation | ⚠️ SKIP — BUG-3 |
| TC-RBAC-ROLE-02 | Lab Tech role isolation | ⚠️ SKIP — BUG-3 |
| TC-RBAC-ROLE-03 | User account creation | ❌ FAIL — BUG-3 |
| TC-REFERRAL-01 | Referral checkbox enables section | ✅ PASS (conditional) |
| TC-REFERRAL-02 | Referral dropdowns accept selection | ❌ FAIL — BUG-2 |
