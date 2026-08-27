// Analyzer guided-setup (OGC-1057 / M3) runs against a DIFFERENT INSTANCE.
//
// analyzer-guided-setup.spec.ts defaults to BASE = analyzers.openelis-global.org,
// but it was registered as a project inside all-tc.config.ts, whose auth.setup
// authenticates against testing and writes .auth/user.json. The suite therefore
// drove the analyzers instance carrying the TESTING instance cookies, never
// authenticated, and every test timed out waiting for a page that never rendered.
// That was 20 of the 27 failures in the 2026-08-26 all-tc run and NONE of them
// were defects.
//
// So it gets its own config: its own baseURL, its own login, and its own storage
// state file so it cannot clobber the testing one.
//
//   npx playwright test -c analyzer-m3.config.ts

import { defineConfig, devices } from '@playwright/test';

const BASE = process.env.BASE ?? 'https://analyzers.openelis-global.org';

export default defineConfig({
  testDir: '.',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: 1,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: BASE,
    headless: true,
    ignoreHTTPSErrors: true,
  },
  projects: [
    { name: 'setup', testMatch: /analyzer-auth[.]setup[.]ts/ },
    {
      name: 'analyzer-guided-setup',
      testMatch: /analyzer-guided-setup[.]spec[.]ts/,
      dependencies: ['setup'],
      use: { storageState: '.auth/analyzers.json' },
    },
  ],
  reporter: [['line'], ['./tests/helpers/session-guard-reporter.ts']],
});
