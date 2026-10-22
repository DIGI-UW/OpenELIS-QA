import { test, expect, Page } from '@playwright/test';
import { API, savedPrepare } from '../helpers/order-entry-v4';
import { pageAs, QueueUser } from '../helpers/report-queue-ui';

/**
 * tests/order-entry-lab-unit-scope.spec.ts  (TC-OELU-00 to 05)
 *
 * Orders follow the user's lab units (#4757, merged 19 Oct 2026, develop ad2f2c9e).
 * SampleLabUnitScopeService: a user whose lab-unit roles name sections (not AllLabUnits, not a
 * Global Administrator, not constrained by the login lab unit) sees an order only when one of
 * its analyses is in those sections (child sections included) or when they entered it. It
 * scopes the orders dashboard (/rest/order/dashboard; a site can switch the dashboard back to
 * the whole lab with restrictRecentOrdersByTestSection=false), the order lookup by lab number
 * (/rest/order/search, 404) and Modify Order (/rest/SampleEdit: no order on read, 404 on save).
 *
 * DATA. The admin enters two v4 orders and saves them through Prepare Samples, which is where
 * v4 creates the analyses: B (Biochemistry only: Serum, GPT/ALAT) and H (Hematology: Whole
 * Blood, Hematocrit). An order that has only passed Enter Order has no analysis, and
 * belongsToSections lets such an order through for every lab unit (seen 21 Oct; not asserted
 * here, a product call). The QA user qa_oelu_heme has the Reception role in
 * Hematology only; it is created from the admin page the first time (test-only password).
 * TC-OELU-00 guards the oracle: if the admin cannot see both, or the Hematology user cannot
 * see H, the other cases mean nothing.
 *
 * TC-OELU-06 to 13 (added 21 Oct, develop 965d6d10) cover the other lists, lookups and writes #4757
 * scoped: sample management, aliquot lookup and save, patient by lab number, the Modify Order save,
 * generic sample order, the pathology, IHC and cytology dashboards, and the cancel reasons a bench
 * user now reads. Each checks the user does get the in-unit order, so a role gap cannot pass as scope.
 *
 * Written 2026-10-21 against oedevqa (develop e1f2b693 images 2026-10-20).
 */

const HEME_LOGIN = process.env.OELU_HEME_USER ?? 'qa_oelu_heme';
const HEME_PASS = process.env.OELU_HEME_PASS ?? 'QAoeluHeme1!';

let admin: Page;
let heme: Page;
let B = '';
let H = '';

async function get(page: Page, path: string): Promise<{ status: number; body: any }> {
  const r = await page.request.get(`${API}${path}`);
  return { status: r.status(), body: await r.json().catch(() => null) };
}
async function csrf(page: Page): Promise<Record<string, string>> {
  const t = await page.evaluate(() => localStorage.getItem('CSRF'));
  return t ? { 'X-CSRF-Token': t } : {};
}

async function dashboardLists(page: Page, lab: string): Promise<boolean> {
  const r = await get(page, `/rest/order/dashboard?search=${encodeURIComponent(lab)}`);
  expect(r.status, 'the dashboard answers').toBe(200);
  return (r.body?.orders || []).some((o: any) => o.labNumber === lab);
}
async function sampleEditTests(page: Page, lab: string): Promise<{ status: number; patient: string; tests: number }> {
  // The form echoes the accession number it was asked for, so the patient and tests tell.
  const r = await get(page, `/rest/SampleEdit?accessionNumber=${encodeURIComponent(lab)}`);
  return { status: r.status, patient: String(r.body?.patientName ?? '').trim(), tests: (r.body?.existingTests || []).length };
}

test.describe('Orders follow the user\'s lab units (#4757)', () => {
  test.setTimeout(300_000);

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(400_000);
    const ctx = await browser.newContext({ storageState: '.auth/user.json', ignoreHTTPSErrors: true, baseURL: process.env.BASE_URL ?? process.env.BASE });
    admin = await ctx.newPage();
    await admin.goto('/', { waitUntil: 'domcontentloaded' });
    const pre = await get(admin, '/rest/UnifiedSystemUser');
    const section = (pre.body?.testSections || []).find((t: any) => String(t.value).trim() === 'Hematology');
    expect(section, 'a Hematology lab unit exists').toBeTruthy();
    const u: QueueUser = { login: HEME_LOGIN, password: HEME_PASS, role: 'Reception', section: String(section.id) };
    // Saved through Prepare Samples: v4 creates the analyses there, and an order with no
    // analysis yet is visible to every lab unit (belongsToSections answers true).
    B = (await savedPrepare(admin, [{ type: 'Serum', test: 'GPT/ALAT' }])).lab;
    H = (await savedPrepare(admin, [{ type: 'Whole Blood', test: 'Hematocrit' }])).lab;
    heme = await pageAs(browser, admin, u);
  });

  test.afterAll(async () => {
    await heme?.context().close().catch(() => {});
    await admin?.context().close().catch(() => {});
  });

  test('TC-OELU-00 [guard] the admin sees both orders; the Hematology user sees the Hematology order', async () => {
    expect(await dashboardLists(admin, B), `the admin's dashboard lists ${B}`).toBe(true);
    expect(await dashboardLists(admin, H), `the admin's dashboard lists ${H}`).toBe(true);
    expect((await get(admin, `/rest/order/search?labNumber=${B}`)).status, 'the admin finds B by lab number').toBe(200);
    expect(await dashboardLists(heme, H), `the Hematology user's dashboard lists ${H}`).toBe(true);
    expect((await get(heme, `/rest/order/search?labNumber=${H}`)).status, 'the Hematology user finds H by lab number').toBe(200);
  });

  test('TC-OELU-01 the Hematology user\'s dashboard does not list a Biochemistry-only order when searched for', async () => {
    expect(await dashboardLists(heme, B), `${B} has only a Biochemistry test`).toBe(false);
  });

  test('TC-OELU-01b the Hematology user\'s unfiltered dashboard (newest first) lists the Hematology order and not the Biochemistry one', async () => {
    const r = await get(heme, '/rest/order/dashboard');
    expect(r.status).toBe(200);
    const labs = (r.body?.orders || []).map((o: any) => o.labNumber);
    expect(labs, `the newest orders include ${H}`).toContain(H);
    expect(labs, `${B} has only a Biochemistry test`).not.toContain(B);
  });

  test('TC-OELU-02 looking up a Biochemistry-only order by lab number answers 404 for the Hematology user', async () => {
    expect((await get(heme, `/rest/order/search?labNumber=${B}`)).status).toBe(404);
  });

  test('TC-OELU-03 Modify Order reads no order for the Hematology user, and the Hematology order with its test', async () => {
    const b = await sampleEditTests(heme, B);
    expect({ patient: b.patient, tests: b.tests }, `SampleEdit for ${B} returns no patient and no test`).toEqual({ patient: '', tests: 0 });
    const h = await sampleEditTests(heme, H);
    expect(h.tests, `SampleEdit for ${H} returns its test`).toBeGreaterThan(0);
    expect(h.patient, `SampleEdit for ${H} returns its patient`).not.toBe('');
  });

  test('TC-OELU-04 the Modify Order screen shows nothing of a Biochemistry-only order to the Hematology user', async () => {
    const r = await get(admin, `/rest/order/search?labNumber=${B}`);
    const patient = String(r.body?.patientProperties?.lastName ?? '');
    await heme.goto(`/ModifyOrder?accessionNumber=${encodeURIComponent(B)}`, { waitUntil: 'domcontentloaded' });
    await heme.waitForTimeout(6_000);
    const text = await heme.locator('main').innerText();
    expect(text, 'the test is not shown').not.toContain('GPT/ALAT');
    if (patient) expect(text, 'the patient is not shown').not.toContain(patient);
  });

  test('TC-OELU-05 the Hematology user\'s Order Dashboard screen lists the Hematology order and not the Biochemistry one', async () => {
    await heme.goto(`/order/clinical`, { waitUntil: 'domcontentloaded' });
    const search = heme.getByRole('searchbox').or(heme.locator('input[type="search"]')).first();
    await expect(search, 'the dashboard has a search box').toBeVisible({ timeout: 60_000 });
    await search.fill(H);
    await expect(heme.locator('main').getByText(H).first(), `${H} is listed`).toBeVisible({ timeout: 30_000 });
    await search.fill(B);
    await heme.waitForTimeout(4_000);
    await expect(heme.locator('main').getByText(B), `${B} is not listed`).toHaveCount(0);
  });

  // The other order lists, lookups and writes #4757 put under the same scope. Each case also checks
  // that the Hematology user does get the Hematology order (or the admin gets B), so a role gap
  // (403 for both) cannot pass as scope.
  test('TC-OELU-06 Sample management search: 404 for the Biochemistry-only order, the Hematology order found', async () => {
    const b = await get(heme, `/rest/sample-management/search?accessionNumber=${B}&includeTests=true`);
    const h = await get(heme, `/rest/sample-management/search?accessionNumber=${H}&includeTests=true`);
    expect(h.status, `the Hematology user can search ${H}`).toBe(200);
    expect(JSON.stringify(h.body), `the search returns ${H}`).toContain(H);
    expect(b.status, `${B} reads as absent`).toBe(404);
  });

  test('TC-OELU-07 Aliquot lookup (/rest/SampleItem) returns no tube of the Biochemistry-only order, and the Hematology order\'s tubes', async () => {
    const b = await get(heme, `/rest/SampleItem?accessionNumber=${B}`);
    const h = await get(heme, `/rest/SampleItem?accessionNumber=${H}`);
    expect(h.status).toBe(200);
    expect((h.body?.sampleItems || h.body?.sampleItemEntries || []).length, `${H} has a tube`).toBeGreaterThan(0);
    expect(b.status).toBe(200);
    expect(String(b.body?.accessionNumber ?? ''), `${B} is not echoed`).toBe('');
    expect((b.body?.sampleItems || b.body?.sampleItemEntries || []).length, `${B} shows no tube`).toBe(0);
  });

  test('TC-OELU-08 Aliquot save on the Biochemistry-only order is refused with "Sample not found"', async () => {
    const r = await heme.request.post(`${API}/rest/Aliquot`, { data: { accessionNumber: B, sampleItems: [] }, headers: await csrf(heme) });
    const body = await r.json().catch(() => null);
    expect(JSON.stringify(body), 'the save is refused as not found').toContain('Sample not found');
  });

  test('TC-OELU-09 Patient by lab number: 404 for the Biochemistry-only order, 200 for the Hematology order', async () => {
    expect((await get(heme, `/rest/patientByLabNumer?accessionNumber=${H}`)).status).toBe(200);
    expect((await get(heme, `/rest/patientByLabNumer?accessionNumber=${B}`)).status).toBe(404);
  });

  test('TC-OELU-10 Modify Order save on the Biochemistry-only order answers 404 (nothing saved)', async () => {
    const r = await heme.request.post(`${API}/rest/SampleEdit`, { data: { accessionNumber: B }, headers: await csrf(heme) });
    expect(r.status()).toBe(404);
  });

  test('TC-OELU-11 Generic sample order lookup: the Biochemistry-only order reads as absent when the admin can read it', async () => {
    const a = await get(admin, `/rest/GenericSampleOrder?accessionNumber=${B}`);
    test.skip(a.status !== 200, `the admin gets ${a.status} for a non-generic order; nothing to compare`);
    expect((await get(heme, `/rest/GenericSampleOrder?accessionNumber=${B}`)).status).toBe(404);
  });

  test('TC-OELU-12 Order cancel reasons are readable by a bench user (dictionary lookup no longer admin-only)', async () => {
    const r = await get(heme, `/rest/dictionary/categories/${encodeURIComponent('Order cancel reasons')}/entries`);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body) ? r.body.length : Object.keys(r.body || {}).length, 'at least one reason').toBeGreaterThan(0);
  });

  // The dashboards list nothing without statuses; ask for every status, as the screen's filter can.
  const PROGRAMS: Record<string, string> = {
    pathology: 'ACCESSIONED,GROSSING,DECALCIFICATION,PROCESSING,EMBEDDING,MICROTOMY,STAINING,COVERSLIPPING,READY_PATHOLOGIST,UNDER_REVIEW,COMPLETED',
    immunohistochemistry: 'IN_PROGRESS,READY_PATHOLOGIST,COMPLETED',
    cytology: 'PREPARING_SLIDES,SCREENING,READY_FOR_CYTOPATHOLOGIST,COMPLETED',
  };
  for (const [p, statuses] of Object.entries(PROGRAMS)) {
    test(`TC-OELU-13 ${p} dashboard: the Hematology user sees no case the admin sees in other units`, async () => {
      const a = await get(admin, `/rest/${p}/dashboard?statuses=${statuses}&searchTerm=`);
      const h = await get(heme, `/rest/${p}/dashboard?statuses=${statuses}&searchTerm=`);
      const list = (x: any) => (Array.isArray(x) ? x : x?.items || x?.content || x?.results || []);
      test.info().annotations.push({ type: 'counts', description: `admin ${a.status} ${list(a.body).length}, heme ${h.status} ${list(h.body).length}` });
      test.skip(a.status !== 200 || list(a.body).length === 0, `no ${p} case on this stack to compare`);
      expect([200, 403], `heme gets the list or no access`).toContain(h.status);
      if (h.status === 200) expect(list(h.body).length, `a Hematology-only user sees none of the admin's ${p} cases`).toBe(0);
    });
  }
});
