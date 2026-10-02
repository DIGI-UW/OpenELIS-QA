# Order entry duplicate patients: test cases

**Spec:** `tests/order-entry-duplicate-patient.spec.ts`
**Written:** 2026-09-30, after the JD training report that a patient searched By Patient came up twice, and Casey's note that entering new orders makes duplicate patients. Filed as OGC-1407.
**Updated:** 2026-10-02 for Clinical Order Entry v4 (#4490: steps Enter Order, Prepare Samples, Sample check; footer Discard / Save and exit / Save and next). OGC-1407 was fixed by #4488/#4490 and verified on local develop (image 2026-10-01 17:48 UTC), so the tripwires are now regression guards. 4 of 4 pass.

Each case types or picks a patient in Enter Order (v4), saves the order the way reception does, and then counts the patients that carry the case's unique national ID. Cases create QA patients and orders (last names `Qadp...`, national IDs `QADP...`).

| ID | Case | Screen | Kind | Ticket |
| --- | --- | --- | --- | --- |
| TC-DUPPAT-01 | New patient, Save and next, then Save and exit on Prepare Samples, leaves one patient | Enter Order (v4), Prepare Samples | Guard | OGC-1407 |
| TC-DUPPAT-02 | The save after the first carries the saved patient id, not ADD with an empty id | Enter Order (v4), Prepare Samples | Guard | OGC-1407 |
| TC-DUPPAT-03 | An existing patient picked from the search stays one patient | Enter Order (v4) | Guard | |
| TC-DUPPAT-04 | The first order POST replayed with the patient id blanked (ADD) does not add a second patient | REST, SamplePatientEntry | Server guard | OGC-1407 |
