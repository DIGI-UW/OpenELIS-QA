/**
 * tests/inventory-happy-path.spec.ts
 *
 * Inventory, the happy path a stores clerk and a bench user walk on Inventory Management:
 *
 *   catalog item added (reagent, low-stock threshold 10)
 *   lot received into a storage location (20 tests, expiring in 20 days)  -> tiles move
 *   QC marked Passed  -> usage recorded (15 used, 5 left)                  -> Low Stock counts it
 *   lot details show the storage location and the transactions
 *   lot disposed (0 left)                                    tripwire: Expiring Soon still counts it
 *
 * Written 2026-10-02 against local develop (images 2026-10-01 17:48 UTC) for the "Storage &
 * Inventory: lot receive + tiles" gap in claude/coverage-thin-3.2.3.md. reagent-consumption.spec.ts
 * covers using a kit from Results Entry; this file covers the stock side end to end.
 *
 * Data: one catalog item "QA Inv HP <stamp>" and one lot "QAHP<stamp>". Records are permanent
 * (DELETE answers 405); the lot ends disposed.
 */
import { test, expect, Page, Locator } from '@playwright/test';
import { apiGet } from '../helpers/silentSave';

const BASE = process.env.BASE_URL || process.env.BASE || 'https://testing.openelis-global.org';
const STAMP = `${Date.now()}`.slice(-6);
const ITEM = `QA Inv HP ${STAMP}`;
const LOT = `QAHP${STAMP}`;

test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);

const s: { itemId?: string; lotId?: string; tiles0?: Tiles } = {};
type Tiles = { totalLots: number; lowStock: number; expiringSoon: number; expired: number };

/** en-US date as the Carbon DatePickers on this page take it. */
const usDate = (days: number) => {
  const d = new Date(Date.now() + days * 86_400_000);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
};

async function openInventory(page: Page, tab: 'Dashboard' | 'Catalog' = 'Dashboard') {
  await page.goto(`${BASE}/inventory`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: tab }).click();
  await page.waitForLoadState('networkidle').catch(() => undefined);
}

/** Read the four tiles as the user sees them. */
async function tiles(page: Page): Promise<Tiles> {
  await openInventory(page, 'Dashboard');
  const read = async (label: string) => {
    const tile = page.locator('.inventory-metric-tile').filter({ hasText: label }).first();
    await expect(tile).toBeVisible({ timeout: 30_000 });
    return Number((await tile.locator('.metric-value').innerText()).trim());
  };
  return { totalLots: await read('Total Lots'), lowStock: await read('Low Stock'), expiringSoon: await read('Expiring Soon'), expired: await read('Expired') };
}

async function lotJson(page: Page): Promise<any> {
  const r = await apiGet<any[]>(page, '/rest/inventory/lots');
  return (r.json ?? []).find((l) => l.lotNumber === LOT);
}

/** Open the row's overflow menu and pick an action. */
async function lotAction(page: Page, action: RegExp) {
  await openInventory(page, 'Dashboard');
  await page.getByPlaceholder(/Search by item name, lot number or barcode/).fill(LOT);
  const row = page.locator('tbody tr').filter({ hasText: LOT }).first();
  await expect(row, `lot ${LOT} is listed`).toBeVisible({ timeout: 30_000 });
  await row.getByRole('button').last().click();
  await page.getByRole('menuitem', { name: action }).click();
  return row;
}

async function modal(page: Page): Promise<Locator> {
  // Carbon keeps closed modals mounted (hidden); role queries skip hidden ones.
  const m = page.getByRole('dialog').last();
  await expect(m).toBeVisible({ timeout: 15_000 });
  return m;
}

test.describe('Inventory happy path (TC-INVHP)', () => {
  test('TC-INVHP-01: a reagent added to the catalog is listed and counted as low stock until a lot arrives', async ({ page }) => {
    s.tiles0 = await tiles(page);
    await openInventory(page, 'Catalog');
    await page.getByRole('button', { name: /^Add Catalog Item$/ }).click();
    const m = await modal(page);
    await m.locator('#name').fill(ITEM);
    await m.getByRole('combobox').first().click();
    await page.getByRole('option', { name: /^Reagent$/ }).click();
    await m.locator('#units').fill('tests');
    await m.locator('#lowStockThreshold').fill('10');
    await m.locator('#stabilityAfterOpening').fill('30');
    await m.locator('#storageRequirements').fill('Store at 2-8 C');
    const post = page.waitForResponse((r) => new URL(r.url()).pathname.endsWith('/rest/inventory/items') && r.request().method() === 'POST');
    await m.getByRole('button', { name: /^Save$/ }).click();
    const res = await post;
    expect(res.status(), 'item create').toBe(201);
    s.itemId = String((await res.json()).id);
    await expect(page.locator('tbody tr').filter({ hasText: ITEM }), 'the item is in the catalog').toBeVisible({ timeout: 15_000 });
    const t = await tiles(page);
    expect(t.lowStock, 'an item with no stock is low stock').toBe(s.tiles0.lowStock + 1);
  });

  test('TC-INVHP-02: a lot received into a storage location moves Total Lots and Expiring Soon', async ({ page }) => {
    await openInventory(page, 'Dashboard');
    await page.getByRole('button', { name: /^Add New Lot$/ }).click();
    const m = await modal(page);
    await m.getByRole('combobox').first().click();
    await page.getByRole('option', { name: ITEM }).click();
    await m.locator('#lotNumber').fill(LOT);
    await m.locator('#currentQuantity').fill('20');
    // Carbon's DatePicker (flatpickr) ignores a plain fill: set the date the way a pick does.
    await m.locator('#expirationDate').evaluate((el: any, iso: string) => el._flatpickr?.setDate(new Date(iso), true), new Date(Date.now() + 20 * 86_400_000).toISOString());
    await expect(m.locator('#expirationDate'), 'the expiration date is set').toHaveValue(usDate(20));
    await m.getByRole('button', { name: /Assign storage location/i }).click();
    const picker = page.getByRole('dialog').filter({ hasText: /storage location/i }).last();
    const room = picker.getByRole('combobox', { name: /^Room$/ });
    await room.click();
    // The page header's locale <select> also has role option: scope to the open listbox.
    await picker.getByRole('listbox', { name: /^Room$/ }).getByRole('option').first().click();
    await picker.getByRole('button', { name: /^Confirm$/ }).click();
    await expect(m.getByText(/Not assigned/), 'the lot form shows the chosen location').toHaveCount(0, { timeout: 10_000 });
    const post = page.waitForResponse((r) => /\/rest\/(inventory\/lots|inventory\/management\/receive)$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST');
    await m.getByRole('button', { name: /^Save$/ }).click();
    const res = await post;
    expect(res.status(), `lot save: ${(await res.text()).slice(0, 200)}`).toBeLessThan(300);
    const lot = await lotJson(page);
    expect(lot, 'the lot is stored').toBeTruthy();
    s.lotId = String(lot.id);
    expect(Number(lot.currentQuantity), 'quantity stored').toBe(20);
    const days = Math.round((new Date(lot.expirationDate).getTime() - Date.now()) / 86_400_000);
    expect(days, `expiration date stored (${lot.expirationDate})`).toBeGreaterThanOrEqual(19);
    expect(days).toBeLessThanOrEqual(21);
    const t = await tiles(page);
    expect(t.totalLots, 'Total Lots counts it').toBe(s.tiles0!.totalLots + 1);
    expect(t.expiringSoon, 'expiring in 20 days, alert window 30').toBe(s.tiles0!.expiringSoon + 1);
    expect(t.lowStock, '20 is above the threshold of 10').toBe(s.tiles0!.lowStock);
    const row = page.locator('tbody tr').filter({ hasText: LOT }).first();
    await page.getByPlaceholder(/Search by item name, lot number or barcode/).fill(LOT);
    await expect(row).toContainText('20');
    await expect(row, 'the storage location is shown on the row').not.toContainText(/Not assigned/);
  });

  test('TC-INVHP-03: QC is marked Passed', async ({ page }) => {
    await lotAction(page, /^Update QC Status$/);
    const m = await modal(page);
    await m.getByRole('combobox').first().click();
    await page.getByRole('option', { name: /^Passed$/ }).click();
    const put = page.waitForResponse((r) => /\/lots\/\d+\/qc-status$/.test(new URL(r.url()).pathname));
    await m.getByRole('button', { name: /^Update$/ }).click();
    expect((await put).status(), 'QC update').toBe(200);
    expect(String((await lotJson(page)).qcStatus).toUpperCase()).toBe('PASSED');
  });

  test('TC-INVHP-04: usage of 15 leaves 5 and the item becomes low stock', async ({ page }) => {
    await lotAction(page, /^Record Usage$/);
    const m = await modal(page);
    await m.locator('#quantityUsed').fill('15');
    await m.locator('#notes').fill(`QA happy path ${STAMP}`);
    const post = page.waitForResponse((r) => /\/rest\/inventory\/(management\/consume|usage)/.test(new URL(r.url()).pathname) && r.request().method() === 'POST');
    await m.getByRole('button', { name: /^Record$/ }).click();
    expect((await post).status(), 'usage recorded').toBeLessThan(300);
    expect(Number((await lotJson(page)).currentQuantity), 'quantity left').toBe(5);
    const t = await tiles(page);
    expect(t.lowStock, '5 is under the threshold of 10').toBe(s.tiles0!.lowStock + 1);
  });

  test('TC-INVHP-05: lot details show the location, the receipt and the usage', async ({ page }) => {
    await lotAction(page, /^View Details$/);
    const panel = page.locator('main');
    await expect(panel.getByText(LOT).first()).toBeVisible();
    const tx = await apiGet<any[]>(page, `/rest/inventory/transactions/lot/${s.lotId}`);
    expect(tx.status).toBe(200);
    const kinds = (tx.json ?? []).map((t: any) => String(t.transactionType ?? t.type ?? '').toUpperCase());
    expect(kinds.some((k) => /RECEI/.test(k)), `a receipt transaction: ${kinds.join(',')}`).toBeTruthy();
    expect(kinds.some((k) => /CONSUM|USAGE|USE/.test(k)), `a usage transaction: ${kinds.join(',')}`).toBeTruthy();
    const loc = await apiGet<any>(page, `/rest/storage/inventory-lots/${s.lotId}`);
    expect(loc.status, 'the lot has a storage location').toBe(200);
  });

  test('TC-INVHP-06: the lot is disposed with nothing left', async ({ page }) => {
    // Carbon's danger item reads "Dispose Lot danger" to assistive tech.
    await lotAction(page, /^Dispose Lot/);
    const m = await modal(page);
    await m.getByRole('combobox').first().click();
    await m.getByRole('listbox').getByRole('option').first().click();
    await m.locator('#notes').fill(`QA happy path ${STAMP}`);
    const post = page.waitForResponse((r) => /dispos/i.test(new URL(r.url()).pathname) && r.request().method() !== 'GET');
    // Carbon's danger button is named "danger Dispose".
    await m.getByRole('button', { name: /Dispose$/ }).click();
    expect((await post).status(), 'dispose').toBeLessThan(300);
    const lot = await lotJson(page);
    expect(String(lot.status).toUpperCase(), 'lot status').toMatch(/DISPOS/);
    expect(Number(lot.currentQuantity), 'nothing left to use').toBe(0);
  });

  test('TC-INVHP-07: TRIPWIRE - a disposed lot stops counting as Expiring Soon', async ({ page }) => {
    // INV-D1, confirmed 2026-10-02 three ways: the tile stays +1 after disposal; the DB has the lot
    // DISPOSED with 0 left; METRIC_RULES.expiringSoon / .expired in InventoryDashboard.jsx never read
    // lot.status. Left alone the lot will count as Expired after its date too.
    test.fail(true, 'INV-D1: Expiring Soon and Expired count disposed lots; flips when the tiles skip them');
    const t = await tiles(page);
    expect(t.expiringSoon, 'a disposed lot no longer counts as expiring').toBe(s.tiles0!.expiringSoon);
  });
});
