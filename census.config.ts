import { defineConfig, devices } from '@playwright/test';

const BASE = process.env.BASE ?? 'https://testing.openelis-global.org';

export default defineConfig({
  testDir: '.',
  testMatch: /(admin|app)-route-census\.spec\.ts/,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  retries: 1,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: BASE,
    storageState: '.auth/user.json',
    headless: true,
    ignoreHTTPSErrors: true,
  },
  reporter: [['line'], ['./tests/helpers/session-guard-reporter.ts']],
});
