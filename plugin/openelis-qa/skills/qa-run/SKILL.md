---
name: qa-run
description: >
  This skill should be used for any QA testing of a live OpenELIS Global instance: "run QA",
  "test testing.openelis-global.org", "smoke test", "regression test", "full run", "test this
  story against the spec", "did they build what we asked for", "release check", "go/no-go", or
  any request to grade, sweep or audit OpenELIS. It holds the method every other openelis-qa
  skill builds on: standing rules, where to run, run types, grading and reporting.
metadata:
  version: "0.1.0"
---

# OpenELIS QA: the method

Drive a live OpenELIS Global instance, grade what it does by maturity (not pass count), confirm
every new failure before it becomes a finding, and leave Casey a short, accurate picture.

Casey Iiams-Hauser (he/him) is the product owner and Director of Product. Write to him plainly,
no em dashes (org rule), short sentences.

## Standing rules (never break these)

1. **No Jira ticket without Casey's say-so for that specific finding.** Comments are fine. Use
   `qa-file-bug`; the plugin's hook refuses a ticket with no QA checks section.
2. **A bug is only a bug if it shows in the UI.** An API-only result is a lead until a browser
   clickthrough shows it.
3. **Confirm 2 of 3** before calling anything a finding (`qa-file-bug/references/revalidation.md`).
4. **Check the rulings first.** `references/rulings.md` (live copy: `RULINGS.md` at the root of
   DIGI-UW/OpenELIS-QA). A ruled case is not a bug.
5. **Close what QA verified fixed**, including tickets in Acceptance, with an evidence comment
   first (`qa-close`). Casey: "I'm never going to argue with you."
6. **Merge QA PRs with gh on Casey's Mac** (Control your Mac). The repo is public: no secrets,
   never `git add -A`, never commit `.auth/`.
7. **Never type passwords into Casey's Chrome** and never copy or replay his session tokens. The
   harness logs in through its own setup project.
8. **Update the QA tracker** after every round that changes what Casey should know (`qa-tracker`),
   and write a session doc to the project (`claude/qa-session-YYYY-MM-DD-<topic>.md`).
9. **Read code at the deployed commit**, not `develop`, when citing a cause.
10. **Security findings stay out of shared docs**; detail goes only in the restricted ticket.

## Pick the run type

| Casey says | Run type | Follow |
|---|---|---|
| "What new work came in?", "check the new commits", "test these PRs" | Check-in | `qa-checkin` |
| "Run QA", "smoke", "full run", "release check", "go/no-go" | Suite run | this file, Steps 0 to 7 |
| "Test OGC-xxxx against the spec", "did they build what we asked" | Spec-delta run | `references/spec-delta-run.md` |
| "Upgrade check", "does 3.x upgrade cleanly" | Upgrade run | `qa-upgrade-check` |
| "Review the stack", "are the review comments addressed" | PR-stack review | `qa-pr-stack` |
| "Is this a real bug?", "file it" | Confirm and file | `qa-file-bug` |

## Where to run (decide before Step 0)

Read `references/where-to-run.md`. In short:

- **Cloud sandbox** (default for remote servers): reaches `*.openelis-global.org`, GitHub (git,
  not gh) and npm. Playwright runs with the system Chrome. No container images, so no local stacks.
- **Casey's Mac** (Control your Mac): local stacks from CI images, upgrade checks, unmerged stacks
  with no deployment, `gh` for PRs and merges, the GeneXpert on port 12000.
- **Claude in Chrome**: the UI clickthrough that confirms a finding, exploratory work, anything
  that needs Casey to see it. He logs in; you never type the password.

State the substrate on every result.

## Run tiers (suite runs)

- **Smoke**: login, Data Census, Chain A (order lifecycle), Y-RECON.
- **Standard**: chosen suites, all chains, Y-RECON, UX heuristic pass.
- **Full**: all suites, chains, personas, Y-RECON, heuristic pass; quarterly Partial-Feature Audit.

## Step 0: Setup

1. Read the project doc `claude/qa-testing-servers.md` (credentials and fixtures per server). If
   it is not reachable, use `references/servers.md`.
2. Record the **target identity** in the report header: hostname, version or commit (UI footer,
   `/actuator/info`, or the deploy), target type (release, distro, branch build, rapid), catalog
   (default or distro), feature flags that gate suites (`eqaEnabled`, `resultsEntryUnifiedRoute`).
3. **Feature-presence preflight** before grading new work: probe the new routes and endpoints. A
   404 on a new endpoint means the wrong build: switch targets, do not report "not implemented".
4. Prefix everything you create `QA_AUTO_<MMDD>` or `QA-`. Person names reject underscores (use
   e.g. `Qaextref`).
5. **Parallel sessions:** use your own worktree (`~/dev/OpenELIS-QA-<topic><MMDD>` on the Mac),
   your own `AUTH_STATE_FILE`, PID files for background jobs (kill by PID, never by pattern), and
   re-read any shared ledger before taking a number.

## Step 0.5: Calibrate

Recheck the open issues you will touch with non-destructive evidence (API probe, DOM read,
captured traffic). Never re-trigger a known browser-hanging or pool-exhausting action. Record
STILL PRESENT, RESOLVED or CHANGED. Skip only if the last run on the same build was within 24 h.

## Step 0.6: Data Census

One call: patient count (`lastName=A`), busiest Logbook count, `GET /rest/home-dashboard/metrics`,
recent accession range. If everything is zero the instance was reset: re-seed
(`--project=seed-data`) or mark the report "instance empty, render-only".

## Steps 1 to 3: Run

- The catalogs live in the QA repo: `master-test-cases.md` (source of truth for case detail),
  `references/suite-catalog.md` (suite index and phases), per-feature catalogs listed in
  `catalogues.json`. Clone the repo (`git clone --depth 1 https://github.com/DIGI-UW/openelis-qa`).
- Harness rules that bite: `references/harness-rules.md`. The full harness post-mortems are in the
  repo at `references/playwright-harness.md` (large; grep it).
- Chains, personas, Y-RECON and the blocking-bug etiquette: `references/workflows.md`.
- Run the UX heuristic pass on every run and every new spec: `qa-heuristics`.
- For each case record PASS, FAIL, BLOCKED or GAP, a one-line note, and its acceptance tier.
- A 5xx from an endpoint that exists is FAIL, never GAP. GAP needs a stated reason and what would
  retire it.
- Encode a known bug as `test.fail()` (a tripwire) so it flips when fixed; report the skip count
  so a green run with skips is not read as full coverage.

## Grading

**Acceptance tier, every case declares one:** RENDER < FUNCTION < PERSIST (reads back on the same
endpoint) < ROUND-TRIP (reads back on a different screen or endpoint) < CROSS-LINK (module A
changes module B) < REPORTABLE (branded PDF, valid FHIR, audit entry). A higher tier needs its
evidence or it is downgraded.

**Maturity per module:** M0 stub, M1 form only, M2 saves, M3 round-trips, M4 cross-links,
M5 reportable. A module sits at the lowest level any sub-feature hits. A phase with only RENDER
criteria is capped at M1.

**Every write gets a read-back through a different surface**, diffing every field including
arrays. A 3-condition rule that returns 2 is FAIL.

**CI results:** a run whose shards ran no suite is NO RESULTS, never "no new failures". Compare
against `ci-known-reds.json`; adding to or removing from that list is a QA PR.

## Step 4: Cleanup

Deactivate what you created (deactivate, never hard-delete). Restore admin toggles you changed
(branding, `eqaEnabled`, clinical enforcement). List data left on the server in the session doc.

## Step 5: Report

Use `references/report-template.md`: maturity first, then findings, then the heuristic summary.
Every finding carries its evidence and its substrate. Withdraw wrong findings in writing, with
the evidence that killed them.

## Step 6: Findings

New failures go through `qa-file-bug`. Present them to Casey as candidates with a filing card
each; file only the ones he names.

## Step 7: Record

- Update the tracker (`qa-tracker`) and say which rev in the round summary.
- Write the session doc to the project. For a long finding list, hand triage to its own thread
  (`qa-handoff`).
- New rulings Casey makes go into `RULINGS.md` in the next QA PR.

## References

| File | Read when |
|---|---|
| `references/where-to-run.md` | Choosing sandbox, Mac or Chrome; Mac connector patterns |
| `references/servers.md` | Fallback server list when the project doc is unavailable |
| `references/rulings.md` | Before filing, commenting or grading anything as a bug |
| `references/harness-rules.md` | Writing or running Playwright specs |
| `references/workflows.md` | Chains, personas, Y-RECON, blocking-bug etiquette |
| `references/spec-delta-run.md` | Grading a story against its FRS |
| `references/report-template.md` | Writing the run report |
| `references/test-case-authoring.md` | Adding or deepening catalog cases |
| `references/in-app-review-widget.md` | The instance ships a UAT review widget |
