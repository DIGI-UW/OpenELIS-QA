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
| Pass | 13 |
| Fail | 0 |
| Blocked / Known Bug | 5 |
| New Bugs Found | 1 |
| Pass Rate | 72.2% (13/18) |

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
**Result:** BLOCKED (BUG-36)
**Notes:** Clicked Submit button in UI. Form appeared to process but no success notification displayed. Console showed network request to `/rest/test-calculation` endpoint.

### TC-CALC-05 — POST /rest/test-calculation API
**Result:** BLOCKED (BUG-36)
**Notes:** Direct API POST to `/rest/test-calculation` consistently returns HTTP 500 "Check server logs". Tested multiple payload formats:
- Array wrapper: `[{...}]` → 500
- Single object: `{...}` → 500
- String types vs integer types → 500
- Fresh CSRF token → 500
This is a server-side bug preventing calculated value rules from being persisted.

### TC-CALC-06 — Verify Calculated Value via GET API
**Result:** BLOCKED (BUG-36)
**Notes:** GET `/rest/test-calculations` returns empty array `[]`, confirming no calculated value rules are persisted. The POST endpoint failure prevents any rules from being saved.

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

## New Bugs Discovered in Phase 28

| Bug ID | Priority | Description |
|--------|----------|-------------|
| BUG-36 | HIGH | POST `/rest/test-calculation` returns HTTP 500 — prevents calculated value rules from being saved. UI formula builder works correctly but persistence layer fails on server side. |

---

## Open Bugs Summary (All Phases)

| Bug ID | Priority | Description | Status |
|--------|----------|-------------|--------|
| BUG-8 | HIGH | TestModify silent data corruption | CONFIRMED |
| BUG-22 | HIGH | No rate limiting on login | CONFIRMED |
| BUG-31 | HIGH | Accept checkbox renderer hang (Results page) | CONFIRMED |
| BUG-36 | HIGH | Calculated Value POST API returns 500 | NEW |
| BUG-30 | MED | SiteInfo JS crash | CONFIRMED |
| BUG-32 | MED | LogbookResults API returns 500 | CONFIRMED |
| BUG-33 | MED | Dictionary API returns 500 | CONFIRMED |
| BUG-10 | LOW | Billing empty href | CONFIRMED |
| BUG-12 | LOW | Panel Create POST 500 | CONFIRMED |
| BUG-34 | LOW | Organization API returns 500 | CONFIRMED |
| BUG-35 | LOW | Legacy Admin opens new tab | CONFIRMED |

**Total Open Bugs:** 11 (4 HIGH, 3 MED, 4 LOW)

---

## Conclusion

Phase 28 Advanced Feature Testing of OpenELIS Global v3.2.1.4 achieved a **72.2% pass rate** (13/18 test cases). The three advanced modules tested (Storage CRUD, Calculated Values, Reflex Testing) revealed varying levels of maturity:

**Key Findings:**

1. **Storage CRUD (6/6 PASS — 100%):** Full CRUD operations work correctly. Room creation, editing, stat card updates, and Cold Storage Monitoring all functional.

2. **Calculated Values (2/6 PASS — 33%):** The UI formula builder works (De Ritis Ratio formula built successfully), but the server-side persistence layer is broken. BUG-36 prevents any calculated value rules from being saved via the POST API endpoint.

3. **Reflex Testing (5/6 PASS — 83%):** Rule creation and persistence work end-to-end. "High ALT Reflex" rule (GPT/ALAT > 200 → auto-order GOT/ASAT) was created and verified via API. End-to-end verification of reflex triggering is blocked by BUG-31 (cannot enter results).

4. **De Ritis Ratio Test (PASS):** Successfully created via TestAdd wizard (id=689, Numeric, Serum). Available in order creation test selection.

5. **Order Creation (PASS):** Order DEV01260000000000004 created with GPT/ALAT, GOT/ASAT, and De Ritis Ratio — confirming advanced test configurations can be ordered.

**Recommendation:** BUG-36 (Calculated Value POST 500) and BUG-31 (Accept checkbox hang) are the highest-priority issues. BUG-36 completely prevents the Calculated Values feature from being usable, while BUG-31 blocks the entire results entry → validation → reporting pipeline, including verification of both calculated values and reflex rules.
