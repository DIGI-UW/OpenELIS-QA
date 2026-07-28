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
  reporter: [['line']],
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
      testIgnore: /(\.docs\.spec\.ts|test-catalog-(critical-indicator|titer-runtime|sections-roundtrip)\.spec\.ts)/,
      dependencies: ['setup'],
      use: { storageState: '.auth/user.json' },
    },
    {
      name: 'qc-dashboard',
      testMatch: /qc-dashboard\.spec\.ts/,
      dependencies: ['setup'],
      use: { storageState: '.auth/user.json' },
    },
  ],
});
