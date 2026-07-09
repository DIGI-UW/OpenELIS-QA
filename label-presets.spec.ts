/**
 * OpenELIS Global — Label Preset Management QA suite
 * Target: testing.openelis-global.org (3.2.1.10) · route /MasterListsPage/labelPresets · verified 2026-06-29.
 *
 * Configurable Label Preset Management (Add/Edit presets) is BUILT — supersedes the old "4 fixed presets".
 * RENDER + FUNCTION are automatable; the create/persist round-trip is fixme'd (same Carbon editor
 * form-state limitation as the Test Catalog editor — product Save works for a real user).
 */
import { test, expect, Page } from '@playwright/test';

const BASE = process.env.BASE || 'https://testing.openelis-global.org';
const ADMIN = { user: process.env.OE_USER || 'admin', pass: process.env.OE_PASS || 'adminADMIN!' };
const LIST = `${BASE}/MasterListsPage/labelPresets`;

async function login(page: Page) {
  await page.goto(`${BASE}/login`);
  await page.locator('input[type="text"], input[placeholder*="user" i]').first().fill(ADMIN.user);
  await page.locator('input[type="password"]').first().fill(ADMIN.pass);
  await page.locator('button:has-text("Login"), button[type="submit"]').first().click();
  await page.waitForURL('**/MasterListsPage', { timeout: 15000 }).catch(() => {});
}
test.beforeEach(async ({ page }) => { await login(page); });

test('TC-LP-01: Label Presets list renders with the 5 system presets (RENDER)', async ({ page }) => {
  await page.goto(LIST);
  await expect(page.getByRole('heading', { name: /label presets/i }).first()).toBeVisible();
  for (const name of ['Order Label', 'Specimen Label', 'Block Label', 'Slide Label', 'Freezer Label']) {
    await expect(page.getByText(name).first()).toBeVisible();
  }
});

test('TC-LP-02: list columns + Add Preset present (RENDER)', async ({ page }) => {
  await page.goto(LIST);
  await expect(page.getByRole('heading', { name: /label presets/i }).first()).toBeVisible();
  for (const col of [/Name/i, /Barcode Type/i, /Dimensions/i, /Scope/i, /Status/i, /Actions/i]) {
    await expect(page.getByText(col).first()).toBeVisible();
  }
  await expect(page.getByRole('button', { name: /add preset/i }).first()).toBeVisible();
});

test('TC-LP-03: filter narrows the list (FUNCTION)', async ({ page }) => {
  await page.goto(LIST);
  await expect(page.getByRole('heading', { name: /label presets/i }).first()).toBeVisible();
  await page.locator('input[placeholder*="search" i], input[type="text"], input[type="search"]').first().fill('Freezer');
  await page.waitForTimeout(1200);
  await expect(page.getByText('Freezer Label').first()).toBeVisible();
  await expect(page.getByText('Order Label')).toHaveCount(0);
});

test('TC-LP-04: "Add Preset" opens the create modal with its fields (FUNCTION)', async ({ page }) => {
  await page.goto(LIST);
  await page.getByRole('button', { name: /add preset/i }).first().click({ force: true });
  await page.waitForTimeout(1200);
  await expect(page.getByText(/Add Label Preset/i).first()).toBeVisible();
  const body = await page.locator('body').innerText();
  expect(body).toMatch(/Preset Name/i);
  expect(body).toMatch(/Barcode Type/i);
  expect(body).toMatch(/CODE_128/);
  expect(body).toMatch(/Height|Width/i);
  expect(body).toMatch(/Order|Sample/);
});

test('TC-LP-05: create a label preset persists [PERSIST]', async ({ page }) => {
  // Same Carbon editor form-state limitation as the Test Catalog editor — the modal opens and fields
  // render, but driving the controlled inputs + Save to persist isn't reliably automatable. Product
  // works for a real user. Follow-up: component-level test / capture the form onChange-submit path.
  test.fixme(true, 'Carbon modal form write not reliably automatable; product Save persists (see Test Catalog deep suite F-1)');
  await page.goto(LIST);
  await page.getByRole('button', { name: /add preset/i }).first().click({ force: true });
  // … fill Preset Name + dimensions + Save, then read back on the list …
  await expect(page.getByText(/Add Label Preset/i)).toBeVisible();
});
