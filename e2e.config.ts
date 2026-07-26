import { defineConfig, devices } from '@playwright/test';

// ISOLATED E2E TIER. The order→result E2E specs (critical-indicator, titer, sections-roundtrip) fail
// DETERMINISTICALLY when run inside the full suite — the testing instance degrades under load
// (net::ERR_TOO_MANY_RETRIES, browser crashes, 500s) and they fail all retries — yet they PASS in
// isolation. So run them here, alone and serially, instead of folding them into all-tc.config.
// Usage: BASE=https://testing.openelis-global.org npx playwright test --config=e2e.config.ts
const BASE = process.env.BASE ?? 'https://testing.openelis-global.org';
export default defineConfig({
  testDir: '.',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  retries: 1,
  workers: 1,           // serial — the whole point is to not overload the instance
  fullyParallel: false,
  reporter: [['line']],
  use: { ...devices['Desktop Chrome'], baseURL: BASE, headless: true, ignoreHTTPSErrors: true },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'e2e',
      testMatch: /(test-catalog-critical-indicator|test-catalog-titer-runtime|test-catalog-sections-roundtrip)\.spec\.ts/,
      dependencies: ['setup'],
      use: { storageState: '.auth/user.json' },
    },
  ],
});
