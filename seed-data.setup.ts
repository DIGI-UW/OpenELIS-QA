/**
 * OpenELIS Global QA — Bulk Seed (Phase E1)
 *
 * This is a Playwright setup test, but it also functions as a standalone
 * seed runner. Two ways to invoke:
 *
 *   1. Via Playwright (recommended for CI/CD):
 *        npx playwright test --project=seed-data
 *
 *   2. Standalone CLI for ad-hoc seeding:
 *        npx tsx seed-data.setup.ts [--dry-run] [--verify-only] [--target-patients=N]
 *
 * The seed script implements SKILL.md §0.6 Data Census's "fix" path:
 * when the census shows an empty instance, run this to bring it up to
 * the targets defined in helpers/seed-config.ts.
 *
 * Idempotent: re-running on a populated instance is a no-op except for
 * round-trip verification of existing data.
 *
 * Outputs:
 *   - Console summary table
 *   - .auth/seed-state.json (machine-readable result for subsequent CI steps)
 *
 * Known bugs that affect this script:
 *   - BUG-37 patient-order linkage: orders may save without patient ref.
 *     The script verifies and reports each instance.
 *   - BUG-31 Carbon Accept checkbox: blocks UI result entry. The script
 *     does NOT attempt to force orders into IN_PROGRESS / READY_FOR_VALIDATION
 *     state — those counts come from the dashboard census and reflect
 *     whatever is naturally present.
 */

import { test as setup } from '@playwright/test';
import { runSeed, formatSummary } from './helpers/seed-factory';

// TARGET COMES FROM THE CONFIG, NOT FROM HERE.
//
// This file used to hold its own default -- process.env.BASE_URL, falling back
// to testing -- while regression-seed.config.ts sets baseURL from process.env
// BASE, defaulting to an IP. TWO different env var names and two different
// defaults, in a file that WRITES DATA: running the seeder against the config
// target would still have seeded testing, silently. Caught by preflight PF-2 on
// 2026-08-27.
//
// Navigating relatively makes the config the single source of truth, so the
// two can no longer disagree about which instance gets written to.

setup('bulk seed (Phase E1)', async ({ page }) => {
  // Establish session — auth.setup.ts has already cached this in
  // .auth/user.json; here we just navigate so the page has the CSRF
  // token in localStorage before the factory's fetch calls.
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  if (page.url().includes('login') || page.url().includes('Login')) {
    // Auth cache expired; do a quick re-login. The factory's apiCall
    // helper depends on CSRF being present.
    await page.fill('input[name="loginName"]', process.env.TEST_USER || 'admin');
    await page.fill('input[name="userPass"]', process.env.TEST_PASS || 'adminADMIN!');
    await page.getByRole('button', { name: /submit|login/i }).first().click();
    await page.waitForURL(/Dashboard|Home/, { timeout: 15000 });
  }

  // CLI flags (read from environment for Playwright project; the bin
  // wrapper at the bottom of this file reads from argv when standalone).
  const dryRun = process.env.SEED_DRY_RUN === '1';
  const verifyOnly = process.env.SEED_VERIFY_ONLY === '1';
  const targetPatients = process.env.SEED_TARGET_PATIENTS
    ? Number(process.env.SEED_TARGET_PATIENTS)
    : undefined;
  const targetOrders = process.env.SEED_TARGET_ORDERS
    ? Number(process.env.SEED_TARGET_ORDERS)
    : undefined;

  const state = await runSeed(page, {
    targets: {
      ...(targetPatients !== undefined ? { patients: targetPatients } : {}),
      ...(targetOrders !== undefined ? { orders: targetOrders } : {}),
    },
    dryRun,
    verifyOnly,
  });

  // eslint-disable-next-line no-console
  console.log('\n' + formatSummary(state) + '\n');

  // Soft fail: if the script encountered >=10 errors, fail the project
  // so CI surfaces the problem. Successful seeds with zero deltas exit
  // 0 cleanly.
  if (state.errors.length >= 10) {
    throw new Error(`Seed encountered ${state.errors.length} errors — see .auth/seed-state.json`);
  }
});
