# OpenELIS Global — Gap Suites AA–AD (Priority 1 Clinical Workflow)

**Target:** https://www.jdhealthsolutions-openelis.com
**Version:** OpenELIS Global 3.2.1.3
**UI:** Carbon for React (v3.x frontend)
**Test Prefix:** `QA_AUTO_<MMDD>` (e.g., `QA_AUTO_0324` for March 24)
**Admin Credentials:** admin / adminADMIN!

---

## Suite AA — Results By Patient & By Order (6 TCs)

> Tests the Results navigation screens: Results > By Patient and Results > By Order.
> These screens allow technicians and supervisors to search for and display test results by patient identifier or order accession number.

### TC-RBP-01 — Navigate to Results > By Patient screen loads

**Navigation:** Hamburger menu → Results → By Patient (candidate URLs: `/PatientResults`, `/ResultsByPatient`, `/patient/results`)

**Preconditions:**
- Logged in as admin
- At least one order with results exists in the system

**Steps:**
1. Click the hamburger menu
2. Click **Results**
3. Click **By Patient**
4. Wait for page to load (timeout 5s)

**Expected:**
- Page loads with status 200
- Page is NOT redirected to Login
- A search/input field appears (for patient name or ID)
- Page heading or title contains "By Patient" or "Patient Results"

**Fail Criteria:**
- Login redirect
- 404 or 500 error
- Blank/empty page
- No input field visible

---

### TC-RBP-02 — Search by patient name returns results

**Navigation:** Results > By Patient

**Preconditions:**
- TC-RBP-01 passed
- Patient "Abby Sebby" exists with at least one completed result

**Steps:**
1. On Results > By Patient screen
2. Locate the search input field (by placeholder text, label, or first input element)
3. Enter patient name: `Abby Sebby`
4. Press Enter or click Search button
5. Wait for results table to render (timeout 5s)
6. Observe the rows returned

**Expected:**
- At least one row appears in the results table
- Row contains: patient name "Abby Sebby" OR patient ID
- Row contains: accession number, test name, result value, or status
- Results are displayed in a table or list format

**Fail Criteria:**
- No results returned (blank table or "No results" message)
- Exception/error message
- Unrelated patients displayed
- Search times out

**Note:** If Results > By Patient screen is not found (404), mark as **GAP**.

---

### TC-RBP-03 — Search by patient ID returns results

**Navigation:** Results > By Patient

**Preconditions:**
- TC-RBP-01 passed
- Patient ID `0123456` exists with at least one result

**Steps:**
1. On Results > By Patient screen
2. Clear any previous search
3. Enter patient ID: `0123456`
4. Press Enter or click Search
5. Wait for results (timeout 5s)

**Expected:**
- Results table shows at least one row
- Row contains patient ID `0123456` and name "Abby Sebby"
- Row shows accession, test name, and/or result value

**Fail Criteria:**
- No results
- Wrong patient returned
- Error on search

---

### TC-RBO-04 — Navigate to Results > By Order screen loads

**Navigation:** Hamburger menu → Results → By Order (candidate URLs: `/AccessionResults`, `/OrderResults`, `/order/results`)

**Preconditions:**
- Logged in as admin
- At least one order with results exists

**Steps:**
1. Click hamburger menu
2. Click **Results**
3. Click **By Order**
4. Wait for page to load (timeout 5s)

**Expected:**
- Page loads with status 200
- Not redirected to Login
- A search input field appears (for accession number)
- Page heading contains "By Order" or "Accession Results"

**Fail Criteria:**
- Login redirect
- 404 or 500 error
- Blank page
- No input field for accession number

---

### TC-RBO-05 — Search by accession number returns results

**Navigation:** Results > By Order

**Preconditions:**
- TC-RBO-04 passed
- Accession number `26CPHL00008T` or similar exists with results

**Steps:**
1. On Results > By Order screen
2. Locate the accession number input field
3. Enter accession number: `26CPHL00008T`
4. Press Enter or click Search
5. Wait for results (timeout 8s)

**Expected:**
- Results table displays at least one row
- Row contains the accession number
- Row shows patient name, test name, result value, and/or status

**Fail Criteria:**
- No results (blank table)
- Wrong order returned
- Error/exception

---

### TC-RBO-06 — Results display includes test name, result value, status

**Navigation:** Results > By Order (with populated results from TC-RBO-05)

**Preconditions:**
- TC-RBO-05 passed and results are displayed
- Accession number `26CPHL00008T` is visible with HGB test

**Steps:**
1. Examine the results row on the Results > By Order screen
2. Verify the following columns/fields are present:
   - Test Name (e.g., "HGB")
   - Result Value (numeric or text, e.g., "45" or "Normal")
   - Result Status (e.g., "Final", "Preliminary", "Corrected", "Validation Pending")
3. If the result value is a link/button, click it to see if it opens result entry or detail screen
4. Screenshot the results row

**Expected:**
- Row displays at least: test name, result value, and status
- Values are readable and not truncated
- No visual errors or missing data

**Fail Criteria:**
- Test name missing or blank
- Result value column missing or empty
- Status field absent
- Row layout broken or unreadable

---

## Suite AB — Validation By Order & By Date (5 TCs)

> Tests the Validation navigation screens: Validation > By Order, Validation > By Range of Order Numbers, and Validation > By Date.
> These screens allow supervisors and quality officers to review and validate test results using different search criteria.

### TC-VBO-01 — Validation > By Order screen loads

**Navigation:** Hamburger menu → Validation → By Order (candidate URLs: `/ValidationByAccession`, `/ValidationByOrder`, `/validation/order`)

**Preconditions:**
- Logged in as admin
- At least one order with results awaiting validation exists

**Steps:**
1. Click hamburger menu
2. Click **Validation**
3. Click **By Order**
4. Wait for page to load (timeout 5s)

**Expected:**
- Page loads with status 200
- Not redirected to Login
- Search input field visible (for accession number)
- Page heading contains "By Order" or "Validation"

**Fail Criteria:**
- Login redirect
- 404 or 500 error
- Blank page
- No input field

---

### TC-VBO-02 — Enter accession number shows results for validation

**Navigation:** Validation > By Order

**Preconditions:**
- TC-VBO-01 passed
- Accession number with unvalidated results exists (e.g., `26CPHL00008T`)

**Steps:**
1. On Validation > By Order screen
2. Locate accession input field
3. Enter accession number: `26CPHL00008T`
4. Press Enter or click Search
5. Wait for validation queue to load (timeout 8s)

**Expected:**
- Validation table/list displays with at least one row
- Row shows: accession number, patient name, test name, result value
- Row may show: validation status ("Pending Validation", "Ready to Release", etc.)
- No error message

**Fail Criteria:**
- No results
- Error/exception
- Wrong order returned

---

### TC-VBR-03 — Validation > By Range of Order Numbers screen loads

**Navigation:** Hamburger menu → Validation → By Range of Order Numbers (candidate URLs: `/ValidationByOrderRange`, `/ValidationRange`, `/validation/range`)

**Preconditions:**
- Logged in as admin

**Steps:**
1. Click hamburger menu
2. Click **Validation**
3. Click **By Range of Order Numbers** (or similar)
4. Wait for page to load (timeout 5s)

**Expected:**
- Page loads with status 200
- Not redirected to Login
- Two input fields appear: "From Accession" and "To Accession" (or similar)
- A Search or Find button is visible

**Fail Criteria:**
- 404 or 500 error
- Login redirect
- Blank page
- No input fields for range

---

### TC-VBD-04 — Validation > By Date screen loads

**Navigation:** Hamburger menu → Validation → By Date (candidate URLs: `/ValidationByDate`, `/ValidationDate`, `/validation/date`)

**Preconditions:**
- Logged in as admin

**Steps:**
1. Click hamburger menu
2. Click **Validation**
3. Click **By Date**
4. Wait for page to load (timeout 5s)

**Expected:**
- Page loads with status 200
- Not redirected to Login
- Date input field(s) appear (e.g., "From Date", "To Date", or a single date picker)
- Submit/Search button visible

**Fail Criteria:**
- 404 or 500 error
- Login redirect
- Blank page
- No date input fields

---

### TC-VBD-05 — Select date range shows validation queue

**Navigation:** Validation > By Date

**Preconditions:**
- TC-VBD-04 passed
- At least one order with results created today or within the past 7 days exists

**Steps:**
1. On Validation > By Date screen
2. Locate date input fields (From Date, To Date)
3. Enter From Date: current date (or date of known orders) in format YYYY-MM-DD or locale format
4. Enter To Date: current date (or slightly in the future)
5. Press Enter or click Search/Submit
6. Wait for results (timeout 8s)

**Expected:**
- Validation queue table displays
- At least one row appears with: accession number, patient name, test name, result
- No error message

**Fail Criteria:**
- No results (empty table when results should exist)
- Error/exception
- Date range UI broken (date pickers not functional)

---

## Suite AC — Merge Patient (4 TCs)

> Tests the Merge Patient feature under Patient menu.
> Merging allows resolution of duplicate patient records in the system.

### TC-MP-01 — Merge Patient screen loads from Patient menu

**Navigation:** Hamburger menu → Patient → Merge Patient (candidate URLs: `/MergePatient`, `/PatientMerge`, `/patient/merge`)

**Preconditions:**
- Logged in as admin

**Steps:**
1. Click hamburger menu
2. Click **Patient**
3. Click **Merge Patient** (or similar)
4. Wait for page to load (timeout 5s)

**Expected:**
- Page loads with status 200
- Not redirected to Login
- Two patient search input fields appear (for searching duplicate records)
- Page heading contains "Merge" or "Merge Patient"

**Fail Criteria:**
- 404 or 500 error
- Login redirect
- Blank page
- No patient search fields

---

### TC-MP-02 — Search finds duplicate patients

**Navigation:** Merge Patient

**Preconditions:**
- TC-MP-01 passed
- Patients "Abby Sebby" and "Abby" or similar duplicates exist in test data

**Steps:**
1. On Merge Patient screen
2. In the first search field, enter: `Abby`
3. Press Enter or click Search
4. Wait for patient dropdown/autocomplete (timeout 3s)
5. Verify list of matching patients appears

**Expected:**
- Dropdown or autocomplete list shows patients matching "Abby"
- List includes "Abby Sebby" (patient ID 0123456) or similar
- Patient can be selected from the list

**Fail Criteria:**
- No search results
- Error on search
- Autocomplete does not work

---

### TC-MP-03 — Select two patients for merge

**Navigation:** Merge Patient (with search results from TC-MP-02)

**Preconditions:**
- TC-MP-02 passed; patient search results visible

**Steps:**
1. From the first search dropdown, click/select "Abby Sebby (ID: 0123456)"
2. Observe: a second patient search field should appear or activate
3. In the second search field, enter: `Sebby` (or other variant)
4. Press Enter or click Search
5. Click/select a second patient (if duplicates exist) OR note that no duplicates are available
6. Verify both patient selections are displayed on the screen

**Expected:**
- First patient selection persists and is displayed
- Second search field becomes active and searchable
- If duplicates exist: both patients can be selected and shown on screen
- A "Merge" or "Continue" button appears at the bottom

**Fail Criteria:**
- First selection disappears when second search begins
- Second search field does not appear
- No merge button visible
- Error/exception on selection

**Note:** If no duplicate patients exist in the system, mark as **SKIP** with reason "No duplicate patients in test data".

---

### TC-MP-04 — Merge operation completes (or document if feature is broken)

**Navigation:** Merge Patient (with two patients selected)

**Preconditions:**
- TC-MP-03 passed; two patients selected OR test data has no duplicates
- A "Merge" button or similar action is visible

**Steps:**
1. Click the **Merge** button (or equivalent action button)
2. Observe: does a confirmation dialog appear? If so, confirm the merge.
3. Wait for merge to process (timeout 5s)
4. Observe the outcome:
   - Does the page redirect to a success/confirmation screen?
   - Does the page return to Merge Patient with a success message?
   - Does an error message appear?

**Expected (best case):**
- Confirmation dialog appears asking to confirm merge
- User confirms
- Merge completes with success message
- System redirects to Patient Search or updated patient record
- Merged records are consolidated (verify on follow-up Patient Search)

**Acceptable (permissive):**
- Merge button disabled if no duplicates exist
- System prevents merge of identical patients

**Document Actual Behavior:**
- If merge completes successfully: **PASS**
- If merge button is disabled or not present: **GAP** or **SKIP**
- If merge encounters error (e.g., backend validation): **FAIL** (document error)
- If feature is partially broken (e.g., UI layout errors): **FAIL** (document issue)

---

## Suite AD — Non-Conform Corrective Actions + View NC Events (5 TCs)

> Tests the Non-Conforming (NC) event workflow: viewing new NC events queue, creating corrective actions, and tracking NC event history.

### TC-NCA-01 — View New Non-Conforming Events queue loads

**Navigation:** Hamburger menu → Non-Conform → View New Non-Conforming Events (candidate URLs: `/NCQueue`, `/NonConformingQueue`, `/nc/events`)

**Preconditions:**
- Logged in as admin
- At least one NC event exists (from prior TC-NC-02 or similar)

**Steps:**
1. Click hamburger menu
2. Click **Non-Conform**
3. Click **View New Non-Conforming Events** (or similar)
4. Wait for page to load (timeout 5s)

**Expected:**
- Page loads with status 200
- Not redirected to Login
- A queue table/list is displayed (may be empty if no NC events exist)
- Page heading contains "Non-Conforming" or "NC Events"

**Fail Criteria:**
- 404 or 500 error
- Login redirect
- Blank page
- Exception/error message

---

### TC-NCA-02 — NC events list shows recent events

**Navigation:** View New Non-Conforming Events queue (from TC-NCA-01)

**Preconditions:**
- TC-NCA-01 passed
- At least one NC event exists (from test data or prior TC-NC-02)

**Steps:**
1. On the NC events queue page
2. Observe the table/list of non-conforming events
3. Verify at least one row is visible (if NC events exist in test data)
4. Examine the columns/fields:
   - Accession number or Order ID
   - NC Reason (e.g., "Hemolysis", "Insufficient Sample", "Clotted")
   - Date/Time of NC event
   - Status (e.g., "New", "Under Review", "Corrective Action Assigned")

**Expected:**
- Table shows recent NC events with clear timestamps
- Each row contains: accession, reason, date, status
- Rows are sortable or filterable (optional but nice-to-have)
- No visual errors

**Fail Criteria:**
- Table is empty when NC events should be present
- Columns missing critical info (accession, reason, date)
- NC events are not sorted by date (oldest first or newest first is acceptable)

**Note:** If no NC events exist in test data, mark as **SKIP** with reason "No NC events in test data".

---

### TC-NCA-03 — Corrective Actions screen loads

**Navigation:** Hamburger menu → Non-Conform → Corrective Actions (candidate URLs: `/CorrectiveActions`, `/NonConformingCorrectiveActions`, `/nc/actions`)

**Preconditions:**
- Logged in as admin

**Steps:**
1. Click hamburger menu
2. Click **Non-Conform**
3. Click **Corrective Actions**
4. Wait for page to load (timeout 5s)

**Expected:**
- Page loads with status 200
- Not redirected to Login
- A list/table of corrective actions is displayed (may be empty)
- A "Create Corrective Action" button or "+" button is visible
- Page heading contains "Corrective Actions" or "Actions"

**Fail Criteria:**
- 404 or 500 error
- Login redirect
- Blank page
- No "Create" button visible

---

### TC-NCA-04 — Create a corrective action for existing NC event

**Navigation:** Corrective Actions screen (from TC-NCA-03)

**Preconditions:**
- TC-NCA-03 passed
- At least one NC event exists from prior test cases
- "Create Corrective Action" button is visible

**Steps:**
1. On the Corrective Actions screen
2. Click the "Create Corrective Action" button (or "+")
3. Wait for form to load (timeout 3s)
4. A form should appear with fields:
   - NC Event or Accession selector (to link to an NC event)
   - Corrective Action description (text field)
   - Assigned To (user/staff dropdown)
   - Due Date (date picker)
   - Status (e.g., "Open", "In Progress", "Closed")
5. Fill in the form:
   - Select an NC event from the dropdown (or accept first available)
   - Enter description: `QA_AUTO_<MMDD> Test Corrective Action`
   - Select Assigned To: `admin` (or first available)
   - Set Due Date to +7 days from today
   - Status: `Open`
6. Click Save or Submit

**Expected:**
- Form submits without error
- Page redirects back to Corrective Actions list or shows success message
- New corrective action appears in the list (or confirm on follow-up navigation)

**Fail Criteria:**
- Form validation error (required fields)
- Submission error (500, backend validation failure)
- Corrective action not saved to database
- Silent failure (no feedback)

**Note:** If no NC events exist, mark as **SKIP** with reason "No NC events available to link".

---

### TC-NCA-05 — Corrective action saved and visible in history

**Navigation:** Corrective Actions list (from TC-NCA-04)

**Preconditions:**
- TC-NCA-04 passed and corrective action was created
- Corrective Actions page is displayed or re-navigated to

**Steps:**
1. On the Corrective Actions list page
2. Refresh the page (F5) to ensure data persists
3. Search or filter for the corrective action created in TC-NCA-04:
   - Look for description: `QA_AUTO_<MMDD> Test Corrective Action`
   - OR sort by date and verify the action appears at the top
4. Click on the corrective action row to open its details
5. Verify details match what was entered in TC-NCA-04:
   - Description matches
   - Assigned To is correct
   - Due Date is correct (+7 days)
   - Status is "Open"
6. Screenshot the corrective action details

**Expected:**
- Corrective action is persistent in the database after page refresh
- Details are accurate and match input from TC-NCA-04
- No data loss or truncation
- History/audit trail may show creation timestamp

**Fail Criteria:**
- Corrective action disappeared after refresh
- Details do not match (truncation, corruption)
- Data was not saved to persistent storage
- Cannot navigate to corrective action details

---

## Test Execution Summary

| Suite | Test Case | Description | Priority | Expected Outcome |
|-------|-----------|-------------|----------|-----------------|
| AA | TC-RBP-01 | Results > By Patient screen loads | P1 | Load with status 200 |
| AA | TC-RBP-02 | Search by patient name returns results | P1 | Results table populated |
| AA | TC-RBP-03 | Search by patient ID returns results | P1 | Results table populated |
| AA | TC-RBO-04 | Results > By Order screen loads | P1 | Load with status 200 |
| AA | TC-RBO-05 | Search by accession returns results | P1 | Results table populated |
| AA | TC-RBO-06 | Results show name, value, status | P1 | All columns present |
| AB | TC-VBO-01 | Validation > By Order screen loads | P1 | Load with status 200 |
| AB | TC-VBO-02 | Enter accession shows validation queue | P1 | Queue displayed |
| AB | TC-VBR-03 | Validation > By Range loads | P1 | Load with from/to fields |
| AB | TC-VBD-04 | Validation > By Date screen loads | P1 | Load with date fields |
| AB | TC-VBD-05 | Date range shows validation queue | P1 | Queue displayed |
| AC | TC-MP-01 | Merge Patient screen loads | P1 | Load with search fields |
| AC | TC-MP-02 | Search finds duplicate patients | P1 | Autocomplete results shown |
| AC | TC-MP-03 | Select two patients for merge | P1 | Both selections persist |
| AC | TC-MP-04 | Merge operation completes | P1 | Merge succeeds or documented GAP |
| AD | TC-NCA-01 | NC events queue loads | P1 | Load with event list |
| AD | TC-NCA-02 | NC events list shows recent | P1 | Table populated with data |
| AD | TC-NCA-03 | Corrective Actions screen loads | P1 | Load with create button |
| AD | TC-NCA-04 | Create corrective action | P1 | Action saved to DB |
| AD | TC-NCA-05 | Corrective action visible in history | P1 | Action persists after refresh |

---

## Notes

- **URL Discovery:** Each screen has multiple candidate URL patterns. Tests attempt graceful degradation: if `/PatientResults` returns 404, try `/patient/results` or `/ResultsByPatient` before marking as **GAP**.
- **Test Data:** Tests assume standard patient "Abby Sebby" (ID 0123456) with at least one result. If different test data is available, substitute accordingly.
- **Accession Format:** Standard format is `26CPHL00000X` (e.g., `26CPHL00008T`). Adjust based on actual test data.
- **Date Handling:** Date input formats vary by locale. Tests use YYYY-MM-DD or locale default; adjust based on app behavior.
- **Duplicate Patients:** TC-MP-02 through TC-MP-04 are conditional on the existence of duplicate patient records. If none exist, mark as **SKIP** with reason.
- **Non-Conforming Events:** TC-NCA-02, TC-NCA-04, TC-NCA-05 depend on NC events created in prior test runs (e.g., Suite G, TC-NC-02). If no NC events exist, mark as **SKIP**.

