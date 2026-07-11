import { defineConfig, devices } from '@playwright/test';
const BASE = process.env.BASE ?? 'https://testing.openelis-global.org';
export default defineConfig({
  testDir: '.', timeout: 130000, reporter: [['line']], workers: 1,
  use: { ...devices['Desktop Chrome'], baseURL: BASE, headless: true, ignoreHTTPSErrors: true },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    { name: 'probe', testMatch: /tc-dom-probe\.spec\.ts/, dependencies: ['setup'], use: { storageState: '.auth/user.json' } },
  ],
});
