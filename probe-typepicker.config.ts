import { defineConfig, devices } from '@playwright/test';

// Standalone probe config for probe-typepicker.spec.ts. The analyzer suite runs under
// analyzer-m3.config.ts, whose project testMatch is scoped to analyzer-guided-setup.spec.ts, so a
// probe file needs its own entry point. Reuses the storage state analyzer-auth.setup.ts writes.
//
//   npx playwright test -c probe-typepicker.config.ts
export default defineConfig({
  testDir: '.',
  testMatch: /probe-typepicker[.]spec[.]ts/,
  timeout: 120_000,
  workers: 1,
  retries: 0,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env.BASE || 'https://analyzers.openelis-global.org',
    headless: true,
    ignoreHTTPSErrors: true,
    storageState: '.auth/analyzers.json',
  },
});
