/**
 * tests/cphl-field-report.spec.ts  (TC-CPHL)
 *
 * Guards and tripwires from the CPHL PNG field report of 8 Nov 2026 (JDHS Production),
 * reproduced on testing 9 Nov and filed on Casey's calls:
 *   - OGC-1620 Compliance Report offers a certificate before the results are validated.
 *   - OGC-1615 compliance grading: a RANGE result below the minimum is Borderline, and only the
 *     first threshold on a test is checked.
 *   - OGC-1613 removing a resulted test from an order is refused for a cancel reason the screen
 *     never asks for.
 *   - OGC-1614 the Results entry Method list offers inactive methods, in no order.
 *   - OGC-1616 date filters on the shipment pages and the Compliance Report ignore the site
 *     date format.
 *
 * Kind: a Guard passes today. A Tripwire asserts the intended behaviour and carries test.fail()
 * while develop differs; it goes red ("Expected to fail, but passed") the day the fix lands, and
 * then the marker comes out. Each tripwire has a guard over the same path, so a broken path
 * shows as a red guard, not as a silent expected failure.
 *
 * Seed (idempotent, created on first run, found after): environmental tests "QA CPHL FreeCl
 * Range" (RANGE 0.2 to 5 mg/L) and "QA CPHL FreeCl MinMax" (MINIMUM 0.2 and MAXIMUM 5 mg/L) on
 * Surface Water, and the standard "QA CPHL Water Standard". Every case creates its own orders.
 * Catalogue: cphl-field-report-test-cases.md. Config: cphl.config.ts.
 */
import { test, expect, Page } from '@playwright/test';
import { API, j, enterOn, validateOnly } from '../helpers/report-queue';
import { buildEnvOrderPayload, ddMMyyyy } from './chains/env-order-payload';
import { seedOrder } from '../helpers/data-factory';

test.setTimeout(300_000);

const RANGE_TEST = 'QA CPHL FreeCl Range';
const MINMAX_TEST = 'QA CPHL FreeCl MinMax';
const STANDARD = 'QA CPHL Water Standard';
const SURFACE_WATER = 'Surface Water';

interface Seed { range: string; minmax: string; standard: string; sampleType: string; site: { id: string; name: string; code: string } }
let seed: Seed;

/* ------------------------------------------------------------------ seed */

async function sampleTypeId(page: Page, name: string): Promise<string> {
  const spe = (await j(page, `${API}/SamplePatientEntry`)).body;
  const t = (spe?.sampleTypes ?? []).find((s: any) => String(s.value).trim() === name);
  expect(t, `sample type "${name}" exists`).toBeTruthy();
  return String(t.id);
}

async function environmentalLabUnit(page: Page): Promise<string> {
  const units = (await j(page, `${API}/test-catalog/lab-units`)).body;
  const rows: any[] = Array.isArray(units) ? units : units?.rows ?? [];
  const env = rows.find((u: any) => /environment|water/i.test(String(u.name ?? u.value ?? '')));
  // testing has no environmental unit; its QA CPHL tests sit in Biochemistry (56).
  return String(env?.id ?? rows.find((u: any) => /biochem/i.test(String(u.name)))?.id ?? '56');
}

async function ensureEnvTest(page: Page, name: string, code: string, st: string): Promise<string> {
  const list = (await j(page, `${API}/test-catalog/tests?search=${encodeURIComponent(name)}&size=10`)).body;
  // The catalog lists the test as "<name>(Surface Water)".
  const found = (list?.rows ?? []).find((r: any) => String(r.name ?? r.testName ?? '').startsWith(name));
  if (found) return String(found.id ?? found.testId);
  const c = await j(page, `${API}/test-catalog/tests`, { method: 'POST', body: {
    name, reportingName: name, code, description: `${name} (QA CPHL field report)`,
    domain: 'ENVIRONMENTAL', labUnitId: await environmentalLabUnit(page), sampleTypeId: st, sampleTypeIds: [st] } });
  expect([200, 201], `create ${name}: ${JSON.stringify(c.body).slice(0, 200)}`).toContain(c.status);
  const id = String(c.body.testId ?? c.body.id);
  const sr = (await j(page, `${API}/test-catalog/tests/${id}/sample-results`)).body;
  const p = sr?.components?.[0];
  const put = await j(page, `${API}/test-catalog/tests/${id}/sample-results`, { method: 'PUT', body: { testId: id, components: [{
    ...(p?.id ? { id: p.id } : {}), code: p?.code ?? 'PRIMARY', label: 'Result', displayOrder: 0, resultType: 'N', isPrimary: true,
    showOnReport: true, allowMultipleReadings: false, reportingDecimalPlaces: 2, interpretations: [], options: [] }] } });
  expect(put.status, `components for ${name}`).toBe(200);
  const comps = (await j(page, `${API}/test-catalog/tests/${id}/sample-results`)).body?.components ?? [];
  const rg = await j(page, `${API}/test-catalog/tests/${id}/ranges`, { method: 'PUT', body: { testId: id,
    ranges: [{ componentId: comps[0]?.id, gender: ' ', minAge: 0, maxAge: null, lowNormal: 0, highNormal: 100 }] } });
  expect(rg.status, `ranges for ${name}`).toBe(200);
  let a = await j(page, `${API}/test-catalog/tests/${id}/activate`, { method: 'POST', body: {} });
  if (a.status === 409) a = await j(page, `${API}/test-catalog/tests/${id}/activate`, { method: 'POST', body: { gapsAcknowledged: 'QA CPHL field report' } });
  expect(a.status, `activate ${name}`).toBe(200);
  return id;
}

async function ensureSeed(page: Page): Promise<Seed> {
  const st = await sampleTypeId(page, SURFACE_WATER);
  const range = await ensureEnvTest(page, RANGE_TEST, 'QACPHLFCR', st);
  const minmax = await ensureEnvTest(page, MINMAX_TEST, 'QACPHLFCM', st);
  const stds: any[] = (await j(page, `${API}/compliance/standards/active`)).body ?? [];
  let std = stds.find((s) => s.name === STANDARD);
  if (!std) {
    const c = await j(page, `${API}/compliance/standards`, { method: 'POST', body: { name: STANDARD, issuingBody: 'QA CPHL',
      regulationNumber: 'QA-CPHL-1', version: '2026', effectiveDate: '2026-01-01', countryRegion: 'QA PNG',
      sampleTypes: [SURFACE_WATER], status: 'ACTIVE', description: 'CPHL field report repro (QA)' } });
    expect([200, 201], `create standard: ${JSON.stringify(c.body).slice(0, 200)}`).toContain(c.status);
    std = c.body;
  }
  const groups = (await j(page, `${API}/compliance/standards/${std.id}/parameter-groups`)).body;
  let g = Array.isArray(groups) ? groups[0] : null;
  if (!g) {
    const c = await j(page, `${API}/compliance/standards/${std.id}/parameter-groups`, { method: 'POST', body: { name: 'QA CPHL Disinfection', sortOrder: 0, isMandatory: true } });
    expect([200, 201], 'create parameter group').toContain(c.status);
    g = c.body;
  }
  const threshold = async (testId: string, type: string, min: number | null, max: number | null) => {
    const have = (await j(page, `${API}/tests/${testId}/compliance-thresholds`)).body;
    if (Array.isArray(have) && have.some((h: any) => (h.thresholdType ?? h.type) === type)) return;
    const c = await j(page, `${API}/tests/${testId}/compliance-thresholds`, { method: 'POST', body: { group: { id: g.id },
      parameterCode: 'FREE_CL', displayName: 'Free chlorine', thresholdType: type, minValue: min, maxValue: max, units: 'mg/L' } });
    expect([200, 201], `threshold ${type} on ${testId}`).toContain(c.status);
  };
  await threshold(range, 'RANGE', 0.2, 5.0);
  await threshold(minmax, 'MINIMUM', 0.2, null);
  await threshold(minmax, 'MAXIMUM', null, 5.0);
  const sites: any[] = (await j(page, `${API}/admin/vector/sampling-sites`)).body ?? [];
  const site = sites.find((s) => s.active);
  expect(site, 'an active sampling site').toBeTruthy();
  return { range, minmax, standard: String(std.id), sampleType: st, site: { id: String(site.id), name: site.name, code: site.code } };
}

/* ------------------------------------------------------------------ orders */

/** An environmental order on Surface Water with the given tests, linked to the QA standard. */
async function envOrder(page: Page, testIds: string[]): Promise<string> {
  const labNo = (await j(page, `${API}/SampleEntryGenerateScanProvider`)).body?.body;
  expect(labNo, 'a lab number').toBeTruthy();
  const body: any = buildEnvOrderPayload({ labNo, date: ddMMyyyy(), sampleTypeId: seed.sampleType, testIds: testIds.join(','),
    samplingSiteId: seed.site.id, samplingSiteName: seed.site.name, samplingSiteCode: seed.site.code });
  body.sampleOrderItems.environmentalFields.complianceStandards = JSON.stringify([seed.standard]);
  const r = await j(page, `${API}/SamplePatientEntry`, { method: 'POST', body });
  expect(r.status, `environmental order ${labNo}: ${JSON.stringify(r.body).slice(0, 160)}`).toBe(200);
  return labNo;
}

async function complianceRow(page: Page, labNo: string): Promise<any | undefined> {
  const r = await j(page, `${API}/complianceReport`);
  expect(r.status, 'GET /rest/complianceReport').toBe(200);
  return (r.body?.orders ?? []).find((o: any) => o.labNumber === labNo);
}

async function exportPdf(page: Page, sampleId: number): Promise<{ status: number; type: string | null; head: string }> {
  return page.evaluate(async ({ api, sampleId }) => {
    const r = await fetch(`${api}/complianceReport/exportPdf`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': localStorage.getItem('CSRF') || '' },
      body: JSON.stringify({ sampleId }) });
    const b = new Uint8Array(await r.arrayBuffer());
    return { status: r.status, type: r.headers.get('content-type'), head: String.fromCharCode(...b.slice(0, 5)) };
  }, { api: API, sampleId });
}

/** Compliance Report screen: search this month and return the row for the lab number. */
async function screenRow(page: Page, labNo: string) {
  await page.goto('/LaporanHasil', { waitUntil: 'domcontentloaded' });
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const from = page.locator('#filter-date-from');
  const to = page.locator('#filter-date-to');
  await expect(from, 'Compliance Report date filters').toBeVisible({ timeout: 20_000 });
  await from.fill(`${ym}-01`); await from.press('Tab');
  await to.fill(`${ym}-28`); await to.press('Tab');
  // The open calendar covers the Search button: close it on the page heading first.
  await page.keyboard.press('Escape');
  await page.getByRole('heading', { name: /compliance report/i }).first().click();
  await page.locator('main').getByRole('button', { name: /^search$/i }).first().click({ timeout: 20_000 });
  const row = page.locator('tbody tr', { hasText: labNo }).first();
  await expect(row, `${labNo} listed on the Compliance Report`).toBeVisible({ timeout: 30_000 });
  return row;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  // Seeded once per run, in the first case's signed-in page.
  seed ??= await ensureSeed(page);
});

/* ------------------------------------------------------------------ OGC-1620 */

test.describe('Compliance Report eligibility (OGC-1620)', () => {
  test('TC-CPHL-01: a fully resulted, validated order is listed with its grade and its certificate is a PDF', async ({ page }) => {
    const labNo = await envOrder(page, [seed.range]);
    expect(await enterOn(page, labNo, { [seed.range]: '3.0' }), 'one result entered').toBe(1);
    expect(await validateOnly(page, labNo), 'one result validated').toBe(1);
    const row = await complianceRow(page, labNo);
    expect(row, `${labNo} listed`).toBeTruthy();
    expect(row.complianceStatus, 'graded').toBe('COMPLIANT');
    const ui = await screenRow(page, labNo);
    await expect(ui.getByRole('button', { name: /generate pdf/i }), 'Generate PDF offered').toBeVisible();
    const pdf = await exportPdf(page, Number(row.sampleId));
    expect(pdf.status, 'exportPdf').toBe(200);
    expect(pdf.head, 'a PDF').toBe('%PDF-');
  });

  test('TC-CPHL-02: an order with a saved but unvalidated result, and a test with no result, is not offered a certificate', async ({ page }) => {
    // TRIPWIRE OGC-1620. Observed 9 Nov 2026 on c470bd68 (260000JM): listed Compliant,
    // Not Yet Generated, and Generate PDF issued "CERTIFICATE OF TEST RESULTS".
    test.fail();
    const labNo = await envOrder(page, [seed.range, seed.minmax]);
    expect(await enterOn(page, labNo, { [seed.range]: '0.3' }), 'one result entered').toBe(1);
    const row = await complianceRow(page, labNo);
    const offered = !!row && row.complianceStatus !== 'INELIGIBLE' && !/PENDING/i.test(String(row.complianceStatus));
    expect(offered, `${labNo} is not eligible while a result is unvalidated (status ${row?.complianceStatus ?? 'not listed'})`).toBe(false);
    if (row) {
      const pdf = await exportPdf(page, Number(row.sampleId));
      expect(pdf.head, 'exportPdf refuses an unvalidated order').not.toBe('%PDF-');
    }
  });
});

/* ------------------------------------------------------------------ OGC-1615 */

test.describe('Compliance grading (OGC-1615)', () => {
  async function graded(page: Page, testId: string, value: string): Promise<string> {
    const labNo = await envOrder(page, [testId]);
    expect(await enterOn(page, labNo, { [testId]: value }), 'one result entered').toBe(1);
    expect(await validateOnly(page, labNo), 'one result validated').toBe(1);
    const row = await complianceRow(page, labNo);
    expect(row, `${labNo} listed`).toBeTruthy();
    return String(row.complianceStatus);
  }

  test('TC-CPHL-10: RANGE 0.2 to 5, a result of 6.0 is Non-compliant and 3.0 is Compliant', async ({ page }) => {
    expect(await graded(page, seed.range, '6.0'), '6.0 is above the range').toBe('NON_COMPLIANT');
    expect(await graded(page, seed.range, '3.0'), '3.0 is inside the range').toBe('COMPLIANT');
  });

  test('TC-CPHL-11: RANGE 0.2 to 5, a result of 0.1 (below the minimum) is Non-compliant', async ({ page }) => {
    // TRIPWIRE OGC-1615. Observed 9 Nov 2026 (260000GR): Borderline. The borderline margin is
    // 10% of the range width, applied outside the limits.
    test.fail();
    expect(await graded(page, seed.range, '0.1')).toBe('NON_COMPLIANT');
  });

  test('TC-CPHL-12: MINIMUM 0.2 plus MAXIMUM 5 on one test, a result of 7.0 is Non-compliant', async ({ page }) => {
    // TRIPWIRE OGC-1615. Observed 9 Nov 2026: Compliant, threshold shown ">= 0.2 mg/L";
    // only the first threshold on the test is checked.
    test.fail();
    expect(await graded(page, seed.minmax, '7.0')).toBe('NON_COMPLIANT');
  });

  test('TC-CPHL-13: MINIMUM 0.2 plus MAXIMUM 5 on one test, a result of 0.05 is Non-compliant', async ({ page }) => {
    // Guard over the same path as TC-CPHL-12: the first threshold (MINIMUM) is checked.
    expect(await graded(page, seed.minmax, '0.05')).toBe('NON_COMPLIANT');
  });
});

/* ------------------------------------------------------------------ OGC-1613 */

test.describe('Removing a test from an environmental order (OGC-1613)', () => {
  /** Environmental dashboard, Continue, Enter Order, Tests & Panels; untick the test; Save. */
  async function untickAndSave(page: Page, labNo: string, testName: string) {
    const saved = page.waitForResponse((r) => /\/rest\/SamplePatientEntry/.test(r.url()) && r.request().method() === 'POST', { timeout: 60_000 });
    await page.goto('/order/environmental', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');
    await page.locator('main input[type=search], main input[placeholder*="Search"]').first().fill(labNo);
    const dash = page.locator('tbody tr', { hasText: labNo }).first();
    await expect(dash, `${labNo} on the environmental dashboard`).toBeVisible({ timeout: 30_000 });
    await dash.getByRole('button', { name: /continue/i }).click();
    await page.waitForLoadState('networkidle');
    await page.locator('main').getByRole('button', { name: /^Enter Order/ }).first().click();
    await page.waitForLoadState('networkidle');
    await page.locator('main').getByRole('button', { name: /^Tests & Panels/ }).first().click();
    await page.locator('main label, main span', { hasText: new RegExp(`^${testName}$`) }).last().click();
    await page.locator('main').getByRole('button', { name: /^Save$/ }).first().click();
    return saved;
  }

  test('TC-CPHL-20: removing a test with no result saves', async ({ page }) => {
    const labNo = await envOrder(page, [seed.range, seed.minmax]);
    const res = await untickAndSave(page, labNo, MINMAX_TEST);
    expect(res.status(), 'order save').toBe(200);
  });

  test('TC-CPHL-21: removing a resulted test either asks for the reason or saves', async ({ page }) => {
    // TRIPWIRE OGC-1613. Observed 9 Nov 2026: 400 fieldErrors cancelReason, toast "cancelReason:
    // A reason is required to cancel this test.", and no reason field on the page.
    test.fail();
    const labNo = await envOrder(page, [seed.range, seed.minmax]);
    expect(await enterOn(page, labNo, { [seed.range]: '1.0' }), 'one result entered').toBe(1);
    const res = await untickAndSave(page, labNo, RANGE_TEST);
    const reasonField = page.locator('main, [role=dialog]').getByLabel(/reason/i);
    const asked = await reasonField.first().isVisible().catch(() => false);
    expect(res.status() === 200 || asked, `saved (${res.status()}) or a reason is asked for`).toBe(true);
    await expect(page.getByText(/cancelReason/), 'no raw field name shown').toHaveCount(0);
  });
});

/* ------------------------------------------------------------------ OGC-1614 */

test.describe('Results entry Method list (OGC-1614)', () => {
  async function methodOptions(page: Page): Promise<string[]> {
    const o = await seedOrder(page, 'CPHLM', { testIds: ['4'] });
    await page.goto(`/Results?accessionNumber=${o.accession}`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');
    const row = page.locator('tbody tr', { hasText: /cr[eé]atinine/i }).first();
    await expect(row, 'Creatinine row on Results entry').toBeVisible({ timeout: 30_000 });
    await row.locator('button').first().click();
    const sel = page.locator('select[id^="method-"]').first();
    await expect(sel, 'Method select').toBeVisible({ timeout: 15_000 });
    return (await sel.locator('option').allInnerTexts()).map((t) => t.trim()).filter((t) => t && !/^(select|--|choose)/i.test(t));
  }

  test('TC-CPHL-30: the Method list on Results entry offers methods', async ({ page }) => {
    const opts = await methodOptions(page);
    expect(opts.length, 'at least one method').toBeGreaterThan(0);
  });

  test('TC-CPHL-31: the Method list offers only active methods, A to Z', async ({ page }) => {
    // TRIPWIRE OGC-1614. Observed 9 Nov 2026: the whole method dictionary in id order, inactive
    // CULTURE included.
    test.fail();
    const inactive: any[] = (await j(page, `${API}/displayList/METHODS_INACTIVE`)).body ?? [];
    const inactiveNames = new Set(inactive.map((m: any) => String(m.value ?? m.name).trim()));
    const opts = await methodOptions(page);
    expect(opts.filter((o) => inactiveNames.has(o)), 'no inactive method offered').toEqual([]);
    expect(opts, 'A to Z').toEqual([...opts].sort((a, b) => a.localeCompare(b)));
  });
});

/* ------------------------------------------------------------------ OGC-1616 */

test.describe('Date filters follow the site date format (OGC-1616)', () => {
  async function sitePlaceholder(page: Page): Promise<string> {
    const cfg = (await j(page, `${API}/configuration-properties`)).body;
    const locale = String(cfg?.DEFAULT_DATE_LOCALE ?? 'en-US');
    return /^en[-_]US$/i.test(locale) ? 'mm/dd/yyyy' : 'dd/mm/yyyy';
  }

  test('TC-CPHL-40: Validation date filters show the site format', async ({ page }) => {
    const want = await sitePlaceholder(page);
    await page.goto('/AccessionValidation', { waitUntil: 'domcontentloaded' });
    const from = page.locator('#validationFromDate');
    await expect(from, 'Validation From').toBeVisible({ timeout: 20_000 });
    expect((await from.getAttribute('placeholder'))?.toLowerCase()).toBe(want);
  });

  const pages: Array<[string, string, string]> = [
    ['TC-CPHL-41', '/SampleShipment', '#date-from'],
    ['TC-CPHL-42', '/SampleShipment/reports', '#report-date-from'],
    ['TC-CPHL-43', '/SampleShipment/reference-lab-results', '#date-from'],
    ['TC-CPHL-44', '/LaporanHasil', '#filter-date-from'],
  ];
  for (const [id, path, sel] of pages) {
    test(`${id}: ${path} date filter shows the site format`, async ({ page }) => {
      // TRIPWIRE OGC-1616. Observed 9 Nov 2026 on a dd/MM/yyyy site: mm/dd/yyyy on the shipment
      // pages, yyyy-mm-dd on the Compliance Report.
      test.skip((await sitePlaceholder(page)) === 'mm/dd/yyyy', 'needs a site whose date format is not US');
      test.fail();
      const want = await sitePlaceholder(page);
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      const input = page.locator(sel).first();
      await expect(input, `${path} date filter`).toBeVisible({ timeout: 20_000 });
      expect((await input.getAttribute('placeholder'))?.toLowerCase()).toBe(want);
    });
  }
});
