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
