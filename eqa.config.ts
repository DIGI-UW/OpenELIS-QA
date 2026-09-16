import { defineConfig, devices } from '@playwright/test';

// EQA tier.
//
// Default target is testing.openelis-global.org, not the EQA feature box. Both carry the EQA
// V2 surface, and testing is the one that also carries the pre-seeded role personas the
// authorization project needs -- without them EQA-AZ-00 (the canary) aborts and every
// "the guard is missing" result would be a false negative.
//
// To point the read-only projects at the feature box:
//   BASE=https://52.88.37.243 AUTH_STATE_FILE=.auth/eqa.json \
//     npx playwright test -c eqa.config.ts --project=eqa-surfaces
// AUTH_STATE_FILE matters: reusing a storageState captured against a different host does not
// error, it just measures a logged-out app.
const BASE = process.env.BASE ?? 'https://testing.openelis-global.org';
const ADMIN_STATE = process.env.AUTH_STATE_FILE ?? '.auth/user.json';

export default defineConfig({
  testDir: '.',
  timeout: 300_000,
  expect: { timeout: 20_000 },
  retries: 0,          // the lifecycle project consumes what it seeds; a retry re-seeds
  workers: 1,
  fullyParallel: false,
  reporter: [['line'], ['html', { open: 'never' }]],
  use: { ...devices['Desktop Chrome'], baseURL: BASE, headless: true, ignoreHTTPSErrors: true },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    { name: 'roles', testMatch: /roles\.setup\.ts/, dependencies: ['setup'] },
    {
      name: 'eqa-lifecycle',
      testMatch: /tests\/eqa\/eqa-v2-lifecycle\.spec\.ts/,
      dependencies: ['setup'],
      use: { storageState: ADMIN_STATE },
    },
    {
      name: 'eqa-surfaces',
      testMatch: /tests\/eqa\/eqa-surfaces\.spec\.ts/,
      dependencies: ['setup'],
      use: { storageState: ADMIN_STATE },
    },
    {
      // Runs as the receptionist persona ON PURPOSE: the point is what a bench user can do.
      name: 'eqa-authorization',
      testMatch: /tests\/eqa\/eqa-authorization\.spec\.ts/,
      dependencies: ['setup', 'roles'],
      use: { storageState: '.auth/role-receptionist.json' },
    },
  ],
});
