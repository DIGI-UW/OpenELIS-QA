import { defineConfig, devices } from '@playwright/test';

// Runs the ENTIRE Test Catalog spec suite with an authenticated context (setup + storageState),
// for validating OGC-1142 (Test Catalog Completion v2) end-to-end on testing.
// The flip-when-fixed guards (editor-regressions, mgmt, sections-roundtrip) should FAIL where
// OGC-1142 fixed a defect — that's the signal to update the spec to assert the fixed behavior.
const BASE = process.env.BASE ?? 'https://testing.openelis-global.org';
export default defineConfig({
  testDir: '.',
  timeout: 180000,
  expect: { timeout: 15000 },
  // retries distinguish LOAD-FLAKE from real drift: the testing instance degrades under full-suite
  // load (net::ERR_TOO_MANY_RETRIES, browser crashes, 500s) and those specs pass on retry; a genuinely
  // drifted spec fails every attempt. The JSON report's "flaky" vs "failed" then feeds the freshness board.
  retries: 2,
  reporter: [['line'], ['./tests/helpers/session-guard-reporter.ts']],
  workers: 1,
  fullyParallel: false,
  use: { ...devices['Desktop Chrome'], baseURL: BASE, headless: true, ignoreHTTPSErrors: true },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'test-catalog',
      testMatch: /(test-catalog-.*|results-.*)\.spec\.ts/,
      // Contract-tier only: exclude the docs-capture specs that share the test-catalog-*/results-*
      // filename prefix, and the load-sensitive order→result E2E specs (those run alone via e2e.config).
      testIgnore:
        // the two results delta suites run in their own projects below
        /(\.docs\.spec\.ts|test-catalog-(critical-indicator|titer-runtime|sections-roundtrip)\.spec\.ts|results-(r1-spec-delta|page-deep-delta)\.spec\.ts|unified-results\.spec\.ts)/,
      dependencies: ['setup'],
      use: { storageState: '.auth/user.json' },
    },
    // --- unified /Results worklist surface -- --project=unified-results ---
    // Replaces the six retired legacy-submenu tests in results-entry.spec.ts.
    // Skips itself when resultsEntryUnifiedRoute is off.
    {
      name: 'unified-results',
      testMatch: /unified-results[.]spec[.]ts/,
      dependencies: ['setup'],
      use: { storageState: '.auth/user.json' },
    },
    // --- OGC-1020 R1 spec-delta guards -- --project=results-r1-delta ---
    // Written 2026-08-13 alongside qa-spec-delta-OGC-1020-R1-20260813.md and never once
    // executed: the device VM that authored them had no Playwright browsers. Ported into
    // the repo 2026-08-26 for their first real run.
    {
      name: 'results-r1-delta',
      testMatch: /results-r1-spec-delta[.]spec[.]ts/,
      retries: 0, // these assert deterministic behaviour; a retry would only mask drift
      dependencies: ['setup'],
      use: { storageState: '.auth/user.json' },
    },
    // --- Deep deltas across the whole /Results page -- --project=results-deep-delta ---
    {
      name: 'results-deep-delta',
      testMatch: /results-page-deep-delta[.]spec[.]ts/,
      retries: 0,
      dependencies: ['setup'],
      use: { storageState: '.auth/user.json' },
    },
    {
      name: 'qc-dashboard',
      testMatch: /qc-dashboard\.spec\.ts/,
      dependencies: ['setup'],
      use: { storageState: '.auth/user.json' },
    },
    // --- QA/QC control-lot lifecycle round-trip (self-seeding, cleans up) — --project=qc-control-lot ---
    {
      name: 'qc-control-lot',
      testMatch: /qc-control-lot\.spec\.ts/,
      dependencies: ['setup'],
      use: { storageState: '.auth/user.json' },
    },
    // --- QA/QC Westgard rule-config round-trip (toggle+restore, non-destructive) — --project=qc-rule-config ---
    {
      name: 'qc-rule-config',
      testMatch: /qc-rule-config\.spec\.ts/,
      dependencies: ['setup'],
      use: { storageState: '.auth/user.json' },
    },
    // --- OGC-1057 analyzer guided setup (Instrument → Verify → Connect) — --project=analyzer-guided-setup ---
    // Re-baselined 2026-08-25 against v3.2.2.0. Flip-when-fixed: assertions tagged Δ-K, Δ-R, Δ-S,
    // Δ-T, Δ-U, Δ-V encode CURRENT (wrong) behavior — a failure there means the fix landed and the
    // assertion should be flipped to the spec, not relaxed. UNtagged assertions guard the eleven
    // findings that 3.2.2.0 fixed, so they cannot silently regress. See analyzer-guided-setup.md.
    {
      name: 'analyzer-guided-setup',
      testMatch: /analyzer-guided-setup\.spec\.ts/,
      dependencies: ['setup'],
      use: { storageState: '.auth/user.json' },
    },
    // --- QA/QC alerts + violation counts + Levey-Jennings charts contract — --project=qc-alerts-charts ---
    {
      name: 'qc-alerts-charts',
      testMatch: /qc-alerts-charts\.spec\.ts/,
      dependencies: ['setup'],
      use: { storageState: '.auth/user.json' },
    },
  ],
});
