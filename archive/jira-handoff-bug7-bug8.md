# OpenELIS QA — Jira Ticket Handoff (BUG-7, BUG-7a, BUG-8)

Paste the prompt below into web Claude. It will create all three tickets in one go.

---

## Prompt to paste into web Claude

Please create three Jira bug tickets with the following details. Create them one after the other and return the ticket links when done.

---

### TICKET 1 — BUG-7

**Project:** OpenELIS Global
**Issue Type:** Bug
**Summary:** PanelCreate form Next button non-responsive — Carbon Select onChange does not update React state
**Priority:** Medium
**Assignee:** Samuel Male
**Status:** To Be Assigned
**Labels:** panel-management, react-ui, carbon-components, automated-qa

**Description:**

#### Summary
On the Add Panel form (`/MasterListsPage` → Panels → Add Panel), the Next button is completely non-responsive to clicks, keyboard events, and programmatic `.click()` calls. The root cause is that Carbon `Select` components for the panel name fields (English, French) and sample type dropdown do not propagate user selections to React state. The Next handler validates React state (not DOM values), so form validation silently fails and the wizard cannot advance.

#### Environment
- Instance: https://www.jdhealthsolutions-openelis.com
- Version: OpenELIS Global 3.2.1.3
- Browser: Chrome (latest)
- Navigation: Admin Management → Test Management → Panels → Add Panel

#### Steps to Reproduce
1. Log in as admin
2. Navigate to Admin Management → Test Management → Panels
3. Click Add Panel
4. Fill in English Panel Name (e.g., `QA_AUTO_Panel`)
5. Fill in French Panel Name (e.g., `QA_AUTO_Panel_FR`)
6. Select any Sample Type from the dropdown
7. Select any LOINC from the dropdown
8. Click **Next**

#### Expected Result
Form advances to Step 2 (confirmation) with the entered values visible.

#### Actual Result
Nothing happens. No error is shown. No navigation occurs. The Next button does not respond. React state inspection confirms that all Select field values remain `""` (empty string) despite visible DOM values.

#### Root Cause
Same Carbon v10/v11 `onChange` silent state update failure as BUG-2 (referral dropdowns). The `onChange` handler receives an incompatible event signature and silently fails to update state. The controlled component re-renders with the unchanged empty-string state value, overriding the DOM selection.

#### Suggested Fix
Apply the same fix as BUG-2: ensure Carbon `Select` components in the PanelCreate wizard use the correct `onChange` signature for the installed Carbon version. Alternatively, switch to `onChangeCapture` or use an uncontrolled component with a `ref`.

#### Test Case Reference
TC-05 (OpenELIS automated QA suite, run 2026-03-24)
QA Report: `qa-report-panels-order-results-20260324.md`

---

### TICKET 2 — BUG-7a

**Project:** OpenELIS Global
**Issue Type:** Bug
**Summary:** `POST /rest/PanelCreate` fails silently — panel not created despite successful form submission
**Priority:** High
**Assignee:** Samuel Male
**Status:** To Be Assigned
**Labels:** panel-management, backend, automated-qa

**Description:**

#### Summary
Even after the PanelCreate form successfully passes all validation and advances to the confirmation step, submitting the confirmation results in `POST /api/OpenELIS-Global/rest/PanelCreate` failing silently. No error notification is displayed to the user. The panel does not appear in the panel list. This is the same silent-failure pattern as BUG-1 (`POST /rest/TestAdd`).

#### Environment
- Instance: https://www.jdhealthsolutions-openelis.com
- Version: OpenELIS Global 3.2.1.3
- Navigation: Admin Management → Test Management → Panels → Add Panel → (confirmation step) → Accept

#### Steps to Reproduce
1. Log in as admin
2. Navigate to Admin Management → Test Management → Panels → Add Panel
3. Complete the form (Panel Name EN/FR, Sample Type, LOINC)
4. Advance to confirmation step
5. Click **Accept**
6. Navigate back to the Panel list
7. Search for the panel name just entered

#### Expected Result
Panel appears in the panel list with the correct name and sample type association.

#### Actual Result
`POST /rest/PanelCreate` fires (confirmed via network monitoring, ~400ms response) but panel is not created. The panel list does not contain the newly entered panel name. No error notification shown.

#### Systemic Context
This is the third write endpoint confirmed to fail silently in this environment:
- `POST /rest/TestAdd` — BUG-1 (Critical / P1)
- `POST /rest/UnifiedSystemUser` — BUG-3 (HTTP 500)
- `POST /rest/PanelCreate` — BUG-7a (this ticket)
- `POST /rest/TestModifyEntry` — BUG-8

All admin-facing write endpoints fail silently while GET endpoints and clinical workflow POSTs (order placement, result saving) work correctly. This suggests a shared backend issue — possibly a database schema mismatch, missing transaction commit, or deployment configuration error specific to this environment.

#### Test Case Reference
TC-05 (OpenELIS automated QA suite, run 2026-03-24)
QA Report: `qa-report-panels-order-results-20260324.md`

---

### TICKET 3 — BUG-8

**Project:** OpenELIS Global
**Issue Type:** Bug
**Summary:** `POST /rest/TestModifyEntry` does not persist changes — result type and normal ranges silently lost
**Priority:** Critical
**Assignee:** Samuel Male
**Status:** To Be Assigned
**Labels:** test-catalog, result-config, normal-ranges, backend, patient-safety, automated-qa

**Description:**

#### Summary
Submitting the TestModifyEntry wizard does not save any changes to a test record. The `POST /api/OpenELIS-Global/rest/TestModifyEntry` endpoint fires but applies no changes. On re-opening the test, all fields revert to their original values. This is a **patient safety issue**: without persisted normal ranges, the results entry screen cannot display H/L/Critical flags for out-of-range values.

#### Environment
- Instance: https://www.jdhealthsolutions-openelis.com
- Version: OpenELIS Global 3.2.1.3
- Navigation: Admin Management → Test Management → Modify Test Entry

#### Steps to Reproduce
1. Log in as admin
2. Navigate to Admin Management → Test Management → Modify Test Entry
3. Open an existing test for editing (tested with WBC, result type: Alphanumeric)
4. In Step 3 (Result Configuration), change Result Type from Alphanumeric to **Numeric**
5. In Step 5 (Range), configure:
   - Low Normal: `5`
   - High Normal: `100`
   - Critical Low: `2`
   - Critical High: `150`
6. Click **Accept** on the confirmation page
7. Re-open the same test from the Test Modify Entry list

#### Expected Result
- Test record updated: Result Type = Numeric
- Ranges saved: Low Normal = 5, High Normal = 100
- Results Entry screen shows H/L/Critical flags for out-of-range values

#### Actual Result
- `POST /rest/TestModifyEntry` fires (656ms response time confirmed)
- Test record is **unchanged**: still shows Result Type = Alphanumeric, no ranges
- Results Entry for any ordered test shows "Normal Range" column empty, no flags

#### Patient Safety Impact
Normal ranges are a critical patient safety feature. TC-11 (results entry with values 42, 120, and 2) confirmed that without persisted ranges:
- Value `2` (g/dL) — critically low hemoglobin — saves with no flag
- Value `120` — above any reasonable HGB normal range — saves with no flag
- Clinicians receive no visual alert for abnormal or critical results

If this environment is used for clinical care, abnormal results will not be escalated through the normal flagging workflow.

#### Observed API Behavior
`POST /api/OpenELIS-Global/rest/TestModifyEntry` completes in ~656ms. No error response body. No UI notification. No database update. This is consistent with the BUG-1/BUG-7a silent failure pattern across admin write endpoints.

#### Test Case Reference
TC-06 (range configuration), TC-11 (flag verification)
QA Report: `qa-report-panels-order-results-20260324.md`

#### Suggested Investigation
1. Check server logs for the `TestModifyEntry` POST handler — look for exception, transaction rollback, or schema validation failure
2. Verify the `TestModifyEntry` endpoint's database write path matches the current schema
3. Compare with `SamplePatientEntry` POST (which works) to identify any differences in transaction handling or authentication headers
