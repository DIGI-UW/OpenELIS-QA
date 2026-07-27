import { defineConfig, devices } from '@playwright/test';

// BASE picks the target instance:
//   testing:       BASE=https://testing.openelis-global.org   (default)
//   Indonesia demo: BASE=https://indonesiademo.openelis-global.org
const BASE = process.env.BASE ?? 'https://testing.openelis-global.org';

export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,            // doc flows are sequential; keeps the connection pool calm
  workers: 1,
  retries: 2,                      // absorb load-flake (instance degrades under load) — real drift still fails every attempt
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE,
    trace: 'retain-on-failure',
    ignoreHTTPSErrors: true,
  },
  projects: [
    // 1) log in once, save storage state
    { name: 'setup', testDir: '.', testMatch: /auth\.setup\.ts/ },

    // 2) capture project — reuses the saved auth, tuned for crisp, watchable media
    {
      name: 'docs',
      testDir: './tests/docs',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/user.json',
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 2,                 // retina-crisp screenshots
        video: 'on',                          // record every doc flow
        screenshot: 'off',                    // explicit labeled shots via capture.ts
        launchOptions: { slowMo: Number(process.env.SLOWMO ?? 780) }, // approved watch pace; override via SLOWMO env
        actionTimeout: 15_000,
      },
    },
  ],
});
