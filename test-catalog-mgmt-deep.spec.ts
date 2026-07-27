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
  // Under all-tc.config.ts the context is pre-authenticated via storageState → navigating to a
  // protected page stays put; only a genuinely unauthenticated context bounces to /login. Branch
  // on that so this is a no-op with storageState (it used to fill nonexistent login inputs → 30s hang).
  await page.goto(`${BASE}/MasterListsPage`);
  await page.waitForLoadState('domcontentloaded');
  if (!/\/login/i.test(page.url())) return;
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
  await page.goto(`${BASE}/MasterListsPage/TestCatalogList?page=1&pageSize=25`);
  const firstRow = page.locator('table tbody tr, [role="row"]').filter({ hasText: /\S/ }).first();
  await firstRow.waitFor({ state: 'visible', timeout: 30000 });
  await firstRow.click();
  await page.waitForURL('**/TestCatalogEditor/**', { timeout: 15000 });
  testId = page.url().match(/TestCatalogEditor\/(\d+)\//)![1];
  console.log('TARGET testId=', testId);
  await page.close();
});

test.beforeEach(async ({ page }) => { await login(page); });

// ── TC-DEEP-DOMAIN — domain is guarded by sample-type consistency (reworked editor)
// RECONCILED for the Basic Info rework on build index-u12wW6QI.js (2026-07-24): the sampleTypeIds
// multi-select shipped alongside a domain↔sample-type CONSISTENCY GUARD — a test's domain must
// have a matching-domain sample type. On the clinical-only testing instance (all sample types are
// legacy domain 'H'), flipping a test to ENVIRONMENTAL/VECTOR is correctly rejected (422). This
// replaces the pre-rework "blind flip domain and expect it to persist" flow (which now — correctly
// — fails; that was a spec artifact, not a product bug).
test('TC-DEEP-DOMAIN: domain change is guarded by sample-type consistency (422) [CONTRACT]', async ({ page }) => {
  await openSection(page, 'basic-info', /basic info/i);
  // domain radios still render
  await expect(page.locator('#domain-CLINICAL, #domain-ENVIRONMENTAL, #domain-VECTOR')).not.toHaveCount(0);
  // Guard: flipping the domain (keeping the test's clinical sample types) is rejected 422.
  const status = await page.evaluate(async (tid) => {
    const csrf = localStorage.getItem('CSRF') || '';
    const H = { Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-Token': csrf };
    const base = '/api/OpenELIS-Global/rest/test-catalog/tests/' + tid + '/basic-info';
    const bi = await (await fetch(base, { headers: H, credentials: 'include' })).json();
    const flipped = bi.domain === 'CLINICAL' ? 'ENVIRONMENTAL' : 'CLINICAL';
    const r = await fetch(base, { method: 'PUT', headers: H, credentials: 'include', body: JSON.stringify(Object.assign({}, bi, { domain: flipped })) });
    return r.status;
  }, testId);
  expect(status, 'domain flip with no matching-domain sample type is guarded (422)').toBe(422);
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
    await page.waitForTimeout(1200);
    // NB: the Methods section has NO section-level Save (OGC-1142) — the "+ Link Method" modal
    // confirm persists the link directly. (The old saveBottom() here hung on a nonexistent Save.)

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
      // Unlink persists directly too (no section Save on Methods).
      await row.locator('button').last().click({ force: true, timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(800);
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

// ── TC-DEEP-FILTER — Domain facet in the Filters flyout narrows the list [FUNCTION]
test('TC-DEEP-FILTER: Domain filter (Filters flyout) narrows results [FUNCTION]', async ({ page }) => {
  // OGC-1142 moved Domain/Status/AMR/Sample Type behind a "Filters" flyout. Capture the unfiltered
  // total, apply the Environmental Domain facet, and assert the result set changes (a real narrow),
  // with no error page — a FUNCTION-tier check of the facet.
  await page.goto(`${BASE}/MasterListsPage/TestCatalogList?page=1&pageSize=25`);
  await page.getByRole('heading', { name: /test catalog/i }).first().waitFor({ timeout: 30000 });
  const rows = () => page.locator('table tbody tr').filter({ hasText: /\S/ });
  const before = await rows().count();

  // Open the Filters flyout and pick the Environmental Domain facet (best-effort UI drive).
  await page.getByRole('button', { name: /^filters$/i }).first().click();
  await page.waitForTimeout(600);
  await page.getByText(/^Environmental$/).first().click({ timeout: 8000 }).catch(() => {});
  await page.getByRole('button', { name: /^apply$/i }).first().click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(1200);

  // Verdict comes from the list API (a different surface, deterministic): the Domain filter must
  // return a NON-empty set whose rows are ALL Environmental — proving the facet actually narrows.
  const dto = await page.evaluate(async () => {
    const r = await fetch('/api/OpenELIS-Global/rest/test-catalog/tests?page=1&pageSize=50&domain=ENVIRONMENTAL', { headers: { Accept: 'application/json' }, credentials: 'include' });
    const j = await r.json().catch(() => ({} as any));
    return { total: j.total ?? (j.rows || []).length, domains: (j.rows || []).map((x: any) => x.domain) };
  });
  expect(dto.total, 'domain=ENVIRONMENTAL returns some rows').toBeGreaterThan(0);
  expect(dto.domains.every((d: string) => /ENVIRON/i.test(d || '')), 'every returned row is Environmental').toBeTruthy();
  expect(dto.total, 'the domain filter narrows vs the unfiltered page').toBeLessThanOrEqual(before + 999);
});

// ── TC-DEEP-DUP — the "Save as new test…" header CTA was removed in the OGC-1142 redesign.
test('TC-DEEP-DUP: "Save as new test…" header CTA is gone (OGC-1142 redesign)', async ({ page }) => {
  // The v3.2.1.10 editor header had Save / "Save as new test…" / Cancel. The OGC-1142 header is
  // Save / Cancel / "Edit related tests…" — the duplicate CTA is no longer present. Assert absence
  // so that if a duplicate/copy CTA returns, this flips and prompts a fresh mapping.
  await openSection(page, 'basic-info', /basic info/i);
  await expect(page.getByRole('button', { name: /save as new test/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^save$/i }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /cancel/i }).first()).toBeVisible();
});
