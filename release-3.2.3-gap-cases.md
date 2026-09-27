# Release 3.2.3 gap cases (written 2026-09-27)

**Spec files:** `tests/data-export-saved-reports.spec.ts`, `tests/reports-output-correctness.spec.ts`, `tests/admin-silent-drops.spec.ts`, `tests/results-worklist-chip-counts.spec.ts` (all collected by `modules.config.ts`, CI shard 1), plus TC-MP-07a/b in `tests/patient-management.spec.ts`.
**Target:** testing.openelis-global.org 3.2.3.0. **Source:** hand walk-through in Chrome on 2026-09-27, findings R26, R35-R40, R42, R44 and OGC-481/483 in the project doc `release-qa-3.2.3.md`.

## Why these exist

Each area below had specs that proved a page renders but none that read back what was stored or generated, so each defect passed the suite. Contract: act through the UI where a user would, read back through REST or the generated file, compare. `test.fail()` cases are FLIP-WHEN-FIXED tripwires asserting the correct behaviour; each has a canary over the same path.

## Cases

### TC-DXS-01: A saved export report keeps column order and never stores a date range
Canary and permanent truth (OGC-483 AC). **Criterion:** ROUND-TRIP.

### TC-DXS-02: Saving a second report under an existing name is refused or needs confirmation
FLIP-WHEN-FIXED (OGC-483 AC: overwrite confirmation). Today the duplicate saves with 201. **Criterion:** PERSIST.

### TC-DXS-03: The saved-report library refuses more than 20 reports
FLIP-WHEN-FIXED (OGC-483 AC: 422 configLimitExceeded). Today the 21st saves. **Criterion:** PERSIST.

### TC-DXS-04: Deleting a saved report requires the optimistic-lock version
Permanent truth, from the UI's own Delete call. **Criterion:** FUNCTION.

### TC-DXS-05: The export Review step shows the job as ready once the server says READY
FLIP-WHEN-FIXED (OGC-481). Today the step polls once and stays on "Queued". **Criterion:** FUNCTION.

### TC-DXS-06: After Generate CSV the Review step shows a Queued status label
Canary for TC-DXS-05. **Criterion:** RENDER.

> **Guarded (OGC-1360):** TC-RPTOUT-01..03 run only with `QA_ALLOW_LEAKY_EXPORTS=1`. Each Export Routine CSV run leaks one DB connection; about 20 runs hang the instance until the webapp restarts. Remove the guard once OGC-1360 is fixed.

### TC-RPTOUT-01: Export Routine CSV for Biochemistry returns only Biochemistry rows
Canary for TC-RPTOUT-02/03. **Criterion:** FUNCTION.

### TC-RPTOUT-02: Export Routine CSV for Hematology does not error
FLIP-WHEN-FIXED (R44). Today 500. **Criterion:** FUNCTION.

### TC-RPTOUT-03: Export Routine CSV for Cytology returns only Cytology rows
FLIP-WHEN-FIXED (R44). Today it returns other units' rows. **Criterion:** FUNCTION.

### TC-RPTOUT-04: Activity report by test type returns a PDF
Canary for the activity-report path. **Criterion:** FUNCTION.

### TC-DP-01: After a full page load the no-future-date picker maxDate is today
FLIP-WHEN-FIXED (R26). Today 9 January. **Criterion:** FUNCTION.

### TC-DP-02: A no-future-date picker has a maxDate after a full load
Canary for TC-DP-01. **Criterion:** RENDER.

### TC-ASD-01: A sample type created in the editor is stored with its name
Canary for TC-ASD-02. **Criterion:** PERSIST.

### TC-ASD-02: The description typed when creating a sample type is stored
FLIP-WHEN-FIXED (R35). **Criterion:** PERSIST.

### TC-ASD-03: A new label preset is stored
Canary for TC-ASD-04. **Criterion:** PERSIST.

### TC-ASD-04: A new label preset keeps the capitalisation that was typed
FLIP-WHEN-FIXED (R37). **Criterion:** PERSIST.

### TC-ASD-05: Dictionary Add with Is Active = Y creates the entry
Canary for TC-ASD-06. **Criterion:** PERSIST.

### TC-ASD-06: Dictionary Add with Is Active empty tells the user what is missing
FLIP-WHEN-FIXED (R36). Today the dialog closes silently on a 400. **Criterion:** FUNCTION.

### TC-RWC-01: The Results All chip is present and covers the rows on screen
Canary for TC-RWC-02. **Criterion:** RENDER.

### TC-RWC-02: On a multi-page worklist the All chip counts every page
FLIP-WHEN-FIXED (R42). Skips with a reason when the unit has one page of work. **Criterion:** FUNCTION.

### TC-MP-07a: The merge confirmation step has an identifiers block
Canary for TC-MP-07b. Stops before executing the merge. **Criterion:** RENDER.

### TC-MP-07b: The merge confirmation step lists the patients' identifiers
FLIP-WHEN-FIXED (R40). Today it says "No identifiers recorded". **Criterion:** RENDER.
