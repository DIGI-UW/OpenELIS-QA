---
name: qa-checkin
description: >
  This skill should be used when Casey asks "what new work has come in that we can test?",
  "check the new commits", "what landed on develop", "test these PRs", "verify the fixes",
  "anything in Acceptance we can close?", or at the start of a QA day. It walks new develop
  commits and open PRs, verifies them on a server that carries them, closes what is fixed,
  and turns fixed tripwires into guards.
metadata:
  version: "0.1.0"
---

# Check-in: test what came in since last time

The most common QA session. Follow `qa-run` standing rules throughout.

## 1. Find the starting point

1. Read the latest session doc in the project (`claude/qa-session-*.md`, newest first) and the
   tracker's "QA does next" card (`qa-tracker`). Note the last develop commit QA tested.
2. List what moved since then:
   - develop commits: `git clone --depth 200 https://github.com/DIGI-UW/OpenELIS-Global-2` then
     `git log --oneline <last-tested>..origin/develop`.
   - Open PRs Casey asked about or that a ticket in Acceptance points to.
   - Jira: tickets moved to Acceptance or In Review since the last check-in, and QA-filed
     tickets (`labels = automated-qa`) with new activity.
   - The QA repo's nightly and develop-stack results (`ci-reports` branch, `develop-stack/latest.json`).
     NO RESULTS means the run is broken, not green.
3. Map each commit or PR to its ticket (title, branch name, PR body). Commits that touch only
   tests or CI need no product check; say so in one line.

## 2. Decide where each item can be verified

- Find the deployed commit on each server (version footer, `/actuator/info`, or the deploy
  pipeline). An item is verifiable on a server only if that server carries the merge commit.
- If testing does not carry it yet, say "not yet on testing" and either wait for the deploy or
  build a stack on the Mac (`qa-pr-stack`).
- An item that needs data testing lacks (an upgraded database, an unpaired Bridge) is "not
  verifiable on testing": name what it needs. Do not mark it passed.

Present the list to Casey in one short table before long work: item, ticket, where it can be
checked, plan. Then start; don't wait unless something is irreversible.

## 3. Verify each item

- Extract the contract from the diff, not the PR description. The description often omits
  details the code enforces.
- Run the dev team's own specs for the PR against the server when they exist (see
  `qa-run/references/where-to-run.md` for running them remotely), and the QA guards and
  tripwires that cover the area.
- Check every item in the ticket, not only the headline. Partial fixes get a comment listing what
  holds and what still fails.
- Confirm in the UI for anything user-facing (standing rule 2).
- Check new refusal messages are readable and translated (French at least), and that error paths
  answer 400 with a reason rather than 500.
- Record data you left on the server.

## 4. Close the loop

- **Fixed:** `qa-close` (evidence comment, then transition), including tickets in Acceptance.
- **Partly fixed:** comment what holds and what does not; leave it open.
- **New problem found while verifying:** a lead. Write a filing card (`qa-file-bug`) and list it
  for Casey; don't file it.
- **QA repo:** in one PR, flip fixed tripwires to guards, add guards for new behaviour, fix
  harness drift the run exposed. Run the gates, merge with gh on the Mac.

## 5. Report

One table: ticket, PR, result, Jira action (comment id). Then leads not filed, data left on the
server, and what still needs a stack or data. Update the tracker and write the session doc
(`claude/qa-session-YYYY-MM-DD-checkins.md`).
