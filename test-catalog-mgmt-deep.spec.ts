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
// A real trusted click at the element's center (like the CDP `computer` click): bypasses Playwright's
// actionability wait (Carbon controls hang on it) AND drives React (force-click flips attrs but doesn't).
async function mclick(page: Page, locator: any) {
  await locator.scrollIntoViewIfNeeded().catch(()=>{});
  const b = await locator.boundingBox();
  if (!b) throw new Error('no bounding box for mclick');
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
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
// Section data lives under the `/test/<id>/...` namespace (NOT `/test-catalog/tests/<id>`, which
// only carries top-level fields). Verified live: methods read back at /rest/test/<id>/methods.
const TEST_API = `${BASE}/api/OpenELIS-Global/rest/test`;
async function linkedMethods(req: APIRequestContext): Promise<any[]> {
  const r = await req.get(`${TEST_API}/${testId}/methods`);
  return r.ok() ? r.json() : [];
}
async function availMethods(req: APIRequestContext): Promise<any[]> {
  const r = await req.get(`${BASE}/api/OpenELIS-Global/rest/displayList/METHODS`);
  return r.ok() ? r.json() : [];
}
// Verified read-back surfaces (live network capture): panels/terminology/storage are sub-resources
// of the editor's `/test-catalog/tests/<id>/…` namespace (NOT the bare /tests/<id>).
async function sectionJson(req: APIRequestContext, sub: string): Promise<any> {
  const r = await req.get(`${API}/${testId}/${sub}`);
  return r.ok() ? r.json() : null;
}
async function availPanels(req: APIRequestContext): Promise<any[]> {
  const r = await req.get(`${BASE}/api/OpenELIS-Global/rest/test-catalog/panels`);
  return r.ok() ? r.json() : [];
}
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

// ── TC-DEEP-METHOD-LINK — link a method via the modal, read back via REST [ROUND-TRIP]
test('TC-DEEP-METHOD-LINK: link a method reads back via REST [ROUND-TRIP]', async ({ page }) => {
  // Verified recipe (live, 2026-06-29): open modal → pick a method in the ComboBox → fill the REQUIRED
  // Effective Date + Enter (commits the Carbon date field) → confirm "+ Link Method" → Save. Read-back is
  // via REST GET /rest/test/<id>/methods (a different surface, fast) so we avoid a slow 2nd editor reload.
  test.setTimeout(150000);
  // Pick a method that ISN'T already linked, so the assertion is specific (count +1 AND the name present).
  const before = await linkedMethods(page.request);
  const linkedIds = new Set(before.map((m: any) => String(m.methodId)));
  const avail = await availMethods(page.request);
  const pick = avail.find((m: any) => !linkedIds.has(String(m.id)));
  test.skip(!pick, 'all methods already linked to the target test — nothing left to link');
  const name: string = pick.value;

  await openSection(page, 'methods', /methods/i);
  try {
    await mclick(page, page.getByRole('button', { name: /\+\s*Link Method/i }).first());
    const dialog = page.getByRole('dialog');
    // Open + filter the Carbon ComboBox by typing the method name, then click the matching option.
    const combo = dialog.getByRole('combobox').first();
    await mclick(page, combo);
    await combo.fill(name);                                       // filters the listbox
    await page.waitForTimeout(500);
    const opt = dialog.getByRole('option', { name: new RegExp(`^\\s*${name}\\s*$`, 'i') }).first();
    await mclick(page, (await opt.count()) ? opt : dialog.getByRole('option').first());
    // Effective Date is REQUIRED (omitting it silently no-ops the confirm). Target the date input by placeholder.
    const date = dialog.locator('input[placeholder*="YYYY" i], input[placeholder*="-MM-" i], input[placeholder*="mm/dd" i]').first();
    await date.fill('2026-06-29');
    await date.press('Enter');                                    // commit the Carbon date field
    await mclick(page, dialog.getByRole('button', { name: /\+\s*Link Method/i }));  // confirm the link
    await page.waitForTimeout(800);
    await saveBottom(page);

    // ROUND-TRIP: the new method is present on the REST surface (count grew by 1, the picked name appears).
    await expect.poll(async () => (await linkedMethods(page.request)).map((m: any) => m.methodName),
      { timeout: 15000, message: 'linked method reads back via /rest/test/<id>/methods' }
    ).toContain(name);
    expect((await linkedMethods(page.request)).length).toBe(before.length + 1);
  } finally {
    // Idempotent cleanup: unlink the method we added (row trash icon + Save — there is no row-level
    // DELETE endpoint; the unlink persists through the editor Save) so re-runs don't accumulate links.
    const row = page.getByRole('row', { name: new RegExp(name, 'i') }).first();
    if (await row.count().catch(() => 0)) {
      await row.locator('button').last().click({ force: true, timeout: 8000 }).catch(() => {});
      await saveBottom(page).catch(() => {});
    }
  }
});

// ── TC-DEEP-PANEL-ASSIGN — assign the test to a panel, read back via REST [ROUND-TRIP]
test('TC-DEEP-PANEL-ASSIGN: assign test to a panel reads back via REST [ROUND-TRIP]', async ({ page }) => {
  // Verified recipe (live, 2026-06-29): open the "Add to panel" dropdown → click a panel → a membership
  // row (Panel / Position / trash) is added immediately (no confirm) → Save. Read-back via REST
  // GET /rest/test-catalog/tests/<id>/panels → {testId, memberships:[{panelId,panelName,position}]}.
  test.setTimeout(150000);
  const before = (await sectionJson(page.request, 'panels'))?.memberships || [];
  const assignedIds = new Set(before.map((m: any) => String(m.panelId)));
  const avail = await availPanels(page.request);
  const pick = avail.find((p: any) => !assignedIds.has(String(p.id)));
  test.skip(!pick, 'test already belongs to every panel — nothing left to assign');
  const name: string = pick.name;

  await openSection(page, 'panels', /panels/i);
  try {
    // #panels-add is a filterable Carbon ComboBox — type the panel name to open + filter the listbox
    // (clicking alone doesn't reliably open it headless), then click the matching option.
    const combo = page.locator('#panels-add');
    await mclick(page, combo);
    await combo.fill(name);
    await page.waitForTimeout(500);
    const opt = page.getByRole('option', { name: new RegExp(`^\\s*${escapeRe(name)}\\s*$`, 'i') }).first();
    await opt.waitFor({ state: 'visible', timeout: 10000 });
    await mclick(page, opt);
    await page.waitForTimeout(400);
    await saveBottom(page);
    // ROUND-TRIP: the membership reads back via REST (count +1, the picked panel name present).
    await expect.poll(async () => ((await sectionJson(page.request, 'panels'))?.memberships || []).map((m: any) => m.panelName),
      { timeout: 15000, message: 'panel membership reads back via /rest/test-catalog/tests/<id>/panels' }
    ).toContain(name);
    expect(((await sectionJson(page.request, 'panels'))?.memberships || []).length).toBe(before.length + 1);
  } finally {
    // Idempotent cleanup: remove the membership we added (row trash + Save) so re-runs don't accumulate.
    // The row's remove button has NO accessible name ("Remove from panel" is only a tooltip), so target
    // it positionally (last button in the row); a short timeout keeps a missed row from hanging the test.
    const row = page.getByRole('row', { name: new RegExp(escapeRe(name), 'i') }).first();
    if (await row.count().catch(() => 0)) {
      const del = row.locator('button').last();
      await del.click({ force: true, timeout: 8000 }).catch(() => {});
      await saveBottom(page).catch(() => {});
    }
  }
});

// ── TC-DEEP-TERMINOLOGY — add a LOINC mapping, read back via REST [ROUND-TRIP], clean up
test('TC-DEEP-TERMINOLOGY: add a terminology mapping reads back via REST [ROUND-TRIP]', async ({ page }) => {
  // Verified live (2026-06-29): the form uses NATIVE selects — #terminology-source (LOINC/SNOMED/CIEL/OCL),
  // #terminology-code (text), optional #terminology-relationship — then "Add mapping" adds a row, then Save.
  // Read-back: GET /rest/test-catalog/tests/<id>/terminology → {mappings:[{source,code}]}.
  test.setTimeout(150000);
  await openSection(page, 'terminology', /terminology/i);
  const code = `TC-AUTO-${Date.now().toString().slice(-6)}`;
  try {
    await page.locator('#terminology-source').selectOption({ label: 'LOINC' });
    await page.locator('#terminology-code').fill(code);
    await clickBtn(page, /add mapping/i);
    await page.waitForTimeout(400);
    await saveBottom(page);
    await expect.poll(async () => ((await sectionJson(page.request, 'terminology'))?.mappings || []).map((m: any) => m.code),
      { timeout: 15000, message: 'mapping reads back via /rest/test-catalog/tests/<id>/terminology' }
    ).toContain(code);
  } finally {
    // Best-effort cleanup (no row-level DELETE endpoint; unlink persists via the editor Save). Codes are
    // free-form/unique, so a missed cleanup never breaks a re-run — it only leaves harmless clutter.
    const row = page.getByRole('row', { name: new RegExp(escapeRe(code)) }).first();
    if (await row.count()) { await mclick(page, row.getByRole('button').last()); await saveBottom(page); }
  }
});

// ── TC-DEEP-STORAGE — set a storage condition, read back via REST [ROUND-TRIP], revert
test('TC-DEEP-STORAGE: set storage condition reads back via REST [ROUND-TRIP]', async ({ page }) => {
  // Verified live (2026-06-29): #storage-condition is a NATIVE select (value REFRIGERATED / FROZEN / …);
  // Save persists. Read-back: GET /rest/test-catalog/tests/<id>/storage → {storageCondition, protectFromLight,…}.
  test.setTimeout(150000);
  await openSection(page, 'storage', /storage/i);
  const orig = (await sectionJson(page.request, 'storage'))?.storageCondition || '';
  try {
    await page.locator('#storage-condition').selectOption('REFRIGERATED');
    await saveBottom(page);
    await expect.poll(async () => (await sectionJson(page.request, 'storage'))?.storageCondition,
      { timeout: 15000, message: 'storageCondition reads back via /rest/test-catalog/tests/<id>/storage' }
    ).toBe('REFRIGERATED');
  } finally {
    await page.locator('#storage-condition').selectOption(orig).catch(()=>{});
    await saveBottom(page).catch(()=>{});
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
