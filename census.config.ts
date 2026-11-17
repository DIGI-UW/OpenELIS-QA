import { defineConfig, devices } from '@playwright/test';

const BASE = process.env.BASE ?? 'https://testing.openelis-global.org';

export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  retries: 1,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: BASE,
    // Pinned 2026-11-17: specs read English text; an unset locale follows the machine.
    locale: 'en-US', extraHTTPHeaders: { 'Accept-Language': 'en-US' },
    headless: true,
    ignoreHTTPSErrors: true,
  },  projects: [
    { name: 'setup', testMatch: /auth[.]setup[.]ts/ },
    {
      name: 'census',
      testMatch: /(admin|app)-route-census[.]spec[.]ts/,
      dependencies: ['setup'],
      use: { storageState: '.auth/user.json' },
    },
  ],

  reporter: [['line'], ['./tests/helpers/session-guard-reporter.ts']],
});
