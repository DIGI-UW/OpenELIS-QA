# OpenELIS Test Catalog — Test Cases

These test cases cover the full Test Catalog module in OpenELIS Global.
Each case includes navigation path, preconditions, steps, and success criteria.

The Carbon for React UI is used throughout. Expect Carbon components:
`TextInput`, `Select`, `Toggle`, `DataTable`, `Button`, `Modal`, `Notification`.

---

## TC-01 — Create a New Test

**Section:** Test Management
**Severity:** High (core CRUD — if this fails, the catalog is broken)

### Navigation
Admin menu → Test Management → Add Test
(URL path is typically `/MasterListsPage` or similar — navigate via the UI menu)

### Preconditions
- Logged in as admin
- No existing test with prefix `QA_AUTO_`

### Steps
1. Navigate to the Admin menu (top navigation bar or hamburger menu)
2. Find and click **Test Management** or **Test Catalog** (may be under "Administration")
3. Click **Add Test** button
4. Fill in the following fields:
   - **Test Name:** `QA_AUTO_Create Test`
   - **Description:** `Automated QA test entry`
   - **Test Section / Department:** Select any available section from the dropdown
   - **Sample Type:** Select any available sample type (e.g., `Serum`, `Blood`)
   - **Result Type:** Select `Numeric` or `Alpha` — whichever is available
   - **Units:** (if numeric) enter `mg/dL`
   - **Active:** Toggle to ON/Active
5. Click **Save** or **Submit**
6. Take a screenshot of the confirmation state

### Success Criteria
- No error notification appears
- The test `QA_AUTO_Create Test` appears in the test list/table
- A success toast or confirmation message is shown

### What to Store
- Store the test name `QA_AUTO_Create Test` for use in TC-02, TC-03, TC-04

---

## TC-02 — Search / Filter for a Test

**Section:** Test Management
**Severity:** Medium (search is essential for labs with large catalogs)

### Navigation
Admin → Test Management (the main list view)

### Preconditions
- TC-01 completed successfully (the test `QA_AUTO_Create Test` exists)

### Steps
1. Navigate to the Test Management list page
2. Locate the **search bar** or **filter input** at the top of the test table
3. Type `QA_AUTO` into the search field
4. Wait for the table to filter
5. Take a screenshot of the filtered results

### Success Criteria
- The table shows at least one result containing `QA_AUTO_Create Test`
- No unrelated tests dominate the results
- The search responds without a page error

### Bonus Check (if time permits)
- Clear the search and verify the full list returns
- Search for a non-existent string like `ZZZNOMATCH999` and verify the table shows an empty state

---

## TC-03 — Edit an Existing Test

**Section:** Test Management
**Severity:** High (editing test properties is a routine lab admin task)

### Navigation
Admin → Test Management → find `QA_AUTO_Create Test` → Edit

### Preconditions
- TC-01 completed — `QA_AUTO_Create Test` exists in the catalog

### Steps
1. Navigate to the Test Management list
2. Find `QA_AUTO_Create Test` (use search from TC-02 if needed)
3. Click the **Edit** button or row action for that test
4. Modify the following field:
   - **Description:** Change to `Automated QA test entry — EDITED`
5. Click **Save** or **Update**
6. Navigate back to the test list and re-open the test (or stay on the edit page if it refreshes)
7. Take a screenshot confirming the updated description

### Success Criteria
- No error notification appears
- The test record now shows `Automated QA test entry — EDITED` in the description field
- A success toast or confirmation message is shown

---

## TC-04 — Deactivate a Test

**Section:** Test Management
**Severity:** High (deactivation controls which tests are orderable)

### Navigation
Admin → Test Management → find `QA_AUTO_Create Test` → Edit or toggle

### Preconditions
- TC-01 completed — `QA_AUTO_Create Test` exists and is Active

### Steps
1. Navigate to the Test Management list
2. Find `QA_AUTO_Create Test`
3. Either:
   - Click the **Active/Inactive toggle** directly in the table row, OR
   - Click **Edit** and toggle the **Active** field to OFF/Inactive
4. Click **Save** if required
5. Take a screenshot of the updated state
6. Verify the test now shows as **Inactive** in the list (may have a different visual indicator
   such as grayed out, a badge, or a status column)

### Success Criteria
- The test status changes to Inactive without an error
- The test still appears in the list (it should not be deleted, just deactivated)
- A success message is shown if applicable

---

## TC-05 — Add a Test Panel

**Section:** Test Configuration (Panels)
**Severity:** Medium (panels group tests for ordering efficiency)

### Navigation
Admin → Test Management → Test Panels (or Panels section)
(May also be under: Admin → Configuration → Test Panels)

### Preconditions
- Logged in as admin
- At least one active test exists (can use `QA_AUTO_Create Test` if TC-01 passed)

### Steps
1. Navigate to the **Test Panels** management section
2. Click **Add Panel** or **New Panel**
3. Fill in:
   - **Panel Name:** `QA_AUTO_Panel`
   - **Description:** `Automated QA panel`
4. Add at least one test to the panel:
   - Look for an "Add Tests" section or a test picker
   - Select any available test from the list (e.g., `QA_AUTO_Create Test` or any existing test)
5. Click **Save**
6. Take a screenshot of the saved panel

### Success Criteria
- Panel `QA_AUTO_Panel` appears in the panels list
- The associated test is shown on the panel detail view
- No error notification

---

## TC-06 — Configure Result Type and Normal Ranges

**Section:** Test Configuration (Result Configuration)
**Severity:** High (incorrect normal ranges lead to wrong clinical flags)

### Navigation
Admin → Test Management → find a test → Edit → Result configuration section

### Preconditions
- Logged in as admin
- A test exists with a numeric result type (use `QA_AUTO_Create Test` if it was created
  with `Numeric` result type; otherwise find any numeric test)

### Steps
1. Open a numeric test in Edit mode (use `QA_AUTO_Create Test` or another numeric test)
2. Find the **Normal Range** or **Reference Range** section
3. Fill in:
   - **Low Normal:** `5`
   - **High Normal:** `100`
   - **Units:** `mg/dL` (if not already set)
4. If there is a **Critical Low** / **Critical High** field, fill in:
   - **Critical Low:** `2`
   - **Critical High:** `150`
5. Click **Save**
6. Take a screenshot of the saved configuration
7. Re-open the test to verify the values persisted

### Success Criteria
- Normal range values save without error
- Re-opening the test shows the same values (persistence check)
- No validation errors for valid numeric inputs

---

## TC-07 — Add / Verify Sample Type on a Test

**Section:** Sample Types
**Severity:** High (wrong sample types prevent correct order routing)

### Navigation
Admin → Test Management → find `QA_AUTO_Create Test` → Edit → Sample Types section
OR Admin → Sample Types (standalone management page)

### Preconditions
- TC-01 completed — `QA_AUTO_Create Test` exists
- At least one sample type is configured in the system (e.g., `Serum`, `Whole Blood`)

### Steps
1. Open `QA_AUTO_Create Test` in Edit mode
2. Find the **Sample Type(s)** section or tab
3. If a sample type is already assigned, verify it is correct and proceed to step 5
4. If no sample type is assigned:
   - Click **Add Sample Type** or use the sample type selector
   - Choose an available type (e.g., `Serum`)
   - Click **Add** or **Save**
5. Take a screenshot showing the assigned sample type
6. Verify the sample type appears in the test's detail/edit view

### Success Criteria
- The test has at least one sample type associated
- No error notification when saving
- The sample type is visible in the test configuration

---

---

## TC-08 — Reactivate Test (Order Workflow Prerequisite)

**Section:** Add/Order Workflow
**Severity:** High (a test must be Active to be orderable — this validates the active/inactive gate)

### Navigation
Admin → Test Management → find `QA_AUTO_Create Test` → Edit or toggle

### Preconditions
- TC-04 completed — `QA_AUTO_Create Test` is currently Inactive

### Steps
1. Navigate to Test Management
2. Find `QA_AUTO_Create Test` (it should show as Inactive from TC-04)
3. Either:
   - Click the **Active/Inactive toggle** directly in the table row, OR
   - Click **Edit** and toggle the **Active** field back to ON/Active
4. Click **Save** if required
5. Take a screenshot confirming the test is now Active

### Success Criteria
- `QA_AUTO_Create Test` shows as **Active** in the list
- No error notification

### What to Store
- Confirm active status for use in TC-09 and TC-10

---

## TC-09 — Add Sample and Place Order (including Test Selection)

**Section:** Add/Order Workflow
**Severity:** Critical — adding a sample and selecting tests is a single workflow in OpenELIS.
If a catalog test doesn't surface here, it cannot be used clinically regardless of how it's
configured in the admin section.

### Navigation
Order → Add Order (or Sample → Add Sample)
(Look for "Add Order", "New Order", or "Add Sample" in the main navigation)

### Preconditions
- TC-08 completed — `QA_AUTO_Create Test` is Active
- At least one patient exists in the system (use any existing patient — don't create one)

### Steps
1. Navigate to the **Add Order** / **Add Sample** page
2. Fill in required patient/order fields:
   - Search for and select an existing patient (type a common name or select the first result)
   - **Requester / Requested By:** use any available provider
   - **Priority:** Routine (or the default)
   - **Order Date:** today's date
3. Proceed to the **Test Selection** section (part of the same Add Sample form)
4. In the test search/typeahead field, type `QA_AUTO`
5. Take a screenshot of the search results before selecting
6. Verify `QA_AUTO_Create Test` appears and is selectable (not grayed out)
7. Select `QA_AUTO_Create Test`
8. Also search for and add `QA_AUTO_Panel` if panels appear in the same test picker
9. Click **Submit** or **Save** to complete the order
10. Take a screenshot of the order confirmation / accession number screen

### Success Criteria
- `QA_AUTO_Create Test` appears in the test picker when searching `QA_AUTO`
- It is selectable (not grayed out or disabled)
- The order submits without error
- An accession number or order ID is generated and displayed
- `QA_AUTO_Create Test` appears in the order confirmation summary

### If the test does NOT appear in the picker
- Mark as `FAIL` — note the exact search behavior and screenshot the empty results
- This indicates the active flag isn't being respected in order entry, or the test
  wasn't properly saved to the catalog

### What to Store
- Accession number / order ID for TC-10 and TC-11

---

## TC-10 — Verify Order Appears in Worklist / Sample Queue

**Section:** Add/Order Workflow
**Severity:** High — confirms the order flows correctly into the lab processing queue

### Navigation
Worklist → By Test, OR Results Entry → search by accession
(Look for "Results Entry", "Worklist", or "Sample Queue" in the navigation)

### Preconditions
- TC-09 completed — an order exists with `QA_AUTO_Create Test` and the accession number is known

### Steps
1. Navigate to the **Worklist** or **Results Entry** section
2. Search or filter by:
   - The accession number from TC-09, OR
   - Test name `QA_AUTO` in any available test/worklist filter
3. Take a screenshot of the worklist entry
4. Verify the sample/order row shows `QA_AUTO_Create Test` listed as a pending test

### Success Criteria
- The order appears in the worklist with a pending/in-progress status
- `QA_AUTO_Create Test` is listed as a test to result on this sample
- The accession number matches the one from TC-09
- No error or "not found" message

### Bonus Check (if time permits)
- Navigate to **Worklist by Panel** and verify `QA_AUTO_Panel` appears if it was ordered in TC-09

---

## TC-11 — Enter a Result and Verify Normal Range Flag

**Section:** Add/Order Workflow — Results Entry
**Severity:** Critical — this is the full end-to-end proof: catalog config (normal ranges set
in TC-06) must correctly flag results at the point of result entry. This is a patient safety check.

### Navigation
Results Entry → search by accession number from TC-09
(Or navigate from the worklist row found in TC-10 → click to enter results)

### Preconditions
- TC-10 completed — the order is visible in the worklist
- TC-06 completed — normal range set to Low=5, High=100 for `QA_AUTO_Create Test`
- The accession number from TC-09 is known

### Steps

**Sub-test A — Normal result (should show no flag)**
1. Navigate to Results Entry and open the order by accession number
2. Find the result entry field for `QA_AUTO_Create Test`
3. Enter the value `42` (within the normal range of 5–100)
4. Take a screenshot before saving
5. Save the result
6. Verify no abnormal flag (H/L/critical) appears next to the result
7. Take a screenshot of the saved result

**Sub-test B — High result (should show H flag)**
1. Modify or add a second result entry (or create a new order if the UI doesn't allow editing)
2. Enter the value `120` (above the High Normal of 100)
3. Save the result
4. Verify an **H** (High) flag or equivalent indicator appears next to the result
5. Take a screenshot confirming the flag

**Sub-test C — Low result (should show L flag)**
1. Enter the value `2` (below the Low Normal of 5; also below Critical Low of 2 set in TC-06)
2. Save the result
3. Verify an **L** or **Critical Low** flag appears
4. Take a screenshot confirming the flag

### Success Criteria
- Value `42`: saves without a flag (or with a "Normal" indicator)
- Value `120`: saves with an **H** (High) flag visible
- Value `2`: saves with an **L** or **Critical** flag visible
- No system error during any result entry
- All three screenshots are captured

### If flags do not appear
- This is a `FAIL` — it means the normal ranges configured in TC-06 are not being applied
  at result entry. Note which sub-tests failed and what was observed.

---

## Cleanup

After all test cases complete, perform the following cleanup steps:

1. **Cancel / void the QA order** (if the UI supports it):
   - Navigate to the order placed in TC-09 using the accession number
   - Cancel or void the order to remove it from the worklist
2. **Navigate to Test Management**, search for `QA_AUTO`
3. For each `QA_AUTO_*` test item:
   - Deactivate if still active (or delete if the UI supports deletion)
4. **Navigate to Test Panels**, find and delete/deactivate `QA_AUTO_Panel`

Log all cleanup actions. If any cleanup fails, note it but do not count as a test failure.

---

# PR #3987 regression block — TC-12 … TC-26

Added 2026-08-06 after live verification of **DIGI-UW/OpenELIS-Global-2#3987**
(merged 2026-08-05), a fifteen-item defect PR. Executed against
testing.openelis-global.org v3.2.1.11; per-item results are in the run report and
`references/validation-history.md`.

**Automation:** every case below is encoded in the Playwright suite —
`pr3987.config.ts` with projects `pr3987-catalog`, `pr3987-patient`, `pr3987-fhir`.
Prefer running the suite; the manual steps here are for exploratory re-checks and
for instances where the harness can't run.

**Build gate (do this first — TC-12).** Several of these items are invisible
rather than broken when absent: a pre-#3987 build answers the same endpoints with
the *old* semantics and a careless run reports PASS. Confirm the merge is present
before grading anything else.

**Fixture rule.** Do NOT reuse the ids from the PR description (322, 442, patient
114). They were dev/QA artefacts. Discover fixtures per instance — §0.6.

---

## TC-12 — Build gate: `?id=` is honoured (PR #3987 present)

**Section:** Reflex / Calculated Value · **Severity:** Blocker for this block
**Acceptance criterion:** `FUNCTION`

1. `GET /api/OpenELIS-Global/rest/reflexrules` → note the row count *N*.
2. `GET …/reflexrules?id=999999` (an id that cannot exist).
3. `GET …/reflexrules?id=` (blank).

**Success:** step 2 returns `[]`; step 3 returns all *N*.
**If step 2 returns *N* rows the build predates #3987** — stop, report
"build lacks the merge", and grade nothing else in this block.

---

## TC-13 — Reflex/Calculation `?id=` filter, both endpoints

**Section:** Reflex / Calculated Value · **Severity:** Medium
**Acceptance criterion:** `FUNCTION`

For each of `/reflexrules` and `/test-calculations`:

1. Unfiltered → *N* rows; take the first row's `id`.
2. `?id=<that id>` → exactly 1 row, matching id.
3. `?id=0<that id>` (zero-padded) → `[]`.
4. `?id=999999` → `[]`; `?id=` → *N* rows.

**Why step 3 matters:** the param binds as `String` and is compared to an
`Integer` id via `id.equals(String.valueOf(...))`. A zero-padded value must NOT
match — this is the bug the PR caught mid-change.

**UI half:** in the Test Catalog editor's Reflex/Calc section, a reflex row links
to `/MasterListsPage/reflex?id=<OWNING RULE id>` — the `reflex_rule` id, not the
`test_reflex` row id. A legacy row that no rule owns links to the unfiltered
`/MasterListsPage/reflex`. Calculated rows link to
`/MasterListsPage/calculatedValue?id=<calculation id>`.

---

## TC-14 — Editor names every specimen; list keeps "+n"

**Section:** Test Catalog editor · **Severity:** Medium
**Acceptance criterion:** `ROUND-TRIP` (two surfaces must disagree in the right way)

1. In the catalog list, find a test whose name carries `+n`, e.g.
   `Anti-CD 3(Immunohistochemistry specimen +2)`. Note it.
2. `GET /rest/test-catalog/tests/{testId}` → read `name`.

**Success:**
- The **list** row still shows the `+n` abbreviation (this half must NOT change).
- The **editor** `name` spells out every specimen, comma-separated, e.g.
  `Anti-CD 3(Immunohistochemistry specimen, Tissue antemortem, Tissue post mortem)`.
- The editor name never matches `/\+\d+\)/`, the specimen count equals `n+1`, and
  the base name before the paren is identical on both surfaces.
- **No space before the paren** — the format is `<name>(<specimens>)`.

---

## TC-15 — "No LOINC" clears for a mapping in ANY scope

**Section:** Test Catalog terminology · **Severity:** High (a false "No LOINC"
warning on a test that *has* a LOINC code drives wrong remediation)
**Acceptance criterion:** `ROUND-TRIP`

**Preconditions:** an ACTIVE + ORDERABLE test with a blank `test.loinc` column and
zero terminology mappings, so `noLoinc` starts `true`.

Read the flag from **two** surfaces after each write —
`GET …/tests/{id}/loinc-integrity` → `noLoinc`, and the catalog list row →
`hasLoinc`:

| Write (`PUT …/tests/{id}/terminology`) | `noLoinc` | `hasLoinc` |
|---|---|---|
| baseline, no mappings | `true` | `false` |
| SNOMED `119364003` only | `true` | `false` |
| LOINC, whole-test (no `sampleTypeId`) | **`false`** | **`true`** |
| LOINC, specimen-scoped (`sampleTypeId` set) | **`false`** | **`true`** |
| LOINC with `is_active='N'` | `true` | `false` |

**Cleanup:** restore `mappings: []` and re-assert the baseline row.

---

## TC-16 — Range coverage: gaps judged against group + shared ranges

**Section:** Test Catalog ranges · **Severity:** High (a false "Fully Covered"
means results in the uncovered band get no reference range at all)
**Acceptance criterion:** `ROUND-TRIP`

**Preconditions:** a test with ZERO ranges (coverage `EMPTY`), with ≥1 sample type.

Write via `PUT /rest/test-catalog/tests/{id}/ranges` and read `coverage.male`:

| # | Ranges written | Expected |
|---|---|---|
| a | male, `sampleTypeId` set, 0–30, **no** shared range | `status:"GAP"`, 1 gap, `fromAge:30`, `toAge:"Infinity"` |
| b | shared open-ended 0–∞ **+** the 0–30 specimen override | `status:"COMPLETE"`, no gaps, **no overlaps** |
| c | two overrides in ONE specimen scope: 0–20 and 10–∞ | `status:"OVERLAP"`, `overlaps:[{10,20}]`, no gaps |

**Three traps that produce false results — encode all three:**
1. **`toAge` is the JSON string `"Infinity"`,** not a number. `=== Infinity` fails.
2. **Open-ended means OMITTING `maxAge`** (send `null`). `maxAge: 999` is a finite
   bound and legitimately leaves a `[999, Infinity)` tail gap — which looks like a
   coverage bug but isn't. Case (b) and (c) both need a genuinely open upper bound.
3. **`GAP` outranks `OVERLAP`** in `statusFor()`. If a fixture has both, status
   reads `GAP`, so case (c) needs the widest range open-ended or the assertion
   silently tests the wrong thing.

Also: `componentId`/`sampleTypeId` are **omitted** from the response when null —
assert `undefined`, not `null`.

**Cleanup:** `PUT` `{ranges: []}` and confirm coverage returns to `EMPTY`.

**Note:** the coverage 409 on `POST …/activate` cannot be reached on a test with no
primary result component — the *completeness* gate answers `422
NO_PRIMARY_RESULT_TYPE` first (that's OGC-1142's hard gate, working as designed).
To exercise the soft coverage gate the fixture needs a complete test.

---

## TC-17 — `basic-info` cannot activate an inactive test (409)

**Section:** Test Catalog editor · **Severity:** High (a caller was told an
activation saved when it never happened)
**Acceptance criterion:** `PERSIST`

**Preconditions:** an INACTIVE test **that already has sample types** — otherwise
the `422` validation (empty sample-type set on an active-or-orderable test) fires
first and masks the 409 you're testing.

| Test state | Body | Expected |
|---|---|---|
| inactive | `{...basicInfo, active:true}` | **409**, empty body, flag still inactive |
| inactive | `{...basicInfo, active:false}` | 200 |
| inactive | `active` key absent | 200 |
| **already active** | `{...basicInfo, active:true, description:"<marker>"}` | **200** and the description **persists** |

Re-read `GET …/tests/{id}/basic-info` after each write. The legitimate activation
path is unchanged: `POST …/tests/{id}/activate`.

**Cleanup:** restore the original description.

---

## TC-18 — Results Entry and Validation show the SAME reference range

**Section:** Results / Validation · **Severity:** Critical — patient safety. Two
clinicians reading two different "normal" ranges for one result.
**Acceptance criterion:** `CROSS-LINK`

1. Find an accession awaiting validation:
   `GET /rest/AccessionValidation?unitType=<sectionId>&doRange=true`.
2. `GET /rest/LogbookResults?labNumber=<accession>`.
3. Join the two by `analysisId` and diff.

**Success:** for every analysis on both screens, `normalRange` is **byte-identical**
and `testName` matches. Both are built by
`getDisplayReferenceRange(limit, significantDigits, " - ")`, so a difference in
significant digits (`30.00 - 50.00` vs `30.0 - 50.0`) is a FAIL, not cosmetic.

**Assert something was actually compared.** If no `analysisId` appears on both
screens the test must FAIL as inconclusive, not pass vacuously.

**Fixture strength matters.** A single-component test with an unbanded range
exercises the easy path. The bug was that Validation took the test-level limit and
never resolved the patient — so it only bites on an **age- or sex-banded** range,
or a **multi-component** test. Grade a run on an unbanded fixture as PARTIAL.

---

## TC-19 — Analysis row names its OWN specimen (no "+n")

**Section:** Results / Validation · **Severity:** High
**Acceptance criterion:** `CROSS-LINK`

**Preconditions:** the same test ordered on **two** specimens on one accession —
put one `<sample sampleID='..' tests='..'/>` per specimen in the
`POST /rest/SamplePatientEntry` `sampleXML`.

**Success:** `GET /rest/LogbookResults?labNumber=<accession>` returns two rows whose
`testName` values **differ**, each ending `(<its own specimen>)` — e.g.
`Albumin(DBS)` and `Albumin(Urines)`. Neither may match `/\+\d+\)/`.
Format is `<name>(<specimen>)` with **no space** before the paren.

A single-specimen instance cannot distinguish fixed from broken here — both read
`Name(Specimen)`. The two-specimen order is the whole test.

---

## TC-20 — Sample Type terminology reaches FHIR `Specimen.type`

**Section:** FHIR · **Severity:** High (configured terminology silently dropped)
**Acceptance criterion:** `REPORTABLE`

FHIR base on current builds: **`/api/OpenELIS-Global/fhir`** (bare `/fhir` returns
the SPA HTML shell).

1. `PUT /rest/sample-types/{id}/terminology` with, for specimen A: SNOMED
   `119361006` `SAME_AS`, LOINC `12345-6` `SAME_AS`, **and** SNOMED `999999999`
   `NARROWER_THAN`. For specimen B: SNOMED `119364003` `SAME_AS`.
2. **Place a NEW order** on both specimens. The transform runs at *persist* —
   pre-existing Specimens are never retro-fitted, so an old accession proves nothing.
3. `GET /api/OpenELIS-Global/fhir/Specimen?_count=100&_sort=-_lastUpdated`, pick the
   two whose `accessionIdentifier.value` starts with your accession.

**Success:**
- The `http://openelis-global.org/sampleType` coding is still present.
- Specimen A's `type.coding` also carries `snomed|119361006` **and** `loinc|12345-6`.
- `999999999` is **absent** — `SAME_AS` wins over `NARROWER_THAN` within a system.
- Specimen B carries `snomed|119364003` and does **not** carry A's LOINC.
- `display` on each added coding is the sample type's localized name.
- `WHONET` and any unrecognised source yields a null system URL → coding **skipped**.

**Cleanup:** restore both sample types' baseline mappings and verify.

---

## TC-21 — Test terminology filtered to the resource's own specimen

**Section:** FHIR · **Severity:** High (an Observation carrying another specimen's
LOINC code is clinically wrong)
**Acceptance criterion:** `REPORTABLE`

1. On one test, `PUT …/tests/{id}/terminology` with three LOINC mappings: one
   `sampleTypeId`=A, one `sampleTypeId`=B, one **shared** (no `sampleTypeId`).
2. Order that test on both A and B (one accession, two samples).
3. Read `ServiceRequest`, `Observation` and `DiagnosticReport`, matching each to its
   specimen via the `specimen[].reference`.

**Success:** the resource on specimen A carries A's code **and** the shared code,
and **NOT** B's code. Symmetrically for B. A `sample_type_id = NULL` mapping applies
to every specimen. Pre-fix all three codes appeared on both.

**Cleanup:** restore the test's baseline mappings.

---

## TC-22 — Add Order loads an existing patient's photo on first paint

**Section:** Patient / Order entry · **Severity:** High
**Acceptance criterion:** `ROUND-TRIP`

**This is Add Order specific.** Add/Edit Patient kept working throughout, which is
why the regression (introduced by 9d211b225 / PR 3576) hid so long. Testing only
the patient screens will report a false PASS.

1. Ensure a patient HAS a photo — `GET /rest/patient-photos/{id}/false` returns
   `data` longer than a placeholder. Seed one if not (TC-24).
2. Reach Add Order by **each** path: select the patient from the search results,
   and the `?patientId=<id>` deep link. Both funnel through `fetchPatientDetails`.
3. Inspect `img.patient-image`.

**Success:** `src` is a `data:` URI **byte-identical** to the stored photo, present
on first paint. A blank or placeholder src means the patient object was handed to
the consumer before the fetch resolved — the consumer seeds its form once, so a
late assignment never lands. A patient with no photo yields `""`, never `undefined`.

---

## TC-23 — Photo dialogs escape the disabled fieldset

**Section:** Patient photo · **Severity:** Medium (a dialog you cannot close)
**Acceptance criterion:** `RENDER` + `FUNCTION`

On Add Order with an existing patient selected (the patient panel renders read-only
via `fieldset[disabled]`):

1. Locate the two dialogs PatientImageSelector owns — headings **`Select Patient
   Photo`** and **`View Photo`** (the latter contains `.patient-photo-view-container`).
2. For each: assert it is a **direct child of `document.body`** (portaled) and has
   **no** `fieldset[disabled]` ancestor.
3. Assert `querySelectorAll('button:disabled').length === 0` for each.
4. Click `.image-display`, confirm a dialog opens, and that **Close** is enabled and
   actually closes it.

**Scope trap.** The **ID documents** section renders its *own* dialogs — including
one also headed "Select Patient Photo" — inside `div.id-documents-section`. Those
are a different component that this PR did NOT touch. Filter them out or the test
grades the wrong dialogs. (As of 2026-08-06 those five ID-document dialogs are
still unportaled with 100% of controls disabled in view mode — tracked separately.)

**Related consumer gap.** `PatientImageSelector` receives `disabled={false}` on Add
Order even though its ancestor fieldset is disabled. So the *portal* half of the fix
works, but the *view-mode behaviour* half (`disabled → open the read-only viewer`)
never engages there: clicking opens the **editable picker** with all controls live,
on a panel where every other field is locked. Assert current behaviour and revisit
when the caller is fixed.

---

## TC-24 — Undecodable photo fails readably AND rolls the patient back

**Section:** Patient create · **Severity:** High (an orphaned patient row after a
reported failure)
**Acceptance criterion:** `PERSIST` (negative — nothing may persist)

**Data note:** patient name fields reject **digits and underscores**, so
`QA_AUTO_<MMDD>` cannot go in a name. Use an alphabetic marker in the name and put
the run id in `nationalId`/`subjectNumber`.

1. `POST /rest/PatientManagement` for a **new** patient with
   `photo: "data:image/jpeg;base64,SGVsbG8gd29ybGQ="` — valid base64, not an image.
2. Search for that patient by last name and by `nationalId`.

**Success:**
- **500** with `error` exactly:
  `The photo could not be read as an image. Supported formats are JPEG, PNG, GIF and BMP.`
  (a hard-coded English literal, not an i18n key; the UI shows it verbatim).
- No `ConstraintViolationException` / "could not execute batch" text.
- **Zero** patient rows survive. Pre-fix the patient was created and kept while the
  caller got an error, because `persistPatientData` was itself `@Transactional` and
  committed on return.

**Run this BEFORE the happy-path upload** — it asserts a rollback, so it is
self-cleaning when the fix works. Any surviving row IS the evidence; report it.

---

## TC-25 — Decodable photo still saves (guard didn't over-tighten)

**Section:** Patient create · **Severity:** Medium
**Acceptance criterion:** `ROUND-TRIP`

1. `POST /rest/PatientManagement` with a genuinely decodable PNG/JPEG/GIF/BMP.
2. `GET /rest/patient-photos/{patientId}/false` → must equal the posted data URI.
3. `GET /rest/patient-photos/{patientId}/true` → a thumbnail must exist.

**Success:** 200 + `patientId`; the photo round-trips byte-identically; a thumbnail
is generated. Step 3 proves `createThumbnail` returned non-null, i.e. you exercised
the *other* branch of TC-24's guard rather than skipping past it. "Which uploads
succeed is unchanged — only the message."

---

## TC-26 — Patient report: specimen suffix + per-component unit/range

**Section:** Reports · **Severity:** High (a component printed against another
component's range is a misreported result)
**Acceptance criterion:** `REPORTABLE`

**Preconditions — both required, and most instances lack them:**
- the `patientCILNSP_vreduit` report template (it is the only report that overrides
  `appendSampleTypeToTestName()`; the others are deliberately unchanged), and
- a test with **≥2 active result components**, each with its own UOM and its own
  age/sex reference range.

1. `GET /ReportPrint?report=patientCILNSP_vreduit&type=patient&analysisIds=<csv>`.
2. Extract the PDF text.

**Success:**
- **item 12:** each Test cell reads `<reporting name> (<specimen>)` — e.g.
  `Albumin (DBS)`. Note the **space** before the paren here, unlike TC-19's
  analysis display name. Other patient reports must be **unchanged** (no suffix).
- **item 13:** the **Reference value** and **Unit** cells each carry **one line per
  component**, aligned 1:1 with the Result cell's lines, each resolved by
  component + specimen + age + sex — and stretched, not clipped to one line height.
  Pre-fix the Result cell had N lines while Unit/Reference carried a single
  test-level value.
- A component with `isPrimary=false` and `showOnReport=false` is **skipped** (OGC-1127).

**If either precondition is missing, record GAP with the reason** — not PASS. The
Playwright project detects both and skips with the verdict attached.
