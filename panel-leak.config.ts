import { defineConfig, devices } from '@playwright/test';

// RED regression: panel members leak across sample types.
// Expected to FAIL until the ordering path filters panel members by the sample
// type being ordered. See tests/panel-sample-type-leak.spec.ts for evidence.
//
//   PANEL_LEAK_LAB=DEV0126... npx playwright test -c panel-leak.config.ts

const BASE = process.env.BASE ?? 'https://testing.openelis-global.org';

export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: 0,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: BASE,
    headless: true,
    ignoreHTTPSErrors: true,
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'panel-leak',
      testMatch: /panel-sample-type-leak\.spec\.ts/,
      dependencies: ['setup'],
      use: { storageState: '.auth/user.json' },
    },
  ],
  reporter: [['line'], ['./tests/helpers/session-guard-reporter.ts']],
});
