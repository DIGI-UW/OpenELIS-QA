import { test, Page } from '@playwright/test';
const BASE = process.env.BASE || 'https://testing.openelis-global.org';
const ADMIN = { user: 'admin', pass: 'adminADMIN!' };
async function login(page: Page) {
  await page.goto(`${BASE}/login`);
  await page.locator('input[type="text"], input[placeholder*="user" i]').first().fill(ADMIN.user);
  await page.locator('input[type="password"]').first().fill(ADMIN.pass);
  await page.locator('button:has-text("Login"), button[type="submit"]').first().click();
  await page.waitForURL('**/MasterListsPage', { timeout: 20000 }).catch(() => {});
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
