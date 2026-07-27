import { defineConfig, devices } from '@playwright/test';

// Runs the root-level probe/tool specs (not covered by all-tc.config or the docs project) with an
// authenticated context, so the freshness board can classify the whole 135-spec set.
const BASE = process.env.BASE ?? 'https://testing.openelis-global.org';
export default defineConfig({
  testDir: '.',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  retries: 1,
  workers: 1,
  reporter: [['line']],
  use: { ...devices['Desktop Chrome'], baseURL: BASE, headless: true, ignoreHTTPSErrors: true },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'probes',
      testMatch: /(_discover|_timing|config-pages|label-presets|tc-dom-probe|ranges-discover)\.spec\.ts/,
      dependencies: ['setup'],
      use: { storageState: '.auth/user.json' },
    },
  ],
});
