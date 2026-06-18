# QA Tracker — the living status board

> The **OpenELIS QA Tracker** is a Cowork **artifact** (a live HTML view), not a Confluence
> page. Every run, this skill **creates it if missing or updates it** so it stays current. Its
> top section surfaces what needs Casey's attention.

## Find / create / update
1. `mcp__cowork__list_artifacts` → find the artifact with id **`openelis-qa-tracker`**. Read its `path` to see current HTML.
2. If it exists → `mcp__cowork__update_artifact` (id `openelis-qa-tracker`, new `html_path`).
3. If it does NOT exist → `mcp__cowork__create_artifact` (id `openelis-qa-tracker`).
4. Only list MCP tools in the artifact you've actually called and whose shape you verified this run.

## What the tracker shows (top → bottom)
1. **⚠ Needs your attention** (the point of the tracker):
   - **Open QA bugs — live.** A live Jira call, not hardcoded keys. JQL:
     `project = OGC AND labels = automated-qa AND statusCategory != Done ORDER BY priority DESC, created DESC`.
     Render highest-priority first; count total + High/Highest. (Verified connector:
     `searchJiraIssuesUsingJql`; parse `data.issues.nodes[].fields` + node `webUrl`.)
   - **Open questions / NEEDS-GUIDANCE** — the workflow questions awaiting Casey. Refresh this
     each run from `references/open-questions.md` (the `## Open` rows). These are *not* guessed
     PASS/FAILs — they're decisions only Casey can make (see `test-case-authoring.md`).
   - **Gaps / dead branches** — count of UNCOVERED + known dead branches worth a decision.
2. **Targets tested** — instances with their **target type** (release / distro / rapid) per `test-targets.md`.
3. **Latest run snapshot** — pass/bug/observation/maturity counts from the run's machine-readable JSON summary (`report-template.md` §7). Update this each run.
4. **Longitudinal bug matrix** — fixed/bug/new/na per version (skill-maintained snapshot; keep history, add the new target's column).

## Data sources (live vs. snapshot)
- **Live (in-artifact connector):** the open-QA-bugs Jira panel — refreshes on the view's Reload.
- **Snapshot (skill refreshes each run):** the open-questions panel, run-snapshot counts, target rows, and the bug matrix. Inline these into the HTML when you update the artifact — don't make the artifact fetch repo files it can't reliably reach.

## Rules
- **Don't duplicate Jira state into the HTML** — the open-bugs panel is live; the skill never types a bug-status table into the artifact (same reason the skill dropped its embedded known-bugs table — see `bug-triage.md`).
- Keep it **target-aware**: the run snapshot is for a specific target (release/distro/rapid) — label it; don't overwrite another target's column in the matrix, add/update its own.
- Preserve history: the matrix and prior runs stay; you append the current run.
- After updating, mention the tracker in the run report so Casey knows it's refreshed.
