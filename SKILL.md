# Moved: the QA skill is now the openelis-qa plugin

The `openelis-test-catalog-qa` skill that lived here is retired. Its method, references and the
three sibling skills (`openelis-bug-revalidation`, `openelis-screenshots`,
`openelis-test-catalog-csv`) are now one plugin in [`plugin/openelis-qa/`](plugin/openelis-qa/README.md).

- Edit the plugin there, and Casey's rulings in [`RULINGS.md`](RULINGS.md).
- `npm run build:plugin` syncs the rulings into the plugin and writes `dist/openelis-qa.plugin`.
- CI runs `npm run check:plugin`.

The repo's `references/` keeps what belongs to the harness and its history:
`playwright-harness.md` (post-mortems), `validation-history.md`, `suite-catalog.md`,
`test-cases.md`, `open-questions.md`, `ux-heuristics.md` (rule feedback log) and
`heuristics-decisions.json`.
