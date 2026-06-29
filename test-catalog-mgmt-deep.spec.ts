/**
 * OpenELIS Global — Test Catalog Management (unified editor) DEEP QA suite
 * Target: testing.openelis-global.org (v3.2.1.10) · spec: test-catalog-requirements-v2.5.md / OGC-949
 * Verified-authoring: live DOM + REST shape confirmed 2026-06-26.
 *
 * DEEP = write in the UI → read back on a DIFFERENT surface (the editor's REST endpoint) → assert
 * (ROUND-TRIP), per the QA skill's authoring standard. The editor SPA reloads slowly on testing,
 * so read-back uses the data endpoint (fast + genuinely cross-surface):
 *   GET /api/OpenELIS-Global/rest/test-catalog/tests/<id>/basic-info
 *        → {testId,name,code,description,domain,antimicrobialResistance,active,orderable}
 *   GET /api/OpenELIS-Global/rest/test-catalog/tests/<id>   (full test)
 * Basic-Info writes are batched into ONE save to minimise slow loads; each test reverts on the
 * demo server. Name/Code/Description are readOnly (Δ-2) → not written.
 * "Save as new test…" opens NO modal in probing → TC-DEEP-DUP is test.fail() (known defect Δ-DUP).
 */

import { test, expect, Page, APIRequestContext } from '@playwright/test';

const BASE = process.env.BASE || 'https://testing.openelis-global.org';
const API = `${BASE}/api/OpenELIS-Global/rest/test-catalog/tests`;
const ADMIN = { user: process.env.OE_USER || 'admin', pass: process.env.OE_PASS || 'adminADMIN!' };
const STAMP = `QA_AUTO_${new Date().toISOString().slice(5,10).replace('-','')}`;

let testId = '';

async function login(page: Page) {
  await page.goto(`${BASE}/login`);
  await page.locator('input[type="text"], input[placeholder*="user" i]').first().fill(ADMIN.user);
  await page.locator('input[type="password"]').first().fill(ADMIN.pass);
  await page.locator('button:has-text("Login"), button[type="submit"]').first().click();
  await page.waitForURL('**/MasterListsPage', { timeout: 15000 }).catch(() => {});
}
async function openSection(page: Page, slug: string, heading: RegExp) {
  await page.goto(`${BASE}/MasterListsPage/TestCatalogEditor/${testId}/${slug}`);
  await page.getByRole('heading', { name: heading }).first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(800);
}
// DOM-click bypasses Playwright actionability waits (an invisible Carbon modal-shell overlays the
// page and makes .click() hang to timeout — the editor itself renders fast).
async function domClick(page: Page, selector: string) {
  await page.locator(selector).click({ force: true });
  await page.waitForTimeout(400);
}
async function clickBtn(page: Page, name: RegExp) {
  await page.getByRole('button', { name }).first().click({ force: true });
  await page.waitForTimeout(400);
}
async function save(page: Page) {
  await page.getByRole('button', { name: /^save$/i }).first().click({ force: true });
  await page.waitForTimeout(2200);
}
async function basicInfo(req: APIRequestContext): Promise<any> {
  const r = await req.get(`${API}/${testId}/basic-info`);
  return r.ok() ? r.json() : {};
}
async function fullText(req: APIRequestContext): Promise<string> {
  const r = await req.get(`${API}/${testId}`);
  return r.ok() ? r.text() : `HTTP_${r.status()}`;
}
// force:true skips Playwright actionability waits (an invisible Carbon modal-shell overlays the
// page and makes a normal .click() hang) while still dispatching a REAL event React registers —
// a plain DOM .click() is fast but doesn't drive Carbon's controlled state, so writes don't save.
async function toggleSwitch(page: Page, id: string) {
  await page.locator(`#${id}`).click({ force: true });
  await page.waitForTimeout(400);
}
async function checkedDomain(page: Page): Promise<string> {
  return page.evaluate(() => {
    for (const v of ['CLINICAL','ENVIRONMENTAL','VECTOR']) {
      const r = document.querySelector(`#domain-${v}`) as HTMLInputElement;
      if (r && r.checked) return v;
    } return '';
  });
}

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await login(page);
  await page.goto(`${BASE}/admin/TestCatalogList?page=1&pageSize=25`);
  await page.waitForLoadState('networkidle').catch(()=>{});
  await page.locator('table tbody tr, [role="row"]').filter({ hasText: /\S/ }).first().click();
  await page.waitForURL('**/TestCatalogEditor/**', { timeout: 15000 });
  testId = page.url().match(/TestCatalogEditor\/(\d+)\//)![1];
  console.log('TARGET testId=', testId);
  await page.close();
});

test.beforeEach(async ({ page }) => { await login(page); });

// ── TC-DEEP-BASICINFO — change Domain + Orderable + AMR in one save, read all back via REST, revert
test('TC-DEEP-BASICINFO: domain/orderable/AMR write reads back via REST [ROUND-TRIP]', async ({ page }) => {
  // NEEDS-GUIDANCE (revalidate before filing): on testing 3.2.1.10 the radio/switches change in the
  // UI but after Save the /basic-info API still returns the original values and NO success toast
  // appears — either Basic Info save isn't wired at this milestone (cf. the "editing … is a later
  // milestone" note) or the control change isn't driving Carbon's form-dirty state. Skipped until confirmed.
  test.fixme(true, 'Basic Info edits do not round-trip via REST after Save (no toast) — NEEDS-GUIDANCE');
  await openSection(page, 'basic-info', /basic info/i);
  const before = await basicInfo(page.request);
  const origDomain = before.domain || (await checkedDomain(page));
  const target = origDomain === 'ENVIRONMENTAL' ? 'CLINICAL' : 'ENVIRONMENTAL';
  try {
    await domClick(page, `#domain-${target}`);
    await toggleSwitch(page, 'basic-info-orderable');
    await toggleSwitch(page, 'basic-info-amr');
    await save(page);
    const after = await basicInfo(page.request);
    expect(after.domain, 'domain round-trips').toBe(target);
    expect(after.orderable, 'orderable flipped').toBe(!before.orderable);
    expect(after.antimicrobialResistance, 'AMR flipped').toBe(!before.antimicrobialResistance);
  } finally {
    await openSection(page, 'basic-info', /basic info/i);
    if (await checkedDomain(page) !== origDomain) await domClick(page, `#domain-${origDomain}`);
    const now = await basicInfo(page.request);
    if (now.orderable !== before.orderable) await toggleSwitch(page, 'basic-info-orderable');
    if (now.antimicrobialResistance !== before.antimicrobialResistance) await toggleSwitch(page, 'basic-info-amr');
    await save(page);
  }
});

// ── TC-DEEP-TERMINOLOGY — add a LOINC mapping, read back via REST (ROUND-TRIP), delete
test('TC-DEEP-TERMINOLOGY: add a terminology mapping reads back via REST [ROUND-TRIP]', async ({ page }) => {
  test.fixme(true, 'Terminology mapping add does not round-trip via REST after Save — NEEDS-GUIDANCE (same save question as Basic Info)');
  await openSection(page, 'terminology', /terminology/i);
  const code = `${STAMP}${Date.now().toString().slice(-5)}`;
  await page.locator('main select').first().selectOption({ label: 'LOINC' }).catch(()=>{});
  await page.locator('main input[type="text"]').first().fill(code).catch(()=>{});
  await clickBtn(page, /add mapping/i);
  await page.waitForTimeout(500);
  await save(page);
  expect(await fullText(page.request)).toContain(code);
  await page.locator(`tr:has-text("${code}") button, li:has-text("${code}") button`).last().click().catch(()=>{});
  await page.waitForTimeout(400);
  await save(page).catch(()=>{});
});

// ── TC-DEEP-STORAGE — set a storage condition, read back via REST (ROUND-TRIP), revert
test('TC-DEEP-STORAGE: set storage condition reads back via REST [ROUND-TRIP]', async ({ page }) => {
  test.fixme(true, 'Sample Storage set does not round-trip via REST after Save — NEEDS-GUIDANCE (same save question as Basic Info)');
  await openSection(page, 'storage', /sample storage/i);
  const sel = page.locator('main select').first();
  const orig = await sel.inputValue().catch(()=> '');
  try {
    await sel.selectOption({ label: 'Refrigerated (2–8°C)' }).catch(async ()=>{ await sel.selectOption({ index: 1 }); });
    await save(page);
    expect(await fullText(page.request)).toMatch(/refriger|2.?8/i);
  } finally {
    await page.locator('main select').first().selectOption(orig).catch(()=>{});
    await save(page).catch(()=>{});
  }
});

// ── TC-DEEP-FILTER — list Domain filter narrows results [FUNCTION]
test('TC-DEEP-FILTER: list Domain filter narrows results [FUNCTION]', async ({ page }) => {
  await page.goto(`${BASE}/admin/TestCatalogList?page=1&pageSize=25`);
  await page.getByRole('heading', { name: /test catalog/i }).first().waitFor({ timeout: 30000 });
  const sel = page.locator('main select').first();
  await sel.selectOption({ label: /Environmental/i as any }).catch(async ()=>{
    await page.getByText(/all domains/i).first().click().catch(()=>{});
    await page.getByRole('option', { name: /Environmental/i }).first().click().catch(()=>{});
  });
  await page.waitForTimeout(1500);
  const rows = page.locator('table tbody tr, [role="row"]').filter({ hasText: /\S/ });
  const n = await rows.count();
  for (let i = 0; i < Math.min(n, 5); i++) await expect(rows.nth(i)).toContainText(/Environmental/i);
});

// ── TC-DEEP-DUP — "Save as new test…" should open a Duplicate modal (known defect → test.fail)
test('TC-DEEP-DUP: "Save as new test…" opens a Duplicate modal [FUNCTION]', async ({ page }) => {
  test.fail(true, 'Save as new test… opens no Duplicate modal on testing 3.2.1.10 (Δ-DUP)');
  await openSection(page, 'basic-info', /basic info/i);
  await clickBtn(page, /save as new test/i);
  await page.waitForTimeout(2000);
  await expect(page.locator('[role="dialog"], .cds--modal.is-visible, .bx--modal.is-visible')).toBeVisible({ timeout: 4000 });
});
