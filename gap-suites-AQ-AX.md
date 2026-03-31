# OpenELIS Global — Gap Suites AQ–AX (Priority 5: Admin Configuration Gaps)

**Target:** https://www.jdhealthsolutions-openelis.com
**Version:** OpenELIS Global 3.2.1.3
**UI:** Carbon for React (v3.x frontend)
**Test Prefix:** `QA_AUTO_<MMDD>` (e.g., `QA_AUTO_0324` for March 24)
**Admin Credentials:** admin / adminADMIN!

---

## Summary Table

| Suite | Name | Test Cases | Coverage |
|-------|------|-----------|----------|
| AQ | Reflex Tests & Analyzer Test Name | 4 | Reflex config, analyzer test name mapping |
| AR | Lab Number & Program Management | 4 | Lab number format, program entry |
| AS | Provider & Barcode Configuration | 4 | Provider management, barcode format |
| AT | Result Reporting & Menu Configuration | 4 | Result reporting rules, menu items |
| AU | General Config & App Properties | 4 | General configurations, app properties |
| AV | Notifications & Search Index | 4 | Test notifications, search index management |
| AW | Logging, Legacy Admin, Plugins | 5 | Logging levels, legacy admin, plugins list |
| AX | Localization, Notify User, Batch Reassignment | 5 | Localization, user notifications, batch reassignment |
| **TOTAL** | | **34 TCs** | 15+ admin screens untested |

---

## Suite AQ — Reflex Tests & Analyzer Test Name (4 TCs)

> Tests the Reflex Tests Configuration and Analyzer Test Name management screens.
> These admin pages allow configuration of reflex testing rules and test name mappings for analyzers.

### TC-RFX-01 — Reflex Tests Configuration page loads

**Navigation:** Admin → Reflex Tests Configuration (candidate URLs: `/RefflexTestConfiguration`, `/ReflexTestConfig`, `/admin/reflex`)

**Preconditions:**
- Logged in as admin
- On `/MasterListsPage` (Admin home)

**Steps:**
1. From Admin page (/MasterListsPage), locate and click **Reflex Tests Configuration** in the left sidebar
2. Wait for page to load (timeout 5s)
3. Verify page response status

**Expected:**
- Page loads with status 200
- Page is NOT redirected to Login
- Page heading or title contains "Reflex Tests Configuration" or "Reflex Test"
- Page is fully rendered (not blank)

**Fail Criteria:**
- Login redirect
- 404 or 500 error
- Blank/empty page
- Page title missing or unrelated

---

### TC-RFX-02 — Reflex test list or configuration form visible

**Navigation:** Reflex Tests Configuration screen (from TC-RFX-01)

**Preconditions:**
- TC-RFX-01 passed
- Reflex Tests Configuration page is loaded

**Steps:**
1. On Reflex Tests Configuration page
2. Examine for one of the following elements:
   - A table/list showing reflex test rules (columns: test name, condition, reflex action)
   - A form for entering/editing reflex test configurations
   - Add/Edit/Delete buttons for managing reflex tests
3. Observe layout and interactive elements

**Expected:**
- At least one of: table, form, or action buttons is visible
- Configuration list displays reflex test data (if any exist)
- Form fields or table columns are readable and not truncated
- No visual layout errors

**Fail Criteria:**
- No table, form, or configuration interface visible
- Blank content area
- Configuration list unreadable or hidden
- UI elements not properly rendered

**Note:** If no reflex tests are configured, mark as **SKIP** with reason "No reflex tests configured in system".

---

### TC-ATN-01 — Analyzer Test Name page loads

**Navigation:** Admin → Analyzer Test Name (candidate URLs: `/AnalyzerTestName`, `/AnalyzerTestMapping`, `/admin/analyzer-test-name`)

**Preconditions:**
- Logged in as admin
- On `/MasterListsPage` (Admin home)

**Steps:**
1. From Admin page (/MasterListsPage), locate and click **Analyzer Test Name** in the left sidebar
2. Wait for page to load (timeout 5s)
3. Verify page response status

**Expected:**
- Page loads with status 200
- Not redirected to Login
- Page heading contains "Analyzer Test Name" or "Analyzer Test"
- Page is fully rendered

**Fail Criteria:**
- Login redirect
- 404 or 500 error
- Blank page
- Page title missing or unrelated

---

### TC-ATN-02 — Analyzer test name mapping list visible

**Navigation:** Analyzer Test Name page (from TC-ATN-01)

**Preconditions:**
- TC-ATN-01 passed
- Analyzer Test Name page is loaded

**Steps:**
1. On Analyzer Test Name page
2. Examine for one of the following:
   - A table showing analyzer-to-OpenELIS test name mappings (columns: analyzer name, OpenELIS test name)
   - A form for mapping analyzer tests to system tests
   - Add/Edit/Delete buttons for managing mappings
3. Observe content and layout

**Expected:**
- At least one of: mapping table, configuration form, or action buttons is visible
- Mapping list displays data (if any mappings exist)
- Columns or fields are readable and properly aligned
- No visual layout errors

**Fail Criteria:**
- No table, form, or interface visible
- Blank content area
- Mapping data unreadable or hidden
- UI elements not properly rendered

**Note:** If no analyzer test mappings exist, mark as **SKIP** with reason "No analyzer test mappings configured".

---

## Suite AR — Lab Number & Program Management (4 TCs)

> Tests the Lab Number Management and Program Entry admin screens.
> These pages configure lab identification numbers and program-level organizational structures.

### TC-LNM-01 — Lab Number Management page loads

**Navigation:** Admin → Lab Number Management (candidate URLs: `/LabNumberManagement`, `/LabNumberConfig`, `/admin/lab-number`)

**Preconditions:**
- Logged in as admin
- On `/MasterListsPage` (Admin home)

**Steps:**
1. From Admin page (/MasterListsPage), locate and click **Lab Number Management** in the left sidebar
2. Wait for page to load (timeout 5s)
3. Verify page response status

**Expected:**
- Page loads with status 200
- Not redirected to Login
- Page heading contains "Lab Number Management" or "Lab Number"
- Page is fully rendered

**Fail Criteria:**
- Login redirect
- 404 or 500 error
- Blank page
- Page title missing or unrelated

---

### TC-LNM-02 — Lab number format/sequence configuration visible

**Navigation:** Lab Number Management page (from TC-LNM-01)

**Preconditions:**
- TC-LNM-01 passed
- Lab Number Management page is loaded

**Steps:**
1. On Lab Number Management page
2. Examine for configuration elements:
   - A form with fields for lab number prefix, format, or sequence
   - A list showing configured lab numbers (columns: lab ID, name, format, sequence)
   - Edit/Save buttons for updating lab number configuration
   - Display of current format pattern (e.g., "Lab-YYYY-NNNNNN")
3. Observe content and controls

**Expected:**
- At least one of: configuration form or lab number list is visible
- Format/sequence fields or display are readable
- No validation errors displayed
- Controls (buttons, fields) are interactive and visible

**Fail Criteria:**
- No form or configuration interface visible
- Blank content area
- Format information hidden or unreadable
- Controls not properly rendered

---

### TC-PGM-01 — Program Entry page loads

**Navigation:** Admin → Program Entry (candidate URLs: `/ProgramEntry`, `/ProgramMaster`, `/admin/program`)

**Preconditions:**
- Logged in as admin
- On `/MasterListsPage` (Admin home)

**Steps:**
1. From Admin page (/MasterListsPage), locate and click **Program Entry** in the left sidebar
2. Wait for page to load (timeout 5s)
3. Verify page response status

**Expected:**
- Page loads with status 200
- Not redirected to Login
- Page heading contains "Program Entry" or "Program"
- Page is fully rendered

**Fail Criteria:**
- Login redirect
- 404 or 500 error
- Blank page
- Page title missing or unrelated

---

### TC-PGM-02 — Program list or entry form visible

**Navigation:** Program Entry page (from TC-PGM-01)

**Preconditions:**
- TC-PGM-01 passed
- Program Entry page is loaded

**Steps:**
1. On Program Entry page
2. Examine for interface elements:
   - A table/list displaying programs (columns: program name, program code, description, status)
   - A form for creating or editing programs
   - Add/Edit/Delete/View buttons for program management
   - Search or filter controls for finding programs
3. Observe layout and content

**Expected:**
- At least one of: program list, entry form, or action buttons is visible
- Program data is displayed (if any programs exist)
- Columns/fields are readable and properly formatted
- Interactive elements are responsive

**Fail Criteria:**
- No list, form, or interface visible
- Blank content area
- Program data hidden or unreadable
- Controls not functional or hidden

**Note:** If no programs are configured, mark as **SKIP** with reason "No programs configured in system".

---

## Suite AS — Provider & Barcode Configuration (4 TCs)

> Tests the Provider Management and Barcode Configuration admin screens.
> These pages manage healthcare provider information and barcode format settings for specimen tracking.

### TC-PROV-01 — Provider Management page loads

**Navigation:** Admin → Provider Management (candidate URLs: `/ProviderManagement`, `/ProviderMaster`, `/admin/provider`)

**Preconditions:**
- Logged in as admin
- On `/MasterListsPage` (Admin home)

**Steps:**
1. From Admin page (/MasterListsPage), locate and click **Provider Management** in the left sidebar
2. Wait for page to load (timeout 5s)
3. Verify page response status

**Expected:**
- Page loads with status 200
- Not redirected to Login
- Page heading contains "Provider Management" or "Provider"
- Page is fully rendered

**Fail Criteria:**
- Login redirect
- 404 or 500 error
- Blank page
- Page title missing or unrelated

---

### TC-PROV-02 — Provider list with search/filter visible

**Navigation:** Provider Management page (from TC-PROV-01)

**Preconditions:**
- TC-PROV-01 passed
- Provider Management page is loaded

**Steps:**
1. On Provider Management page
2. Examine for interface elements:
   - A table/list displaying providers (columns: provider name, provider ID, specialty, contact info)
   - A search bar or filter controls for finding providers
   - Add/Edit/Delete buttons for provider management
   - Pagination controls (if many providers exist)
3. Verify searchability and layout

**Expected:**
- Provider list or table is visible
- Search/filter controls are present and interactive
- Provider data columns are readable
- At least one provider entry is displayed (if providers exist)
- No visual layout errors

**Fail Criteria:**
- No provider list or search interface visible
- Blank content area
- Search controls not functional
- Provider data unreadable or hidden

**Note:** If no providers are configured, mark as **SKIP** with reason "No providers configured in system".

---

### TC-BAR-01 — Barcode Configuration page loads

**Navigation:** Admin → Barcode Configuration (candidate URLs: `/BarcodeConfiguration`, `/BarcodeConfig`, `/admin/barcode`)

**Preconditions:**
- Logged in as admin
- On `/MasterListsPage` (Admin home)

**Steps:**
1. From Admin page (/MasterListsPage), locate and click **Barcode Configuration** in the left sidebar
2. Wait for page to load (timeout 5s)
3. Verify page response status

**Expected:**
- Page loads with status 200
- Not redirected to Login
- Page heading contains "Barcode Configuration" or "Barcode"
- Page is fully rendered

**Fail Criteria:**
- Login redirect
- 404 or 500 error
- Blank page
- Page title missing or unrelated

---

### TC-BAR-02 — Barcode format settings visible

**Navigation:** Barcode Configuration page (from TC-BAR-01)

**Preconditions:**
- TC-BAR-01 passed
- Barcode Configuration page is loaded

**Steps:**
1. On Barcode Configuration page
2. Examine for configuration elements:
   - A form with barcode format fields (prefix, suffix, check digit algorithm, length)
   - Display of current barcode format pattern or example
   - Settings for barcode generation or validation rules
   - Save/Update buttons to apply changes
3. Observe form fields and controls

**Expected:**
- Configuration form or settings display is visible
- Barcode format fields are readable and properly labeled
- Format pattern example is shown (if applicable)
- Save/Update controls are present and interactive

**Fail Criteria:**
- No configuration form or settings visible
- Blank content area
- Format settings hidden or unreadable
- No Save/Update button visible

---

## Suite AT — Result Reporting & Menu Configuration (4 TCs)

> Tests the Result Reporting Configuration and Menu Configuration admin screens.
> These pages configure how results are reported and customize the admin menu structure.

### TC-RRC-01 — Result Reporting Configuration page loads

**Navigation:** Admin → Result Reporting Configuration (candidate URLs: `/ResultReportingConfiguration`, `/ReportingConfig`, `/admin/result-reporting`)

**Preconditions:**
- Logged in as admin
- On `/MasterListsPage` (Admin home)

**Steps:**
1. From Admin page (/MasterListsPage), locate and click **Result Reporting Configuration** in the left sidebar
2. Wait for page to load (timeout 5s)
3. Verify page response status

**Expected:**
- Page loads with status 200
- Not redirected to Login
- Page heading contains "Result Reporting Configuration" or "Reporting"
- Page is fully rendered

**Fail Criteria:**
- Login redirect
- 404 or 500 error
- Blank page
- Page title missing or unrelated

---

### TC-RRC-02 — Reporting rules or configuration list visible

**Navigation:** Result Reporting Configuration page (from TC-RRC-01)

**Preconditions:**
- TC-RRC-01 passed
- Result Reporting Configuration page is loaded

**Steps:**
1. On Result Reporting Configuration page
2. Examine for interface elements:
   - A table/list showing reporting rules (columns: rule name, condition, action, status)
   - A form for creating or editing reporting rules
   - Configuration options for result formatting, delivery method, or filtering
   - Add/Edit/Delete buttons for rule management
3. Observe layout and content

**Expected:**
- At least one of: reporting rules list, configuration form, or action buttons is visible
- Rule data is displayed (if any rules exist)
- Columns/fields are readable and properly formatted
- No validation errors shown

**Fail Criteria:**
- No list, form, or interface visible
- Blank content area
- Rules data hidden or unreadable
- Controls not functional or missing

**Note:** If no reporting rules are configured, mark as **SKIP** with reason "No reporting rules configured".

---

### TC-MCF-01 — Menu Configuration page loads

**Navigation:** Admin → Menu Configuration (expand chevron, candidate URLs: `/MenuConfiguration`, `/MenuConfig`, `/admin/menu`)

**Preconditions:**
- Logged in as admin
- On `/MasterListsPage` (Admin home)
- Admin menu may have an expandable section for "Menu Configuration"

**Steps:**
1. From Admin page (/MasterListsPage), locate **Menu Configuration** item
2. If item has a chevron/arrow, click to expand
3. Click **Menu Configuration**
4. Wait for page to load (timeout 5s)
5. Verify page response status

**Expected:**
- Page loads with status 200
- Not redirected to Login
- Page heading contains "Menu Configuration" or "Menu"
- Page is fully rendered

**Fail Criteria:**
- Login redirect
- 404 or 500 error
- Blank page
- Page title missing or unrelated
- Chevron does not expand (if expandable)

---

### TC-MCF-02 — Menu items list editable

**Navigation:** Menu Configuration page (from TC-MCF-01)

**Preconditions:**
- TC-MCF-01 passed
- Menu Configuration page is loaded

**Steps:**
1. On Menu Configuration page
2. Examine for menu item elements:
   - A table/tree structure showing menu items (columns: menu name, label, URL, visibility, order)
   - Edit/Enable/Disable buttons for individual menu items
   - Add/Remove menu item controls
   - Reorder controls (drag-and-drop or up/down arrows)
3. Observe layout and interactive elements

**Expected:**
- Menu items list or tree is visible
- Menu items are readable and clearly labeled
- Edit/Enable/Disable buttons are present and functional
- Reorder controls or drag-and-drop is available
- No visual layout errors

**Fail Criteria:**
- No menu items list visible
- Blank content area
- Menu items unreadable or hidden
- Edit/reorder controls not functional or missing

---

## Suite AU — General Config & App Properties (4 TCs)

> Tests the General Configurations and Application Properties admin screens.
> These pages configure system-wide settings and application-level properties.

### TC-GCF-01 — General Configurations page loads

**Navigation:** Admin → General Configurations (expand chevron, candidate URLs: `/GeneralConfigurations`, `/GeneralConfig`, `/admin/general-config`)

**Preconditions:**
- Logged in as admin
- On `/MasterListsPage` (Admin home)
- Admin menu may have an expandable section for "General Configurations"

**Steps:**
1. From Admin page (/MasterListsPage), locate **General Configurations** item
2. If item has a chevron/arrow, click to expand
3. Click **General Configurations**
4. Wait for page to load (timeout 5s)
5. Verify page response status

**Expected:**
- Page loads with status 200
- Not redirected to Login
- Page heading contains "General Configurations" or "General Config"
- Page is fully rendered

**Fail Criteria:**
- Login redirect
- 404 or 500 error
- Blank page
- Page title missing or unrelated
- Chevron does not expand (if expandable)

---

### TC-GCF-02 — Configuration key-value list or form visible

**Navigation:** General Configurations page (from TC-GCF-01)

**Preconditions:**
- TC-GCF-01 passed
- General Configurations page is loaded

**Steps:**
1. On General Configurations page
2. Examine for configuration elements:
   - A table/form showing configuration key-value pairs (columns: key, value, description, type)
   - Input fields for editing configuration values
   - Search/filter for finding specific configurations
   - Save/Update button for persisting changes
3. Observe layout and controls

**Expected:**
- Configuration list or form is visible
- Configuration keys and values are readable
- Edit fields are present and interactive
- At least one configuration entry is displayed
- No visual errors

**Fail Criteria:**
- No configuration list or form visible
- Blank content area
- Configuration data unreadable or hidden
- Edit controls not functional

---

### TC-APP-01 — Application Properties page loads

**Navigation:** Admin → Application Properties (candidate URLs: `/ApplicationProperties`, `/AppProperties`, `/admin/app-properties`)

**Preconditions:**
- Logged in as admin
- On `/MasterListsPage` (Admin home)

**Steps:**
1. From Admin page (/MasterListsPage), locate and click **Application Properties** in the left sidebar
2. Wait for page to load (timeout 5s)
3. Verify page response status

**Expected:**
- Page loads with status 200
- Not redirected to Login
- Page heading contains "Application Properties" or "App Properties"
- Page is fully rendered

**Fail Criteria:**
- Login redirect
- 404 or 500 error
- Blank page
- Page title missing or unrelated

---

### TC-APP-02 — Properties list with editable values visible

**Navigation:** Application Properties page (from TC-APP-01)

**Preconditions:**
- TC-APP-01 passed
- Application Properties page is loaded

**Steps:**
1. On Application Properties page
2. Examine for property elements:
   - A table/list showing application properties (columns: property name, value, type, description)
   - Input fields for editing property values
   - Save/Update/Apply buttons
   - Property categories or groupings (if organized)
3. Observe layout and content

**Expected:**
- Properties list or form is visible
- Property names and values are readable
- Edit fields are present and interactive
- Save/Update controls are available
- At least one property entry is displayed

**Fail Criteria:**
- No properties list or form visible
- Blank content area
- Property data unreadable or hidden
- Edit controls not functional or missing

---

## Suite AV — Notifications & Search Index (4 TCs)

> Tests the Test Notification Configuration and Search Index Management admin screens.
> These pages configure test result notifications and manage search index operations.

### TC-TNF-01 — Test Notification Configuration page loads

**Navigation:** Admin → Test Notification Configuration (candidate URLs: `/TestNotificationConfiguration`, `/NotificationConfig`, `/admin/test-notification`)

**Preconditions:**
- Logged in as admin
- On `/MasterListsPage` (Admin home)

**Steps:**
1. From Admin page (/MasterListsPage), locate and click **Test Notification Configuration** in the left sidebar
2. Wait for page to load (timeout 5s)
3. Verify page response status

**Expected:**
- Page loads with status 200
- Not redirected to Login
- Page heading contains "Test Notification Configuration" or "Notification"
- Page is fully rendered

**Fail Criteria:**
- Login redirect
- 404 or 500 error
- Blank page
- Page title missing or unrelated

---

### TC-TNF-02 — Notification rules or configuration form visible

**Navigation:** Test Notification Configuration page (from TC-TNF-01)

**Preconditions:**
- TC-TNF-01 passed
- Test Notification Configuration page is loaded

**Steps:**
1. On Test Notification Configuration page
2. Examine for notification elements:
   - A table/list showing notification rules (columns: rule name, test, recipient, trigger, status)
   - A form for creating or editing notification rules
   - Settings for notification method (email, SMS, in-app)
   - Add/Edit/Delete/Enable/Disable buttons for rule management
3. Observe layout and controls

**Expected:**
- At least one of: notification rules list or configuration form is visible
- Rules are readable and properly formatted (if any exist)
- Configuration fields are present and labeled
- Add/Edit/Delete controls are available

**Fail Criteria:**
- No rules list or configuration form visible
- Blank content area
- Rules data unreadable or hidden
- Controls not functional or missing

**Note:** If no notification rules are configured, mark as **SKIP** with reason "No notification rules configured".

---

### TC-SIM-01 — Search Index Management page loads

**Navigation:** Admin → Search Index Management (candidate URLs: `/SearchIndexManagement`, `/SearchIndexConfig`, `/admin/search-index`)

**Preconditions:**
- Logged in as admin
- On `/MasterListsPage` (Admin home)

**Steps:**
1. From Admin page (/MasterListsPage), locate and click **Search Index Management** in the left sidebar
2. Wait for page to load (timeout 5s)
3. Verify page response status

**Expected:**
- Page loads with status 200
- Not redirected to Login
- Page heading contains "Search Index Management" or "Search Index"
- Page is fully rendered

**Fail Criteria:**
- Login redirect
- 404 or 500 error
- Blank page
- Page title missing or unrelated

---

### TC-SIM-02 — Reindex button or status indicator visible

**Navigation:** Search Index Management page (from TC-SIM-01)

**Preconditions:**
- TC-SIM-01 passed
- Search Index Management page is loaded

**Steps:**
1. On Search Index Management page
2. Examine for index management elements:
   - A **Reindex** or **Rebuild Index** button
   - Index status indicator (e.g., "Last indexed: 2024-03-15", "Status: OK")
   - Index statistics (number of indexed records, index size, last update time)
   - Optional: index health or integrity check button
3. Observe layout and controls

**Expected:**
- Reindex button or action is visible and clickable
- Index status is displayed (if applicable)
- Controls are properly labeled and accessible
- No visual errors in the interface

**Fail Criteria:**
- No Reindex button or status indicator visible
- Blank content area
- Status information hidden or unreadable
- Controls not functional or missing

---

## Suite AW — Logging, Legacy Admin, Plugins (5 TCs)

> Tests the Logging Configuration, Legacy Admin, and List Plugins admin screens.
> These pages configure system logging, access legacy admin interface, and view installed plugins.

### TC-LOG-01 — Logging Configuration page loads

**Navigation:** Admin → Logging Configuration (candidate URLs: `/LoggingConfiguration`, `/LogConfig`, `/admin/logging`)

**Preconditions:**
- Logged in as admin
- On `/MasterListsPage` (Admin home)

**Steps:**
1. From Admin page (/MasterListsPage), locate and click **Logging Configuration** in the left sidebar
2. Wait for page to load (timeout 5s)
3. Verify page response status

**Expected:**
- Page loads with status 200
- Not redirected to Login
- Page heading contains "Logging Configuration" or "Logging"
- Page is fully rendered

**Fail Criteria:**
- Login redirect
- 404 or 500 error
- Blank page
- Page title missing or unrelated

---

### TC-LOG-02 — Log level settings visible (DEBUG/INFO/WARN/ERROR)

**Navigation:** Logging Configuration page (from TC-LOG-01)

**Preconditions:**
- TC-LOG-01 passed
- Logging Configuration page is loaded

**Steps:**
1. On Logging Configuration page
2. Examine for logging configuration elements:
   - Log level selector (dropdown or radio buttons) with options: DEBUG, INFO, WARN, ERROR
   - Optional: per-module or per-package log level settings
   - Optional: log output destination settings (file, console, database)
   - Save/Apply button to persist changes
3. Observe form and controls

**Expected:**
- Log level selector is visible and interactive
- At least the following options are available: DEBUG, INFO, WARN, ERROR
- Current log level is displayed
- Save/Apply button is present

**Fail Criteria:**
- Log level selector not visible or hidden
- No log level options displayed
- Selector not functional (cannot change levels)
- No Save/Apply button visible

---

### TC-LEG-01 — Legacy Admin page loads

**Navigation:** Admin → Legacy Admin (candidate URLs: `/LegacyAdmin`, `/AdminLegacy`, `/admin/legacy`)

**Preconditions:**
- Logged in as admin
- On `/MasterListsPage` (Admin home)

**Steps:**
1. From Admin page (/MasterListsPage), locate and click **Legacy Admin** in the left sidebar
2. Wait for page to load (timeout 5s)
3. Verify page response status and note any redirects or alternative behavior

**Expected:**
- Page loads with status 200, OR
- Page redirects to legacy admin interface (document the redirect URL)
- Not redirected to Login
- Page heading or content relates to legacy admin functionality
- Page is fully rendered

**Fail Criteria:**
- Login redirect
- 404 or 500 error
- Blank page
- Page title missing (unless redirect occurs)

**Note:** Legacy Admin may redirect to a separate interface (e.g., `/openelis-legacy-admin`, legacy domain, or embedded frame). Document any redirect behavior.

---

### TC-LEG-02 — Legacy admin interface or redirect documented

**Navigation:** Legacy Admin page (from TC-LEG-01)

**Preconditions:**
- TC-LEG-01 passed or documented

**Steps:**
1. From Legacy Admin page or resulting page (after any redirect)
2. Document the following:
   - Final URL after navigation (if redirected)
   - Page title or heading
   - Brief description of legacy admin interface (e.g., "HTML form-based", "JSP pages", "embedded frame")
   - Any functional capabilities observed (e.g., "allows editing of legacy configurations")
3. Note any differences from the main Carbon-based admin interface

**Expected:**
- Legacy admin interface is accessible (either on same page or via redirect)
- Interface is functional and responsive
- Page is fully rendered
- Functionality is documented for reference

**Fail Criteria:**
- Legacy admin interface not accessible or not found
- Broken redirect (404 or 500 after following redirect)
- Blank or non-functional page
- No way to interact with legacy admin

**Note:** If legacy admin is not used in this installation, mark as **SKIP** with reason "Legacy admin not configured or not applicable".

---

### TC-PLG-01 — List Plugins page loads

**Navigation:** Admin → List Plugins (candidate URLs: `/ListPlugins`, `/PluginList`, `/admin/plugins`)

**Preconditions:**
- Logged in as admin
- On `/MasterListsPage` (Admin home)

**Steps:**
1. From Admin page (/MasterListsPage), locate and click **List Plugins** in the left sidebar
2. Wait for page to load (timeout 5s)
3. Verify page response status

**Expected:**
- Page loads with status 200
- Not redirected to Login
- Page heading contains "List Plugins" or "Plugins" or "Plugin Management"
- Page is fully rendered

**Fail Criteria:**
- Login redirect
- 404 or 500 error
- Blank page
- Page title missing or unrelated

---

## Suite AX — Localization, Notify User, Batch Reassignment (5 TCs)

> Tests the Localization, Notify User, and Batch test reassignment admin screens.
> These pages configure system localization, send notifications to users, and manage batch test assignments.

### TC-LOC-01 — Localization page loads

**Navigation:** Admin → Localization (expand chevron, candidate URLs: `/Localization`, `/LocalizationConfig`, `/admin/localization`)

**Preconditions:**
- Logged in as admin
- On `/MasterListsPage` (Admin home)
- Admin menu may have an expandable section for "Localization"

**Steps:**
1. From Admin page (/MasterListsPage), locate **Localization** item
2. If item has a chevron/arrow, click to expand
3. Click **Localization**
4. Wait for page to load (timeout 5s)
5. Verify page response status

**Expected:**
- Page loads with status 200
- Not redirected to Login
- Page heading contains "Localization" or "Locale"
- Page is fully rendered

**Fail Criteria:**
- Login redirect
- 404 or 500 error
- Blank page
- Page title missing or unrelated
- Chevron does not expand (if expandable)

---

### TC-LOC-02 — Localization entries list with language columns visible

**Navigation:** Localization page (from TC-LOC-01)

**Preconditions:**
- TC-LOC-01 passed
- Localization page is loaded

**Steps:**
1. On Localization page
2. Examine for localization elements:
   - A table/list showing localization entries (columns: key, English, Spanish, French, etc.)
   - Language columns for different supported locales
   - Edit fields for each language translation
   - Add/Edit/Delete buttons for managing localization entries
   - Optional: search/filter for finding specific keys
3. Observe layout and content

**Expected:**
- Localization entries list or table is visible
- Multiple language columns are displayed (at least 2 languages)
- Entries are readable and properly formatted
- Edit fields are present and interactive
- At least one localization entry is displayed

**Fail Criteria:**
- No localization list or table visible
- Language columns missing or unreadable
- Edit fields not functional
- Blank content area

**Note:** If no localization entries are configured, mark as **SKIP** with reason "No localization entries configured".

---

### TC-NTU-01 — Notify User page loads

**Navigation:** Admin → Notify User (candidate URLs: `/NotifyUser`, `/UserNotification`, `/admin/notify-user`)

**Preconditions:**
- Logged in as admin
- On `/MasterListsPage` (Admin home)

**Steps:**
1. From Admin page (/MasterListsPage), locate and click **Notify User** in the left sidebar
2. Wait for page to load (timeout 5s)
3. Verify page response status

**Expected:**
- Page loads with status 200
- Not redirected to Login
- Page heading contains "Notify User" or "User Notification"
- Page is fully rendered

**Fail Criteria:**
- Login redirect
- 404 or 500 error
- Blank page
- Page title missing or unrelated

---

### TC-NTU-02 — User notification form or list visible

**Navigation:** Notify User page (from TC-NTU-01)

**Preconditions:**
- TC-NTU-01 passed
- Notify User page is loaded

**Steps:**
1. On Notify User page
2. Examine for notification elements:
   - A form for composing and sending user notifications (fields: recipient user/group, subject, message, priority)
   - A list of previously sent notifications (optional, columns: recipient, subject, sent date, status)
   - User/group selector (dropdown, multi-select, or search)
   - Send button or action
   - Optional: notification templates or scheduled notifications
3. Observe form and controls

**Expected:**
- Notification form or interface is visible
- User/group selector is present and interactive
- Subject and message fields are present and editable
- Send button is visible and clickable
- Form is properly labeled and accessible

**Fail Criteria:**
- No notification form or interface visible
- Blank content area
- User selector not functional
- Send button missing or not clickable

---

### TC-BTR-01 — Batch test reassignment page loads

**Navigation:** Admin → Batch test reassignment and c... (candidate URLs: `/BatchTestReassignment`, `/BatchReassign`, `/admin/batch-reassign`)

**Preconditions:**
- Logged in as admin
- On `/MasterListsPage` (Admin home)
- Note: Menu item may be truncated as "Batch test reassignment and c..." (full name unknown)

**Steps:**
1. From Admin page (/MasterListsPage), locate and click **Batch test reassignment and c...** (or similar truncated name) in the left sidebar
2. Wait for page to load (timeout 5s)
3. Verify page response status and full page title

**Expected:**
- Page loads with status 200
- Not redirected to Login
- Page heading contains "Batch" or "Reassignment" or similar
- Page is fully rendered
- Document the full page title and purpose

**Fail Criteria:**
- Login redirect
- 404 or 500 error
- Blank page
- Page title missing or unrelated

**Note:** Menu item name may be truncated. If unable to locate, search for items starting with "Batch" or containing "reassign" in the sidebar.

---

## Test Execution Notes

- **Login:** Use admin / adminADMIN! for all test cases
- **Base URL:** https://www.jdhealthsolutions-openelis.com
- **Admin Entry:** All tests start from `/MasterListsPage`
- **Timeout:** Use 5s timeout for page loads
- **Sidebar Navigation:** All admin items are located in the left sidebar of `/MasterListsPage`
- **Expandable Sections:** Some admin items may have chevrons/arrows to expand sub-menus (e.g., "General Configurations", "Menu Configuration", "Localization")
- **Test Prefix:** Tag all manual test runs with `QA_AUTO_0324` or current `MMDD` for tracking
- **Skip Criteria:** Mark tests as SKIP if prerequisites (data, configuration) do not exist in the system
- **Fail Documentation:** For failed tests, capture:
  - Screenshot of error page
  - Browser console errors
  - Network response codes
  - Final URL after navigation

---

**Total Test Cases:** 34 (8 suites: AQ, AR, AS, AT, AU, AV, AW, AX)
**Estimated Execution Time:** ~15-20 minutes per suite (manual), ~2-3 minutes per suite (automated)
**Coverage:** 15+ previously untested admin configuration screens
