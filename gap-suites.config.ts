import { defineConfig, devices } from '@playwright/test';

/**
 * gap-suites.config.ts — the four root `gap-suites-*` files, on their own.
 *
 * WHY SEPARATE (2026-09-05)
 * Playwright shards by FILE. These four files hold 131 tests between them, so
 * they always landed in a single shard and made it the long pole: in the third
 * module sweep that shard took **91 minutes** while the other five finished in
 * 14-49. No shard count fixes that — four files cannot spread across more than
 * four shards — so they get their own job instead.
 *
 * STATE OF THESE SUITES — read before triaging their failures.
 * Until #101 all four hardcoded `BASE = 'https://www.jdhealthsolutions-openelis.com'`,
 * a different instance entirely, and until #96 no config could run them at all.
 * Being orphaned hid the wrong-instance bug underneath it. Repointed at the
 * real target they went from ~all failing to **70 of 131 passing**, and the 61
 * that still fail are dominated by click timeouts — selector drift against a
 * deployment they were never written for, not product defects. Treat that as a
 * cleanup backlog, not a bug list.
 */

const BASE = process.env.BASE ?? process.env.BASE_URL ?? 'https://testing.openelis-global.org';

export default defineConfig({
  testDir: '.',
  // Same 30s policy as modules.config.ts — longer than that is a defect, and
  // these suites are exactly where the 90s default was being burned.
  timeout: Number(process.env.PW_TIMEOUT ?? 30_000),
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: Number(process.env.PW_WORKERS ?? 1),
  retries: Number(process.env.PW_RETRIES ?? 1),
  reporter: [['line'], ['json', { outputFile: 'regression-results/gap-suites.json' }]],
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
      name: 'gap-suites',
      testMatch: /(^|\/)gap-suites-[A-Z]+-[A-Z]+\.spec\.ts$/,
      dependencies: ['setup'],
      use: { storageState: '.auth/user.json' },
    },
  ],
});
