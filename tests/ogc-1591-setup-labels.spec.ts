import { test, expect } from '@playwright/test';

/**
 * OGC-1591 (OpenELIS-Global-2 #4905): the analyser setup actions that were reordered by #4874 got
 * new translation keys, so English (US), (GB) and (PG) no longer show the old step names from
 * their overlays ("Continue to Assays" on the button that opens Connect).
 *
 * Read-only: opens Add Analyzer at the Instrument step, and an analyser still in setup at its
 * Verify step, and reads the buttons; nothing is saved.
 */

for (const locale of ['en', 'en-US', 'en-GB', 'en-PG']) {
  test(`TC-1591-01 ${locale}: the Instrument step's action reads "Continue to Connect"`, async ({ page }) => {
    await page.addInitScript((l) => {
      try { localStorage.setItem('locale', l); } catch { /* storage blocked */ }
    }, locale);
    await page.goto('/analyzers');
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.getByRole('button', { name: /Add Analy[sz]er/i }).first().click();
    await expect(page).toHaveURL(/[?&]setup=instrument/, { timeout: 60_000 });
    const main = page.getByRole('main');
    await expect(main.getByRole('button', { name: 'Continue to Connect' }), 'the action names the step it opens').toBeVisible({ timeout: 60_000 });
    await expect(main.getByRole('button', { name: /Continue to Assays/i }), 'the stale English overlay text is gone').toHaveCount(0);
  });
}

for (const locale of ['en', 'en-US', 'en-GB', 'en-PG']) {
  test(`TC-1591-02 ${locale}: the Verify step's action reads "Finish and activate"`, async ({ page }) => {
    // Needs an analyser still in setup; opened at its Verify step, nothing is clicked.
    const list = await (await page.request.get('/api/OpenELIS-Global/rest/analyzer/analyzers')).json();
    const a = (list?.analyzers ?? []).find((x: { status?: string; profileId?: string }) => x.status === 'SETUP' && x.profileId);
    test.skip(!a, 'no analyser in setup on this instance');
    await page.addInitScript((l) => {
      try { localStorage.setItem('locale', l); } catch { /* storage blocked */ }
    }, locale);
    await page.goto(`/analyzers?setup=verify&analyzerId=${a.id}&profile=${encodeURIComponent(a.profileId)}&revision=${a.profileRevision ?? 1}`);
    await page.waitForLoadState('networkidle').catch(() => {});
    const main = page.getByRole('main');
    await expect(main.getByRole('button', { name: 'Finish and activate' }), 'the last step names what it does').toBeVisible({ timeout: 60_000 });
    await expect(main.getByRole('button', { name: /Continue to (Connect|Assays)/i }), 'no stale step name on the Verify action').toHaveCount(0);
  });
}
