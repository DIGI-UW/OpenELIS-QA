import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: /test-catalog-mgmt\.spec\.ts/,
  timeout: 60000,
  expect: { timeout: 10000 },
  use: { ...devices['Desktop Chrome'], headless: true, ignoreHTTPSErrors: true },
  reporter: [['line'], ['./tests/helpers/session-guard-reporter.ts']],
  workers: 1,
});
