/**
 * tests/pathology-ihc-happy-path.spec.ts
 *
 * Pathology and IHC, the happy path from order to finished report, driven through the case
 * views the way a bench technician and a pathologist work them:
 *
 *   order -> case Accessioned -> Grossing with blocks -> Staining with slides
 *   -> Ready for Pathologist (pathologist assigned, tile moves)
 *   -> pathologist refers to IHC with a marker  -> IHC case appears
 *   -> IHC case: technician, pathologist, report generated, Completed and released
 *   -> pathology case: gross and microscopy text, conclusion, report generated, Completed and released
 *
 * Written 2026-10-02 against local develop (images 2026-10-01 17:48 UTC) to close the
 * "Pathology: full case lifecycle" and "IHC: referral to IHC case listed" gaps in
 * claude/coverage-thin-3.2.3.md. The negative cases (an EMPTY case can be completed, R51) live in
 * pathology-workflow.spec.ts; this file only asserts the path that must work.
 *
 * Data: one QA patient ("Pathhp Qaauto", national id QAPHP<stamp>) and one Histopathology order
 * placed through the Add Order wizard with the Histopathology program. Nothing is deleted.
 * The admin login holds the Pathologist role (GET /session), which the exam and conclusion
 * section needs; the spec checks that first so a missing role reads as a setup gap.
 */
import { test, expect, Page } from '@playwright/test';
import { apiGet } from '../helpers/silentSave';
import { setStage, expectStage, openSection } from '../helpers/pathology-case';
import { createPatientViaAPI, ensureReferringClinic } from '../helpers/data-factory';
import { orderThroughWizard } from '../helpers/order-wizard';

const BASE = process.env.BASE_URL || process.env.BASE || 'https://testing.openelis-global.org';
const ANSWERS = ['ACCESSORY SINUSES', 'Biopsy', 'Core Biopsy'];
const STAMP = `${Date.now()}`.slice(-7);
const GROSS = `QA gross ${STAMP}: two cores, 12 and 9 mm, tan-white.`;
const MICRO = `QA micro ${STAMP}: benign sinonasal mucosa, no dysplasia.`;
const CONCLUSION = `QA conclusion ${STAMP}: benign, no malignancy seen.`;

test.describe.configure({ mode: 'serial' });
test.setTimeout(240_000);

type Counts = { inProgress: number; awaitingReview: number; complete: number; additionalRequests?: number };

const state: {
  labNo: string; caseId: string; ihcId: string; ihcMarker: string;
  before?: Counts; ihcBefore?: Counts;
} = { labNo: '', caseId: '', ihcId: '', ihcMarker: '' };

async function counts(page: Page, kind: 'pathology' | 'immunohistochemistry'): Promise<Counts> {
  // apiGet fetches from inside the page: a fresh test page is about:blank and cannot.
  if (!page.url().startsWith('http')) await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  const r = await apiGet<Counts>(page, `/rest/${kind}/dashboard/count`);
  expect(r.status, `${kind} dashboard count`).toBe(200);
  return r.json!;
}

async function caseJson(page: Page, kind: 'pathology' | 'immunohistochemistry', id: string): Promise<any> {
  const r = await apiGet<any>(page, `/rest/${kind}/caseView/${id}`);
  expect(r.status, `GET ${kind} case ${id}`).toBe(200);
  return r.json;
}

/** The dashboard shows one page of rows (R55): search for the case. */
async function findRow(page: Page, dashboard: 'PathologyDashboard' | 'ImmunohistochemistryDashboard', status = '') {
  await page.goto(`${BASE}/${dashboard}`, { waitUntil: 'domcontentloaded' });
  // The default filter is "In Progress", which leaves out Ready for Pathologist and Completed.
  if (status) {
    await page.locator('#statusFilter').selectOption(status);
    await page.waitForLoadState('networkidle').catch(() => undefined);
  }
  const search = page.getByPlaceholder(/LabNo|Family Name/i).first();
  await search.fill(state.labNo);
  await search.press('Enter');
  return page.locator('tr', { hasText: state.labNo });
}

/** Open a case view and wait until the case (not the placeholder) has loaded. */
async function openCase(page: Page, kind: 'pathology' | 'immunohistochemistry', id: string) {
  const view = kind === 'pathology' ? 'PathologyCaseView' : 'ImmunohistochemistryCaseView';
  await page.goto(`${BASE}/${view}/${id}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('main').getByText(state.labNo).first(), 'the case view has loaded').toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState('networkidle').catch(() => undefined);
}

/**
 * Press the case-level Save and return the HTTP status of the case POST. REWORKED 2026-10-08: the
 * redesigned pathology case view saves with "Save draft" (no #pathology_save), and after a save its
 * "Discard changes" goes disabled. The IHC case view keeps #pathology_save.
 */
async function saveCase(page: Page, kind: 'pathology' | 'immunohistochemistry', id: string): Promise<number> {
  const post = page.waitForResponse((r) => new URL(r.url()).pathname.endsWith(`/rest/${kind}/caseView/${id}`) && r.request().method() === 'POST', { timeout: 60_000 });
  const legacy = (await page.locator('#pathology_save').count()) > 0;
  if (legacy) await page.locator('#pathology_save').click();
  else await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  const res = await post;
  // On a 200 the case view disables both Save buttons and offers label printing; the
  // notification itself sits at the top of a long page.
  if (res.status() === 200) {
    if (legacy) await expect(page.locator('#pathology_save'), 'Save is disabled after a successful save').toBeDisabled({ timeout: 15_000 });
    else await expect(page.getByRole('button', { name: 'Discard changes', exact: true }), 'nothing left unsaved after a successful save').toBeDisabled({ timeout: 15_000 });
  }
  return res.status();
}

/**
 * The Gross Exam, Microscopy Exam and Text Conclusion TextAreas have no id, so their visible labels
 * are not tied to them (no accessible name; see the a11y scan). Find each by its form item.
 */
const area = (page: Page, label: RegExp) => page.locator('.cds--form-item').filter({ hasText: label }).locator('textarea').first();

/** Add a report row and press Generate Report; returns the PDF response status and type. */
async function generateReport(page: Page) {
  const pdf = page.waitForResponse((r) => new URL(r.url()).pathname.endsWith('/rest/ReportPrint') && r.request().method() === 'POST', { timeout: 120_000 });
  await page.getByRole('button', { name: /^Generate Report$/i }).first().click();
  const r = await pdf;
  const out = { status: r.status(), type: r.headers()['content-type'] ?? '', body: '' };
  if (r.status() !== 200 || !out.type.includes('pdf')) {
    out.body = (await r.text().catch(() => '')).slice(0, 300);
    return out;
  }
  // The page attaches the PDF to the report row once the blob is read, then offers View.
  await expect(page.getByRole('button', { name: /^View( File)?$/ }).first(), 'the generated report can be viewed').toBeVisible({ timeout: 30_000 });
  return out;
}


test.describe('Pathology and IHC happy path (TC-PATHHP, TC-IHCHP)', () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    state.before = await counts(page, 'pathology');
    state.ihcBefore = await counts(page, 'immunohistochemistry');
    const errors: string[] = [];
    const siteId = await ensureReferringClinic(page, errors);
    expect(siteId, errors.join(' | ')).toBeTruthy();
    const sites = await apiGet<Array<{ id: string; value: string }>>(page, '/rest/displayList/SAMPLE_PATIENT_REFERRING_CLINIC');
    const siteName = (sites.json ?? []).find((s) => String(s.id) === String(siteId))?.value ?? '';
    const stamp = `${Date.now()}${Math.floor(Math.random() * 100)}`;
    const pt = await createPatientViaAPI(page, { nationalId: `QAPHP${stamp}`, subjectNumber: `95${stamp}`, firstName: 'Pathhp', lastName: 'Qaauto' });
    expect(pt.id, pt.detail).toBeTruthy();
    state.labNo = await orderThroughWizard(page, {
      subjectNumber: `95${stamp}`, patientId: pt.id!, siteName, program: 'Histopathology',
      questionnaireMarker: /Nature\/Site of Specimen/i, answers: ANSWERS,
      sampleType: 'Histopathology specimen', testName: 'Histopathology examination', requesterLastName: 'Pathreq',
    });
    await page.close();
  });

  test('TC-PATHHP-00 [setup]: the login can act as pathologist', async ({ page }) => {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    const s = await apiGet<{ roles?: string[]; userId?: string }>(page, '/session');
    expect(s.json?.roles ?? [], 'the harness login holds the Pathologist role (exam and conclusion fields need it)').toContain('Pathologist');
    const paths = await apiGet<Array<{ id: string }>>(page, '/rest/users/Pathologist');
    expect((paths.json ?? []).map((u) => u.id), 'the login is offered as a pathologist').toContain(String(s.json?.userId));
  });

  test('TC-PATHHP-01: the order opens an Accessioned case and the In Progress tile counts it', async ({ page }) => {
    const row = await findRow(page, 'PathologyDashboard');
    await expect(row, `case for ${state.labNo} is listed`).toBeVisible({ timeout: 30_000 });
    await expect(row, 'a new case starts Accessioned').toContainText('Accessioned');
    await row.click();
    await page.waitForURL(/\/PathologyCaseView\/\d+/, { timeout: 20_000 });
    state.caseId = page.url().match(/(\d+)$/)![1];
    const c = await caseJson(page, 'pathology', state.caseId);
    expect(c.status).toBe('ACCESSIONED');
    expect(c.labNumber).toBe(state.labNo);
    const now = await counts(page, 'pathology');
    expect(now.inProgress, `In Progress was ${state.before!.inProgress}`).toBe(state.before!.inProgress + 1);
  });

  test('TC-PATHHP-02: grossing with two blocks is saved and read back', async ({ page }) => {
    await openCase(page, 'pathology', state.caseId);
    await setStage(page, 'GROSSING');
    await openSection(page, 'grossing');
    await page.locator('#blocksToAdd').fill('2');
    await page.getByRole('button', { name: /^Add Block\(s\)$/ }).click();
    // Block rows are now blockNumber0, blockNumber1, ... (they all had id "blockNumber").
    await expect(page.locator('[id^="blockNumber"]'), 'two block rows on the form').toHaveCount(2);
    expect(await saveCase(page, 'pathology', state.caseId), 'case save').toBe(200);
    const c = await caseJson(page, 'pathology', state.caseId);
    expect(c.status, 'stage stored').toBe('GROSSING');
    expect((c.blocks ?? []).map((b: any) => Number(b.blockNumber)).sort(), 'blocks 1 and 2 stored').toEqual([1, 2]);
    await openCase(page, 'pathology', state.caseId);
    await expectStage(page, 'GROSSING', 'the stage survives a reload');
    await openSection(page, 'grossing');
    await expect(page.locator('[id^="blockNumber"]')).toHaveCount(2);
  });

  test('TC-PATHHP-03: staining with two slides is saved and read back', async ({ page }) => {
    await openCase(page, 'pathology', state.caseId);
    await setStage(page, 'STAINING');
    // Slides are cut in the Microtomy section now (it unlocks once the stage passes it).
    await openSection(page, 'microtomy');
    await page.locator('#slidesToAdd').fill('2');
    await page.getByRole('button', { name: /^Add Slide\(s\)$/ }).click();
    await expect(page.locator('[id^="slideNumber"]'), 'two slide rows on the form').toHaveCount(2);
    expect(await saveCase(page, 'pathology', state.caseId)).toBe(200);
    const c = await caseJson(page, 'pathology', state.caseId);
    expect(c.status).toBe('STAINING');
    expect((c.slides ?? []).length, 'two slides stored').toBe(2);
    expect((c.blocks ?? []).length, 'the blocks are still there').toBe(2);
    const row = await findRow(page, 'PathologyDashboard');
    await expect(row, 'the dashboard shows the new stage').toContainText('Staining');
  });

  test('TC-PATHHP-04: Ready for Pathologist with a pathologist assigned moves the case to Awaiting Review', async ({ page }) => {
    const mid = await counts(page, 'pathology');
    await openCase(page, 'pathology', state.caseId);
    await setStage(page, 'READY_PATHOLOGIST');
    await openSection(page, 'review');
    await page.locator('#assignedPathologist').selectOption('1');
    expect(await saveCase(page, 'pathology', state.caseId)).toBe(200);
    const c = await caseJson(page, 'pathology', state.caseId);
    expect(c.status).toBe('READY_PATHOLOGIST');
    expect(String(c.assignedPathologistId), 'pathologist stored').toBe('1');
    const now = await counts(page, 'pathology');
    expect(now.awaitingReview, 'Awaiting Pathology Review counts the case').toBe(mid.awaitingReview + 1);
    expect(now.inProgress, 'and In Progress drops it').toBe(mid.inProgress - 1);
    const row = await findRow(page, 'PathologyDashboard', 'READY_PATHOLOGIST');
    await expect(row).toContainText('Ready for Pathologist');
    await expect(row, 'the assigned pathologist is shown').toContainText('ELIS');
  });

  test('TC-IHCHP-01: the pathologist refers the case to IHC with a marker and the IHC case appears', async ({ page }) => {
    await openCase(page, 'pathology', state.caseId);
    await setStage(page, 'UNDER_REVIEW');
    await openSection(page, 'findings');
    await page.locator('label[for="referToImmunoHistoChemistry"]').click();
    await page.locator('#ihctests').click();
    // Native <option>s of the status selects also have role option: scope to the open listbox.
    const opt = page.getByRole('listbox').getByRole('option').first();
    await expect(opt, 'IHC marker tests are offered').toBeVisible({ timeout: 15_000 });
    state.ihcMarker = ((await opt.innerText()) || '').split('(')[0].trim();
    await opt.click();
    await page.keyboard.press('Escape');
    expect(await saveCase(page, 'pathology', state.caseId)).toBe(200);
    const row = await findRow(page, 'ImmunohistochemistryDashboard');
    await expect(row, `IHC case for ${state.labNo} is listed`).toBeVisible({ timeout: 30_000 });
    await row.click();
    await page.waitForURL(/\/ImmunohistochemistryCaseView\/\d+/, { timeout: 20_000 });
    state.ihcId = page.url().match(/(\d+)$/)![1];
    const ihc = await caseJson(page, 'immunohistochemistry', state.ihcId);
    expect(ihc.labNumber, 'the IHC case belongs to the same order').toBe(state.labNo);
    const now = await counts(page, 'immunohistochemistry');
    expect(now.inProgress, 'IHC In Progress counts it').toBe(state.ihcBefore!.inProgress + 1);
  });

  test('TC-IHCHP-02: the referred marker is waiting in the IHC case results', async ({ page }) => {
    await openCase(page, 'immunohistochemistry', state.ihcId);
    const results = page.locator('main').getByText(state.ihcMarker, { exact: false }).first();
    await expect(results, `the ${state.ihcMarker} test is listed in the IHC case`).toBeVisible({ timeout: 30_000 });
  });

  test('TC-IHCHP-03: the IHC case is reported and completed', async ({ page }) => {
    const mid = await counts(page, 'immunohistochemistry');
    await openCase(page, 'immunohistochemistry', state.ihcId);
    await page.locator('#assignedPathologist').selectOption('1');
    const report = page.locator('#report');
    const firstType = await report.locator('option:not([disabled])').first().getAttribute('value');
    expect(firstType, 'an IHC report type is offered').toBeTruthy();
    await report.selectOption(firstType!);
    const pdf = await generateReport(page);
    expect(pdf.status, `IHC report PDF: ${pdf.body}`).toBe(200);
    expect(pdf.type).toContain('pdf');
    await setStage(page, 'COMPLETED');
    expect(await saveCase(page, 'immunohistochemistry', state.ihcId)).toBe(200);
    const c = await caseJson(page, 'immunohistochemistry', state.ihcId);
    expect(c.status, 'IHC case Completed').toBe('COMPLETED');
    expect((c.reports ?? []).length, 'the IHC report is stored with the case').toBe(1);
    const now = await counts(page, 'immunohistochemistry');
    expect(now.complete, 'IHC Complete tile counts it').toBe(mid.complete + 1);
  });

  test('TC-IHCHP-04: releasing the completed IHC case saves [FIXED]', async ({ page }) => {
    // FIXED (never filed), flipped 2026-10-08 (passes on local develop 2026-10-06 and 2026-10-08); was FLIP-WHEN-FIXED. Observed 2 Oct 2026 on local develop: ticking "Release" and saving answers
    // 500 every time (UI and a direct POST, IN_PROGRESS or COMPLETED); the server log shows
    // "No row with the given identifier exists: [Analysis#<the IHC case's sample id>]", so the
    // release path looks the analysis up by the sample id. Not filed yet (Casey to decide).
    await openCase(page, 'immunohistochemistry', state.ihcId);
    await page.locator('label[for="release"]').click();
    expect(await saveCase(page, 'immunohistochemistry', state.ihcId), 'release save answers 200').toBe(200);
  });

  test('TC-PATHHP-05: the pathologist reports and completes the pathology case', async ({ page }) => {
    const mid = await counts(page, 'pathology');
    await openCase(page, 'pathology', state.caseId);
    for (const key of ['grossing', 'findings', 'reports']) await openSection(page, key);
    await area(page, /^Gross Exam/).fill(GROSS);
    await area(page, /^Microscopy Exam/).fill(MICRO);
    await area(page, /^Text Conclusion/).fill(CONCLUSION);
    await page.getByRole('button', { name: /^Add Report$/ }).click();
    const pdf = await generateReport(page);
    expect(pdf.status, `pathology report PDF: ${pdf.body}`).toBe(200);
    expect(pdf.type).toContain('pdf');
    await setStage(page, 'COMPLETED');
    expect(await saveCase(page, 'pathology', state.caseId)).toBe(200);
    const c = await caseJson(page, 'pathology', state.caseId);
    expect(c.status).toBe('COMPLETED');
    expect(c.grossExam, 'gross exam stored').toBe(GROSS);
    expect(c.microscopyExam, 'microscopy stored').toBe(MICRO);
    expect(c.conclusionText, 'conclusion stored').toBe(CONCLUSION);
    expect((c.reports ?? []).length, 'the report is stored with the case').toBe(1);
    expect((c.blocks ?? []).length, 'blocks still there at the end').toBe(2);
    expect((c.slides ?? []).length, 'slides still there at the end').toBe(2);
    const now = await counts(page, 'pathology');
    expect(now.complete, 'Complete tile counts it').toBe(mid.complete + 1);
    // Under Pathologist Review counts as In Progress on the dashboard, so that tile drops it.
    expect(now.inProgress, 'and In Progress drops it').toBe(mid.inProgress - 1);
  });

  test('TC-PATHHP-06: the completed case reads back on the case view and the dashboard', async ({ page }) => {
    await openCase(page, 'pathology', state.caseId);
    await expectStage(page, 'COMPLETED');
    for (const key of ['grossing', 'findings', 'reports']) await openSection(page, key);
    await expect(area(page, /^Gross Exam/), 'gross exam shown').toHaveValue(GROSS);
    await expect(area(page, /^Microscopy Exam/), 'microscopy shown').toHaveValue(MICRO);
    await expect(area(page, /^Text Conclusion/), 'conclusion shown').toHaveValue(CONCLUSION);
    await expect(page.getByRole('button', { name: /^View( File)?$/ }).first(), 'the stored report can be opened').toBeVisible();
    const row = await findRow(page, 'PathologyDashboard', 'COMPLETED');
    await expect(row, 'listed under Completed').toContainText('Completed');
  });

  test('TC-PATHHP-07: marking the completed pathology case "Ready For release" saves [FIXED]', async ({ page }) => {
    // FIXED (never filed), flipped 2026-10-08 (passes on local develop 2026-10-06 and 2026-10-08); was FLIP-WHEN-FIXED. Same fault as TC-IHCHP-04, observed 2 Oct 2026: with "Ready For release"
    // ticked the case POST answers 500 and the log shows "No row with the given identifier exists:
    // [Analysis#<the order's sample id>]". Not filed yet (Casey to decide).
    await openCase(page, 'pathology', state.caseId);
    await openSection(page, 'findings');
    await page.locator('label[for="release"]').click();
    expect(await saveCase(page, 'pathology', state.caseId), 'release save answers 200').toBe(200);
  });
});
