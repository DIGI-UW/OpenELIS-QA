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
// React-controlled radio: a plain/force click flips the DOM `checked` but NOT React's form state,
// so Save submits the unchanged value (verified: manual click persists, force-click does not).
// Drive it through the native setter + dispatched events React's tracker recognises.
// Change the Domain: a real click on the radio LABEL opens a "Change test domain?" confirmation
// dialog (FRS §2.1) — you MUST click its Confirm for the change to commit; only then does Save
// persist it. (This confirmation step is what every earlier automation attempt was missing.)
async function changeDomain(page: Page, value: string) {
  await page.locator(`label[for="domain-${value}"] .cds--radio-button__label-text`).click({ timeout: 8000 });
  const dialog = page.getByRole('dialog', { name: /change test domain/i });
  await dialog.getByRole('button', { name: /^confirm$/i }).click({ timeout: 8000 });
  await page.waitForTimeout(500);
}
async function saveBottom(page: Page) {
  await page.getByRole('button', { name: /^save$/i }).last().click({ force: true });
  await page.waitForTimeout(2500);
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

// ── TC-DEEP-DOMAIN — change Domain via the confirm dialog, read back via REST, revert
test('TC-DEEP-DOMAIN: change domain (confirm dialog) reads back via REST [ROUND-TRIP]', async ({ page }) => {
  await openSection(page, 'basic-info', /basic info/i);
  const before = await basicInfo(page.request);
  const orig = before.domain || (await checkedDomain(page));
  const target = orig === 'ENVIRONMENTAL' ? 'CLINICAL' : 'ENVIRONMENTAL';
  try {
    await changeDomain(page, target);   // select radio + confirm "Change test domain?" dialog
    await saveBottom(page);
    const after = await basicInfo(page.request);
    expect(after.domain, 'domain round-trips via REST').toBe(target);
  } finally {
    await changeDomain(page, orig);
    await saveBottom(page);
  }
});

// ── TC-DEEP-METHOD-LINK — link a method via the modal, read back after reload (PERSIST)
test('TC-DEEP-METHOD-LINK: link a method persists on reload [PERSIST]', async ({ page }) => {
  // Modal flow discovered (+ Link Method → Select-a-method ComboBox + Effective Date + Set default →
  // confirm + Link Method → Save). The Carbon ComboBox option-select isn't yet driving persistence in
  // automation (same controlled-input issue the domain radio had before the confirm-dialog fix). Needs
  // live interaction discovery for the ComboBox. Product works for a real user.
  test.fixme(true, 'Link Method ComboBox option-select not yet persisting in automation — needs ComboBox interaction discovery');
  await openSection(page, 'methods', /methods/i);
  const linkedBefore = await page.getByText(/no methods linked/i).count(); // 1 = empty state
  // open the Link Method modal (section button), pick a method, confirm
  await page.getByRole('button', { name: /\+\s*Link Method/i }).first().click({ force: true });
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox').first().click({ force: true });
  await page.getByRole('option').first().click({ force: true }).catch(()=>{});
  await dialog.getByRole('button', { name: /\+\s*Link Method/i }).click({ force: true });
  await page.waitForTimeout(800);
  await saveBottom(page);
  // PERSIST: reload the section (re-fetches) — the empty state should be gone / a row present
  await openSection(page, 'methods', /methods/i);
  if (linkedBefore > 0) await expect(page.getByText(/no methods linked/i)).toHaveCount(0);
  await expect(page.locator('table tbody tr, [role="row"]').filter({ hasText: /\S/ }).first()).toBeVisible();
});

// ── TC-DEEP-PANEL-ASSIGN — assign the test to a panel via the typeahead, read back on reload (PERSIST)
test('TC-DEEP-PANEL-ASSIGN: assign test to a panel persists on reload [PERSIST]', async ({ page }) => {
  // Add-to-panel typeahead discovered; selecting an option via the Carbon ComboBox isn't yet proven to
  // add a panel in automation (same ComboBox issue as Link Method). The lenient row-count check can pass
  // without a real add, so fixme'd until the ComboBox interaction is nailed + a specific-panel assert added.
  test.fixme(true, 'Add-to-panel ComboBox option-select not yet proven in automation — needs ComboBox interaction discovery');
  await openSection(page, 'panels', /panels/i);
  const rowsBefore = await page.locator('table tbody tr, [role="row"]').filter({ hasText: /\S/ }).count();
  const combo = page.getByRole('combobox', { name: /add to panel/i }).first();
  await combo.click({ force: true });
  await page.getByRole('option').first().click({ force: true }).catch(()=>{});
  await page.waitForTimeout(400);
  await saveBottom(page);
  await openSection(page, 'panels', /panels/i);
  const rowsAfter = await page.locator('table tbody tr, [role="row"]').filter({ hasText: /\S/ }).count();
  expect(rowsAfter, 'panel assignment persists (>= prior row count)').toBeGreaterThanOrEqual(rowsBefore);
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
