/**
 * OpenELIS Global — Test Catalog editor: RECONCILED regression guards.
 * Target: testing.openelis-global.org (v3.2.1.11 / OGC-1142). Supersedes the 2026-07-06 v3.2.1.10
 * "known-defect guard" version (qa-report-testing-20260706-testcatalog.md).
 *
 * The three original BLOCKER guards were written to PASS while broken and flip when fixed. Against
 * the OGC-1142 build they flipped, so they are rewritten here as POSITIVE assertions of the current,
 * verified behavior (probed live 2026-07-20):
 *
 *   BLOCKER-1  Top toolbar Save was a no-op for Basic Info.  -> FIXED. Basic Info now persists:
 *              PUT /tests/{id}/basic-info returns 200 and the change round-trips on GET.
 *   BLOCKER-2  Deactivation was non-functional.              -> STILL no deactivate path:
 *              POST /tests/{id}/deactivate = 404, DELETE /tests/{id}/activate = 405. Guarded so
 *              that when a deactivate path lands, the statuses change and this test flips.
 *   BLOCKER-3  New test never became orderable.              -> Now gated on COMPLETENESS: an
 *              incomplete test cannot activate (422) and stays out of /rest/test-list. (The
 *              complete->activate->orderable happy path is covered by the roundtrip/gate specs.)
 *
 * All assertions run via window.fetch INSIDE the loaded SPA so app cookies + the CSRF token
 * (localStorage.CSRF) are attached — the bare Playwright `request` fixture is rejected on writes.
 * Runs under all-tc.config.ts (setup + storageState).
 *
 * Run: BASE=https://testing.openelis-global.org \
 *   npx playwright test --config=all-tc.config.ts test-catalog-editor-regressions.spec.ts
 */

import { test, expect, Page } from '@playwright/test';

const BASE = process.env.BASE || 'https://testing.openelis-global.org';

type ApiResult = { status: number; body: any };

async function apiCall(page: Page, path: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE', payload?: any): Promise<ApiResult> {
  return page.evaluate(async ({ path, method, payload }) => {
    const base = '/api/OpenELIS-Global/rest';
    const csrf = localStorage.getItem('CSRF') || '';
    const init: RequestInit = {
      method,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      credentials: 'include',
    };
    if (method === 'POST' || method === 'PUT') init.body = JSON.stringify(payload ?? {});
    const r = await fetch(base + path, init);
    let body: any;
    try { body = await r.json(); } catch { body = (await r.text().catch(() => '')).slice(0, 200); }
    return { status: r.status, body };
  }, { path, method, payload });
}

async function createBareTest(page: Page): Promise<string> {
  const stamp = Date.now().toString().slice(-8);
  const res = await apiCall(page, '/test-catalog/tests', 'POST', {
    name: `QA_REG_${stamp}`, reportingName: `QA_REG_${stamp}`, code: `QAR${stamp}`,
    domain: 'CLINICAL', labUnitId: '56', sampleTypeId: '2',
  });
  expect(res.status, 'create test -> 201').toBe(201);
  const id = String(res.body?.testId ?? res.body?.id ?? '');
  expect(id, 'create returns a numeric testId').toMatch(/^\d+$/);
  return id;
}

test.describe('Test Catalog editor — reconciled regression guards (OGC-1142)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/MasterListsPage/TestCatalogList?page=1&pageSize=25`);
    await page.waitForFunction(() => !!localStorage.getItem('CSRF'), null, { timeout: 15000 });
  });

  // BLOCKER-1 — FIXED: Basic Info edits now persist.
  test('BLOCKER-1 (FIXED): Basic Info edits persist via PUT /basic-info', async ({ page }) => {
    const id = await createBareTest(page);
    const before = (await apiCall(page, `/test-catalog/tests/${id}/basic-info`, 'GET')).body;
    const edited = `QA-persist-${Date.now() % 100000}`;
    const put = await apiCall(page, `/test-catalog/tests/${id}/basic-info`, 'PUT', { ...before, description: edited });
    expect(put.status, 'basic-info PUT -> 200 (top Save no longer a no-op)').toBe(200);
    const after = (await apiCall(page, `/test-catalog/tests/${id}/basic-info`, 'GET')).body;
    expect(after.description, 'Basic Info description round-trips').toBe(edited);
  });

  // BLOCKER-2 — STILL OPEN: no working deactivate path. Flips when one lands.
  test('BLOCKER-2 (still open): no deactivate endpoint (POST /deactivate 404, DELETE /activate 405)', async ({ page }) => {
    const id = await createBareTest(page);
    const deact = await apiCall(page, `/test-catalog/tests/${id}/deactivate`, 'POST', {});
    const delAct = await apiCall(page, `/test-catalog/tests/${id}/activate`, 'DELETE');
    // FIXME(BLOCKER-2): when a deactivate path ships, these statuses change and this test flips.
    expect(deact.status, 'POST /deactivate still absent').toBe(404);
    expect(delAct.status, 'DELETE /activate still not allowed').toBe(405);
  });

  // BLOCKER-3 — reframed: orderability is now gated on completeness.
  test('BLOCKER-3 (gated): an incomplete test cannot activate (422) and is absent from /test-list', async ({ page }) => {
    const id = await createBareTest(page);
    const activate = await apiCall(page, `/test-catalog/tests/${id}/activate`, 'POST', {});
    expect(activate.status, 'incomplete test blocked from activation').toBe(422);
    const list = (await apiCall(page, `/test-list`, 'GET')).body;
    const present = Array.isArray(list) && list.some((t: any) => String(t.id) === id);
    expect(present, 'an un-activatable test is not orderable').toBe(false);
  });

  // POSITIVE CONTROL — the completeness read path works on a real, active test.
  test('CONTROL: an existing active test reports complete via /completeness', async ({ page }) => {
    // Discover a currently-active test from the list, then assert its completeness reads true.
    const list = (await apiCall(page, `/test-catalog/tests?page=1&pageSize=100`, 'GET')).body;
    const rows = list?.rows ?? [];
    const active = rows.find((r: any) => r.active === true) ?? rows[0];
    test.skip(!active, 'no tests available to sample');
    const id = String(active.testId ?? active.id);
    const comp = await apiCall(page, `/test-catalog/tests/${id}/completeness`, 'GET');
    expect(comp.status, 'completeness -> 200').toBe(200);
    expect(comp.body.complete, `active test ${id} should be complete`).toBe(true);
  });
});
