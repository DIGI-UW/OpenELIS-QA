# Phase 31 — Deep Endpoint Testing Report

**Server:** testing.openelis-global.org (v3.2.1.4)
**Date:** 2026-04-02
**Tester:** QA Automation (Claude)
**Phase Focus:** Deep structural validation of all known endpoints, POST probing, parameterized GET tests

---

## Executive Summary

| Metric | Value |
|--------|-------|
| Test Cases Executed | 25 |
| Pass | 25 |
| Fail | 0 |
| Blocked | 0 |
| Playwright Spec Created | 1 (deep-endpoint-testing.spec.ts) |
| Playwright TCs Written | 25 |
| POST Operations Probed | 4 endpoints |
| Parameterized GETs Tested | 4 queries |

---

## Part A — Deep GET Structure Tests (11 TCs — All PASS)

### Key Findings

| Endpoint | Key Data Points |
|----------|----------------|
| TestSectionCreate | 15 active sections, 8 inactive, formName=testSectionCreateForm, EN+FR names |
| WorkPlanByTest | workplanTests=[] (no pending), has currentDate, paging, searchFinished |
| WorkPlanByPanel | Has panelTypes field, similar structure to WorkPlanByTest |
| ReferredOutTests | 15 test units, 170 tests, 0 referral items, first test=AMACR (p504 s) |
| ElectronicOrders | 164 tests, 4 statuses (Cancelled/Entered/Realized/Unrealized), 0 facilities, 0 eOrders |
| ProviderMenu | 4 providers with person+address objects, fhirUuid, totalRecordCount |
| PanelCreate | 23 existing panels, 23 inactive, 23 sample types, EN+FR names |
| TestAdd | 24 sampleTypes, 37 UOM, 6 resultTypes, 23 labUnits, has panelList+ageRangeList |
| TestModifyEntry | 24 sampleTypes, has jsonWad, formName present |
| SampleBatchEntrySetup | ~19KB response, has sampleTypes and testSectionList arrays |
| Menu | ~43KB, 24 top-level items with child menus |

### Test Section IDs (15 active)

| ID | Name |
|----|------|
| 36 | Hematology |
| 56 | Biochemistry |
| 97 | Serology |
| 58 | Parasitology |
| 183 | Urinalysis |
| 184 | Microbiology |
| 59 | Immunology |
| 136 | Molecular Biology |
| 165 | Cytology |
| 185 | Histopathology |
| 186 | Hemato-Immunology |
| 163 | Pathology |
| 117 | Serology-Immunology |
| 164 | Immunohistochemistry |
| 76 | Virology |

### Electronic Order Statuses (4)

| ID | Status |
|----|--------|
| 22 | Cancelled |
| — | Entered |
| — | Realized |
| — | Unrealized |

---

## Part B — Parameterized GET Tests (4 TCs — All PASS)

| TC | Endpoint | Parameter | Result |
|----|----------|-----------|--------|
| TC-DEEP-12 | WorkPlanByTest | ?type=Hematology | 200, workplanTests=0 |
| TC-DEEP-13 | WorkPlanByTest | ?testTypeID=36 | 200, workplanTests=0 |
| TC-DEEP-14 | ReferredOutTests | ?testUnitId=36 | 200, referralItems=0 |
| TC-DEEP-15 | patient-search | ?lastName=test | 200, 687 bytes |

### Notes
- WorkPlanByTest accepts both `?type=` (name) and `?testTypeID=` (numeric ID) parameters
- All parameterized queries return empty results (no pending work/referrals in test environment)
- patient-search returns results for "test" — confirms patient search API is working

---

## Part C — POST Operation Probing (4 TCs — All PASS expected)

| TC | Endpoint | Method | Content-Type | Status | Interpretation |
|----|----------|--------|-------------|--------|----------------|
| TC-DEEP-16 | TestSectionCreate | POST | application/json | 400 | HttpMessageNotReadableException — needs exact form bean |
| TC-DEEP-17 | TestSectionCreate | POST | form-urlencoded | 415 | Unsupported Media Type — only accepts JSON |
| TC-DEEP-18 | TestSectionCreate | PUT | application/json | 405 | Method Not Allowed — only GET+POST |
| TC-DEEP-19 | SampleBatchEntrySetup | POST | application/json | 405 | GET-only endpoint |

### POST Analysis
- **TestSectionCreate** accepts POST with Content-Type: application/json but returns 400 because the payload doesn't match the Java `TestSectionCreateForm` bean structure exactly. The Spring `HttpMessageNotReadableException` indicates the JSON couldn't be deserialized into the expected form class. To successfully POST, we need to capture the exact form bean structure from the React UI or decompile the Java class.
- **SampleBatchEntrySetup** is strictly a GET endpoint (read-only form metadata).

---

## Part D — Config Endpoint Validation (3 TCs — All PASS)

| TC | Endpoint | formName | siteInfoDomainName |
|----|----------|----------|--------------------|
| TC-DEEP-20 | SampleEntryConfig | Present | Present |
| TC-DEEP-21 | ResultConfiguration | Present | Present |
| TC-DEEP-22 | PatientConfiguration | Present | Present |

All three config endpoints return `siteInfoDomain` forms used for system configuration.

---

## Part E — Admin Form Structure Validation (3 TCs — All PASS)

| TC | Endpoint | Key Lists Validated |
|----|----------|---------------------|
| TC-DEEP-23 | TestAdd | sampleTypeList(24), panelList, uomList(37), resultTypeList(6), ageRangeList, labUnitList(23) |
| TC-DEEP-24 | PanelCreate | existingPanelList(23), inactivePanelList(23), existingSampleTypeList(23), EN names, FR names |
| TC-DEEP-25 | SiteInformation | Site configuration data |

---

## Updated Cumulative API Endpoint Status

| Category | Working GET | Working POST | Broken GET | Notes |
|----------|-------------|-------------|------------|-------|
| Core Data | 4 | 2 | 0 | test-list, test-calculations, reflexrules, dashboard |
| Order Entry | 4 | 0* | 0 | SamplePatientEntry, SampleEdit, SampleBatchEntrySetup, ElectronicOrders |
| Patient | 1 | 0 | 0 | patient-search (with ?lastName param) |
| Results | 1 | 0 | 0 | LogbookResults?type= (13 sections) |
| Workplan | 2 | 0 | 0 | WorkPlanByTest (with params), WorkPlanByPanel |
| Referrals | 1 | 0 | 0 | ReferredOutTests (with ?testUnitId param) |
| Admin Users | 2 | 0* | 0 | UnifiedSystemUser, UnifiedSystemUserMenu |
| Admin Tests | 4 | 0* | 0 | TestAdd, TestModifyEntry, PanelCreate, TestSectionCreate |
| Admin Config | 6 | 0 | 2 | 6 working + Dictionary(500) + Organization(500) |
| System | 4 | 0 | 0 | reports, alerts, notifications, menu |
| **Total** | **29** | **2** | **2** | *POST endpoints need form bean payloads |

---

## Recommendations

1. **Form Bean Capture**: Use browser DevTools to intercept real UI POST submissions for TestSectionCreate and TestAdd to determine exact payload structure for API-driven test creation.

2. **Create Test Data**: The test environment has empty workplans, referrals, and electronic orders. Creating a test order would populate these endpoints with data for more thorough testing.

3. **Provider CRUD Testing**: ProviderMenu has 4 providers with FHIR UUIDs — test creating/modifying providers via API.

4. **Config Endpoint PUT/POST**: Test if SampleEntryConfig, ResultConfiguration, and PatientConfiguration accept updates.

5. **SampleBatchEntry Workflow**: While SampleBatchEntrySetup is GET-only, the actual batch entry POST endpoint may be at a different path (e.g., /rest/SampleBatchEntry).
