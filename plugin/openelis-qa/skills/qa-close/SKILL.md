---
name: qa-close
description: >
  This skill should be used when QA has verified a Jira fix and the ticket should be closed:
  "close it", "close the verified ones", "approve from Acceptance", "mark OGC-xxxx done", or at
  the end of a check-in where fixes passed. It writes the evidence comment, then transitions
  the ticket, and records it on the tracker.
metadata:
  version: "0.1.0"
---

# Close a verified fix

Casey's standing instruction: always close bugs QA has verified fixed, including tickets in
Acceptance, with an evidence comment. No approval is needed per ticket.

## When a ticket is verified

All of these hold:

- Every item in the ticket was checked, not only the headline. If one item still fails, comment
  what holds and leave the ticket open.
- The check ran on a build that carries the fix (name the commit). If it ran only on a local
  stack because testing has not deployed it, say so in the comment.
- The UI shows the fixed behaviour (standing rule 2), plus the API or spec run that proves it.
- The ticket's QA tripwire, if it has one, now passes as a guard.

## Steps

1. Add the comment first:

   ```markdown
   Verified fixed on <server>, <commit> (<PR>), <date>.
   - <item 1>: <what was done and what was seen>
   - <item 2>: ...
   Specs: <dev spec> n of n; OpenELIS-QA <TC ids> pass (tripwire flipped to guard in QA #<n>).
   Data used: <orders or records>.
   ```

2. Get the transitions (`getTransitionsForJiraIssue`) and move the ticket to Done (from
   Acceptance the Approve transition has been id 6; check, ids can change).
3. Note the comment id and the ticket in the session doc and the tracker round card.
4. Flip the tripwire to a guard in the next QA PR if that has not been done.

## Don't close

- Stories or epics (Casey's call), unless he says so.
- Tickets where the only evidence is the PR description or a passing unit test.
- Tickets whose fix is on a branch that has not merged.
