# OpenELIS QA — Jira Ticket Handoff (2 bugs)

Paste the prompt below into web Claude. It will create both tickets in one go.

---

## Prompt to paste into web Claude

Please create two Jira bug tickets with the following details. Create them one after the other and return the ticket links when done.

---

### TICKET 1

**Project:** OpenELIS Global
**Issue Type:** Bug
**Summary:** `POST /rest/TestAdd` returns HTTP 500 — test creation blocked in both React UI and Legacy Admin
**Priority:** Critical
**Assignee:** Samuel Male
**Status:** To Be Assigned
**Labels:** react-ui, legacy-admin, test-catalog, backend, automated-qa

**Description:**

#### Summary
The `POST /api/OpenELIS-Global/rest/TestAdd` backend endpoint returns HTTP 500 with body `"Check server logs"` on every attempt to create a new test. This blocks test catalog creation entirely — the failure is confirmed across both the React Add Test wizard and the Legacy Admin JSP, confirming it is a backend API bug, not a UI issue.

#### Environment
- Instance: https://www.jdhealthsolutions-openelis.com
- Version: OpenELIS Global 3.2.1.3
- Browser: Chrome (latest)
- UI: Both React (`/MasterListsPage/TestAdd`) and Legacy Admin (`/OpenELIS-Global/TestAdd`)

#### Steps to Reproduce
1. Log in as admin
2. Navigate to **Admin Management → Test Management → Add new tests** (`/MasterListsPage/TestAdd`)
3. Complete all 6 wizard steps:
   - Step 1: Select Test Section (e.g. Biochemistry), enter Test Name EN + FR, Reporting Names
   - Step 2: Select Unit of Measure (e.g. mg/dl)
   - Step 3: Select Result Type (e.g. Numeric), check Is Active and Orderable
   - Step 4: Select Sample Type (e.g. Serum)
   - Step 5: Enter Normal Range Low/High and Critical Low/High
   - Step 6: Review all data on the review screen
4. Click **Accept**

#### Expected Result
Test is persisted to the database. The wizard resets to blank Step 1 (success state). The new test appears under **Modify Tests** when filtered by the selected Test Section.

#### Actual Result
The form resets to blank Step 1 (visually identical to the success state), but the test is **not saved to the database**. Network inspection shows `POST /api/OpenELIS-Global/rest/TestAdd` returned **HTTP 500** with response body `"Check server logs"`.

Verification steps confirmed no test was created:
- **Modify Tests** → Biochemistry → search "QA_AUTO" → "No tests found matching the selected criteria"
- Direct API probe: `fetch('/api/OpenELIS-Global/rest/TestAdd', {method:'POST', ...})` → `{"status": 500, "body": "\"Check server logs\""}`

#### Confirmed Across Both UIs
| UI | Endpoint | Attempts | Result |
|----|----------|----------|--------|
| Legacy Admin JSP | `POST /OpenELIS-Global/TestAdd` | 3 | HTTP 500 |
| React wizard | `POST /rest/TestAdd` | 2 | HTTP 500 |

Both UIs call the same backend service. The bug is in the `TestAdd` REST service itself.

#### Likely Root Cause
Database-level exception on INSERT in the `TestAdd` service. The QA run attempted multiple partial submissions; earlier validation failures may have left orphan records causing a unique constraint violation on subsequent saves. Server logs are required to confirm the exact exception and stack trace.

#### Impact
**Critical** — New test creation is completely blocked. No new tests can be added to the catalog from either the React UI or the Legacy Admin interface. All downstream test cases (edit, deactivate, reactivate, panel assignment, sample type, range configuration, and order placement with the new test) are also blocked.

#### Test Case Reference
TC-01 (OpenELIS automated QA suite, runs 2026-03-24 05:30 UTC and 06:12 UTC)
QA Report: `qa-report-20260324-0612.md`

#### Suggested Investigation
1. Check server logs for the exact Java exception thrown by `TestAdd` service on POST
2. Check for orphan/duplicate records in the test-related DB tables from the partial QA run submissions
3. If a constraint violation is found, clear the orphan data and re-test

---

### TICKET 2

**Project:** OpenELIS Global
**Issue Type:** Bug
**Summary:** Carbon Select `onChange` throws JS error on referral test name dropdown in Add Order
**Priority:** High
**Assignee:** Samuel Male
**Status:** To Be Assigned
**Labels:** react-ui, carbon-components, test-catalog, automated-qa

**Description:**

#### Summary
When a user attempts to select a test name from the referral test name dropdown on the Add Order / Sample Entry page, the Carbon Design System `Select` component's `onChange` handler throws a JavaScript error. The selection fails and the referral test name field does not update.

#### Environment
- Instance: https://www.jdhealthsolutions-openelis.com
- Version: OpenELIS Global 3.2.1.3
- Browser: Chrome (latest)
- UI: React frontend (SamplePatientEntry / Add Order workflow)

#### Steps to Reproduce
1. Navigate to **Add Order** (`/SamplePatientEntry`)
2. Search for and select an existing patient
3. Advance through Program Selection and Add Sample steps
4. On the **Add Sample** step, check the **"Refer test to a reference lab"** checkbox
5. In the referral section, open the **Test Name** dropdown (Carbon `Select` component)
6. Select any test from the dropdown

#### Expected Result
The selected test name is accepted, the `onChange` handler fires cleanly, and the referral test name field updates to display the chosen test.

#### Actual Result
The Carbon `Select` `onChange` handler throws a JavaScript error. The dropdown selection does not persist — the field reverts or remains blank. The referral workflow cannot be completed.

#### Error Detail
JavaScript error thrown in Carbon Select `onChange` callback on the referral test name dropdown. Exact stack trace to be captured from browser console on next reproduction.

#### Impact
Users cannot complete referral orders through the React UI. Any test that needs to be referred to an external/reference lab is blocked at this step.

#### Test Case Reference
TC-REFERRAL (OpenELIS automated QA suite, run 2026-03-24)
QA Report: `qa-report-20260324-0530.md`

#### Suggested Fix Area
Review the Carbon `Select` component's `onChange` prop in the referral test name field within `SamplePatientEntry`. The handler likely receives an event object where it expects a value, or vice versa — a common Carbon v10/v11 migration issue where `onChange(e)` vs `onChange(value)` signatures differ.
