# Harness rules that bite

The short list. Each rule cost a session real time or produced a wrong result. The long-form
post-mortems are in the QA repo at `references/playwright-harness.md` (grep by section number).

## Timeouts (Casey: "30 seconds to respond to a click seems like a defect, but not to complete a TC")

| Budget | Governs | Value |
|---|---|---|
| `timeout` | the whole case | 120 s (300 s for chains) |
| `use.actionTimeout` | one click | **30 s** |
| `use.navigationTimeout` | one page load | 90 s (300 s for the 16 MB bundle on a slow link) |
| `expect.timeout` | one assertion | 15 s |

`expect.timeout` does not govern actions. Raising the case timeout without `actionTimeout` makes
every stuck click wait the whole case. The SPA boots in 28 to 50 s on testing.

## Driving the app

- Navigate by route (`go(page, '/Results?accessionNumber=<lab#>')`), not by clicking side-nav
  text: nav anchors are hidden when the nav is collapsed. Deep links beat fill-and-click search.
- Never `.click()` a Carbon checkbox (60 s tab hang). Use the native setter.
- Carbon radios hide the input; click the `<label for=...>`.
- Carbon `Dropdown` type-ahead: focus the trigger first, or keystrokes hit the global search
  shortcut and abandon in-progress setup.
- Carbon danger buttons have accessible names like "danger Unlink": anchor regexes at the end.
- The header has its own Search button: scope Search buttons to `main`.
- "Still There?" overlays the page on idle; `go()` and `shot()` dismiss it.
- CSRF token is `localStorage['CSRF']`; send it as `X-CSRF-Token` on every POST.
- Six connections per host. Reports that leak connections (Export Routine CSV, Rejection Report)
  are never looped; never run the Statistics Report with "All" time frames. Confirm a hazard
  from `pg_stat_activity` or a thread dump, not by triggering it again.
- Save success is often silent: confirm by the 200 and a read-back on another screen.

## Writing specs that can fail

- `locator.isVisible({ timeout })` ignores the timeout. Use `expect(locator).toBeVisible()`.
- A tripwire (`test.fail()`) passes for the wrong reason if its locator breaks or an `apiGet`
  runs on `about:blank` (relative fetch throws). Read the failure reason from the JSON reporter
  (`PLAYWRIGHT_JSON_OUTPUT_NAME`), not just the pass/fail.
- When a tripwire's bug is fixed, flip it to a guard in the same QA PR that closes the ticket.
- Build gate: a build without the fix can answer the same endpoints with old semantics. Gate
  fix-verification specs on a signal only the fixed build has.
- Build the fixture that discriminates (for example a sex- and age-banded range), rather than
  hoping the instance has one. On an unbanded fixture the fixed and broken code agree.
- Test more than one data variant before calling a behaviour general.
- Same-day reruns collide with unique-name rules: put a per-run suffix (stamp plus ppid) on
  every name you create.
- Playwright restarts the worker after a failure and re-runs `beforeAll`: keep fixture ids in a
  file keyed by the run stamp. Scope list assertions to the run stamp.
- Lists with no stale-response guard: wait for the response carrying your parameters, then for a
  row you expect.
- A failed locale switch leaves the next case in French: pick the locale by id and restore
  English in `afterEach`.
- Grep-only runs of serial specs give false results: run serial files whole.
- Two writers in one output folder ruin a run: one launch per folder, PID files, kill by PID.

## Repo mechanics

- `modules.config.ts` collects the flat `tests/*.spec.ts`; a new spec there needs no config edit.
  `deep.config.ts` and `qa.config.ts` (pngdemo) have both been picked by mistake.
- `ci-suites.json` decides what CI runs; `ci-known-reds.json` decides what is a known red.
- `check:catalogue-index` counts `| TC-... |` rows in any tracked .md: list QA reports under
  `notCatalogues` in `catalogues.json`.
- Sharing `.auth/user.json` between runs signs the other run out. Use `AUTH_STATE_FILE`.
- Gates to run before a PR: `npm run typecheck`, `lint:assert`, `lint:falsifiable`,
  `check:no-shared-logout`, `check:orphans`, `check:dupe-ids`, `catalogue:selftest`,
  `check:catalogue-index`, `check:coverage-gaps`, `check:plugin`.
- Stable fixtures: patient Abby Sebby (`0123456`), created by `data.setup.ts`. When patient-
  dependent cases all fail, check that a config ran the setup before blaming the product.
