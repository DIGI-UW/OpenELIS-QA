import { defineConfig, devices } from '@playwright/test';

const BASE = process.env.BASE ?? 'https://testing.openelis-global.org';

export default defineConfig({
  testDir: '.',
  testMatch: /catalog-feature-chains\.docs\.spec\.ts/,
  timeout: 240_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: 0,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: BASE,
    storageState: '.auth/user.json',
    headless: true,
    ignoreHTTPSErrors: true,
    actionTimeout: 20_000,
  },
  reporter: [['line'], ['./tests/helpers/session-guard-reporter.ts']],
});
