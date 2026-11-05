import { defineConfig, devices } from '@playwright/test';

/**
 * OGC-1200 Runs, slice 1 (#4939): Runs chip, Waiting tag, run view, View raw, refusal.
 * Serial: the cases share the RUN-16 fixture on testing (order DEV01260000000001634).
 *   PW_CHROME=/usr/bin/google-chrome npx playwright test --config=ogc1200.config.ts
 */
export default defineConfig({
  testDir: '.',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.BASE_URL || 'https://testing.openelis-global.org',
    ignoreHTTPSErrors: true,
    // The sandbox ships a pinned Chrome; the Playwright browser CDN is not reachable.
    launchOptions: process.env.PW_CHROME
      ? { executablePath: process.env.PW_CHROME, args: ['--no-sandbox'] }
      : {},
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /(^|\/)auth\.setup\.ts$/ },
    {
      name: 'ogc1200',
      testMatch: /ogc-(1200-runs|1577-modules)\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, storageState: '.auth/user.json' },
    },
  ],
});
