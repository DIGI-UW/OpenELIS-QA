/**
 * OpenELIS Global — Test Catalog ACTIVATION INTEGRITY GATE (FR-57)
 * Target: testing.openelis-global.org (v3.2.1.11 / OGC-1142, PR DIGI-UW/OpenELIS-Global-2#3859)
 *
 * WHAT THIS PINS (verified live 2026-07-20 on the OGC-1142 build):
 *   OGC-1142 replaced the old SILENT activation no-op with a hard completeness gate.
 *   A test with no active primary result component CANNOT be activated:
 *     GET  /rest/test-catalog/tests/{id}/completeness
 *          -> 200 {complete:false, missing:["NO_PRIMARY_RESULT_TYPE"], messages:[...]}
 *     POST /rest/test-catalog/tests/{id}/activate
 *          -> 422 with that SAME completeness body (was: 200 + silent no-op).
 *   This is the fix for OGC-1141 (activation silently no-ops with no feedback):
 *   the gate now returns an actionable checklist instead of failing quietly.
 *
 * Contrast with the COVERAGE gate (soft): a complete test with an age-range gap
 * returns 409 + a coverage report and can be activated via the acknowledge path.
 * Completeness (this spec) is the HARD gate — 422, no acknowledge.
 *
 * API notes (browser-context quirks encoded here):
 *   - Base path MUST include the app context prefix: /api/OpenELIS-Global/rest/...
 *     (bare /rest/... returns the SPA index.html, not JSON).
 *   - Create shape (201 -> {testId}):
 *     POST /tests {name, reportingName, code, domain:CLINICAL, labUnitId, sampleTypeId}
 *     labUnitId 56 = Biochemistry, sampleTypeId 2 = Serum. New tests are created INACTIVE
 *     with no result component -> perfect fixture for the completeness gate.
 *
 * Auth/CSRF: runs under all-tc.config.ts (setup + storageState). OpenELIS requires the
 * X-CSRF-Token header on writes; the token lives in localStorage.CSRF once the SPA has
 * loaded. So the calls run IN the page context (page.evaluate + window.fetch with the
 * app cookies + CSRF header) rather than via the bare `request` fixture (which has cookies
 * but no CSRF token and would be rejected on POST).
 *
 * Run: BASE=https://testing.openelis-global.org \
 *   npx playwright test --config=all-tc.config.ts test-catalog-activation-gate.spec.ts
 */

import { test, expect, Page } from '@playwright/test';

const BASE = process.env.BASE || 'https://testing.openelis-global.org';

type ApiResult = { status: number; body: any };

/** Run window.fetch inside the loaded SPA so app cookies + the CSRF token are attached. */
async function apiCall(page: Page, path: string, method: 'GET' | 'POST', payload?: any): Promise<ApiResult> {
  return page.evaluate(async ({ path, method, payload }) => {
    const base = '/api/OpenELIS-Global/rest/test-catalog';
    const csrf = localStorage.getItem('CSRF') || '';
    const init: RequestInit = {
      method,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      credentials: 'include',
    };
    if (method === 'POST') init.body = JSON.stringify(payload ?? {});
    const r = await fetch(base + path, init);
    let body: any;
    try { body = await r.json(); } catch { body = (await r.text().catch(() => '')).slice(0, 300); }
    return { status: r.status, body };
  }, { path, method, payload });
}

/** Create a fresh, inactive, component-less test and return its numeric id. */
async function createBareTest(page: Page): Promise<string> {
  const stamp = Date.now().toString().slice(-8);
  const res = await apiCall(page, '/tests', 'POST', {
    name: `QA_GATE_${stamp}`,
    reportingName: `QA_GATE_${stamp}`,
    code: `QAG${stamp}`,
    domain: 'CLINICAL',
    labUnitId: '56',   // Biochemistry
    sampleTypeId: '2', // Serum
  });
  expect(res.status, 'create test -> 201').toBe(201);
  const id = String(res.body?.testId ?? res.body?.id ?? '');
  expect(id, 'create returns a numeric testId').toMatch(/^\d+$/);
  return id;
}

test.describe('Test Catalog — activation integrity gate (FR-57, OGC-1142 / re OGC-1141)', () => {
  // Load the SPA once so localStorage.CSRF + app cookies exist for the in-page fetches.
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/MasterListsPage/TestCatalogList?page=1&pageSize=25`);
    await page.waitForFunction(() => !!localStorage.getItem('CSRF'), null, { timeout: 15000 });
  });

  test('TCG-ACT-01: an incomplete test reports complete:false with the NO_PRIMARY_RESULT_TYPE checklist', async ({ page }) => {
    const id = await createBareTest(page);
    const res = await apiCall(page, `/tests/${id}/completeness`, 'GET');
    expect(res.status, 'completeness -> 200').toBe(200);
    expect(res.body.complete, 'a component-less test is NOT complete').toBe(false);
    expect(res.body.missing, 'missing lists the primary-result-type gap').toContain('NO_PRIMARY_RESULT_TYPE');
    // The gate returns an actionable message (the OGC-1141 fix: feedback, not silence).
    expect(Array.isArray(res.body.messages) && res.body.messages.length > 0, 'completeness carries a human-readable message').toBeTruthy();
  });

  test('TCG-ACT-02: activating an incomplete test is BLOCKED with 422 + the same checklist (no silent no-op)', async ({ page }) => {
    const id = await createBareTest(page);
    const res = await apiCall(page, `/tests/${id}/activate`, 'POST', {});
    // OGC-1142: was 200 + silent no-op (OGC-1141); now a hard 422 completeness gate.
    expect(res.status, 'activate on an incomplete test -> 422 (hard gate)').toBe(422);
    expect(res.body.complete, 'the 422 body echoes complete:false').toBe(false);
    expect(res.body.missing, 'the 422 body carries the completeness checklist').toContain('NO_PRIMARY_RESULT_TYPE');

    // And the test really did NOT flip active (guard against a partial/optimistic activate).
    const after = await apiCall(page, `/tests/${id}/basic-info`, 'GET');
    expect(after.status).toBe(200);
    expect(after.body.active, 'the blocked test stays inactive').toBeFalsy();
  });
});
