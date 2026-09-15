import { defineConfig, devices } from '@playwright/test';

// RED regression: Modify Order (Edit Order) renders a form that misrepresents the order it
// just loaded — required fields blank on screen while populated in state, an unmarked field
// silently gating Submit, and a "Generate" link that reassigns the specimen's accession
// number. FLIP-WHEN-FIXED: a failure here means the defect was fixed; invert the assertion.
//
// See tests/modify-order-field-binding.spec.ts for the measured evidence and the two code
// sites (AddOrder.jsx labNo binding, ModifyOrder.jsx loadOrderValues).
//
//   npx playwright test -c modify-order.config.ts
//
// MO-7-DESTRUCTIVE is skipped by default — it orphans a real accession number. To reproduce
// the specimen-identity reassignment end to end:
//
//   MO_DESTRUCTIVE=1 npx playwright test -c modify-order.config.ts

const BASE = process.env.BASE ?? 'https://testing.openelis-global.org';

export default defineConfig({
  testDir: '.',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 1,
  // These assert deterministic render behaviour; a retry would only mask drift.
  retries: 0,
  reporter: [['line']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: BASE,
    headless: true,
    ignoreHTTPSErrors: true,
  },
  projects: [
    // Anchored: the unanchored /auth\.setup\.ts/ the older configs use ALSO matches
    // analyzer-auth.setup.ts, which logs into the ANALYZERS instance. This suite targets
    // `testing`, and a failure over there must not block it. The lookbehind (rather than a
    // path-separator character class) is deliberate: PF-3's regex extractor stops at the
    // first '/' it sees, so a '[/]' here reads to it as an unterminated literal.
    { name: 'setup', testMatch: /(?<![A-Za-z0-9-])auth[.]setup[.]ts$/ },
    {
      name: 'modify-order',
      testMatch: /modify-order-field-binding\.spec\.ts/,
      dependencies: ['setup'],
      use: { storageState: '.auth/user.json' },
    },
  ],
});
