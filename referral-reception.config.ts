import { defineConfig, devices } from '@playwright/test';
import { BASE } from './helpers/base-url';

/**
 * referral-reception.config.ts — the OGC-803 / OGC-804 reception tier.
 *
 * ONE SPEC, AND IT IS SEPARATE FOR A REASON THAT IS NOT STYLE.
 * `tests/ogc803-804-referral-accept-reject.spec.ts` exercises Accept and Reject, which
 * are RETURNED-only actions. A referral is in Returned when its status is COMPLETED, and
 * COMPLETED is written from exactly one place: the @Scheduled import poll in
 * `FhirApiWorkFlowServiceImpl`, which reads the peer laboratory's resources out of
 * `org.openelisglobal.remote.source.uri`. Nothing inside an instance can put a referral
 * there, so the fixture has to be minted from outside:
 *
 *     ./scripts/mint-returned-referral.sh <referralId>
 *
 * That script needs the webapp container's client certificate to write to the FHIR store,
 * which means a local stack. On the shared CI target the whole suite would fail nightly
 * for want of a fixture and say nothing about the product — so `modules.config.ts` hands
 * the file here and `ci-suites.json` records it as deliberately out of CI.
 *
 * RUN IT
 *     ./scripts/mint-returned-referral.sh <id>     # twice: a full pass spends two
 *     BASE=https://localhost:10443 npx playwright test -c referral-reception.config.ts
 *
 * The suite is serial by declaration in the spec: AR-803-02 and AR-804-05 both act on the
 * referral AR-803-01 reconciled.
 */
export default defineConfig({
  testDir: '.',
  testMatch: /(^|\/)tests\/ogc803-804-referral-accept-reject\.spec\.ts$/,
  timeout: Number(process.env.PW_TIMEOUT ?? 30_000),
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  // Zero, not one. Every case here either consumes a referral or depends on one an
  // earlier case consumed; a retry re-runs against a bucket the first attempt emptied
  // and fails for a reason that has nothing to do with the first failure.
  retries: 0,
  reporter: [['line'], ['json', { outputFile: 'regression-results/referral-reception.json' }]],
  use: {
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
      name: 'data',
      testMatch: /(^|\/)data\.setup\.ts$/,
      dependencies: ['setup'],
      use: { storageState: '.auth/user.json' },
      timeout: Number(process.env.PW_SETUP_TIMEOUT ?? 120_000),
      retries: 0,
    },
    {
      name: 'referral-data',
      testMatch: /(^|\/)referral-seed\.setup\.ts$/,
      dependencies: ['setup', 'data'],
      use: { storageState: '.auth/user.json' },
      timeout: Number(process.env.PW_SETUP_TIMEOUT ?? 150_000),
      retries: 0,
    },
    {
      name: 'reception',
      testMatch: /(^|\/)tests\/ogc803-804-referral-accept-reject\.spec\.ts$/,
      dependencies: ['setup', 'data', 'referral-data'],
      use: { storageState: '.auth/user.json' },
    },
  ],
});
