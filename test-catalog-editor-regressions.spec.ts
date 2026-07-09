/**
 * OpenELIS Global — Test Catalog editor: REGRESSION GUARDS for the 2026-07-06 deep-run defects.
 * Target: testing.openelis-global.org (v3.2.1.10). See qa-report-testing-20260706-testcatalog.md.
 *
 * These tests DOCUMENT and GUARD three high-severity GUI blockers. Each is written so that it
 * PASSES while the bug is present (asserting the broken behaviour) and is marked with a clear
 * FIXME — when the bug is fixed the assertion flips and the test starts failing, prompting an
 * update. This is the "known-defect guard" pattern: the suite tells you the moment behaviour changes.
 *
 * BLOCKER-1  Top toolbar "Save" is a no-op — Basic Info edits to an existing test do not persist.
 *            (Section-level inline Saves work; Basic Info has no working inline Save.)
 * BLOCKER-2  Deactivate is non-functional — Active toggle-off is a no-op; POST /deactivate = 404;
 *            /activate is set-only. A test can be activated but never deactivated.
 * BLOCKER-3  A newly created test never appears in the orderable list (GET /rest/test-list),
 *            so it cannot be ordered — the end-to-end order→result chain is blocked.
 *
 * Positive control: the section-level Save works (Ranges/Panels/Terminology round-trip) — proven in
 * test-catalog-result-types.spec.ts; here we re-assert it for Terminology so a regression in the
 * WORKING path is also caught.
 */

import { test, expect, Page } from '@playwright/test';

const BASE = process.env.BASE || 'https://testing.openelis-global.org';
const REST = `${BASE}/api/OpenELIS-Global/rest/test-catalog`;
const ROOT = `${BASE}/api/OpenELIS-Global/rest`;
const ADMIN = { user: process.env.OE_USER || 'admin', pass: process.env.OE_PASS || 'adminADMIN!' };
const STAMP = `QA_AUTO_${new Date().toISOString().slice(5, 10).replace('-', '')}`;

async function login(page: Page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[name="loginName"], #loginName, input[placeholder*="ser" i]', ADMIN.user);
  await page.fill('input[name="password"], #password, input[type="password"]', ADMIN.pass);
  await page.getByRole('button', { name: /sign in|log ?in|submit/i }).first()
    .click().catch(() => page.keyboard.press('Enter'));
  await page.waitForLoadState('networkidle').catch(() => {});
}
async function pickCombo(page: Page, label: string, optionText: string) {
  await page.getByLabel(label, { exact: false }).first().click();
  await page.getByRole('option', { name: optionText, exact: true }).first().click();
}
async function createTest(page: Page, name: string, code: string): Promise<string> {
  await page.goto(`${BASE}/MasterListsPage/TestCatalogList?page=1&pageSize=25`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /new test/i }).first().click();
  await page.getByLabel('Test name', { exact: false }).first().fill(name);
  await page.getByLabel('Reporting name', { exact: false }).first().fill(name);
  await page.getByLabel('Test code', { exact: false }).first().fill(code);
  await pickCombo(page, 'Lab Unit', 'Biochemistry');
  await pickCombo(page, 'Sample type', 'Serum');
  await page.getByRole('button', { name: /^Save$/ }).last().click();
  await page.waitForURL(/\/TestCatalogEditor\/\d+\/basic-info/, { timeout: 30_000 });
  return page.url().match(/TestCatalogEditor\/(\d+)\//)![1];
}
const biGet = (request: any, id: string) =>
  request.get(`${REST}/tests/${id}/basic-info`, { headers: { Accept: 'application/json' } }).then((r: any) => r.json());

test.describe('Test Catalog editor — known-defect regression guards (2026-07-06)', () => {
  test.beforeEach(async ({ page }) => login(page));

  // BLOCKER-1 — top toolbar Save does not persist Basic Info edits.
  test('BLOCKER-1: top toolbar Save is a no-op for Basic Info (FIXME when fixed)', async ({ page, request }) => {
    const id = await createTest(page, `${STAMP} SaveBug`, `${STAMP}_SB`);
    const before = (await biGet(request, id)).description || '';

    await page.goto(`${BASE}/MasterListsPage/TestCatalogEditor/${id}/basic-info`, { waitUntil: 'domcontentloaded' });
    const desc = page.getByLabel('Description', { exact: false }).first();
    await desc.click();
    await desc.fill('EDITED via top Save — should NOT persist while BLOCKER-1 is open');
    // Click the TOP toolbar Save (first Save on the page, in the editor header).
    await page.getByRole('button', { name: /^Save$/ }).first().click();
    await page.waitForTimeout(1500);

    const after = (await biGet(request, id)).description || '';
    // FIXME(BLOCKER-1): while the bug is present the top Save writes nothing → description unchanged.
    // When fixed, `after` will equal the edited text and THIS ASSERTION WILL FAIL — update the test.
    expect(after, 'top Save currently persists nothing (bug present)').toBe(before);
  });

  // BLOCKER-2 — deactivation is non-functional.
  test('BLOCKER-2: activate works but deactivate is impossible (FIXME when fixed)', async ({ page, request }) => {
    const id = await createTest(page, `${STAMP} Deact`, `${STAMP}_DE`);

    // Activate via the toggle (this DOES work — POST /tests/{id}/activate).
    await page.goto(`${BASE}/MasterListsPage/TestCatalogEditor/${id}/basic-info`, { waitUntil: 'domcontentloaded' });
    await page.getByLabel('Active', { exact: false }).first().click().catch(() => {});
    await page.waitForTimeout(1200);
    expect((await biGet(request, id)).active, 'activate works').toBe(true);

    // Try to deactivate every way we know — all currently fail.
    await page.getByLabel('Active', { exact: false }).first().click().catch(() => {}); // UI toggle-off (no-op)
    await page.waitForTimeout(1000);
    const viaDelete = await request.delete(`${REST}/tests/${id}/activate`);
    const viaDeact  = await request.post(`${REST}/tests/${id}/deactivate`);
    expect(viaDeact.status(), 'no /deactivate endpoint').toBe(404);
    expect([404, 405]).toContain(viaDelete.status());
    // FIXME(BLOCKER-2): still active — no working deactivate path. When a deactivate path lands,
    // active will become false here and this assertion will fail — update the test.
    expect((await biGet(request, id)).active, 'cannot deactivate (bug present)').toBe(true);
  });

  // BLOCKER-3 — a new test never becomes orderable.
  test('BLOCKER-3: created + activated test is absent from /rest/test-list (FIXME when fixed)', async ({ page, request }) => {
    const id = await createTest(page, `${STAMP} Orderable`, `${STAMP}_OR`);
    await page.goto(`${BASE}/MasterListsPage/TestCatalogEditor/${id}/basic-info`, { waitUntil: 'domcontentloaded' });
    await page.getByLabel('Active', { exact: false }).first().click().catch(() => {});
    await page.waitForTimeout(1200);

    const list = await (await request.get(`${ROOT}/test-list`, { headers: { Accept: 'application/json' } })).json();
    const present = (list || []).some((t: any) => String(t.id) === id);
    // FIXME(BLOCKER-3): new test does not surface to ordering. When it does, `present` becomes true
    // and this assertion fails — update the test (and re-enable the full order→result chain below).
    expect(present, 'new test not orderable (bug present)').toBe(false);
  });

  // POSITIVE CONTROL — the working section-level Save must keep working.
  test('CONTROL: Terminology section Save round-trips (guards the working path)', async ({ page, request }) => {
    const id = await createTest(page, `${STAMP} Term`, `${STAMP}_TM`);
    await page.goto(`${BASE}/MasterListsPage/TestCatalogEditor/${id}/terminology`, { waitUntil: 'domcontentloaded' });
    await page.locator('select').first().selectOption({ label: 'LOINC' }).catch(() => {});
    await page.getByLabel('Code', { exact: false }).first().fill('2345-7');
    await page.getByRole('button', { name: /add mapping/i }).first().click();
    await page.getByRole('button', { name: /^Save$/ }).last().click();
    await page.waitForTimeout(1200);

    const term = await (await request.get(`${REST}/tests/${id}/terminology`, { headers: { Accept: 'application/json' } })).json();
    const hit = (term.mappings || []).some((m: any) => m.source === 'LOINC' && m.code === '2345-7');
    expect(hit, 'LOINC mapping persisted via section Save').toBe(true);
  });
});
