# OpenELIS Global QA Report — Phase 28 Advanced Feature Testing

**Date:** 2026-04-01 22:30 – 2026-04-02 21:30 UTC-7
**Instance:** testing.openelis-global.org
**Version:** 3.2.1.4
**Browser:** Microsoft Edge (via Claude in Chrome)
**Credentials:** admin / adminADMIN!
**Tester:** Automated QA Agent (Phase 28 — Advanced Feature Testing)

---

## Summary

| Metric | Value |
|--------|-------|
| Total TCs Executed | 18 |
| Pass | 16 |
| Fail | 0 |
| Blocked / Known Bug | 2 |
| New Bugs Found | 0 |
| Bugs Resolved | 1 (BUG-36) |
| Pass Rate | 88.9% (16/18) |

---

## Part A — Storage CRUD (6 TCs)

### TC-STOR-CRUD-01 — Navigate to Storage Management
**Result:** PASS
**Notes:** Storage Management accessible from sidebar, all 6 tabs render (Rooms, Devices, Shelves, Racks, Boxes, Sample Items).

### TC-STOR-CRUD-02 — Add Room Form
**Result:** PASS
**Notes:** "Add Room" button opens form with fields: Name, Code, Description, Status. Form validates required fields.

### TC-STOR-CRUD-03 — Create Storage Room
**Result:** PASS
**Notes:** Created test room "QA-Room-Phase28" successfully. Room appears in Rooms tab table.

### TC-STOR-CRUD-04 — Edit Storage Room
**Result:** PASS
**Notes:** Edit button on room row opens pre-filled form. Modified description and saved successfully.

### TC-STOR-CRUD-05 — Storage Stat Cards Update
**Result:** PASS
**Notes:** Stat cards updated after room creation (Total: 1, Active: 1, Disposed: 0).

### TC-STOR-CRUD-06 — Cold Storage Monitoring
**Result:** PASS
**Notes:** Cold Storage Monitoring page accessible, shows monitoring dashboard with empty device list.

---

## Part B — Calculated Values (6 TCs)

### TC-CALC-01 — Create De Ritis Ratio Test (TestAdd Wizard)
**Result:** PASS
**Notes:** Successfully created "De Ritis Ratio" test via 6-step TestAdd wizard:
- Step 1: Test name "De Ritis Ratio", English name set, Test Section assigned
- Step 2: Panel and UoM configured
- Step 3: Result type = Numeric (N)
- Step 4: Sample type = Serum (id=2)
- Step 5: Normal ranges configured
- Step 6: Review and Accept
- Test confirmed at id=689 via `/rest/test-display-beans?sampleType=2`

### TC-CALC-02 — Navigate to Calculated Value Management
**Result:** PASS
**Notes:** `/MasterListsPage/calculatedValue` loads with formula builder UI. Fields: Result Test (autocomplete), calculation display area, operand type selector (Test Result, Mathematical Function, Integer, Patient Attribute).

### TC-CALC-03 — Build Calculated Value Formula (UI)
**Result:** PASS
**Notes:** Successfully built formula in UI:
- Result Test: De Ritis Ratio(Serum)
- Formula: `GOT/ASAT(Serum) / GPT/ALAT(Serum)`
- All operands selected via autocomplete dropdowns
- Calculation display showed formula correctly

### TC-CALC-04 — Submit Calculated Value via UI
**Result:** PASS
**Notes:** Clicked Submit button in UI. Form processed successfully. GET `/rest/test-calculations` confirmed "De Ritis Ratio" rule persisted (id=1). Initial testing in prior session reported HTTP 500 due to malformed payloads — subsequent retesting confirmed the endpoint works correctly.

### TC-CALC-05 — POST /rest/test-calculation API (Create & Update)
**Result:** PASS
**Notes:** Direct API POST to `/rest/test-calculation` returns HTTP 200 for both operations:
- **Create** (no id): `{name, sampleId, testId, result, operations: [{order, type, value, sampleId?}], toggled, active, note}` → 200 OK. Created "QA Test Calc" (id=6).
- **Update** (with id + lastupdated): Same payload with id and lastupdated fields → 200 OK.
- Operation types supported: TEST_RESULT, MATH_FUNCTION, INTEGER, PATIENT_ATTRIBUTE.
- Prior session's HTTP 500 errors were caused by malformed payloads (array wrappers, missing required fields). BUG-36 RESOLVED.

### TC-CALC-06 — Verify Calculated Value via GET API
**Result:** PASS
**Notes:** GET `/rest/test-calculations` returns array with 2 rules: De Ritis Ratio (id=1) and QA Test Calc (id=6). Both correctly persisted with full formula details. No DELETE endpoint available (returns 404).

---

## Part C — Reflex Testing (6 TCs)

### TC-REFLEX-01 — Navigate to Reflex Tests Management
**Result:** PASS
**Notes:** `/MasterListsPage/reflex` loads with form fields: Rule Name, Toggle Rule, Active checkbox, Conditions section (Over All Option, Select Sample, Search Test, Relation, Numeric value), Actions section (Select Sample, Search Test, Internal Note, External Note), Submit button, + Rule button.

### TC-REFLEX-02 — Configure Reflex Rule (High ALT Reflex)
**Result:** PASS
**Notes:** Successfully configured reflex rule:
- Rule Name: "High ALT Reflex"
- Toggle Rule: On
- Active: true
- Over All Option: Any
- Condition: Serum → GPT/ALAT(Serum) → Is greater than → 200
- Action: Serum → GOT/ASAT(Serum)

### TC-REFLEX-03 — Submit Reflex Rule
**Result:** PASS
**Notes:** Clicked Submit, button grayed out (disabled) indicating successful submission. No error notifications.

### TC-REFLEX-04 — Verify Reflex Rule via API
**Result:** PASS
**Notes:** GET `/rest/reflexrules` returns:
```json
[{
  "id": 1,
  "ruleName": "High ALT Reflex",
  "overall": "ANY",
  "active": true,
  "conditions": [{
    "sampleId": "2",
    "testId": "1",
    "relation": "GREATER_THAN",
    "value": "200"
  }],
  "actions": [{
    "reflexTestId": "2",
    "sampleId": "2",
    "addNotification": "Y"
  }]
}]
```
Rule persisted correctly with all fields matching the UI configuration.

### TC-REFLEX-05 — Create Order with Reflex-Triggering Tests
**Result:** PASS
**Notes:** Created order DEV01260000000000004 with 3 tests on Serum:
- GPT/ALAT (test id=1)
- GOT/ASAT (test id=2)
- De Ritis Ratio (test id=689)
Order saved successfully via 4-step wizard (Patient → Program → Sample → Order).

### TC-REFLEX-06 — Enter Results to Trigger Reflex Rule
**Result:** BLOCKED (BUG-31)
**Notes:** Navigated to Results page to enter GPT/ALAT value > 200 to trigger the reflex rule. Results By Unit page shows "Select Test Unit" dropdown with only 1 option (test section 1). After selecting, "no records to display" — results entry is blocked by the same BUG-31 (Accept checkbox 60s renderer hang) identified in Phase 27. Cannot verify reflex rule triggering without being able to enter and save results.

---

## Bugs Resolved in Phase 28

| Bug ID | Previous Priority | Resolution |
|--------|-------------------|------------|
| BUG-36 | HIGH | RESOLVED — POST `/rest/test-calculation` returns HTTP 200 for both create and update operations. Initial HTTP 500 errors were caused by malformed payloads (array wrappers, missing required fields). Endpoint works correctly with proper payload structure. |

---

## Open Bugs Summary (All Phases)

| Bug ID | Priority | Description | Status |
|--------|----------|-------------|--------|
| BUG-8 | HIGH | TestModify silent data corruption | CONFIRMED |
| BUG-22 | HIGH | No rate limiting on login | CONFIRMED |
| BUG-31 | HIGH | Accept checkbox renderer hang (Results page) | CONFIRMED |
| ~~BUG-36~~ | ~~HIGH~~ | ~~Calculated Value POST API returns 500~~ | RESOLVED |
| BUG-30 | MED | SiteInfo JS crash | CONFIRMED |
| BUG-32 | MED | LogbookResults API returns 500 | CONFIRMED |
| BUG-33 | MED | Dictionary API returns 500 | CONFIRMED |
| BUG-10 | LOW | Billing empty href | CONFIRMED |
| BUG-12 | LOW | Panel Create POST 500 | CONFIRMED |
| BUG-34 | LOW | Organization API returns 500 | CONFIRMED |
| BUG-35 | LOW | Legacy Admin opens new tab | CONFIRMED |

**Total Open Bugs:** 10 (3 HIGH, 3 MED, 4 LOW) — BUG-36 resolved

---

## Conclusion

Phase 28 Advanced Feature Testing of OpenELIS Global v3.2.1.4 achieved an **88.9% pass rate** (16/18 test cases). The three advanced modules tested (Storage CRUD, Calculated Values, Reflex Testing) showed strong maturity:

**Key Findings:**

1. **Storage CRUD (6/6 PASS — 100%):** Full CRUD operations work correctly. Room creation, editing, stat card updates, and Cold Storage Monitoring all functional.

2. **Calculated Values (5/6 PASS — 83%):** The UI formula builder and POST API both work correctly. De Ritis Ratio formula built and persisted (id=1). Direct API create/update both return HTTP 200. BUG-36 RESOLVED — initial 500 errors were from malformed payloads. Only TC-CALC-06 partial (no DELETE endpoint). End-to-end calculation triggering blocked by BUG-31.

3. **Reflex Testing (5/6 PASS — 83%):** Rule creation and persistence work end-to-end. "High ALT Reflex" rule (GPT/ALAT > 200 → auto-order GOT/ASAT) was created and verified via API. End-to-end verification of reflex triggering is blocked by BUG-31 (cannot enter results).

4. **De Ritis Ratio Test (PASS):** Successfully created via TestAdd wizard (id=689, Numeric, Serum). Available in order creation test selection.

5. **Order Creation (PASS):** Order DEV01260000000000004 created with GPT/ALAT, GOT/ASAT, and De Ritis Ratio — confirming advanced test configurations can be ordered.

6. **BUG-36 Resolved:** POST `/rest/test-calculation` works for both create (no id) and update (with id+lastupdated). Correct payload: `{name, sampleId, testId, result, operations: [{order, type, value, sampleId?}], toggled, active, note}`. Two rules now in database.

**Recommendation:** BUG-31 (Accept checkbox renderer hang) remains the highest-priority blocker. It prevents the entire results entry → validation → reporting pipeline, including verification of both calculated value auto-computation and reflex rule triggering.
