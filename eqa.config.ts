import { defineConfig, devices } from '@playwright/test';
const BASE = process.env.BASE ?? 'https://testing.openelis-global.org';
export default defineConfig({
  testDir: '.', timeout: 120000, expect: { timeout: 15000 }, retries: 0, workers: 1,
  reporter: [['line']],
  use: { ...devices['Desktop Chrome'], baseURL: BASE, headless: true, ignoreHTTPSErrors: true },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    { name: 'probe', testMatch: /eqaflip\.spec\.ts/, dependencies: ['setup'], use: { storageState: '.auth/user.json' } },
  ],
});
