# Analyzer guided setup (Instrument → Verify → Connect) — QA suite

**Spec:** `analyzer-profile-mapping.md` (Analyzer Types & Mapping FRS) · story **OGC-1057**.
**Target:** analyzers.openelis-global.org · **v3.2.2.0** ("M3"). **Re-baselined:** 2026-08-25.
**Spec/file:** `analyzer-guided-setup.spec.ts`.

> **This suite was rewritten for 3.2.2.0.** The 2026-08-12 revision graded v3.2.1.11 and asserted
> routes and endpoints that now 404 — it failed on missing routes rather than on real deltas. The
> earlier run's report is `qa-report-analyzers-20260812-1300.md` and `openelis-work` PR #264; treat
> both as **historical**, not current. Verdicts for this round were recorded in the instance's
> in-app review widget (submission **id 16**).

## What changed between builds (read this before comparing reports)
The database was reseeded, the UI was reworked, and the API surface moved. Of the 13 findings from
the 2026-08-12 run, **11 are fixed**. The suite below encodes the survivors and the new ones.

| Old finding | Status on 3.2.2.0 |
|---|---|
| Δ-A separate full-page routes | **Fixed** — sections are inline, driven by `?setup=` |
| Δ-B undocumented 4th "Review" step | **Fixed** — three steps |
| Δ-D no "instrument isn't listed" path | **Fixed** — links to Analyzer Types → Create Profile with `returnTo` |
| Δ-E no catalog resolution / wrong bindable set | **Fixed** — real binding, LOINC shown, all 183 catalog tests, type-ahead jumps to match |
| Δ-F silent partial profile apply | **Fixed** — explicit "Do not receive", X/Y·% counts |
| Δ-G sign-off unreachable | **Fixed** — confirmation w/ signer + timestamp, stales on change, gates Continue |
| Δ-H QC codes not confirmable | **Fixed** — "Order field 12 equals Q" shown in Verify |
| Δ-I no Resolve | **Fixed** — map or exclude per code |
| Δ-J / Δ-M QC + control lot gated activation | **Fixed** — QC absent from activation blockers |
| Δ-N hard Delete | **Fixed** — Deactivate / Reactivate, no Delete anywhere |
| Δ-O binding change could not be saved | **Fixed** — PUT 200, survives reload |
| Δ-P no GUI path to map a code | **Fixed** — per-row picker over the whole catalog |
| Δ-K no Results-only/Two-way data flow | **STILL OPEN** → Δ-K |
| Δ-R control-lot error not surfaced | **STILL OPEN** → Δ-R |

New this round: **Δ-S**, **Δ-V**, **Δ-W**. Raised and then **withdrawn** this round: **Δ-T**,
**Δ-U**, **Δ-X** — see Withdrawn on evidence.

## Routes (3.2.2.0)
| Surface | URL |
|---|---|
| Setup, inline | `/analyzers?setup=instrument\|verify\|connect[&analyzerId=&profile=&revision=]` |
| Deactivate dialog | `/analyzers?lifecycle=deactivate&lifecycleAnalyzerId={id}` |
| Analyzer Types | `/analyzers/types` · `?action=create` · `?action=create&draft={uuid}` |
| Type mappings | `/analyzers/types/{profileId}/mapping?revision=N[&returnTo=]` |
| Analyzer-scoped QC | `/analyzers/qc/instruments/{analyzerId}[?returnTo=]` |
| QC config | `/analyzers/qc/control-lots[/new]` · `/analyzers/qc/rule-config` · `/analyzers/qc/db` |

`/analyzers/{id}/mappings`, `/analyzers/{id}/edit` and `/analyzers/{id}/review` are **gone** — they
fall through to the API path.

## REST contract
```
GET  /rest/analyzer/analyzers                    → { analyzers: [...] }   ← WRAPPED
POST /rest/analyzer/analyzers                    → 201 {id, name, profileId, profileRevision, testUnitIds}
PUT  /rest/analyzer/analyzers/{id}               → 200
GET  /rest/analyzer/analyzers/{id}               → detail (see below)
     ── every non-GET above requires  X-CSRF-Token: <localStorage.CSRF>
        without it: 403 {"message":"CSRF token missing or invalid"}
POST /rest/analyzer/analyzers/{id}/test          → runs the connection probe
GET  /rest/analyzer/analyzers/{id}/activation-readiness → {ready, activated, blockers[]}
POST /rest/analyzer/analyzers/{id}/activate      → 200 {status:"ACTIVE",activated:true} · 422 when not ready
POST /rest/analyzer/analyzers/{id}/deactivate    → 200 {status:"INACTIVE",deactivated:true}
POST /rest/analyzer/analyzers/{id}/reactivate    → 200 {status:"ACTIVE",activated:true}
GET  /rest/analyzer-types?active=true
GET  /rest/analyzer-types/{profileId}/mapping?revision=N
PUT  /rest/analyzer-types/{profileId}/mapping?revision=N  → saves a candidate binding
POST /rest/qc/controlLot                         → 400 w/ plain-string reason (Δ-R)
GET  /rest/displayList/ALL_TESTS                 → 183 tests
```
`profileId` is a bare slug (`genexpert-astm`) — **no protocol prefix**, unlike 3.2.1.11's
`astm/genexpert-astm`.

**Analyzer detail** — `{id, name, testUnitIds, profileId, profileRevision, profileFingerprint,
bridgeConnectionId, status, connected, connection}`. `connection` is the interesting part and is a
**declarative field schema**, which makes most of the Connect assertions DOM-independent:

```jsonc
connection: {
  connectionId, clientAnalyzerId, displayName,
  profileRef: { profileId, revision, fingerprint },
  configRevision, configFingerprint,
  fields: [                          // the UI renders FROM this
    { key: "transport",       inputKind: "SELECT", required: true,
      choices: ["RS-232","TCP/IP"], currentValue: "TCP/IP" },
    { key: "connectionRole",  choices: ["SERVER","CLIENT"],
      visibleWhen: { fieldKey: "transport",      operator: "NOT_EQUALS", value: "RS-232" } },
    { key: "host",  inputKind: "TEXT",
      visibleWhen: { fieldKey: "connectionRole", operator: "EQUALS",     value: "CLIENT" } },
    { key: "port",  inputKind: "NUMBER", currentValue: 9601 }
  ],
  readiness:  { ready, blockers[] },
  latestProbe:{ requestId, configRevision, status: "FAILED"|"SUCCEEDED", completedAt },
  desiredRuntimeState, actualRuntimeState, activeRuntimeRef, updatedAt
}
```
There is **no `dataFlow` field** in that schema — which is Δ-K, stated precisely.

**Mapping payload** — `{profileId, profileRevision, profileFingerprint, displayName, protocol,
siteBindingId, siteBindingRevision, bindingFingerprint, tests[], controlRecognition, confirmation}`.
A test row is:

```jsonc
{ sourceRowKey: "MTB-RIF", rawCode: "MTB-RIF", aliases: [], loinc: "85362-2",
  resultType: "qualitative", mappingState: "BOUND" | "EXCLUDED" | "UNBOUND",
  testId: "395", selectedTest: { id, name: "Xpert MTB/RIF", loincCodes: [...] },
  results: [ { rawValue: "MTB DETECTED", mappingState: "BOUND",
               resultOptionId: "646", selectedOption: { id, value, label } } ] }
```
`confirmation` is `{state: "CURRENT", profileId, profileRevision, bindingFingerprint,
recognitionFingerprint, confirmedBy, confirmedByDisplayName, confirmedAt}` — pinned to **both**
fingerprints, which is the mechanism that stales it when a binding or the recognition rule changes.

Blocker codes: `analyzer.activation.blocker.mappings`, `analyzer.activation.blocker.recognition`,
`analyzer.connection.readiness.missingRequiredValues`.

## Suites & cases
| ID | Case | Criterion | 2026-08-25 |
|---|---|---|---|
| TC-ANZ-M3-01 | Add Analyzer expands inline; list stays visible | FUNCTION | PASS |
| TC-ANZ-M3-02 | The three FRS sections render; no undocumented fourth | RENDER | PASS |
| TC-ANZ-M3-03 | Type picker jumps to a match but never narrows the list | FUNCTION | **FAIL** (Δ-W, minor) |
| TC-ANZ-M3-04 | "Instrument not listed?" → Create Profile | FUNCTION | PASS |
| TC-ANZ-M3-05 | Create from a clean list POSTs a new analyzer | ROUND-TRIP | PASS |
| TC-ANZ-M3-06 | Add while an analyzer is open must not reuse it | ROUND-TRIP | **FAIL** (Δ-S) |
| TC-ANZ-M3-07 | Rows bind to catalog tests; every code accounted for | CROSS-LINK | PASS |
| TC-ANZ-M3-08 | Test picker offers the catalog; jumps by name and LOINC, never narrows | RENDER | **FAIL** (Δ-W, minor) |
| TC-ANZ-M3-09 | The mapping is a versioned, fingerprinted artefact | ROUND-TRIP | PASS |
| TC-ANZ-M3-10 | Confirmation is pinned to the binding it signed | FUNCTION | PASS |
| TC-ANZ-M3-11 | A CURRENT confirmation records signer + timestamp | PERSIST | PASS |
| TC-ANZ-M3-12 | QC readiness does not gate activation | CROSS-LINK | PASS |
| TC-ANZ-M3-13 | Connection schema declares role-conditional visibility | RENDER | PASS |
| TC-ANZ-M3-14 | The probe is real and its outcome is recorded | FUNCTION | PASS |
| TC-ANZ-M3-15 | Results-only / Two-way data flow is offered | RENDER | **FAIL** (Δ-K) |
| TC-ANZ-M3-16 | Activation succeeds when readiness reports ready | FUNCTION | PASS |
| TC-ANZ-M3-16b | The not-ready path returns a named 422 | FUNCTION | PASS |
| TC-ANZ-M3-17 | Deactivate → reactivate round-trips through the API | ROUND-TRIP | PASS |
| TC-ANZ-M3-17b | The lifecycle is reachable from the UI; no hard Delete | FUNCTION | PASS |
| TC-ANZ-M3-18 | Lifecycle dialogs interpolate the analyzer name | RENDER | **FAIL** (Δ-V) |
| TC-ANZ-M3-19 | Control-lot validation is surfaced on the field | FUNCTION | **FAIL** (Δ-R) |

## Maturity
**M3.** Instrument, the mapping editor and the full analyzer lifecycle all round-trip through a
second surface, and the mapping cross-links to the real test catalog. REPORTABLE is not evidenced —
but only because result ingestion needs the analyzer simulator, which this instance does not have,
not because anything in the module blocks it. Nothing here is a blocker.

## Δ ledger (open)
- **Δ-W — the pickers jump to a match but never narrow the list.** Both Carbon ComboBoxes accept
  text and neither filters. The analyzer type picker (`#analyzer-setup-type`, placeholder *Search
  analyzer types*) holds its option count at 3 for any query; the per-row test picker
  (`#analyzer-test-{rawCode}`, placeholder *Search by name, code, or LOINC*) holds at **183 before
  and 183 after**. What the control does instead is **jump to the match and highlight it**, and
  that part works on both a name prefix (`Hemato` → *Hematocrit · Hematocrit-Blood · 4544-3*) and a
  LOINC (`85362` → *Xpert MTB/RIF · 85362-2*), so the placeholder's promise is kept. The cost is
  that the menu never shrinks: a user comparing candidates, or unsure of the exact spelling, still
  scrolls 183 rows. Severity **minor / UX** — this is the narrow, real residue of the two
  "there is no search" claims that were withdrawn, and it is worth stating precisely so it is not
  raised a third time. Fix is one prop on the Carbon `ComboBox` (`shouldFilterItem`).
- **Δ-K — no data-flow control.** The connection field schema carries `transport`,
  `connectionRole`, `host`, `port` — who opens the socket and over what — and **no `dataFlow`
  field**. The FRS's `Results only (one-way)` / `Two-way (send orders/queries)` choice does not
  exist, so AC-10 cannot be satisfied as written. Possibly a **spec question**: if data flow is now
  derived from the protocol by Analyzer Bridge, FR-F2 and AC-10 should say so.
- **Δ-R — control-lot validation is still hidden.** `POST /rest/qc/controlLot` → 400
  `"Manufacturer fixed method requires both mean and standard deviation"`, but the banner reads
  only "Failed to save control lot"; Mean/SD stay behind *Statistics Configuration → Configure*,
  unmarked as required. **Unchanged since 2026-08-12** — reported then, shipped again.
- **Δ-S — Add Analyzer does not reset the setup panel.** With an analyzer open (row menu → Edit
  setup), clicking Add Analyzer drops `analyzerId` from the URL but keeps the previous analyzer's
  values and identity; Continue then issues `PUT /rest/analyzer/analyzers/{previous id}`, silently
  renaming it. From a clean list page Add works correctly (POST 201). Data-integrity risk when a
  lab adds a second identical instrument.
- **Δ-V — both lifecycle dialogs render the literal `{name}` placeholder.**
  *"Deactivate {name}? New runtime use will stop…"* and *"Reactivate {name}? Its setup will be
  checked again before it can be used."* Same defect class as the old Delete-dialog placeholder bug
  (NOTE-22); it moved with the rename rather than being fixed, and it is now in two places.
- **Minor:** the Port field shows "This field is required" while holding a value until blurred; the
  analyzer-scoped QC page displayed "In Control" for an analyzer with no control lot.

### Withdrawn on evidence
- **Δ-T — "activate and deactivate both return 500."** **WITHDRAWN.** Raised at blocker severity
  during the 2026-08-25 manual run, from hand-rolled `POST`s that omitted the CSRF header
  (harness rule 1). With `X-CSRF-Token` present, every transition returns **200**, on analyzers
  **363 and 364**, in both directions and repeatedly:
  `activate → 200 {"status":"ACTIVE","activated":true}` ·
  `deactivate → 200 {"status":"INACTIVE","deactivated":true}` · `activate → 200 ACTIVE`.
  The UI paths agree — *Finish and activate* issues `PUT 200` + `POST /activate 200`; the row menu's
  *Deactivate* and *Reactivate* both return 200 and the row's status flips. A request without the
  header returns `403 {"message":"CSRF token missing or invalid"}`, never 500, so the 500s the
  manual run saw were not simply the missing header either — either the build changed under us or
  the probe was malformed. **Either way the defect does not reproduce and must not be filed.**
- **Δ-U — "reactivate is untestable."** **WITHDRAWN** with Δ-T. The row menu offers *Reactivate*
  only on inactive rows, its dialog confirms, and `POST …/reactivate` returns 200 → ACTIVE.
- **"The instrument picker has no search"** (round 1, 3.2.1.11). **Withdrawn as stated.** Synthetic
  keystrokes sent to an **unfocused** page were swallowed by a global search shortcut that
  navigated to `/analyzers/types?search=sys` and abandoned the setup. The narrower, real finding on
  3.2.2.0 is **Δ-W**.
- **"Add Analyzer overwrites the analyzer you were looking at."** Withdrawn as stated — from a
  clean list, Add creates a new analyzer correctly (POST 201). The real finding is **Δ-S**.
- **Δ-X — "Continue is enabled with no lab units, then fails silently."** **Withdrawn.** It does not
  submit, correctly, and the panel raises *"Select at least one lab unit"*. The field is validated;
  the first look simply missed the notice.

## Design questions for the PO (not defects)
- **Create Profile collects only a name**, then reports *"Profile draft created — saved in Analyzer
  Bridge. It must be completed and validated before it can be published for analyzer setup."* So
  FR-B3's protocol and connection type are defined outside OpenELIS. Reachable, but a lab admin
  cannot finish the job in this UI — confirm that is intended.
- The analyzer-scoped QC link opens a monitoring view (Activity Timeline / Control Chart);
  control-lot and Westgard configuration live in the sidebar, so the QC step cannot be completed
  from the analyzer link itself.

## Untested
Learn-from-traffic (FR-B7/B8, FR-G) still needs the analyzer simulator — now against the Bridge
listener — and with it everything downstream of an ACTIVE analyzer: result ingestion, reconciliation
against the mappings, pending codes and pending result values. That is the only thing standing
between this module and a REPORTABLE grade. Duplicate Profile exists but was not exercised.
Mobile/responsive not run.

Note the instance now ships **3 analyzer types** (Bruker FluoroCycler XT, Cepheid GeneXpert ASTM,
Thermo Fisher QuantStudio QS5/QS7), not the 20 profiles of round 1 — the reseed changed the shipped
catalog, so profile-coverage findings from 2026-08-12 do not carry over.

## Harness rules this suite depends on
Each of these cost a run, or a withdrawn finding, to learn.

1. **Writes need CSRF.** Every non-GET REST call must carry `X-CSRF-Token`, and the token lives in
   **`localStorage.CSRF`**. Without it the server answers **403** — and a hand-rolled probe then
   "disproves" a finding it never actually reached. The first re-baseline run failed six cases this
   way, and the manual run had already turned the same omission into a blocker-severity finding
   (Δ-T) that did not exist. **If a write behaves strangely, check the header before writing it up.**
2. **The pickers jump, they do not filter — assert the highlight, never the option count.** Both
   are Carbon ComboBoxes pre-filled with the current selection (`"Xpert MTB/RIF · 85362-2"`), so
   clear the input first (this is what Casey meant by *"you just need to remove the current text to
   make the search work"*) and type with real keystrokes. The option count is **invariant** — 183
   before and after — and measuring it is what produced the second withdrawn "no search" finding.
   Read `[role="option"][aria-selected="true"]` / `.cds--list-box__menu-item--highlighted` instead.
3. **The mapping page is an accordion, not a table.** One collapsed row per analyzer code, toggled
   by a button labelled `{rawCode}Mapped` / `{rawCode}Do not receive`. The picker is not visible —
   and cannot be clicked — until its row is expanded. Table-based selectors find nothing.
4. **A hidden `Still There?` session modal is always in the DOM** and matches `[role="dialog"]`.
   Select dialogs by their content, not by index.
5. `GET /analyzer/analyzers` is **wrapped** (`{ analyzers: [...] }`), not a bare array.
6. **Capture status codes and bodies, not banners** — and capture them from a request that would
   actually have succeeded. Δ-R is correct only because the body was read directly; Δ-T was wrong
   because the body read was the body of a request the server had already rejected.
7. **Prefer the API for grading, the DOM for DOM findings.** The connection field schema and the
   mapping payload carry everything Connect and Verify need; DOM assertions are reserved for the
   things that ARE the finding — Δ-V's placeholder, Δ-K's missing control, Δ-R's silent banner.

## Run
```bash
BASE=https://analyzers.openelis-global.org npx playwright test \
  --config=all-tc.config.ts --project=analyzer-guided-setup
```
Credentials default to `admin`/`adminADMIN!`; override with `OE_USER`/`OE_PASS`.

Flip-when-fixed: each Δ asserts current behavior, so the assertion fails when the defect is fixed.
Untagged assertions guard the eleven fixes so they cannot silently regress.

## Test data on the instance (left in place, per Casey — this is a test server)
Analyzers `363 GeneXpert M3 Review` (carries a QA mapping change + a 2026-08-25 confirmation) and
`364 QA_AUTO_0825 second GX`, plus whatever `QA_AUTO_*` rows a suite run adds; control lot
`QA_AUTO_0825_LOT2`; Bridge profile draft `QA_AUTO_0825 probe profile`. Both 363 and 364 were
activated, deactivated and reactivated while disproving Δ-T and are left **ACTIVE**. The 2026-08-12
rows (`342`, `343`, `344`) did not survive the reseed.
