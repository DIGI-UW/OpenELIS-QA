import { defineConfig, devices } from '@playwright/test';
const BASE = process.env.BASE || process.env.BASE_URL || 'https://testing.openelis-global.org';
export default defineConfig({
  timeout: 1_800_000,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: { ...devices['Desktop Chrome'], baseURL: BASE, headless: true, ignoreHTTPSErrors: true },
  projects: [
    { name: 'setup', testDir: '.', testMatch: /auth\.setup\.ts/ },
    { name: 'seed-data', testDir: '.', testMatch: /seed-data\.setup\.ts/, dependencies: ['setup'], use: { storageState: '.auth/user.json' } },
    // Fixtures an empty stack lacks (EQA schemes, a room, a notebook project, a ward, a sampling
    // site, an inactive lab unit with a test, dictionary and multi-component tests, a two-sample-type
    // panel). Find-or-create; run by the develop-stack "Seed the stack" step. See helpers/ci-fixtures.ts.
    { name: 'ci-fixtures', testDir: '.', testMatch: /ci-fixtures\.setup\.ts/, dependencies: ['setup'], use: { storageState: '.auth/user.json' }, timeout: 300_000 },
  ],
});
