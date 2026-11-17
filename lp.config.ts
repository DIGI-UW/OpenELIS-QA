import { defineConfig, devices } from '@playwright/test';
export default defineConfig({ testDir: '.', testMatch: /label-presets\.spec\.ts/, timeout: 90000, expect: { timeout: 10000 }, use: { ...devices['Desktop Chrome'], locale: 'en-US', extraHTTPHeaders: { 'Accept-Language': 'en-US' }, headless: true, ignoreHTTPSErrors: true }, reporter: [['line']], workers: 1 });
