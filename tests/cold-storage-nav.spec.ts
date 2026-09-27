/**
 * tests/cold-storage-nav.spec.ts
 *
 * The sidebar's Cold Storage entries deep-link to /FreezerMonitoring?tab=N. Does each open
 * its own tab? Written 2026-09-27 against testing 3.2.3.0 (release-qa-3.2.3 R67;
 * uncovered-workflows-catalogue TC-CSN-00/01).
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || process.env.BASE || 'https://testing.openelis-global.org';
const TABS = ['Dashboard', 'Corrective Actions', 'Historical Trends', 'Reports', 'Settings'];

test.describe('Cold Storage sidebar deep links', () => {
  test('TC-CSN-00: /FreezerMonitoring opens with its five tabs, Dashboard selected', async ({ page }) => {
    await page.goto(`${BASE}/FreezerMonitoring`, { waitUntil: 'domcontentloaded' });
    for (const t of TABS) await expect(page.getByRole('tab', { name: t, exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('tab', { name: 'Dashboard', exact: true })).toHaveAttribute('aria-selected', 'true');
  });

  test('TC-CSN-01: ?tab=1..4 opens the matching tab', async ({ page }) => {
    // FLIP-WHEN-FIXED (R67). Observed 2026-09-27: every ?tab= value shows the Dashboard.
    test.fail();
    for (let i = 1; i < TABS.length; i++) {
      await page.goto(`${BASE}/FreezerMonitoring?tab=${i}`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('tab', { name: TABS[i], exact: true }), `?tab=${i}`).toHaveAttribute('aria-selected', 'true', { timeout: 10_000 });
    }
  });
});
