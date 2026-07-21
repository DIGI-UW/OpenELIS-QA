import { defineConfig, devices } from '@playwright/test';

// Runs the ENTIRE Test Catalog spec suite with an authenticated context (setup + storageState),
// for validating OGC-1142 (Test Catalog Completion v2) end-to-end on testing.
// The flip-when-fixed guards (editor-regressions, mgmt, sections-roundtrip) should FAIL where
// OGC-1142 fixed a defect — that's the signal to update the spec to assert the fixed behavior.
const BASE = process.env.BASE ?? 'https://testing.openelis-global.org';
export default defineConfig({
  testDir: '.',
  timeout: 180000,
  expect: { timeout: 15000 },
  reporter: [['line']],
  workers: 1,
  fullyParallel: false,
  use: { ...devices['Desktop Chrome'], baseURL: BASE, headless: true, ignoreHTTPSErrors: true },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'test-catalog',
      testMatch: /test-catalog-.*\.spec\.ts/,
      dependencies: ['setup'],
      use: { storageState: '.auth/user.json' },
    },
  ],
});
