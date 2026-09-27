/**
 * tests/data-export-saved-reports.spec.ts
 *
 * OGC-483 (Saved export configurations) and OGC-481 (My Report Queue), both in
 * Acceptance on testing 3.2.3.0. Written 2026-09-27 from a hand walk-through in
 * Chrome (QA comments 37690 and 37691 on those tickets).
 *
 * Coverage before this file: data-export.spec.ts asserts that report PAGES render.
 * Nothing exercised the saved-report library or the job queue, so the three AC
 * misses below shipped to Acceptance unseen.
 *
 * Contract: seed through the same REST calls the builder sends (captured off the
 * wire), read back through REST, clean up everything created. `test.fail()` cases
 * are FLIP-WHEN-FIXED tripwires that assert the AC; each has a canary over the
 * same path so a changed endpoint cannot pass as a still-present defect.
 *
 * Captured 2026-09-27 (Chrome, testing 3.2.3.0):
 *   POST /rest/reports/data-export/saved-configs
 *     {"name","definition":{"schemaVersion":1,"reportType":"SAMPLE_TESTING",
 *      "layout":"SPREADSHEET","selectedVariables":[...],"filters":{...}}}  -> 201 {id,version,...}
 *   GET  /rest/reports/data-export/saved-configs -> {reports:[...],hasMore,page}
 *   DELETE /rest/reports/data-export/saved-configs/{id}?expectedVersion=<version> -> 204
 *   POST /rest/reports/data-export/jobs -> 202 {id,state:"QUEUED"}; GET .../jobs/{id} -> state READY
 */
import { test, expect, Page } from '@playwright/test';

const BASE = process.env.BASE_URL || process.env.BASE || 'https://testing.openelis-global.org';
const API = '/api/OpenELIS-Global/rest';
const SAVED = `${API}/reports/data-export/saved-configs`;
const TAG = `QA_AUTO_DXS_${Date.now()}`;

interface Res<T = unknown> { status: number; body: T }
interface SavedReport { id: string; name: string; version: string; definition?: { selectedVariables?: string[]; filters?: Record<string, unknown> } }

async function call<T = unknown>(page: Page, path: string, method = 'GET', body?: unknown): Promise<Res<T>> {
  return page.evaluate(async ({ path, method, body }) => {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (method !== 'GET') headers['X-CSRF-Token'] = localStorage.getItem('CSRF') || '';
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const r = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const t = await r.text();
    let parsed: unknown = t;
    try { parsed = JSON.parse(t); } catch { /* keep text */ }
    return { status: r.status, body: parsed as never };
  }, { path, method, body } as never);
}

function definition(vars: string[]) {
  return {
    schemaVersion: 1, reportType: 'SAMPLE_TESTING', layout: 'SPREADSHEET',
    selectedVariables: vars,
    filters: { labSectionIds: [], testIds: [], resultStatuses: ['FINALIZED'] },
  };
}

async function listAll(page: Page): Promise<SavedReport[]> {
  const r = await call<{ reports?: SavedReport[] }>(page, SAVED);
  expect(r.status, 'saved-configs list answers').toBe(200);
  return r.body.reports ?? [];
}

async function create(page: Page, name: string, vars = ['orderToCollectionMinutes', 'accessionNumber']): Promise<Res<SavedReport>> {
  return call<SavedReport>(page, SAVED, 'POST', { name, definition: definition(vars) });
}

async function cleanup(page: Page) {
  // Everything this file creates carries TAG. Deletes need the optimistic-lock version.
  for (let pass = 0; pass < 3; pass++) {
    const mine = (await listAll(page)).filter(r => r.name.includes(TAG));
    if (!mine.length) return;
    for (const r of mine) {
      await call(page, `${SAVED}/${encodeURIComponent(r.id)}?expectedVersion=${encodeURIComponent(r.version)}`, 'DELETE');
    }
  }
}


/** Build a small Sample & Testing export in the UI and press Generate CSV. Returns the job. */
async function generateFromBuilder(page: Page): Promise<{ id: string }> {
    await page.goto(`${BASE}/reports/custom-data-export?view=builder&step=columns&layout=SPREADSHEET&type=SAMPLE_TESTING`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Expand all' }).click();
    await page.getByRole('button', { name: 'Add all shown' }).first().click();
    await page.getByRole('button', { name: /Next: Set Filters/ }).click();
    const today = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const from = new Date(today.getTime() - 6 * 86400000);
    await page.locator('#reporting-from').fill(iso(from));
    await page.locator('#reporting-to').fill(iso(today));
    await page.getByRole('button', { name: /Next: Review/ }).click();
    const jobResp = page.waitForResponse(r => r.url().includes('/reports/data-export/jobs') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Generate CSV' }).click();
    return await (await jobResp).json() as { id: string };
}

test.describe.configure({ mode: 'serial' });

test.describe('Custom Data Export: saved reports (OGC-483) and queue (OGC-481)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    expect(page.url(), 'session is authenticated').not.toContain('/login');
  });

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await cleanup(page);
    await page.close();
  });

  test('TC-DXS-01: a saved report keeps column order and never stores a date range', async ({ page }) => {
    // Canary for DXS-02/03 and a permanent truth from the AC.
    const vars = ['collectionToReceivedMinutes', 'accessionNumber', 'orderToCollectionMinutes'];
    const r = await create(page, `${TAG} order`, vars);
    expect(r.status, 'create answers 201').toBe(201);
    const back = (await listAll(page)).find(x => x.id === r.body.id);
    expect(back, 'the created report is listed').toBeTruthy();
    expect(back!.definition?.selectedVariables, 'column order is preserved exactly').toEqual(vars);
    const filterKeys = Object.keys(back!.definition?.filters ?? {});
    expect(filterKeys.filter(k => /date/i.test(k)), 'no date keys are stored in the saved filters').toEqual([]);
  });

  test('TC-DXS-02: saving a second report under an existing name is refused or needs confirmation', async ({ page }) => {
    // FLIP-WHEN-FIXED. AC: "Saving with a duplicate name shows a confirmation dialog asking
    // whether to overwrite; existing config not overwritten without confirmation."
    // Observed 2026-09-27: "Save a copy" renamed to an existing name POSTed straight away
    // (201) and the library then listed two reports with the same name.
    test.fail();
    const name = `${TAG} dup`;
    const first = await create(page, name);
    expect(first.status, 'first save answers 201 (canary)').toBe(201);
    const second = await create(page, name);
    expect(second.status, 'a duplicate name must be refused (4xx) so the UI can ask to overwrite').toBeGreaterThanOrEqual(400);
  });

  test('TC-DXS-03: the library refuses more than 20 saved reports', async ({ page }) => {
    // FLIP-WHEN-FIXED. AC: "Saving a 21st configuration shows error InlineNotification
    // (error.dataExport.configLimitExceeded)" and "enforced server-side (HTTP 422)".
    // Observed 2026-09-27: a 21st report saved from the UI with 201.
    test.fail();
    const existing = (await listAll(page)).length;
    const room = Math.max(0, 20 - existing);
    for (let i = 0; i < room; i++) {
      const r = await create(page, `${TAG} fill ${i}`);
      expect(r.status, `fill report ${i} saves while under the limit`).toBe(201);
    }
    const over = await create(page, `${TAG} over`);
    expect(over.status, 'the 21st save must be refused with 422').toBe(422);
  });

  test('TC-DXS-04: delete requires the optimistic-lock version', async ({ page }) => {
    // Permanent truth, captured from the UI's own Delete (expectedVersion query param).
    const r = await create(page, `${TAG} del`);
    expect(r.status).toBe(201);
    const bare = await call(page, `${SAVED}/${encodeURIComponent(r.body.id)}`, 'DELETE');
    expect(bare.status, 'delete without expectedVersion is rejected').toBe(400);
    const ok = await call(page, `${SAVED}/${encodeURIComponent(r.body.id)}?expectedVersion=${encodeURIComponent(r.body.version)}`, 'DELETE');
    expect(ok.status, 'delete with the version succeeds').toBe(204);
    expect((await listAll(page)).some(x => x.id === r.body.id), 'deleted report is gone').toBe(false);
  });

  test('TC-DXS-05: the Review step shows the job as ready once the server says READY', async ({ page }) => {
    // FLIP-WHEN-FIXED (OGC-481). Observed 2026-09-27: after Generate CSV the Review step
    // polled the job once (QUEUED) and never again; 50 s later the job was READY in
    // My Report Queue while Review still said "Queued" with no download.
    test.fail();
    const job = await generateFromBuilder(page);
    // Wait until the server says READY (poll the API ourselves), then give the page a
    // generous window to catch up.
    await expect.poll(async () => (await call<{ state?: string }>(page, `${API}/reports/data-export/jobs/${job.id}`)).body.state,
      { timeout: 60_000, message: 'the export job completes on the server' }).toBe('READY');
    // The page copy itself says "Download it here when ready", so match the status label,
    // not any occurrence of the word: the job's own status cell must stop saying Queued.
    await expect(page.getByText(/^Queued$/), 'Review step no longer shows the job as Queued').toHaveCount(0, { timeout: 20_000 });
  });

  test('TC-DXS-06: after Generate CSV the Review step shows the job status as Queued', async ({ page }) => {
    // Canary for DXS-05: proves the status label and its selector exist, so DXS-05 cannot
    // "fail as expected" merely because the label moved.
    await generateFromBuilder(page);
    await expect(page.getByText(/^Queued$/), 'Review step shows a Queued status label').toHaveCount(1, { timeout: 10_000 });
  });
});
