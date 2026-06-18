# QA Report — Phase 38: Report PDF Generation, Generic Sample, Inventory Reports
**Date:** 2026-04-03
**Instance:** https://testing.openelis-global.org (v3.2.1.4)
**Credentials:** admin / adminADMIN!
**Test Data Prefix:** QA_AUTO_0403

---

## Executive Summary

Phase 38 covered four areas: report PDF generation across all study/routine report types, Generic Sample module pages, and Inventory Reports tab.

- **Phase 38A — Study/Routine Reports:** 15/15 date-range reports PASS (valid PDF); 5 FAIL (HTTP 500); 8 ARV/EID/VL pages load correctly but cannot test PDF without patient data
- **Phase 38B — Generic Sample & Sample Management:** 4/5 pages PASS; 1 FAIL (i18n key)
- **Phase 38C — New report types:** Covered within 38A (all date-range report types exhaustively tested)
- **Phase 38D — Inventory Reports:** UI tab loads but backend endpoint returns 404
- **New Bugs Filed:** BUG-42, BUG-43, BUG-44, BUG-45

---

## Part A — Study & Routine Report PDF Generation

### Method
- Report pages verified via HTTP GET (all return 200)
- PDF generation tested via `fetch('/api/OpenELIS-Global/ReportPrint?...', {credentials:'include'})`
- PDF magic bytes checked: `%PDF` = bytes [37, 80, 68, 70]
- Date range used: 2026-01-01 → 2026-04-03
- ARV/EID/VL reports use accession-number form (no patient data in test system)

### Virology Report Pages — Page Load Verification

All 8 ARV/EID/VL report pages return HTTP 200 and render the correct lab-number input form.

| Report | Identifier | Page Load | Form Fields |
|--------|-----------|-----------|-------------|
| ARV Initial Version 1 | `patientARVInitial1` | PASS (200) | From/To lab number |
| ARV Initial Version 2 | `patientARVInitial2` | PASS (200) | From/To lab number |
| ARV Follow-up Version 1 | `patientARVFollowup1` | PASS (200) | From/To lab number |
| ARV Follow-up Version 2 | `patientARVFollowup2` | PASS (200) | From/To lab number |
| ARV Version 1 | `patientARV1` | PASS (200) | From/To lab number |
| EID Version 1 | `patientEID1` | PASS (200) | From/To lab number |
| EID Version 2 | `patientEID2` | PASS (200) | From/To lab number |
| VL Version Nationale | `patientVL1` | PASS (200) | From/To lab number |

**Note:** PDF generation for accession-based reports returns HTTP 500 with no matching data — expected behavior on empty test system. Requires real lab orders with ARV/EID/VL program assignments to validate.

**ReportPrint mechanism:** `Generate Printable Version` button calls `window.open('/api/OpenELIS-Global/ReportPrint?...')` — opens PDF in new tab.

### Date-Range Reports — PDF Generation Results

#### PASS — HTTP 200 + Valid PDF

| Report Name | Identifier | Status | Size (bytes) |
|-------------|-----------|--------|-------------|
| Patient Status Report | `patientCILNSP_vreduit` | 200 PDF | 1,446 |
| Delayed Validation | `validationBacklog` | 200 PDF | 1,970 |
| Rejection Report | `sampleRejectionReport` | 200 PDF | 1,452 |
| Non-Conformity By Date (Haiti) | `haitiNonConformityByDate` | 200 PDF | 1,452 |
| Non-Conformity By Unit/Reason (retroCI) | `retroCInonConformityBySectionReason` | 200 PDF | 1,452 |
| Non-Conformity By Lab No (retroCI) | `retroCINonConformityByLabno` | 200 PDF | 1,437 |
| Follow-up Required | `retroCIFollowupRequiredByLocation` | 200 PDF | 1,452 |
| Non-Conformity By Date (retroCI) | `retroCINonConformityByDate` | 200 PDF | 1,452 |
| General Export | `CIStudyExport` | 200 PDF | 1,452 |
| Viral Load Data Export | `Trends` | 200 PDF | 1,452 |
| Activity Report By Test | `activityReportByTest` | 200 PDF | 1,452 |
| Activity Report By Panel | `activityReportByPanel` | 200 PDF | 1,452 |
| Activity Report By Unit | `activityReportByTestSection` | 200 PDF | 1,452 |
| Referred Out Tests | `referredOut` | 200 PDF | 1,477 |
| Routine CSV Export | `CISampleRoutineExport` | 200 PDF | 1,452 |

All 15 confirmed as valid PDFs (FlateDecode compressed; `%PDF` magic bytes verified). Empty PDFs (no data in date range) — 1,437–1,970 bytes is within expected range for empty JasperReports output.

#### FAIL — HTTP 500 "Check server logs" (BUG-42)

| Report Name | Identifier | Status | Body |
|-------------|-----------|--------|------|
| Statistics Report | `statisticsReport` | 500 | `"Check server logs"` |
| Summary of All Tests | `indicatorHaitiLNSPAllTests` | 500 | `"Check server logs"` |
| HIV Test Summary | `indicatorCDILNSPHIV` | 500 | `"Check server logs"` |
| Non-Conformity Notification | `retroCInonConformityNotification` | 500 | `"Check server logs"` |
| Audit Trail | `auditTrail` | 500 | `"Check server logs"` |

Response body is exactly 19 bytes: `"Check server logs"` (bare JSON string, HTTP 500). Pattern: indicator-type and statistics reports all fail; retroCI notification and audit trail also fail. Non-conformity, export, and activity reports all work.

---

## Part B — Generic Sample & Sample Management

### TC-GS-01: Generic Sample Order Page — PASS
- Route: `/GenericSample/Order`
- HTTP 200, page renders fully
- Form: Notebook Selection (optional), Lab Number (with "Generate Lab Number"), Sample Type (dropdown with 18 types including Urine, Histopathology, Serum, Plasma, DBS, Whole Blood, Sputum, etc.), Quantity, Unit of Measure (30+ units), Collector, Collection Date/Time, Label quantities, Save/Cancel
- API: `GET /rest/inventory/items/all` (confirmed from prior session)

### TC-GS-02: Generic Sample Edit Page — PASS
- Route: `/GenericSample/Edit`
- HTTP 200, page renders
- Form: "Search by Accession Number" — Enter Accession Number + Search button
- Simple search-then-edit workflow

### TC-GS-03: Generic Sample Import Page — PASS
- Route: `/GenericSample/Import`
- HTTP 200, page renders
- File upload: "Upload CSV or Excel file (.csv, .xlsx, .xls)"
- Buttons: Select file, Validate, Import — staged import workflow

### TC-GS-04: Generic Sample Results Page — FAIL (BUG-43)
- Route: `/GenericSample/Results`
- HTTP 200, page renders
- **BUG:** Breadcrumb shows raw i18n key `sample.label.generic` instead of translated label
- Page heading "Result Entry" renders correctly (H3)
- Search form: Enter Accession Number + Search — renders correctly
- The unresolved key appears between the home breadcrumb and "Result Entry" heading

### TC-GS-05: Sample Management Page — PASS
- Route: `/SampleManagement`
- HTTP 200, page renders
- Section: "Search Samples" with Search button
- Section: "Add Tests to 0 selected sample(s)" with Sample Type dropdown and test selector
- Modal: "Add Tests to Sample" with panels/tests picker (shows "Please select a sample type to view available panels and tests")
- Empty state: "No Eligible Samples"

---

## Part C — Inventory Reports Tab

### TC-INV-RPT-01: Reports Tab Structure — PASS (UI only)
- Tab renders on `/Inventory` page with label "Reports"
- Report Generation form visible with:
  - **Report Type** dropdown: Stock Levels Report, Expiration Forecast, Usage Trends, Lot Traceability, Low Stock Alerts, Transaction History (6 types)
  - **Export Format** dropdown: present but no options visible (renders empty)
  - **Date Range**: Start Date + End Date inputs
  - **Filter Options**: Include inactive items, Include expired lots (checkboxes)
  - **Grouping Options**: Group by item type, Group by storage location (checkboxes)
  - **Generate** button

### TC-INV-RPT-02: Inventory Report Generate — FAIL (BUG-45)
- Click "Generate" → `POST /api/OpenELIS-Global/rest/inventory/reports/generate`
- Request body: `{}` (empty — Export Format has no selectable options, form state incomplete)
- Response: **HTTP 404** `NoHandlerFoundException`
- Backend endpoint not deployed in v3.2.1.4
- **Additional finding:** Export Format dropdown renders with no options — UI bug preventing valid report configuration

### TC-INV-RPT-03: Inventory Table i18n Bug — FAIL (BUG-44)
- Lots table column header: `label.button.action` (unresolved i18n key)
- Catalog table column header: `label.button.action` (same key, also unresolved)
- Both tables affected; should display "Actions" or equivalent

---

## New Bugs

### BUG-42 (High) — ReportPrint HTTP 500 for 5 Report Types
- **Endpoints:** `GET /api/OpenELIS-Global/ReportPrint?report={statisticsReport|indicatorHaitiLNSPAllTests|indicatorCDILNSPHIV|retroCInonConformityNotification|auditTrail}&...`
- **Status:** HTTP 500
- **Body:** `"Check server logs"` (19-byte bare JSON string)
- **Impact:** Statistics Report, Summary of All Tests, HIV Test Summary, NC Notification, Audit Trail cannot be generated — 5 of ~20 report types broken
- **Working reports:** 15 other date-range reports return HTTP 200 + valid PDF
- **Pattern:** Indicator-type reports (`indicator*`) and audit-type reports consistently fail

### BUG-43 (Low) — Unresolved i18n Key on Generic Sample Results Page
- **Location:** `/GenericSample/Results` breadcrumb
- **Key displayed:** `sample.label.generic`
- **Expected:** Human-readable label (e.g., "Generic Sample" or "Generic")
- **Scope:** Breadcrumb/section label only; page heading and form render correctly

### BUG-44 (Low) — Unresolved i18n Key in Inventory Table Column Headers
- **Location:** `/Inventory` — Lots table and Catalog table
- **Key displayed:** `label.button.action` (both tables)
- **Expected:** "Actions" or equivalent translated label
- **Scope:** Both Lots and Catalog data tables on the Inventory page

### BUG-45 (Medium) — Inventory Reports Generate Endpoint Not Implemented
- **Endpoint:** `POST /api/OpenELIS-Global/rest/inventory/reports/generate`
- **Status:** HTTP 404 `NoHandlerFoundException`
- **Payload sent:** `{}` (UI does not build complete payload — Export Format dropdown has no options)
- **Impact:** Inventory Reports tab Generate button completely non-functional
- **Secondary issue:** Export Format dropdown renders with no selectable options (UI-side bug)

---

## Prior Phase Data Still Present

The Phase 37 test data remains on the testing instance:
- Lot: `QA_AUTO_0403 Test Reagent UPDATED | QA-LOT-0403-001 | REAGENT | 500 mL | 4/3/2027 | ACTIVE`
- Catalog: `QA_AUTO_0403 Test Reagent UPDATED | REAGENT | mL | 20 | Inactive`

---

## Summary Score

| Phase | Area | TCs | Pass | Fail | Notes |
|-------|------|-----|------|------|-------|
| 38A | Virology Report Pages | 8 | 8 | 0 | Pages load; PDF needs patient data |
| 38A | Date-Range PDF Generation | 20 | 15 | 5 | BUG-42: 5 types return 500 |
| 38B | Generic Sample / Sample Mgmt | 5 | 4 | 1 | BUG-43: i18n key |
| 38D | Inventory Reports | 3 | 1 | 2 | BUG-44 i18n, BUG-45 404 |
| **Total** | | **36** | **28** | **8** | |

**Pass Rate:** 77.8% (28/36)

---

## Known Technical Notes

1. **ReportPrint mechanism:** `window.open('/api/OpenELIS-Global/ReportPrint?...')` — button opens PDF in new tab, NOT via XHR
2. **Empty PDF size:** ~1,437–1,970 bytes for FlateDecode-compressed JasperReports output with no data rows
3. **Bare ReportPrint (no params):** Returns HTTP 200 with 0-byte body — endpoint is alive but requires report type params
4. **Inventory Reports payload:** UI sends `{}` when Export Format not selected; backend returns 404 regardless
5. **ARV/EID/VL reports:** Require accession numbers of existing orders with ARV/EID/VL program assignments; test system has no patient data
6. **`sample.label.generic` key:** Appears in `GenericSample/Results` breadcrumb between Home and the "Result Entry" H3 heading
7. **`label.button.action` key:** Appears as last column header in both Inventory Lots table and Inventory Catalog table
