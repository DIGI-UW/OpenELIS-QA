/**
 * tests/volume-usage.spec.ts
 *
 * Results Entry row panel, "Storage & sample disposal" > Record amount used.
 * Written 2026-09-28 against testing 3.2.3.0 (release-qa-3.2.3 R78;
 * uncovered-workflows-catalogue TC-VOL-01/02). Seeds orders with 2 mL Serum.
 */
import { test, expect, Page } from '@playwright/test';
import { seedOrder } from '../helpers/data-factory';

const BASE = process.env.BASE_URL || process.env.BASE || 'https://testing.openelis-global.org';
const UOM_ML = process.env.QA_UOM_ML_ID || '47';

async function openUsage(page: Page, accession: string) {
  await page.goto(`${BASE}/Results?accessionNumber=${accession}`, { waitUntil: 'domcontentloaded' });
  const expand = page.locator('main button', { hasText: '▶' }).first();
  await expect(expand).toBeVisible({ timeout: 20_000 });
  await expand.click();
  const section = page.locator('main').getByRole('button', { name: /^▸ Storage & sample disposal/ }).first();
  if (await section.count()) await section.click(); // collapsed by default in a fresh browser
  await page.locator('main').getByRole('button', { name: 'Record amount used', exact: true }).first().click();
  const amount = page.locator('main input[id^="usage-amount-"]').first();
  await expect(amount).toBeVisible({ timeout: 10_000 });
  return amount;
}

async function record(page: Page, amount: ReturnType<Page['locator']>, value: string) {
  await amount.fill(value);
  const res = page.waitForResponse(r => r.url().includes('/storage/sample-items/record-usage'), { timeout: 8_000 }).catch(() => null);
  await page.locator('main').getByRole('button', { name: 'Record', exact: true }).first().click();
  const r = await res;
  return r ? { status: r.status(), body: await r.json().catch(() => ({})) } : null;
}

test.describe('Record amount used', () => {
  test('TC-VOL-02: recording part of the volume leaves the rest', async ({ page }) => {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    const { accession } = await seedOrder(page, 'VOL', { quantity: '2', uomId: UOM_ML });
    const amount = await openUsage(page, accession);
    const r = await record(page, amount, '0.5');
    expect(r?.status, 'record-usage answered').toBe(200);
    expect(Number(r?.body.remainingQuantity), 'remaining after 0.5 of 2').toBeCloseTo(1.5, 5);
    expect(r?.body.exhausted, 'not exhausted').toBe(false);
  });

  test('TC-VOL-01: recording more than what is left is refused [FIXED R78]', async ({ page }) => {
    // FIXED R78, flipped 2026-10-08 (local develop 2026-10-06 and 2026-10-08): the Record button
    // is now disabled while the amount is more than what is left, so the over-draw cannot be sent.
    // Was FLIP-WHEN-FIXED. Observed 2026-09-28: 5 mL against 1 mL left -> 200, exhausted:true.
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    const { accession } = await seedOrder(page, 'VOLX', { quantity: '2', uomId: UOM_ML });
    const amount = await openUsage(page, accession);
    await amount.fill('5');
    const recordBtn = page.locator('main').getByRole('button', { name: 'Record', exact: true }).first();
    await expect(recordBtn, 'Record stays disabled while the amount is more than what is left').toBeDisabled();
    await amount.fill('0.5');
    await expect(recordBtn, 'and comes back for an amount that fits (the canary half of this case)').toBeEnabled();
  });
});
