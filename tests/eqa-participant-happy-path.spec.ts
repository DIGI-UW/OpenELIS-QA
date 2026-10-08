/**
 * tests/eqa-participant-happy-path.spec.ts
 *
 * EQA V2, the participating lab's happy path on the screens a lab uses (QA > EQA > My Cycles):
 *
 *   New cycle (for a scheme the lab is enrolled in)  -> listed Planned
 *   Receive panel -> Add Order with the EQA box ticked, programme and cycle pre-selected
 *   EQA sample ordered (provider sample id, temperature, panel intact) -> the cycle lists it
 *   result entered and validated in the standard pipeline -> the cycle advances to Submitted
 *   provider scores imported as CSV -> the cycle is scored
 *   the cycle performance report downloads as a PDF
 *
 * Written 2026-10-02 against local develop (images 2026-10-01 17:48 UTC). The REST-level lifecycle
 * (scheme, panel, provider lane) is tests/qa/eqa-cycle-lifecycle.spec.ts against pngdemo; this file
 * is the first UI pass of the participant lane on develop. The known EQA defects (OGC-1243 to 1252)
 * are not asserted here.
 *
 * Data: one cycle named "QA EQA HP <stamp>" on the first active QA enrolment ("QA-EQA-..." in
 * My EQA Schemes) and one EQA order. Nothing is deleted.
 */
import { test, expect, Page } from '@playwright/test';
import { apiGet } from '../helpers/silentSave';
import { ensureReferringClinic } from '../helpers/data-factory';

const BASE = process.env.BASE_URL || process.env.BASE || 'https://testing.openelis-global.org';
const STAMP = `${Date.now()}`.slice(-6);
const CYCLE_NAME = `QA EQA HP ${STAMP}`;
const PROVIDER_SAMPLE = `QA-PT-${STAMP}`;

test.describe.configure({ mode: 'serial' });
test.setTimeout(240_000);

const s: {
  enrolment?: { id: string; programName: string; testId: string };
  test?: { name: string; sampleTypeId: string; labUnitId: string; resultOption: string };
  cycleId?: string; labNo?: string; awaitingBefore?: number;
} = {};

const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

async function ready(page: Page) {
  if (!page.url().startsWith('http')) await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
}

async function myCycle(page: Page): Promise<any> {
  await ready(page);
  const r = await apiGet<any[]>(page, '/rest/eqa/cycles/mine');
  expect(r.status, 'GET /rest/eqa/cycles/mine').toBe(200);
  return (r.json ?? []).find((c) => String(c.id) === s.cycleId);
}

async function openMyCycles(page: Page, bucket = 'all') {
  await page.goto(`${BASE}/qa/eqa/my-cycles`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: /^New cycle$/ })).toBeVisible({ timeout: 30_000 });
  await page.locator('#cycle-bucket-filter').selectOption(bucket);
}

test.describe('EQA participant happy path (TC-EQAHP)', () => {
  test('TC-EQAHP-00 [setup]: the lab is enrolled in a QA scheme with an orderable test', async ({ page }) => {
    await ready(page);
    const progs = await apiGet<any[]>(page, '/rest/eqa/my-programs');
    expect(progs.status).toBe(200);
    // A cycle can only be created for an enrolment whose name matches a scheme on this instance
    // (POST /cycles/mine answers 422 "No programme named ... exists" otherwise).
    const schemes = await apiGet<any[]>(page, '/rest/eqa/programs');
    const names = new Set((schemes.json ?? []).map((x) => x.name));
    const p = (progs.json ?? []).find((x) => /^QA-EQA/.test(x.programName) && x.isActive && (x.tests ?? []).length && names.has(x.programName));
    expect(p, 'an active QA enrolment with a test, matching a scheme, exists in My EQA Schemes').toBeTruthy();
    s.enrolment = { id: String(p.id), programName: p.programName, testId: String(p.tests[0].id) };
    const info = await apiGet<any>(page, `/rest/test-catalog/tests/${s.enrolment.testId}/basic-info`);
    expect(info.json?.orderable, `test ${s.enrolment.testId} is orderable`).toBeTruthy();
    const sr = await apiGet<any>(page, `/rest/test-catalog/tests/${s.enrolment.testId}/sample-results`);
    const opt = sr.json?.components?.[0]?.options?.[0]?.valueName ?? '';
    s.test = { name: info.json.name, sampleTypeId: String(info.json.sampleTypeId), labUnitId: String(info.json.labUnitId), resultOption: opt };
    const before = await apiGet<any[]>(page, '/rest/eqa/cycles/mine');
    s.awaitingBefore = (before.json ?? []).filter((c) => String(c.status).toUpperCase() === 'SUBMITTED').length;
  });

  test('TC-EQAHP-01: a new cycle for the enrolled scheme is created and listed as Planned', async ({ page }) => {
    await openMyCycles(page, 'active');
    await page.getByRole('button', { name: /^New cycle$/ }).click();
    const m = page.locator('.cds--modal.is-visible');
    await m.locator('#new-cycle-scheme').selectOption(s.enrolment!.programName);
    await m.locator('#new-cycle-name').fill(CYCLE_NAME);
    await m.locator('#new-cycle-distribution').fill(day(0));
    await m.locator('#new-cycle-deadline').fill(day(14));
    const post = page.waitForResponse((r) => new URL(r.url()).pathname.endsWith('/rest/eqa/cycles/mine') && r.request().method() === 'POST');
    await m.getByRole('button', { name: /^Create cycle$/ }).click();
    const res = await post;
    expect(res.status(), `create cycle: ${(await res.text()).slice(0, 200)}`).toBe(201);
    s.cycleId = String((await res.json()).id);
    await expect(page.getByText(/Cycle created/i).first(), 'the page confirms the cycle').toBeVisible({ timeout: 15_000 });
    const row = page.getByTestId(`cycle-row-${s.cycleId}`);
    await expect(row, 'the new cycle is listed').toBeVisible({ timeout: 15_000 });
    await expect(row).toContainText('Planned');
    await expect(row).toContainText(day(14));
    const c = await myCycle(page);
    expect(c.cycleName).toBe(CYCLE_NAME);
    expect(c.status).toBe('PLANNED');
  });

  test('TC-EQAHP-02: Receive panel opens Add Order for this cycle and the EQA sample is ordered', async ({ page }) => {
    await openMyCycles(page, 'active');
    await page.getByTestId(`cycle-row-${s.cycleId}`).click();
    await page.getByRole('button', { name: /Receive panel/i }).first().click();
    await page.waitForURL(/SamplePatientEntry\?isEQA=true&cycleId=/, { timeout: 20_000 });
    // Step 1: the EQA box is ticked and the patient is locked.
    await expect(page.locator('#eqa-sample-checkbox'), 'the EQA box is ticked').toBeChecked({ timeout: 30_000 });
    await expect(page.getByText(/Patient Info Locked/i).first()).toBeVisible();
    await page.getByRole('button', { name: /^Next$/ }).click();
    // Step 2: programme and cycle come pre-selected from the link.
    await expect(page.locator('#eqa-cycle'), 'the cycle is pre-selected').toHaveValue(s.cycleId!, { timeout: 15_000 });
    await expect(page.locator('#eqa-program'), 'the enrolment is pre-selected').toHaveValue(s.enrolment!.id);
    await page.locator('#eqa-provider-sample-id').fill(PROVIDER_SAMPLE);
    await page.locator('#eqa-received-temp').fill('4');
    await page.getByRole('button', { name: /^Next$/ }).click();
    // Step 3: the enrolled test on its sample type.
    await page.locator('#sampleId_0').selectOption(s.test!.sampleTypeId);
    await page.locator('main label').filter({ hasText: new RegExp(`^${s.test!.name}`, 'i') }).first().click();
    await page.evaluate(() => {
      const el = document.getElementById('collectionDate_0') as any;
      el?._flatpickr?.set('maxDate', null);
      el?._flatpickr?.setDate(new Date(), true);
    });
    await page.getByRole('button', { name: /^Next$/ }).click();
    // Step 4: lab number, referring site, requester.
    await page.waitForLoadState('networkidle');
    await page.locator('main').getByText(/^Generate$/).click();
    await expect(page.locator('#labNo')).not.toHaveValue('', { timeout: 10_000 });
    s.labNo = await page.locator('#labNo').inputValue();
    const errors: string[] = [];
    const siteId = await ensureReferringClinic(page, errors);
    const sites = await apiGet<Array<{ id: string; value: string }>>(page, '/rest/displayList/SAMPLE_PATIENT_REFERRING_CLINIC');
    const siteName = (sites.json ?? []).find((x) => String(x.id) === String(siteId))?.value ?? '';
    if (await page.locator('#siteName').isVisible().catch(() => false)) {
      await expect(async () => {
        await page.locator('#siteName').fill('');
        await page.locator('#siteName').fill(siteName.split(' ')[0]);
        await expect(page.getByText(siteName, { exact: true }).locator('visible=true').first()).toBeVisible({ timeout: 3000 });
      }).toPass({ timeout: 30_000 });
      await page.getByText(siteName, { exact: true }).locator('visible=true').first().click();
    }
    if (await page.locator('#requesterLastName').isVisible().catch(() => false)) {
      await page.locator('#requesterFirstName').fill('Qadoc');
      await page.locator('#requesterLastName').fill('Eqahp');
    }
    const post = page.waitForResponse((r) => /\/rest\/SamplePatientEntry$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST');
    await page.getByRole('button', { name: /^Submit$/ }).click();
    const res = await post;
    expect(res.status(), `EQA order save: ${(await res.text()).slice(0, 300)}`).toBe(200);
    await expect(page.getByText(/Successfully saved/i)).toBeVisible({ timeout: 15_000 });
  });

  test('TC-EQAHP-03: the cycle lists the EQA sample and has moved on from Planned', async ({ page }) => {
    const c = await myCycle(page);
    expect((c.samples ?? []).map((x: any) => x.labNo), `${s.labNo} is linked to the cycle`).toContain(s.labNo);
    expect(c.status, 'receipt moves the cycle past Planned').not.toBe('PLANNED');
    expect(c.progress?.total, 'one analyte expected').toBeGreaterThanOrEqual(1);
    await openMyCycles(page);
    await page.getByTestId(`cycle-row-${s.cycleId}`).click();
    const exp = page.getByTestId(`cycle-expanded-${s.cycleId}`);
    await expect(exp, 'the expanded cycle names the lab number').toContainText(s.labNo!);
    await expect(exp, 'and the provider sample id').toContainText(PROVIDER_SAMPLE);
    const link = exp.getByRole('link', { name: s.labNo! });
    await expect(link, 'the lab number links to result entry').toHaveAttribute('href', new RegExp(`accessionNumber=${s.labNo}`));
  });

  test('TC-EQAHP-04: the result is entered and validated in the standard pipeline and the cycle is ready to submit', async ({ page }) => {
    // Results Entry. REWORKED 2026-10-08: the unified Results page lists nothing until a lab unit
    // is loaded or a lab number searched (the ?testSectionId= deep link no longer loads a worklist).
    await page.goto(`${BASE}/Results`, { waitUntil: 'domcontentloaded' });
    const search = page.locator('main').getByRole('searchbox', { name: /lab number/i });
    await search.fill(s.labNo!);
    await search.press('Enter');
    const row = page.locator('tr').filter({ hasText: s.labNo! }).first();
    await expect(row, 'the EQA sample is on the results worklist').toBeVisible({ timeout: 60_000 });
    const sel = row.locator('select[id^="unifiedResultValue-"]').first();
    const value = await sel.evaluate((el: HTMLSelectElement, label: string) =>
      Array.from(el.options).find((o) => o.text.trim() === label)?.value || Array.from(el.options).map((o) => o.value).find((v) => v && v !== '0') || '', s.test!.resultOption);
    expect(value, 'a result option is offered').not.toBe('');
    await sel.selectOption(value);
    const save = page.waitForResponse((r) => /results-entry\/analysis\/\d+\/result$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST');
    await row.getByRole('button', { name: /^Save$/ }).click();
    expect((await save).status(), 'result saved').toBe(200);
    // Validation
    // The one-page Validation: search the lab number, then load.
    await page.goto(`${BASE}/validation`, { waitUntil: 'domcontentloaded' });
    await page.locator('main').getByRole('searchbox', { name: 'Lab number' }).fill(s.labNo!);
    await page.locator('main').getByRole('button', { name: 'Load results' }).click();
    const vrow = page.getByRole('row').filter({ hasText: s.labNo! }).first();
    await expect(vrow, 'the EQA result is in the validation queue').toBeVisible({ timeout: 60_000 });
    await vrow.getByRole('button', { name: /expand/i }).first().click();
    const release = page.waitForResponse((r) => /release/i.test(new URL(r.url()).pathname) && r.request().method() !== 'GET', { timeout: 60_000 });
    await page.getByRole('button', { name: /Validate & release/i }).first().click();
    expect((await release).status(), 'validate and release').toBe(200);
    // With every analyte validated the cycle is ready to go to the provider. This provider is not
    // an OpenELIS instance, so there is no automatic channel and the cycle waits at Ready to submit.
    await expect(async () => {
      const c = await myCycle(page);
      expect(String(c.status).toUpperCase(), 'cycle status after validation').toMatch(/^(READY_TO_SUBMIT|SUBMITTED)$/);
    }).toPass({ timeout: 60_000, intervals: [3000] });
  });

  test('TC-EQAHP-04b: Submit by hand with the provider reference typed in moves the cycle to Submitted (OGC-1246)', async ({ page }) => {
    const c0 = await myCycle(page);
    test.skip(String(c0.status).toUpperCase() === 'SUBMITTED', 'submitted automatically: nothing to submit by hand');
    await openMyCycles(page);
    await page.getByTestId(`cycle-row-${s.cycleId}`).click();
    await page.getByTestId(`cycle-expanded-${s.cycleId}`).getByRole('button', { name: /^Submit by hand$/ }).click();
    const m = page.getByRole('dialog', { name: /Record a submission made by hand/i });
    // Typed key by key, the way a user does: OGC-1246 was a field that refused typed input.
    await m.locator('#manual-submission-reference').pressSequentially(`QA-REF-${STAMP}`, { delay: 20 });
    await expect(m.locator('#manual-submission-reference'), 'the reference takes typed input').toHaveValue(`QA-REF-${STAMP}`);
    const post = page.waitForResponse((r) => /\/submit-manual$/.test(new URL(r.url()).pathname));
    await m.getByRole('button', { name: /^Submit by hand$/ }).click();
    expect((await post).status(), 'manual submission').toBe(200);
    await expect(async () => {
      const c = await myCycle(page);
      expect(String(c.status).toUpperCase()).toBe('SUBMITTED');
    }).toPass({ timeout: 30_000, intervals: [2000] });
    await openMyCycles(page);
    await expect(page.getByTestId('kpi-awaiting'), 'Awaiting scores counts it').toContainText(String((s.awaitingBefore ?? 0) + 1));
  });

  test('TC-EQAHP-05: the provider scores are imported and the cycle is scored', async ({ page }) => {
    await openMyCycles(page, 'awaiting');
    await page.getByTestId(`cycle-row-${s.cycleId}`).click();
    await page.getByRole('button', { name: /Import scores \(CSV\)/i }).click();
    const m = page.locator('.cds--modal.is-visible');
    await m.locator('#score-import-csv').fill(`analyte_name,performance_status\n${s.test!.name},ACCEPTABLE\n`);
    const post = page.waitForResponse((r) => /score-intake\/csv$/.test(new URL(r.url()).pathname));
    await m.getByRole('button', { name: /^Import scores$/ }).click();
    const res = await post;
    const body = await res.json().catch(() => ({}));
    expect(res.status(), `score import: ${JSON.stringify(body).slice(0, 200)}`).toBe(200);
    expect(body.scored, 'one analyte scored').toBeGreaterThanOrEqual(1);
    expect(body.unmapped ?? [], 'nothing left unmapped').toEqual([]);
    await expect(async () => {
      const c = await myCycle(page);
      expect(String(c.status).toUpperCase()).toBe('SCORED');
    }).toPass({ timeout: 30_000, intervals: [2000] });
  });

  test('TC-EQAHP-06: the cycle performance report downloads as a PDF', async ({ page }) => {
    await openMyCycles(page, 'all');
    await page.getByTestId(`cycle-row-${s.cycleId}`).click();
    // The button opens the report in a new tab (window.open); fetch what that tab points at.
    const popup = page.waitForEvent('popup', { timeout: 30_000 });
    await page.getByTestId(`cycle-expanded-${s.cycleId}`).getByRole('button', { name: /Download performance report/i }).click();
    const tab = await popup;
    // The PDF is served as a download, so the new tab closes on its own and has no URL to read.
    await tab.close().catch(() => undefined);
    const r = await page.context().request.get(`${BASE}/api/OpenELIS-Global/rest/eqa/cycles/${s.cycleId}/performance-report`);
    expect(r.status(), 'performance report').toBe(200);
    expect(r.headers()['content-type'] ?? '', 'served as a PDF').toContain('pdf');
    expect((await r.body()).subarray(0, 4).toString(), 'a real PDF').toBe('%PDF');
  });
});
