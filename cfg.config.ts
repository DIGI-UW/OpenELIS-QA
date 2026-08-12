import { defineConfig, devices } from '@playwright/test';
export default defineConfig({ testDir: '.', testMatch: /config-pages\.spec\.ts/, timeout: 90000, expect: { timeout: 10000 }, use: { ...devices['Desktop Chrome'], headless: true, ignoreHTTPSErrors: true }, reporter: [['line']], workers: 1 });
