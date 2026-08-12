import { test, Page } from '@playwright/test';
const BASE = process.env.BASE || 'https://testing.openelis-global.org';
const ADMIN = { user: process.env.OE_USER || 'admin', pass: process.env.OE_PASS || 'adminADMIN!' };
async function login(page: Page) {
  await page.goto(`${BASE}/login`);
  await page.locator('input[type="text"], input[placeholder*="user" i]').first().fill(ADMIN.user);
  await page.locator('input[type="password"]').first().fill(ADMIN.pass);
  await page.locator('button:has-text("Login"), button[type="submit"]').first().click();
  await page.waitForURL('**/MasterListsPage', { timeout: 20000 }).catch(() => {});
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
