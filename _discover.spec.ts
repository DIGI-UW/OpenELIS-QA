import { test, Page } from '@playwright/test';
const BASE = process.env.BASE || 'https://testing.openelis-global.org';
const ADMIN = { user: 'admin', pass: 'adminADMIN!' };
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
async function domain(page: Page, id: string) {
  const r = await page.request.get(`${BASE}/api/OpenELIS-Global/rest/test-catalog/tests/${id}/basic-info?_=${Date.now()}`);
  return ((await r.text()).match(/"domain":"(\w+)"/)||[])[1];
}
async function mouseClickSave(page: Page) {
  const bb = await page.getByRole('button', { name: /^save$/i }).last().boundingBox();
  if (bb) await page.mouse.click(bb.x + bb.width/2, bb.y + bb.height/2);
  await page.waitForTimeout(3000);
}
test('radio label click + mouse-click save', async ({ page }) => {
  test.setTimeout(120000);
  await login(page);
  await page.goto(`${BASE}/admin/TestCatalogList?page=1&pageSize=25`);
  await page.waitForLoadState('networkidle').catch(()=>{});
  await page.locator('table tbody tr, [role="row"]').filter({ hasText: /\S/ }).first().click();
  await page.waitForURL('**/TestCatalogEditor/**', { timeout: 20000 });
  await page.getByRole('heading', { name: /basic info/i }).first().waitFor({ timeout: 30000 });
  const id = (page.url().match(/TestCatalogEditor\/(\d+)\//)||[])[1];
  const cur = await domain(page, id);
  const target = cur === 'ENVIRONMENTAL' ? 'CLINICAL' : 'ENVIRONMENTAL';
  console.log('CUR', cur, 'TARGET', target);
  await page.locator(`label[for="domain-${target}"] .cds--radio-button__label-text`).click({ timeout: 12000 });
  await page.waitForTimeout(400);
  await mouseClickSave(page);
  console.log('AFTER_SAVE_DOMAIN', await domain(page, id));
  // revert
  await page.locator(`label[for="domain-${cur}"] .cds--radio-button__label-text`).click({ timeout: 12000 }).catch(()=>{});
  await page.waitForTimeout(400);
  await mouseClickSave(page);
  console.log('REVERTED_DOMAIN', await domain(page, id));
});
