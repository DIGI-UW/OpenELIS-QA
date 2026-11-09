import { defineConfig, devices } from '@playwright/test';

// Calculated-value suites: rule integrity (OGC-1587) and the bounded evaluator (#4852).
//   PW_CHROME=/usr/bin/google-chrome npx playwright test -c calc.config.ts
const BASE = process.env.BASE ?? 'https://testing.openelis-global.org';
export default defineConfig({
  testDir: '.',
  timeout: 240_000,
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
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'calc',
      testMatch: /tests\/(calculation-rule-integrity|calculated-results-bounded|report-required-components)\.spec\.ts/,
      dependencies: ['setup'],
      use: { storageState: '.auth/user.json' },
    },
  ],
});
