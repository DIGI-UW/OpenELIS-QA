# Test Catalog: silent actions

**Spec file:** `test-catalog-silent-actions.spec.ts` (collected by `all-tc.config.ts`, project `test-catalog`, CI shard 3)
**Target:** testing.openelis-global.org, 3.2.2.0, develop `95d6c64`. **Written:** 2026-09-23.
**Report:** `qa-report-testing-20260923-silent-actions.md` (Delta ledger, AC scorecard, evidence).

## Why this suite exists

The product owner clicked "Copy configuration from test" and nothing happened, while the UI said "Configuration copied." The repo had no case for the control. A sweep of the editor found the same shape in three more places. Every case here asks one question the rest of the catalog suite does not: **did the thing the toast claims actually happen?**

Contract for every case: seed through REST, act through the UI, read back through REST, and compare the toast with the state. `test.fail()` cases are FLIP-WHEN-FIXED tripwires that assert the spec. Each one has a canary or contract case over the same path, so a broken selector cannot pass as a still-present defect.

## Cases

### TC-SA-01: Copy stages nothing until confirmed: Cancel writes nothing
Canary. Seeds a source and target test, each with a PRIMARY single-select component and disjoint options. Opens the editor, picks the source, clicks Copy, expects the confirmation dialog, clicks Cancel. Asserts no non-GET request to the target test and the target configuration unchanged. Rewritten 2026-09-25 for the OGC-1234 contract (#4415): the old `copy-from` POST on click no longer exists. **Criterion:** FUNCTION.

### TC-SA-02: Copy asks to confirm a destructive replace, then Save persists the source config
FIXED (OGC-1234, OpenELIS-Global-2 #4415), flipped on testing 3.2.3.0 2026-09-25. Was Delta-SA1. Contract per Casey (2026-09-23): Copy replaces the target configuration; clicking it opens a confirmation modal warning the change is irreversible once saved; confirming stages the source config in the editor and Save commits it. The case asserts the modal, the warning, and the read-back after Save. Failed before the fix: no modal appeared, and the backend never overwrites a configured component. **Criterion:** PERSIST.

### TC-SA-10: A new panel name creates a new panel
Canary. New Panel form with an unused name mints a new id that reads back by id. **Criterion:** ROUND-TRIP.

### TC-SA-12: POST /panels resolves an existing name to the existing panel
Contract (OGC-1122 fix, intended). Proves TC-SA-11's precondition outside `test.fail`. **Criterion:** FUNCTION.

### TC-SA-11: Add Panel with an existing name must not alter the existing panel
FLIP-WHEN-FIXED, Delta-SA2. Seeds an active panel with a member and a description, then saves the New Panel form with the same name. Asserts the seeded panel is still active with its description. Fails today: the form PUTs `{active:false, description}` onto the existing panel. afterAll restores it. **Criterion:** PERSIST.

### TC-SA-20: Inline Create New Method with a new code creates and links it
Canary. **Criterion:** PERSIST.

### TC-SA-22: The server refuses a duplicate method code with 409 and links nothing
Contract. Proves TC-SA-21's precondition outside `test.fail`. **Criterion:** FUNCTION.

### TC-SA-21: A refused method create (409) must not show a success toast
FIXED (OGC-1234, #4415), flipped on testing 3.2.3.0 2026-09-25. Was Delta-SA3. Failed before the fix: `if (res)` in MethodsSection treats the helper's `{error,status}` object as success, closes the form and shows a green toast. **Criterion:** FUNCTION (user-visible outcome).

### TC-SA-30: A plain sample type name creates the sample type
Canary. **Criterion:** ROUND-TRIP (GET /sample-types).

### TC-SA-31: The required Description typed on sample type create is stored
FLIP-WHEN-FIXED, Delta-SA4. Fails today: the create payload omits `description`, and the server stores the name instead. **Criterion:** PERSIST.

### TC-SA-33: A sample type name carrying HTML is not created
Contract. Proves TC-SA-32's precondition outside `test.fail`. **Criterion:** FUNCTION.

### TC-SA-32: A refused sample type create must not report "saved successfully"
FIXED (OGC-1234, #4415), flipped on testing 3.2.3.0 2026-09-25. Was Delta-SA5. Failed before the fix: SampleTypeCreate answers 200 on a bean-validation refusal and the UI toasts "Sample type saved successfully." **Criterion:** FUNCTION (user-visible outcome).

## Not yet encoded (candidates, from code reading; not UI-confirmed)

| Candidate | Why not encoded yet |
|---|---|
| Methods "Copy from Test" ignores its response entirely | Append-with-skip behaviour matches the backend test; the spec delta (no preview, no Replace/Append) is a product decision. Needs Casey's ruling. |
| "Edit related tests" group Ranges save drops `sampleTypeId` | Encoded: TC-SD-02 (SD-G1) in `test-catalog-section-depth.md`. |
| Group Storage save copies the first test's settings to all | Encoded: TC-SD-04 (SD-G2) in `test-catalog-section-depth.md`. |
| Terminology Save drops a row whose code was cleared, deleting the mapping | Arguably intended (clearing means remove). NEEDS-GUIDANCE. |
| Reagents partial link failure leaves the table stale | Needs a forced mid-batch failure. |
