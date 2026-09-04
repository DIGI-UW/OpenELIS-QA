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
 * eqa, and the four root `gap-suites-*` files.
 *
 * `openelis-e2e.spec.ts` (quarantined in #94) was the same problem noticed one
 * file at a time. This config is the fix at the level the problem actually
 * lives at, and `scripts/check-orphans.mjs` is the gate that stops it coming
 * back.
 *
 * WHAT IT SWEEPS
 * Everything at the top level of `tests/` EXCEPT the files another config
 * already owns (see OWNED_ELSEWHERE), plus the root gap-suites. The sweep is
 * defined by exclusion rather than by a hand-listed include set on purpose: a
 * newly added `tests/foo.spec.ts` is picked up automatically. An include list
 * would rot into exactly the bug this config exists to fix.
 *
 * RUNTIME
 * 866 tests. `workers` defaults to 1 to respect the 6-connection pool (harness
 * reference §10.9). The nightly runs this as a 4-way shard MATRIX — four
 * parallel jobs, each with workers=1 — so wall-clock drops without the
 * instance ever seeing more than four concurrent connections. Note that
 * sharding only helps when the shards are parallel jobs; four `--shard`
 * invocations inside one job do exactly the same total work. Override locally
 * with PW_WORKERS if you know what you are doing.
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
  'ranges-discover', 'panel-sample-type-leak', 'workplan-by-unit-crash',
  // dedicated single-purpose configs
  'modify-order-field-binding',        // modify-order.config.ts
  'ogc1192-env-order-visibility',      // ogc1192.config.ts
  'envseed',                           // envseed.config.ts
  'eqaflip',                           // eqa.config.ts
  'reval2',                            // reval2.config.ts
  'admin-route-census', 'app-route-census', // census.config.ts
];

const EXCLUDED = OWNED_ELSEWHERE.join('|');
/** tests/<name>.spec.ts, top level only, excluding the owned set. */
const MODULE_MATCH = new RegExp(`(^|/)tests/(?!(?:${EXCLUDED})\\.spec\\.ts$)[^/]+\\.spec\\.ts$`);

export default defineConfig({
  testDir: '.',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: Number(process.env.PW_WORKERS ?? 1),
  retries: 1,
  reporter: [['line'], ['json', { outputFile: 'regression-results/modules.json' }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: BASE,
    headless: true,
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {},
  },
  projects: [
    { name: 'setup', testMatch: /(^|\/)auth\.setup\.ts$/ },
    {
      name: 'modules',
      testMatch: MODULE_MATCH,
      dependencies: ['setup'],
      use: { storageState: '.auth/user.json' },
    },
    {
      name: 'gap-suites',
      testMatch: /(^|\/)gap-suites-[A-Z]+-[A-Z]+\.spec\.ts$/,
      dependencies: ['setup'],
      use: { storageState: '.auth/user.json' },
    },
  ],
});
