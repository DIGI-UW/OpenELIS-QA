# Test Catalog: section depth

**Spec file:** `test-catalog-section-depth.spec.ts` (collected by `all-tc.config.ts`, project `test-catalog`, CI shard 3)
**Target:** testing.openelis-global.org, 3.2.2.0, develop `95d6c64`. **Written:** 2026-09-23.
**Report:** `qa-report-testing-20260923-section-depth.md`.

Second pass after `test-catalog-silent-actions.md`. Covers the editor sections the 2026-09-23 audit found with no real coverage, plus the four suspected silent failures from that audit. Contract: seed through REST, act through the UI, read back through REST and, where one exists, a second surface. Tripwires (FLIP-WHEN-FIXED) assert the expected behaviour and are paired with a canary over the same path.

## Group editor ("Edit related tests")

### TC-SD-01: The sibling pair is found and "Set all to these values" writes both tests
Canary. **Criterion:** PERSIST.

### TC-SD-02: Group Ranges save keeps each test's specimen scope
FLIP-WHEN-FIXED, SD-G1. A Serum-scoped range on one sibling becomes an all-specimen range after a group save. **Criterion:** PERSIST.

### TC-SD-03: Group Storage tab loads and Save writes every test
Canary. **Criterion:** PERSIST.

### TC-SD-04: Group Storage warns when the tests differ, as group Ranges does
FLIP-WHEN-FIXED, SD-G2. The tab loads only the first test's storage with no warning, and an untouched Save overwrites the others. **Criterion:** FUNCTION (user-visible outcome).

## Methods: Copy from Test

### TC-SD-10: Copying from a test with a method links that method
Canary. **Criterion:** PERSIST.

### TC-SD-11: Copying from a test with no methods must not show a success toast
FLIP-WHEN-FIXED, SD-M1. **Criterion:** FUNCTION (user-visible outcome).

### TC-SD-12: Typing in the Copy methods picker narrows the list to matching tests
FLIP-WHEN-FIXED, SD-M2. The Copy pickers do not filter as you type. **Criterion:** FUNCTION.

## Localization

### TC-SD-20: Saving the English test name persists and shows in Basic Info
Canary. **Criterion:** ROUND-TRIP.

### TC-SD-21: A renamed test shows its new name in the test pickers
FLIP-WHEN-FIXED, SD-L1. `/rest/test-list` stays stale after a Localization save. **Criterion:** CROSS-LINK.

## Display Order

### TC-SD-30: Moving a test up saves its new position
Canary. **Criterion:** PERSIST.

### TC-SD-31: Order entry lists a sample type's tests in the configured display order
FLIP-WHEN-FIXED, SD-D1. **Criterion:** CROSS-LINK.

### TC-SD-32: Display Order opens on the edited test's own sample type
FLIP-WHEN-FIXED, SD-D2. **Criterion:** FUNCTION.

## QC Targets

### TC-SD-40: A LOW target saved in the UI reads back and resolves as the effective target
**Criterion:** ROUND-TRIP (qc-targets and qc-targets/effective).

### TC-SD-41: An active target with no values is refused in the UI and nothing is written
**Criterion:** FUNCTION (negative).

### TC-SD-42: A negative uncertainty is refused with its own message
**Criterion:** FUNCTION (negative).

## Sample & Results: Interpretations

### TC-SD-50: An interpretation added in the editor reads back and reaches results entry
**Criterion:** CROSS-LINK (results-entry interpretations endpoint).

## Panel Editor: member tests

### TC-SD-60: Adding two tests in the UI persists them and each test sees the panel
**Criterion:** ROUND-TRIP (panel test-order and test-side memberships).

### TC-SD-61: Moving a test up reorders it
**Criterion:** PERSIST.

### TC-SD-62: Removing a test drops the membership on both sides
**Criterion:** ROUND-TRIP.

## Reagents

### TC-SD-70: Linking a reagent in the modal persists it and results entry sees it
**Criterion:** CROSS-LINK.

### TC-SD-71: Editing quantity per test persists
**Criterion:** PERSIST.

### TC-SD-72: Unlinking after confirmation removes it
**Criterion:** PERSIST.

## Read-only sections

### TC-SD-80: Analyzers shows exactly what the analyzer mapping endpoint returns
Rows or the empty state. testing had no bound analyzer mapping on 2026-09-23, so the populated case is a declared data gap there. **Criterion:** RENDER with endpoint agreement.

### TC-SD-81: Reflex & Calc lists the rules for the test and links each to its editor
**Criterion:** RENDER with endpoint agreement.

## Import Catalog (CSV)

### TC-SD-90: A one-row tests CSV previews one create, applies it, and the test exists
Holds the OGC-1228 fix. **Criterion:** ROUND-TRIP.

### TC-SD-91: Importing the same row again previews an update, not a second create
**Criterion:** FUNCTION.

## Not encoded

- Terminology Save deletes a mapping whose code was cleared in place, with "Terminology mappings saved." Confirmed in the UI; waiting on a product ruling (open question 6).
