/**
 * OpenELIS Global QA: testing catalog seed (added 2026-11-02)
 *
 * testing.openelis-global.org restores its baseline every night at 6 p.m. Pacific
 * (openelis-testing-reset.timer). The reset drops the QA catalog additions of
 * 28 Oct 2026 that analyzer QA relies on: LOINC codes on the baseline tests and
 * 22 chemistry tests for the Sysmex BX-3010 menu. This setup puts them back before
 * any spec runs, so the reset and the suites can coexist.
 *
 * Testing only: the LOINC map is keyed by testing's baseline test ids (see
 * helpers/testing-catalog-seed.ts). On any other instance the setup skips.
 *
 * Non-fatal, same contract as data.setup.ts: a failure here is logged loudly but
 * does not skip the suite that depends on it.
 */
import { test as setup } from '@playwright/test';
import { BASE } from './helpers/base-url';
import { seedTestingCatalog, TESTING_HOST } from './helpers/testing-catalog-seed';

setup('re-apply the QA catalog additions on testing', async ({ page }) => {
  setup.skip(new URL(BASE).hostname !== TESTING_HOST, `catalog seed is keyed to ${TESTING_HOST}'s baseline test ids`);
  try {
    await page.goto('/');
    await page.waitForFunction(() => !!localStorage.getItem('CSRF'), null, { timeout: 60_000 });
    const { log, errors } = await seedTestingCatalog(page);
    for (const line of log) console.log(`[testing-catalog] ${line}`);
    for (const line of errors) console.warn(`[testing-catalog] FAILED ${line}`);
  } catch (e) {
    console.warn(`[testing-catalog] SEED DID NOT COMPLETE: ${String(e).slice(0, 300)}`);
  }
});
