---
name: qa-handoff
description: >
  This skill should be used at the end of a QA round or thread: "write it up", "hand this off",
  "spin off triage", "write the session doc", "start a new thread for triage", or when the
  finding list is long enough that triage should move to its own thread. It writes the session
  doc and, when needed, a triage or design handoff with an opening prompt.
metadata:
  version: "0.1.0"
---

# Session doc and handoffs

Every QA session leaves a session doc in the "OpenELIS QA" project. Long finding lists get a
separate triage handoff so testing and triage don't share one thread.

## Session doc

Path: `claude/qa-session-YYYY-MM-DD-<topic>.md` (`project_write`). Sections, each short:

1. **Ask:** Casey's words, quoted.
2. **Where it ran:** substrate (sandbox, Mac, Chrome), server, deployed commit, worktree.
3. **Results:** a table per area (ticket or TC, PR, result, Jira action with comment id).
4. **Leads, not filed (Casey's call):** one line each, with the evidence location.
5. **Rulings Casey made:** quoted, with the date. Add each to `RULINGS.md` in the next QA PR.
6. **QA repo:** PRs opened or merged (number, merge commit).
7. **Data left on the server:** orders, users, batches, config changed and restored.
8. **Next:** what still needs a stack, data or a decision.
9. **Tracker:** the rev you published.

Write it after the tracker update, not instead of it. Keep security detail out.

## Triage handoff (when findings exceed what one thread can triage)

Path: `claude/triage-handoff-YYYY-MM-DD.md`. Contents:

- What to do: walk Criticals, then Highs, then Mediums with Casey; for each, read the evidence,
  search Jira, revalidate if older than the last deploy, propose file / comment / merge /
  downgrade / withdraw, file only on his say-so.
- The findings as filing cards (`qa-file-bug/references/filing-card.md`), most severe first.
- Rules that apply (standing rules from `qa-run`, relevant rulings).
- An opening prompt Casey can paste into the new thread.

## Design handoff

When findings belong to a redesign (rulings R-10 to R-14), write
`claude/handoff-<area>-YYYY-MM-DD.md` for a Claude design session: what was found, the evidence,
what the redesign should cover, and where the spec and mockups live.
