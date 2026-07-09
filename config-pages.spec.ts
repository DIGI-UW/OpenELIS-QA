/**
 * OpenELIS Global — Order Entry Config + Result Reporting Config QA
 * Target: testing.openelis-global.org 3.2.1.10 · verified 2026-06-29.
 * RENDER/FUNCTION on the two admin config pages, plus a documented finding on the empty Order Entry list.
 */
import { test, expect, Page } from '@playwright/test';
const BASE = process.env.BASE || 'https://testing.openelis-global.org';
const ADMIN = { user: process.env.OE_USER || 'admin', pass: process.env.OE_PASS || 'adminADMIN!' };
async function login(page: Page) {
  await page.goto(`${BASE}/login`);
  await page.locator('input[type="text"], input[placeholder*="user" i]').first().fill(ADMIN.user);
  await page.locator('input[type="password"]').first().fill(ADMIN.pass);
  await page.locator('button:has-text("Login"), button[type="submit"]').first().click();
  await page.waitForURL('**/MasterListsPage', { timeout: 15000 }).catch(() => {});
}
test.beforeEach(async ({ page }) => { await login(page); });

test('TC-CFG-01: Result Reporting Configuration renders 3 integrations (RENDER)', async ({ page }) => {
  await page.goto(`${BASE}/MasterListsPage/resultReportingConfiguration`);
  await expect(page.getByRole('heading', { name: /result reporting configuration/i }).first()).toBeVisible();
  for (const name of [/Result Reporting/i, /Malaria Surveillance/i, /Malaria Case Report/i]) {
    await expect(page.getByText(name).first()).toBeVisible();
  }
  await expect(page.getByRole('button', { name: /^save$/i }).first()).toBeVisible();
});

test('TC-CFG-02: each reporting integration exposes enable + URL + queue (RENDER)', async ({ page }) => {
  await page.goto(`${BASE}/MasterListsPage/resultReportingConfiguration`);
  await expect(page.getByRole('heading', { name: /result reporting configuration/i }).first()).toBeVisible();
  await expect(page.getByText(/Enabled/i).first()).toBeVisible();
  await expect(page.getByText(/Queue Size/i).first()).toBeVisible();
  await expect(page.getByText(/URL for site/i).first()).toBeVisible();
});

test('TC-CFG-03: Order Entry Configuration page loads; document item count (FUNCTION/finding)', async ({ page }) => {
  await page.goto(`${BASE}/MasterListsPage/SampleEntryConfigurationMenu`);
  await expect(page.getByRole('heading', { name: /order entry configuration/i }).first()).toBeVisible();
  // table scaffold present (Modify/Select + columns)
  const body = await page.locator('body').innerText();
  expect(body).toMatch(/Name/i);
  expect(body).toMatch(/Value/i);
  const m = body.match(/(\d+)\s*-\s*(\d+)\s+of\s+(\d+)\s+items/i);
  const total = m ? Number(m[3]) : -1;
  console.log(`ORDER_ENTRY_CONFIG_ITEMS=${total}`);
  // FINDING: on testing this list is empty (0 items). Not asserting >0 — documenting the state.
  expect(total).toBeGreaterThanOrEqual(0);
});
