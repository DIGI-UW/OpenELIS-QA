# Harness findings — pathology / IHC / cytology seeding

**2026-08-12, testing.openelis-global.org, v3.2.1.11.**

Two things that were previously written up as product bugs are harness defects. Both are fixed in
`tests/docs/seed-cases.docs.spec.ts`; this file is the standalone evidence record.

## Defect 1 — seeder sent `sampleOrderItems.additionalQuestions: null`

A case created without a program `QuestionnaireResponse` persists with no questionnaire, and
`GET /rest/{discipline}/caseView/{id}` then returns **HTTP 500**.

Captured per discipline route (each case queried on the discipline that owns it):

| case | route | status | questionnaire | origin |
|---|---|---|---|---|
| 1  | cytology  | 200 | present | pre-existing demo data, GUI-created |
| 22 | cytology  | 500 | null    | old seeder |
| 23 | cytology  | 500 | null    | old seeder |
| 13 | pathology | 500 | null    | old seeder |
| 15 | pathology | 500 | null    | old seeder |
| 49 | pathology | 200 | present | GUI wizard, control |
| 50 | cytology  | 200 | present | GUI wizard, control |

`caseView` returns 200 iff the order carries a QuestionnaireResponse. Correlation 7/7.

The fix: `GET /rest/program/{programId}` returns
`{ program: { questionnaireUUID }, additionalOrderEntryQuestions: { <Questionnaire> } }`.
The seeder now builds a `QuestionnaireResponse` from that and sends it as
`sampleOrderItems.additionalQuestions`.

Answer encoding, verified against what the server actually persisted for GUI-created case 49:

- `choice` items — the matching `answerOption` entry echoed **verbatim**
  (`{valueCoding:{system,code,display}}` or `{valueString}`)
- `text` items — `{valueString: "..."}`

**Residual product question (not filed):** a 500 rather than a graceful empty render on a null
questionnaire is arguably a robustness gap. It is not reachable through the GUI — the wizard always
sends a response — so it is low priority and would only affect API/integration clients.

## Defect 2 — transition POST body is per-discipline

The seeder sent one body shape to all three disciplines. Each discipline accepts a different one.
Every shape below was captured off that discipline's own **Save** button.

| discipline | accepted body |
|---|---|
| pathology | `{assignedTechnicianId, status, blocks:[], slides:[], reports:[], release:false, techniques:[], requests:[], conclusions:[]}` |
| cytology | `{assignedTechnicianId, status, slides:[], reports:[], release:false}` |
| immunohistochemistry | `{assignedTechnicianId, status, reports:[], release:false}` |

The two failure modes differ, which is what made this confusing:

- **too many keys** → HTTP 400 `HttpMessageNotReadableException` (pathology shape sent to cytology;
  adding `slides` to the IHC body)
- **too few keys** → HTTP 500 (dropping `reports` from the IHC body)

So a 500 here does not mean the case is broken — check the body shape first.

Verified: case 49 `GROSSING -> CUTTING`, case 342 (cyto) `-> SCREENING`, case 401 (IHC)
`-> READY_PATHOLOGIST`, all with technician `114`.

This retracts the earlier reading that pathology status transitions were broken. They are not.

### Trap: `/ImmunohistochemistryCaseView/{id}` accepts a non-IHC id

It renders a shell and Save posts to a case that does not exist, so the round trip looks like it
worked. I lost a cycle to this — case 343 is not an IHC case, and the "verified" IHC shape taken
from it was wrong. Always take the id from that discipline's own dashboard; pathology, cytology and
IHC ids are separate sequences.

## Defect 3 (usage, not code) — `caseView` is route-scoped by discipline

A cytology case 500s on `/pathology/caseView/{id}` and 200s on `/cytology/caseView/{id}`.
Some of the earlier 500 readings were this, not Defect 1. Always query the owning discipline.

## Contract reference (verified 2026-08-12)

1. `GET  /rest/program/{programId}` → questionnaire
2. `GET  /rest/SampleEntryGenerateScanProvider` → `{ status:true, body:"<accession>" }`
3. `POST /rest/SamplePatientEntry` — full form; set `sampleOrderItems.programId` **and** `.additionalQuestions`
4. `GET  /rest/{discipline}/dashboard?statuses=...` → rows with `pathologySampleId` / `immunohistochemistrySampleId`
5. `POST /rest/{discipline}/caseView/{id}` — full array payload, to advance workflow status

Status vocabularies (from the Select Status control on each case view):

- Pathology — GROSSING, CUTTING, PROCESSING, SLICING, STAINING, READY_PATHOLOGIST, ADDITIONAL_REQUEST, COMPLETED
- IHC — IN_PROGRESS, READY_PATHOLOGIST, COMPLETED
- Cytology — PREPARING_SLIDES, SCREENING, READY_FOR_CYTOPATHOLOGIST, COMPLETED

## GUI driving notes (Carbon + React)

- Program, specimen and status selects are native `<select>` elements under Carbon styling. React
  ignores a plain `.value =` assignment; use the native value setter plus a bubbling `change` event.
- Questionnaire field `id`s are regenerated UUIDs on every render. Never cache them — resolve fields
  by `label[for=...]` text each time.
- `Search Site Name` is an autocomplete: type, then click the suggestion row. Typing alone does not
  commit a selection (same failure mode as the `pickCombo` note in the test-catalog spec).

## Defect 4 — retries turned a 10-case run into ~120 per discipline

A seeder is not a test. `expect(failed).toBe(0)` at the end made Playwright retry the whole body
three times, and each retry seeded another full batch. The 2026-08-12 run against
testing.openelis-global.org left ~126 pathology, ~125 IHC and ~127 cytology cases instead of 10 each.

Fixed with `test.describe.configure({ retries: 0 })` plus a `CASES_TARGET_TOTAL` ceiling (default 25)
checked against the dashboard before creating anything. `CASES_FORCE=1` overrides.

## Cleanup owed

Cases 13, 15, 22, 23 (and any siblings from the old seeder) still have no questionnaire and will
keep 500ing on caseView. They are demo-server noise, not a product problem — either delete them or
leave them and read the 500 as expected for that cohort.

## pickCombo rewrite (2026-08-12)

The Test Catalog editor Sample type control was never a combobox. It is a Carbon FILTERABLE
MULTISELECT labelled Sample types (plural), with a visually-hidden Total items selected: N live
region. The old helper:

- checked commit via input.inputValue(), which is not a reliable signal for a multiselect;
- searched the whole page for the option row instead of scoping to the control wrapper;
- only typed to filter as a last resort, though these lists virtualise and the option is often
  absent from the DOM until filtered;
- left the menu OPEN after picking. An open multiselect menu overlays the fields below it, which
  is what made the NEXT locator.fill time out and made the run look like a hang.

Call sites also wrapped the pick in .catch(() => {}), so a failed selection was swallowed and Save
then silently no-opped. Removed - a required field left empty is a real failure.

Rewritten into tests/helpers/pick-combo.ts and imported by the four test-catalog specs (local
copies deleted, .bak-20260812 kept). Verified live on 34.212.225.107 v3.2.1.11: Sample types ->
Serum gives isMulti=true, committed=true, live region 0 -> 1.

Guards re-run after the fix: 13 failed / 5 passed. The pickCombo signature is gone; the remaining
failures moved downstream to createTest (the created test never persists), which is the open
Save-path question rather than a driving problem. Two guard results worth noting:

- OGC-1120: apparent flip RETRACTED. The guard saw 200 once, which reads as -bug fixed-. It is not.
  Revalidation: 500 x3 from the authenticated request fixture, 500 from an in-page fetch, and 500
  from a clean UNAUTHENTICATED context (content-type application/json, NOT an HTML login page, so
  the usual logged-out false-flip is ruled out). The single 200 was transient and unexplained.
  OGC-1120 stands. Fix the guard to assert on body shape, not status alone - a status-only guard
  can report a bug fixed on one anomalous response.
- OGC-1115: deactivate still non-functional (deact=404, del=405).

## Test Catalog editor SAVE path - captured 2026-08-12 (34.212.225.107, v3.2.1.11)

This is the request we said we would not file a bug without. It works.

  POST /api/OpenELIS-Global/rest/test-catalog/tests
  {"name":"...","reportingName":"...","code":"...","labUnitId":"56","sampleTypeIds":["2"],
   "domain":"CLINICAL","amr":false,"orderable":false,"description":""}
  -> 201  {"testId":"1044"}

Captured twice (ids 1044 and 1045, short code and 16-char code). After Save the URL advances from
/TestCatalogEditor/new/basic-info to /TestCatalogEditor/{id}/basic-info, and the test IS findable
on GET /rest/test-catalog/tests?search={name}.

The new test is NOT in /rest/test-list, and that is correct, not a bug. The UI says exactly why:

  "Test cannot be activated yet - The test needs an active primary result component with a
   result type."

That also explains OGC-1116 (created + activated test becomes orderable in /rest/test-list): the
guard never adds a result component, so the test can never activate, so it can never appear.
The guard needs a result component step before it asserts anything.

RETRACTS the long-running -editor save is broken- reading. The legacy /rest/TestAdd 500 is a
separate endpoint and still unproven as something the current product calls.

### Why createTest still fails (separate, harness-side)

With diagnostics added, all three attempts report the same thing:

  {"url":".../TestCatalogEditor/new/basic-info","textLen":238,"buttons":11,"inputs":0,
   "hasNav":false,"head":"Version:  \\n\\nUser Manual\\nVideo Tutorials\\n..."}

Header only - no side nav, no form inputs, and the version string is EMPTY where a healthy load
shows 3.2.1.11. That is the app shell rendering without its bootstrap config, NOT a logout (there
is no login form). An identical cold deep-link from a standalone spec mounts the editor fine, so
the difference is in this spec navigation path - nav() retries page.goto up to 3x in quick
succession, and login() adds more navigation between attempts, which can abort the config fetch.
Next step: settle the first goto before asserting, and stop re-navigating on a slow mount.

## The probes cluster: five specs logging in on an authenticated context (2026-08-13)

config-pages, label-presets, _discover, _timing and tests/ranges-discover each defined their own
login() that went to /login and filled a username field UNCONDITIONALLY. probes.config.ts supplies
storageState from the setup project, so the context is already authenticated and /login redirects
to the dashboard. The username input never exists, .fill() waits out the full 120s test timeout,
and because that runs in beforeEach, every test in the file dies before its first assertion.

That is the whole probes cluster: 2 passed / 11 failed, identical on the 08-06 and 08-12 sweeps,
never diagnosed because a beforeEach timeout reads like a page problem. The failure page snapshot
shows the opposite - a fully rendered logged-in dashboard, side nav, version 3.2.1.11, populated
tiles - with the harness waiting for a login form on it.

    before:    2 passed / 11 failed             (~50 minutes, almost all timeouts)
    after:    12 passed /  1 skipped / 0 failed  (4.2 minutes)

Fixed in #63. Same remedy as everywhere else in this file: check the state, then act.

## findTestIdByName: why createTest failed AND why guards was nondeterministic (2026-08-13)

Live row shape from GET /rest/test-catalog/tests?search=... :

    { testId: 1079, name: QA_AUTO_0813 TopSave(Serum), ... }

Two bugs:

1. The API appends (SampleType) to the name field, so an exact r.name === name match NEVER hit for
   a test created as QA_AUTO_0813 TopSave. This is the one that bit.
2. The id field is testId, not id. Even on a name match, String(row.id) produced the string
   undefined - truthy, and it would have been handed downstream as a real id.

STAMP is date-only (QA_AUTO_MMDD), which is what made it look intermittent. The FIRST run of a day
creates the test, gets 201, and resolves the id from the redirect URL, so the broken lookup is
never exercised. Any RE-RUN the same day gets HTTP 409 Conflict, no redirect, falls through to the
lookup, and fails. The suite was not idempotent within a day. That is the guards 5-vs-7 swing.

Captured directly: the 409 on POST /rest/test-catalog/tests, and the single search row carrying the
(Serum) suffix. After the fix (#64) TCF-05 gets past creation and fails deeper on an Alerts
checkbox - a different and genuinely testable problem that was previously unreachable.

## ORDER_ENTRY_CONFIG_ITEMS=0 was a render race, not a product finding (2026-08-13)

TC-CFG-03 read body.innerText immediately after the heading appeared. Carbon paints the empty table
shell first and the footer momentarily reads 0 items. Verified by clicking through in Chrome on
testing.openelis-global.org (1-15 of 15 items) and by a settled probe on 34.212.225.107 (1-19 of 19
items - the instances legitimately differ). The test now waits for a row and asserts > 0 rather
than a magic number.

This nearly became a ticket. Clicking through is what killed it: the early DOM read and the
rendered page disagreed, and only the page was telling the truth.

## Repo drift runs in BOTH directions - check before you sync (2026-08-13)

Assuming the working copy is always the newer side is wrong and dangerous. On 2026-08-13 it was:

- MISSING 84 tracked files, including tests/helpers/api-json.ts and tests/helpers/session.ts.
  test-catalog-critical-indicator.spec.ts imports those. Pulling the spec changes without the
  helpers would have failed at load time and looked like a harness or product fault.
- STALE on ten more, including auth.setup.ts (43 lines locally vs 13 in the repo after the
  session-guard refactor) and all-tc.config.ts (the repo had 4 QC projects the working copy lacked,
  so the local suite silently ran fewer tests).
- AHEAD on only a handful.

Separately, probes.config.ts testMatched six specs of which only two were ever committed, so from a
clean checkout it silently resolved to a partial run - no error, just fewer tests.

Before a sweep, diff the working copy against main in BOTH directions (missing and differing).

## Two operational traps worth remembering

- Do NOT put a backup directory inside the harness. A .presync-bak-DATE/ copy of a spec was globbed
  by e2e.config.ts, and its relative import could not resolve from that path, so the whole config
  failed to load and produced no results. Keep backups outside the tree.
- pkill -f run-sweep.sh matches its OWN command line when issued from a shell whose command string
  contains that text. It kills itself before the relaunch fires and leaves an empty log.

---

## v3.2.2.0 endpoint drift and two false-FAIL selectors (2026-08-21)

### EQA prerequisite: three different endpoints, one renamed

The documented EQA prerequisite path is stale on 3.2.2.0. Measured live:

| Call | Result |
|---|---|
| `GET /rest/SampleEntryConfigurationMenu` | **404** — endpoint renamed. This is what the skill docs, Persona PF Step 4, and Chain F Step 1 all used. |
| `GET /rest/SampleEntryConfigMenu` | 200 — `menuList[]`; `eqaEnabled` is id **138** |
| `POST /rest/SampleEntryConfigMenu` | **405** — read path only |
| `POST /rest/SampleEntryConfig?ID=138` | **200** — the actual save; body is the `sampleEntryConfigForm` shape |
| `GET /rest/configuration-properties` | 200 — exposes `EQA_ENABLED` directly; cheapest way to assert the flag |

The admin UI is **two-stage**: select the row radio, click **Modify**, and only then does the value control appear — and it is a **radio pair** (`radio-1` = true, `radio-2` = false), not a select and not a checkbox. A setter that only handles selects and checkboxes silently saves the unchanged value and still gets a 200.

Consequences:

- **Chain F Step 1 was a false FAIL** on this build — it reported that eqaEnabled was false or unconfirmable while the flag was verifiably true on two independent surfaces. Worse than a wasted run: it *masks* the real EQA state, which is the same confusion behind the OGC-518-524 cluster of cancelled tickets. Fixed by probing `configuration-properties` and `SampleEntryConfigMenu` first, and by requiring the true value to sit adjacent to the eqa key rather than anywhere in the blob.
- **Persona PF Step 4 marks BLOCKED, not PASS**, for the same reason — so a run can look like it exercised the EQA toggle when it did not.
- `tests/eqa-prereq.spec.ts` performs the working flip (`EQA_WANT=true|false`) with a cross-surface read-back.

With the fix and the flag on, Chain F went from **1 passed / 1 failed / 5 did-not-run** to **3 passed / 1 failed / 3 did-not-run**, reaching PERSIST (EQA program created). Its Step 3 now fails on `Distribution create HTTP 400` — **not yet classified**: the harness payload shape has drifted before on admin creates (BUG-3, seed-providers), so per section 6.5b this needs the real UI request captured before it can be called a product defect.

### TC-CAT-02: a broad locator plus .first() picking a hidden node

`getByText(/domain/i).first()` matched a **hidden** `span.cds--side-nav__link-text` reading All domains in the collapsed side nav, which precedes the Filters flyout in DOM order. Enumerating every match after opening the flyout:

```
idx0 visible=false  span.cds--side-nav__link-text  All domains   <- what .first() grabbed
idx1 visible=true   label.cds--label               Domain
idx2 visible=true   span.cds--list-box__label      All domains
idx3 visible=true   div.cds--table-header-label    Domain
```

`/status/i` and `/AMR/` passed only because their first match happened to be visible — the same latent bug, unexposed. Lesson: scope Carbon field assertions to `label.cds--label` (or the flyout container), and treat a bare `getByText(...).first()` over a common word as a bug waiting for a DOM reorder.

### Env/vector order-entry lanes: empty, unwritable reference registries

> **RETRACTED 2026-08-24.** The claim below — that these registries "do not derive from
> `sample_type.domain`" — was wrong. The seeded sample types were **inactive**, and both registries
> filter on domain AND active. With active rows they populate, `env-flow` and `vector-flow` both
> pass, and orders persist. The `POST 405` on `/rest/sample-types` is real but does not mean sample
> types cannot be created: the insert route is `POST /rest/SampleTypeCreate`. See
> `seed-domain-catalog-native.docs.spec.ts` and the 2026-08-24 section at the end of this file.
> The `/rest/vector/dictionary/*` emptiness is real and is a reference-data gap (OGC-1182).

`/rest/environmental-sample-types`, `/rest/vector-sample-types` and the whole `/rest/vector/dictionary/*` family return `[]` and are **POST 405**. They do **not** derive from `sample_type.domain` — proven by seeding the catalog (ENVIRONMENTAL=3, VECTOR=2, both orderable) and re-running `env-flow`, which still reported PICKED empty and zero writes. Independently corroborated by Chain N Step 1 (populated env dictionaries, expected at least 4, got 0).

So `env-flow` and `vector-flow` failures on this build are an **environment precondition**, not a product defect in the forms — they should report BLOCKED with that reason rather than FAIL.


---

## 2026-08-24 — order → result → validation, driven in a real browser (testing 3.2.2.0)

All four chains below were driven through Chrome against the live instance, not Playwright, and
every outcome was confirmed by an API read-back rather than by the screen. Recorded here because
several of the mechanics are not guessable from the DOM.

| lane | lab number | result | after validation |
|---|---|---|---|
| Clinical | `DEV01260000000000560` | Demo Glucose 90.0 (range 70–110) | Results final · Normal |
| Vector | `DEV01260000000000558` | QA Native Vector Assay 42.50 | Results final · Normal |
| Environmental | `DEV01260000000000559` | QA Native Env Assay 7.20 | Results final · Normal |
| Clinical, coded | `DEV01260000000000561` | QA Urine Dipstick Protein "Positif (++)" | Results final |

### What actually gates "Save & Next" on the order forms

The button carries `cds--btn--disabled` and **fires no request at all** until these are satisfied.
There is no inline error text explaining why, so a driver that only watches for validation messages
will conclude the form is broken.

1. **Sampling Site must be committed**, not merely typed. The typeahead renders result rows each
   with a **Select** control; until one is clicked, `siteName` stays empty even though the search
   box looks filled.
2. **At least one of Requesting Organization or Requestor**, also committed. The form states the
   rule itself: *"At least one of Requesting Organization or Requestor is required."*
3. The commit affordance **changes depending on whether the record already exists**. First use
   offers `+ Add new organization "…"` / `+ Add new requestor "…"`; once the record exists that
   link is gone and only the result row's **Select** works. A spec that only knows how to add-new
   passes on a clean instance and fails on every subsequent run — this bit us between the vector
   and env runs in the same session.

Sample and test selection is **optional** at Enter Order ("Tests and sample type can be specified
later during collection"), as are Lifecycle Stage, Trap Type, Container, Collection Method and
Weather. Orders complete without any of them.

`N/M steps` in the header is a **completion counter, not a wizard position** — it sat at `2/3`
through an entire successful run. Read the button's disabled state, not the counter.

### Clinical-specific

* The patient block has two tabs, **Search for Patient** and **New Patient**. Filling the search
  fields does nothing toward creating a patient; you must switch tabs.
* On the New Patient tab, `National ID*` and `Date of Birth*` carry the required marker, but
  Save & Next actually unlocked on **gender** with DOB still blank.
* `date-picker-default-id` is the id of a **wrapping div**, not the input. Setting `.value` on it
  throws `TypeError: Illegal invocation`; reach `.querySelector('input')` inside it.
* The search-and-select path works too: searching the national ID returns a row
  (`Parker Peter M NID-QACHAIN-560 Local`) with a **Select**.

### Results entry and validation routes

* **Results Entry — `/Results`.** One search box, `#unifiedResultsSearch`, that fires on **Enter**;
  there is no Search button. Result controls are `#unifiedResultValue-<id>-primary`. Saving flips
  the row to *Accepted by technician*.
* **Validation by order — `/AccessionValidation`.** `#accessionNumber` + a **Search** button, then
  per-row `resultList0.isAccepted` / `resultList0.isRejected` checkboxes and a **Validate** button.
* Validate performs a **full page navigation** to `/validation?type=order&accessionNumber=…`, which
  wipes any injected JS state — a driver must re-establish itself after each validation. The
  reliable success signal is the row disappearing from the `/AccessionValidation` queue, and then
  reading *Results final* back on `/Results`.

### Coded (dictionary) results work end to end

`resultType: "D"` with `options[]` on the primary component is the whole recipe. Verified with
"QA Urine Dipstick Protein" (test 790, sample type Urines): completeness returned
`complete: true, missing: []`, and **activation returned 200 with no range acknowledgment** —
dictionary tests skip the reference-range coverage gate that numeric tests hit. At Results Entry the
control renders as a `<select>` carrying exactly the configured ladder in sort order, not a numeric
input. Selecting an option saved and validated normally.

Open question, not chased: the three numeric results all showed a **Normal** flag after validation;
the coded one showed **no flag**, despite `normal: true` being set on the `Negative` option.

### Two instrument traps that produced false readings

* `GET /rest/test-catalog/tests?domain=…` returns names **decorated with the sample type** —
  `QA Native Env Assay(QA Native Env Matrix)`. An equality match on `name` never fires, so a
  reuse-lookup falls through to a create, which then 409s on the code. Strip a trailing
  parenthetical and match on `code` as well.
* A `window.fetch` monkey-patch installed to record writes **was silently replaced by the SPA**, so
  a run that definitely saved logged zero writes. Never treat an empty client-side write log as
  evidence of no persistence — read the record back from the server.

### Defect surfaced (OGC-1120)

A test can be created **and activated** with `test_section_id` NULL — `labUnitId` is optional on
create and the FR-57 completeness gate never checks the section. One such test makes
`GET /rest/sample-type-tests?sampleType=<itsType>` return **500** for the whole sample type, killing
the order picker for it. A nonexistent sample-type id returns 200 with empty lists, so this is a
null dereference, not input validation. `PUT .../basic-info {"labUnitId": …}` fixes it in place.
Always send `labUnitId`, and assert the read-back's **HTTP status** — swallowing the 500 into an
empty-array fallback reports it as "0 tests", which reads as a data gap rather than a server error.

## 2026-08-25 - Basic Info domain switch and the D-030 coupling

Verified by driving real Chrome against testing.openelis-global.org (v3.2.2.0).

**OGC-951 shipped despite being Backlog.** Basic Info renders an enabled radio group
`name=basic-info-domain` with Clinical / Environmental / Vector, correctly pre-checked from the
record. Changing it raises a confirmation modal: *Change test domain? Change this test s domain to
Environmental? This affects how the test is categorized in the catalog.* with Cancel / Confirm.
Cancel reverts the selection cleanly and leaves no visible modal. Earlier harness docs claimed the
radio group did not exist because the ticket is Backlog - that claim is retracted. **Ticket state is
not build state; check the build.**

**D-030 is enforced on both sides.** On test 763 (QA Reval 436127, sample type Urines = CLINICAL),
confirming a switch to ENVIRONMENTAL leaves the sample type attached and the form reports
*This sample type s domain doesn t match the test s domain. Urines*, alongside the pre-existing
*Test cannot be activated yet* note. **Save becomes `disabled`.** Bypassing the UI entirely with
`PUT /rest/test-catalog/tests/763/basic-info` carrying `domain: ENVIRONMENTAL` + `sampleTypeIds: [1]`
returns **422**, and a read-back confirms the record is still CLINICAL. So the guard is real, not
cosmetic.

**Nit worth a ticket if anyone cares:** that 422 comes back with an **empty body**. The UI already
knows the reason from its own client-side check, but an API consumer gets a bare status with no
problem detail. Compare the 403 on the same route without a token, which does return
`{status, message}`.

**CSRF from the browser console.** REST writes need the header `X-CSRF-Token`, whose value the SPA
keeps in `localStorage.getItem('CSRF')` - the session cookies are HttpOnly, so `document.cookie` is
empty and there is no meta tag. Without the header every write returns
`403 {status: 403, message: CSRF token missing or invalid}`. Useful when probing server-side guards
by hand rather than through the harness.

## 2026-08-25 — route census, and what walking every screen turned up

Two new specs walk every reachable route and apply one shallow oracle: did it bounce to login, did
it paint real chrome, did a server error leak into the DOM, did it raise an uncaught page error or a
5xx. `tests/admin-route-census.spec.ts` covers the 51 routes under `/MasterListsPage`;
`tests/app-route-census.spec.ts` covers the 76 working routes. Both run from `census.config.ts`.

The point of them is not depth — it is that a screen which quietly starts rendering an empty shell
now fails a suite instead of waiting for someone to click it.

### DEFECT — Batch Test Reassignment fires two provider endpoints with a literal `null`

`/MasterListsPage/batchTestReassignment` issues, on mount:

    GET /rest/AllTestsForSampleTypeProvider?sampleTypeId=null   -> 500
    GET /rest/getPendingAnalysisForTestProvider?testId=null     -> 500

Characterised by hand against the same instance:

| request | status |
| --- | --- |
| `?sampleTypeId=null` (literal string) | **500** |
| parameter omitted entirely | 400 |
| `?sampleTypeId=1` (valid) | 200 |
| `?sampleTypeId=99999` (nonexistent) | 200, empty list |
| `?testId=790` (valid) | 200 |

So there are two problems stacked. The front end stringifies its unset state into the query rather
than skipping the call, and the back end answers the string `null` with a 500 where an omitted
parameter correctly yields 400 and an unknown id correctly yields 200. Same shape as the OGC-1120
null-guard: an id that fails to resolve should not become a 500.

**User impact is low** — the page is usable. Picking a sample type populates both dependent selects
correctly (Serum -> 417 tests, Urines -> 10, Sputum -> 1, Fluid -> 2), and no error is surfaced.
The cost is two 500s in the server log on every visit, which is exactly the noise that makes a real
500 easy to miss.

### Vector Identification is fully wired, and blocked on reference data

`/vector/identification` renders the Vector Identification Worklist against real orders — our
vector chain lot `DEV01260000000000558-P01` appears with its result (QA Native Vector Assay 42.50),
25 specimens, a Split action and a Deconvolution flag. Expanding a pool and clicking **Identify**
exposes a per-specimen panel whose controls are:

| control | options |
| --- | --- |
| `method-{id}` | Select… / Morphological / Molecular / Morphological + Molecular |
| `confidence-{id}` | Select… / Confirmed / Presumptive |
| `lifecycleStage-{id}` | **none — zero option elements** |
| `species-{id}` (combobox) | **empty menu** |

Species is admin-managed (Vector Surveillance Setup -> Species, 0 rows on this instance) and
lifecycle stage needs a liquibase seed. Both are in scope for **OGC-1182**. Until they are seeded,
identification cannot be completed on a fresh instance.

Two UI nits worth knowing while that is true:

* `lifecycleStage-{id}` renders with **zero** `<option>` elements — not even the `Select…`
  placeholder that `method` and `confidence` both carry. An empty list and an unpopulated list
  should not look different.
* The species combobox opens an empty `cds--list-box__menu` with **no empty-state message**. A lab
  user gets a silent dead end rather than "no species configured — add them in Admin".

### NOT a defect — the Environmental Compliance Dashboard reading all zeros

`/EnvironmentalDashboard` shows Total Orders 0, Compliance Rate 0%, Sites Monitored 0 even though
environmental orders exist. The default date range is fine (2025-08-25 to 2026-08-26, which spans
them). The cause is our own seed data: `GET /rest/compliance/standards/active` returns 5 ACTIVE
standards and **every one of them has zero linked tests**, which `SEED-README.md` already warns
about ("Standards alone have no linked tests — run seed-compliance-tests next"). Recorded here so
the next person does not spend an hour on it.

### Surfaces confirmed healthy by hand

* **Storage -> Sample Items** — 25 rows with real locations (`Hema Lab > Freezer 1 > Shelf 2`),
  Dispose Sample and Storage Audit Trail panels present.
* **QC Dashboard** — renders with zero instruments configured; tiles read 0 and the violations panel
  says "No active violations". Correct for an instance with no analyzers, not a failure.

### DEFECT (serious) — Workplan By Unit 500s on one unit and blanks the whole app

Found by click-through, not by the census — the census only visits routes, and this needs one
interaction. `/WorkPlanByTestSection` renders fine; selecting a unit issues

    GET /rest/WorkPlanByTestSection?test_section_id={id}

and for **unit 56 (Biochemistry)** that returns **500**. The React app then unmounts everything:
`document.getElementById('root').children.length` goes from 1 to **0**, leaving a blank white page
with no message and no route back except a manual reload.

Ten of the eleven units in the picker answer 200, so this is data-dependent rather than a dead
endpoint:

| unit | id | status |
| --- | --- | --- |
| Biochemistry | 56 | **500** |
| Hematology | 36 | 200 (24899 B) |
| Molecular Biology | 136 | 200 (12215 B) |
| Bacteria | 57 | 200 (2693 B) |
| Pathology | 163 | 200 (128529 B) |
| Immunohistochemistry | 164 | 200 (123451 B) |
| Serology-Immunology 117, Immunology 59, Cytology 165, Serology 97, Virology 76 | | 200, empty |

Repeatable on a fresh tab and via direct `fetch`. `WorkPlanByTest` and `WorkPlanByPriority` both
answer 200, so it is specific to the by-unit path. The response body is the bare
`{"timestamp":…,"status":500,"error":"Internal Server Error"}` — **no stack trace reaches the
client, so the cause needs the server log.**

`getAllAnalysisByTestSectionAndStatus(sectionId, statusList, true)` feeds a loop that dereferences
`analysis.getSampleItem().getSample()`, `sample.getAccessionNumber().equals(...)` and
`analysis.getTest().getId()` without null guards (see `WorkPlanByTestSectionController`), so a
single malformed pending analysis in that unit is the most likely trigger — same family as
OGC-1120. Note the REST controller for this path is **not** on the OpenELIS-Global-2 default branch
(only ByTest / ByPanel / ByPriority are), yet the deployed 3.2.2.0 build answers it with a 500 and
not a 404, so whatever handles it is not what a source search finds.

**These are two defects and both are worth filing.** The 500 is one. The front end unmounting on a
failed API call is the other, and it is the worse of the pair for a lab user — any future 5xx on
this route reproduces the blank page.

`tests/workplan-by-unit-crash.spec.ts` (config `workplan.config.ts`) covers both: TC-WP-UNIT-1
walks every unit in the picker and fails on any 5xx; TC-WP-UNIT-2 **stubs** the 500 with
`page.route` so it keeps testing the front end after the back end is fixed.

### Census results, 2026-08-25

`census.config.ts` runs both census specs — 127 routes, **126 passed / 1 failed**, 7.3 min. The one
failure is the Batch Test Reassignment 500 above. All 76 non-admin working routes render clean.

Worth recording: that run overlapped a live Chrome session driving the same instance as the same
admin user, and the guard reported `pings=1 lapses-on-ping=0 re-auths=0`. **The harness session was
not evicted.** That is one more piece of evidence against the concurrent-session-eviction theory for
the 2026-08-23 contamination, and in favour of idle timeout.

## 2026-08-25 — five order-to-validation chains driven in real Chrome

Every chain below was ordered through the four-step wizard, resulted in Results Entry, and
validated, with each step verified server-side rather than from the screen.

| Lab number | What it exercised | Outcome |
| --- | --- | --- |
| DEV01260000000000564 | Panel order, out-of-range numeric, calculated value | Results final |
| DEV01260000000000566 | Multi-component test, all three components | Results final |
| DEV01260000000000567 | Dictionary via keyboard, then multi-select | phantom 4th component |
| DEV01260000000000568 | Multi-select alone, clean repro | value on the wrong component |
| DEV01260000000000569 | Reflex rule | reflex test added automatically |

### Working, confirmed end to end

**Panels.** `QA Panel Test 20260811` (id 17) holds Amylase (Serum) and Actin Smooth Muscle
(Immunohistochemistry specimen). Ordering it against a **Serum** sample correctly took only the
Serum member. That is right, but the user ticks a panel expecting two tests and silently gets one —
worth a product decision on whether to warn or offer to add the second sample type.

**Reference-range flagging.** Amylase 999 against range 1–486 UI/L flagged **Abnormal**; the
calculated Créatinine 1998 against 6–13 mg/l flagged **Invalid**. Two distinct labels, and the
distinction looks deliberate — outside the normal range versus outside the plausible range. Both
flags survived validation.

**Calculated value tests.** Entering Amylase 999 automatically created and populated a Créatinine
analysis at 1998. Rule `QA_AUTO_0820_CALC_UI_NUM`: `Serum/Amylase Multiplied By 2 -> Serum/Créatinine`.
The admin page also carries a conditional rule producing a *dictionary* result
(`Créatinine >= 5 -> Bioline = Négatif`), so the feature spans numeric and coded outputs.

**Reflex tests.** Rule "High glucose adds HbA1c 250395": `Demo Glucose 250395(Serum) > 200`. Entering
250 on order …569 added **Demo HbA1c 250395(Serum)** to the order automatically, awaiting result.

**Dictionary results inside a multi-component test** persist correctly — `resultValue "1330"` for
Inconclusive — *when driven by real keyboard input*.

### DEFECT — a multi-select result is written to the wrong result component

Test 446 `QA_AUTO_MC_188636` has three components: `PRIMARY` (N), `RESULT_D` (D), `RESULT_M` (M).
Filling the **Multi-Select** control and saving writes the value to the **Dictionary** component and
coerces that component's `resultType` from D to M. The multi-select component stays empty.

Order …568, nothing else touched, trusted input only:

    Dictionary Result     type M   val "HIV-1 DNA DETECTED"   <-- wrong component, type coerced
    Numeric Result        type N   val ""
    Multi-Select Result   type M   val ""                     <-- what was actually filled

Order …567, where the dictionary already held "1330": the save did **not** overwrite it, it appended
a **fourth** row. A three-component test then reported four results, one a phantom
"Dictionary Result" carrying the multi-select's value. Both shapes validate to "Results final"
through the normal path with no warning.

Covered by `tests/multicomponent-result-routing.spec.ts` (config `multicomponent.config.ts`).

### Method note — an instrument trap that nearly produced a false report

A first pass set these controls from the console with `nativeSetter + dispatchEvent('change')`.
**React never sees those writes.** The dictionary component read back empty and looked like a
second defect — "coded results silently discarded". It is not one: driven by real keyboard input the
same control persists correctly. The Carbon **MultiSelect** is stricter still and ignores synthetic
`click`, `mousedown` and `mouseup` entirely; only a real pointer or keyboard event selects an option.

Practical rule for this app: **a synthetic event is enough to read state and to drive plain inputs,
selects and checkboxes, but never enough to prove a Carbon composite control works.** Anything
asserted about MultiSelect, ComboBox or the date pickers has to come from real input.

Two more instrument notes from the same session:

* The Carbon date picker (`collectionDate_0`) rejects programmatic value writes outright — the field
  stays empty. The wizard accepts the order without it, so it is not blocking.
* The Lab Number field has no Generate **button**; Generate is an `<a>` that calls
  `GET /rest/SampleEntryGenerateScanProvider`. A button-only query misses it.

### Not a defect, checked and cleared

* **Multi-select menu clipped by the table.** The menu opens inside `.cds--data-table-content`,
  which is `overflow: auto`, so on the last row only ~33 px of a 120 px menu shows. Scrolling the
  table reveals it — annoying, not unreachable.
* **Multi-select option labels invisible.** The control renders **64 px** wide where the numeric and
  dictionary controls in the same table are **176 px**. Option labels are 132 px with
  `overflow:hidden; white-space:nowrap`, so the menu shows three unlabelled checkboxes. Cosmetic in
  the sense that the values are selectable, serious in that a user cannot tell what they are ticking.
* **Calculated Value admin page looked blank.** Rule names live in `<input value>`, which does not
  appear in `innerText`. All five rules are named and active.
* **One save flips every component to "Accepted by technician".** The three components share one
  `analysisId` (542), and status belongs to the analysis, so this is by design — but it does mean a
  multi-component analysis can reach "Results final" with some components never resulted, and
  nothing warns. Worth a product decision rather than a bug.

## 2026-08-25 — result type coverage, and a type that cannot be resulted

Chain DEV01260000000000570 ordered two tests on one Serum sample: 548
`QA_AUTO_0727_02754 TiterRT` (component TITER1, **resultType T**) and 546
`QA_AUTO_0727_14692 Critical` (component VAL, resultType N, normal 5–100, critical 2/150,
valid 0–300).

### DEFECT — a Titer test can be configured and ordered but never resulted

The Titer row in Results Entry renders **no control at all**. Its Result cell contains exactly:

    <span class="unifiedValueAccent"><span></span></span>

No input, no select, no Carbon widget, and no Save in the Actions column. The row stays
"Not started" with no way to advance it, while the numeric test on the same sample resulted and
validated normally. Confirmed on a fresh load, and tests 547 and 538 carry the same `TITER1:T`
shape.

**Root cause, from source.** `frontend/src/components/resultPage/unified/PolymorphicResultCell.tsx`
switches on `row.resultType`:

| case | control |
| --- | --- |
| `D` | `Select` |
| `M` | `ResultMultiSelect` |
| `C` | `CascadingMultiSelect` |
| `N` | `TextInput` (number) |
| `R`, `A` | `TextArea` |
| `default:` | `<span>{row.resultValue \|\| ""}</span>` |

**There is no `case "T"`.** Titer falls to `default` and renders a bare span. Searching
`frontend/src` for `resultType === "T"` or `case "T"` returns nothing; the word "Titer" appears only
in `admin/testCatalog/sections/SampleResultsSection.jsx` — the editor that offers it.

**The editor does offer it, as a first-class choice.** `SampleResultsSection.jsx` defines
`PRIMARY_RESULT_TYPES = ["N","D","R"]` and `ADVANCED_RESULT_TYPES = ["M","C","T","A"]`, rendered as
radio tiles. The Titer tile is enabled and described: *"A dilution ratio such as 1:10 or 1:20
(common in serology)."* So the catalog offers **seven** result types and Results Entry can render
**six**.

Serology titers are a real clinical need, so this is not a theoretical gap — a lab that configures
one gets a test that is orderable, appears on the worklist, and dead-ends.

Covered by `tests/result-type-coverage.spec.ts` (config `rtype.config.ts`), written against the
renderable set rather than against "T", so an eighth type added without a case trips it too.

### Working — critical flagging

Entering **200.0** against normal 5–100 with critical high 150 flagged **Critical** after
validation. Worth knowing about the timing: the Flag column is **empty while the result sits at
"Accepted by technician"** and only populates at "Results final". The same held on order …564
(Abnormal, Invalid). So an empty Flag column before validation is not a missing flag.

Also confirmed here: two tests ordered on one sample are two independent analyses with independent
statuses — the titer stayed "Not started" while the numeric went to "Results final". That contrasts
with the multi-component case on test 446, where three result rows share one `analysisId` and one
status.

## 2026-08-25 — root causes for the three open defects

### 1. Multi-select misrouting — found, and the intent behind it is sound

The frontend is not at fault. `UnifiedResults.handleValueChange` keys edits by
`worklistRowKey = analysisId + testResultComponentId` and carries an explicit FR-A′3 comment about
updating only the edited row; `handleSave` posts the whole row, `testResultComponentId` included, to
`POST /rest/results-entry/analysis/{analysisId}/result`.

The binding happens server-side in `ResultEntryRestController.reuseExistingResultForComponent`,
whose own Javadoc states the intent:

> Idempotency guard for the per-analysis save: a payload with a BLANK resultId means "new result" to
> the legacy save service — but if this analysis already has a persisted result for the row's
> component … inserting again duplicates the component. Bind the item to the existing result so the
> save UPDATES it. **Multiselect rows legitimately hold several results per component and manage
> their own lifecycle — they are left alone.**

and enforces it with an early return:

```java
if (!GenericValidator.isBlankOrNull(item.getResultId())
        || ResultType.isMultiSelectVariant(item.getResultType())) {
    return;
}
```

`isMultiSelectVariant` is `"MC".contains(type)` — so **M and C both take the early return**.

The reasoning is defensible: a multi-select genuinely can hold several `Result` rows per component,
so binding it to one existing row would be wrong. **The gap is what it falls through to.**
`reuseExistingResultForComponent` is the only thing in the save path that turns component identity
into something the persist layer acts on, and the legacy path it defers to —
`LogbookResultsController` — contains **no reference to component ids at all** (`getComponentId`,
`setComponentId`, `getTestResultComponentId` all return nothing on a grep).

So a multi-select save arrives with no component binding whatever, and the legacy path attaches the
new `Result` to whichever `TestResult` row it finds — empirically the dictionary component's. That
explains both observed shapes exactly: the value lands on the Dictionary component (coercing its
type D→M) when that component is empty, and appends a fourth row when it already holds a value.

**The comment says multiselect rows "manage their own lifecycle". Nothing in the legacy path
actually does.** That sentence describes an intention that was never implemented downstream.

Predicted, not yet observed: **Cascading multi-select (C) is affected identically.**

### 2. Titer — a real backend type with no entry UI anywhere, old or new

Not a legacy stub. `TypeOfTestResultServiceImpl.ResultType` declares
`REMARK("R"), DICTIONARY("D"), TITER("T"), NUMERIC("N"), ALPHA("A"), MULTISELECT("M"), CASCADING_MULTISELECT("C")`,
and every constant resolves its id from a `type_of_test_result` DB row at startup — a missing 'T'
row would fail the `@PostConstruct`. `TestResultConfigurationHandler.isValidResultType` accepts T,
and its own comment documents the storage format: *"D, M, C store dictionary IDs; **T stores titer
values like '1:10'**"*.

What is missing is only the entry control:

* No `case "T"` in `PolymorphicResultCell.tsx`; a T row hits `default:` and renders a bare span.
* `resultType === "T"` / `case "T"` appear nowhere in `frontend/src`.
* "titer" appears nowhere in `src/main/webapp` either — **the legacy JSP UI never rendered it
  either**, so this is not a regression from the React rewrite.

**So the fix is to add the missing case, not to retire the option.** The data model, the importer
and the catalog editor all support Titer; only result entry never has.

### 3. Batch Test Reassignment — both halves confirmed in source

Frontend, `BatchTestReassignmentAndCancelation.jsx`:

```js
const [sampleTypeToGetId, setSampleTypeToGetId] = useState(null);
...
useEffect(() => {
  getFromOpenElisServer(`/rest/AllTestsForSampleTypeProvider?sampleTypeId=${sampleTypeToGetId}`, …);
}, [sampleTypeToGetId]);
```

The effect runs on mount with the initial `null` and template-interpolates it, producing the literal
string `"null"`. The same shape drives `getPendingAnalysisForTestProvider?testId=${…}`. Neither
effect guards the unset state. Two other callers of the same endpoint
(`AssociatedTestsSection.jsx`, `SampleTypeManagement.jsx`) at least wrap the id in
`encodeURIComponent`, so the omission here is inconsistent as well as wrong.

Backend, `AllTestsForSampleTypeProviderRestController` and
`PendingAnalysisForTestProviderRestController`, identical shape:

```java
if (sampleTypeId == null || sampleTypeId.isEmpty()) { return 400 …; }
try   { return ok(createJsonGroupedTestNames(sampleTypeId)); }
catch (Exception e) { LogEvent.logDebug(e); return 500 …; }
```

`"null"` is neither null nor empty, so it clears the guard and fails downstream on id parsing. That
matches the measured behaviour exactly: omitted → 400, `"null"` → 500, `9999` → 200 empty.

Two things worth fixing alongside it: the exception is logged at **DEBUG**, which is why a 500 on
every visit to this page has gone unnoticed; and the **400** body reads "Internal error, please
contact Admin and file bug report", describing a client error as an internal one.

### Blast radius — a catalog-wide result-type census

Every one of the 588 catalogue tests was queried for its components' result types.

| Result type | All tests | On the 214 active tests |
| --- | --- | --- |
| N numeric | 146 | 106 |
| D dictionary | 74 | 51 |
| R free text | 73 | 59 |
| **T titer** | **27** | **4** |
| M multi-select | 18 | 1 |
| C cascading | 15 | 0 |
| A alpha | 15 | 1 |
| *(no type set)* | **197** | 1 |

**Only 5 active tests currently declare something Results Entry cannot render**, and four of those
are QA-created titer tests. The fifth is `321 Histopathology examination`, whose PRIMARY component
has no result type at all — and pathology is resulted through `PathologyCaseView.jsx`, which does
not consult `resultType`, so that is almost certainly by design rather than a defect. Worth one
confirmation from someone who knows the pathology flow.

So the honest severity read: **the Titer gap is a real dead end that a lab will hit the moment it
configures a serology titer, but it is not breaking production tests on this instance today.** The
197 typeless components are overwhelmingly on inactive tests and predate the editor's FR-56 rule
that now requires an explicit type.

### Refinement — the misroute needs a MULTI-component test

Predicted from source that Cascading (C) would misroute like Multi-select (M), since
`isMultiSelectVariant` is `"MC"`. Tested it: activated `495 QA_AUTO_0725_02879 Abx by organism C`
(a **single**-component C test) and ran order DEV01260000000000571 through Results Entry with real
input. It saved **correctly**:

    Abx by organism C(Serum)   type C   val "HIV-1 DNA DETECTED"   multi {"0":"1332"}

One row, right component, right type. So the prediction as stated was too broad, and the true
condition is sharper:

> **The misroute bites only when an M or C component sits alongside other components on the same
> test.** With a single component there is nothing to misroute onto, so the missing component
> binding is harmless.

That is exactly consistent with the root cause — `reuseExistingResultForComponent` returning early
means the save carries no component identity, which only matters when the analysis has more than one
result row to choose between. On test 446 (N + D + M) the value landed on the D component; on test
495 (C alone) it landed where it belonged.

**Blast radius, corrected:** from the catalogue census, a test needs (a) two or more components and
(b) at least one of them M or C. Test 446 is the only such test found on this instance, and it is
QA-created. So this is a latent defect waiting on a realistic configuration — an antibiogram or a
differential with a multi-select alongside a numeric would hit it — rather than one breaking work
today.

**State note:** test 495 was **inactive** before this check and I activated it to run the chain
(`POST /rest/test-catalog/tests/495/activate`). It is a QA_AUTO test and I left it active, since it
gives us the only orderable C-type test for future runs. Say if it should go back to inactive.

## 2026-08-25 — refer-out, NCE and disposition chains (order DEV01260000000000572)

One order, three tests (Demo Glucose 550, QA_AUTO_0727_14692 Critical 546, Amylase 5), used to drive
the referral, non-conformity and result-disposition paths.

### DEFECT — a referral raised from Results Entry is invisible to the Reference Lab dashboard

Expanding a result row exposes **Refer this test**, which reveals a Reference laboratory picker
(National / Regional Reference Laboratory) and a Referral reason picker (11 reasons). Choosing
*National Reference Laboratory* + *Confirmation requested* and saving works: the analysis reads back
`referredOut: true`, `referralId: "3"`, status 15.

**But the referral appears nowhere it should.**

* `Results → Referred Out` (`/SampleShipment/reference-lab-results`) shows
  *"No referrals found for the selected filters"* with the date filters empty and the days bucket on
  **All** — nothing is being filtered out.
* `GET /rest/reference-lab-results/referrals?view=outstanding` returns `[]`.
  (`view` accepts only `outstanding`, `returned`, `history`; anything else is a 400.)
* `GET /rest/reference-lab-results/metrics` returns `{"outstanding":0,"returned":0,…}`.
* The Shipment Dashboard does not list it either.

**Root cause — the write path and the read path disagree on the status vocabulary.**

`ResultUtil.handleReferrals`, the refer-out path Results Entry uses, is annotated
`@SuppressWarnings("deprecation")` and writes:

```java
referral.setStatus(ReferralStatus.SENT);
```

`SENT` is **deprecated** in `ReferralStatus` — *"@deprecated Use REQUESTED. Slated for removal once
legacy referral flow migrates."* Meanwhile the dashboard reads:

```java
OUTSTANDING_STATUSES = Arrays.asList(REQUESTED, RECEIVED, IN_PROGRESS);
```

which does **not** include `SENT`. And `ShippingBoxServiceImpl` only picks up referrals whose status
is `DRAFT`, so the shipment flow ignores it too.

The migration is half-done rather than absent: `ReferralServiceImpl.getUncanceledOpenReferrals()`
deliberately spans both vocabularies — `DRAFT, REQUESTED, RECEIVED, IN_PROGRESS, CREATED, SENT` —
so some consumers do know about the legacy statuses. The new Reference Lab Results service is the
one that does not.

**Effect:** a tech refers a test out and it lands in a status no dashboard queries. Nothing warns
them, and the referral cannot be tracked, shipped or reconciled through the UI.

### Working — non-conformity raised from Results Entry, with result disposition

The inline NCE form is well built. Its **CONTEXT (Auto-populated)** banner carries
`Lab #: DEV01260000000000572 - Test Name: … , Patient: …`, and a **Linked Samples/Results** block
confirms both links with ticks (`Sample: DEV01260000000000572-1`, `Result: Amylase(Serum)`).
Category cascades to Type (Analysis → 13 types, General → 5, Sample → 19), Severity is a
three-tile choice, and a **Result disposition** row offers *None / Cancel result / Retest* with the
caption *"Applied when the NCE is submitted. Refer-out is a separate row action, not a disposition."*

Two NCEs were created and both verified through `GET /rest/nce/dashboard`:

| NCE | Severity | Disposition | Effect |
| --- | --- | --- | --- |
| NCE-2026-00001 | MINOR | None | analysis untouched |
| NCE-2026-00002 | MAJOR | Cancel result | **Amylase removed from the worklist** |

The Cancel disposition fired `POST /rest/sample-management/cancel-test` alongside
`POST /rest/reportnonconformingevent`, and the read-back confirms the Amylase analysis is gone. Both
NCEs carry `labOrderNumber: DEV01260000000000572`. The NCE number increments correctly
(00001 → 00002), which is also how we proved the first submission attempt had genuinely not
persisted.

### HARNESS — the click-coordinate trap that nearly produced two false defect reports

`mcp__claude-in-chrome__computer` takes coordinates in **screenshot space**, not CSS-pixel space. On
this display the screenshot is 1372 px wide against a 1440 px viewport, so:

    scale = 1372 / window.innerWidth = 0.9528

Feeding `getBoundingClientRect()` values straight to the click action therefore misses low and to
the right, by ~5% of the offset from the origin — enough to hit the wrong control or empty space.

This produced a **false negative that looked exactly like a defect**: clicking "Create NCE" appeared
to issue no network request at all, with no error and no notification, and the NCE dashboard stayed
empty. The obvious conclusion — *"Create NCE is inert"* — was wrong. The click had simply landed
54 px right and 22 px low of the button. Clicking the position read off a screenshot worked
immediately.

**Rules that follow:**

1. Take click coordinates from a **screenshot**, or convert with
   `Math.round(cssX * 1372 / window.innerWidth)`.
2. Before reporting "the button does nothing", confirm the handler ran. The cheapest proof is
   `performance.getEntriesByType('resource')` before and after — it is passive and survives the
   SPA restoring native `fetch` over an injected recorder.
3. A stray keystroke aimed at a mis-located control lands in whatever *is* focused. One "S" meant
   for a category picker silently appended to Reporter Name, producing "Open ELISS". Always read
   the field back after a keyboard selection.


## 2026-08-25 -- the chains are now protected, and one of them was not passing

### The four behaviours that work are now green and automated

`tests/docs/catalog-feature-chains.docs.spec.ts` (config `chains-features.config.ts`) drives ONE
clinical order end to end and asserts four catalogue features against the server, not the screen.
Run of 2026-08-25 on `testing` 3.2.2.0, order `DEV01260000000000576`: **6 passed in 1.4 min.**

| id | behaviour | evidence in that order |
|---|---|---|
| TC-CHAIN-0 | the catalogue fixtures still exist | panel 17 present, spans Serum + IHC |
| TC-CHAIN-1 | a panel contributes its matching member | `Amylase(Serum)` ordered |
| TC-CHAIN-2 | a reflex rule fires on threshold | Glucose `250.0` added `Demo HbA1c 250395(Serum)` |
| TC-CHAIN-3 | a calculated value computes | Amylase `999` gave `Creatinine(Serum)` = `1998` |
| TC-CHAIN-4 | an out-of-range value is flagged and survives validation | critical test at `200.0` |

One order rather than four is deliberate: the wizard is the slowest and flakiest part of the run and
the four features are independent of one another.

**Not covered:** the refer-out / NCE / disposition chain. That path is dense in Carbon composite
widgets that only answer to trusted clicks, so it was left out rather than half-automated. It has
been proven by hand and is NOT protected by anything.

### A defect fell out of writing the green spec

Ordering panel `QA Panel Test 20260811` against a **Serum** sample also creates an analysis for
`Actin Smooth Muscle`, whose only configured sample type is **Immunohistochemistry specimen**. The
row comes back from `/rest/LogbookResults` as `Actin Smooth Muscle(Serum)`.

So an IHC stain is now an orderable, resultable, validatable analysis sitting on a serum tube.

Encoded as a RED regression: `tests/panel-sample-type-leak.spec.ts` + `panel-leak.config.ts`. Its
two guard tests are green (the panel really does span two types; the member really is IHC-only) and
the defect assertion is red with the offending worklist in the message.

**Honest caveat, recorded so nobody builds on a wrong baseline.** An earlier hand-driven order,
`DEV01260000000000564`, came back as `Amylase(Serum)` + `Creatinine(Serum)` with no Actin Smooth
Muscle, and this session had it written down as a panel order. That is equally consistent with
Amylase having been ticked directly rather than through the panel. Treat 564 as **inconclusive**,
not as evidence that this is a recent regression.

Ruled out before reporting: the tick goes through the visible label in the Serum section -- the same
element a human clicks -- and restricting `tickByExactLabel` to visible labels changed nothing
(orders 575 and 576 both leaked).

### Three harness traps found while doing it

* `/SamplePatientEntry` is not the clinical order wizard; `/order/clinical/enter` is. Both render an
  input whose id is `labNumber`, but on the former it is the *Previous* Lab Number search box.
* A config that sets `storageState` without a `setup` dependency silently reuses a stale cookie, and
  a stale cookie answers **HTTP 200 with the login page**. `census.config.ts` still has this gap.
* Panels do not live under `/test-catalog`. `/rest/PanelCreate` returns
  `{ existingPanelList: [ { typeOfSampleName, panels: [...] } ] }`, grouped by sample type, with the
  same panel repeated under every type it spans. The guessed URL answered 200 with an empty body,
  so it failed as *the panel is missing* rather than *the URL is wrong*.


## 2026-08-25 (later) -- the panel leak is universal, and it is a code regression

### It is not a QA fixture problem. It is every panel.

`GET /rest/sample-type-tests?sampleType=<id>` answers `{ tests[], panels[] }`. `tests[]` is correctly
filtered to the sample type. Each panel carries a `testIds` list, and that list is **not** filtered.
Measured across all 12 sample types on `testing` 3.2.2.0:

**15 of 15 panel offerings leak.**

| sample type | panel | foreign members |
|---|---|---|
| Urines | Bilan Biochimique | 21 of 22 |
| Plasma | Bilan Biochimique | 21 of 22 |
| Immunohistochemistry specimen | Bilan Biochimique | 20 of 22 |
| Immunohistochemistry specimen | NFS | 18 of 20 |
| Serum | Bilan Biochimique | 15 of 22 |
| Whole Blood | NFS | 2 of 20 |
| ... | ... | (9 more) |

Proven end to end on a **stock** panel, not a QA fixture. Order `DEV01260000000000578`, Bilan
Biochimique ticked against Serum, produced 14 analyses including `AMACR (p504 s)(Serum)` and
`Actin Smooth Muscle(Serum)` -- both immunohistochemistry stains, now sitting on a serum tube.

### Root cause: a filter that exists in the legacy path was dropped in the REST/React rewrite

Two independent layers, either of which would cause it on its own.

**1. `SampleEntryTestsForTypeProviderRestController.getTestIndexesForPanels`** (around line 276).
It takes a `testIdOrderMap` built from the sample-type-filtered test list, and **never reads it**:

```java
for (PanelItem item : items) {
    String derivedNameFromPanel = getDerivedNameFromPanel(item);
    if (derivedNameFromPanel != null) {
        String ItemId = item.getTest().getId();
        if (ItemId != null) { indexes.append(ItemId).append(chr comma); }
```

The legacy XML provider, `SampleEntryTestsForTypeProvider` around line 246, still has the guard:

```java
Integer index = testIdOrderMap.get(derivedNameFromPanel);
if (index != null) { indexes.append(index.toString()); }
```

A panel item absent from the sample type's test list is dropped there. The REST rewrite switched to
emitting real test ids instead of indexes and lost the map lookup in the process. The dead parameter
is the fingerprint.

**2. `SampleTestSection.jsx` `handlePanelToggle`** (around line 299). Ticking a panel expands
`panel.testIds` into the sample item's test list and consults `availableTests` **only for a display
name**; a test id absent from that list is still pushed, with `name` falling back to the raw id. The
legacy `addOrder/SampleType.jsx` around line 292 does guard, skipping when `findTestIndex(testId)`
returns -1.

**3. The backend is a faithful pass-through, not the culprit -- but it has no backstop.**
`SampleAddService` does not expand panels at all (it uses the panel list only to stamp
`analysis.panel`), and `SamplePatientEntryServiceImpl.populateAnalysis` never compares the test
against the sample item's type of sample. `TypeOfSampleTestService` is autowired in
`SampleEditServiceImpl` and never called.

### What I could NOT establish

Whether this is a regression against 3.2.1 or has always been true of the REST path. The source
clone on hand is shallow (one commit), so there is no history to bisect. What the code does show is
that the legacy path has the filter and the REST path does not, which points at the rewrite -- but
that is an inference, not a dated finding.

### Route census, re-run with the auth gap fixed

`census.config.ts` now declares a `setup` dependency (harness backlog 12). Re-run: **127 passed /
1 failed in 7.4 min.**

The single failure is Batch test reassignment, and it is the *already-filed* null-in-URL pattern:

```
500 /rest/getPendingAnalysisForTestProvider?testId=null
500 /rest/AllTestsForSampleTypeProvider?sampleTypeId=null
```

Same shape as OGC-1187 / OGC-1120 -- a React `useState(null)` interpolated into the URL, which the
backend then answers with a 500 rather than a 400.
