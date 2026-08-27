import { defineConfig, devices } from '@playwright/test';

const BASE = process.env.BASE ?? 'https://testing.openelis-global.org';

export default defineConfig({
  testDir: '.',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: 0,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: BASE,
    headless: true,
    ignoreHTTPSErrors: true,
  },
  // A setup project is not optional. Without it this config reuses whatever
  // .auth/user.json is on disk, and a stale cookie answers HTTP 200 with the
  // LOGIN PAGE -- so the status assertion passes and the next line fails on
  // parsing. Caught by preflight PF-1 on 2026-08-27.
  projects: [
    { name: 'setup', testMatch: /auth[.]setup[.]ts/ },
    {
      name: 'workplan',
      testMatch: /workplan-by-unit-crash[.]spec[.]ts/,
      dependencies: ['setup'],
      use: { storageState: '.auth/user.json' },
    },
  ],
  reporter: [['line'], ['./tests/helpers/session-guard-reporter.ts']],
});
