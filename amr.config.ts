import { defineConfig, devices } from '@playwright/test';
import { BASE } from './helpers/base-url';

/**
 * amr.config.ts: the Microbiology / AMR tier (OGC-1383 V2; tripwires carried into v3, OGC-1528).
 *
 * ONE SPEC, SEPARATE BECAUSE OF ITS FIXTURE. `tests/amr-v2.spec.ts` reads the QA_AMR fixture that
 * was built by hand on pngtest.openelis-global.org on 19 Oct 2026: microbiology tests 380 to 384,
 * organisms, antibiotics, AST panels, a synthetic breakpoint standard, a medium lot and three
 * orders with cases (see the catalogue `amr-v2-test-cases.md`). No other instance has it, and the
 * shared CI target (testing) has no microbiology reference data at all, so `modules.config.ts`
 * hands the file here and `ci-suites.json` records it as deliberately out of CI.
 *
 * RUN IT (from a shell that reaches pngtest; it serves a self-signed certificate)
 *     BASE=https://pngtest.openelis-global.org npx playwright test -c amr.config.ts
 *
 * Serial and light: pngtest answers transient 503s under load, and the spec retries those itself.
 */
export default defineConfig({
  testDir: '.',
  testMatch: /(^|\/)tests\/amr-v2\.spec\.ts$/,
  timeout: Number(process.env.PW_TIMEOUT ?? 120_000),
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['line'], ['json', { outputFile: 'regression-results/amr.json' }]],
  use: {
    actionTimeout: 30_000,
    navigationTimeout: 90_000,
    ...devices['Desktop Chrome'],
    baseURL: BASE,
    headless: true,
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {},
  },
  projects: [
    { name: 'setup', testMatch: /(^|\/)auth\.setup\.ts$/ },
    {
      name: 'amr',
      testMatch: /(^|\/)tests\/amr-v2\.spec\.ts$/,
      dependencies: ['setup'],
      use: { storageState: '.auth/user.json' },
    },
  ],
});
