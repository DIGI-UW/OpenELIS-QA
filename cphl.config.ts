import { defineConfig, devices } from '@playwright/test';

// CPHL PNG field report of 8 Nov 2026: guards and tripwires for OGC-1613 to 1616 and OGC-1620.
//   PW_CHROME=/usr/bin/google-chrome npx playwright test -c cphl.config.ts
const BASE = process.env.BASE ?? 'https://testing.openelis-global.org';
export default defineConfig({
  testDir: '.',
  timeout: 300_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  workers: 1,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: BASE,
    headless: true,
    ignoreHTTPSErrors: true,
    launchOptions: process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME, args: ['--no-sandbox'] } : {},
  },
  projects: [
    { name: 'setup', testMatch: /(^|\/)auth\.setup\.ts$/ },
    {
      name: 'cphl',
      testMatch: /tests\/cphl-field-report\.spec\.ts/,
      dependencies: ['setup'],
      use: { storageState: '.auth/user.json' },
    },
  ],
});
