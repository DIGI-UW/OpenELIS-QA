import { defineConfig, devices } from '@playwright/test';

// Runs the Test Catalog flip-when-fixed GUARDS with an AUTHENTICATED context.
// Fix for the auth gap: the guards' API read-backs used the standalone `request` fixture, which
// does NOT inherit the page login → every API call hit the login page (HTTP 200 HTML), producing
// false "flips" and JSON-parse errors. Here a `setup` project logs in once and saves storageState;
// the guards project loads it via `use.storageState`, so BOTH the page context AND the `request`
// fixture (incl. the API-only downstream spec) are authenticated.
const BASE = process.env.BASE ?? 'https://testing.openelis-global.org';
export default defineConfig({
  testDir: '.',
  timeout: 150000,
  expect: { timeout: 15000 },
  reporter: [['line']],
  workers: 1,
  use: { ...devices['Desktop Chrome'], baseURL: BASE, headless: true, ignoreHTTPSErrors: true },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'guards',
      testMatch: /test-catalog-(sections-roundtrip|critical-indicator|downstream)\.spec\.ts/,
      dependencies: ['setup'],
      use: { storageState: '.auth/user.json' },
    },
  ],
});
