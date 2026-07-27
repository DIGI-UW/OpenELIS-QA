/**
 * OpenELIS Global — Test↔Sample-Type Many-to-Many (Phase 1), live behavior.
 * Codifies what QA verified on testing build index-u12wW6QI.js (2026-07-24): the reworked
 * Basic Info exposes a `sampleTypeIds` array (multi-select). A test can associate MANY sample
 * types (shared config), round-trips, and once active appears under EACH specimen at order
 * entry. Domain is guarded by sample-type consistency (mismatch → 422).
 *
 * Contract-level (in-page window.fetch with CSRF, since the bare `request` fixture has no CSRF).
 * Runs under all-tc.config.ts (setup + storageState).
 *
 * Run: BASE=https://testing.openelis-global.org \
 *   npx playwright test --config=all-tc.config.ts test-catalog-mn-sampletypes.spec.ts
 */
import { test, expect, Page } from '@playwright/test';

const BASE = process.env.BASE || 'https://testing.openelis-global.org';
type ApiResult = { status: number; body: any };

async function api(page: Page, path: string, method: 'GET' | 'POST' | 'PUT' = 'GET', payload?: any): Promise<ApiResult> {
  return page.evaluate(async ({ path, method, payload }) => {
    const csrf = localStorage.getItem('CSRF') || '';
    const init: RequestInit = { method, headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, credentials: 'include' };
    if (method === 'POST' || method === 'PUT') init.body = JSON.stringify(payload ?? {});
    const r = await fetch('/api/OpenELIS-Global/rest' + path, init);
    let body: any; try { body = await r.json(); } catch { body = null; }
    return { status: r.status, body };
  }, { path, method, payload });
}

async function createTest(page: Page, domain = 'CLINICAL', sampleTypeId = '2'): Promise<string> {
  const stamp = Date.now().toString().slice(-8);
  const r = await api(page, '/test-catalog/tests', 'POST', {
    name: `QA_AUTO_MN_${stamp}`, reportingName: `QA_AUTO_MN_${stamp}`, code: `QAMN${stamp}`,
    domain, labUnitId: '56', sampleTypeId,
  });
  expect(r.status, 'create -> 201').toBe(201);
  return String(r.body.testId ?? r.body.id);
}

async function makeComplete(page: Page, id: string) {
  const sr = (await api(page, `/test-catalog/tests/${id}/sample-results`)).body;
  const pid = sr.components?.[0]?.id;
  const put = await api(page, `/test-catalog/tests/${id}/sample-results`, 'PUT', {
    testId: id, components: [{ id: pid, code: 'RESULT', label: 'Result', displayOrder: 0, isPrimary: true, showOnReport: true, allowMultipleReadings: false, resultType: 'N', significantDigits: 1, interpretations: [], options: [] }],
  });
  expect(put.status).toBe(200);
}

test.beforeEach(async ({ page }) => {
  await page.goto(`${BASE}/MasterListsPage/TestCatalogList?page=1&pageSize=25`);
  await page.waitForFunction(() => !!localStorage.getItem('CSRF'), null, { timeout: 15000 });
});

test.describe('Test Catalog — sample-type many-to-many (Phase 1, OGC-1145)', () => {
  test('MN-1: a test associates MANY sample types via sampleTypeIds and round-trips', async ({ page }) => {
    const id = await createTest(page);
    const bi0 = (await api(page, `/test-catalog/tests/${id}/basic-info`)).body;
    expect(bi0.sampleTypeIds, 'basic-info carries a sampleTypeIds array').toEqual(['2']);
    const add = await api(page, `/test-catalog/tests/${id}/basic-info`, 'PUT', { ...bi0, sampleTypeIds: ['2', '3'] });
    expect(add.status).toBe(200);
    const after = (await api(page, `/test-catalog/tests/${id}/basic-info`)).body;
    expect([...after.sampleTypeIds].sort(), 'both sample types persist').toEqual(['2', '3']);
    // remove back to one
    const rm = await api(page, `/test-catalog/tests/${id}/basic-info`, 'PUT', { ...after, sampleTypeIds: ['2'] });
    expect(rm.status).toBe(200);
    expect((await api(page, `/test-catalog/tests/${id}/basic-info`)).body.sampleTypeIds).toEqual(['2']);
  });

  test('MN-2: an activated multi-specimen test is orderable under EACH specimen', async ({ page }) => {
    const id = await createTest(page);
    const bi = (await api(page, `/test-catalog/tests/${id}/basic-info`)).body;
    await api(page, `/test-catalog/tests/${id}/basic-info`, 'PUT', { ...bi, sampleTypeIds: ['2', '3'] });
    await makeComplete(page, id);
    expect((await api(page, `/test-catalog/tests/${id}/activate`, 'POST', {})).status, 'activate -> 200').toBe(200);
    const underSerum = (await api(page, `/sample-type-tests?sampleType=2`)).body?.tests?.some((t: any) => String(t.id) === id);
    const underPlasma = (await api(page, `/sample-type-tests?sampleType=3`)).body?.tests?.some((t: any) => String(t.id) === id);
    const inTestList = (await api(page, `/test-list`)).body?.some?.((t: any) => String(t.id) === id);
    expect(underSerum, 'appears under Serum').toBe(true);
    expect(underPlasma, 'appears under Plasma').toBe(true);
    expect(inTestList, 'in the orderable index').toBe(true);
  });

  test('MN-3: domain is guarded by sample-type consistency (mismatch -> 422)', async ({ page }) => {
    // Testing is clinical-only (all sample types are legacy domain 'H'); a test cannot take an
    // ENVIRONMENTAL/VECTOR domain because no matching-domain sample type exists.
    const createEnv = await api(page, '/test-catalog/tests', 'POST', {
      name: `QA_AUTO_MN_ENV_${Date.now().toString().slice(-6)}`, code: `QAMNE${Date.now().toString().slice(-6)}`,
      domain: 'ENVIRONMENTAL', labUnitId: '56', sampleTypeId: '2',
    });
    expect(createEnv.status, 'create ENVIRONMENTAL test with a clinical sample type is rejected').toBe(422);
    // edit path: flipping a CLINICAL test's domain (keeping clinical sample types) is rejected
    const id = await createTest(page);
    const bi = (await api(page, `/test-catalog/tests/${id}/basic-info`)).body;
    const flip = await api(page, `/test-catalog/tests/${id}/basic-info`, 'PUT', { ...bi, domain: 'ENVIRONMENTAL' });
    expect(flip.status, 'domain flip with no matching-domain sample type is guarded').toBe(422);
    // control: a non-domain edit on the same test still saves
    const desc = await api(page, `/test-catalog/tests/${id}/basic-info`, 'PUT', { ...bi, description: 'mn3-control' });
    expect(desc.status, 'a non-domain Basic Info edit still persists').toBe(200);
  });
});
