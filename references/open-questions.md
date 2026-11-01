# Open Questions — workflows the skill needs Casey to clarify

> The standing home for the **UNCERTAIN / NEEDS-GUIDANCE** items the authoring loop surfaces
> (see `test-case-authoring.md`). When a run hits a workflow it can't confidently write an
> expected result for, it lands here instead of getting lost in a single report. Casey answers
> in batches; an answered question becomes a real test case (and the row moves to Resolved).
>
> **Rule:** never invent expected behavior for an open question and assert PASS/FAIL on it.
> Mark the case `NEEDS-GUIDANCE`, add a row here, move on.

## How to use
- A run **appends** new questions (don't duplicate an existing open one).
- Each row: what was observed, the candidate interpretations, why it matters, and the target it came from (release/distro/branch — workflows can differ by target).
- When Casey answers, record the decision, author the case in `master-test-cases.md`, and move the row to **Resolved** (keep it — the rationale is useful history).

## Open
| # | Area / workflow | What I observed | Candidate interpretations | Target | Why it matters |
|---|---|---|---|---|---|
| _ex_ | Reflex on already-validated sample | reflex rule references a test on a sample already validated | (a) reflex should not fire; (b) fires + reopens; (c) fires into a new order | testing v3.2.1.x | determines whether a "no reflex" result is PASS or a missed trigger |

| 3 | Add Order patient photo editability in view mode | On `/SamplePatientEntry` with an existing patient selected, the patient panel is read-only (`fieldset[disabled]`, 12 inputs disabled) but `PatientImageSelector` gets `disabled={false}`. Since PR #3987 portaled the dialogs out of the fieldset, the picker's controls are live (0/11 disabled: Import, Take Photo, Change Image, Confirm) — so the photo is editable where nothing else is. | (a) caller should pass `disabled` in sync ⇒ click opens the read-only **View Photo** viewer; (b) photo capture during order entry is intended ⇒ make it visually explicit and keep it editable | testing v3.2.1.11 (PR #3987) | decides whether the regression suite asserts the viewer or the picker. The spec currently pins OBSERVED behaviour (picker) and fails loudly either way it is resolved. Also gates OGC draft F-1. |

| 9 | Microbiology case lifecycle on testing | `/MicrobiologyWorklist` and `/MicrobiologyCaseView/:caseId` are in the shipped router (2026-10-01). The design side has ~30 provisional micro decisions from the last week (D-146 to D-170) | (a) author cases only for states visible on testing now; (b) wait for Microbiology v2 to settle; (c) author against the M-04/M-05 FRS and mark divergences | testing, bundle index-DDcS0cc-.js | decides whether micro gets cases now or after v2 |
| 10 | May QA press "Release all clear" on testing? | The guarded bulk-release button is live on Validation > Routine once a Test Unit is chosen; the drift check never pressed it (shared queue data) | (a) only on rows the run seeded itself; (b) never on testing, use a dev stack; (c) yes, with a revert note | testing 3.2.2.x | without it the lane rule has no PERSIST-level case |
| 11 | Range display when patient sex or age is blank (OGC-1362) | FRS v0.2 FR-16a: a result is Needs review with "Range not applied" only when its test has sex- or age-banded normals and the value is missing. PR #4455 merged 2026-09-28; not seen live | (a) show no range and the chip; (b) show the unbanded range if one exists; (c) something else | develop / next testing build | needed to write the expected result |
| 12 | Which build is "current" for the freshness manifest? | `spec-freshness.json` says `currentBuild: index-u12wW6QI.js`, lastUpdated 2026-09-28, and 111 specs "fresh" on it, but every spec's `lastRun` is 2026-07-31 or earlier and its session records pair that build with 2026-07-31. Testing now serves `index-DDcS0cc-.js` | (a) the refresh script restamps `lastBuild` without updating `lastRun`; (b) the build hash was reused; (c) the manifest was regenerated from an old run | testing | "fresh" may overstate what ran on the current build |
| 13 | Where did the 13 older analyzer profiles go? | `projects/analyzer-profiles/` (Sysmex XN, Mindray BC/BS, Horiba, Stago, Abbott Architect) is gone from develop; the Bridge ships only GeneXpert ASTM, FluoroCycler XT, QuantStudio | (a) moved to a distro; (b) dropped; (c) on a Bridge branch | develop 2026-10-01 | any analyzer case that expects those profiles to be pickable needs a new fixture |

| 14 | Does the QA harness follow constitution V.7 (Test Isolation)? | Upstream 1.12.0 (2026-09-29) makes test isolation MANDATORY: a result may depend only on the code under test and data the test created. Several specs here read lab-wide "today" data or rely on chain seeds shared across specs | (a) bring the harness under V.7 (own data, scoped reads, pinned time); (b) record this repo as an exception, since it tests long-lived shared instances, and keep V.7 only for new specs | testing, local develop | Decides whether count/dashboard specs are rewritten or kept as instance probes |
| 15 | Referred Out Tests screen after `/ReferredOutTests` left the router | The 2026-10-06 router has no `/ReferredOutTests`; seven specs still navigate there. The Referred Out list now renders as a report component (`referredOut`) | (a) retired on purpose: move the cases to the report or `/SampleShipment`; (b) regression: route should exist | testing `index-CeaYeajT.js` | Seven cases will fail on routing rather than behaviour |

_(append new rows above this line)_

## Resolved
| # | Question | Casey's answer / decision | Case authored |
|---|---|---|---|
| 1 | Vector "pool" split — how a split sub-pool gets its result (target: Indonesia distro / VECTOR) | **Casey's intent:** test the pool, all members carry that result; then split the pool and *re-order the same tests* on the smaller sub-pool, which gets its own second result scoped to that subset. **Code review (OpenELIS-Global-2 `develop`, 2026-07-01) — verified & partly corrected:** OpenELIS models **aliquoting only** — no "pool"/"deconvolution" concept in code (0 hits). `createAliquot` (`SampleManagementServiceImpl.java:111`) makes a child `SampleItem` (parent FK, split volume) and creates **zero** tests/results. Ordering tests on a split is a **separate manual** call `addTestsToSamples` (`:348`) → fresh empty NotStarted `Analysis` per sampleItem+test (`AnalysisServiceImpl.java:307`); each child analysis has its **own independent Result** — nothing is propagated across the parent↔child link. So the sub-pool's second result is real and separate, but it is **not automatic** and the parent's result is **not** auto-copied to members. Aliquot numbering is **`PARENT.N`** (dot+sequence, e.g. `LABNO.1`), **not** `LABNO.X-Y`. (The `SampleItemAliquotRelationship` table exists but is unused on the write side.) **QA expected-result:** a member/aliquot with no test ordered and no result is **PASS/expected** (results are never inherited); assert results only where a test was explicitly ordered on that aliquot. | TODO — author a deep chain: parent tested → create aliquot (`PARENT.N`) → manually add same tests to aliquot → aliquot gets its own separate result; assert no result propagation and no auto-test-ordering |
| 2 | Referral status transitions on `/SampleShipment/reference-lab-results` (target: release, testing v3.2.1.x) | **Casey:** in-transit while shipped (activated `ReferralStatus`, not yet received) → **Received** once the shipment/box is marked received → **Resulted** once a result has been **validated and released**. Tester expectation: after a box is received the referral shows Received; it only shows Resulted after the referred test's result is validated+released. | TODO — author a referral chain asserting the Sent/in-transit → Received → Resulted transitions on the reference-lab view |

---
| 8 | Analyzer Error Dashboard: still a product surface? | **Casey, 2026-09-24: superseded.** Leave it retired; no bug for the unlinked `/analyzers/errors` route. | BM-DEEP and TC-ANZ-03 retired (#179, #180) |
| 7 | Panel description uniqueness (Delta-SA6) | **Casey, 2026-09-23: descriptions do not need to be unique.** The 500 on a duplicate description is a defect. | Included in the single Test Catalog silent-actions bug |
| 5 | Panel Editor: duplicate name on Add Panel (Delta-SA2) | **Casey, 2026-09-24: reject OGC-1122** with SA2 as the reason; reopened In Progress with a suggested 409 contract. OGC-1234 item 2 moved there. | TC-SA-11 cites OGC-1122; TC-SA-12 rewritten as a 409 tripwire |
| 6 | Terminology: code cleared in place deletes the mapping | **Casey, 2026-09-24: fine as-is** (it will not be heavily used). Intended; not a bug. | None (no tripwire) |
| 4 | Copy configuration from test semantics | **Casey, 2026-09-23: Copy replaces**, behind a confirmation modal saying the change is irreversible once saved; confirm stages the source config, Save commits. | TC-SA-02 rewritten to this contract |

## Maintenance
This file is the collaboration ledger between the skill and Casey. Keep it short by promoting
resolved questions into real cases promptly. Durable coverage gaps (vs the live menu map) still
go in `coverage-gap-analysis.md`; this file is specifically for *workflow-intent* uncertainty.
