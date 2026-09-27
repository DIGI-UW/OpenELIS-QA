import { defineConfig, devices } from '@playwright/test';
const BASE = process.env.BASE || process.env.BASE_URL || 'https://testing.openelis-global.org';
export default defineConfig({
  timeout: 1_800_000,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: { ...devices['Desktop Chrome'], baseURL: BASE, headless: true, ignoreHTTPSErrors: true },
  projects: [
    { name: 'setup', testDir: '.', testMatch: /auth\.setup\.ts/ },
    { name: 'seed-data', testDir: '.', testMatch: /seed-data\.setup\.ts/, dependencies: ['setup'], use: { storageState: '.auth/user.json' } },
  ],
});
