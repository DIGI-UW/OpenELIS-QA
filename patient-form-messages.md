# Add Patient messages (OGC-1497): test cases

**Spec:** `tests/patient-form-messages.spec.ts`
**Written:** 2026-10-15 against local develop (frontend image 2026-10-15 14:33 UTC, develop 7472c304).
**Scope:** OpenELIS-Global-2 #4731 (merged 15 Oct 2026, Mozzy): each missing field on Add Patient (`/PatientManagement/new`) is reported once, on its field, and after a refused save a corrected field clears as it changes, so one Save click saves.

| ID | Case | Kind |
| --- | --- | --- |
| TC-PFM-01 | Save on an empty form shows "Select the patient's sex." and "Enter a date of birth or an age in years, months or days." once each, the sex message inside the sex group, no old wording, and no message twice | Guard |
| TC-PFM-02 | After a refused save, choosing the sex and typing an age clear their messages without leaving the field, and the first Save click saves the patient | Guard |
| TC-PFM-03 | An email that is not an email is reported once | Guard |

Data: TC-PFM-02 saves one patient, `Qapfm<stamp in letters>` (names take letters only), with a National ID unique to the run.
