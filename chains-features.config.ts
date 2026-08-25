import { defineConfig, devices } from '@playwright/test';

// Catalogue feature chains, run against an AUTHENTICATED context.
//
// The first cut of this config set use.storageState but declared no `setup`
// project, so it silently reused whatever .auth/user.json happened to be on
// disk. When that cookie was a day old every request came back as the LOGIN
// PAGE with HTTP 200 and an HTML body, and the failure surfaced as
// SyntaxError: Unexpected token '<' — which reads like a broken endpoint, not
// an expired session. Declaring the setup dependency is what makes the run
// self-contained. census.config.ts still has this same gap.

const BASE = process.env.BASE ?? 'https://testing.openelis-global.org';

export default defineConfig({
  testDir: '.',
  timeout: 240_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: 0,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: BASE,
    headless: true,
    ignoreHTTPSErrors: true,
    actionTimeout: 20_000,
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chains',
      testMatch: /catalog-feature-chains\.docs\.spec\.ts/,
      dependencies: ['setup'],
      use: { storageState: '.auth/user.json' },
    },
  ],
  reporter: [['line'], ['./tests/helpers/session-guard-reporter.ts']],
});
