import { defineConfig, devices } from '@playwright/test';
// Report Print Queue (OGC-431 / OGC-1031 V1): the spec and its probes, with an authenticated context.
const BASE = process.env.BASE ?? 'https://testing.openelis-global.org';
export default defineConfig({
  testDir: '.',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  retries: 0,
  workers: 1,
  reporter: [['line'], ['json', { outputFile: process.env.OUT ? `${process.env.OUT}/results.json` : 'test-results/rpq.json' }]],
  use: { ...devices['Desktop Chrome'], baseURL: BASE, headless: true, ignoreHTTPSErrors: true, viewport: { width: 1366, height: 768 } },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    { name: 'rpq', testMatch: /tests\/(report-print-queue|probe-rpq)[\w-]*\.spec\.ts/, dependencies: ['setup'], use: { storageState: '.auth/user.json' } },
  ],
});
