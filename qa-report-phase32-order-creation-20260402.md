# Phase 32 — UI Order Creation End-to-End Report

**Server:** testing.openelis-global.org (v3.2.1.4)
**Date:** 2026-04-02
**Tester:** QA Automation (Claude)
**Phase Focus:** Full 4-step order creation wizard via UI interaction (clicking + JS)

---

## Executive Summary

| Metric | Value |
|--------|-------|
| Test Cases Executed | 15 |
| Pass | 12 |
| Fail | 1 |
| Partial | 2 |
| Lab Number Generated | DEV0126000000000005 |
| Patient Created | Yes (PatientID=6) |
| Order Submitted | Yes (green checkmark) |
| Patient-Order Linkage | FAIL — "No Patient Information Available" |

---

## Part A — Order Wizard Navigation (4 TCs — All PASS)

| TC | Step | Action | Result |
|----|------|--------|--------|
| TC-ORD-01 | Step 1 → Step 2 | Fill patient info, click Next | PASS — Advanced to Program Selection |
| TC-ORD-02 | Step 2 → Step 3 | Select "Routine Testing", click Next | PASS — Advanced to Add Sample |
| TC-ORD-03 | Step 3 → Step 4 | Select Serum + 3 tests, click Next | PASS — Advanced to Add Order |
| TC-ORD-04 | All steps | Verify progress indicator updates | PASS — Green checkmarks on completed steps |

---

## Part B — Patient Info Entry (3 TCs — 2 PASS, 1 PARTIAL)

| TC | Field | Method | Result |
|----|-------|--------|--------|
| TC-ORD-05 | National ID, Last Name, Gender, Age, DOB | React native setter + JS click | PASS — All fields accepted values |
| TC-ORD-06 | First Name | React native setter | PARTIAL — React controlled input resisted all setter methods. Field remained empty. Not marked as required, so wizard allowed progression. |
| TC-ORD-07 | New Patient tab selection | JS click on "New Patient" tab | PASS — Tab activated correctly |

### Patient Data Saved
- **PatientID:** 6
- **LastName:** QATestPatient
- **Gender:** M
- **DOB:** 02/04/1996 (Age: 30)
- **NationalId:** QA-P32-003
- **FHIR GUID:** 70e68ab0-ad34-4ccc-8064-d317de89aba5
- **First Name:** (empty — React input resistance)

---

## Part C — Sample & Test Selection (3 TCs — All PASS)

| TC | Action | Result |
|----|--------|--------|
| TC-ORD-08 | Select sample type "Serum" from dropdown | PASS — Serum selected, test list rendered |
| TC-ORD-09 | Check 3 test checkboxes (GPT/ALAT, GOT/ASAT, Creatinine) | PASS — test_0_1, test_0_2, test_0_4 all checked=true |
| TC-ORD-10 | Verify test checkboxes persist through wizard navigation | PASS — 3 tests remained checked after scrolling and navigation |

### Test IDs Selected
| Test ID | Test Name | Checkbox ID |
|---------|-----------|-------------|
| 1 | GPT/ALAT | test_0_1 |
| 2 | GOT/ASAT | test_0_2 |
| 4 | Creatinine | test_0_4 |

---

## Part D — Order Details & Submission (4 TCs — 3 PASS, 1 PARTIAL)

| TC | Action | Result |
|----|--------|--------|
| TC-ORD-11 | Generate lab number | PASS — DEV0126000000000005 auto-generated |
| TC-ORD-12 | Fill required fields (dates, requester, site) | PARTIAL — Request Date (02/04/2026) and Received Date (02/04/2026) filled. Requester FirstName "QA" and LastName "Tester" filled. Site Name "QA Test Site" filled but showed "No suggestions available" (no matching sites in test environment). Requester "QA Requester" same issue. |
| TC-ORD-13 | Click Submit button | PASS — Green checkmark displayed, "Succesfuly saved" message shown |
| TC-ORD-14 | Print labels dialog | PASS — Order (Qty:1) and Specimen (Qty:1) print buttons displayed with Done button |

### Submit Confirmation Details
- **Message:** "Succesfuly saved" (note: typo in application — "Succesfuly" instead of "Successfully")
- **Lab Number:** DEV0126000000000005
- **Labels:** Order (Qty: 1), Specimen (Qty: 1)
- **UI Bug:** Submit button positioned at x=1444 (off-screen right) — required JS click, not visible via normal scrolling

---

## Part E — Post-Submission Verification (1 TC — FAIL)

| TC | Verification | Result |
|----|-------------|--------|
| TC-ORD-15 | Verify order via Modify Order page | FAIL — Order found but shows "No Patient Information Available". Current Tests table shows 1 item with empty Lab Number/Sample Type/Test Name columns. Patient not linked to order. |

### Verification Details

**Patient Search API (PASS):**
- `/patient-search?lastName=QATestPatient` → 200, returns PatientID=6 with correct data

**Modify Order UI (PARTIAL FAIL):**
- Order DEV0126000000000005 found and loadable
- "No Patient Information Available" warning banner
- Program: "Routine Testing" (saved correctly)
- Current Tests: 1-1 of 1 items (data partially saved)
- Available Tests: 1-1 of 1 items
- Test Name, Sample Type, Lab Number columns: empty in table

**Workplan API (PASS but empty):**
- WorkPlanByTest?type=Biochemistry → 200, workplanTests=0
- Expected: 3 tests (GPT, GOT, Creatinine) should appear

**Logbook API (PASS but empty):**
- LogbookResults?type=Biochemistry → 200, no results
- Expected: order should populate logbook for result entry

---

## Key Findings & Bugs

### BUG-37: Patient-Order Linkage Failure
**Severity:** HIGH
**Description:** Order submitted successfully (green checkmark, lab number generated) but patient information is not linked to the order. Modify Order shows "No Patient Information Available" even though patient was created (PatientID=6 confirmed via patient-search API).
**Possible Root Causes:**
1. First Name field was empty due to React controlled input resistance — may be a required field for patient linkage despite no UI validation
2. Site Name and Requester fields showed "No suggestions available" — may need to match existing database records for proper linkage
3. The order wizard may not properly link patient data when using programmatic/automated input methods

### BUG-38: Submit Button Off-Screen
**Severity:** LOW (UI)
**Description:** The Submit button on Step 4 (Add Order) is positioned at x=1444, which is off-screen to the right on standard viewport widths (1384px). Users cannot see or click it without horizontal scrolling or using keyboard navigation.

### FINDING-1: React Controlled Input Resistance (First Name)
**Impact:** Medium
**Description:** The First Name input on the Patient Info form resists all programmatic value setting methods (native setter, React props onChange, InputEvent dispatch). Other fields (National ID, Last Name, Age) work fine with the same approach. This suggests inconsistent React state management across form fields.

### FINDING-2: "Succesfuly saved" Typo
**Impact:** Low (cosmetic)
**Description:** Success message reads "Succesfuly saved" instead of "Successfully saved".

### FINDING-3: Site/Requester Autocomplete No Matches
**Impact:** Medium
**Description:** The Search Site Name and Search Requester fields are autocomplete fields with no matching records in the test environment. Typing free text shows "No suggestions available" but allows form submission. However, the lack of matched records may cause downstream data linkage issues.

---

## Technical Notes

### Successful Interaction Patterns
1. **React native setter** for input fields: `Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, value)` + `dispatchEvent(new Event('input/change', {bubbles: true}))`
2. **JS click** for buttons: `document.querySelector('button').click()` — most reliable for Carbon components
3. **setTimeout chains** for multi-step form filling within single JS execution
4. **Carbon DatePicker**: Wrapper is a DIV; actual input is nested inside — must query `div.querySelector('input')`

### Chrome Extension Workarounds
- Coordinate-based clicks on form elements cause "Cannot access chrome-extension:// URL" errors
- JS-only approach (querySelector + .click()) avoids extension disconnects
- New tab creation required when extension loses connection

---

## Recommendations

1. **Investigate Patient-Order Linkage:** The most critical finding. The order saves with a green checkmark but patient data is not linked. This could affect all downstream workflows (results entry, validation, reporting).

2. **Fix Submit Button Positioning:** The Submit button is off-screen to the right. Consider placing it below the form or in a fixed footer bar.

3. **Add Site/Requester Seed Data:** The test environment has no matching sites or requesters. Add test data to enable full workflow testing.

4. **Fix First Name Input:** The React controlled input resistance on First Name may contribute to patient linkage issues. All form fields should behave consistently.

5. **Correct "Succesfuly" Typo:** Minor but visible on every order submission.
