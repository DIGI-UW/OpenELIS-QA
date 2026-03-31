# OpenELIS QA Test Suite - Page Object Models

This directory contains reusable Page Object Model (POM) classes for the OpenELIS QA test suite. Each class encapsulates interactions with specific application pages, exposing user-facing actions rather than low-level DOM manipulation.

## File Structure

### BasePage.ts
Abstract base class providing common utilities for all POM classes:
- Navigation via sidebar menu
- Page load waits
- Session modal dismissal
- Toast message handling
- Direct path navigation

**Key Methods:**
- `navigateViaSidebar(menuText, submenuText?)` - Navigate via sidebar
- `waitForPageLoad()` - Wait for page to fully load
- `dismissSessionModal()` - Handle "Still There?" modal
- `getToastMessage()` / `waitForToastMessage()` - Extract notifications
- `navigateToPath(path)` - Direct URL navigation

### DashboardPage.ts
Handles the OpenELIS Dashboard KPI interactions:
- Read KPI card values (In Progress, Ready For Validation, etc.)
- Click KPI cards to navigate
- Verify dashboard structure
- Refresh dashboard

**Key Methods:**
- `navigateToDashboard()` - Go to dashboard
- `getKPICardValue(cardLabel)` - Get numeric value from card
- `getAllKPICardValues()` - Get all KPI values as object
- `clickKPICard(cardLabel)` - Navigate from card click
- `verifyDashboardStructure()` - Validate page structure

### OrderEntryPage.ts
Complete order entry workflow (4 steps):
- Step 1: Patient search by name/ID/lab number
- Step 2: Program selection
- Step 3: Sample type, test selection, referral setup
- Step 4: Order submission and accession number retrieval

**Key Methods:**
- `searchPatientByName/Id/LabNumber(value)` - Patient search
- `selectPatientFromResults(name)` - Select from results
- `selectProgram(name)` / `selectSampleType(type)` - Program/sample
- `addTest(name)` / `addMultipleTests(names[])` - Add tests
- `enableReferral()` / `fillReferralDetails(lab, reason)` - Referral
- `submitOrder()` - Submit and get accession number

### ResultsPage.ts
Results entry and management across multiple views:
- Results by Unit/Order/Patient/Range/Status
- Search and filter by various criteria
- Expand results and enter values
- Save results

**Key Methods:**
- `navigateToResultsByUnit/Order/Patient/Range/Status()` - Navigate views
- `searchByAccessionNumber/PatientName/TestName/Unit/DateRange()` - Search
- `expandResultRow(accession)` - Open result details
- `enterResultValue(testName, value)` - Enter single result
- `enterMultipleResults(results)` - Enter multiple
- `saveResults()` - Save entries

### ValidationPage.ts
Result validation workflow:
- Search for results to validate
- Accept/reject results with optional comments
- Save validation decisions

**Key Methods:**
- `navigateToValidation()` - Go to validation page
- `searchByAccessionNumber/PatientName/TestName/Unit()` - Search
- `expandResultForValidation(accession)` - Open for validation
- `acceptResult()` / `acceptResultByAccession(accession)` - Accept
- `rejectResult(reason?)` / `rejectResultByAccession(accession, reason)` - Reject
- `addValidationComment(text)` - Add notes
- `saveValidation()` - Save decisions
- `bulkAcceptResults(accessions[])` - Accept multiple

### AdminPage.ts
Administration interface for master data:
- Dictionary, Organization, Provider, Laboratory, Test Catalog
- Search, pagination, CRUD operations

**Key Methods:**
- `navigateToDictionary/Organization/Provider/Laboratory/TestCatalog()` - Navigate
- `navigateToAdminPage(path)` - Direct admin path
- `search(term)` / `applySearch()` - Search
- `clickItem(name)` - Open item
- `fillField(label, value)` - Fill form field
- `selectDropdownOption(label, optionText)` - Select dropdown
- `setCheckbox(label, checked)` - Toggle checkbox
- `saveForm()` / `cancelForm()` - Form actions
- `deleteItem(name)` - Delete with confirmation
- `goToNextPage()` / `goToPreviousPage()` - Pagination

### PatientPage.ts
Patient management operations:
- Patient History, Add/Edit Patient, Merge Patient
- Search by name/ID/DOB
- Patient info entry and updates

**Key Methods:**
- `navigateToPatientHistory/AddPatient/EditPatient/MergePatient()` - Navigate
- `searchByName/Id/DateOfBirth(value)` - Search
- `selectPatientFromResults(name)` - Select
- `fillPatientInfo(data)` - Fill patient form
- `viewPatientOrders()` / `viewPatientResults()` - View related data
- `selectPrimaryPatient(name)` / `selectDuplicatePatient(name)` - Merge setup
- `confirmMerge()` - Complete merge

### ReferralPage.ts
Referred out tests management:
- Navigate to Referred Out Tests
- Search by patient/test/unit/date range/lab number
- Enter referral results when available
- Print reports

**Key Methods:**
- `navigateToReferredOutTests()` - Go to referrals
- `searchByPatientName/AccessionNumber/TestName/Unit/LabNumber()` - Search
- `searchByDateRange(start, end)` - Date range search
- `expandReferralRow(accession)` - Open details
- `areResultsAvailable(accession)` - Check if can enter
- `enterReferralResult(testName, value)` - Enter result
- `enterMultipleResults(results)` - Enter multiple
- `saveResults()` - Save entries
- `printReferralReport(accession)` - Print
- `isReferralComplete(accession)` - Check status

### PathologyPage.ts
Pathology case management:
- Pathology Dashboard, Immunohistochemistry, Cytology, Histopathology
- Case listing and searching
- Status filtering

**Key Methods:**
- `navigateToPathologyDashboard/Immunohistochemistry/Cytology/Histopathology()` - Navigate
- `searchByCaseNumber/PatientName/SpecimenType/Pathologist()` - Search
- `searchByDateRange(start, end)` - Date search
- `clickCase/viewCaseDetails(caseNumber)` - Open case
- `getCaseStatus(caseNumber)` - Get status
- `getAssignedPathologist(caseNumber)` - Get assignee
- `filterByStatus(status)` - Filter by status
- `isCaseEditable(caseNumber)` - Check edit permission

### ReportsPage.ts
Report generation and management:
- Multiple report types (Patient Status, Results, Test Catalog, etc.)
- Form filling with various filters
- Report generation and export

**Key Methods:**
- `navigateToPatientStatusReport/ResultsReport/TestCatalogReport()` - Navigate
- `fillPatientStatusReportForm(patient, status, dateRange)` - Fill form
- `fillResultsReportForm(filters)` - Fill results form
- `generateReport()` - Run report
- `generatePrintableVersion()` - Print version
- `exportToPDF()` / `exportToExcel()` - Export formats
- `verifyReportColumns(columns[])` - Validate structure
- `getReportSummary()` / `getReportHeader()` - Get report metadata
- `getReportRows()` - Get all data rows

## Usage Patterns

### Basic Navigation and Action
```typescript
import DashboardPage from './pages/DashboardPage';

const dashboardPage = new DashboardPage(page);
await dashboardPage.navigateToDashboard();
const inProgressCount = await dashboardPage.getKPICardValue('In Progress');
```

### Complete Order Entry Workflow
```typescript
import OrderEntryPage from './pages/OrderEntryPage';

const orderPage = new OrderEntryPage(page);
await orderPage.navigateToOrderEntry();
await orderPage.searchPatientByName('John Doe');
await orderPage.selectPatientFromResults('John Doe');
await orderPage.selectProgram('Microbiology');
await orderPage.selectSampleType('Blood');
await orderPage.addMultipleTests(['Hemoglobin', 'Hematocrit']);
const accession = await orderPage.submitOrder();
```

### Results Entry
```typescript
import ResultsPage from './pages/ResultsPage';

const resultsPage = new ResultsPage(page);
await resultsPage.navigateToResultsByUnit();
await resultsPage.searchByAccessionNumber('LAB-2024-001');
await resultsPage.applySearch();
await resultsPage.expandResultRow('LAB-2024-001');
await resultsPage.enterResultValue('Hemoglobin', '14.5');
await resultsPage.saveResults();
```

## Design Principles

1. **Role-Based Selectors**: All selectors use Playwright's getByRole/getByText/getByLabel for accessibility and resilience
2. **User-Facing Actions**: Methods represent what users do, not DOM interactions
3. **Async/Await**: All methods are async with proper waits
4. **JSDoc Comments**: Every method has clear documentation
5. **Error Handling**: Visible checks prevent errors before action
6. **Composition**: Pages extend BasePage for shared utilities

## Base URL

All navigations use: `https://www.jdhealthsolutions-openelis.com`

## Testing Notes

- Session modals are automatically dismissed by BasePage
- Toast messages are captured for validation
- Network idle waits ensure page stability
- Timeout handling for expected async operations
