/**
 * tests/reagent-consumption.spec.ts
 *
 * Results row panel > Reagents, QC & Controls: the linked reagent's lot is offered, over-use
 * is refused, and a recorded use decrements the lot. Written 2026-09-28 against testing
 * 3.2.3.0 (observed working; uncovered-workflows-catalogue TC-RPH-02).
 *
 * Needs a reagent linked to Amylase (test 5) in Test Catalog > Reagents with a QC-Passed lot
 * in Inventory; skips otherwise. The consumption case uses one unit per run and skips when
 * the lot is nearly empty, so it does not drain the seeded lot to zero.
 */
import { test, expect, Page } from '@playwright/test';
import { seedOrder } from '../helpers/data-factory';

const BASE = process.env.BASE_URL || process.env.BASE || 'https://testing.openelis-global.org';
const AMYLASE = process.env.QA_REAGENT_TEST_ID || '5';

async function lotRemaining(page: Page): Promise<number | null> {
  return page.evaluate(async (testId) => {
    const links = await (await fetch(`/api/OpenELIS-Global/rest/results-entry/test/${testId}/reagents`)).json().catch(() => []);
    const item = (Array.isArray(links) ? links : [])[0];
    if (!item) return null;
    const itemId = item.reagentId ?? item.inventoryItemId ?? item.itemId;
    const lots = await (await fetch(`/api/OpenELIS-Global/rest/inventory/lots/item/${itemId}/available`)).json().catch(() => []);
    return (Array.isArray(lots) ? lots : []).reduce((n: number, l: any) => n + Number(l.currentQuantity || 0), 0);
  }, AMYLASE);
}

async function openReagents(page: Page, accession: string) {
  await page.goto(`${BASE}/Results?accessionNumber=${accession}`, { waitUntil: 'domcontentloaded' });
  const expand = page.locator('main button', { hasText: '▶' }).first();
  await expect(expand).toBeVisible({ timeout: 20_000 });
  await expand.click();
  const section = page.locator('main').getByRole('button', { name: /^▸ Reagents, QC/ }).first();
  if (await section.count()) await section.click();
  const qty = page.locator('main input[id^="reagent-qty-"]').first();
  await expect(qty, 'a lot is offered for the linked reagent').toBeVisible({ timeout: 10_000 });
  return qty;
}

async function recordUse(page: Page, qty: ReturnType<Page['locator']>, n: number) {
  await qty.fill(String(n));
  const res = page.waitForResponse(r => r.url().includes('/inventory/management/consume'));
  await page.locator('main').getByRole('button', { name: 'Record use', exact: true }).first().click();
  return res;
}

test.describe('Reagent consumption', () => {
  let accession = '';
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    const remaining = await lotRemaining(page);
    test.skip(remaining === null || remaining < 1, 'no reagent linked to the test, or no QC-passed lot');
    accession = (await seedOrder(page, 'RGT', { testIds: [AMYLASE] })).accession;
  });

  test('TC-RPH-02a: recording more than the lots hold is refused with the amounts', async ({ page }) => {
    const before = (await lotRemaining(page))!;
    const qty = await openReagents(page, accession);
    const r = await recordUse(page, qty, before + 100);
    expect(r.status(), 'over-use refused').toBe(409);
    await expect(page.getByText(/Insufficient inventory/i).first()).toBeVisible();
    expect(await lotRemaining(page), 'nothing consumed').toBe(before);
  });

  test('TC-RPH-02b: recording one unit decrements the lot by one', async ({ page }) => {
    const before = (await lotRemaining(page))!;
    test.skip(before < 2, 'seeded lot nearly empty; top it up in Inventory');
    const qty = await openReagents(page, accession);
    const r = await recordUse(page, qty, 1);
    expect(r.status(), 'consume').toBe(200);
    expect(await lotRemaining(page)).toBe(before - 1);
  });
});
