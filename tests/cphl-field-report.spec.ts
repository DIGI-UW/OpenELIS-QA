/**
 * tests/cphl-field-report.spec.ts  (TC-CPHL)
 *
 * Guards and tripwires from the CPHL PNG field report of 8 Nov 2026 (JDHS Production),
 * reproduced on testing 9 Nov and filed on Casey's calls:
 *   - OGC-1620 Compliance Report offers a certificate before the results are validated.
 *   - OGC-1615 compliance grading: a RANGE result below the minimum is Borderline, and only the
 *     first threshold on a test is checked.
 *   - OGC-1613 removing a resulted test from an order is refused for a cancel reason the screen
 *     never asks for (fixed by #5006, guards since 10 Nov).
 *   - OGC-1614 the Results entry Method list offers inactive methods, in no order (fixed by
 *     #5007, guards since 10 Nov).
 *   - OGC-1616 date filters on the shipment pages and the Compliance Report ignore the site
 *     date format (fixed by 3b7fcf66, guards since 12 Nov, as are OGC-1615 and OGC-1620).
 *   - OGC-1619 lab number search and OGC-1617 results reports (guards from 12 Nov).
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
import { readPdf, isPdf } from '../helpers/report-pdf';

test.setTimeout(300_000);

const RANGE_TEST = 'QA CPHL FreeCl Range';
const MINMAX_TEST = 'QA CPHL FreeCl MinMax';
/** A third Surface Water test with no threshold in the standard (OGC-1617 AC 2). */
const PLAIN_TEST = 'QA CPHL Turbidity NoThreshold';
const STANDARD = 'QA CPHL Water Standard';
const SURFACE_WATER = 'Surface Water';

interface Seed { range: string; minmax: string; plain: string; standard: string; sampleType: string; site: { id: string; name: string; code: string } }
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
  const plain = await ensureEnvTest(page, PLAIN_TEST, 'QACPHLTRB', st);
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
  return { range, minmax, plain, standard: String(std.id), sampleType: st, site: { id: String(site.id), name: site.name, code: site.code } };
}

/* ------------------------------------------------------------------ orders */

/** An environmental order on Surface Water with the given tests, linked to the QA standard. */
async function envOrder(page: Page, testIds: string[], withStandard = true): Promise<string> {
  const labNo = (await j(page, `${API}/SampleEntryGenerateScanProvider`)).body?.body;
  expect(labNo, 'a lab number').toBeTruthy();
  const body: any = buildEnvOrderPayload({ labNo, date: ddMMyyyy(), sampleTypeId: seed.sampleType, testIds: testIds.join(','),
    samplingSiteId: seed.site.id, samplingSiteName: seed.site.name, samplingSiteCode: seed.site.code });
  if (withStandard) body.sampleOrderItems.environmentalFields.complianceStandards = JSON.stringify([seed.standard]);
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

/** The whole exported PDF, read to text. */
async function exportPdfText(page: Page, sampleId: number): Promise<{ status: number; text: string }> {
  const r = await page.evaluate(async ({ api, sampleId }) => {
    const res = await fetch(`${api}/complianceReport/exportPdf`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': localStorage.getItem('CSRF') || '' },
      body: JSON.stringify({ sampleId }) });
    const b = new Uint8Array(await res.arrayBuffer());
    let s = ''; for (const x of b) s += String.fromCharCode(x);
    return { status: res.status, b64: btoa(s) };
  }, { api: API, sampleId });
  const buf = Buffer.from(r.b64, 'base64');
  return { status: r.status, text: isPdf(buf) ? (await readPdf(buf)).text : '' };
}

/** Compliance Report screen: find the order by its lab number (OGC-1619) and return its row. */
async function screenRow(page: Page, labNo: string, typed = labNo) {
  await page.goto('/LaporanHasil', { waitUntil: 'domcontentloaded' });
  const lab = page.locator('#filter-lab-number');
  await expect(lab, 'Compliance Report lab number field').toBeVisible({ timeout: 20_000 });
  await lab.fill(typed);
  await page.locator('main').getByRole('button', { name: /^search$/i }).first().click({ timeout: 20_000 });
  const row = page.locator('tbody tr', { hasText: labNo }).first();
  await expect(row, `${labNo} listed on the Compliance Report`).toBeVisible({ timeout: 30_000 });
  return row;
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${process.env.QA_SHOTS ?? 'test-results/shots'}/${name}.png`, fullPage: true }).catch(() => undefined);
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
    // Was a tripwire for OGC-1620 (9 Nov, c470bd68, 260000JM: listed Compliant, Not Yet
    // Generated, and Generate PDF issued a certificate). Fixed by #5021; guard since 12 Nov.
    const labNo = await envOrder(page, [seed.range, seed.minmax]);
    expect(await enterOn(page, labNo, { [seed.range]: '0.3' }), 'one result entered').toBe(1);
    const row = await complianceRow(page, labNo);
    const offered = !!row && row.complianceStatus !== 'INELIGIBLE' && !/PENDING/i.test(String(row.complianceStatus));
    expect(offered, `${labNo} is not eligible while a result is unvalidated (status ${row?.complianceStatus ?? 'not listed'})`).toBe(false);
    if (row) {
      const pdf = await exportPdf(page, Number(row.sampleId));
      expect(pdf.head, 'exportPdf refuses an unvalidated order').not.toBe('%PDF-');
    }
    const ui = await screenRow(page, labNo);
    await expect(ui, 'the row says why').toContainText(/results not yet validated/i);
    await expect(ui.getByRole('button', { name: /generate pdf/i }), 'no Generate PDF').toHaveCount(0);
    await shot(page, 'ogc1620-unvalidated-row');
  });
});

/* ------------------------------------------------------------------ OGC-1615 */

test.describe('Compliance grading (OGC-1615)', () => {
  async function graded(page: Page, testId: string, value: string, ui?: RegExp): Promise<string> {
    const labNo = await envOrder(page, [testId]);
    expect(await enterOn(page, labNo, { [testId]: value }), 'one result entered').toBe(1);
    expect(await validateOnly(page, labNo), 'one result validated').toBe(1);
    const row = await complianceRow(page, labNo);
    expect(row, `${labNo} listed`).toBeTruthy();
    if (ui) {
      const r = await screenRow(page, labNo);
      await expect(r, `${labNo} grade on screen`).toContainText(ui);
      await shot(page, `ogc1615-${value}`);
    }
    return String(row.complianceStatus);
  }

  test('TC-CPHL-10: RANGE 0.2 to 5, a result of 6.0 is Non-compliant and 3.0 is Compliant', async ({ page }) => {
    expect(await graded(page, seed.range, '6.0'), '6.0 is above the range').toBe('NON_COMPLIANT');
    expect(await graded(page, seed.range, '3.0'), '3.0 is inside the range').toBe('COMPLIANT');
  });

  test('TC-CPHL-11: RANGE 0.2 to 5, a result of 0.1 (below the minimum) is Non-compliant', async ({ page }) => {
    // Was a tripwire for OGC-1615 (9 Nov, 260000GR: Borderline, from a 10% margin outside the
    // limits). Fixed by #5016; guard since 12 Nov, read on the screen too.
    expect(await graded(page, seed.range, '0.1', /non-compliant/i)).toBe('NON_COMPLIANT');
  });

  test('TC-CPHL-12: MINIMUM 0.2 plus MAXIMUM 5 on one test, a result of 7.0 is Non-compliant', async ({ page }) => {
    // Was a tripwire for OGC-1615 (9 Nov: Compliant, only the first threshold checked). Fixed by
    // #5016; guard since 12 Nov, read on the screen too.
    expect(await graded(page, seed.minmax, '7.0', /non-compliant/i)).toBe('NON_COMPLIANT');
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
    // The tick list renders before its state settles; untick until the box really is clear.
    const box = page.locator('main').getByRole('checkbox', { name: testName, exact: true });
    await expect(box, `${testName} is ticked`).toBeChecked({ timeout: 20_000 });
    await expect(async () => {
      if (await box.isChecked()) await page.locator('main label, main span', { hasText: new RegExp(`^${testName}$`) }).last().click();
      await expect(box).not.toBeChecked({ timeout: 2_000 });
    }, `${testName} unticked`).toPass({ timeout: 20_000 });
    await page.locator('main').getByRole('button', { name: /^Save$/ }).first().click();
    return saved;
  }

  test('TC-CPHL-20: removing a test with no result saves', async ({ page }) => {
    const labNo = await envOrder(page, [seed.range, seed.minmax]);
    const res = await untickAndSave(page, labNo, MINMAX_TEST);
    expect(res.status(), 'order save').toBe(200);
  });

  test('TC-CPHL-21: removing a resulted test asks for the reason, then cancels the test', async ({ page }) => {
    // Was a tripwire for OGC-1613 (400 fieldErrors cancelReason and no reason field, 9 Nov).
    // Fixed by #5006; guard since 10 Nov 2026 on testing cb17cfcb.
    const labNo = await envOrder(page, [seed.range, seed.minmax]);
    expect(await enterOn(page, labNo, { [seed.range]: '1.0' }), 'one result entered').toBe(1);
    const first = await untickAndSave(page, labNo, RANGE_TEST);
    expect(first.status(), 'the first save asks for a reason').toBe(400);
    const dialog = page.getByRole('dialog', { name: 'Remove a test that has results' });
    await expect(dialog, 'the reason dialog').toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/cancelReason/), 'no raw field name shown').toHaveCount(0);
    await dialog.getByRole('combobox', { name: 'Reason for cancelling' }).selectOption('Duplicate order');
    const resend = page.waitForResponse((r) => /\/rest\/SamplePatientEntry/.test(r.url()) && r.request().method() === 'POST', { timeout: 60_000 });
    await dialog.getByRole('button', { name: 'Remove test' }).click();
    const saved = await resend;
    expect(saved.status(), 'the save with the reason').toBe(200);
    expect(saved.request().postData() ?? '', 'the reason is sent').toContain('"cancelReason":"Duplicate order"');
    const left = (await j(page, `${API}/LogbookResults?labNumber=${labNo}`)).body?.testResult ?? [];
    const names = left.map((t: any) => String(t.testName));
    expect(names.some((n: string) => n.startsWith(RANGE_TEST)), 'the removed test leaves Results entry').toBe(false);
    expect(names.some((n: string) => n.startsWith(MINMAX_TEST)), 'the other test stays').toBe(true);
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

  test('TC-CPHL-31: the Method list offers the test\'s linked active methods, A to Z', async ({ page }) => {
    // Was a tripwire for OGC-1614 (whole dictionary in id order, inactive CULTURE included, 9 Nov).
    // Fixed by #5007; guard since 10 Nov 2026 on testing cb17cfcb. The row first shows the full
    // list and then the test's own methods, so the options are polled until they settle.
    const linked: any[] = (await j(page, `${API}/test/4/methods`)).body ?? [];
    const inactive: any[] = (await j(page, `${API}/displayList/METHODS_INACTIVE`)).body ?? [];
    const inactiveIds = new Set(inactive.map((m: any) => String(m.id)));
    const want = linked.filter((l: any) => !inactiveIds.has(String(l.methodId))).map((l: any) => String(l.methodName))
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    expect(want.length, 'Creatinine has an active linked method').toBeGreaterThan(0);
    await methodOptions(page);
    await expect.poll(async () => (await page.locator('select[id^="method-"]').first().locator('option').allInnerTexts())
      .map((t) => t.trim()).filter(Boolean), { timeout: 15_000, message: 'the linked active methods, A to Z' }).toEqual(want);
  });

  test('TC-CPHL-32: a test with no linked method is offered every active method, A to Z', async ({ page }) => {
    // OGC-1614 fallback, read from the endpoint the Results row uses.
    const all: any[] = (await j(page, `${API}/displayList/METHODS`)).body ?? [];
    const inactive: any[] = (await j(page, `${API}/displayList/METHODS_INACTIVE`)).body ?? [];
    const inactiveIds = new Set(inactive.map((m: any) => String(m.id)));
    expect((await j(page, `${API}/test/${seed.range}/methods`)).body ?? [], 'the seed test has no linked method').toEqual([]);
    const r = await j(page, `${API}/methods-for-test/${seed.range}`);
    expect(r.status, 'methods-for-test').toBe(200);
    const got = (r.body?.methods ?? []).map((m: any) => String(m.value));
    const want = all.filter((m: any) => !inactiveIds.has(String(m.id))).map((m: any) => String(m.value))
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    expect(got, 'every active method, A to Z').toEqual(want);
    expect(r.body?.defaultMethodId ?? null, 'no default without a link').toBeNull();
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
      // Was a tripwire for OGC-1616 (9 Nov, dd/MM/yyyy site: mm/dd/yyyy on the shipment pages,
      // yyyy-mm-dd on the Compliance Report). Fixed by 3b7fcf66; guard since 12 Nov.
      test.skip((await sitePlaceholder(page)) === 'mm/dd/yyyy', 'needs a site whose date format is not US');
      const want = await sitePlaceholder(page);
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      const input = page.locator(sel).first();
      await expect(input, `${path} date filter`).toBeVisible({ timeout: 20_000 });
      expect((await input.getAttribute('placeholder'))?.toLowerCase()).toBe(want);
    });
  }
});

/* ------------------------------------------------------- OGC-1616, 1619, 1617 (12 Nov) */

test.describe('Compliance Report search and results reports (OGC-1616, OGC-1619, OGC-1617)', () => {
  test('TC-CPHL-45: dates picked on a dd/MM/yyyy site filter the Compliance Report by those days', async ({ page }) => {
    // OGC-1616 beyond the placeholder: the picked days reach the server as the right days.
    // Picked from the calendar: a typed date is not always taken (lead of 12 Nov, see the
    // session doc), so this guard does not type.
    const cfg = (await j(page, `${API}/configuration-properties`)).body;
    test.skip(/^en[-_]US$/i.test(String(cfg?.DEFAULT_DATE_LOCALE ?? 'en-US')), 'needs a dd/MM/yyyy site');
    const today = new Date();
    test.skip(today.getDate() < 3, 'needs two earlier days in this month');
    const labNo = await envOrder(page, [seed.range]);
    expect(await enterOn(page, labNo, { [seed.range]: '3.0' }), 'one result entered').toBe(1);
    expect(await validateOnly(page, labNo), 'one result validated').toBe(1);
    const iso = (d: number) => `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dmy = (d: number) => `${String(d).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
    const pick = async (sel: string, d: number) => {
      await page.locator(sel).click();
      await page.locator('.flatpickr-calendar.open .flatpickr-day:not(.prevMonthDay):not(.nextMonthDay)', { hasText: new RegExp(`^${d}$`) }).first().click();
      await expect(page.locator(sel), `${sel} shows the day in the site format`).toHaveValue(dmy(d));
    };
    const search = async (from: number, to: number) => {
      await page.goto('/LaporanHasil', { waitUntil: 'networkidle' });
      await pick('#filter-date-from', from);
      await pick('#filter-date-to', to);
      await page.keyboard.press('Escape');
      const req = page.waitForRequest((r) => /\/rest\/complianceReport\?/.test(r.url()));
      await page.locator('main').getByRole('button', { name: /^search$/i }).first().click();
      const u = new URL((await req).url());
      expect(u.searchParams.get('dateFrom'), 'From sent as the picked day').toBe(iso(from));
      expect(u.searchParams.get('dateTo'), 'To sent as the picked day').toBe(iso(to));
      await page.waitForLoadState('networkidle').catch(() => undefined);
    };
    const d = today.getDate();
    await search(d - 1, d);
    await expect(page.locator('tbody tr', { hasText: labNo }).first(), `${labNo} listed`).toBeVisible({ timeout: 30_000 });
    await shot(page, 'ogc1616-compliance-dates');
    await search(d - 2, d - 1);
    await expect(page.locator('tbody tr', { hasText: labNo }), `${labNo} not listed before today`).toHaveCount(0);
  });

  test('TC-CPHL-60: the Compliance Report finds an order by its lab number, typed in lower case, with no dates', async ({ page }) => {
    const labNo = await envOrder(page, [seed.range]);
    expect(await enterOn(page, labNo, { [seed.range]: '3.0' }), 'one result entered').toBe(1);
    expect(await validateOnly(page, labNo), 'one result validated').toBe(1);
    const row = await screenRow(page, labNo, labNo.toLowerCase());
    await expect(row, 'graded').toContainText(/compliant/i);
    // Expanded rows hold their own tables; count the order rows (the ones with an expand button).
    await expect(page.locator('tbody tr').filter({ has: page.getByRole('button', { name: /expand current row/i }) }), 'only that order').toHaveCount(1);
    await shot(page, 'ogc1619-lab-number');
  });

  test('TC-CPHL-61: an unknown lab number says so', async ({ page }) => {
    await page.goto('/LaporanHasil', { waitUntil: 'domcontentloaded' });
    const lab = page.locator('#filter-lab-number');
    await expect(lab).toBeVisible({ timeout: 20_000 });
    await lab.fill('QAZZ99999');
    await page.locator('main').getByRole('button', { name: /^search$/i }).first().click();
    await expect(page.getByTestId('laporan-hasil-empty'), 'empty state').toContainText(/no environmental order with lab number QAZZ99999/i, { timeout: 30_000 });
  });

  test('TC-CPHL-63: an order with a standard prints every result; a test with no threshold has no guideline or status (OGC-1617 AC 2)', async ({ page }) => {
    const labNo = await envOrder(page, [seed.range, seed.plain]);
    expect(await enterOn(page, labNo, { [seed.range]: '3.0', [seed.plain]: '12.0' }), 'two results entered').toBe(2);
    expect(await validateOnly(page, labNo), 'two results validated').toBe(2);
    const api = await complianceRow(page, labNo);
    expect(api, `${labNo} listed`).toBeTruthy();
    console.log(`TC-CPHL-63 ${labNo} row: ${JSON.stringify(api).slice(0, 600)}`);
    expect(String(api.complianceStatus), 'graded on the assessed parameter only').toBe('COMPLIANT');
    const row = await screenRow(page, labNo);
    await expect(row, 'graded on screen').toContainText(/compliant/i);
    await expect(row.getByRole('button', { name: /generate pdf/i }), 'printable').toHaveCount(1);
    await shot(page, 'ogc1617-ac2-row');
    const pdf = await exportPdfText(page, Number(api.sampleId));
    expect(pdf.status, 'exportPdf').toBe(200);
    console.log(`TC-CPHL-63 ${labNo} PDF text:\n${pdf.text}`);
    expect(pdf.text, 'the assessed test prints').toContain(RANGE_TEST);
    // The name wraps in its cell ("QA CPHL Turbidity" / "NoThreshold"), so match its first words.
    const plainLines = pdf.text.split('\n').filter((l) => l.includes('QA CPHL Turbidity'));
    expect(plainLines.length, 'the test with no threshold prints in Results').toBeGreaterThan(0);
    expect(plainLines.some((l) => /\b12\.0\b/.test(l)), 'its result prints').toBe(true);
    expect(plainLines.join(' '), 'no guideline or status for the test with no threshold').not.toMatch(/mg\/L|non-?compliant|\bcompliant\b|borderline/i);
    expect(pdf.text, 'the conclusion covers only the assessed parameter').toMatch(/for the 1 parameter assessed/i);
  });

  test('TC-CPHL-64: a clinical lab number shows the not-found message and no rows (OGC-1619 AC 3)', async ({ page }) => {
    const o = await seedOrder(page, 'CPHLC', { testIds: ['4'] });
    await page.goto('/LaporanHasil', { waitUntil: 'domcontentloaded' });
    const lab = page.locator('#filter-lab-number');
    await expect(lab).toBeVisible({ timeout: 20_000 });
    await lab.fill(o.accession);
    await page.locator('main').getByRole('button', { name: /^search$/i }).first().click();
    await expect(page.getByTestId('laporan-hasil-empty'), 'empty state').toContainText(new RegExp(`no environmental order with lab number ${o.accession}`, 'i'), { timeout: 30_000 });
    await expect(page.locator('tbody tr').filter({ has: page.getByRole('button', { name: /expand current row/i }) }), 'no rows').toHaveCount(0);
    await shot(page, 'ogc1619-clinical-not-found');
  });

  test('TC-CPHL-62: a validated environmental order with no standard is listed as a results report and prints', async ({ page }) => {
    // OGC-1617: every validated environmental order prints a results report; no compliance
    // status or conclusion when no standard is linked.
    const labNo = await envOrder(page, [seed.range], false);
    expect(await enterOn(page, labNo, { [seed.range]: '3.0' }), 'one result entered').toBe(1);
    expect(await validateOnly(page, labNo), 'one result validated').toBe(1);
    const api = await complianceRow(page, labNo);
    expect(api, `${labNo} listed by the report endpoint`).toBeTruthy();
    expect(api.reportKind, 'results report').toBe('RESULTS');
    const row = await screenRow(page, labNo);
    await expect(row, 'compliance column').toContainText(/results report \(no standard\)/i);
    await row.locator('button').first().click();
    await expect(page.getByTestId('laporan-hasil-results-only'), 'expanded row explains it').toBeVisible({ timeout: 15_000 });
    await shot(page, 'ogc1617-results-report');
    const pdf = await exportPdf(page, Number(api.sampleId));
    expect(pdf.status, 'exportPdf').toBe(200);
    expect(pdf.head, 'a PDF').toBe('%PDF-');
  });
});

/* ------------------------------------------------------------------ OGC-1609 */

test.describe('Site Information: a translated setting saves (OGC-1609)', () => {
  // From Karen's CPHL field report of 28 Oct (JDHS): the banner could not be changed. Fixed by
  // #5003; guard since 10 Nov 2026 on testing cb17cfcb. The banner is put back through the same
  // record the screen reads, whatever the outcome.
  async function banner(page: Page): Promise<{ id: string; english: string; french: string }> {
    const list = (await j(page, `${API}/SiteInformationMenu`)).body;
    const rows: any[] = list?.menuList ?? list ?? [];
    const row = rows.find((r: any) => (r.elementName ?? r.name) === 'bannerHeading');
    expect(row, 'bannerHeading setting').toBeTruthy();
    const form = (await j(page, `${API}/SiteInformation?ID=${row.id}`)).body;
    return { id: String(row.id), english: form.localization.values.en.value, french: form.localization.values.fr.value };
  }

  test('TC-CPHL-50: changing the banner on Site Information saves, shows in the header and survives a reload', async ({ page }) => {
    const before = await banner(page);
    const english = `${before.english.replace(/ QA \d+$/, '')} QA ${Date.now() % 100000}`;
    try {
      await page.goto('/MasterListsPage/SiteInformationMenu', { waitUntil: 'domcontentloaded' });
      const row = page.locator('tr', { hasText: 'bannerHeading' });
      await expect(row, 'bannerHeading row').toBeVisible({ timeout: 30_000 });
      await row.locator('label').first().click();
      await page.getByRole('button', { name: 'Modify', exact: true }).click();
      const input = page.getByRole('textbox', { name: 'English' });
      await expect(input, 'English field holds the stored banner').toHaveValue(before.english, { timeout: 15_000 });
      await input.fill(english);
      const saved = page.waitForResponse((r) => /\/rest\/SiteInformation\?ID=/.test(r.url()) && r.request().method() === 'POST');
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      expect((await saved).status(), 'the save').toBe(200);
      await expect(page.getByText('Configuration Updated Successfully'), 'success message').toBeVisible({ timeout: 15_000 });
      if (process.env.QA_SHOTS) await page.screenshot({ path: `${process.env.QA_SHOTS}/tc-cphl-50-saved.png` });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.locator('header').getByText(english), 'header after reload').toBeVisible({ timeout: 30_000 });
      if (process.env.QA_SHOTS) await page.screenshot({ path: `${process.env.QA_SHOTS}/tc-cphl-50-reloaded.png` });
      expect((await banner(page)).english, 'stored value').toBe(english);
    } finally {
      const form = (await j(page, `${API}/SiteInformation?ID=${before.id}`)).body;
      form.localization.english = before.english;
      form.localization.french = before.french;
      const r = await j(page, `${API}/SiteInformation?ID=${before.id}`, { method: 'POST', body: form });
      expect(r.status, 'banner restored').toBe(200);
    }
  });
});
