# openelis-qa plugin

QA for OpenELIS Global, built from what the OpenELIS QA project learned between August and
November 2026. It replaces four standalone skills: `openelis-test-catalog-qa`,
`openelis-bug-revalidation`, `openelis-screenshots` and `openelis-test-catalog-csv`. Remove those
after installing this, or both sets of instructions will load.

## What's in it

| Skill | Use it for |
|---|---|
| `qa-run` | The method: standing rules, where to run (sandbox, Mac, Chrome), run types, grading, reporting. Every other skill builds on it. |
| `qa-checkin` | "What new work came in that we can test?" Walk new commits and PRs, verify, close, flip tripwires. |
| `qa-file-bug` | Confirm a failure 2 of 3 ways (one in the UI), search Jira, check rulings and spec, write the filing card, have it challenged, file only what Casey names. |
| `qa-close` | Close a verified fix with an evidence comment. |
| `qa-tracker` | Update the OpenELIS QA Tracker artifact. |
| `qa-handoff` | Session docs, triage and design handoffs. |
| `qa-upgrade-check` | Upgrade real QA data through each version and prove nothing was lost. |
| `qa-pr-stack` | Review a stack of open PRs, build it from CI images, test it, list the product calls. |
| `qa-heuristics` | UX heuristic pass H1 to H12 and the one-click review page. |
| `qa-evidence` | Screenshots and video for bugs (to Google Drive) and for the manual and website. |
| `catalog-csv` | Author, validate and live-test test catalog CSVs. |

| Other | What it does |
|---|---|
| Agent `finding-skeptic` | Reads a filing card cold and tries to knock it down before Casey sees it. |
| Hook: session start | Reminds the session where servers, rulings and the tracker live. |
| Hook: Jira filing gate | Refuses `createJiraIssue` unless the description ends with a complete **QA checks** section and the `automated-qa` label; then asks Casey to approve. |
| Hook: git guard | Refuses `git add -A`, `git add .`, `git commit -a` and force pushes in the public QA repo. |
| Hook: tracker reminder | Once per change, asks for a tracker update when Jira or the QA repo changed and the tracker was not republished. |

Hooks and the agent work in Claude Code-style sessions. In a plain chat only the skills load.
The hooks need `python3`; without it they do nothing.

## Where the source lives

This folder in DIGI-UW/OpenELIS-QA is the only source. `RULINGS.md` at the repo root is the live
rulings ledger; `npm run build:plugin` copies it into `skills/qa-run/references/rulings.md` and
writes `openelis-qa.plugin`. CI runs `npm run check:plugin`, which fails if the copy, the package
or the structure is out of date, or if a hook self-test fails.

To change the plugin: edit files here (or `RULINGS.md`), run `npm run build:plugin`, bump
`version` in `.claude-plugin/plugin.json` and add a line to `CHANGELOG.md`, open a QA PR.

## Setup notes

- Connectors used: Atlassian (Jira), Google Drive, GitHub (read), Claude in Chrome, Control your
  Mac, and the "OpenELIS QA" project.
- Bug evidence goes to the Drive folder "OpenELIS QA Evidence"
  (https://drive.google.com/drive/folders/1Xdl3VzEtueoUSgW8l8Mf3qW0evhKDLub). Share it with the
  dev team so ticket links open. Videos need Google Drive for desktop on the Mac; screenshots
  under about 150 KB can go through the connector.
