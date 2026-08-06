import { defineConfig, devices } from '@playwright/test';

/**
 * PR #3987 regression suite — DIGI-UW/OpenELIS-Global-2#3987 (merged 2026-08-05).
 *
 * A fifteen-item defect PR spanning Test Catalog coverage/LOINC, FHIR specimen
 * terminology, Results↔Validation range parity, patient photo handling and the
 * patient report. The three projects below split along fixture cost:
 *
 *   pr3987-catalog  read-mostly; writes are reverted in-test. Safe anywhere.
 *   pr3987-patient  CREATES patients (one deliberately fails and must roll back).
 *   pr3987-fhir     SEEDS a two-specimen order and rewrites terminology, then
 *                   restores it. Heaviest; run it deliberately.
 *
 * All three are sequential with workers:1 — §10.9, Chrome caps 6 connections per
 * origin and these specs fan out API calls inside one page context.
 *
 * Run everything:  npx playwright test --config=pr3987.config.ts
 * One project:     npx playwright test --config=pr3987.config.ts --project=pr3987-catalog
 * Another target:  BASE=https://dev.openelis-global.org npx playwright test --config=pr3987.config.ts
 */
const BASE = process.env.BASE ?? 'https://testing.openelis-global.org';

export default defineConfig({
  testDir: '.',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  workers: 1,
  fullyParallel: false,
  // retries separate LOAD-FLAKE from real drift: the shared instances degrade
  // under load and recover on retry, while a genuinely regressed item fails
  // every attempt. Feeds the flaky-vs-failed split on the freshness board.
  retries: 2,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: BASE,
    headless: true,
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'pr3987-catalog',
      testMatch: /test-catalog-pr3987-regression\.spec\.ts/,
      dependencies: ['setup'],
      use: { storageState: '.auth/user.json' },
    },
    {
      name: 'pr3987-patient',
      testMatch: /patient-photo-pr3987\.spec\.ts/,
      dependencies: ['setup'],
      use: { storageState: '.auth/user.json' },
    },
    {
      name: 'pr3987-fhir',
      testMatch: /fhir-specimen-terminology-pr3987\.spec\.ts/,
      dependencies: ['setup'],
      use: { storageState: '.auth/user.json' },
    },
  ],
});
