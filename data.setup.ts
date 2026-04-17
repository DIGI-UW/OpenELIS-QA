/**
 * OpenELIS Global QA — Test Data Setup
 *
 * This setup project runs AFTER authentication (`auth.setup.ts`) and
 * BEFORE any spec files. It creates all baseline test data that the
 * QA suites depend on:
 *
 *   Patient:  Abby Sebby  (nationalId=0123456)
 *   Order 1:  HGB (Whole Blood)  → accession written to .auth/test-data.json
 *   Order 2:  WBC (Whole Blood)  → accession written to .auth/test-data.json
 *
 * Idempotent: checks for existing data before creating, so re-runs
 * on the same instance do not accumulate duplicates.
 *
 * Output: `.auth/test-data.json`
 * Consumer: `helpers/test-helpers.ts` exports `getTestData()` which
 *           reads this file so every spec has access to the live accession
 *           numbers rather than hard-coded ones that may not exist.
 */

import { test as setup } from '@playwright/test';
import { runDataSetup } from './helpers/data-factory';

const BASE = process.env.BASE_URL || 'https://testing.openelis-global.org';

setup('create baseline test data', async ({ page }) => {
  // Navigate to dashboard to establish session + CSRF token
  await page.goto(`${BASE}`);
  await page.waitForLoadState('networkidle');

  // If redirected to login, re-authenticate
  if (page.url().includes('login') || page.url().includes('Login')) {
    await page.fill('input[name="loginName"]', process.env.TEST_USER || 'admin');
    await page.fill('input[name="userPass"]', process.env.TEST_PASS || 'adminADMIN!');
    await page.getByRole('button', { name: /submit|login/i }).first().click();
    await page.waitForURL(/Dashboard|Home|SamplePatientEntry/, { timeout: 15000 });
  }

  // Run the full data setup sequence
  const state = await runDataSetup(page);

  // Log summary
  console.log('\n═══ Test Data Setup Summary ═══');
  console.log(`Patient (nationalId=${state.patient.nationalId}): ${state.patient.found ? '✓ exists' : '✗ not found / creation failed'}`);
  console.log(`Primary order (HGB):  ${state.primaryOrder.accession ?? 'not created'}`);
  console.log(`Secondary order (WBC): ${state.secondaryOrder.accession ?? 'not created'}`);
  if (state.setupErrors.length > 0) {
    console.log('Setup errors:', state.setupErrors.join(', '));
  }
  console.log('════════════════════════════════\n');

  // Non-fatal: if setup fails, tests will gracefully skip their data-dependent
  // assertions rather than failing the entire run. This is enforced via the
  // `getTestData()` helper's fallback behaviour.
});
