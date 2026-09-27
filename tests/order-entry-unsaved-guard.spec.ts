/**
 * tests/order-entry-unsaved-guard.spec.ts
 *
 * A freshly opened Enter Order page (Clinical, Environmental, Vector) should not claim
 * "Unsaved changes" or ask "Leave site?" when the user leaves without typing anything.
 * Written 2026-09-28 against testing 3.2.3.0 (release-qa-3.2.3 R75;
 * uncovered-workflows-catalogue TC-OEG-00/01). Read-only.
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || process.env.BASE || 'https://testing.openelis-global.org';
const PAGES = ['/order/clinical/enter', '/order/environmental/enter', '/order/vector/enter'];

test.describe('Enter Order unsaved-changes guard', () => {
  test('TC-OEG-00: the three Enter Order pages load', async ({ page }) => {
    for (const p of PAGES) {
      await page.goto(`${BASE}${p}`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('main'), p).toContainText(/Order|Sample/i, { timeout: 20_000 });
    }
  });

  for (const p of PAGES) {
    test(`TC-OEG-01 ${p}: an untouched page shows no "Unsaved changes" and does not block leaving`, async ({ page }) => {
      // FLIP-WHEN-FIXED (R75). Observed 2026-09-28 on all three: banner on load, "Leave site?" on exit.
      await page.goto(`${BASE}${p}`, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(2_000);
      let asked = false;
      page.on('dialog', async (d) => { if (d.type() === 'beforeunload') asked = true; await d.accept(); });
      const banner = await page.locator('main').getByText(/Unsaved changes/i).count();
      await page.close({ runBeforeUnload: true });
      await new Promise((r) => setTimeout(r, 1_000));
      test.fail();
      expect({ banner, asked }, `${p}: banner count ${banner}, Leave-site prompt ${asked}`).toEqual({ banner: 0, asked: false });
    });
  }
});
