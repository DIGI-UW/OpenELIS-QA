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
