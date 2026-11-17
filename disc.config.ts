import { defineConfig, devices } from '@playwright/test';
export default defineConfig({ testDir: '.', testMatch: /_discover\.spec\.ts/, timeout: 90000, use: { ...devices['Desktop Chrome'], locale: 'en-US', extraHTTPHeaders: { 'Accept-Language': 'en-US' }, headless: true, ignoreHTTPSErrors: true }, reporter: [['line']], workers: 1 });
