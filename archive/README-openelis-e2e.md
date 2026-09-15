# `openelis-e2e.spec.ts` — quarantined 2026-09-03

Moved here from the repo root. **No config ran it.** Every `*.config.ts` in the
repo declares an explicit `testMatch`, and none of them matched this file, so
its 310 test cases had not executed in any run for a long time.

## Why it was quarantined rather than deleted

It is the original monolithic spec (8,073 lines) that the per-chain and
per-module suites were derived from, and `ROADMAP.md` records it as "preserved
as reference". Deleting it would lose that. But leaving it at the root cost
something real: it held **93 of the 296** assertion-free tests counted by
`npm run lint:assert`, and **19 of the 36** tests that can print the word
"FAIL" to the console and still pass. A third of the backlog came from a file
nothing ran.

`archive/` is excluded from lint, so the numbers in `.assert-baseline.json` now
describe code that actually executes.

## If you want a case back

Do not re-add the file. Port the individual case into the suite that owns that
module, with a real assertion — see Section 12 of
`references/playwright-harness.md` for what "real" means here.

Refs: OGC-1192
