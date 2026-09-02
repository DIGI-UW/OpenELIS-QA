import { defineConfig, devices } from '@playwright/test';

// Standalone probe config for probe-typepicker.spec.ts. The analyzer suite runs under
// analyzer-m3.config.ts, whose project testMatch is scoped to analyzer-guided-setup.spec.ts, so a
// probe file needs its own entry point. Reuses the storage state analyzer-auth.setup.ts writes.
//
//   npx playwright test -c probe-typepicker.config.ts
//
// PF-1 fix (2026-09-01): this config previously set storageState at the top level with no setup
// project, so a stale .auth/analyzers.json produced the harness's signature failure mode — the
// server answers a lapsed session with HTTP 200 and the login PAGE, the status assertion passes,
// and the NEXT line fails on parsing. Declaring the setup dependency makes the run refresh the
// state instead of trusting whatever is on disk.
export default defineConfig({
  testDir: '.',
  timeout: 120_000,
  workers: 1,
  retries: 0,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env.BASE || 'https://analyzers.openelis-global.org',
    headless: true,
    ignoreHTTPSErrors: true,
  },
  projects: [
    { name: 'setup', testMatch: /analyzer-auth[.]setup[.]ts/ },
    {
      name: 'probe-typepicker',
      testMatch: /probe-typepicker[.]spec[.]ts/,
      dependencies: ['setup'],
      use: { storageState: '.auth/analyzers.json' },
    },
  ],
});
