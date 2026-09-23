# QA report: Test Catalog section depth (testing, 2026-09-23)

## 1. Header

| | |
|---|---|
| Instance | https://testing.openelis-global.org |
| Version | 3.2.2.0 (UI footer) |
| Build | `develop` head `95d6c64` |
| Tier | Deep run, one module: Test Catalog Editor, second pass after `qa-report-testing-20260923-silent-actions.md` |
| Substrates | Claude in Chrome (findings); Playwright harness (encoding, `test-catalog-section-depth.spec.ts`, 26 cases) |
| Census | 164+ active tests, 16+ sample types, panels, methods, one inventory reagent family. No analyzer is mapped to any test on testing (TC-SD-80 data gap). |

**Trigger.** Casey asked whether the Test Catalog suite is reliably complete. The answer was no. He said to do both: confirm and encode the four suspected silent failures from the silent-actions audit, and give every editor section with no real coverage a deep case.

**Contract.** Every case seeds through REST, acts through the UI, and reads back through REST plus a second surface where one exists (results entry, order entry, the test-side view of a panel). Each FLIP-WHEN-FIXED tripwire is paired with a canary over the same path, so a broken selector cannot pass as a still-present defect.

## 2. Summary

| Section | Cases | Result | Maturity (graded path) |
|---|---|---|---|
| Group editor (Edit related tests) | SD-01..04 | canaries pass; 2 defects (G1, G2) | M1: saves, but loses or overwrites data silently |
| Methods: Copy from Test | SD-10..12 | canary passes; 2 defects (M1, M2) | M2 |
| Localization | SD-20..21 | canary passes; 1 defect (L1) | M2 |
| Display Order | SD-30..32 | canary passes; 2 defects (D1, D2) | M1: saves, but nothing downstream uses it |
| QC Targets | SD-40..42 | pass | M3 for save and validation; see lead Q2 |
| Interpretations | SD-50 | pass | M3; see lead I1 |
| Panel member tests | SD-60..62 | pass | M3 |
| Reagents | SD-70..72 | pass | M3 |
| Analyzers, Reflex & Calc (read-only) | SD-80..81 | pass | RENDER with endpoint agreement |
| Import Catalog (CSV) | SD-90..91 | pass | M3 (holds the OGC-1228 fix) |

**What works and should be preserved.** QC Targets save, validation and effective-target resolution. Interpretations reach the results-entry endpoint. Panel membership stays consistent on both sides for add, reorder and remove. Reagent link, quantity edit and confirmed unlink persist and reach results entry. The CSV import previews one create, applies it, and previews an update on re-import.

## 3. Delta ledger

All deltas were driven by hand in Chrome with before/after REST reads and a toast recorder, then encoded as tripwires. Revalidation, per finding (the 2-of-3 gate). "REST read" is the before/after read around the UI action, not an independent repeat, so it is not counted toward the gate:

| Delta | Chrome UI (fresh tab) | Harness (fresh login, tripwire) | REST read | Gate |
|---|---|---|---|---|
| G1 | yes | TC-SD-02 expected-fail | before/after | 2 of 3 (UI + harness) |
| G2 | yes: A went from Frozen + protect from light to Refrigerated | TC-SD-04 expected-fail | before/after | 2 of 3 (UI + harness) |
| M1 | yes: nothing copied, green toast | TC-SD-11 expected-fail | before/after | 2 of 3 (UI + harness) |
| M2 | yes: typed "QA Sib", 179 options listed | TC-SD-12 expected-fail | n/a (UI only) | 2 of 3 (UI + harness) |
| L1 | yes: the Copy picker kept the old name | TC-SD-21 expected-fail | `/rest/test-list` stale | 2 of 3 (UI + harness) |
| D1 | yes: a test saved at position 26 of 41 was still listed first in order entry | TC-SD-31 expected-fail | before/after | 2 of 3 (UI + harness) |
| D2 | yes: the section opened on Fluid for a Serum test | TC-SD-32 expected-fail | n/a (UI only) | 2 of 3 (UI + harness) |

### Delta SD-G1: group Ranges save drops each test's specimen scope (High)
- **Build:** `CombinedTestEditor` builds the ranges payload without `sampleTypeId`, and its `RangeModal` gets no sample types. After "Set all to these values", a Serum-scoped range on one sibling becomes a range for every specimen type. The toast says the save succeeded.
- **Why it matters:** a normal range meant for one specimen type now applies to all of them, which can mis-flag results on other specimens.
- **Repro:** give test A a Serum-scoped numeric range, and give its sibling B the same range unscoped. Open `/MasterListsPage/TestCatalogEditor/group/B,A/ranges`, then click "Set all to these values" and Save. Read `GET /rest/test-catalog/tests/A/ranges`: `sampleTypeId` is gone.

### Delta SD-G2: group Storage loads only the first test and overwrites the others silently (High)
- **Build:** the group Storage tab reads only the first test's storage. Group Ranges shows a warning when siblings differ; this tab shows none. Saving without touching anything writes the first test's storage onto every sibling.
- **Evidence:** A was Frozen with protect-from-light, and B was Refrigerated. An untouched group Save left both Refrigerated with light protection off. No warning was shown.
- **Expected:** the same "values differ" warning group Ranges shows, and no write for fields the user did not change.

### Delta SD-M1: Methods "Copy from Test" reports success when nothing was copied (Medium)
- **Build:** `handleCopyFromTest` ignores the response and always shows a green toast, titled with the button label "Copy from Test". This has the same shape as silent-actions SA1 and SA3 (`if (res)` or no check at all).
- **Evidence:** copying from an active test with no methods added nothing, and the green toast still appeared.
- **Expected:** report what was copied ("2 methods linked"), or say that nothing was copied.

### Delta SD-M2: the Copy pickers do not filter as you type (Low, usability)
- **Build:** the Methods and Sample & Results Copy comboboxes set no `shouldFilterItem`. Typing leaves all ~180 active tests in the menu, so the admin has to scroll.
- **Withdrawn:** an earlier reading of "0 options after typing" was a tool artefact.

### Delta SD-L1: renaming a test in Localization leaves the test pickers stale (Medium)
- **Build:** Localization saves `PUT /rest/localizations/{id}/translations` and does not refresh the cached test-name list behind `/rest/test-list`. Basic Info save does refresh it. The stale list feeds the Copy pickers, Results search, Reports by date, and notification configuration.
- **Re-measured 2026-09-23 in Chrome:** 69 s after a Localization save on test 414, Basic Info had the new name, but `/rest/test-list` still had the old one. The list does catch up later, when something else refreshes the whole cache (for example any Basic Info save), so the tripwire can flip spuriously on a busy instance.
- **Withdrawn:** order entry was first reported stale, but it caught up and is not affected.

### Delta SD-D1: order entry ignores Display Order (High)
- **Build:** order entry sorts by `test.sortOrder`, not `sampletype_test.display_order`. The Display Order section saves correctly (TC-SD-30) but has no visible effect anywhere a user orders tests.

### Delta SD-D2: Display Order ignores the test being edited (Low)
- **Build:** the section ignores `testId` and opens on the first sample type in the list (Fluid on testing). An admin who came from a Serum test does not see that test.

### Needs a ruling (not encoded)
- **Terminology: a code cleared in place deletes the mapping**, with the toast "Terminology mappings saved." Confirmed in the UI. Either (a) clearing means remove, which is intended, or (b) an incomplete row should be refused. Open question 6.

### Leads from code reading (not UI-confirmed, not bugs yet)
- **Q1, QC Targets:** a deactivated row with blank values answers 422 with a mismatch message.
- **Q2, QC Targets:** nothing consumes `/qc-targets/effective`, although the helper text promises a Results Entry prefill.
- **I1, Interpretations:** there is no colour field, although OGC-967 specifies labels plus colours, and blank interpretation rows persist.
- **R1, Reagents:** if one link in a batch fails, the list is left stale.

## 4. Withdrawn during this run
- "Typeahead returns 0 options": a tool artefact. Corrected to "does not filter" (SD-M2).
- PUT 503s seen in the Chrome network recorder: that tab's extension recorder misreports statuses; the harness saw 200s.
- Order entry showing a stale test name: the endpoint caught up. Only `/rest/test-list` stays stale (SD-L1).

## 5. Harness notes
- New shared helper `helpers/catalogUi.ts`: a toast recorder, a Carbon ComboBox picker, REST seeding for a numeric test, and range and storage readers.
- **Concurrent runs sign each other out.** Three other Playwright runs (analyzer-m3, docs drift, a walk suite) ran against testing at the same time as this one, and all of them share `.auth/user.json`. Partway through this run, the page began landing on the login form. That turned six cases into login-page timeouts. A Chrome session stayed signed in throughout, so the likely cause is the shared state file being rewritten or invalidated, not "one login ends all others". `catalogUi.open()` now detects the login form, logs in again once through the harness's single login path (`performUiLogin`), and retries. Serialize runs against one instance, or give each run its own `AUTH_STATE_FILE`.
- **Relative fetch before navigation.** `apiGet` issues a relative fetch, which fails on `about:blank`. Four cases (TC-SD-11, 21, 71, 72) read REST before opening a page. For a FLIP-WHEN-FIXED case this is dangerous, because the TypeError satisfies `test.fail` and the tripwire looks green for the wrong reason. Fixed by opening the page first. Section 6 lists the recorded failure reason of every tripwire, so the expected failure is shown to be the spec assertion.
- **Transient basic-info 500 (lead, harness-only).** Twice, the first `GET basic-info` right after a Localization save answered 500 inside the harness. The same flow in Chrome answered 200 every time: 12 polls at 250 ms on test 414, and 11 on a first-ever save on test 445. It is not UI-confirmed, so it is not a bug. TC-SD-20 now polls and records any non-200 as an annotation.

## 6. Run results
Final full run, 2026-09-23, testing 3.2.2.0: **27 passed in 14.0 min** (setup + 26 cases), `--retries=0`. The expected-fail status of each tripwire was read from the JSON reporter. Each one fails on its own spec assertion, not on a harness error:

| Case | Expected | Recorded failure |
|---|---|---|
| TC-SD-02 | fail | a group save must not silently widen a Serum-only range to every specimen |
| TC-SD-04 | fail | the storage tab must say the selected tests differ before a Save overwrites them |
| TC-SD-11 | fail | a copy that copied nothing must not report success |
| TC-SD-12 | fail | every option left after typing must match what was typed |
| TC-SD-21 | fail | the picker must list the renamed test |
| TC-SD-31 | fail | order entry must follow the Display Order configured for Serum |
| TC-SD-32 | fail | preselect the test's sample type (Serum) |

All 19 canary and coverage cases passed. Earlier runs, kept for the record: run 1 had 16 passed and 10 failed (selectors and seeding, all fixed). Run 2 lost 6 cases to the sign-out described above. In run 4, TC-SD-11 recorded a `Failed to parse URL` TypeError as its "expected failure". That is exactly the false green this check exists to catch, and it is fixed.

## 7. Ticket drafts (NOT filed; waiting for Casey)
Proposed as one bug, following the OGC-1234 pattern: "Test Catalog: section saves that lose data or report success falsely (group editor, Methods copy, Localization, Display Order)". It covers G1, G2, M1, L1, D1, and D2. M2 is a separate small improvement. Each item carries the repro above and its tripwire ID, so the dev can flip `test.fail` as the proof.
