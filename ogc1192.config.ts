import { defineConfig, devices } from '@playwright/test';

/**
 * OGC-1192 flip-when-fixed suite.
 * Serial by design: every case reads the single order created in beforeAll.
 */
export default defineConfig({
  testDir: '.',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.BASE_URL || 'https://testing.openelis-global.org',
    ignoreHTTPSErrors: true,
    // The sandbox ships a pinned Chromium; PW's bundled revision is not downloaded.
    launchOptions: process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {},
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /(^|\/)auth\.setup\.ts$/ },
    {
      name: 'ogc1192',
      testMatch: /ogc1192-env-order-visibility\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: '.auth/user.json' },
    },
  ],
});
