import { defineConfig, devices } from '@playwright/test';
export default defineConfig({ testDir: '.', testMatch: /_timing\.spec\.ts/, timeout: 200000, use: { ...devices['Desktop Chrome'], headless: true, ignoreHTTPSErrors: true }, reporter: [['line']], workers: 1 });
