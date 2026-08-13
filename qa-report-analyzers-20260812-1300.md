# QA report — analyzers.openelis-global.org · OGC-1057 targeted + analyzer regression

| | |
|---|---|
| **Instance** | https://analyzers.openelis-global.org · **v3.2.1.11** |
| **Run** | 2026-08-12 · targeted (OGC-1057) + analyzer regression |
| **Substrate** | Claude in Chrome (interactive) + in-page REST round-trips |
| **Spec baseline** | `analyzer-profile-mapping.md` — Analyzer Types & Mapping FRS · OGC-1057 = FR-B1…B6, C1…C3, F1…F2 · AC-1…AC-10 |
| **Jira** | none filed (report-only, by request) |
| **Artifacts** | `analyzer-guided-setup.md` (suite + Δ ledger) · `analyzer-guided-setup.spec.ts` (flip-when-fixed Playwright) |

## Verdict

The guided setup is **built and coherent as a shell** — the inline Instrument step, the four-step
stepper, the profile summary, the Verify tables, Connect, and a Review/blocker screen all exist and
the analyzer entity round-trips cleanly. What is *not* built is the part the FRS is actually about:
**verification**. The catalog match, the human sign-off, the resolve-the-exception path, and the
connection probe are absent or inert, and the one remediation control that could clear the
activation gate does not save.

Net effect: **no analyzer created from a shipped profile can be activated through the UI.** The
instance corroborates it — 12 analyzers, 1 ACTIVE (created by another path), 11 stuck in `SETUP`.

**Maturity: M1.** Instrument alone reaches M3. Verify is capped at M1 (RENDER-only evidence, no
cross-link, sign-off unreachable). Connect is M2 for the address, **M0** for the probe. A module
rates at its lowest sub-feature.

## Scorecard — AC-1 … AC-10

| AC | Requirement | Result |
|---|---|---|
| AC-1 | Add Analyzer expands inline; list stays visible | **PASS** |
| AC-2 | Instrument → Verify → Connect, stacked, collapse to summary | **PARTIAL** — steps are separate routes (Δ-A); a 4th "Review" step exists (Δ-B) |
| AC-3 | Search-based instrument picker; selection loads the profile | **PARTIAL** — profile loads; picker is a 20-item Dropdown with no typeahead (Δ-C) |
| AC-4 | "My instrument isn't listed" → name/protocol/connection type | **FAIL** — control absent; FR-B3 unreachable (Δ-D) |
| AC-5 | Verify row shows code · test · LOINC · status; deterministic LOINC==LOINC vs active tests | **FAIL** — columns render, matching does not exist (Δ-E) |
| AC-6 | Explicit human confirmation; `ANALYZER_MAPPING_VERIFIED` audited | **FAIL** — button disabled by blockers while the step self-reports Complete (Δ-G) |
| AC-7 | QC codes in Verify, confirmed | **FAIL** — QC rule persists but is never offered for confirmation (Δ-H) |
| AC-8 | Non-match offers Resolve → search / catalog link / don't-receive | **FAIL** — no Resolve action (Δ-I) |
| AC-9 | A missing test does not block the others | **FAIL** — one unbound value blocks the whole analyzer (Δ-J) |
| AC-10 | One-way default; two-way only when supported, probe-verified, degrades on timeout | **FAIL** — defaults Bidirectional; control is socket direction, not data flow; no probe (Δ-K, Δ-L) |

Also touched, outside the AC-1…10 slice: AC-12 result-mapping empty state **PASS**; AC-17
deactivate-never-delete **FAIL** (Δ-N).

## The four findings that matter

**1 · Applying a profile silently drops 15 of 28 test codes.** `astm/genexpert-astm` declares 28
`default_test_mappings`; the created analyzer persists 13. Dropped: `HIV-1 Qual, HBV, HPV HR,
HPV 16_18-45, CT, NG, EV, CDIFF, MRSA, SA, TV, VANA, VANB, Mpox, WB`. The Verify screen still
renders all 28, so the administrator signs off on codes that were never stored — the precise failure
FR-B4 ("nothing maps itself silently") exists to prevent. Reproduces on the pre-existing
`Cepheid GeneXpert (ASTM Mode)` analyzer (also 13). Not a catalog filter: none of the 28 codes
matches a catalog test name either way.
*Revalidation: 3× API repeat → 13/13/13; independent second analyzer → same. Deterministic.*

**2 · The remediation path is dead, so nothing can be activated.** On *Result Value Mappings*, an
unbound row offers a proper ComboBox with exactly the mapped test's active options (FR-E1 is
genuinely satisfied — `result-value-options?testCode=MTB` resolves to test `395` and its three
options). Selecting one updates the field, but **Save result mappings stays disabled** and the row
keeps `LEGACY_UNBOUND`. `UNBOUND_RESULT_VALUES` is the blocker gating `readyForActivation`, so the
guided flow terminates in a state with no exit.
*Revalidation: programmatic option click and real mouse click, two rows, 42 unbound before and after.*

**3 · The sign-off — the point of the feature — is unreachable, and the UI says otherwise.**
`Verify current setup` is disabled whenever `blockers[]` is non-empty, which on a freshly applied
shipped profile is always. Meanwhile `Save and continue` is enabled and the stepper marks Verify
**Complete**, while `setup-verification.currentlyVerified` stays `false` through to Review. A step
that reports itself done without the confirmation it exists to capture is worse than one that blocks.

**4 · FR-C1 is not implementable as written — this one is on the spec.** The Verify table's
`OpenELIS Test` column echoes the analyzer code and `Status` is the literal string `Profile`; no
catalog lookup happens. But even a correct implementation would fail, because the shipped profile's
LOINCs are not 1:1: `MTB`/`MTB-RIF` both `85362-2`; `COVID19`/`SARSCOV2`/`SARS-CoV-2`/`Xpress` all
`94500-6`; `HIV-VL`/`HIV`/`HIV-1 Viral`/`VL` all `20447-9`; `VANA`/`VANB` both `62261-3`. On top of
that, `test-mapping-options` returns 13 catalog tests with **empty LOINC fields** — the FRS's own
prerequisite ("OpenELIS ships default tests pre-mapped with LOINC as part of this work") hasn't
landed. FR-C1 needs a documented tie-break rule before AC-5 can be satisfied by anyone.

## Smaller deviations
- **Δ-A** Verify/Connect/Review are full-page routes (`/analyzers/{id}/mappings|edit|review`), not stacked inline sections. Worth deciding deliberately — the inline promise of FR-B1 is half-kept.
- **Δ-B** A fourth step, **Review**, is a sensible addition the FRS doesn't define. Absorb it into the spec.
- **Δ-M** `NO_ACTIVE_CONTROL_LOT` is an activation gate that appears nowhere in the FRS, and it pulls the QC *program* into a surface the FRS (MC-4) deliberately kept out.
- **Δ-N** Row actions are `Field Mappings · Test Connection · Copy Mappings · Edit · QC Rules · Control Lots · Delete (danger)` — a hard Delete with no Deactivate, against FR-A3/AC-17 and the LIMS no-hard-delete rule. Note `Copy Mappings` also appears where the FRS specifies fork-on-save (FR-H) and explicitly no clone.
- Review's configuration summary omits the lab units collected on the Instrument step.

## Regression — existing analyzer surfaces
| Area | Result |
|---|---|
| Analyzers List: summary cards, search, Status/Type/Test Unit filters, 12 rows | PASS |
| New `Test Units` column renders (`1 unit(s)`) | PASS |
| Analyzer Types (`/analyzers/types`), Error Dashboard (`/analyzers/errors`) reachable from SideNav | PASS |
| `GET /analyzer/analyzers` shape | **changed** — now wrapped as `{ analyzers: [...] }`, previously a bare array. Any harness calling `.find()` on the response breaks; fixed in `analyzerList()`. |
| Pre-existing analyzers' `testMappings` counts | unchanged vs. their profiles' persisted counts, but see finding 1 — the Cepheid row carries the same 13/28 shortfall |

No regressions found in the surrounding module; the divergences are all inside the new work.

## Data census (Step 0.6)
Dashboard KPIs all zero; `displayList/ALL_TESTS` = 183 tests; 12 analyzers; 20 shipped profiles.
The instance is **analyzer-focused and order-empty** — appropriate for this slice, but it means no
end-to-end "analyzer result reaches a patient order" chain could be run. Any claim about ingestion
behavior (FR-G) is out of scope for this report.

## Test data left behind
`QA_AUTO_0812 GeneXpert` (id **342**) plus any `QA_AUTO_0812_guided*` rows the spec creates. **Not
cleaned up on purpose**: the only available action is a hard Delete, and the LIMS rule is
deactivate-never-delete. They will need a manual sweep, or a deactivate endpoint (Δ-N).

## Suggested next steps
1. Treat findings 1–3 as the OGC-1057 blocking set; finding 4 needs a spec decision from you before it can be a ticket.
2. Decide Δ-A (inline vs. routed) and Δ-B/Δ-M (Review step, control-lot gate) as spec amendments rather than build defects.
3. Re-run `analyzer-guided-setup.spec.ts` after the next deploy — every Δ assertion is written to **fail when fixed**, so the suite tells you what landed.
