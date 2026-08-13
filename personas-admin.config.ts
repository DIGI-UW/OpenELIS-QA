import { defineConfig, devices } from '@playwright/test';
/**
 * personas-admin.config.ts — PD / PE / PF.
 *
 * PD (Lab Manager), PE (QA Officer) and PF (Lab Administrator) have no seeded
 * role users yet (see the note in personas-roles.config.ts), so they run as
 * admin. That means they exercise the WORKFLOW but not role scoping — any
 * PASS here is "the surface works", not "this role can reach it".
 */
const BASE = process.env.BASE ?? process.env.BASE_URL ?? 'https://testing.openelis-global.org';
const PERSONAS = ['pd', 'pe', 'pf'];
export default defineConfig({
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: [['list'], ['json', { outputFile: 'rbac-results/personas-admin-last-run.json' }]],
  use: { ...devices['Desktop Chrome'], baseURL: BASE, ignoreHTTPSErrors: true, trace: 'retain-on-failure' },
  projects: [
    { name: 'setup', testDir: '.', testMatch: /auth\.setup\.ts/ },
    ...PERSONAS.map(p => ({
      name: `persona-${p}`,
      testDir: './tests/personas',
      testMatch: new RegExp(`persona-${p}-.*\\.spec\\.ts`),
      dependencies: ['setup'],
      use: { storageState: '.auth/user.json' },
    })),
  ],
});
