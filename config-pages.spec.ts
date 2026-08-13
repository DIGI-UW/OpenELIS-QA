/**
 * OpenELIS Global — Order Entry Config + Result Reporting Config QA
 * Target: testing.openelis-global.org 3.2.1.10 · verified 2026-06-29.
 * RENDER/FUNCTION on the two admin config pages, plus a documented finding on the empty Order Entry list.
 */
import { test, expect, Page } from '@playwright/test';
const BASE = process.env.BASE || 'https://testing.openelis-global.org';
const ADMIN = { user: process.env.OE_USER || 'admin', pass: process.env.OE_PASS || 'adminADMIN!' };
async function login(page: Page) {
  // 2026-08-13: probes.config.ts supplies storageState from the `setup` project, so this context is
  // ALREADY authenticated and /login redirects straight to the dashboard. The old body filled a
  // username field unconditionally; with no such field on the page, .fill() waited out the full
  // 120s test timeout INSIDE beforeEach, so every test in this file died before reaching its first
  // assertion. That is the entire probes cluster — 2 passed / 11 failed, identical on the 08-06 and
  // 08-12 sweeps, and never diagnosed because a beforeEach timeout reads like a page problem.
  // Check whether the form is actually there before acting on it.
  await page.goto(`${BASE}/login`);
  const pass = page.locator('input[type="password"]').first();
  if (!(await pass.isVisible({ timeout: 5000 }).catch(() => false))) return; // already signed in
  await page.locator('input[type="text"], input[placeholder*="user" i]').first().fill(ADMIN.user);
  await pass.fill(ADMIN.pass);
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

test('TC-CFG-03: Order Entry Configuration page loads and lists its items (FUNCTION)', async ({ page }) => {
  await page.goto(`${BASE}/MasterListsPage/SampleEntryConfigurationMenu`);
  await expect(page.getByRole('heading', { name: /order entry configuration/i }).first()).toBeVisible();
  // 2026-08-13: this used to read body.innerText immediately and log ORDER_ENTRY_CONFIG_ITEMS=0,
  // which was carried for a while as a possible product finding ("the page renders with zero
  // items"). It is not. Carbon paints the empty table shell first and the footer briefly reads
  // "0 items"; the count was being read before the data arrived. Verified by hand in Chrome on
  // testing.openelis-global.org (1-15 of 15 items) and by a settled probe on 34.212.225.107
  // (1-19 of 19 items — the two instances legitimately differ). Wait for a row before counting.
  await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 20000 });
  const body = await page.locator('body').innerText();
  expect(body).toMatch(/Name/i);
  expect(body).toMatch(/Value/i);
  const m = body.match(/(\d+)\s*-\s*(\d+)\s+of\s+(\d+)\s+items/i);
  const total = m ? Number(m[3]) : -1;
  console.log(`ORDER_ENTRY_CONFIG_ITEMS=${total}`);
  // The exact count is instance-specific, so assert the page is populated rather than a magic number.
  expect(total, 'Order Entry Configuration should list at least one item').toBeGreaterThan(0);
});
