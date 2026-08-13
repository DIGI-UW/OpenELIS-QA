import { test, Page } from '@playwright/test';
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
test('editor load timing', async ({ page }) => {
  test.setTimeout(180000);
  await login(page);
  let t = Date.now();
  await page.goto(`${BASE}/admin/TestCatalogList?page=1&pageSize=25`);
  await page.getByRole('heading', { name: /test catalog/i }).first().waitFor({ timeout: 90000 }).catch(()=>{});
  console.log(`BASE=${BASE}`);
  console.log(`LIST_LOAD_MS=${Date.now()-t}`);
  const count = await page.locator('body').innerText().then(t=>{ const m=t.match(/of\s+(\d+)\s+items/i); return m?m[1]:'?'; }).catch(()=>'?');
  console.log(`CATALOG_COUNT=${count}`);
  await page.locator('table tbody tr, [role="row"]').filter({ hasText: /\S/ }).first().click();
  await page.waitForURL('**/TestCatalogEditor/**', { timeout: 30000 }).catch(()=>{});
  t = Date.now();
  await page.getByRole('heading', { name: /basic info/i }).first().waitFor({ timeout: 90000 }).catch(()=>{});
  console.log(`EDITOR_BASICINFO_RENDER_MS=${Date.now()-t}`);
  const id = (page.url().match(/TestCatalogEditor\/(\d+)\//)||[])[1];
  t = Date.now();
  await page.goto(`${BASE}/MasterListsPage/TestCatalogEditor/${id}/ranges`);
  await page.getByRole('heading', { name: /ranges/i }).first().waitFor({ timeout: 90000 }).catch(()=>{});
  console.log(`EDITOR_RANGES_RENDER_MS=${Date.now()-t}`);
});
