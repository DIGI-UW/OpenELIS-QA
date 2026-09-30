# Order entry duplicate patients: test cases

**Spec:** `tests/order-entry-duplicate-patient.spec.ts`
**Written:** 2026-09-30, after the JD training report that a patient searched By Patient came up twice, and Casey's note that entering new orders makes duplicate patients. Filed as OGC-1407.

Each case types or picks a patient in Enter Order (v4), saves the order the way reception does, and then counts the patients that carry the case's unique national ID. Cases create QA patients and orders (last names `Qadp...`, national IDs `QADP...`). Tripwires carry `test.fail()` until OGC-1407 is fixed.

| ID | Case | Screen | Kind | Ticket |
| --- | --- | --- | --- | --- |
| TC-DUPPAT-01 | New patient, Save, Save, Save & Next leaves one patient | Enter Order (v4) | Tripwire | OGC-1407 |
| TC-DUPPAT-02 | New patient, Save & Next, Save on Collect leaves one patient | Enter Order (v4) and Collect | Tripwire | OGC-1407 |
| TC-DUPPAT-03 | An existing patient picked from the search stays one patient | Enter Order (v4) | Guard | |
| TC-DUPPAT-04 | Saves after the first carry the saved patientPK, not ADD | Enter Order (v4) | Tripwire | OGC-1407 |
