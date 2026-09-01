# Analyzer guided setup (Instrument → Verify → Connect) — QA suite

**Spec:** `analyzer-profile-mapping.md` (Analyzer Types & Mapping FRS) · story **OGC-1057**.
**Target:** analyzers.openelis-global.org · **v3.2.2.0** ("M3").
**Re-baselined:** 2026-08-25 · **updated:** 2026-08-27.
**Spec/file:** `analyzer-guided-setup.spec.ts` · **config:** `analyzer-m3.config.ts`.

> **This suite was rewritten for 3.2.2.0.** The 2026-08-12 revision graded v3.2.1.11 and asserted
> routes and endpoints that now 404 — it failed on missing routes rather than on real deltas. The
> earlier run's report is `qa-report-analyzers-20260812-1300.md` and `openelis-work` PR #264; treat
> both as **historical**, not current. Verdicts for round 2 were recorded in the instance's in-app
> review widget (submission **id 16**); the 2026-08-26 and 2026-08-27 retests are submissions
> **20–23**. The current report is `openelis-work`
> `designs/analyzer-integration/ogc-1057-qa-report-20260825-v3.2.2.0.md`.

## ⚠ Seed drift — read this before debugging a 400
The shipped profiles are **re-published between seeds**, and `/analyzer-types/{id}/mapping`
requires an exact `?revision=`. `genexpert-astm` was revision **1** on 2026-08-25 and revision **4**
on 2026-08-27. Nothing in the suite hardcodes a revision any more — `profileRevision()` reads it
from `/analyzer-types`. The seed also creates **site-derived duplicates of its own**, so the type
picker's option count is not a fixed number either; assert on a narrow query, not on a total.

The instance reseeds roughly every **20–40 minutes** and **reassigns analyzer ids** each time. A
reading taken against a stale id has already produced one false finding in this project ("the held
results disappeared" — they had not; GeneXpert had moved from id 2 to id 1). Re-resolve ids before
comparing anything across a gap in a session.

## What changed between builds (read this before comparing reports)
The database was reseeded, the UI was reworked, and the API surface moved. Of the 13 findings from
the 2026-08-12 run, **11 are fixed**. Of the five that were open after 2026-08-25, **three more are
now fixed** and four new ones were found on 2026-08-27.

| Old finding | Status |
|---|---|
| Δ-A separate full-page routes | **Fixed** — sections are inline, driven by `?setup=` |
| Δ-B undocumented 4th "Review" step | **Fixed** — three steps |
| Δ-D no "instrument isn't listed" path | **Fixed** — links to Analyzer Types → Create Profile with `returnTo` |
| Δ-E no catalog resolution / wrong bindable set | **Fixed** — real binding, LOINC shown, all 183 catalog tests |
| Δ-F silent partial profile apply | **Fixed** — explicit "Do not receive", X/Y·% counts |
| Δ-G sign-off unreachable | **Fixed** — confirmation w/ signer + timestamp, stales on change, gates Continue |
| Δ-H QC codes not confirmable | **Fixed** — "Order field 12 equals Q" shown in Verify |
| Δ-I no Resolve | **Fixed** — map or exclude per code |
| Δ-J / Δ-M QC + control lot gated activation | **Fixed** — QC absent from activation blockers |
| Δ-N hard Delete | **Fixed** — Deactivate / Reactivate, no Delete anywhere |
| Δ-O binding change could not be saved | **Fixed** — PUT 200, survives reload |
| Δ-P no GUI path to map a code | **Fixed** — per-row picker over the whole catalog |
| **Δ-V** `{name}` placeholder in both lifecycle dialogs | **Fixed 2026-08-26** |
| **Δ-K** no Results-only/Two-way data flow | **Fixed 2026-08-27** — `#analyzer-connection-dataFlow` |
| **Δ-W** the analyzer-type picker does not filter | **Fixed 2026-08-27** — the mapping test picker is **not re-tested** |
| **Δ-S** Add Analyzer does not reset the panel | **Data-integrity half fixed 2026-08-27**; UX residue → Δ-S′ |
| **Δ-R** control lot cannot be saved | **STILL OPEN** — third round running |
| **Δ-Y** Create Profile is a dead end | **STILL OPEN** — now explains itself, still uncompletable |

New on 2026-08-27: **Δ-AA**, **Δ-AB**, **Δ-AC**, **Δ-AD**, plus **Δ-S′**. Raised and **withdrawn**
across rounds: **Δ-T**, **Δ-U**, **Δ-X**, and *"the held-results banner traps focus"* — see
Withdrawn on evidence.

## Routes (3.2.2.0)
| Surface | URL |
|---|---|
| Setup, inline | `/analyzers?setup=instrument\|verify\|connect[&analyzerId=&profile=&revision=]` |
| Deactivate dialog | `/analyzers?lifecycle=deactivate&lifecycleAnalyzerId={id}` |
| Analyzer Types | `/analyzers/types` · `?action=create` · `?action=create&draft={uuid}` · `?action=duplicate&profile={id}` · `?action=history&profile={id}` |
| Type mappings | `/analyzers/types/{profileId}/mapping?revision=N[&returnTo=&focusTest=&focusValue=]` |
| Analyzer results | `/AnalyzerResults?id={analyzerId}` |
| Analyzer-scoped QC | `/analyzers/qc/instruments/{analyzerId}[?returnTo=]` |
| QC config | `/analyzers/qc/control-lots[/new]` · `/analyzers/qc/rule-config` · `/analyzers/qc/db` |

`/analyzers/{id}/mappings`, `/analyzers/{id}/edit` and `/analyzers/{id}/review` are **gone** — they
fall through to the API path. So does anything else the SPA router does not know: an unrecognised
path is proxied to `/api/OpenELIS-Global/...` and returns a Spring `NoHandlerFoundException`, which
looks like a server error but is a **wrong-URL** symptom. The QC dashboard is `/analyzers/qc/db`,
not `/analyzers/qc/dashboard`.

## REST contract
```
GET  /rest/analyzer/analyzers                    → { analyzers: [...] }   ← WRAPPED
POST /rest/analyzer/analyzers                    → 201 {id, name, profileId, profileRevision, testUnitIds}
PUT  /rest/analyzer/analyzers/{id}               → 200
GET  /rest/analyzer/analyzers/{id}               → detail (see below)
     ── every non-GET above requires  X-CSRF-Token: <localStorage.CSRF>
        without it: 403 {"message":"CSRF token missing or invalid"}
POST /rest/analyzer/analyzers/{id}/test-connection → the connection probe. RENAMED — /test now 404s.
     The UI's Test connection does PUT /analyzers/{id} first, then this, then re-reads readiness.
GET  /rest/analyzer/analyzers/{id}/activation-readiness → {ready, activated, blockers[]}
POST /rest/analyzer/analyzers/{id}/activate      → 200 {status:"ACTIVE",activated:true} · 422 when not ready
POST /rest/analyzer/analyzers/{id}/deactivate    → 200 {status:"INACTIVE",deactivated:true}
POST /rest/analyzer/analyzers/{id}/reactivate    → 200 {status:"ACTIVE",activated:true}
GET  /rest/AnalyzerResults?id={analyzerId}       → { resultList[], paging } — see the result shape below
GET  /rest/analyzer-types                        → { schemaVersion, catalogFingerprint, summary, types[] }
GET  /rest/analyzer-types/{profileId}/mapping?revision=N     ← revision is REQUIRED, 400 without
PUT  /rest/analyzer-types/{profileId}/mapping?revision=N     → saves a candidate binding
POST /rest/analyzer-types/{profileId}/mapping/confirm?revision=N → 200, sets confirmation CURRENT
POST /rest/analyzer-types/{profileId}/duplicate              → 201 { draftId, kind:"DUPLICATE", profile }
     body: { displayName, sourceRevision: N }   ← revision goes in the BODY. As ?revision= the
     server answers 400 "Source revision must be at least 1".
POST /rest/analyzer-types/drafts/{id}/publish → 201 { profile: { profileMeta: { id: "site.<uuid>" } } }
     ← the new id is at profile.profileMeta.id, NOT a top-level profileId
POST /rest/analyzer-types/drafts/{id}/publish               → 201 · 400 listing missing properties (Δ-Y)
GET  /rest/analyzer-types/drafts/{id}                       → the draft (not in the catalog — Δ-Y)
GET  /rest/qc/control-lots                       → 200 [ ... ]
POST /rest/qc/control-lots                       → 405  ← no create handler (Δ-R)
POST /rest/qc/controlLot                         → 400  ← exists, different DTO
GET  /rest/displayList/ALL_TESTS                 → 183 tests
```
`profileId` is a bare slug (`genexpert-astm`) — **no protocol prefix**, unlike 3.2.1.11's
`astm/genexpert-astm`. Site-created profiles are `site.{uuid}`.

**Analyzer detail** — `{id, name, testUnitIds, profileId, profileRevision, profileFingerprint,
bridgeConnectionId, status, connected, heldResultCount, connection}`. `connection` is the
interesting part and is a **declarative field schema**, which makes most of the Connect assertions
DOM-independent:

```jsonc
connection: {
  connectionId, clientAnalyzerId, displayName,
  profileRef: { profileId, revision, fingerprint },
  configRevision, configFingerprint,
  fields: [                          // the UI renders FROM this
    { key: "dataFlow",        inputKind: "SELECT", choices: ["RESULTS_ONLY", ...] },  // NEW 2026-08-27
    { key: "transport",       inputKind: "SELECT", required: true,
      choices: ["RS-232","TCP/IP"], currentValue: "TCP/IP" },
    { key: "connectionRole",  choices: ["SERVER","CLIENT"],
      visibleWhen: { fieldKey: "transport",      operator: "NOT_EQUALS", value: "RS-232" } },
    { key: "host",  inputKind: "TEXT",
      visibleWhen: { fieldKey: "connectionRole", operator: "EQUALS",     value: "CLIENT" } },
    { key: "port",  inputKind: "NUMBER", currentValue: 9601 }
    // a FILE profile carries `directory` and `filePattern` instead of transport/role/host/port
  ],
  readiness:  { ready, blockers[] },
  latestProbe:{ requestId, configRevision, status: "FAILED"|"SUCCEEDED", completedAt },
  desiredRuntimeState, actualRuntimeState, activeRuntimeRef, updatedAt
}
```

**Mapping payload** — `{profileId, profileRevision, profileFingerprint, displayName, protocol,
siteBindingId, siteBindingRevision, bindingFingerprint, tests[], controlRecognition, confirmation}`.
A test row is:

```jsonc
{ sourceRowKey: "MTB-RIF", rawCode: "MTB-RIF", aliases: [], loinc: "85362-2",
  resultType: "qualitative", mappingState: "BOUND" | "EXCLUDED" | "UNRESOLVED",
  testId: "395", selectedTest: { id, name: "Xpert MTB/RIF", loincCodes: [...] },
  results: [ { rawValue: "MTB DETECTED", mappingState: "BOUND",
               resultOptionId: "638", selectedOption: { id, value, label }, observed: false } ] }
```
`observed: true` marks a value the instance has actually seen in held traffic — that is the flag the
mapping page renders as *"Observed in held results"*, and the one Δ-AA drops on duplicate.

`confirmation` is `{state: "CURRENT", profileId, profileRevision, bindingFingerprint,
recognitionFingerprint, confirmedBy, confirmedByDisplayName, confirmedAt}` — pinned to **both**
fingerprints, which is the mechanism that stales it when a binding or the recognition rule changes.

**Analyzer result row** (`/rest/AnalyzerResults?id=`) — carries provenance as of 2026-08-27:

```jsonc
{ id, analyzerId, accessionNumber, testName, result, isControl, testId, readOnly,
  sourceProfileId: "genexpert-astm", sourceProfileRevision: 4,
  sourceProtocol: "ASTM", sourceTransport: "TCP", rawTestCode: "MTB-RIF",
  rawResultValue: "REVIEW REQUIRED",
  importIssueReason: "unknown_analyzer_result_value" | "unknown_analyzer_test" }
```
`importIssueReason` is the field that distinguishes Δ-AC's two held-row cases. A row with
`unknown_analyzer_test` has **no `testId`** and gets **no resolution link**.

**Catalog summary row** (`/rest/analyzer-types`) —
`{profileId, revision, displayName, source: "SHIPPED"|"SITE", status, protocol, parentProfileId,
parentRevision, testMappings: {mapped, excluded, total, state}, resultMappings: {...}, usedBy,
readiness, publicationAction, publicationActor, publicationTime}`. **`resultMappings.total`
excludes `UNRESOLVED` values and does not follow a confirmed site-binding change** — that is Δ-AB,
and it is why the suite compares this against the mapping payload rather than trusting it.

Blocker codes: `analyzer.activation.blocker.mappings`, `analyzer.activation.blocker.recognition`,
`analyzer.connection.readiness.missingRequiredValues`.

## Suites & cases
| ID | Case | Criterion | 2026-08-27 |
|---|---|---|---|
| TC-ANZ-M3-01 | Add Analyzer expands inline; list stays visible | FUNCTION | PASS |
| TC-ANZ-M3-02 | The three FRS sections render; no undocumented fourth | RENDER | PASS |
| TC-ANZ-M3-03 | The type picker filters as it searches | FUNCTION | **PASS** (Δ-W fixed — now a guard) |
| TC-ANZ-M3-04 | "Instrument not listed?" → Create Profile | FUNCTION | **FAIL** (Δ-Y) |
| TC-ANZ-M3-05 | Create from a clean list POSTs a new analyzer | ROUND-TRIP | PASS |
| TC-ANZ-M3-06 | The panel resets, and never lies about which analyzer it holds | ROUND-TRIP | **PASS** (Δ-S fixed); Δ-S′ logged |
| TC-ANZ-M3-07 | Rows bind to catalog tests; every code accounted for | CROSS-LINK | PASS |
| TC-ANZ-M3-08 | Test picker offers the catalog; filter **not re-tested** | RENDER | **FAIL** (Δ-W, unverified) |
| TC-ANZ-M3-09 | The mapping is a versioned, fingerprinted artefact | ROUND-TRIP | PASS |
| TC-ANZ-M3-10 | Confirmation is pinned to the binding it signed | FUNCTION | PASS |
| TC-ANZ-M3-11 | A CURRENT confirmation records signer + timestamp | PERSIST | PASS |
| TC-ANZ-M3-12 | QC readiness does not gate activation | CROSS-LINK | PASS |
| TC-ANZ-M3-13 | Connection schema declares role-conditional visibility | RENDER | PASS |
| TC-ANZ-M3-14 | The probe is real and its outcome is recorded | FUNCTION | PASS |
| TC-ANZ-M3-15 | A data-flow control ships and follows the profile | RENDER | **PASS** (Δ-K fixed — now a guard) |
| TC-ANZ-M3-16 | Activation succeeds when readiness reports ready | FUNCTION | PASS |
| TC-ANZ-M3-16b | The not-ready path returns a named 422 | FUNCTION | PASS |
| TC-ANZ-M3-17 | Deactivate → reactivate round-trips through the API | ROUND-TRIP | PASS |
| TC-ANZ-M3-17b | The lifecycle is reachable from the UI; no hard Delete | FUNCTION | PASS |
| TC-ANZ-M3-18 | Both lifecycle dialogs name the analyzer | RENDER | **PASS** (Δ-V fixed — now a guard) |
| TC-ANZ-M3-19 | The New Control Lot form cannot be saved at all | FUNCTION | **FAIL** (Δ-R) |
| TC-ANZ-M3-19b | The control-lot Test picker is not scoped to the analyzer | CROSS-LINK | **FAIL** (Δ-R2) |
| TC-ANZ-M3-20 | Duplicate forks the shipped profile, not the site binding | ROUND-TRIP | **FAIL** (Δ-AA) |
| TC-ANZ-M3-21 | The catalog reports COMPLETE while a value is UNRESOLVED | CROSS-LINK | **FAIL** (Δ-AB) |
| TC-ANZ-M3-22 | An undeclared analyzer code has no resolution path | FUNCTION | **FAIL** (Δ-AC) |
| TC-ANZ-M3-23 | View history never lists the site-binding change | PERSIST | **FAIL** (Δ-AD) |

## Maturity
**M3.** Instrument, the mapping editor and the full analyzer lifecycle all round-trip through a
second surface, and the mapping cross-links to the real test catalog. REPORTABLE is not evidenced —
but only because result ingestion needs the analyzer simulator, which this instance does not have,
not because anything in the module blocks it. Nothing here is a blocker.

## Δ ledger (open)
- **Δ-R — the New Control Lot form cannot be saved at all.** Reported 2026-08-12, shipped again
  2026-08-25, shipped again 2026-08-27. The *framing* changed between rounds and the case is
  written to current behaviour: round 1 found hidden validation (the form POSTed and the 400 was
  swallowed by a generic banner); on 3.2.2.0 the form issues **no request at all**. Save is
  `type="submit"`, enabled, inside a real `<form>` with a React `onSubmit` — the handler is wired
  and bails before issuing anything. `GET /qc/control-lots` 200; `POST` **405**; the create DTO
  lives at a different path (`/qc/controlLot`). Operational QC cannot be configured, and Rule
  Configuration has no create control either. **High.**
- **Δ-R2 — the control-lot Test picker is not scoped to the chosen analyzer.** With Cepheid
  GeneXpert selected it offers all 183 catalog tests; GeneXpert maps four. A lot bound to a test the
  instrument never reports would never be evaluated by any Westgard rule.
- **Δ-Y — Create Profile is a dead end.** Collects only a name; now returns an honest message
  (*"the draft is saved in Analyzer Bridge. It must be completed and validated…"*) instead of
  failing silently, which is a real improvement — but there is still no editor and no publish path.
  `POST /analyzer-types/drafts/{id}/publish` → 400 naming eight missing properties
  (`profileMeta.confidence`, `profileMeta.version`, `capabilities`, `category`, `configDefaults`,
  `connectionFields`, `controlResultRecognition`, `protocol`). A **UI gap**, not a backend one: a
  deployment can only fork an existing type — and per Δ-AA the fork does not carry the work.
- **Δ-AA — Duplicate forks the SHIPPED PROFILE, not the SITE BINDING.** A copy of a fully-bound
  profile publishes with **every test and every result `UNRESOLVED`**, `testId: null`,
  `NOT_STARTED` / `NEEDS_LOCAL_MAPPING` — while the modal promises the new profile *"starts from"*
  the source. It also omits `REVIEW REQUIRED` on MTB-RIF (17 values become 16). That value was
  first read as "the UNRESOLVED one gets dropped", but after it was mapped and confirmed it was
  **BOUND** in the source and a fresh fork still omitted it — so the rule is not about
  `mappingState`. It is a value the instance *learned from traffic* (`observed: true`), which lives
  on the site binding, as do the bindings. One mechanism, both symptoms. TC-ANZ-M3-20 asserts on
  `observed`, not on `mappingState`, for exactly that reason.
- **Δ-AB — the catalog's mapping counts are stale and never follow a confirmed change.** First read
  as a denominator rule: `/analyzer-types` reported `{mapped 10, excluded 6, total 16, COMPLETE}`
  for a mapping holding **17** values, one `UNRESOLVED` — so the row that needs attention was the
  row that did not count. **That was only the shape of the disagreement at the time.** After a
  confirmed change (`siteBindingRevision` 2 → 3, mapping now **11 BOUND + 6 EXCLUDED = 17, zero
  unresolved**), a cache-busted GET *and* a suite re-read hours later both still return the
  identical pre-change numbers. The catalog does not track the site binding at all. TC-ANZ-M3-21
  therefore asserts the **disagreement**, not an arithmetic rule — encoding `total − UNRESOLVED`
  broke the moment the unresolved value was bound. The Needs Attention KPI counts only
  `NOT_STARTED` profiles, so the one profile actually blocking clinical results is not flagged.
  **Medium-High.**
- **Δ-AC — an undeclared analyzer code has no resolution path.** `unknown_analyzer_result_value`
  rows (declared code, unknown value) get a working *Review Analyzer Type mapping* deep link;
  `unknown_analyzer_test` rows (`UNMAPPED-MTB`, not declared) get nothing — no link, no `testId`,
  no route. The mapping page lists only declared codes and offers no add-code control, and the code
  is absent from the mapping payload. The server distinguishes the two cases perfectly; the UI
  branches for one. **A missing UI branch, not missing data.**
- **Δ-AD — a confirmed mapping change is not audited.** After `PUT …/mapping` 200 +
  `POST …/mapping/confirm` 200 (`siteBindingRevision` 2 → 3, banner *"Confirmed by Open ELIS on
  Aug 27, 2026, 1:23 PM"*), row menu → **View history** still lists only shipped revisions by
  `distribution`. The site binding is versioned; the dialog reads the wrong series. Nothing in the
  UI records who changed a mapping, or when. **Medium for the MVP, High for production.**
- **Δ-S′ — Add Analyzer is inert while a setup panel is open.** No reset, no new panel, no message.
  Safe (see Δ-S below) but the user gets no hint the panel must be closed first. **Minor / UX.**
- **Δ-W — CLOSED for both controls.** Measured 2026-09-01 at 4 options and again at 13: the
  analyzer-type picker is a **case-insensitive substring** filter over the whole option label
  (`Fluoro` → 1, mid-string, where a prefix filter must give 0), and it does **not** empty the menu
  under either typing method. Two contrary readings on `main` — "filters by PREFIX" and "the search
  empties the menu 13→0, probable defect" — are disproved and not-reproducible respectively; see
  `HARNESS-FINDINGS.md` and `probe-typepicker.spec.ts`. The mapping-page test picker filters too
  (183 → 1 on `Hemato`).
- **Minor:** the Port field shows "This field is required" while holding a value until blurred; the
  held-results banner (`cds--actionable-notification`, `hideCloseButton`) takes focus on mount and
  can pull a first keystroke away from the setup form (Escape dismisses it); the QC Dashboard's
  *Type* column prints the raw profile slug; FluoroCycler results render with no units on a
  quantitative value.

### Closed this round
- **Δ-K — no data-flow control.** **FIXED 2026-08-27.** Step 3 renders
  `#analyzer-connection-dataFlow`; a FILE profile offers `RESULTS_ONLY` alone, which is the right
  constraint rather than a free choice. *Not yet exercised:* an ASTM profile declaring
  `communicationMode: BOTH` should offer two-way — that is the other half of AC-10.
- **Δ-V — the `{name}` placeholder in both lifecycle dialogs.** **FIXED 2026-08-26.** Both dialogs
  interpolate the analyzer name. TC-ANZ-M3-18 now guards it.
- **Δ-W — the analyzer-type picker.** **FIXED 2026-08-27.** `Fluo` narrows 7 options to 1.
- **Δ-S — Add Analyzer does not reset the setup panel.** **The data-integrity defect is FIXED, and
  fixed the right way round.** The defect was never "the panel keeps values"; it was that the panel
  *shed* `analyzerId` while keeping them, so it looked like a new analyzer while still being the old
  one, and Continue would `PUT` the old analyzer and silently rename it. Now the URL **keeps**
  `analyzerId` and the fields agree with it, so `PUT …/{id}` is correct. Closing and reopening the
  panel gives a clean step 1. What remains is Δ-S′ above.

### Withdrawn on evidence
- **Δ-T — "activate and deactivate both return 500."** **WITHDRAWN.** Raised at blocker severity
  during the 2026-08-25 manual run, from hand-rolled `POST`s that omitted the CSRF header
  (harness rule 1). With `X-CSRF-Token` present, every transition returns **200**, on analyzers
  **363 and 364**, in both directions and repeatedly. The UI paths agree. A request without the
  header returns `403`, never 500, so the 500s the manual run saw were not simply the missing
  header either — either the build changed under us or the probe was malformed. **Either way the
  defect does not reproduce and must not be filed.**
- **Δ-U — "reactivate is untestable."** **WITHDRAWN** with Δ-T.
- **"The instrument picker has no search"** (round 1). **Withdrawn as stated.** Synthetic keystrokes
  sent to an **unfocused** page were swallowed by a global search shortcut that navigated away and
  abandoned the setup. The narrower, real finding was **Δ-W** — since fixed for that control.
- **"Add Analyzer overwrites the analyzer you were looking at."** Withdrawn as stated — from a
  clean list, Add creates a new analyzer correctly (POST 201). The real finding was **Δ-S**.
- **Δ-X — "Continue is enabled with no lab units, then fails silently."** **Withdrawn.** It does not
  submit, correctly, and the panel raises *"Select at least one lab unit"*.
- **"The QC Dashboard reports No instruments found"** and *"analyzer-scoped QC showed In Control
  with no control lot"*. **Withdrawn** — empty-state readings taken before any QC data existed.
  With a control result present the dashboard populates correctly.
- **"The held-results banner traps keyboard focus."** Raised and withdrawn inside the 2026-08-27
  run. On a freshly loaded page with the banner present, `focus()` succeeds on every setup field.
  The real, narrower behaviour is the transient focus-steal recorded under Minor.

## Design questions for the PO (not defects)
- **Create Profile collects only a name.** FR-B3 specifies protocol and connection type at this
  point; on 3.2.2.0 they are defined outside OpenELIS. Reachable, but a lab admin cannot finish the
  job in this UI — confirm that is intended.
- **Is Duplicate Profile meant to start empty?** See Δ-AA. Either the copy carries the source's
  bindings, or the modal stops saying the new profile "starts from" the source.
- **A held result is never released by fixing the mapping.** After binding and confirming
  `REVIEW REQUIRED`, the held row stayed held. That matches the banner's *"so the next matching
  result can enter the normal review workflow"*, so it reads as intended — but it means the held
  result that motivated the fix can only be cleared by re-running the specimen.
- The analyzer-scoped QC link opens a monitoring view (Activity Timeline / Control Chart);
  control-lot and Westgard configuration live in the sidebar, so the QC step cannot be completed
  from the analyzer link itself.

## Untested
Learn-from-traffic (FR-B7/B8, FR-G) still needs the analyzer simulator — now against the Bridge
listener — and with it reconciliation against the mappings, pending codes and pending result values.
That is the only thing standing between this module and a REPORTABLE grade. Also untested:
**two-way data flow** on an ASTM profile (Δ-K's other half); the **mapping-page test picker's**
filter behaviour (Δ-W); **downstream clinical screens** for analyzer provenance (Δ-Z); and the
**re-send half** of the live-traffic story, which needs the demo operator — there is no
analyzer-mock control inside OpenELIS and `35.85.196.163:9600` refuses external connections.
Mobile/responsive not run.

## Harness rules this suite depends on
Each of these cost a run, or a withdrawn finding, to learn.

1. **Writes need CSRF.** Every non-GET REST call must carry `X-CSRF-Token`, and the token lives in
   **`localStorage.CSRF`**. Without it the server answers **403** — and a hand-rolled probe then
   "disproves" a finding it never actually reached. The first re-baseline run failed six cases this
   way, and the manual run had already turned the same omission into a blocker-severity finding
   (Δ-T) that did not exist. **If a write behaves strangely, check the header before writing it up.**
2. **Never hardcode a profile revision.** See Seed drift. `/analyzer-types/{id}/mapping` 400s
   without an exact `?revision=`, and the shipped revision moves between seeds. Use
   `profileRevision()`.
3. **The analyzer-type picker filters now; the mapping test picker was not re-tested.** Both are
   Carbon ComboBoxes pre-filled with the current selection (`"Xpert MTB/RIF · 85362-2"`), so clear
   the input before typing or the jump lands on the old value. For the type picker, assert that the
   list **narrows** on a query narrow enough to survive the seed's self-created duplicates (`Fluo`,
   not `GeneX`). For the test picker, read
   `[role="option"][aria-selected="true"]` / `.cds--list-box__menu-item--highlighted`.
4. **The mapping page is an accordion, not a table.** One collapsed row per analyzer code, toggled
   by a button labelled `{rawCode}Mapped` / `{rawCode}Do not receive`. The picker is not visible —
   and cannot be clicked — until its row is expanded.
5. **The in-app review widget swallows clicks.** `#oe-review-host` sits over the bottom-right and
   intercepts pointer events, so row overflow menus never open. `hideReviewWidget()` removes it.
   It is an **open shadow root**, so its own controls are reachable via
   `document.querySelector('#oe-review-host').shadowRoot` when you need to drive it.
6. **A hidden `Still There?` session modal is always in the DOM** and matches `[role="dialog"]`.
   Select dialogs by their content, not by index.
7. `GET /analyzer/analyzers` is **wrapped** (`{ analyzers: [...] }`), not a bare array.
8. **Capture status codes and bodies, not banners** — and capture them from a request that would
   actually have succeeded. Δ-R is correct only because the body was read directly; Δ-T was wrong
   because the body read was the body of a request the server had already rejected.
9. **Prefer the API for grading, the DOM for DOM findings.** The connection field schema, the
   mapping payload and the catalog summary carry everything Verify, Connect and Catalog need; DOM
   assertions are reserved for the things that ARE the finding — Δ-R's silent Save, Δ-AC's missing
   link, Δ-AD's dialog.
10. **Don't trust the catalog summary as a source of truth.** Per Δ-AB it disagrees with the mapping
    payload and lags a confirmed change. Compare the two; never assert one from the other.

## Run
```bash
npx playwright test -c analyzer-m3.config.ts
```
**Use `analyzer-m3.config.ts`, not `all-tc.config.ts`.** This suite targets a *different instance*
than the rest of the repo. It was previously registered as a project inside `all-tc.config.ts`,
whose `auth.setup` authenticates against **testing** and writes `.auth/user.json` — so the suite
drove the analyzers instance carrying testing's cookies, never authenticated, and every test timed
out. That was 20 of 27 failures in the 2026-08-26 all-tc run and **none of them were defects**.
`analyzer-m3.config.ts` has its own `baseURL`, its own login, and its own storage-state file.

Credentials default to `admin`/`adminADMIN!`; override with `OE_USER`/`OE_PASS`, and the target with
`BASE`.

Flip-when-fixed: each Δ asserts current behavior, so the assertion fails when the defect is fixed —
and the failure message names what to flip it to. Untagged assertions guard the fixes so they cannot
silently regress.

## Test data on the instance (left in place, per Casey — this is a test server)
**From 2026-08-27:** analyzer `QA Focus Trap Probe` (Bruker FluoroCycler XT, deliberately bad
directory so the failed-probe evidence is reproducible); analyzer type
`QA dup unresolved checkCepheid GeneXpert (ASTM Mode) -1` (`site.a8ab8d9d-…`) — the Δ-AA duplicate;
Bridge profile draft `27b3ce84-b861-4d9e-964f-93ec81e5acab` — the Δ-Y create draft; and a confirmed
mapping change on `genexpert-astm` (`REVIEW REQUIRED` → `INDETERMINATE`, `siteBindingRevision` 3).
TC-ANZ-M3-20 also publishes a `QA_AUTO_* fork fidelity` type on each run.

**From earlier rounds, did not survive the reseed:** analyzers `363 GeneXpert M3 Review` and
`364 QA_AUTO_0825 second GX`, control lot `QA_AUTO_0825_LOT2`, Bridge draft
`QA_AUTO_0825 probe profile`, and the 2026-08-12 rows `342`/`343`/`344`.
