# Analyzer guided setup (Instrument → Verify → Connect) — QA suite

**Spec:** `analyzer-profile-mapping.md` (Analyzer Types & Mapping FRS) · story **OGC-1057** (v3 slice of OGC-1054).
**Slice scope:** FR-B1…B6, FR-C1…C3, FR-F1…F2 · **AC-1 … AC-10**.
**Target:** analyzers.openelis-global.org (v3.2.1.11). **Verified:** 2026-08-12, walked with Casey.
**Spec/file:** `analyzer-guided-setup.spec.ts`.

Covers the **new** inline guided setup on the Analyzers List, plus the standalone Field Mappings
page it hands off to. Does *not* cover profile fork/save-scope (FR-H), the Analyzer Types list
(FR-I), or learn-from-traffic (FR-G) — those are OGC-1054's other slices.

> **Findings were walked interactively and ruled bug-vs-harness by Casey.** Two of the original
> deltas were withdrawn on evidence (see Withdrawn, below). Every remaining Δ was reproduced on at
> least two analyzers or two profiles.

## Routes (the flow is **not** single-route)
| Step | URL |
|---|---|
| Instrument | `/analyzers?add=1&step=instrument&returnTo=%2Fanalyzers` |
| Verify | `/analyzers/{id}/mappings?setup=1&step=verify&profile={profileId}` |
| Connect | `/analyzers/{id}/edit?setup=1&step=connect&profile={profileId}` |
| Review | `/analyzers/{id}/review?setup=1&step=review` |
| Field Mappings (standalone, from the row menu) | `/analyzers/{id}/mappings` — same page, no setup chrome |

## REST contract
```
GET /rest/analyzer/profiles                          → 20 shipped profiles
GET /rest/analyzer/profiles/{protocol}/{slug}        → default_test_mappings[], communication{}, transport[]
GET /rest/analyzer/analyzers                         → { analyzers: [...] }   ← WRAPPED, not a bare array
GET /rest/analyzer/analyzers/{id}                    → detail (testMappings[] = codes only)
GET /rest/analyzer/analyzers/{id}/setup-verification → the activation gate
GET /rest/analyzer/analyzers/{id}/test-mapping-options→ the bindable test universe
GET /rest/analyzer/analyzers/{id}/result-value-options?testCode=X
GET /rest/analyzer/analyzers/{id}/result-value-mappings | pending-codes | pending-result-values | plugin-config
```
All under `/api/OpenELIS-Global`. `setup-verification` = `{ mappingReady, qcApplicable, qcReady,
currentlyVerified, readyForActivation, verificationState, blockers[] }`. Blocker codes seen:
`UNBOUND_RESULT_VALUES`, `NO_ACTIVE_CONTROL_LOT`, `NO_ACTIVE_QC_RULE`.

## Suites & cases
| ID | Case | AC / FR | Criterion | 2026-08-12 |
|---|---|---|---|---|
| TC-ANZ-SET-01 | Add Analyzer expands inline, list stays visible | AC-1 / B1 | FUNCTION | PASS |
| TC-ANZ-SET-02 | Stepper renders Instrument → Verify → Connect | AC-2 | RENDER | PARTIAL (Δ-A, Δ-B) |
| TC-ANZ-SET-03 | Instrument picker searchable; selection loads the profile | AC-3 / B2 | FUNCTION | PASS |
| TC-ANZ-SET-04 | "My instrument isn't listed" → new-profile fields | AC-4 / B3 | FUNCTION | **FAIL** (Δ-D) |
| TC-ANZ-SET-05 | Name + lab units round-trip on a different endpoint | B2 | ROUND-TRIP | PASS |
| TC-ANZ-SET-06 | Verify table shows code · test · LOINC · status | AC-5 | RENDER | PASS |
| TC-ANZ-SET-07 | Rows resolve to real catalog tests by LOINC | AC-5 / C1 | CROSS-LINK | **FAIL** (Δ-E) |
| TC-ANZ-SET-08 | Profile applies whole, or flags what it can't | B4 / C3 | ROUND-TRIP | **FAIL** (Δ-F) |
| TC-ANZ-SET-09 | An analyzer code can be added / re-pointed in the GUI | C2 / D1 / D2 | FUNCTION | **FAIL** (Δ-P) |
| TC-ANZ-SET-10 | Verification is an explicit, recorded human confirmation | AC-6 / B4 | PERSIST | **FAIL** (Δ-G) |
| TC-ANZ-SET-11 | QC codes appear in Verify for confirmation | AC-7 / B5 | RENDER | **FAIL** (Δ-H) |
| TC-ANZ-SET-12 | A non-matching test offers Resolve → search / link / don't-receive | AC-8 / C2 | FUNCTION | **FAIL** (Δ-I) |
| TC-ANZ-SET-13 | Mapping sign-off is independent of QC readiness | AC-9 / C3 | FUNCTION | **FAIL** (Δ-J) |
| TC-ANZ-SET-14 | Result-mapping empty state links to Test Catalog | AC-12 / E2 | RENDER | PASS |
| TC-ANZ-SET-15 | Direction default follows the profile's declared capability | AC-10 / F2 | RENDER | PARTIAL (Δ-K) |
| TC-ANZ-SET-16 | Connection test reports the outcome in plain language | B6 / AC-10 | FUNCTION | **FAIL** (Δ-L) |
| TC-ANZ-SET-17 | Network address persists per analyzer, not on the profile | F1 | ROUND-TRIP | PASS |
| TC-ANZ-SET-18 | The collected address is the one the connection uses | F1 | FUNCTION | **FAIL** (Δ-Q) |
| TC-ANZ-SET-19 | Review enumerates activation blockers | — | RENDER | PASS (Δ-M) |
| TC-ANZ-SET-20 | Row actions offer Deactivate/Reactivate, no Delete | AC-17 / A3 | RENDER | **FAIL** (Δ-N) |
| TC-ANZ-SET-21 | Binding an unbound qualitative value saves and survives reload | E1 / AC-12 | PERSIST | **FAIL** (Δ-O) |

## Maturity
Guided setup rated **M1**.

*Instrument* alone reaches **M3** — name, lab units, profile reference and address all round-trip
through a second endpoint. *Verify* is capped at **M1**: no catalog cross-link (Δ-E), the profile
does not apply whole (Δ-F), no mapping GUI exists at all (Δ-P), and the sign-off is unreachable
(Δ-G). *Connect* is **M2** for the stored address and **M0** for the probe (Δ-L). Lowest
sub-feature governs → **M1**.

## Δ ledger

### Withdrawn on evidence
- **Δ-C — instrument picker has no search.** **Withdrawn.** Carbon `Dropdown` type-ahead works:
  focus the trigger and type `sys` → *Sysmex XN Series* highlights, Enter selects, setup is
  preserved. AC-3 is satisfied. The original finding was a harness error — synthetic keystrokes
  sent to an unfocused page were swallowed by a global search shortcut that navigated to
  `/analyzers/types?search=sys`. **Any spec driving this control must focus the trigger first.**
  Separately verified that this cannot bite a real user: typing into Analyzer Name works normally,
  the value survives, and stray keystrokes outside a field neither navigate nor clear the form.
- **"Two-way is offered by default regardless of the profile."** **Withdrawn** — see Δ-K for what
  actually holds. The default *does* follow the profile.

### Confirmed
- **Δ-P — there is no way to add or re-point an analyzer code in the GUI.** *(The headline. Casey:
  "the biggest point is to have the ability to map the test codes between the analyzer and OE.")*
  The Profile-Applied Test Mappings table has **zero controls on every row**, both on the setup
  step and on the standalone Field Mappings page. The whole page offers seven controls: two
  breadcrumbs, *Open Test Catalog* (only from a result-value empty state), *Save result mappings*,
  *Verify current setup*, *Manage QC rules*, *Add or select control lot*. No add-row, no edit, no
  remove, no Resolve. The only surface that can ever receive a new code is *Pending Unmapped
  Codes*, which is populated by transmission — so a code can only enter by the instrument sending
  it, never by an administrator entering it. FR-D1/D2 and FR-C2 are unbuilt.
- **Δ-E — no catalog resolution, and the bindable test set is wrong.** The `OpenELIS Test` column
  renders the profile's `test_name_hint` string (Sysmex ships hints — "White Blood Cells"; the
  GeneXpert profile has no hint field, so it falls back to the code, which is what originally read
  as an echo). `Status` is the literal `Profile` on every row. Where a picker exists at all,
  `test-mapping-options` returns the **same fixed 13 legacy tests** — CD4 percentage count,
  Determine, Genie III, Innolia, Murex, Vironostika, GB, Lymph %, Integral — with **byte-identical
  id arrays for a Molecular analyzer (342) and a Hematology analyzer (343)**, so it is **not**
  lab-unit scoped, out of **183** tests in the catalog, with no search. The catalog does contain
  the tests the profiles name (`White Blood Cells(Whole Blood)` etc.); nothing links to them.
- **Δ-F — the profile silently applies only what the importer can resolve.** GeneXpert stores 13 of
  28; QuantStudio stores 10 of 17 (drops CHIKV, CHIK, ZIKV, ZIKA, MPXV, Mpox, MPox); Sysmex (13)
  and Mindray BC-5380 (13) store everything. What survives maps to diseases this catalog has tests
  for — HIV, Dengue, COVID, MTB/RIF; what is dropped maps to diseases it doesn't — Zika,
  Chikungunya, Mpox, HPV, CT/NG, C. difficile, MRSA, Trichomonas. So the filter is deliberate, but:
  (a) it is **silent** — Verify still lists all 28 rows as `Profile`, with nothing marking the 15
  that were discarded, and no Resolve action (FR-C2/C3); and (b) resolution is **not LOINC-based
  and is unreliable** — `HBV` is dropped although `HBsAg (Hepatitis B surface antigen)(Serum)` is
  in the catalog. Combined with Δ-P there is no recovery path, which is what makes this severe.
- **Δ-G / Δ-J — the mapping sign-off is coupled to the QC program.** `Verify current setup` is
  disabled whenever `blockers[]` is non-empty. On Sysmex `mappingReady` is **true** and it is
  *still* disabled, blocked only by `NO_ACTIVE_CONTROL_LOT`. `qcApplicable` is `true` for **every**
  analyzer checked, including ones built from profiles shipping **zero** QC rules (Mindray BC-5380
  returns `NO_ACTIVE_QC_RULE` *and* `NO_ACTIVE_CONTROL_LOT`). So a perfectly mapped analyzer cannot
  be verified or activated until someone creates a QC rule and registers a control lot — a coupling
  the FRS never asks for, and which MC-4 explicitly puts out of scope for this surface. Exactly one
  analyzer on the instance has cleared it (`UAT GeneXpert HL7`, `CURRENT`), and it is the only
  ACTIVE one. Meanwhile `Save and continue` stays enabled and the stepper marks Verify **Complete**
  while `currentlyVerified` is `false` (AC-6).
- **Δ-O — an unbound qualitative value cannot be saved.** The picker is correct (FR-E1 satisfied:
  `result-value-options?testCode=MTB` returns exactly test 395's three options), but selecting one
  leaves **`Save result mappings` disabled**. Confirmed with a programmatic click and a real mouse
  click, on two rows; after reload both fields are empty and `result-value-mappings` still reports
  42 unbound / 2 bound. **Re-confirmed a third time after QC went green** — with `qcReady: true` and
  the control lot active, selecting *Detected* on MTB still leaves Save disabled. Since
  `UNBOUND_RESULT_VALUES` gates `readyForActivation`, and it is now the **only** remaining blocker on
  analyzer 342, a single non-enabling button is all that stands between the analyzer and activation.
  **Confirmed by hand by Casey on 2026-08-12** — this one is not an automation artefact. The button
  carries no tooltip or `aria-describedby`, and is disabled from page load: the selection never marks
  the form dirty. Only 20 of the 44 rows expose a picker at all; the other 24 read "No active result
  options are configured for this mapped test", so they cannot be bound from this screen regardless.
  **Repro:** `/analyzers/342/mappings` → Result Value Mappings → any `LEGACY_UNBOUND` row with a
  picker (MTB, MTB-RIF, COVID19, SARSCOV2, SARS-CoV-2, Xpress) → choose any option → *Save result
  mappings* stays greyed.
- **Δ-R — control-lot save hides the real validation error.** *Add or select control lot* →
  `/analyzers/qc/control-lots/new?analyzerId={id}` with the analyzer pre-filled. A form completed
  with lot number, material, level, expiry and test returns **400** with the banner
  *"Failed to save control lot"*. The server's actual reason is
  `"Manufacturer fixed method requires both mean and standard deviation"` — Mean and SD live behind
  the *Statistics Configuration → Configure* link, display as `-`, are not marked required and are
  not flagged on submit. Setting Mean 1.00 / SD 0.10 saved cleanly.
- **Positive — QC readiness plumbing is correct.** Saving the lot flipped `qcReady` to `true` and
  removed `NO_ACTIVE_CONTROL_LOT` from `blockers[]` immediately, leaving `UNBOUND_RESULT_VALUES` as
  the sole blocker on analyzer 342. Readiness recalculates live and Review reports blockers in plain
  language; the gate mechanism works, it is the *coupling* (Δ-J) and the unclearable blocker (Δ-O)
  that are wrong.
- **Δ-E corroborated from inside the same module.** The Control Lot form's **Test** picker offers
  **all 183 catalog tests** with search. So a full-catalog searchable test picker already exists in
  Analyzers — the test-code mapping screen simply doesn't use it.

### Deferred — re-test with the analyzer simulator attached
- **Δ-L / Δ-Q — Connect.** *Not judged.* Test Connection opens a modal that echoes
  `Name / IP address / Port` and reports no success or failure; blank fields give an empty modal
  body; no request is issued when the button is pressed. The no-request observation is client-side
  and independent of instrument reachability, but the harness was not connected, so this may be
  under-configured rather than broken — **re-test before filing** (Casey, 2026-08-12). Not
  harness-dependent and still standing: `connectionRole: SERVER` means the collected IP/port is not
  what an analyzer-initiated connection uses, the listener port is exposed nowhere, and all three
  directions are offered even for a profile declaring no LIS-initiated support.

### Previously filed as confirmed, superseded by the above
- **Δ-L — Test Connection performs no probe.** Zero REST calls captured; the modal echoes
  `Name / IP address / Port` and nothing else; with the fields blank the body is empty (0 chars).
  No success, no failure, no two-way probe, no degrade-to-one-way. Reproduced on analyzers 342 and 343.
- **Δ-Q — the address collected is not the address used.** `plugin-config` reports
  `connectionRole: "SERVER"` — OpenELIS listens and the instrument dials in — so for an
  analyzer-initiated profile the IP/port the Connect step demands is inert. The listener port the
  admin actually needs to configure on the instrument is exposed nowhere in the API or the UI.
- **Δ-K — connection direction, not data flow.** The control offers `Analyzer → LIS` /
  `LIS → Analyzer` / `Bidirectional` — who opens the socket — not FR-F's data flow (`Results only`
  vs `Two-way (send orders/queries)`). The default correctly follows the profile (GeneXpert
  declares `communication.mode: BOTH` → created `BOTH`; Sysmex declares none → created
  `ANALYZER_INITIATED`), but **all three options are offered for Sysmex** even though its profile
  declares no LIS-initiated support, which FR-F2 says should not be offered. AC-10's "defaults to
  one-way" is not met for profiles that declare two-way.
- **Δ-D — no "My instrument isn't listed" path.** Absent from the Instrument step *and* from
  Analyzer Types, which has no Create/Add control at all; `/analyzers/types/new` is not a route.
  A deployment can therefore only ever use the 20 shipped profiles. (Casey: bug.)
- **Δ-A** Verify/Connect/Review are full-page routes, not stacked inline sections (FR-B1). Only
  Instrument is inline.
- **Δ-B** A fourth step, **Review**, exists; the FRS defines three. Absorb into the spec.
- **Δ-M** `NO_ACTIVE_CONTROL_LOT` is an activation gate the FRS never defines (see Δ-J).
- **Δ-N** Row menu is `Field Mappings · Test Connection · Copy Mappings · Edit · QC Rules · Control
  Lots · Delete (danger)` — hard Delete, no Deactivate/Reactivate (FR-A3/AC-17, LIMS constitution).
  `Copy Mappings` also appears where FR-H specifies fork-on-save and explicitly no clone.
- The analyzer row is created **before** anything is verified, so an abandoned setup leaves a
  `SETUP` row behind — the likely origin of the `TEST-Analyzer-*` rows on the instance.
- Review's configuration summary omits the lab units collected on the Instrument step.

## Untested (needs the analyzer simulator)
FR-B7/B8 and FR-G — push a result during setup, reconcile against the mappings, pending codes and
pending result values. Baseline captured on analyzer **344** (`QA_AUTO_0812 GX workflow`,
`identifierPattern` `GENEXPERT|CEPHEID`, 32.82.68.83:9600, `connectionRole: SERVER`): pending
codes 0, pending result values 0, result-value mappings 44 (2 bound), analyzer-code mappings 0,
blockers `UNBOUND_RESULT_VALUES` + `NO_ACTIVE_CONTROL_LOT`. Server resolves to **35.85.196.163**.
Parked 2026-08-12 — harness availability unknown.

## In-app UAT script (`/__review/oe-review-widget.js`, shadow host `#oe-review-host`)
| Story · step | Verdict recorded |
|---|---|
| Profile and setup · 1 find a profile, inspect protocol/mappings/QC | **Pass** |
| Profile and setup · 2 create an analyzer inline | **Pass** |
| Profile and setup · 3 review and confirm test + QC mappings | **Fail** (Δ-P, Δ-E, Δ-F, Δ-G) |
| Profile and setup · 4 enter connection settings, run Test connection | **N/A** — deferred pending harness |
| Result values and QC · 1 resolve a pending qualitative value | **Fail** (Δ-O) |
| Result values and QC · 2 add/select QC rule and control lot | **Pass** (Δ-R noted) |
| Result values and QC · 3 readiness before and after | **Fail** (Δ-O, Δ-G/Δ-J) |
| Overall review · 1 | pending — awaiting framing |

## Run
```bash
BASE=https://analyzers.openelis-global.org npx playwright test \
  --config=all-tc.config.ts --project=analyzer-guided-setup
```
Credentials default to `admin`/`adminADMIN!`; override with `OE_USER`/`OE_PASS`.

Written **flip-when-fixed**: every Δ is asserted at its *current* behavior. When the work lands the
assertion fails — that is the signal to flip it to the spec, not to relax it.

## Test data left behind
`QA_AUTO_0812 GeneXpert` (342, now carrying control lot `QA_AUTO_0812_LOT1` on test 395),
`QA_AUTO_0812 Sysmex walkthrough` (343), `QA_AUTO_0812 GX workflow` (344). **Not cleaned up**: the only action available is a hard Delete and the LIMS rule is
deactivate-never-delete (Δ-N). Needs a manual sweep or a deactivate endpoint.
