import { defineConfig, devices } from '@playwright/test';

// Role-scoped (non-admin) permission runs. See rbac-README.md.
//
//   npx playwright test -c rbac.config.ts                       # full: admin setup → role setup → matrix
//   npx playwright test -c rbac.config.ts --project=setup-roles # (re)provision + re-auth role users only
//   npx playwright test -c rbac.config.ts --project=rbac-matrix # matrix only (role states already fresh)
//   npx playwright test -c rbac.config.ts --project=unit-scope  # role × lab-unit axis only
//   npx playwright test -c rbac.config.ts --project=catalogue-scope # Reception × section catalogue
//
// BASE / BASE_URL both honored (playwright.config.ts uses BASE, tests/chains/_common.ts uses BASE_URL).
const BASE = process.env.BASE ?? process.env.BASE_URL ?? 'https://testing.openelis-global.org';

export default defineConfig({
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,                    // §10.9 — keep the 6-connection-per-origin pool calm
  retries: 2,                    // absorb load-flake; genuine gating drift fails every attempt
  reporter: [['list'], ['json', { outputFile: 'rbac-results/last-run.json' }], ['./tests/helpers/session-guard-reporter.ts']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: BASE,
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
  },
  projects: [
    // 1) admin storage state — required by the role-provisioning fallback
    { name: 'setup', testDir: '.', testMatch: /auth\.setup\.ts/ },

    // 2) static role users: verify/provision, handle forced password change,
    //    identity-guard, save .auth/role-*.json
    { name: 'setup-roles', testDir: '.', testMatch: /roles\.setup\.ts/, dependencies: ['setup'] },

    // 3) the role × probe matrix (contexts are opened per-role inside the spec)
    // 3b) the role × lab-unit axis (section scoping). Separate project so it can
    //     run alone; shares setup-roles, which also seeds the unit-scoped users.
    {
      name: 'unit-scope',
      testDir: './tests/rbac',
      testMatch: /unit-scope\.spec\.ts/,
      dependencies: ['setup-roles'],
    },

    // 3c) Reception × section: the ORDER-ENTRY catalogue (tests + panels) must
    //     show only the user's own test section.
    {
      name: 'catalogue-scope',
      testDir: './tests/rbac',
      testMatch: /order-catalogue-scope\.spec\.ts/,
      dependencies: ['setup-roles'],
    },

    {
      name: 'rbac-matrix',
      testDir: './tests/rbac',
      testMatch: /rbac-matrix\.spec\.ts/,
      dependencies: ['setup-roles'],
    },
  ],
});
