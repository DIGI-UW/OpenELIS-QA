/**
 * tests/home-dashboard-counts.spec.ts
 *
 * Home dashboard tiles: does "Partially Completed Today / Awaiting Remaining Tests" hold
 * only orders with some tests finished? Written 2026-09-27 against testing 3.2.3.0
 * (release-qa-3.2.3 R71; uncovered-workflows-catalogue TC-HDB-00/01). Seeds one order.
 */
import { test, expect } from '@playwright/test';
import { seedOrder } from '../helpers/data-factory';

const BASE = process.env.BASE_URL || process.env.BASE || 'https://testing.openelis-global.org';
const TILE = 'ORDERS_PARTIALLY_COMPLETED_TODAY';


test.describe('Home dashboard counts', () => {
  test('TC-HDB-00: the Partially Completed Today tile shows a count and opens its list', async ({ page }) => {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    const label = page.locator('main').getByText('Partially Completed Today', { exact: true });
    await expect(label).toBeVisible({ timeout: 20_000 });
    const list = page.waitForResponse(r => r.url().includes(`/home-dashboard/${TILE}`));
    await label.click();
    expect((await list).status()).toBe(200);
  });

  test('TC-HDB-01: seeding an order with no tests finished does not raise the Partially Completed count', async ({ page }) => {
    // FLIP-WHEN-FIXED (R71). Observed 2026-09-27: the count rises by one for every new
    // one-test order (167 -> 182 over 15 seeded orders), i.e. it counts unfinished orders.
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    const metric = () => page.evaluate(async () => Number((await (await fetch('/api/OpenELIS-Global/rest/home-dashboard/metrics')).json()).patiallyCompletedToday));
    const before = await metric();
    expect(Number.isFinite(before), 'metrics readable').toBe(true);
    await seedOrder(page, 'HDB');
    const after = await metric();
    test.fail();
    expect(after, `count before ${before}, after seeding ${after}`).toBe(before);
  });
});
