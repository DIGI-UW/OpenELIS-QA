# QA Report — PR #3987 regression, testing.openelis-global.org

## 1. Header

| | |
|---|---|
| **Instance / URL** | `https://testing.openelis-global.org` |
| **App version** | **3.2.1.11** (login banner, "Test LIMS") |
| **Target identity** | branch-or-PR verification — `develop` carrying DIGI-UW/OpenELIS-Global-2**#3987** (merged 2026-08-05T15:04Z by mozzy11; 45 files, +1635/−183) |
| **Catalog** | Default global (349 tests, 190 active / 159 inactive) |
| **Date/time** | 2026-08-06, ~17:40–18:30 UTC, plus a second pass ~22:1x UTC to close item 5 |
| **Tester** | Claude (Cowork), `openelis-test-catalog-qa` skill |
| **Run tier** | **Targeted** — the 15 items of PR #3987, not a standard/full sweep |
| **Substrate** | Claude in Chrome (interactive). The Playwright harness could **not** be used from the sandbox: no network route to the instance (`curl` → exit 000). Specs authored here run on Casey's machine / CI. |
| **Jira** | OGC — **drafted, not submitted**, per instruction |

### Build gate — PASS (the merge is present)

Grading any of these items without first proving the build carries #3987 would be
meaningless: a pre-PR build answers the same endpoints with the *old* semantics.
Cheapest unambiguous signature is item 7, where the `id` parameter did not exist
before the PR:

| Probe | Pre-#3987 | Observed |
|---|---|---|
| `GET /rest/reflexrules` | 2 rows | 2 rows |
| `GET /rest/reflexrules?id=999999` | **2 rows** (param ignored) | **0 rows** ✅ |
| `GET /rest/reflexrules?id=` | 2 rows | 2 rows ✅ |

### Step 0.6 — Data Census: healthy, not reset

`patients=81` (`lastName=A`) · Dashboard KPIs `ordersInProgress=142`,
`ordersReadyForValidation=3`, `patiallyCompletedToday=2` · catalog 349 tests ·
recent accessions in the `DEV0126000000000012x–13x` range. Not empty ⇒ E2E work
permitted, results are not render-only.

### Step 0.5 — Calibration

| Known hazard | State this run |
|---|---|
| §10.7 `fetch()` result blocking in `javascript_tool` | **STILL PRESENT** — tripped on a multi-URL probe returning response bodies. Worked around by projecting to primitives in-page (now §11.7). |
| §6.5 REST base is `/api/OpenELIS-Global/rest`, bare `/rest` returns the SPA shell | **STILL PRESENT** — confirmed again; bare `/rest/...` returned `index.html` with status 200. |
| Carbon checkbox 60s hang (§6.2) | **NOT EXERCISED** — no checkbox interaction was required. Not re-verified; do not assume resolved. |
| OGC-1142 completeness gate (422 before coverage 409) | **STILL PRESENT** and working as designed — see §6 note on item 1. |

---

## 2. Summary table

| Module | Items | Pass | Fail | Blocked | Gap | **Maturity** | Top issue |
|---|---|---|---|---|---|---|---|
| Test Catalog — coverage/LOINC/editor | 1, 2, 8, 15 | 4 | 0 | 0 | 0 | **M4** | — |
| Reflex / Calculated Value | 7 | 1 | 0 | 0 | 0 | **M3** | — |
| Results / Validation | 4, 5 | 2 | 0 | 0 | 0 | **M4** | — |
| FHIR terminology | 3, 6 | 2 | 0 | 0 | 0 | **M5** | — |
| Patient photo | 9, 10, 11, 14 | 4 | 0 | 0 | 0 | **M4** | consumer-side gap F-1 (not a PR defect) |
| Patient report | 12, 13 | 0 | 0 | 0 | 2 | **n/a** | fixture absent on this instance |
| **Total** | **15** | **13** | **0** | **0** | **2** | | — |

**Nothing in PR #3987 regressed.** 13 items confirmed, 2 not testable here. Maturity is capped per module by its lowest sub-feature: FHIR reaches **M5**
because the assertions are on emitted FHIR resources (REPORTABLE); Patient photo is
**M4** rather than M5 because no report/audit surface was exercised.

Two **new findings** surfaced that are *not* PR #3987 defects — see §5.

---

## 3. Per-item results

| Item | Scenario | Result | Criterion | Evidence |
|---|---|---|---|---|
| **1** | Coverage gaps judged against group + component shared ranges | **PASS** | ROUND-TRIP | All four sub-cases on a zero-range fixture: specimen override 0–30 with no shared set → `status:"GAP"`, `gaps:[{fromAge:30,toAge:"Infinity"}]`. Shared open-ended + override → `COMPLETE`, `gaps:[]`, **`overlaps:[]`**. Two overrides in one scope (0–20, 10–∞) → `OVERLAP`, `overlaps:[{10,20}]`, `gaps:[]`. Shared-only → `COMPLETE`. Reverted to `ranges:[]` / `EMPTY`. |
| **2** | "No LOINC" clears for a mapping in any scope | **PASS** | ROUND-TRIP | Baseline `noLoinc:true` / list `hasLoinc:false`. SNOMED `119364003` → unchanged (correct negative). Whole-test LOINC `99999-1` → `noLoinc:false`, `hasLoinc:true`. **Specimen-scoped** LOINC `99999-2` (`sampleTypeId:2`) → `noLoinc:false`, `hasLoinc:true`. Flag read from a *different* endpoint than the write, and the list row agreed. Restored to `[]`. |
| **3** | Sample Type terminology reaches FHIR `Specimen.type` | **PASS** | REPORTABLE | Baseline: exactly **1** coding per Specimen. After config + a new order — Plasma specimen `…-1`: `openelis/sampleType\|Plasma` + `snomed\|119361006` + `loinc\|12345-6` (**3**); Serum `…-2`: `openelis\|Serum` + `snomed\|119364003` (**2**). `NARROWER_THAN` `999999999` correctly **excluded** by SAME_AS precedence. `display` = localized name. Terminology restored. |
| **4** | Analysis names its own specimen, not the "+n" summary | **PASS** | CROSS-LINK | Two-specimen order `DEV01260000000000133` → 2 rows: **`QA_AUTO_0724 DomFlip(Plasma)`** and **`QA_AUTO_0724 DomFlip(Serum)`**. Names differ, each names its own specimen, neither matches `/\+\d+\)/`. Pre-fix both would read `…(Plasma +1)`. |
| **5** | Results Entry and Validation share one range selection | **PASS** | CROSS-LINK | Closed on the hard fixture (2026-08-06, second pass). Seeded a **sex- and age-banded** range on QA test 442 — M 0–18 → `1–10`, M 18–∞ → `100–200`, F 0–∞ → `500–600`, coverage `COMPLETE` for both sexes — then entered results on the two-specimen order `DEV01260000000000133` (patient **male, age 36**). Both screens read **`100.0 - 200.0`** on both analyses, `significantDigits` 1 on both: the **adult-male** band, *not* the child band (`1.0 - 10.0`) and *not* the female band (`500 - 600`). This is precisely the pre-fix failure mode — Validation took the test-level limit and never resolved the patient, so no age/sex band could match. First pass (unbanded, single-component fixture) was PARTIAL because fixed and broken code return the same string there. |
| **6** | Test terminology filtered to the resource's own specimen | **PASS** | REPORTABLE | Plasma `ServiceRequest`: `loinc 77773-3` (shared) + `77771-1` (Plasma-scoped), **no** `77772-2`. Serum: `77773-3` + `77772-2`, **no** `77771-1`. Zero cross-specimen leakage; shared (`sampleTypeId` NULL) applied to both. Pre-fix all three appeared on both. |
| **7** | Reflex/Calc list endpoints accept `?id=` | **PASS** | FUNCTION | Both `/reflexrules` and `/test-calculations`: unfiltered 2 rows; `?id=999999` → 0; `?id=` → 2. |
| **8** | Editor names every specimen; list keeps "+n" | **PASS** | ROUND-TRIP | Two fixtures. Test 322 editor `Anti-Pan Keratin(Immunohistochemistry specimen, Tissue antemortem, Tissue post mortem)` (matches the PR's own claim verbatim). Test 442 editor `QA_AUTO_0724 DomFlip(Plasma, Serum)` vs list `QA_AUTO_0724 DomFlip(Plasma +1)` — both halves proven on one test. |
| **9** | Add Order loads an existing patient's photo | **PASS** | ROUND-TRIP | Seeded patient 114 with a 64×64 PNG (233-char data URI). **Both** entry paths: search-select → `img.patient-image` with a `data:` src of length 233 on first paint; `?patientId=114` deep link → identical. Byte-identical to the stored photo. |
| **10** | Photo dialogs portaled out of the disabled fieldset | **PASS** | FUNCTION | `Select Patient Photo` and `View Photo` are both **direct children of `document.body`**, neither inside a `fieldset[disabled]`, and each has **0** disabled controls (0/11 and 0/1). Verified with the `id-documents-section` subtree excluded (see the scope trap in §5, F-2). |
| **11** | Patient + photo + documents in one transaction | **PASS** | PERSIST (negative) | POST of a new patient with an undecodable photo → 500, then **0** rows by `lastName` and **0** by `nationalId`. The whole unit of work rolled back. Pre-fix the patient survived. |
| **12** | Patient report Test column names the specimen | **GAP** | — | `patientCILNSP_vreduit` is not deployed here (`/rest/report-list` → 404; no CILNSP entry among 5 reports). Only that report overrides `appendSampleTypeToTestName()`. |
| **13** | Per-component unit + range lines in the report | **GAP** | — | Needs the report above **and** a test with ≥2 active components each carrying its own UOM and age/sex range. No multi-component test found in an 80-test scan. |
| **14** | Undecodable photo → readable error | **PASS** | FUNCTION | `photo: "data:image/jpeg;base64,SGVsbG8gd29ybGQ="` → **500** with `error` exactly `The photo could not be read as an image. Supported formats are JPEG, PNG, GIF and BMP.` No `ConstraintViolationException`. Happy path unchanged: a real PNG saved, round-tripped byte-identically, and produced a 211-char thumbnail (so `createThumbnail` returned non-null — the other branch of the same guard). |
| **15** | `basic-info` 409 on activating an inactive test | **PASS** | PERSIST | All four rows. Inactive + `active:true` → **409**, empty body, still inactive. `active:false` → 200. `active` absent → 200. Already-active + `description` → **200 and the description persisted** (read back, then restored). |

---

## 4. Chains, Personas, Reconciliation

Not run — this was a targeted PR verification, not a standard/full tier. Per
`workflows.md` the mandatory Chains/Personas/Y-RECON scale by tier and do not apply
to a targeted item sweep. **The next standard-tier run on this instance still owes
Chains + Y-RECON.**

One reconciliation data point was taken incidentally: Dashboard
`ordersReadyForValidation=3` vs `AccessionValidation` returning 1 row for
Biochemistry — consistent, since the KPI spans all sections and only Biochemistry
was queried. Not a Y-RECON result; recorded so it isn't mistaken for one.

---

## 5. Findings requiring attention

**No item of PR #3987 regressed.** Both findings below are pre-existing or
consumer-side, surfaced *by* testing the PR. Neither is a reason to hold the merge.
Both cleared the `openelis-bug-revalidation` **2-of-3** gate — fresh tab **and**
3× repeat (a third leg, full re-login, was not needed once two agreed).

### F-1 — Patient photo is editable on the read-only Add Order patient panel

**Severity:** Medium · **Class:** consumer-side inconsistency exposed by item 10 ·
**Revalidation:** 3/3 repeats + fresh tab, both showing the same DOM/prop state

On **Add Order** with an existing patient selected, the patient panel is rendered
read-only via `fieldset[disabled]` (12 sibling inputs disabled), but
`PatientImageSelector` is passed **`disabled={false}`** — confirmed by reading
`memoizedProps.disabled` off the React fiber, with a `fieldset[disabled]` ancestor
present.

Consequence: item 10's *behavioural* half (`disabled` → open the read-only viewer)
never engages here. Clicking the photo opens the **editable picker**, and because
item 10 correctly portaled that dialog out of the fieldset, its controls are now
**live** — `Import`, `Take Photo`, `Change Image`, `Confirm` all enabled (0 of 11
disabled). So the photo is changeable on a panel where every other field is locked.

This is **not** a defect in #3987. Before the PR the same mismatch existed but was
masked: the dialog opened inside the disabled fieldset, so its controls were inert.
The fix removed accidental protection the caller was silently relying on. The fix is
right; the caller needs to pass `disabled` in sync with the fieldset — or Product
needs to confirm that editing a photo during order entry is intended.

*Evidence collected without performing a write — reachability of the edit controls
is asserted from their enabled state, not by changing a patient's photo.*

### F-2 — ID-documents dialogs are still unportaled and unusable in view mode

**Severity:** Medium · **Class:** same defect item 10 fixed, in a component the PR
did not touch · **Revalidation:** 3/3 repeats + fresh tab

Five dialogs under `div.id-documents-section` sit inside `fieldset[disabled]` and
have **100% of their controls disabled** in view mode — including their own Close:

| Dialog | Disabled / total buttons |
|---|---|
| Add Document | 4 / 4 |
| Select Patient Photo *(the ID-documents one)* | 10 / 10 |
| View Document | 1 / 1 |
| Edit Document | 4 / 4 |
| Delete Document | 3 / 3 |

A user who opens one in view mode cannot dismiss it. This is exactly the defect
item 10 fixed for `PatientImageSelector`, not applied to the ID-documents
component. The duplicate "Select Patient Photo" heading is also a live trap for
test authors — see §11.8 of `playwright-harness.md`.

### F-3 (harness, not product) — `seed-tat-data.ts` defaults break off dev

`createSampleOrder` defaults `providerPersonId:"9000002"`,
`referringSiteId:"9000100"`, `programId:"2"` — dev.docker-compose fixture ids. On
testing they don't exist and `POST /rest/SamplePatientEntry` answers a bare **500**
with no field diagnostic, which reads as "order entry is broken". Empty strings
succeed. Worth fixing upstream in `OpenELIS-Global-2`; recorded in
`playwright-harness.md` §11.1 meanwhile.

---

## 6. Gaps, uncovered & uncertain

**GAP — items 12 and 13 (patient report).** `patientCILNSP_vreduit` is not deployed
on this instance and no multi-component test exists. Both preconditions are
required and neither is satisfiable without changing the instance's report set.
Recorded as GAP, **not** PASS. The Playwright project detects both preconditions and
skips with the verdict attached, so it activates automatically on an instance
carrying the CDI report set (e.g. dev.docker-compose).

**CLOSED — item 5 (was PARTIAL).** The first pass compared Results Entry and
Validation on the only validation-ready analysis available: single-component, no
age/sex band. On that fixture the fixed and the broken code produce the *same*
string, so it was neither proven nor disproven. Closed on a second pass by building
the fixture that can tell them apart — see the item 5 row in §3. The deterministic
version is now `item 5 (banded)` in `test-catalog-pr3987-regression.spec.ts`, which
seeds the bands itself rather than hoping the instance has them.

**UNCERTAIN / NEEDS-GUIDANCE — one question for Casey**, also appended to
`references/open-questions.md`:

> **Q3.** On Add Order with an existing patient, should the photo be editable while
> every other patient field is read-only (finding F-1)? Two defensible answers —
> pass `disabled` in sync with the fieldset so the click opens the read-only viewer,
> or treat photo capture as a legitimate order-entry action and make that explicit
> in the UI. This changes what the regression suite should assert, so the spec
> currently pins **observed** behaviour and says so.

**Coverage note.** Items 12/13 mean the report layer of this PR is unverified
anywhere in QA. If the CDI reports matter to a deployment, that instance should run
`--project=pr3987-fhir` before release.

---

## 7. Machine-readable summary

```json
{
  "target": {"type": "branch", "project": "OpenELIS Global", "version": "3.2.1.11", "url": "https://testing.openelis-global.org", "pr": 3987},
  "tier": "targeted",
  "date": "2026-08-06T18:30Z",
  "modules": [
    {"name": "Test Catalog (coverage/LOINC/editor)", "maturity": "M4", "pass": 4, "fail": 0, "blocked": 0, "gap": 0},
    {"name": "Reflex/Calculated Value", "maturity": "M3", "pass": 1, "fail": 0, "blocked": 0, "gap": 0},
    {"name": "Results/Validation", "maturity": "M4", "pass": 2, "fail": 0, "blocked": 0, "gap": 0},
    {"name": "FHIR terminology", "maturity": "M5", "pass": 2, "fail": 0, "blocked": 0, "gap": 0},
    {"name": "Patient photo", "maturity": "M4", "pass": 4, "fail": 0, "blocked": 0, "gap": 0},
    {"name": "Patient report", "maturity": "n/a", "pass": 0, "fail": 0, "blocked": 0, "gap": 2}
  ],
  "chains": [],
  "yrecon": [],
  "new_failures": 0,
  "consumer_findings": 2,
  "harness_findings": 1,
  "uncovered": 0,
  "needs_guidance": 1,
  "coverage": {"total_tcs": 26, "executed": 14, "deep": 14, "shallow": 0, "mixed": 0, "needs_update": 0, "gap_areas": 2}
}
```

`new_failures: 0` is deliberate — no PR item regressed. F-1/F-2 are counted as
`consumer_findings` because neither is a defect in the code #3987 changed, and
counting them as PR failures would misrepresent the merge.

---

## 8. Appendix

### 8.1 — Drafted Jira tickets (NOT submitted, per instruction)

Both cleared the 2-of-3 revalidation gate. A duplicate search was **not** run —
do that before creating either.

---
**OGC-XXXX — Patient photo is editable on the read-only Add Order patient panel**

*Type:* Bug · *Priority:* Medium · *Component:* Patient / Order Entry
*Affects:* 3.2.1.11 (surfaced by #3987 item 10) · *Found:* testing.openelis-global.org, 2026-08-06

**Summary**
On Add Order, selecting an existing patient renders the patient panel read-only via
`fieldset[disabled]`, but `PatientImageSelector` receives `disabled={false}`. Since
PR #3987 correctly portaled the photo dialogs out of the fieldset, the picker's
controls are no longer inert — so the photo can be changed on a panel where every
other field is locked.

**Steps to reproduce**
1. Order → Add Order.
2. Search for any patient that has a stored photo and select them (or open
   `/SamplePatientEntry?patientId=<id>`).
3. Observe the patient fields are read-only.
4. Click the patient photo.

**Actual**
The **Select Patient Photo** picker opens with 0 of 11 controls disabled;
`Import`, `Take Photo`, `Change Image` and `Confirm` are all enabled.
`PatientImageSelector`'s `disabled` prop is `false` while an ancestor `fieldset` is
`disabled`.

**Expected** — one of, to be decided by Product:
- (a) the caller passes `disabled` in sync with the fieldset, so the click opens the
  read-only **View Photo** viewer (the behaviour #3987 item 10 implements), or
- (b) photo capture during order entry is intended, and the panel makes that clear
  rather than presenting the photo as one more locked field.

**Not a regression in #3987.** The prop mismatch predates it; the PR removed the
accidental protection the disabled fieldset was providing. The PR's fix is correct.

**Revalidation:** 3/3 repeats in the original tab + reproduced in a fresh tab.

---
**OGC-XXXX — ID-documents dialogs cannot be closed in view mode (not portaled)**

*Type:* Bug · *Priority:* Medium · *Component:* Patient / ID Documents
*Affects:* 3.2.1.11 · *Found:* testing.openelis-global.org, 2026-08-06

**Summary**
The five dialogs rendered under `div.id-documents-section` are not portaled and sit
inside the patient form's `fieldset[disabled]`. In view mode every control they own
is disabled — including their own Close — so an opened dialog cannot be dismissed.
This is the same defect PR #3987 item 10 fixed for `PatientImageSelector`, in a
component that PR did not touch.

**Steps to reproduce**
1. Order → Add Order; select an existing patient (patient panel becomes read-only).
2. Expand the identification-documents section and open any document dialog.

**Actual** — disabled/total buttons: Add Document 4/4 · Select Patient Photo 10/10 ·
View Document 1/1 · Edit Document 4/4 · Delete Document 3/3.

**Expected** — each dialog renders through `createPortal(..., document.body)` as
`PatientImageSelector` now does, so its own Close/Cancel stay usable in view mode.

**Suggested fix** — apply the item-10 pattern (`createPortal`) to the
id-documents dialogs.

**Note for test authors** — this section renders its own dialog also headed
"Select Patient Photo". Scope any assertion by ancestor subtree, not heading text.

**Revalidation:** 3/3 repeats + fresh tab.

---

### 8.2 — Data created / changed, and its disposition

Per the LIMS rule nothing was hard-deleted. All **configuration** was restored to
the baseline read beforehand and the restore was verified.

| Object | Action | Disposition |
|---|---|---|
| Test 422 ranges | wrote 4 range sets | **restored** → `ranges:[]`, coverage `EMPTY` ✅ |
| Test 422 terminology | wrote SNOMED + LOINC ×3 | **restored** → `[]` ✅ |
| Test 427 description | overwritten with a marker | **restored** → `QA_AUTO_0714 Gate Probe` ✅ |
| Test 442 terminology | wrote 3 scoped LOINC mappings | **restored** → `[]` ✅ |
| **Test 442 ranges** | wrote a sex+age-banded set (M 0–18, M 18–∞, F 0–∞) to close item 5 | **deliberately LEFT IN PLACE** — this is a QA-owned test, and a banded range is exactly what makes the item 5 assertion meaningful on the next run. Remove if it bothers you; the spec re-seeds it. |
| Order `DEV01260000000000133` results | entered `150.0` on both analyses to reach Validation | **left in place** — the analyses are now validation-ready, which is the item 5 fixture |
| Sample type 2 (Serum) terminology | wrote SNOMED | **restored** → `[]` ✅ |
| Sample type 3 (Plasma) terminology | wrote SNOMED ×2 + LOINC | **restored** → `[]` ✅ |
| Test 383 / 427 active flags | probed via 409/200 | unchanged ✅ |
| **Patient 114** `QaAuto Fixture` (`nationalId QAPplain`) | created, photo attached | **left in place** — useful photo fixture for re-runs; retire when no longer wanted |
| **2 patients** `QaOrder Fixture` | created by order seeding | **left in place** — retire at will |
| Orders `DEV01260000000000132` (Plasma), `DEV01260000000000133` (Plasma+Serum) | created | **left in place** — `133` is the two-specimen fixture for items 4/6 |
| `QaRollback Probe` | attempted, must not exist | **0 rows** — correctly rolled back ✅ |

Pre-existing `QA_AUTO_*` leftovers from earlier runs (0706–0724 series, incl. an
inactive `QA_AUTO_0708 MultiSelect`) were observed and **not** touched.

### 8.3 — Substrate note

The sandbox has no network route to `testing.openelis-global.org` (`curl` exit 000),
so the Playwright harness could not be executed here; all live verification ran
through Claude in Chrome against Casey's browser session. The specs delivered in
this PR are typechecked (`npm run typecheck`, clean) and enumerate correctly
(`--list`, 15 tests), but have **not been executed**. First run should be
`--project=pr3987-catalog` (read-mostly) before the two seeding projects.
