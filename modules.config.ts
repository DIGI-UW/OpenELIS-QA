import { defineConfig, devices } from '@playwright/test';

/**
 * modules.config.ts — the module-suite sweep.
 *
 * WHY THIS EXISTS (2026-09-04)
 * An audit after OGC-1192 found that **46 spec files — 1,053 test blocks, 62%
 * of everything in the repo — were unreachable by any config**. Every
 * `*.config.ts` declares an explicit `testMatch`, and between them they simply
 * did not name these files. They had not run in any tier for a long time:
 * order-entry, validation, patient-management, reports, workplan, dashboard,
 * pathology, inventory, referral-workflow, reflex-testing, session-security,
 * storage, non-conforming, fhir-integration, i18n, accessibility, performance,
 * eqa. (The four root `gap-suites-*` files were retired on 2026-09-08.)
 *
 * `openelis-e2e.spec.ts` (quarantined in #94) was the same problem noticed one
 * file at a time. This config is the fix at the level the problem actually
 * lives at, and `scripts/check-orphans.mjs` is the gate that stops it coming
 * back.
 *
 * GAP-SUITES RETIRED (2026-09-08). The four root `gap-suites-*` files were
 * split into their own job on 2026-09-05 because Playwright shards by FILE and
 * they made one shard the long pole. They are now gone entirely: 87 of their
 * 107 cases duplicated tests that already lived in the module specs (59
 * byte-identical, 28 drifted implementations of the same TC ID), and the
 * remaining 20 were relocated into the specs that own their areas. The
 * question those suites existed to answer — "are we missing QA checks?" — is
 * now answered by `npm run check:coverage-gaps`, which diffs the catalogue
 * against the code instead of re-running covered ground. See harness ref 12.16.
 *
 * WHAT IT SWEEPS
 * Everything at the top level of `tests/` EXCEPT the files another config
 * already owns (see OWNED_ELSEWHERE). The sweep is
 * defined by exclusion rather than by a hand-listed include set on purpose: a
 * newly added `tests/foo.spec.ts` is picked up automatically. An include list
 * would rot into exactly the bug this config exists to fix.
 *
 * RUNTIME
 * 866 tests, and they are slow: these suites are UI-driven and littered with
 * fixed `waitForTimeout` sleeps. The first sharded run (2026-09-04, 4 shards,
 * retries=1) had not finished any shard after 65 minutes.
 *
 * `workers` defaults to 1 to respect the 6-connection pool (harness reference
 * §10.9). The nightly runs this as a shard MATRIX — parallel jobs, each with
 * workers=1 — so wall-clock drops without the instance seeing more concurrent
 * connections than there are shards. Sharding only helps when the shards are
 * parallel JOBS; N `--shard` invocations inside one job do the same total work.
 *
 * Two levers, in order of effect:
 *   1. retries. PW_RETRIES=0 in the nightly — see the `retries` note below.
 *      On a first run where most things fail, this roughly halves wall-clock.
 *   2. shard count. Raised 4 -> 6, which sits AT the documented connection
 *      limit, not over it. Do not raise it further without re-reading §10.9
 *      and watching the instance.
 * Override locally with PW_WORKERS if you know what you are doing.
 *
 * EXPECT RED. These suites have not run in a long time and were never gated,
 * so a large fraction will fail on first contact. That is information, not a
 * regression — triage it, do not silence it.
 */

const BASE = process.env.BASE ?? process.env.BASE_URL ?? 'https://testing.openelis-global.org';

/**
 * Top-level `tests/*.spec.ts` files owned by another config. Listed so the
 * sweep does not run them twice; each name should appear in exactly one config.
 */
const OWNED_ELSEWHERE = [
  // all-tc.config.ts — the test-catalog + results tier
  'results-by-range', 'results-by-status', 'results-by-unit', 'results-entry',
  'unified-results', 'result-type-coverage', 'multicomponent-result-routing',
  'panel-sample-type-leak', 'workplan-by-unit-crash',
  // 'ranges-discover' was listed here as owned by all-tc.config.ts. It is not:
  // all-tc does not collect it, and the only config that does is probes.config.ts,
  // a scratch bucket CI does not run. So it was excluded here on the strength of a
  // claim that was never true, and executed by nobody. Handed back to this sweep
  // 2026-09-12. scripts/check-ci-coverage.mjs is what caught it and is what keeps
  // this list honest from here.

  // dedicated single-purpose configs
  'modify-order-field-binding',        // modify-order.config.ts
  'ogc1192-env-order-visibility',      // ogc1192.config.ts
  'envseed',                           // envseed.config.ts
  'eqaflip',                           // eqa.config.ts
  'reval2',                            // reval2.config.ts
  'admin-route-census', 'app-route-census', // census.config.ts
  // referral-reception.config.ts. NOT a stylistic split: every Accept/Reject case needs a
  // referral in the "Returned" bucket, and nothing inside the instance can put one there
  // (only the peer-lab poll writes COMPLETED). Subjects are minted by
  // scripts/mint-returned-referral.sh against a local stack, so on the shared CI target
  // these cases would fail for want of fixtures, every night, saying nothing about the
  // product. See ci-suites.json `excluded`.
  'ogc803-804-referral-accept-reject',
];

const EXCLUDED = OWNED_ELSEWHERE.join('|');
/** tests/<name>.spec.ts, top level only, excluding the owned set. */
const MODULE_MATCH = new RegExp(`(^|/)tests/(?!(?:${EXCLUDED})\\.spec\\.ts$)[^/]+\\.spec\\.ts$`);

export default defineConfig({
  testDir: '.',
  // TWO BUDGETS, TWO DIFFERENT QUESTIONS. Casey's rule, 2026-09-05: "if it's
  // longer than 30 seconds, it's a defect anyway" — and, 2026-09-22: "30 seconds
  // to respond to a click seems like a defect, but not to complete a TC".
  //
  // The rule is about A CLICK, and `expect.timeout` below is where it lives: a
  // wait that has not resolved in 15s fails, tighter than the rule demands. That
  // is what stops a stuck suite burning wall clock — shard 6 of the first sweep
  // had 50 click timeouts at 90s each, ~75 minutes of pure waiting, and nothing
  // here reintroduces that.
  //
  // `timeout` is a different question: how long a whole TEST CASE may take. It
  // was set to 30s as well, which applied the click rule to a case that
  // legitimately does several navigations plus a save. Measured on testing
  // 2026-09-22, ONE Edit Order page load took 28.3s, 32.4s and 50.6s on three
  // consecutive runs — so the case budget was shorter than a single page load,
  // and a UI test could not distinguish "the product is broken" from "the page
  // had not finished rendering". In the 2026-09-22 nightly, 81 of 281 failures
  // (29%) were this timeout, and each failed canary cascade-skipped the cases
  // behind it, so the suite reported nothing about those paths at all.
  //
  // THE COST, stated because it is real: a failure that used to give up at 30s
  // may now take up to 120s. On the measured sample, roughly two in five ran to
  // the ceiling, so expect the nightly to get longer, not shorter. What it buys
  // is the diagnosis — TC-CAT-02 reported "timeout" at 30s and "the API returns
  // 500" at 120s. The same test, one number, from noise to a finding.
  //
  // WHERE THE CLICK RULE ACTUALLY LIVES: `use.actionTimeout` below, NOT here and
  // NOT in expect.timeout. This caught me out — `expect.timeout` governs
  // assertions only, and page.click()/locator.click() are ACTIONS, so with
  // actionTimeout unset they inherit the whole case budget. Raising `timeout`
  // alone would therefore have made a stuck click wait 120s instead of 30s —
  // exactly the "75 minutes of pure waiting" this config was written to prevent.
  // Verified on testing 2026-09-22: 12 of 29 system-misc failures were
  // `page.click: Test timeout exceeded`, i.e. clicks that never land, which is a
  // finding under Casey's rule and must keep failing fast.
  //
  // THE REAL FIX IS NOT HERE. A 48s SPA boot is itself a defect by the rule at
  // the top of this comment. This budget stops the harness lying about it; it
  // does not make the product fast. Where a suite does not need the SPA at all,
  // apiSession() is better than any of these numbers (api-crud: 20m -> 3.3m).
  timeout: Number(process.env.PW_TIMEOUT ?? 120_000),
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: Number(process.env.PW_WORKERS ?? 1),
  // Retries default to 1 locally, but the nightly sets PW_RETRIES=0. Retries
  // exist to absorb flake; in a suite that has never run, the failures are not
  // flake — they are the point. Retrying them doubles the cost of every failure
  // for no information. Raise this once the sweep has a stable baseline.
  retries: Number(process.env.PW_RETRIES ?? 1),
  reporter: [['line'], ['json', { outputFile: 'regression-results/modules.json' }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: BASE,
    headless: true,
    // Casey's click rule, enforced where it bites: a click that has not landed
    // in 30s is a finding, and waiting longer buys nothing. This is what keeps
    // the raised case budget above from turning a stuck click into a 120s wait.
    actionTimeout: 30_000,
    // A page load is NOT a click. Measured on testing 2026-09-22, one Edit Order
    // load took 28.3s / 32.4s / 50.6s, so navigation gets its own, larger budget
    // — bounded, so a hung navigation cannot eat the whole case.
    navigationTimeout: 90_000,
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {},
  },
  projects: [
    // A fixture is not a check, so it does not get the test-policy timeout.
    //
    // The 30s budget below the `timeout:` line is a statement ABOUT TESTS: a check
    // that takes longer than that has found slowness worth reporting. Logging in is
    // not a check. It drives a cold SPA that loads ~450 modules before it renders an
    // authenticated surface, and on 2026-09-20 it exceeded 30s twice in a row against
    // testing and took the WHOLE run with it: "1 failed [setup] · 53 did not run".
    // Nothing in that report says anything about the product.
    //
    // Same budget and same reasoning as the `data` project further down. Raise it with
    // PW_SETUP_TIMEOUT when an instance is genuinely slower.
    {
      name: 'setup',
      testMatch: /(^|\/)auth\.setup\.ts$/,
      timeout: Number(process.env.PW_SETUP_TIMEOUT ?? 120_000),
    },
    // BASELINE DATA (added 2026-09-08). `data.setup.ts` creates the patient
    // "Abby Sebby" (nationalId 0123456) and two orders, and writes their
    // accessions to `.auth/test-data.json`. Seventeen module specs import
    // PATIENT_NAME / PATIENT_ID from helpers/test-helpers.ts expecting it.
    //
    // Until now NO config ran this setup — a live probe on 2026-09-08 found
    // zero patients matching either "Sebby" or 0123456 — so the whole module
    // sweep ran against an instance with no baseline patient, and every
    // patient-dependent failure looked like a product defect. `check:orphans`
    // did not catch it because it only audits `*.spec.ts`, not setup projects;
    // it now covers both.
    //
    // The setup is deliberately non-fatal (see its tail comment): if creation
    // fails, specs degrade through getTestData() rather than the run aborting.
    {
      name: 'data',
      testMatch: /(^|\/)data\.setup\.ts$/,
      dependencies: ['setup'],
      use: { storageState: '.auth/user.json' },
      // The 30-second per-test timeout is a POLICY about tests: if a check
      // takes longer than that, the slowness is itself the finding. A fixture
      // is not a check — this one drives the UI to create a patient and two
      // orders, which legitimately takes minutes. Giving it its own budget
      // respects the policy rather than routing around it.
      // 120s, not 300s: patient creation takes ~40s. Order creation used to be
      // broken and this comment used to say so; it works as of 2026-09-09 (four
      // conditions, harness ref 12.28) and the API path is fast. Raise it via
      // PW_SETUP_TIMEOUT if the UI path is reinstated and needs longer.
      timeout: Number(process.env.PW_SETUP_TIMEOUT ?? 120_000),
      retries: 0,
    },
    // REFERENCE-LAB REFERRAL DATA (added 2026-09-15). The Reference Lab Results
    // page (OGC-798..815) is built and shipped and every one of its four metric
    // tiles reads 0 on a stock instance, because nothing has ever created a
    // referral: `GET /rest/displayList/REFERRAL_ORGANIZATIONS` answers `[]` on an
    // instance holding 27 organizations, so no reference lab can be picked and no
    // referral can be made through any screen. Eighteen stories sat In Review with
    // nothing to test against. This fixture is what changed that.
    //
    // It depends on `data`, not just `setup`: it attaches its referrals to that
    // setup's baseline patient rather than creating a second one.
    //
    // Non-fatal, same contract as `data` — see the setup file's own header.
    {
      name: 'referral-data',
      testMatch: /(^|\/)referral-seed\.setup\.ts$/,
      dependencies: ['setup', 'data'],
      use: { storageState: '.auth/user.json' },
      timeout: Number(process.env.PW_SETUP_TIMEOUT ?? 150_000),
      retries: 0,
    },
    {
      name: 'modules',
      testMatch: MODULE_MATCH,
      dependencies: ['setup', 'data', 'referral-data'],
      use: { storageState: '.auth/user.json' },
    },
  ],
});
