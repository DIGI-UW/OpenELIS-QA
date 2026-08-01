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

| 3 | `/PatientMerge` | Route exists and is in the nav; no test case has ever covered it (GAP since the 2026-03-24 menu map) | (a) losing record is deactivated + linked to survivor; (b) tombstoned; (c) hard-removed — and separately, whether its accessions/results re-point to the survivor or stay put | testing v3.2.1.x | merge is effectively irreversible; No-Hard-Delete (D-002) says (c) shouldn't happen, but that needs confirming, and "did the results move?" decides PASS |
| 4 | `/GenericSample/Import` | A write-path import route with zero coverage | (a) all-or-nothing on a partial-failure file; (b) accept good rows + report failures; also (c) whether this is superseded by the CSV Bulk Sample Intake epic (OGC-1138) or is a separate legacy lane | testing v3.2.1.x | determines whether "some rows landed" is a PASS or a data-integrity FAIL — and whether it's worth authoring at all |
| 5 | `/FreezerMonitoring` excursion definition | Cold-chain UI renders (Phase 17/28) but no threshold/alerting case exists | what counts as reportable: (a) any out-of-range reading; (b) out-of-range sustained N minutes; (c) configurable per device — and whether it raises an acknowledgeable Alert now that `/rest/alerts/{id}/acknowledge` ships | testing v3.2.1.x | without the threshold rule any excursion assertion is invented; specimen viability depends on it |
| 6 | EQA V2 enrollment lifecycle | EQA V2 is newly built (verified 2026-08-01): `/rest/eqa/programs/{id}/enrollments`, `/EQAMyPrograms`, `/EQAOrders` | which states an enrollment moves through, and what `/EQAMyPrograms` shows for a participant vs an admin | testing v3.2.1.x | EQA was specced long before it was built — the shipped state machine may not match the FRS, so the FRS is not a safe source for expected results |
| 7 | `/Storage` hierarchy deactivation | Rooms CRUD covered (Phase 28); devices/shelves/racks/boxes are not | deactivating a rack/shelf that still holds sample-items: (a) blocked with an error; (b) cascades to children; (c) orphans them with a warning | testing v3.2.1.x | (c) would silently lose specimen locations; picking the wrong expectation makes a real bug look like a PASS |

_(append new rows above this line)_

## Resolved
| # | Question | Casey's answer / decision | Case authored |
|---|---|---|---|
| 1 | Vector "pool" split — how a split sub-pool gets its result (target: Indonesia distro / VECTOR) | **Casey's intent:** test the pool, all members carry that result; then split the pool and *re-order the same tests* on the smaller sub-pool, which gets its own second result scoped to that subset. **Code review (OpenELIS-Global-2 `develop`, 2026-07-01) — verified & partly corrected:** OpenELIS models **aliquoting only** — no "pool"/"deconvolution" concept in code (0 hits). `createAliquot` (`SampleManagementServiceImpl.java:111`) makes a child `SampleItem` (parent FK, split volume) and creates **zero** tests/results. Ordering tests on a split is a **separate manual** call `addTestsToSamples` (`:348`) → fresh empty NotStarted `Analysis` per sampleItem+test (`AnalysisServiceImpl.java:307`); each child analysis has its **own independent Result** — nothing is propagated across the parent↔child link. So the sub-pool's second result is real and separate, but it is **not automatic** and the parent's result is **not** auto-copied to members. Aliquot numbering is **`PARENT.N`** (dot+sequence, e.g. `LABNO.1`), **not** `LABNO.X-Y`. (The `SampleItemAliquotRelationship` table exists but is unused on the write side.) **QA expected-result:** a member/aliquot with no test ordered and no result is **PASS/expected** (results are never inherited); assert results only where a test was explicitly ordered on that aliquot. | TODO — author a deep chain: parent tested → create aliquot (`PARENT.N`) → manually add same tests to aliquot → aliquot gets its own separate result; assert no result propagation and no auto-test-ordering |
| 2 | Referral status transitions on `/SampleShipment/reference-lab-results` (target: release, testing v3.2.1.x) | **Casey:** in-transit while shipped (activated `ReferralStatus`, not yet received) → **Received** once the shipment/box is marked received → **Resulted** once a result has been **validated and released**. Tester expectation: after a box is received the referral shows Received; it only shows Resulted after the referred test's result is validated+released. | TODO — author a referral chain asserting the Sent/in-transit → Received → Resulted transitions on the reference-lab view |

---

## Maintenance
This file is the collaboration ledger between the skill and Casey. Keep it short by promoting
resolved questions into real cases promptly. Durable coverage gaps (vs the live menu map) still
go in `coverage-gap-analysis.md`; this file is specifically for *workflow-intent* uncertainty.
