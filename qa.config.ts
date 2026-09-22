import { defineConfig, devices } from '@playwright/test';

// QA MODULE TIER — targets pngdemo, which runs the `demo-png` branch.
//
// Read this before changing the target. The QA/EQA module that ships is NOT the one on
// `develop`. `develop` has an older EQA under /EQAOrders, /EQADistribution and friends;
// demo-png replaces it with a whole /qa/* module — QC, EQA (schemes and CYCLES, not
// distributions), QI and QMS. Pointing this config at testing.openelis-global.org does not
// fail loudly, it just loads a different application. Every project here therefore opens
// with a canary that fails if the target is not serving /qa/*.
//
//   demo-png HEAD: 2d2f1ef feat(eqa): EQA V2 module on demo-png (OGC-608 epic family) (#4283)
//                  5df2ef1 feat(qa): Quality Assurance module (OGC-688 epic family) (#4277)
//
// AUTH_STATE_FILE keeps this instance's session in its own file. Reusing a storageState
// captured against another host does not error — it silently measures a logged-OUT app,
// where every route answers 200 and issues no data calls.
// TARGET WILL MOVE. This module is heading for `develop` once it passes QC, and when it lands
// the right target is whatever the rest of the suite already points at — testing, or the
// ephemeral develop stack. At that point this default and the `env` block in ci-suites.json
// are the only two edits needed; nothing in the specs is pngdemo-specific. Until then, the
// canaries below are what stop a premature switch from reading as a product failure.
const BASE = process.env.BASE ?? 'https://pngdemo.openelis-global.org';
const ADMIN_STATE = process.env.AUTH_STATE_FILE ?? '.auth/png.json';

export default defineConfig({
  testDir: '.',
  // pngdemo serves an unbundled Vite DEV build: ~450 module requests land before React
  // mounts. Every timeout here is sized for that, not for a production bundle.
  timeout: 420_000,
  expect: { timeout: 25_000 },
  retries: 0,
  workers: 1,
  fullyParallel: false,
  reporter: [['line'], ['html', { open: 'never' }]],
  use: { ...devices['Desktop Chrome'], baseURL: BASE, headless: true, ignoreHTTPSErrors: true },
  projects: [
    // ANCHORED. `/auth\.setup\.ts/` is unanchored and therefore also matches
    // `analyzer-auth.setup.ts`, which authenticates against a DIFFERENT instance
    // (analyzers.openelis-global.org) with its own credentials. Every run of this
    // config then waited on that instance before touching its own target, and
    // when the analyzers box is unreachable the whole suite stalls in setup with
    // nothing to show for it — observed 2026-09-22, twice, at 180s.
    {
      name: 'setup',
      testMatch: /(^|\/)auth\.setup\.ts$/,
      timeout: Number(process.env.PW_SETUP_TIMEOUT ?? 120_000),
    },
    {
      name: 'qa-surfaces',
      testMatch: /tests\/qa\/qa-surfaces\.spec\.ts/,
      dependencies: ['setup'],
      use: { storageState: ADMIN_STATE },
    },
    {
      name: 'qa-contracts',
      testMatch: /tests\/qa\/qa-contracts\.spec\.ts/,
      dependencies: ['setup'],
      use: { storageState: ADMIN_STATE },
    },
    {
      name: 'eqa-cycle-lifecycle',
      testMatch: /tests\/qa\/eqa-cycle-lifecycle\.spec\.ts/,
      dependencies: ['setup'],
      use: { storageState: ADMIN_STATE },
    },
  ],
});
