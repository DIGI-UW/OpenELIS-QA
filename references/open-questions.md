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

---

## Maintenance
This file is the collaboration ledger between the skill and Casey. Keep it short by promoting
resolved questions into real cases promptly. Durable coverage gaps (vs the live menu map) still
go in `coverage-gap-analysis.md`; this file is specifically for *workflow-intent* uncertainty.
