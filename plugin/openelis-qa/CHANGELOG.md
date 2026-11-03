# Changelog

## 0.1.0 (2026-11-03)

First version. Replaces the `openelis-test-catalog-qa` skill (last installed 28 Sep, with three
copies that had drifted apart), `openelis-bug-revalidation`, `openelis-screenshots` and
`openelis-test-catalog-csv`.

- One source: this folder in DIGI-UW/OpenELIS-QA, built and checked in CI.
- `RULINGS.md`: Casey's rulings in one ledger, checked before filing.
- Run types written down: check-in, suite run, spec-delta, upgrade check, PR-stack review.
- Where to run: the cloud sandbox (Playwright with the system Chrome against remote servers,
  since 3 Nov), Casey's Mac (stacks, gh) and Claude in Chrome (UI confirmation).
- One revalidation rule: 2 of 3 methods, one of them the UI.
- Filing card with a QA checks section, the `finding-skeptic` agent, and a hook that refuses a
  ticket without the card and asks Casey for every create.
- Tracker steps fixed: the Artifact tool with the tracker URL (the old steps named tools that
  don't exist in cloud sessions, so tracker updates were skipped).
- Evidence: marked screenshots and repro video, uploaded to the "OpenELIS QA Evidence" Drive
  folder and linked from tickets.
- Run history, the 168 KB harness post-mortems and per-PR notes stay in the repo, out of the
  plugin.
