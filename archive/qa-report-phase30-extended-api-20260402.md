# Phase 30 — Extended API Discovery & Playwright Spec Build Report

**Server:** testing.openelis-global.org (v3.2.1.4)
**Date:** 2026-04-02
**Tester:** QA Automation (Claude)
**Phase Focus:** Extended API endpoint discovery, Playwright spec creation, order creation attempt

---

## Executive Summary

| Metric | Value |
|--------|-------|
| New API Endpoints Discovered | 14 |
| Total Known Working GET Endpoints | 29 |
| Playwright Specs Created | 2 (api-crud-survey + order-creation) |
| Playwright TCs Written | 34 |
| Page Objects Enhanced | 1 (OrderEntryPage) |
| Order via UI Attempted | BLOCKED (Chrome extension instability) |

---

## Part A — Extended API Endpoint Discovery

### Round 1: New Working Endpoints (6 found)

| Endpoint | Status | Size | Description |
|----------|--------|------|-------------|
| `/rest/reports` | 200 | 90b | Reports API namespace — returns `{namespace, message, status}` |
| `/rest/ElectronicOrders` | 200 | 8918b | Electronic orders form — referral facilities, test selection, status |
| `/rest/SampleEdit` | 200 | 1129b | Sample edit form — accession lookup, patient info, sample conditions |
| `/rest/alerts` | 200 | 2b | Alerts list — empty `[]` |
| `/rest/notifications` | 200 | 2b | Notifications list — empty `[]` |
| `/rest/menu` | 200 | 43435b | Full menu hierarchy — 24 top-level items with child elements |

### Round 2: Additional Working Endpoints (8 found)

| Endpoint | Status | Size | Description |
|----------|--------|------|-------------|
| `/rest/WorkPlanByTest` | 200 | 321b | Workplan by test — form with testTypes, workplanTests |
| `/rest/WorkPlanByPanel` | 200 | 321b | Workplan by panel — form with panelTypes |
| `/rest/ReferredOutTests` | 200 | 9926b | Referred out tests — testUnitSelectionList, testSelectionList |
| `/rest/SampleBatchEntrySetup` | 200 | 19724b | Batch entry setup — large form with all sample/test metadata |
| `/rest/SampleEntryConfig` | 200 | 341b | Sample entry configuration — siteInfoDomain form |
| `/rest/ResultConfiguration` | 200 | 349b | Result configuration — siteInfoDomain form |
| `/rest/PatientConfiguration` | 200 | 354b | Patient configuration — siteInfoDomain form |
| `/rest/TestSectionCreate` | 200 | 1598b | Test section creation — existingTestUnitList, inactiveTestUnitList |

### Non-Working Endpoints (confirmed 404/405)

| Endpoint | Status | Notes |
|----------|--------|-------|
| `/rest/report/reportTypes` | 404 | Not found |
| `/rest/electronicorders` | 404 | Case-sensitive — use `ElectronicOrders` |
| `/rest/SampleBatchEntry` | 405 | Method not allowed (GET) |
| `/rest/fhir/metadata` | 500 | Server error |
| `/rest/PathologyDashboard` | 404 | Not a REST endpoint |
| `/rest/Validation` | 404 | Not a REST endpoint |
| `/rest/WorkplanByTestSection` | 404 | Typo? Use `WorkPlanByTest` |
| `/rest/Aliquot` | 405 | Method not allowed (GET) |

---

## Part B — Complete API Endpoint Map (v3.2.1.4)

### Working GET Endpoints (29 total)

```
# Core Data
/rest/test-list                    — 170 tests
/rest/test-calculations            — calculated value rules
/rest/reflexrules                  — reflex rules
/rest/home-dashboard/metrics       — KPI dashboard

# Order Entry
/rest/SamplePatientEntry           — order creation form (24 sample types, 12 programs)
/rest/SampleEdit                   — sample edit form
/rest/SampleBatchEntrySetup        — batch entry setup (19KB)
/rest/ElectronicOrders             — electronic orders form

# Patient
/rest/patient-search               — patient search

# Results & Validation
/rest/LogbookResults?type={section} — results by test section (13 sections)

# Workplan
/rest/WorkPlanByTest               — workplan by test type
/rest/WorkPlanByPanel              — workplan by panel

# Referrals
/rest/ReferredOutTests             — referred out tests list

# Admin — User Management
/rest/UnifiedSystemUser            — user create form (FIXED v3.2.1.4)
/rest/UnifiedSystemUserMenu        — user list

# Admin — Test Management
/rest/TestAdd                      — test creation form (FIXED v3.2.1.4)
/rest/TestModifyEntry              — test modify form (FIXED v3.2.1.4)
/rest/PanelCreate                  — panel creation form
/rest/TestSectionCreate            — test section creation form

# Admin — Config
/rest/ProviderMenu                 — provider management
/rest/BarcodeConfiguration         — barcode settings
/rest/SiteInformation              — site configuration
/rest/SampleEntryConfig            — sample entry config
/rest/ResultConfiguration          — result config
/rest/PatientConfiguration         — patient config

# System
/rest/reports                      — reports namespace
/rest/alerts                       — alerts list
/rest/notifications                — notifications list
/rest/menu                         — full menu hierarchy (43KB)
```

### Broken GET Endpoints (2)

```
/rest/Dictionary                   — HTTP 500 (BUG-33)
/rest/Organization                 — HTTP 500 (BUG-34)
```

### Working POST Endpoints (2)

```
/rest/test-calculation             — create/update calculated values
/rest/reflexrule                   — create/update reflex rules
```

### POST Endpoints Returning Errors (3)

```
/rest/UnifiedSystemUser            — 400 (payload format mismatch)
/rest/SamplePatientEntry           — 500 (needs full wizard payload)
/rest/TestAdd                      — untested (needs 6-step wizard payload)
```

---

## Part C — Playwright Specs Created

### 1. `tests/api-crud-survey.spec.ts` (22 TCs)
- TC-API-01 through TC-API-18: GET endpoint survey
- TC-WRITE-01, TC-WRITE-02: POST endpoint tests
- TC-BUG31-WK-01, TC-BUG31-WK-02: Logbook results survey

### 2. `tests/order-creation.spec.ts` (12 TCs)
- TC-ORDER-01 through TC-ORDER-08: Order wizard steps, form metadata, sample types
- TC-RESULT-01 through TC-RESULT-04: Result entry page loads, section access

### 3. `pages/OrderEntryPage.ts` (Enhanced)
- Added API methods: `getFormMetadataViaAPI()`, `getDashboardMetrics()`, `getLogbookResultsViaAPI()`
- Added `fillNewPatientViaReactSetter()` with native setter pattern
- Documented React form interaction patterns

---

## Part D — Order Creation Attempt

### UI Wizard Attempt — BLOCKED
- Chrome extension ("Claude in Chrome") disconnects repeatedly with "Cannot access a chrome-extension:// URL of different extension" error
- Multiple tabs (331123259, 331123262, 331123265) lost connection during form filling
- Native setter pattern successfully sets some React controlled input values but loses them on re-render when clicking between fields
- Age/DOB fields persist but National ID, Last Name, First Name get cleared

### API Order Creation — BLOCKED
- POST `/rest/SamplePatientEntry` returns 500 with minimal payload
- The Spring form bean expects the exact structure from the React wizard's 4-step form
- Capturing the full payload requires intercepting a successful UI submission
- Recommended: Use browser DevTools to capture a real form submission payload

---

## Recommendations

1. **Capture SamplePatientEntry POST payload**: Use browser DevTools Network tab to capture a real form submission from the UI wizard, then replicate it via API for automated order creation.

2. **Test new endpoints**: The 14 newly discovered endpoints should be added to the regression test suite (WorkPlanByTest, ReferredOutTests, SampleBatchEntrySetup, TestSectionCreate, etc.).

3. **Investigate fhir/metadata 500**: The FHIR metadata endpoint returned 500 — this was working in earlier phases. May be a regression.

4. **TestSectionCreate POST**: New endpoint for creating test sections — should be tested for CRUD operations.

5. **Menu API**: The `/rest/menu` endpoint returns the complete application menu hierarchy (43KB). Useful for automated navigation testing.
