// Audit EVERY Test Catalog editor section: heading, DOM (inputs/selects/buttons), REST read-back.
// Focus: reference/age ranges + display order (both suspected build-vs-spec gaps).
import { test } from '@playwright/test';
const BASE = process.env.BASE || 'https://testing.openelis-global.org';
const A = { user: process.env.OE_USER || 'admin', pass: process.env.OE_PASS || 'adminADMIN!' };
async function login(page: any) {
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
  await page.locator('input[type="text"], input[placeholder*="user" i]').first().fill(A.user);
  await pass.fill(A.pass);
  await page.locator('button:has-text("Login"), button[type="submit"]').first().click();
  await page.waitForURL('**/MasterListsPage', { timeout: 15000 }).catch(() => {});
}
test('audit editor sections', async ({ page }) => {
  test.setTimeout(220000);
  const rest: string[] = [];
  page.on('response', (r: any) => { const u = r.url(); if (/\/rest\//.test(u) && r.request().method() === 'GET') rest.push(u.replace(BASE, '')); });
  await login(page);
  await page.goto(`${BASE}/admin/TestCatalogList?page=1&pageSize=25`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.locator('table tbody tr, [role="row"]').filter({ hasText: /\S/ }).first().click();
  await page.waitForURL('**/TestCatalogEditor/**', { timeout: 15000 });
  const testId = page.url().match(/TestCatalogEditor\/(\d+)\//)![1];
  console.log('testId=', testId);
  let slugs = await page.evaluate(() => [...document.querySelectorAll('a[href*="TestCatalogEditor"]')].map(a => (a.getAttribute('href') || '').split('/').pop()).filter(Boolean));
  slugs = [...new Set(slugs)];
  console.log('SECTION_SLUGS=', JSON.stringify(slugs));
  for (const slug of slugs) {
    rest.length = 0;
    await page.goto(`${BASE}/MasterListsPage/TestCatalogEditor/${testId}/${slug}`).catch(() => {});
    await page.waitForTimeout(1600);
    const d = await page.evaluate(() => ({
      heads: [...document.querySelectorAll('main h1,main h2,main h3')].map(e => (e.textContent || '').trim()).filter(Boolean).slice(0, 4),
      inputs: [...document.querySelectorAll('main input,main select,main textarea')].map(e => ({ id: (e as any).id, ph: e.getAttribute('placeholder'), type: (e as any).type || e.tagName.toLowerCase() })).filter(x => x.id || x.ph).slice(0, 24),
      btns: [...document.querySelectorAll('main button')].map(b => (b.textContent || '').trim()).filter(Boolean).slice(0, 12),
      tables: document.querySelectorAll('main table').length,
      dnd: document.querySelectorAll('[draggable="true"],[data-rbd-draggable-id],.cds--structured-list').length,
    }));
    console.log('== SLUG', slug, '==', JSON.stringify(d));
    console.log('   REST', JSON.stringify([...new Set(rest)].filter(u => /(range|limit|component|sample|order|display|test)/i.test(u)).slice(0, 12)));
  }
});
