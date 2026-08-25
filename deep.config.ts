import { defineConfig, devices } from '@playwright/test';
export default defineConfig({ testDir: '.', testMatch: /test-catalog-mgmt-deep\.spec\.ts/, timeout: 150000, expect: { timeout: 12000 }, use: { ...devices['Desktop Chrome'], headless: true, ignoreHTTPSErrors: true }, reporter: [['line'], ['./tests/helpers/session-guard-reporter.ts']], workers: 1, fullyParallel: false });
