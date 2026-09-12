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

import { BASE } from './helpers/base-url';

setup('create baseline test data', async ({ page }) => {
  // THIS SETUP MUST NOT FAIL THE RUN. `modules.config.ts` declares it as a
  // dependency of the 866-test module sweep, and Playwright SKIPS a project
  // whose dependency failed — so a broken fixture here would silently take the
  // entire sweep with it, which is a far worse failure than missing baseline
  // data. Specs already degrade gracefully through getTestData().
  //
  // So: catch everything, and make the state LOUD in the log instead. This is
  // the one place in the repo where swallowing an error is correct, and it is
  // only correct because the alternative is skipping every test.
  // THE CATCH BELOW IS NOT ENOUGH ON ITS OWN, and that is how this bit us.
  //
  // A Playwright TEST TIMEOUT is not a thrown exception: it aborts the test from the
  // outside, so try/catch never runs and the project is marked failed anyway. The
  // "must not fail the run" guarantee was therefore false in exactly the case it was
  // written for -- a target that is slow or unreachable -- and Playwright then skipped
  // the whole module sweep that depends on this project.
  //
  // Observed 2026-09-12: "page.fill: Test timeout of 120000ms exceeded", project failed,
  // 43 spec files skipped.
  //
  // So the work gets its OWN deadline, comfortably inside the project timeout. Losing the
  // race throws a normal error, the catch runs, and the fixture degrades loudly instead of
  // taking the sweep with it.
  const DEADLINE_MS = Number(process.env.DATA_SETUP_DEADLINE_MS ?? 90_000);
  setup.setTimeout(DEADLINE_MS + 60_000);

  try {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        createBaselineData(page),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`baseline data setup exceeded its ${DEADLINE_MS}ms deadline against ${BASE}`)),
            DEADLINE_MS);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  } catch (e) {
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║  BASELINE DATA SETUP FAILED — specs will degrade, not fail   ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log(String(e).split('\n').slice(0, 4).join('\n'));
    console.log(`Target was ${BASE}.`);
    console.log('Fix this before trusting any patient- or accession-dependent result.\n');
  }
});

async function createBaselineData(page: import('@playwright/test').Page) {
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
}
