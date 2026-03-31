# OpenELIS Global — Gap Suites AE–AG (Reports Module)

**Target:** https://www.jdhealthsolutions-openelis.com
**Version:** OpenELIS Global 3.2.1.3
**UI:** Carbon for React (v3.x frontend)
**Test Prefix:** `QA_AUTO_<MMDD>` (e.g., `QA_AUTO_0324` for March 24)
**Admin Credentials:** admin / adminADMIN!

---

## Overview

The Reports module is a critical gap in the existing test suite (Suites A–AD). This document covers three new suites:

- **Suite AE** — Routine Reports (5 TCs): Patient Status Report, Aggregate Reports (Statistics, Summary of All Tests)
- **Suite AF** — Management Reports (5 TCs): Rejection Report, Activity Reports (Referred Out Tests), Non-Conformity Reports (Delayed Validation, Audit Trail)
- **Suite AG** — WHONET & Export Reports (5 TCs): WHONET Report, export functionality, filtering, graceful empty-state handling

Reports are typically accessed via: Hamburger Menu → Reports → [Report Category] → [Report Name]

All tests use graceful degradation:
- If a report URL is not found, mark as **GAP** rather than hard-failing
- If a report requires specific test data that is not available, document this in the result
- All reports must handle empty date ranges gracefully (no crash, meaningful "no data" message)

---

## Summary Table

| TC ID | Suite | Scenario | Expected Result | Notes |
|---|---|---|---|---|
| TC-RPT-R01 | AE | Patient Status Report page loads | PENDING | Date picker & patient fields present |
| TC-RPT-R02 | AE | Generate Patient Status Report with date range | PENDING | PDF or printable output |
| TC-RPT-R03 | AE | Statistics Report page loads | PENDING | Date range selector visible |
| TC-RPT-R04 | AE | Generate Statistics Report | PENDING | Table/data output displayed |
| TC-RPT-R05 | AE | Summary of All Tests report loads and generates | PENDING | Summary table displayed |
| TC-RPT-M01 | AF | Rejection Report page loads | PENDING | Date picker present |
| TC-RPT-M02 | AF | Generate Rejection Report | PENDING | Rejection data displayed in table |
| TC-RPT-M03 | AF | Referred Out Tests Report loads and generates | PENDING | Report data displayed |
| TC-RPT-M04 | AF | Delayed Validation report loads and generates | PENDING | Delayed records listed |
| TC-RPT-M05 | AF | Audit Trail report loads with date/user filters | PENDING | Audit events displayed |
| TC-RPT-W01 | AG | WHONET Report page loads | PENDING | Organism/antibiotic selectors present |
| TC-RPT-W02 | AG | Generate WHONET Report | PENDING | Data export functional |
| TC-RPT-W03 | AG | WHONET Report date range filtering works | PENDING | Filtered data displayed |
| TC-RPT-W04 | AG | Report handles no-data gracefully | PENDING | Empty state message shown |
| TC-RPT-W05 | AG | Report download/export functionality | PENDING | File download successful |

---

## Suite AE — Routine Reports (5 TCs)

> Tests the core reporting screens under Reports > Routine: Patient Status Report, Aggregate Reports (Statistics Report, Summary of All Tests).
> These reports provide summaries of patient information, test statistics, and overall testing activity.

### TC-RPT-R01 — Patient Status Report page loads

**Navigation:** Hamburger menu → Reports → Routine → Patient Status Report (candidate URLs: `/PatientStatusReport`, `/Report/PatientStatus`, `/reports/patient-status`)

**Preconditions:**
- Logged in as admin
- At least one patient record exists in the system

**Steps:**
1. Click the hamburger menu
2. Click **Reports**
3. Click **Routine**
4. Click **Patient Status Report**
5. Wait for page to load (timeout 5s)

**Expected:**
- Page loads with status 200
- Page is NOT redirected to Login
- A date picker or date range selector is visible
- Patient selection field is present (dropdown, search, or text input)
- Page heading or title contains "Patient Status" or similar

**Fail Criteria:**
- Login redirect
- 404 or 500 error
- Blank/empty page
- No date picker or patient field visible

**Notes:** If Patient Status Report does not exist in the menu, mark as **GAP** and skip TC-RPT-R02.

---

### TC-RPT-R02 — Generate Patient Status Report with date range — verify PDF/printable output

**Navigation:** Patient Status Report (from TC-RPT-R01)

**Preconditions:**
- TC-RPT-R01 passed
- At least one patient record with data exists in the date range

**Steps:**
1. On Patient Status Report screen
2. Locate and fill the date range fields:
   - From Date: enter current date or a recent date (e.g., 03/01/2026)
   - To Date: enter today's date or a future date (e.g., 03/24/2026)
3. If a patient field is required, select a patient from the dropdown or search
4. Click **Generate**, **View Report**, or **Search** button
5. Wait for report to render (timeout 8s)
6. Verify output format (PDF preview, HTML table, printable view, or downloadable file)

**Expected:**
- Report generates without error
- Output is displayed (PDF, table, or printable view)
- Report contains: patient name, status information, date range, timestamp
- No blank/empty report (unless no data available, then graceful message)

**Fail Criteria:**
- Report generation fails with error
- Blank page or hung spinner
- Report content is unreadable or truncated
- Browser crashes or JavaScript error

**Notes:** Some reports may generate PDFs (downloadable), others may show inline HTML tables. Document the format.

---

### TC-RPT-R03 — Statistics Report page loads with date range selector

**Navigation:** Hamburger menu → Reports → Routine → Aggregate Reports → Statistics Report (candidate URLs: `/StatisticsReport`, `/Report/Statistics`, `/reports/statistics`)

**Preconditions:**
- Logged in as admin

**Steps:**
1. Navigate to Reports > Routine > Aggregate Reports
2. Click **Statistics Report**
3. Wait for page to load (timeout 5s)

**Expected:**
- Page loads with status 200
- Not redirected to Login
- Date range selector (From Date and To Date fields) is visible
- A Generate/View button is present
- Page heading contains "Statistics" or "Aggregate"

**Fail Criteria:**
- 404 or 500 error
- Login redirect
- Blank page
- No date range fields visible

**Notes:** Mark as **GAP** if Statistics Report is not found in the menu.

---

### TC-RPT-R04 — Generate Statistics Report — verify table/data output

**Navigation:** Statistics Report (from TC-RPT-R03)

**Preconditions:**
- TC-RPT-R03 passed
- At least one test result exists in the system

**Steps:**
1. On Statistics Report screen
2. Fill in the date range:
   - From Date: a date in the past (e.g., 01/01/2026)
   - To Date: today's date
3. Click **Generate**, **View**, or **Search**
4. Wait for results to render (timeout 8s)

**Expected:**
- Report displays a data table with statistics
- Table contains columns such as: test name, count, percentage, min/max values, or similar metrics
- Row data is readable and properly formatted
- Report includes a header with date range and timestamp

**Fail Criteria:**
- No table appears (blank page)
- Error message during generation
- Table columns are empty or unreadable
- Browser error or crash

**Notes:** If no test data exists in the date range, the report should show a graceful message (not a crash).

---

### TC-RPT-R05 — Summary of All Tests report loads and generates

**Navigation:** Hamburger menu → Reports → Routine → Aggregate Reports → Summary of All Tests (candidate URLs: `/SummaryReport`, `/Report/SummaryOfTests`, `/reports/all-tests`)

**Preconditions:**
- Logged in as admin
- At least one test exists in the system

**Steps:**
1. Navigate to Reports > Routine > Aggregate Reports > Summary of All Tests
2. Wait for page to load (timeout 5s)
3. Verify page displays properly
4. If date range selectors are present, fill them with a reasonable range (e.g., last 30 days)
5. Click **Generate** or **View** button
6. Wait for summary table to render (timeout 8s)

**Expected:**
- Page loads without error
- Summary table displays with test names and associated data (count, results, status)
- Table is organized logically (by section, test name, or date)
- Report includes header with title, date range, and timestamp

**Fail Criteria:**
- 404 or 500 error
- Blank or unreadable page
- No table or data displayed (unless gracefully handled empty state)
- JavaScript error or crash

**Notes:** Mark as **GAP** if Summary of All Tests is not present in the Reports menu.

---

## Suite AF — Management Reports (5 TCs)

> Tests management-level reports: Rejection Report, Referred Out Tests, Delayed Validation, and Audit Trail.
> These reports help supervisors monitor sample rejections, referrals, validation delays, and system audit events.

### TC-RPT-M01 — Rejection Report page loads with date picker

**Navigation:** Hamburger menu → Reports → Routine → Management Reports → Rejection Report (candidate URLs: `/RejectionReport`, `/Report/Rejection`, `/reports/rejections`)

**Preconditions:**
- Logged in as admin

**Steps:**
1. Navigate to Reports > Routine > Management Reports > Rejection Report
2. Wait for page to load (timeout 5s)

**Expected:**
- Page loads with status 200
- Not redirected to Login
- A date picker or date range selector is visible (From Date, To Date fields)
- A Generate/View button is present
- Page title contains "Rejection" or similar

**Fail Criteria:**
- 404 or 500 error
- Login redirect
- Blank page
- No date picker visible

**Notes:** Mark as **GAP** if Rejection Report is not found.

---

### TC-RPT-M02 — Generate Rejection Report — verify rejection data displayed

**Navigation:** Rejection Report (from TC-RPT-M01)

**Preconditions:**
- TC-RPT-M01 passed
- At least one rejected sample exists in the system

**Steps:**
1. On Rejection Report screen
2. Fill in the date range (From Date, To Date) for a period when rejections occurred
3. Click **Generate** or **View**
4. Wait for report to load (timeout 8s)

**Expected:**
- Report displays a table with rejection data
- Table columns include: accession number, patient name, test name, rejection reason, rejection date, rejected by (user)
- If no rejections exist in date range, graceful message shown (not blank page)
- Report is readable and properly formatted

**Fail Criteria:**
- Report fails to generate with error
- No table displayed
- Rejection data is blank or unreadable
- Application crashes

**Notes:** If no test rejection data exists, document this as a precondition not met rather than a test failure.

---

### TC-RPT-M03 — Referred Out Tests Report loads and generates

**Navigation:** Hamburger menu → Reports → Routine → Management Reports → Activity Reports → Referred Out Tests Report (candidate URLs: `/ReferredOutReport`, `/Report/ReferredOut`, `/reports/referrals`)

**Preconditions:**
- Logged in as admin

**Steps:**
1. Navigate to Reports > Routine > Management Reports > Activity Reports > Referred Out Tests Report
2. Wait for page to load (timeout 5s)
3. Verify page displays properly
4. Fill in any required date range or filter fields
5. Click **Generate** or **View**
6. Wait for results (timeout 8s)

**Expected:**
- Page loads without error
- Report displays a table with referred tests
- Table includes: accession number, patient name, test name, referred to (lab/location), referral date, status
- Report is properly formatted and readable
- Graceful empty state if no referrals exist

**Fail Criteria:**
- 404 or 500 error
- Blank or unreadable page
- No table displayed (unless gracefully handled)
- Application error or crash

**Notes:** Mark as **GAP** if Referred Out Tests Report not found in menu.

---

### TC-RPT-M04 — Delayed Validation report loads and generates

**Navigation:** Hamburger menu → Reports → Routine → Management Reports → Non Conformity Reports → Delayed Validation (candidate URLs: `/DelayedValidationReport`, `/Report/DelayedValidation`, `/reports/delays`)

**Preconditions:**
- Logged in as admin

**Steps:**
1. Navigate to Reports > Routine > Management Reports > Non Conformity Reports > Delayed Validation
2. Wait for page to load (timeout 5s)
3. Verify page displays controls for filtering (date range, threshold, or similar)
4. Fill in any required fields (e.g., date range, or "delayed X days")
5. Click **Generate** or **View**
6. Wait for results (timeout 8s)

**Expected:**
- Page loads without error
- Report displays a table listing validation delays
- Table columns: accession number, patient name, test name, ordered date, validation due date, days delayed, status
- Delayed records are highlighted or clearly identified
- Report is readable and properly formatted

**Fail Criteria:**
- 404 or 500 error
- Blank or unreadable page
- No data displayed (unless graceful empty state)
- Application crash

**Notes:** Mark as **GAP** if Delayed Validation report not found.

---

### TC-RPT-M05 — Audit Trail report loads with date/user filters

**Navigation:** Hamburger menu → Reports → Routine → Management Reports → Non Conformity Reports → Audit Trail (candidate URLs: `/AuditTrailReport`, `/Report/AuditTrail`, `/reports/audit`)

**Preconditions:**
- Logged in as admin

**Steps:**
1. Navigate to Reports > Routine > Management Reports > Non Conformity Reports > Audit Trail
2. Wait for page to load (timeout 5s)
3. Verify filter controls are present:
   - Date range (From Date, To Date)
   - User filter (optional: dropdown or text input)
   - Action type filter (optional)
4. Fill in date range for recent activity
5. Click **Generate**, **View**, or **Search**
6. Wait for audit log to render (timeout 8s)

**Expected:**
- Page loads without error
- Audit log table displays with columns: timestamp, user name, action (created/edited/deleted), entity (test, order, patient), before/after values, status
- Filters work correctly (date range and user filters narrow results)
- Log is properly formatted and readable
- Graceful empty state if no audit events in date range

**Fail Criteria:**
- 404 or 500 error
- Login redirect
- Blank page
- Filters do not work
- Application crash

**Notes:** Audit Trail is critical for compliance. Mark as **GAP** if not found. Test both with and without user filters.

---

## Suite AG — WHONET & Export Reports (5 TCs)

> Tests WHONET Report (WHO antimicrobial surveillance format) and general export/download functionality for reports.
> WHONET reports are specialized for microbiology labs and antibiotic resistance surveillance.

### TC-RPT-W01 — WHONET Report page loads with organism/antibiotic selectors

**Navigation:** Hamburger menu → Reports → WHONET Report (candidate URLs: `/WHONETReport`, `/Report/WHONET`, `/reports/whonet`)

**Preconditions:**
- Logged in as admin
- System has microbiology test data (organism/antibiotic tests)

**Steps:**
1. Navigate to Reports > WHONET Report (may be at top level of Reports menu)
2. Wait for page to load (timeout 5s)

**Expected:**
- Page loads with status 200
- Not redirected to Login
- Page heading contains "WHONET"
- Organism selector is visible (dropdown, multi-select, or search field)
- Antibiotic selector is visible (dropdown or multi-select)
- Date range fields are present (From Date, To Date)
- A Generate/Export button is visible

**Fail Criteria:**
- 404 or 500 error
- Login redirect
- Blank page
- Selectors not visible or non-functional

**Notes:** Mark as **GAP** if WHONET Report not found. WHONET is optional for non-microbiology labs.

---

### TC-RPT-W02 — Generate WHONET Report — verify data export

**Navigation:** WHONET Report (from TC-RPT-W01)

**Preconditions:**
- TC-RPT-W01 passed
- At least one organism/antibiotic susceptibility test exists

**Steps:**
1. On WHONET Report screen
2. Select an organism from the dropdown (or leave as "All" if supported)
3. Select one or more antibiotics (or leave as "All")
4. Fill in date range (From Date, To Date)
5. Click **Generate**, **Export**, or **Download**
6. Wait for report/file to generate (timeout 10s)

**Expected:**
- Report generates without error
- Output is either:
  - A downloadable file (CSV, Excel, or text format)
  - An inline table or preview with export button
- Data is in WHONET-compatible format (verify headers: WHONET_ORG, WHONET_AB, etc., if visible)
- File or data is readable and properly formatted

**Fail Criteria:**
- Generation fails with error
- No file download or preview
- File is corrupt or unreadable
- Browser crashes

**Notes:** WHONET format is standardized by WHO. Document the actual export format (CSV, Excel, etc.).

---

### TC-RPT-W03 — WHONET Report date range filtering works

**Navigation:** WHONET Report (with results from TC-RPT-W02)

**Preconditions:**
- TC-RPT-W02 passed
- Results are displayed

**Steps:**
1. On WHONET Report screen with generated results
2. Change the date range:
   - From Date: set to a future date (e.g., 12/31/2026)
   - To Date: set to a future date (e.g., 01/31/2027)
3. Click **Regenerate**, **Apply Filter**, or **Search**
4. Wait for results to update (timeout 5s)

**Expected:**
- Results table updates with filtered data
- If date range is in the future and no data exists, graceful empty message shown
- Date filter is working correctly (results match the new date range)

**Fail Criteria:**
- Filter does not work (results unchanged)
- Error message on filter change
- Browser hangs or crashes
- Old results remain displayed

**Notes:** Test with multiple date range scenarios: (1) current/recent dates, (2) future dates (no data), (3) past dates (if available).

---

### TC-RPT-W04 — Report handles no-data gracefully (empty date range)

**Navigation:** WHONET Report (or any report from Suites AE, AF, AG)

**Preconditions:**
- TC-RPT-W01 passed (or any report screen from AE/AF/AG)

**Steps:**
1. On any report screen
2. Select a date range with NO expected data (e.g., From Date: 01/01/2020, To Date: 01/31/2020)
3. Click **Generate**, **View**, or **Search**
4. Wait for response (timeout 8s)

**Expected:**
- Report does NOT crash or show blank page
- A graceful message appears, such as:
  - "No data available for selected date range"
  - "No records found. Please adjust your filters."
  - Empty table with message in header or footer
- User can change filters and try again without reloading page

**Fail Criteria:**
- Blank page with no message
- JavaScript error or exception
- Spinner hangs indefinitely
- Application crashes
- Generic server error (500) displayed to user

**Notes:** This is a critical user experience test. Empty states must be handled gracefully to prevent user confusion.

---

### TC-RPT-W05 — Report download/export functionality

**Navigation:** Any report from Suites AE, AF, or AG with generated data (e.g., TC-RPT-W02 with exported WHONET data)

**Preconditions:**
- At least one report has been generated and displayed
- A download or export button is visible on the report

**Steps:**
1. On a report screen with data displayed
2. Look for a Download, Export, or Print button
3. Click the download/export button
4. If a file dialog appears, accept the download (note the filename and format)
5. Verify the file is saved to the default Downloads folder
6. If no file dialog: verify the file started downloading in the browser
7. Open or inspect the downloaded file (format: PDF, CSV, Excel, etc.)

**Expected:**
- Download/export button is clearly labeled and functional
- File downloads successfully (not blocked by browser)
- File has appropriate extension (PDF, CSV, XLSX, etc.)
- File is not corrupt (can be opened and contains expected data)
- File contains the report data from the screen (not truncated)

**Fail Criteria:**
- Download fails with error
- File is corrupt or unreadable
- File is empty or missing data
- Browser blocks download
- Download button is missing or non-functional

**Notes:**
- Test with multiple report types (PDF, CSV, Excel) if available
- Verify file size is reasonable for the data volume
- This test validates export functionality across all reports

---

## Test Execution Notes

### Prerequisites for All Suites
- System must be running OpenELIS Global 3.2.1.3
- Admin account (admin/adminADMIN!) must be active and accessible
- At least one patient record with test results exists
- At least one test is configured as "Active" and "Orderable"

### Test Data Requirements

**For Suite AE (Routine Reports):**
- At least one completed patient test result (accession with result value and status)
- Patient record with identifier (patient ID and/or name)

**For Suite AF (Management Reports):**
- Rejection Report: At least one rejected sample (for TC-RPT-M02)
- Referred Out: At least one referred test (optional; gracefully handle if none exist)
- Delayed Validation: At least one pending validation result (optional; test graceful empty state)
- Audit Trail: System logs should show at least one audit event in the past 30 days

**For Suite AG (WHONET & Export):**
- WHONET Report: At least one organism/antibiotic susceptibility test (optional; mark as GAP if microbiology tests don't exist)
- All reports: Test graceful handling of empty date ranges (no special data needed)

### URL Discovery Strategy

If menu navigation is not available or unreliable, use URL discovery:
1. Try candidate URLs from each TC
2. Check for HTTP 200 response (not 404 or 500)
3. Verify page is not a login redirect (URL does not contain "Login")
4. If candidate URL fails, try next candidate in list
5. If all candidates fail, mark as **GAP** and skip related TCs

### Expected Outcomes

- **PASS:** All steps completed as expected; report loaded, generated, and displayed correctly
- **FAIL:** Test step failed with error; report did not load or generate; application crashed
- **SKIP:** Test data not available (e.g., no rejections exist) or precondition failed
- **GAP:** Report feature does not exist in the application (404 or menu item not found)

### Known Issues / Blockers

- **No known issues at start of testing.**
- Document any blocking issues found (e.g., report URL not working, export fails) in test result notes.
- If a report returns HTTP 500, check server logs and document the error.

---

## Success Criteria (for Full Suite Completion)

- At least 12 TCs should **PASS** (out of 15 total)
- No more than 2 TCs should **FAIL** (critical bugs)
- **GAP** results are acceptable if the report feature is not in scope for the current release
- All **SKIP** results must have documented reasons (missing test data, precondition not met)
- All **FAIL** results must be escalated to development with browser console error logs

---

## References

- Main Test Catalog: `/master-test-cases.md`
- Previous Gap Suites: `/gap-suites-AA-AD.md`
- Live System: https://www.jdhealthsolutions-openelis.com
- OpenELIS Version: 3.2.1.3
