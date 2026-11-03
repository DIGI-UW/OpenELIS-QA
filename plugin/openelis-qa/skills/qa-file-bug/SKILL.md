---
name: qa-file-bug
description: >
  This skill should be used whenever a QA run produces a new FAIL or a lead and the question is
  "is this a real bug?", "should we file this?", "file it", "write the ticket", "draft the Jira",
  or before any comment that claims a regression. It confirms the failure 2 of 3 ways, checks
  Jira, the rulings and the spec, writes a filing card, has it challenged cold, and only then
  drafts a ticket for Casey to approve.
metadata:
  version: "0.1.0"
---

# Confirm and file a finding

Goal: nothing reaches Jira that is transient, already filed, already ruled on, contradicted by
the spec, or claimed beyond its evidence. Casey files nothing he hasn't named, and the
plugin's hook refuses a ticket whose description has no complete QA checks section.

## 1. Confirm (2 of 3)

Follow `references/revalidation.md`. One of the confirmations must be a **UI clickthrough**
(Claude in Chrome, a foreground tab, or a headed Playwright run with a screenshot or video). A
failure that only shows in the API is a lead.

## 2. Search Jira

Project OGC, site `uwdigi.atlassian.net`. Search open **and Done** tickets by route or endpoint,
error text, field names, the TC id, and the feature epic. Include `labels = automated-qa`.

- An open ticket matches: comment on it instead (new evidence, build, date).
- A Done ticket matches and the bug is back: comment and say "regressed", naming the build that
  fixed it and the build where it is back.
- A related ticket exists: plan a Relates link.

## 3. Check rulings and spec

- `qa-run/references/rulings.md`: is the behaviour ruled on, or is the area going to a redesign?
  If so, stop: it is not a ticket.
- Find the spec for the feature (the FRS in DIGI-UW/openelis-work `designs/`, the epic, or the
  ticket's acceptance criteria). Quote the line the behaviour breaks. If the spec is silent or
  says otherwise, it is a question for Casey, not a bug.
- Check whether the capability already exists elsewhere in the module before claiming it is
  missing.

## 4. Check the build

Name the server, its deployed commit, and the date. Confirm the commit carries the code you are
judging. When citing a cause, read the code at that commit.

## 5. Write the filing card

Use `references/filing-card.md`. The card goes to Casey in the conversation and, once he
approves, its **QA checks** section goes at the end of the ticket description. Make the claim
exactly as strong as the evidence: say what was not checked.

## 6. Challenge it

Give the card (not your reasoning) to the `finding-skeptic` agent and fold in what it finds.
Withdraw or narrow the finding if it lands a hit. Record withdrawals in writing.

## 7. Present, then file only what Casey names

List the cards with a one-line recommendation each (file, comment on OGC-x, merge into another,
downgrade, withdraw). When Casey names one, create it per `references/jira-conventions.md`.
Then update the tracker.

## 8. Evidence

Attach evidence per `qa-evidence`: marked screenshots and a short video of the repro, uploaded to
Google Drive, linked from the ticket. Mask patient names and IDs.
