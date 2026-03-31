# OpenELIS Global — Gap Suites AH–AP (Priority 3 & 4: Operational Gaps & Specialized Modules)

**Target:** https://www.jdhealthsolutions-openelis.com
**Version:** OpenELIS Global 3.2.1.3
**UI:** Carbon for React (v3.x frontend)
**Test Prefix:** `QA_AUTO_<MMDD>` (e.g., `QA_AUTO_0324` for March 24)
**Admin Credentials:** admin / adminADMIN!

---

## Suite AH — Incoming Orders & Batch Order Entry (5 TCs)

> Tests the Incoming Orders screen and Batch Order Entry workflow.
> These screens allow lab staff to review incoming patient orders and process multiple orders in batch mode.

### TC-IO-01 — Incoming Orders screen loads

**Navigation:** Hamburger menu → Order → Incoming Orders (candidate URLs: `/IncomingOrders`, `/IncominOrders`, `/order/incoming`)

**Preconditions:**
- Logged in as admin
- At least one incoming (unprocessed) order exists in the system

**Steps:**
1. Click the hamburger menu
2. Click **Order**
3. Click **Incoming Orders**
4. Wait for page to load (timeout 5s)

**Expected:**
- Page loads with status 200
- Page is NOT redirected to Login
- Incoming orders queue or list is displayed (may be empty)
- Page heading or title contains "Incoming Orders" or "Incoming"

**Fail Criteria:**
- Login redirect
- 404 or 500 error
- Blank/empty page
- No table or list structure visible

---

### TC-IO-02 — Incoming orders list displays with required columns

**Navigation:** Incoming Orders screen (from TC-IO-01)

**Preconditions:**
- TC-IO-01 passed
- At least one incoming order exists in test data

**Steps:**
1. On Incoming Orders screen
2. Examine the orders table/list for the following columns:
   - Accession Number (order ID)
   - Patient Name
   - Test Name or Test List
   - Order Status (e.g., "Pending", "Received", "In Progress")
   - Order Date or Received Date
3. Observe at least one row if orders exist
4. Screenshot the column headers and one sample row

**Expected:**
- Table displays at least the following columns: accession, patient, test, status, date
- Columns are labeled clearly (no truncation)
- Data is readable and properly formatted
- No visual errors (misaligned columns, broken layout)

**Fail Criteria:**
- Table missing key columns (accession, patient, test, status, date)
- Column headers blank or unreadable
- Data truncated or overlapping
- No table structure visible

**Note:** If no incoming orders exist in test data, mark as **SKIP** with reason "No incoming orders in system".

---

### TC-IO-03 — Batch Order Entry screen loads

**Navigation:** Hamburger menu → Order → Batch Order Entry (candidate URLs: `/BatchOrderEntry`, `/BatchEntry`, `/order/batch`)

**Preconditions:**
- Logged in as admin

**Steps:**
1. Click hamburger menu
2. Click **Order**
3. Click **Batch Order Entry** (or similar)
4. Wait for page to load (timeout 5s)

**Expected:**
- Page loads with status 200
- Not redirected to Login
- A form or input area is displayed for batch order entry
- Page heading contains "Batch Order Entry" or "Batch Entry"
- Text area or multi-line input field visible for entering multiple accession numbers

**Fail Criteria:**
- 404 or 500 error
- Login redirect
- Blank page
- No input field for batch entry

---

### TC-IO-04 — Batch entry form accepts multiple accession numbers

**Navigation:** Batch Order Entry screen (from TC-IO-03)

**Preconditions:**
- TC-IO-03 passed
- Batch order entry form is visible

**Steps:**
1. On Batch Order Entry screen
2. Locate the text area or input field for entering accession numbers
3. Enter multiple accession numbers (one per line or comma-separated):
   ```
   26CPHL00001T
   26CPHL00002T
   26CPHL00003T
   ```
4. Click the Parse, Process, or Submit button (label may vary)
5. Wait for form processing (timeout 5s)

**Expected:**
- Form accepts multiple accession numbers without error
- System parses the input (confirms number of orders, e.g., "3 orders to process")
- No validation error for valid accession format
- Form displays parsed list or count of orders to be created

**Fail Criteria:**
- Form rejects valid accession numbers
- Error message on submission
- Input field limited to single entry
- Form does not process multiple entries

---

### TC-IO-05 — Batch order validation flags incomplete entries

**Navigation:** Batch Order Entry screen (from TC-IO-04, with parsed batch data)

**Preconditions:**
- TC-IO-04 passed and batch orders are parsed
- At least one valid order is ready to process

**Steps:**
1. On Batch Order Entry screen with parsed batch data
2. Examine the form for optional fields (e.g., Patient ID, Test Code, Sample Type)
3. If any fields are marked as required, attempt to submit without filling them
4. Alternatively, enter incomplete data:
   - Accession number only (missing test or patient)
   - Test code only (missing accession)
5. Click Submit or Process
6. Observe validation feedback

**Expected (Scenario A - Validation Active):**
- Form displays validation error(s) highlighting missing required fields
- Error message indicates which accession(s) are incomplete
- User is prevented from submitting incomplete batch

**Acceptable (Scenario B - No Validation):**
- Form processes incomplete entries (backend may validate or create partial orders)
- Document actual system behavior for follow-up

**Fail Criteria:**
- Form silently accepts invalid data without validation
- Incomplete orders are saved to database without warning
- No feedback to user on missing data

---

## Suite AI — Workplan By Panel & By Priority (5 TCs)

> Tests the Workplan navigation screens: Workplan > By Panel and Workplan > By Priority.
> These screens allow lab staff to view and organize pending tests by panel type or urgency level.

### TC-WPP-01 — Workplan > By Panel screen loads

**Navigation:** Hamburger menu → Workplan → By Panel (candidate URLs: `/WorkplanByPanel`, `/PanelWorkplan`, `/workplan/panel`)

**Preconditions:**
- Logged in as admin
- At least one panel is configured in the system

**Steps:**
1. Click hamburger menu
2. Click **Workplan**
3. Click **By Panel** (or "Panel Workplan")
4. Wait for page to load (timeout 5s)

**Expected:**
- Page loads with status 200
- Not redirected to Login
- A panel selector (dropdown or list) is visible
- Page heading contains "By Panel" or "Panel Workplan"

**Fail Criteria:**
- 404 or 500 error
- Login redirect
- Blank page
- No panel selector visible

---

### TC-WPP-02 — Panel selector populates with configured panels

**Navigation:** Workplan > By Panel screen (from TC-WPP-01)

**Preconditions:**
- TC-WPP-01 passed
- At least one panel is configured (e.g., "Hematology", "Chemistry", "Microbiology")

**Steps:**
1. On Workplan > By Panel screen
2. Locate the panel selector (dropdown, radio button list, or checkbox list)
3. Observe the available panels
4. Expand the dropdown or view the list of options

**Expected:**
- Panel selector displays at least one option (e.g., "Hematology", "Chemistry")
- Panel names are readable and properly formatted
- Options are selectable (clickable/interactive)
- No error message in the selector area

**Fail Criteria:**
- Panel selector empty (no options)
- Error message displayed
- Selector not interactive (click/selection does not respond)

**Note:** If no panels are configured, mark as **SKIP** with reason "No panels configured in system".

---

### TC-WPP-03 — Select panel shows filtered workplan items

**Navigation:** Workplan > By Panel screen (from TC-WPP-02, with panels visible)

**Preconditions:**
- TC-WPP-02 passed and panel selector is populated
- At least one workplan item exists for a selected panel

**Steps:**
1. On Workplan > By Panel screen
2. Select a panel from the selector (e.g., "Hematology")
3. Wait for workplan items to load (timeout 5s)
4. Observe the workplan table/list

**Expected:**
- Workplan table updates to show items for selected panel
- Table displays: accession number, patient name, test name, status
- Items are filtered by the selected panel (only relevant tests shown)
- No error message

**Acceptable (if no items):**
- Table is empty with message "No workplan items" (if no tests pending for that panel)

**Fail Criteria:**
- Workplan does not update on panel selection
- Wrong panel's items displayed (unfiltered results)
- Error/exception on selection
- Table broken or unreadable

---

### TC-WPP-04 — Workplan > By Priority screen loads

**Navigation:** Hamburger menu → Workplan → By Priority (candidate URLs: `/WorkplanByPriority`, `/PriorityWorkplan`, `/workplan/priority`)

**Preconditions:**
- Logged in as admin

**Steps:**
1. Click hamburger menu
2. Click **Workplan**
3. Click **By Priority** (or "Priority Workplan")
4. Wait for page to load (timeout 5s)

**Expected:**
- Page loads with status 200
- Not redirected to Login
- A priority filter (dropdown, radio buttons, or tabs) is visible
- Page heading contains "By Priority" or "Priority Workplan"

**Fail Criteria:**
- 404 or 500 error
- Login redirect
- Blank page
- No priority filter visible

---

### TC-WPP-05 — Priority filter shows urgent and routine items

**Navigation:** Workplan > By Priority screen (from TC-WPP-04)

**Preconditions:**
- TC-WPP-04 passed
- Workplan items with different priorities exist (e.g., Urgent, Routine, Low)

**Steps:**
1. On Workplan > By Priority screen
2. Locate the priority filter (dropdown or tabs: "Urgent", "Routine", "Low", "All")
3. Select "Urgent" (or highest priority option)
4. Wait for workplan to load (timeout 5s)
5. Observe the workplan table
6. Note the number of items displayed
7. Switch to "Routine" or another priority level
8. Observe items update

**Expected:**
- Workplan table displays items for selected priority
- Items are clearly marked with priority level (visual indicator or label)
- Filter switching updates the table (no page reload necessary)
- Urgent items show first (if sorted by priority)
- Column headers: accession, patient, test, status, priority

**Fail Criteria:**
- Priority filter not functional (selection has no effect)
- No items displayed when items should exist
- Wrong priority items shown
- Table broken after filter change

**Note:** If no priority-based items exist, mark as **SKIP** with reason "No multi-priority workplan items in test data".

---

## Suite AJ — Results By Range & By Test/Date/Status (5 TCs)

> Tests the Results navigation screens: Results > By Range of Order Numbers, Results > By Test/Date/Status, and Order Programs.
> These screens allow supervisors to retrieve results using various search criteria.

### TC-RBR-01 — Results > By Range of Order Numbers screen loads

**Navigation:** Hamburger menu → Results → By Range of Order Numbers (candidate URLs: `/ResultsByRange`, `/OrderRange`, `/results/range`)

**Preconditions:**
- Logged in as admin

**Steps:**
1. Click hamburger menu
2. Click **Results**
3. Click **By Range of Order Numbers** (or similar)
4. Wait for page to load (timeout 5s)

**Expected:**
- Page loads with status 200
- Not redirected to Login
- Two input fields appear: "From Accession Number" and "To Accession Number" (or similar labels)
- A Search or Submit button is visible
- Page heading contains "By Range" or "Range"

**Fail Criteria:**
- 404 or 500 error
- Login redirect
- Blank page
- No input fields for range

---

### TC-RBR-02 — Enter range (from/to accession) returns results

**Navigation:** Results > By Range of Order Numbers (from TC-RBR-01)

**Preconditions:**
- TC-RBR-01 passed
- Accession numbers in range exist (e.g., `26CPHL00001T` through `26CPHL00010T`)

**Steps:**
1. On Results > By Range screen
2. Locate the "From Accession" input field
3. Enter: `26CPHL00001T`
4. Locate the "To Accession" input field
5. Enter: `26CPHL00010T`
6. Click Search or Submit
7. Wait for results (timeout 8s)

**Expected:**
- Results table displays orders within the specified range
- Each row shows: accession number, patient name, test name, result value, status
- Results are sorted by accession number
- No error message

**Fail Criteria:**
- No results returned (blank table when results should exist)
- Results outside specified range returned
- Error/exception on search
- Invalid range handling not implemented

---

### TC-RBR-03 — Results > By Test, Date or Status screen loads

**Navigation:** Hamburger menu → Results → By Test, Date or Status (candidate URLs: `/ResultsByFilter`, `/FilterResults`, `/results/filter`)

**Preconditions:**
- Logged in as admin

**Steps:**
1. Click hamburger menu
2. Click **Results**
3. Click **By Test, Date or Status** (or similar)
4. Wait for page to load (timeout 5s)

**Expected:**
- Page loads with status 200
- Not redirected to Login
- Multiple filter options are visible (Test dropdown, Date picker, Status dropdown)
- At least one search/submit button is present
- Page heading contains "By Test" or "Filter"

**Fail Criteria:**
- 404 or 500 error
- Login redirect
- Blank page
- No filter options visible

---

### TC-RBR-04 — Filter by test type returns results

**Navigation:** Results > By Test, Date or Status (from TC-RBR-03)

**Preconditions:**
- TC-RBR-03 passed
- Results exist for at least one test type (e.g., "HGB", "WBC", "RBC")

**Steps:**
1. On Results > By Test, Date or Status screen
2. Locate the Test dropdown or selector
3. Click and select a test type (e.g., "HGB" or first available)
4. Leave Date and Status filters empty (or select "All")
5. Click Search or Submit
6. Wait for results (timeout 8s)

**Expected:**
- Results table displays orders with the selected test
- Each row shows accession, patient, test name (matching selection), result value, status
- Only the selected test type appears in results
- No error message

**Fail Criteria:**
- No results returned (when results should exist)
- Results include tests other than the selected type
- Test filter not functional
- Error on search

---

### TC-RBR-05 — Order Programs screen loads

**Navigation:** Hamburger menu → Results → Order Programs (candidate URLs: `/OrderPrograms`, `/Programs`, `/results/programs`)

**Preconditions:**
- Logged in as admin

**Steps:**
1. Click hamburger menu
2. Click **Results** (or navigate to parent Results section)
3. Click **Order Programs** (or similar)
4. Wait for page to load (timeout 5s)

**Expected:**
- Page loads with status 200
- Not redirected to Login
- A list or table of order programs is displayed
- Page heading contains "Order Programs" or "Programs"

**Fail Criteria:**
- 404 or 500 error
- Login redirect
- Blank page
- Exception/error message

**Note:** If Order Programs menu item does not exist, mark as **GAP**.

---

## Suite AK — Pathology / IHC / Cytology (5 TCs)

> Tests specialized pathology modules: Pathology, Immunohistochemistry (IHC), and Cytology.
> These modules handle specialized specimen types and diagnostic workflows.

### TC-PATH-01 — Pathology module top-level page loads

**Navigation:** Hamburger menu → Pathology (candidate URLs: `/Pathology`, `/PathologyDashboard`, `/pathology`)

**Preconditions:**
- Logged in as admin

**Steps:**
1. Click hamburger menu
2. Click **Pathology** (if available at top level) OR navigate to Pathology submenu
3. Wait for page to load (timeout 5s)

**Expected:**
- Page loads with status 200
- Not redirected to Login
- Pathology dashboard or case list is displayed
- Page heading contains "Pathology"
- Menu items for case entry or case list visible

**Fail Criteria:**
- 404 or 500 error
- Login redirect
- Blank page
- Exception/error message

**Note:** If Pathology module not available, mark as **GAP**.

---

### TC-PATH-02 — Pathology case list or entry form visible

**Navigation:** Pathology module (from TC-PATH-01)

**Preconditions:**
- TC-PATH-01 passed
- Pathology page is loaded

**Steps:**
1. On Pathology module page
2. Look for:
   - A table/list of existing pathology cases
   - A "Create Case" or "New Case" button
   - Case entry form fields (if form-based workflow)
3. Examine visible sections for pathology-specific fields (e.g., specimen type, diagnosis, slide number)

**Expected:**
- Either a case list with existing cases OR a new case entry form is visible
- If case list: rows show case ID, patient name, specimen type, diagnosis status
- If entry form: fields for specimen info, diagnosis, pathologist assignment are present
- No error message

**Fail Criteria:**
- Page blank or no case functionality visible
- Error on page load
- No input fields or case list
- Pathology-specific fields missing

**Note:** If Pathology module found but case list/entry not visible, mark as **PARTIAL GAP**.

---

### TC-IHC-01 — Immunohistochemistry module loads

**Navigation:** Hamburger menu → Pathology → IHC (or standalone menu item) (candidate URLs: `/IHC`, `/Immunohistochemistry`, `/pathology/ihc`)

**Preconditions:**
- Logged in as admin

**Steps:**
1. Click hamburger menu
2. Navigate to Pathology submenu or look for IHC directly
3. Click **IHC** or **Immunohistochemistry**
4. Wait for page to load (timeout 5s)

**Expected:**
- Page loads with status 200
- Not redirected to Login
- IHC case list, entry form, or dashboard is displayed
- Page heading contains "IHC" or "Immunohistochemistry"

**Fail Criteria:**
- 404 or 500 error
- Login redirect
- Blank page
- Exception/error message

**Note:** If IHC module not available, mark as **GAP**.

---

### TC-CYT-01 — Cytology module loads

**Navigation:** Hamburger menu → Pathology → Cytology (or standalone menu item) (candidate URLs: `/Cytology`, `/CytologyDashboard`, `/pathology/cytology`)

**Preconditions:**
- Logged in as admin

**Steps:**
1. Click hamburger menu
2. Navigate to Pathology submenu or look for Cytology directly
3. Click **Cytology**
4. Wait for page to load (timeout 5s)

**Expected:**
- Page loads with status 200
- Not redirected to Login
- Cytology case list or dashboard is displayed
- Page heading contains "Cytology"

**Fail Criteria:**
- 404 or 500 error
- Login redirect
- Blank page
- Exception/error message

**Note:** If Cytology module not available, mark as **GAP**.

---

### TC-CYT-02 — Cytology case entry form available

**Navigation:** Cytology module (from TC-CYT-01)

**Preconditions:**
- TC-CYT-01 passed
- Cytology page is loaded

**Steps:**
1. On Cytology page
2. Look for a "New Case" or "Create Case" button
3. Click it to open the case entry form
4. Wait for form to load (timeout 3s)
5. Examine form fields for cytology-specific data:
   - Specimen type (e.g., "Pap Smear", "Body Fluid")
   - Specimen ID
   - Patient ID or name
   - Slide number
   - Screening status
   - Report template or text area

**Expected:**
- Case entry form loads without error
- Form contains cytology-specific fields (specimen type, slide number, screening status)
- Submit/Save button is visible
- No validation errors on initial load

**Fail Criteria:**
- No "New Case" or "Create" button visible
- Form fails to load (error or blank)
- Generic order form instead of cytology-specific form
- Submit button missing or disabled

**Note:** If Cytology module found but case entry not available, mark as **PARTIAL GAP**.

---

## Suite AL — Storage Management (4 TCs)

> Tests the Storage Management module for specimen storage location tracking and cold storage monitoring.

### TC-STOR-01 — Storage Management screen loads

**Navigation:** Hamburger menu → Storage → Management (candidate URLs: `/StorageManagement`, `/LabStorage`, `/storage/management`)

**Preconditions:**
- Logged in as admin

**Steps:**
1. Click hamburger menu
2. Click **Storage** (or similar)
3. Click **Management** (or similar)
4. Wait for page to load (timeout 5s)

**Expected:**
- Page loads with status 200
- Not redirected to Login
- Storage management interface is displayed
- Page heading contains "Storage" or "Storage Management"

**Fail Criteria:**
- 404 or 500 error
- Login redirect
- Blank page
- Exception/error message

**Note:** If Storage menu not available, mark as **GAP**.

---

### TC-STOR-02 — Storage locations list visible

**Navigation:** Storage Management screen (from TC-STOR-01)

**Preconditions:**
- TC-STOR-01 passed
- At least one storage location is configured (e.g., "Freezer A", "Shelf 1")

**Steps:**
1. On Storage Management screen
2. Examine the storage locations display (table, tree view, or grid)
3. Look for the following information:
   - Location ID or Name (e.g., "Freezer A", "Room 101")
   - Location Type (e.g., "Freezer", "Refrigerator", "Room Temperature")
   - Capacity (current items / max capacity)
   - Status (e.g., "Active", "Inactive")
4. Count visible locations

**Expected:**
- Storage locations list displays at least one location
- Each location shows: ID/name, type, capacity, status
- List is readable and properly formatted
- No layout errors

**Fail Criteria:**
- No storage locations displayed (empty list when locations should exist)
- Location information incomplete or truncated
- List broken or unreadable

**Note:** If no storage locations configured, mark as **SKIP** with reason "No storage locations configured".

---

### TC-STOR-03 — Cold Storage Monitoring screen loads

**Navigation:** Hamburger menu → Storage → Cold Storage Monitoring (candidate URLs: `/ColdStorageMonitoring`, `/FreezerMonitoring`, `/storage/monitoring`)

**Preconditions:**
- Logged in as admin

**Steps:**
1. Click hamburger menu
2. Click **Storage** (or similar)
3. Click **Cold Storage Monitoring** (or "Freezer Monitoring")
4. Wait for page to load (timeout 5s)

**Expected:**
- Page loads with status 200
- Not redirected to Login
- Cold storage monitoring interface or dashboard is displayed
- Page heading contains "Cold Storage" or "Monitoring"

**Fail Criteria:**
- 404 or 500 error
- Login redirect
- Blank page
- Exception/error message

**Note:** If Cold Storage Monitoring not available, mark as **GAP**.

---

### TC-STOR-04 — Cold storage displays temperature data or monitoring interface

**Navigation:** Cold Storage Monitoring screen (from TC-STOR-03)

**Preconditions:**
- TC-STOR-03 passed
- At least one cold storage device (freezer, refrigerator) is monitored

**Steps:**
1. On Cold Storage Monitoring screen
2. Examine the monitoring display for:
   - Freezer/refrigerator device list (e.g., "Freezer A", "Refrigerator 1")
   - Current temperature readings (e.g., "-20°C", "4°C")
   - Temperature thresholds or alarm status
   - Last updated timestamp
   - Visual indicators (color-coded status: green = OK, red = alarm)
3. Observe one device in detail

**Expected:**
- At least one cold storage device is listed with current temperature
- Temperature is numeric and realistic (e.g., -20 to -80°C for freezers, 2-8°C for fridges)
- Alarm/status indicator visible (if temperature out of range)
- Last updated timestamp is recent (within last hour or so)
- Layout is clear and readable

**Fail Criteria:**
- No temperature data displayed
- Temperature values nonsensical or missing
- No device list or monitoring interface visible
- Last updated timestamp missing or very old

**Note:** If no cold storage devices are monitored, mark as **SKIP** with reason "No cold storage monitoring data available".

---

## Suite AM — Analyzers (4 TCs)

> Tests the Analyzers module for managing laboratory instruments and monitoring analyzer errors.

### TC-ANZ-01 — Analyzer List screen loads

**Navigation:** Hamburger menu → Analyzers → List (candidate URLs: `/AnalyzerList`, `/Instruments`, `/analyzers/list`)

**Preconditions:**
- Logged in as admin

**Steps:**
1. Click hamburger menu
2. Click **Analyzers** (or "Instruments")
3. Click **List** (or similar)
4. Wait for page to load (timeout 5s)

**Expected:**
- Page loads with status 200
- Not redirected to Login
- Analyzer list or table is displayed
- Page heading contains "Analyzer" or "Instrument"

**Fail Criteria:**
- 404 or 500 error
- Login redirect
- Blank page
- Exception/error message

**Note:** If Analyzers menu not available, mark as **GAP**.

---

### TC-ANZ-02 — Analyzer list shows configured instruments

**Navigation:** Analyzer List screen (from TC-ANZ-01)

**Preconditions:**
- TC-ANZ-01 passed
- At least one analyzer is configured in the system (e.g., "Hematology Analyzer 1", "Chemistry Analyzer")

**Steps:**
1. On Analyzer List screen
2. Examine the analyzer list/table for the following columns:
   - Analyzer Name or ID (e.g., "HA-500", "Hematology Analyzer 1")
   - Analyzer Type (e.g., "Hematology", "Chemistry", "Immunology")
   - Manufacturer (optional)
   - Serial Number (optional)
   - Status (e.g., "Active", "Inactive", "Error")
3. Count visible analyzers

**Expected:**
- List displays at least one configured analyzer
- Analyzer name, type, and status are visible
- No layout errors or truncation
- Columns are properly labeled

**Fail Criteria:**
- No analyzers displayed (empty list when should exist)
- Analyzer information incomplete or truncated
- List broken or unreadable

**Note:** If no analyzers configured, mark as **SKIP** with reason "No analyzers configured in system".

---

### TC-ANZ-03 — Error Dashboard loads

**Navigation:** Hamburger menu → Analyzers → Error Dashboard (candidate URLs: `/ErrorDashboard`, `/AnalyzerErrors`, `/analyzers/errors`)

**Preconditions:**
- Logged in as admin

**Steps:**
1. Click hamburger menu
2. Click **Analyzers** (or similar)
3. Click **Error Dashboard** (or "Errors")
4. Wait for page to load (timeout 5s)

**Expected:**
- Page loads with status 200
- Not redirected to Login
- Error dashboard or error log is displayed
- Page heading contains "Error" or "Dashboard"

**Fail Criteria:**
- 404 or 500 error
- Login redirect
- Blank page
- Exception/error message

**Note:** If Error Dashboard not available, mark as **GAP**.

---

### TC-ANZ-04 — Analyzer Types screen loads

**Navigation:** Hamburger menu → Analyzers → Analyzer Types (candidate URLs: `/AnalyzerTypes`, `/InstrumentTypes`, `/analyzers/types`)

**Preconditions:**
- Logged in as admin

**Steps:**
1. Click hamburger menu
2. Click **Analyzers** (or similar)
3. Click **Analyzer Types** (or "Types")
4. Wait for page to load (timeout 5s)

**Expected:**
- Page loads with status 200
- Not redirected to Login
- Analyzer types list is displayed
- Page heading contains "Analyzer Types" or "Types"

**Fail Criteria:**
- 404 or 500 error
- Login redirect
- Blank page
- Exception/error message

**Note:** If Analyzer Types not available, mark as **GAP**.

---

## Suite AN — EQA Distributions (3 TCs)

> Tests External Quality Assurance (EQA) program distributions and management.

### TC-EQA-01 — EQA Distributions screen loads

**Navigation:** Hamburger menu → EQA (or QA) → Distributions (candidate URLs: `/EQADistributions`, `/QADistributions`, `/eqa/distributions`)

**Preconditions:**
- Logged in as admin

**Steps:**
1. Click hamburger menu
2. Click **EQA** or **QA** (if available)
3. Click **Distributions**
4. Wait for page to load (timeout 5s)

**Expected:**
- Page loads with status 200
- Not redirected to Login
- EQA distributions list or dashboard is displayed
- Page heading contains "EQA" or "Distributions"

**Fail Criteria:**
- 404 or 500 error
- Login redirect
- Blank page
- Exception/error message

**Note:** If EQA menu not available, mark as **GAP**.

---

### TC-EQA-02 — EQA distribution list or entry form visible

**Navigation:** EQA Distributions screen (from TC-EQA-01)

**Preconditions:**
- TC-EQA-01 passed
- EQA distributions exist or new distribution entry is available

**Steps:**
1. On EQA Distributions screen
2. Examine the display for:
   - A table/list of existing EQA distributions (distribution ID, program name, round, status, date)
   - A "Create Distribution" or "New Distribution" button
   - Entry form fields (if available)
3. Look for EQA-specific information: program name, round number, distribution date, results deadline

**Expected:**
- Either a list of distributions or an entry form is visible
- If list: rows show distribution ID, program, round, status, date
- If entry form: fields for program selection, round, distribution date are present
- No error message

**Fail Criteria:**
- Page blank or no distributions/form visible
- Error on page load
- No list or entry capability

**Note:** If EQA found but list/entry not visible, mark as **PARTIAL GAP**.

---

### TC-EQA-03 — EQA Program Management page loads (Admin)

**Navigation:** Hamburger menu → EQA (or Admin) → Program Management (candidate URLs: `/EQAProgramManagement`, `/QAProgramManagement`, `/eqa/programs`)

**Preconditions:**
- Logged in as admin

**Steps:**
1. Click hamburger menu
2. Navigate to EQA or Admin section
3. Click **Program Management** (or "Programs")
4. Wait for page to load (timeout 5s)

**Expected:**
- Page loads with status 200
- Not redirected to Login
- EQA program list or management interface is displayed
- Page heading contains "Program" or "Management"

**Fail Criteria:**
- 404 or 500 error
- Login redirect
- Blank page
- Exception/error message

**Note:** If EQA Program Management not available, mark as **GAP**.

---

## Suite AO — Aliquot (3 TCs)

> Tests the Aliquot module for managing specimen subdivisions.

### TC-ALQ-01 — Aliquot screen loads

**Navigation:** Hamburger menu → Aliquot (or Order → Aliquot) (candidate URLs: `/Aliquot`, `/SpecimenAliquot`, `/aliquot`)

**Preconditions:**
- Logged in as admin

**Steps:**
1. Click hamburger menu
2. Navigate to **Aliquot** (may be under Order, Specimen, or top-level menu)
3. Wait for page to load (timeout 5s)

**Expected:**
- Page loads with status 200
- Not redirected to Login
- Aliquot management interface is displayed
- Page heading contains "Aliquot"

**Fail Criteria:**
- 404 or 500 error
- Login redirect
- Blank page
- Exception/error message

**Note:** If Aliquot menu not available, mark as **GAP**.

---

### TC-ALQ-02 — Aliquot entry form visible with parent/child fields

**Navigation:** Aliquot screen (from TC-ALQ-01)

**Preconditions:**
- TC-ALQ-01 passed
- Aliquot page is loaded

**Steps:**
1. On Aliquot screen
2. Look for a "Create Aliquot" or "New Aliquot" button
3. Click to open the aliquot entry form
4. Wait for form to load (timeout 3s)
5. Examine form fields for:
   - Parent Sample ID or Accession (the original specimen)
   - Number of Aliquots (how many subdivisions)
   - Aliquot Sample IDs or Labels (child specimen identifiers)
   - Container Type or Volume (optional)
6. Screenshot the form

**Expected:**
- Form loads without error
- Parent sample field is visible and accepting input
- Aliquot details (count, IDs, labels) can be entered
- Submit/Save button is present
- No validation errors on initial load

**Fail Criteria:**
- No "Create Aliquot" or entry form visible
- Form fails to load (error or blank)
- Parent/child fields missing
- Submit button missing or disabled

**Note:** If Aliquot found but entry form not available, mark as **PARTIAL GAP**.

---

### TC-ALQ-03 — Aliquot creation workflow executes

**Navigation:** Aliquot entry form (from TC-ALQ-02, form loaded)

**Preconditions:**
- TC-ALQ-02 passed and aliquot form is displayed
- Parent sample (accession number) exists

**Steps:**
1. On Aliquot entry form
2. Enter parent sample ID: `26CPHL00001T` (or first available accession)
3. Enter number of aliquots: `3`
4. System may auto-generate child aliquot IDs (e.g., `26CPHL00001T-A1`, `26CPHL00001T-A2`, etc.)
5. Or manually enter aliquot labels if required
6. Click Save or Submit
7. Wait for submission (timeout 5s)

**Expected:**
- Form submits without validation error
- System generates child sample IDs automatically (if supported) or accepts manual entry
- Page redirects to aliquot list or shows success message
- Created aliquots visible on follow-up navigation

**Acceptable (Scenario B - Partial):**
- Form submits but aliquots are not fully created
- Backend processes aliquots asynchronously

**Fail Criteria:**
- Form validation error (required fields, invalid format)
- Submission error (500, backend validation)
- Aliquots not saved to database
- Silent failure (no feedback)

**Note:** If aliquot creation not functional, document actual error or limitation.

---

## Suite AP — Billing & NoteBook (4 TCs)

> Tests the Billing module for invoice management and the NoteBook module for notes/documentation.

### TC-BILL-01 — Billing module loads

**Navigation:** Hamburger menu → Billing (candidate URLs: `/Billing`, `/BillingDashboard`, `/billing`)

**Preconditions:**
- Logged in as admin

**Steps:**
1. Click hamburger menu
2. Click **Billing** (if available at top level or under a parent menu)
3. Wait for page to load (timeout 5s)

**Expected:**
- Page loads with status 200
- Not redirected to Login
- Billing dashboard, invoice list, or management interface is displayed
- Page heading contains "Billing" or "Invoice"

**Fail Criteria:**
- 404 or 500 error
- Login redirect
- Blank page
- Exception/error message

**Note:** If Billing menu not available, mark as **GAP**.

---

### TC-BILL-02 — Billing shows invoice/charge list or entry form

**Navigation:** Billing module (from TC-BILL-01)

**Preconditions:**
- TC-BILL-01 passed
- Billing page is loaded

**Steps:**
1. On Billing page
2. Examine the display for:
   - A list/table of invoices or charges (invoice ID, patient/facility, amount, status, date)
   - A "Create Invoice" or "New Charge" button
   - Entry form fields (if form-based workflow)
3. Look for billing-specific fields: invoice number, patient/facility name, test charges, total amount, payment status

**Expected:**
- Either an invoice list with existing invoices OR an entry form is visible
- If list: rows show invoice ID, patient/facility, amount, status, date
- If entry form: fields for patient selection, test charges, payment terms are present
- No error message

**Fail Criteria:**
- Page blank or no billing functionality visible
- Error on page load
- No list or entry capability
- Billing-specific fields missing

**Note:** If Billing module found but list/entry not visible, mark as **PARTIAL GAP**.

---

### TC-NOTE-01 — NoteBook module loads

**Navigation:** Hamburger menu → NoteBook (or Notes) (candidate URLs: `/NoteBook`, `/Notes`, `/notebook`)

**Preconditions:**
- Logged in as admin

**Steps:**
1. Click hamburger menu
2. Click **NoteBook** or **Notes** (if available)
3. Wait for page to load (timeout 5s)

**Expected:**
- Page loads with status 200
- Not redirected to Login
- NoteBook interface or notes list is displayed
- Page heading contains "NoteBook" or "Notes"

**Fail Criteria:**
- 404 or 500 error
- Login redirect
- Blank page
- Exception/error message

**Note:** If NoteBook menu not available, mark as **GAP**.

---

### TC-NOTE-02 — NoteBook entry or list visible

**Navigation:** NoteBook module (from TC-NOTE-01)

**Preconditions:**
- TC-NOTE-01 passed
- NoteBook page is loaded

**Steps:**
1. On NoteBook page
2. Examine the display for:
   - A list of existing notes (note ID, title, date created, author)
   - A "Create Note" or "New Note" button
   - Entry form fields (title, content, date, author)
3. Look for note-specific functionality: note text area, date/time stamps, formatting (bold, italic, etc.)

**Expected:**
- Either a notes list with existing notes OR a new note entry form is visible
- If list: rows show note ID/title, date, author (if applicable)
- If entry form: text area for note content and metadata fields are present
- No error message

**Fail Criteria:**
- Page blank or no notes functionality visible
- Error on page load
- No list or entry capability
- Note content field missing

**Note:** If NoteBook found but list/entry not visible, mark as **PARTIAL GAP**.

---

## Test Execution Summary

| Suite | Test Case | Description | Priority | Expected Outcome |
|-------|-----------|-------------|----------|-----------------|
| AH | TC-IO-01 | Incoming Orders screen loads | P3 | Load with status 200 |
| AH | TC-IO-02 | Incoming orders list displays columns | P3 | Accession, patient, test, status, date visible |
| AH | TC-IO-03 | Batch Order Entry screen loads | P3 | Load with status 200 |
| AH | TC-IO-04 | Batch entry accepts multiple accessions | P3 | Form accepts and parses entries |
| AH | TC-IO-05 | Batch validation flags incomplete entries | P3 | Validation error or processing proceeds |
| AI | TC-WPP-01 | Workplan > By Panel loads | P3 | Load with status 200 |
| AI | TC-WPP-02 | Panel selector populates | P3 | Panel options visible |
| AI | TC-WPP-03 | Select panel shows filtered items | P3 | Items filtered by panel |
| AI | TC-WPP-04 | Workplan > By Priority loads | P3 | Load with status 200 |
| AI | TC-WPP-05 | Priority filter shows items | P3 | Items filtered by priority |
| AJ | TC-RBR-01 | Results > By Range loads | P3 | Load with status 200 |
| AJ | TC-RBR-02 | Range search returns results | P3 | Results table populated |
| AJ | TC-RBR-03 | Results > By Test/Date/Status loads | P3 | Load with status 200 |
| AJ | TC-RBR-04 | Test filter returns results | P3 | Results filtered by test |
| AJ | TC-RBR-05 | Order Programs screen loads | P3 | Load with status 200 |
| AK | TC-PATH-01 | Pathology module loads | P4 | Load with status 200 |
| AK | TC-PATH-02 | Pathology case list/form visible | P4 | Case list or entry form |
| AK | TC-IHC-01 | IHC module loads | P4 | Load with status 200 |
| AK | TC-CYT-01 | Cytology module loads | P4 | Load with status 200 |
| AK | TC-CYT-02 | Cytology case entry form available | P4 | Entry form visible |
| AL | TC-STOR-01 | Storage Management loads | P4 | Load with status 200 |
| AL | TC-STOR-02 | Storage locations list visible | P4 | Locations displayed |
| AL | TC-STOR-03 | Cold Storage Monitoring loads | P4 | Load with status 200 |
| AL | TC-STOR-04 | Cold storage displays temperature data | P4 | Temperature readings visible |
| AM | TC-ANZ-01 | Analyzer List loads | P4 | Load with status 200 |
| AM | TC-ANZ-02 | Analyzer list shows instruments | P4 | Analyzers displayed |
| AM | TC-ANZ-03 | Error Dashboard loads | P4 | Load with status 200 |
| AM | TC-ANZ-04 | Analyzer Types loads | P4 | Load with status 200 |
| AN | TC-EQA-01 | EQA Distributions loads | P4 | Load with status 200 |
| AN | TC-EQA-02 | EQA distribution list/form visible | P4 | Distributions or entry form |
| AN | TC-EQA-03 | EQA Program Management loads | P4 | Load with status 200 |
| AO | TC-ALQ-01 | Aliquot screen loads | P4 | Load with status 200 |
| AO | TC-ALQ-02 | Aliquot entry form visible | P4 | Form with parent/child fields |
| AO | TC-ALQ-03 | Aliquot creation workflow executes | P4 | Aliquots created or documented |
| AP | TC-BILL-01 | Billing module loads | P4 | Load with status 200 |
| AP | TC-BILL-02 | Billing shows invoice/charge list | P4 | Invoice list or entry form |
| AP | TC-NOTE-01 | NoteBook module loads | P4 | Load with status 200 |
| AP | TC-NOTE-02 | NoteBook entry or list visible | P4 | Notes list or entry form |

**Total: 38 test cases across 9 suites (AH–AP)**

---

## Notes

- **URL Discovery:** Each screen has multiple candidate URL patterns. Tests attempt graceful degradation: if `/BatchOrderEntry` returns 404, try `/batch/entry` or `/order/batch` before marking as **GAP**.
- **Test Data:** Tests assume standard patient "Abby Sebby" (ID 0123456) with orders exists. If different test data is available, substitute accordingly.
- **Accession Format:** Standard format is `26CPHL00000X` (e.g., `26CPHL00001T`). Adjust based on actual test data.
- **Conditional Tests:** Tests marked **SKIP** should be executed only if required data exists. Mark as **SKIP** with reason if prerequisites cannot be met.
- **GAP Documentation:** When a menu item or screen is not found (404 error), mark as **GAP** and note for development/product team.
- **Specialized Modules:** Priority 4 (Pathology, IHC, Cytology, Storage, Analyzers, EQA, Aliquot, Billing, NoteBook) may have limited availability depending on system configuration. Mark unavailable features as **GAP**.

