---
name: qa-tracker
description: >
  This skill should be used to update the OpenELIS QA Tracker artifact: after every QA round
  that changes what Casey should know (a finding, a verified fix, a ticket filed or closed, a
  ruling, coverage added), before any triage or handoff doc, and when Casey asks "update the
  tracker", "refresh the board", "what's the release call", or "where are we".
metadata:
  version: "0.1.0"
---

# Update the QA Tracker

- **Tracker:** https://claude.ai/artifact/P6HYxRu9vUvfAoXMETKN2h ("OpenELIS QA Tracker", pinned)
- **Archive:** https://claude.ai/artifact/C4aS6TTxeeND7DhGeAaJEc ("QA Tracker Archive")
- **Pointer doc:** project doc `claude/qa-tracker.md` (revision log, layout notes). If the URLs
  there differ from these, the project doc wins.

Casey wants a page he can read at a glance: his calls and the release verdict at the top,
details in the session docs, history on the archive page.

## Steps

1. `Artifact` `action: "read"` with the tracker URL. Read the page in full; it is small.
2. Edit in place. Never append a running log.
   - **Stamp:** date and rev only.
   - **Status strip:** release verdict and "n of 7 GO conditions open". The other tiles are
     computed by the page.
   - **Your calls** (`id="calls"`): one line per open decision: a bold ask, one short why line, a
     pill (Close, OK, Ruling, Release, Access, Review, With you) and `data-since="YYYY-MM-DD"`.
     Remove a call as soon as it is settled.
   - **Release go/no-go** (`id="release"`): standing card, **never archived**. Tick or add GO
     conditions and keep "Release and upgrade notes must say" current. The verdict is Casey's
     call: write what blocks a cut and what flips it to GO; never mark GO without his OK. The
     Weekly CI block (`id="weekly-ci"`) belongs to the weekly digest task.
   - **Waiting on devs** (`id="devs"`): bug counts per owner come live from Jira. Non-Jira
     follow-ups (PR checks, merges, Transifex) go in the `EXTRAS` object in the page script,
     keyed by the Jira display name.
   - **Latest rounds:** add one card (date, title, target, two or three short `dt`/`dd` lines such
     as Done, Passed, Filed, Still open, plus the session doc path). Keep exactly three; move the
     oldest into the archive.
   - **QA does next** and **Where QA runs:** update in place.
   - **Footer:** one line for the rev.
3. Archive a dropped card: read the archive, append the card inside a dated section, publish it
   with the archive URL.
4. Publish the tracker with `url` set to the tracker URL. **Omit `capabilities`** so the live Jira
   grant stays (passing `{}` removes it).
5. If the publish is refused because a newer version exists, merge your edits onto the version
   the refusal hands you and publish again. Another thread was there first; keep its changes.
6. Add one line to the revision log in the project doc `claude/qa-tracker.md` (`project_write` the
   whole doc back) and say "tracker rev N" in your round summary.

## Rules

- Detail lives in session docs, never on the tracker.
- Don't type Jira status into the page; the bug panels are live.
- Live panel JQL: `project = OGC AND issuetype = Bug AND statusCategory != Done AND (labels in
  (automated-qa, qa-3.2.3, qa-found, found-in-docs) OR (reporter =
  "557058:99fa116c-0d0d-4dd2-aa5c-a335a4160851" AND created >= "2026-09-01")) ORDER BY priority
  DESC, updated DESC`. New QA tickets need the `automated-qa` label to appear.
- NO RESULTS from CI is a broken run; never present it as green.
