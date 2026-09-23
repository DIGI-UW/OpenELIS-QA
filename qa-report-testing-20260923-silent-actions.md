# QA report: Test Catalog silent actions (testing, 2026-09-23)

## 1. Header

| | |
|---|---|
| Instance | https://testing.openelis-global.org |
| Version | 3.2.2.0 (UI footer); `/actuator/info` returns 404 |
| Build | `develop` head `95d6c64` (OGC-479, 2026-09-22) |
| Target type | Main global release line (develop), default catalog (164 active tests) |
| Flags | `RESULTS_ENTRY_UNIFIED_ROUTE` on (not exercised this run) |
| Tier | Deep run, one module: Test Catalog Editor. Spec-delta plus suite, per `spec-delta-run.md` |
| Substrates | Claude in Chrome (all findings); Playwright harness (encoding, `test-catalog-silent-actions.spec.ts`) |
| Census | Catalog populated: 164 active tests, 16 sample types, panels present. Orders/results not needed for this slice. |
| Calibration | OGC-1114 (top Save), OGC-1122 (inline create panel), OGC-1116 (orderable) not re-tested; they are outside the actions graded here. |

**Trigger.** Casey: on DNA PCR (175), "Copy configuration from another test", pick a source with a select list, Apply: nothing happens. Asked whether QA is missing coverage that lets silent bugs through.

**Authoritative spec.** OGC-949 unified test catalog spec (`specs/OGC-949-unified-test-catalog/spec.md`, US5 scenario 4, US6) and the Done stories that shipped the controls: OGC-930, OGC-967 (Copy from Test for Sample & Results), OGC-956 (Methods default/effective date/copy), OGC-749, OGC-750. No supersession found for the copy ACs.

## 2. Summary

| Module | Controls graded | Pass | Fail | Deferred | Maturity | Top issue |
|---|---|---|---|---|---|---|
| Test Catalog Editor: action controls | 10 | 4 | 6 | 4 | **M1** for the graded actions | Copy configuration reports success and copies nothing (Delta-SA1) |

Maturity is rated at the lowest sub-feature. Copy configuration and Sample Type create do not persist what they claim, so the graded slice sits at M1 ("form-only") despite the section saves elsewhere reaching M2.

**What works and should be preserved.** Sample Type create with a valid name round-trips to the list and editor. New Panel with an unused name creates a panel correctly. Inline Create New Method with a new code creates and links it. The server side of the method duplicate check is correct (409, nothing linked). The HTML-name refusal on Sample Type is correct server behaviour. Every defect below is in how the result is reported to the user, or in one reconciliation rule.

## 3. Delta ledger

All were driven by hand in Chrome as a user would, with a before/after REST read of the affected record and every toast recorded by a MutationObserver.

**Revalidation (corrected 2026-09-23).** An earlier version of this line said each finding reproduced "in a second session after a forced logout/re-login". That was not done and the claim is withdrawn. What was actually done, per finding:

| Delta | Fresh browser tab (UI) | Fresh login (harness `auth.setup` + tripwire) | API repeat | Gate |
|---|---|---|---|---|
| SA1 | yes: 175 from 199, options unchanged, "Configuration copied." x2 | TC-SA-02 expected-fail | 3x | 3 of 3 |
| SA2 | yes: panel 29 active true to false, description overwritten, no toast | TC-SA-11 expected-fail | 3x | 3 of 3 |
| SA3 | yes: 409, nothing linked, green "+ Create New Method" | TC-SA-21 expected-fail | 3x | 3 of 3 |
| SA4 | no (already filed as OGC-1156) | TC-SA-31 expected-fail | n/a | 1 of 3, plus existing ticket |
| SA5 | yes: 200, list count 22 unchanged, "Sample type saved successfully." | TC-SA-32 expected-fail | 3x | 3 of 3 |
| SA6 | yes: panel 29 description set to "Bilan Biochimique", PUT 500, no message, nothing saved | hit during harness seeding (API) | 4x | 2 of 3 |

Casey ruled 2026-09-23 that panel descriptions do not need to be unique, so SA6 is a defect.

### Delta-SA1: Copy configuration from test copies nothing and says "Configuration copied." (High)

- **Spec:** OGC-967 AC: Copy from Test opens a modal with search, preview, and Replace or Append; "After successful copy, the table on the current component refreshes with the copied rows." OGC-949 US5 s4: "the chosen config is copied into the current component."
- **Build:** a combobox and a button, no modal, no preview, no Replace/Append. `POST /rest/test-catalog/tests/{id}/sample-results/copy-from/{src}` answers 200. `TestResultComponentServiceImpl.copyComponentsFromTest` skips any target component whose code already exists with a result type ("A configured component ... is never clobbered"). 162 of 164 active tests have exactly one component, `PRIMARY`, so the copy is a no-op for almost the whole catalog. Components whose code is new on the target are appended.
- **Evidence:**
  - Variant 1: 175 (DNA PCR) from 199 (Innolia). POST 200, toast "Sample & Results / Configuration copied.", 175 options unchanged (Indeterminate, Invalid, Positive, Negative, Valid; source has HIV1, HIV2, HIVD, Negative, Indeterminate, Invalid).
  - Variant 2: 199 from 300 (COVID-19 PCR, components PRIMARY:D, N2:N, E:N). PRIMARY untouched, N2 and E appended. Same toast.
  - The page reloads and scrolls to the top, so the toast is easy to miss. The user's "does absolutely nothing" is accurate for the component they were looking at.
- **Also:** the frontend `if (res)` is always true for this helper (`postToOpenElisServerJsonResponse` passes `{...body,status}` or `{error,status}` on failure), so a 404 or 500 also toasts "Configuration copied." The controller does not check that the source exists, and unlike the Save path it skips `invalidateHealth()` and the dictionary cache refresh.
- **Why tests missed it:** FE unit test (`SampleResultsSection.test.jsx:725-738`) mocks the server and checks only the URL. Backend IT `copySampleResults_copiesComponentsOptionsAndInterpretations` copies onto an empty target, the one case the skip never touches. QA had only a docs screenshot capture.
- **Decision (Casey, 2026-09-23):** Copy replaces the target configuration, behind a confirmation modal warning that the change is irreversible once saved; confirming stages the source config in the editor and Save commits it.
- **Repro:** open `/MasterListsPage/TestCatalogEditor/175/sample-results`, scroll to "Copy configuration from test", pick Innolia, click "Copy from test". Compare the PRIMARY options before and after.

### Delta-SA2: Add Panel with an existing name deactivates and rewrites the existing panel (High, data integrity)

- **Build:** Panel Editor, Add Panel, name `QA_DUP_0923` (an existing active panel, id 29, 1 test, description "QA seeded original"), description typed, Save. `POST /rest/test-catalog/panels` returns 200 with the **existing** panel (create-if-not-exists, added by the OGC-1122 fix). The form then sends `PUT /panels/29/basic-info {name, description, domain, active:false}`. Result: panel 29 `active: true -> false`, description overwritten, editor opens on panel 29. No warning. A deactivated panel leaves order entry.
- **Evidence:** network log POST 200 then PUT 200 on id 29; read-back before/after shown above. API replay 3x: same.
- **Related:** OGC-1122 (Acceptance). The create-if-not-exists change was the fix for the inline "Create new panel" no-op. It fixes that path and breaks this one. OGC-1230 is a separate toast bug on the same control.
- **Repro:** Panel Editor, Add Panel, type the name of any existing active panel, Save, then reopen that panel.

### Delta-SA3: Methods inline create shows success on a 409 (Medium)

- **Build:** on test 199, "+ Create New Method" with code `QAM0923`, already used by a method created on 175. `POST /rest/test/199/methods/inline-create` answers 409 "Method code already exists". The UI closes and clears the form and shows a green toast reading "+ Create New Method". Nothing is linked.
- **Cause:** `MethodsSection.jsx` `if (res)` (lines 98, 140). The same file's Copy from Test callback ignores its argument entirely (line 181), so it can never report a failure. Link Method has the same `if (res)` but filters already-linked methods, so it is hard to reach from the UI.
- **Also:** the success toast text is the button label, not a message.

### Delta-SA4: Sample Type create discards the required Description (Medium, already filed as OGC-1156)

- **Already filed:** [OGC-1156](https://uwdigi.atlassian.net/browse/OGC-1156) (herbert) describes this exact defect. It still reproduces on 3.2.2.0 / 95d6c64. Action: comment on OGC-1156 with this evidence, do not file new.

- **Build:** Sample Type Editor, Add Sample Type, name `QA_ST_0923`, Description "QA description typed on create" (field is marked required). Created as id 141; stored description is `QA_ST_0923`. `SampleTypeManagement.jsx:498-504` builds the create payload without `description`.

### Delta-SA5: Sample Type create reports success when nothing was created (Medium)

- **Build:** name `QA<i>ST</i>0923`. `POST /rest/SampleTypeCreate` answers **200** echoing the form (bean validation `@SafeHtml(NONE)` refused it). The UI shows "Sample type saved successfully." and returns to the list. List count unchanged (16). API 3x: 200, count unchanged each time.
- **Cause:** `SampleTypeCreateRestController.postSampleTypeCreate` returns 200 on validation failure; the UI only rejects on an `error` key or non-200.

### Delta-SA6: Panel Save with a description another panel already uses fails with a 500 and no visible message (Low to Medium)

- **Found while seeding the harness,** not in the original sweep. Panel Editor, open a panel, set Description to a value another panel already carries (e.g. `Bilan Biochimique`), Save. `PUT /rest/test-catalog/panels/{id}/basic-info` answers **500** (empty body). The form keeps the typed value; no toast was captured by the observer and none was visible in the screenshot, although the component codes an `error.panel.save` notification.
- **Evidence:** UI once on panel 38; API 4x across panels 34 and 38 (500 with a duplicate description, 200 with a unique one, independent of member test or body shape).
- **Likely cause (inferred):** a uniqueness constraint on panel description surfacing as an unhandled exception. Whether descriptions should be unique at all is a product question (NEEDS-GUIDANCE row added).
- **On the way:** I first read this as "a partial PUT body 500s for some member tests" and wrote a harness workaround for it. That reading was wrong: the member and body shape were coincidental; the shared description was the cause. Workaround removed; seeds now use per-run descriptions.

### Deferred, not judged

| Candidate | What would settle it |
|---|---|
| Methods Copy from Test: no preview or Replace/Append (OGC-956), response ignored | Casey's ruling on whether append-with-skip is acceptable; then a forced-error UI run |
| Group Ranges save ("Edit related tests") drops `sampleTypeId` | No specimen-scoped ranges exist on testing. Seed one on a sibling group, save the group, read back |
| Group Storage save copies the first test's settings to every test | Seed a group with divergent storage |
| Terminology Save deletes a mapping whose code was cleared in place | Product ruling (NEEDS-GUIDANCE) |

### Withdrawn

None.

## 4. AC scorecard

| AC | Source | Result | Delta |
|---|---|---|---|
| Copy from Test modal with search and preview | OGC-967, OGC-930 | FAIL (not built) | SA1 |
| Choose Replace or Append | OGC-967, OGC-930, OGC-956 | FAIL (not built) | SA1 |
| After copy, table refreshes with the copied rows | OGC-967 | FAIL | SA1 |
| Copy methods from another test | OGC-956 | PARTIAL (append-only, no preview, no error path) | deferred |
| Inline create method, written to master list and linked | OGC-750 | PASS on the happy path; FAIL on user-visible outcome of a refusal | SA3 |
| Sample type create | Sample Type Editor | PASS on the happy path; Description lost; refusal reported as success | SA4, SA5 |
| New panel create | Panel Editor | PASS for a new name; destructive for an existing name | SA2 |

## 5. Failures requiring attention: ticket drafts (NOT filed)

Jira gate 2 (search for existing tickets) run 2026-09-23: no match for SA1, SA3, SA5. SA2 relates to OGC-1122 (Acceptance). **SA4 is already filed as OGC-1156** (found when refreshing the QA tracker; the first keyword search missed it), so Draft 4 becomes a comment, not a ticket. Nothing below has been filed; each needs Casey's per-ticket go-ahead.

**Draft 1.** `[QA Auto] TC-SA-02 failed: Copy configuration from test reports "Configuration copied." and copies nothing when the target is configured`
Type Bug, Priority High, labels `automated-qa`, `test-catalog`. Body: Delta-SA1 above. Asks: implement the OGC-967 modal (preview + Replace/Append), or at minimum report what was and was not copied; check the response status; verify the source exists; add a backend test with a configured target. Links: relates to OGC-967, OGC-930.

**Draft 2 (or a rejection comment on OGC-1122).** `[QA Auto] TC-SA-11 failed: Add Panel with an existing name deactivates the existing panel and overwrites its description`
Type Bug, Priority High, labels `automated-qa`, `test-catalog`, `data-integrity`. Body: Delta-SA2. Asks: the New Panel form must refuse a name that exists (409 from a create-only endpoint, or the form checking the returned id), and never PUT onto a panel it did not create. Links: caused by OGC-1122 fix.

**Draft 3.** `[QA Auto] TC-SA-21 failed: Methods section shows a success toast when the server refuses (409 duplicate code)`
Type Bug, Priority Medium. Body: Delta-SA3, plus the helper contract: `postToOpenElisServerJsonResponse` never returns falsy, so `if (res)` is always true. Asks: check `status` in MethodsSection create, link and copy callbacks; show the server message; a grep for `if (res)` after this helper finds the same pattern elsewhere (Sample & Results copy is Draft 1).

**Draft 4 (comment on OGC-1156, not a new ticket).** "Still present on testing 3.2.2.0 (develop 95d6c64), 2026-09-23. Created QA_ST_0923 through Sample Type Editor > Add with Description 'QA description typed on create'; stored description is 'QA_ST_0923'. Cause: SampleTypeManagement.jsx:498-504 builds the create payload without `description`. Now held by tripwire TC-SA-31 in test-catalog-silent-actions.spec.ts."

**Draft 6 (optional, Low).** `[QA Auto] Panel Editor: saving a description another panel uses returns 500 with no message`. Body: Delta-SA6. Casey ruled descriptions need not be unique: this is a defect.

**Draft 5.** `[QA Auto] TC-SA-32 failed: Sample Type create answers 200 and the UI says "saved successfully" when validation refused the name`
Type Bug, Priority Medium. Body: Delta-SA5. Asks: 400 with field errors from the controller; the UI shows them.

## 6. Gaps, uncovered and uncertain

- **Uncovered (now encoded):** every action above had zero QA cases. `test-catalog-silent-actions.spec.ts` adds 12 (5 FLIP-WHEN-FIXED tripwires, 7 canaries/contracts).
- **Uncovered (not yet encoded):** the four deferred candidates; Reagents link partial failure; Localization save not refreshing test-name caches (inferred).
- **NEEDS-GUIDANCE** (appended to `references/open-questions.md`): Copy semantics (Replace vs append-only); SA2 routing via OGC-1122; Terminology cleared-code behaviour; whether panel descriptions must be unique (SA6).
- **Systemic finding:** see the depth plan doc. Short form: the catalog suite checks statuses and same-endpoint read-backs, never toast-vs-state, and configures anything downstream over REST, so no CI case drives a UI control and checks its effect elsewhere.

## 7. Harness execution

`test-catalog-silent-actions.spec.ts`, run from Casey's Mac against testing, `all-tc.config.ts`, projects `setup` + `test-catalog`, `--retries=0`:

| Run | Result | Notes |
|---|---|---|
| 1 | TC-SA-01 failed at the source picker | Seeded source was inactive, and the Copy combobox lists only active tests. Fixed: the source is now a real active test (read only); only the target is seeded. |
| 2 | 10 passed, TC-SA-10 failed in setup | A new panel answers **201**, not 200 (an existing name answers 200). Fixed, and the distinction is now asserted: it is exactly what the New Panel form could use to refuse a duplicate. |
| 3 to 5 | panel setup 500 | Traced to Delta-SA6 (duplicate panel description). Fixed with per-run descriptions. |
| 6 (panel cases) | 4 passed | TC-SA-10, 12 green; TC-SA-11 expected-fail as designed. |
| 7 (full file) | **13 passed in 6.5m** (setup + 12 cases; the 5 tripwires report as expected failures) | Clean run, no retries |

All seven gates pass locally: typecheck, lint:assert, lint:falsifiable (5 new tripwires, no file worse), check:dupe-ids, check:catalogue-index (8 catalogues, 1675 cases), check:ci-coverage; the new spec is collected by `all-tc.config.ts` (12 cases listed), so `check:orphans` is satisfied for it.

## 8. Machine-readable summary

```json
{
  "target": {"type": "release", "project": "global", "version": "3.2.2.0", "build": "develop 95d6c64", "url": "https://testing.openelis-global.org"},
  "tier": "deep-module",
  "date": "2026-09-23T08:00Z",
  "modules": [{"name": "Test Catalog Editor (action controls)", "maturity": "M1", "pass": 4, "fail": 6, "blocked": 0, "gap": 0, "deferred": 4}],
  "chains": [],
  "yrecon": [],
  "new_failures": 5, "uncovered": 9, "needs_guidance": 3,
  "coverage": {"total_tcs": 12, "executed": 12, "deep": 12, "shallow": 0, "mixed": 0, "needs_update": 0, "gap_areas": 1}
}
```

## 9. Appendix: data created on testing (QA-prefixed, inactive unless noted)

| Record | Notes |
|---|---|
| Panel 29 `QA_DUP_0923` (1 member: test 175) | Restored to active, description "QA seeded original" after the replay |
| Method 52 `QA Method 0923` / `QAM0923` linked to test 175 | Left in place |
| Sample type 141 `QA_ST_0923` | Inactive |
| Components N2, E appended to tests 199 and 175 by the copy variants | Removed (Sample & Results PUT with PRIMARY only); both tests read back as before |
| Harness runs create `QA_SA*` / `QASA*` tests, panels, methods, sample types per run | Tests and sample types inactive. Seeded panels are left active by afterAll (restored state); debugging panels 32 to 34 deactivated; 31, 35, 38 inactive |
