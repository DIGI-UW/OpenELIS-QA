/**
 * tests/cytology-workflow.spec.ts
 *
 * Cytology, end to end: a Cytology-unit test ordered through Add Order with the
 * Cytology program must create a case on the Cytology dashboard, carry the
 * questionnaire answers onto the case view, and refuse to complete an empty case.
 * Written 2026-09-27 against testing 3.2.3.0 after the same walk by hand
 * (uncovered-workflows-catalogue TC-CYTW-01/06/07; release-qa-3.2.3 R51).
 *
 * Coverage before this file: TC-CYT-01/02 checked that the dashboard renders. The
 * workflow was rated "smoke" and testing had no orderable Cytology test at all, so
 * nothing could reach a case. This file seeds that test (QA_ prefix) when missing.
 *
 * The order is placed through the Add Order wizard (the way a user does it), not by
 * REST, because the program questionnaire is part of what is under test.
 * `test.fail()` cases are FLIP-WHEN-FIXED tripwires asserting the correct behaviour.
 */
import { test, expect, Page } from '@playwright/test';
import { apiGet, apiWrite } from '../helpers/silentSave';
import { createPatientViaAPI, ensureReferringClinic } from '../helpers/data-factory';

const BASE = process.env.BASE_URL || process.env.BASE || 'https://testing.openelis-global.org';
const TC = '/rest/test-catalog';
const TEST_NAME = 'QA_Cytology Pap Smear';
const SAMPLE_TYPE = 'Fluid';
const ANSWERS = ['Conventional smear', 'Cervix', 'Routine Call'];

test.describe.configure({ mode: 'serial' });

/** Find or create an active Cytology-unit test the wizard can offer. */
async function ensureCytologyTest(page: Page): Promise<void> {
  const found = await apiGet<{ rows?: Array<{ testId: string; name: string }> }>(page, `${TC}/tests?search=${encodeURIComponent(TEST_NAME)}`);
  if ((found.json?.rows ?? []).some(r => r.name.startsWith(TEST_NAME))) return;
  const units = await apiGet<Array<{ id: string; name: string }>>(page, `${TC}/lab-units`);
  const unit = (units.json ?? []).find(u => u.name === 'Cytology');
  expect(unit, 'a Cytology lab unit exists').toBeTruthy();
  const spe = await apiGet<{ sampleTypes?: Array<{ id: string; value: string }> }>(page, '/rest/SamplePatientEntry');
  const st = (spe.json?.sampleTypes ?? []).find(s => s.value === SAMPLE_TYPE);
  expect(st, `sample type ${SAMPLE_TYPE} exists`).toBeTruthy();
  const created = await apiWrite<{ testId?: string }>(page, 'POST', `${TC}/tests`, {
    name: TEST_NAME, reportingName: TEST_NAME, code: 'QACYTPAP', domain: 'CLINICAL',
    labUnitId: unit!.id, sampleTypeIds: [st!.id], description: 'QA seeded cytology test',
  });
  expect(created.status, `seed ${TEST_NAME}: ${created.text.slice(0, 160)}`).toBe(201);
  const id = String(created.json?.testId);
  const sr = await apiGet<{ components?: Array<{ id: string }> }>(page, `${TC}/tests/${id}/sample-results`);
  await apiWrite(page, 'PUT', `${TC}/tests/${id}/sample-results`, {
    testId: id, components: [{ id: sr.json?.components?.[0]?.id, code: 'PRIMARY', label: 'Interpretation', resultType: 'R',
      isPrimary: true, displayOrder: 1, showOnReport: true, significantDigits: 0, allowMultipleReadings: false, options: [], interpretations: [] }],
  });
  const act = await apiWrite(page, 'POST', `${TC}/tests/${id}/activate`, { gapsAcknowledged: 'qa' });
  expect(act.status, `activate ${TEST_NAME}`).toBe(200);
}

/** Place a Cytology order through the Add Order wizard; returns the lab number. */
async function orderThroughWizard(page: Page, subjectNumber: string, patientId: string, siteName: string): Promise<string> {
  await page.goto(`${BASE}/SamplePatientEntry`, { waitUntil: 'domcontentloaded' });
  // 1. Patient
  await page.locator('#patientId').fill(subjectNumber);
  await page.locator('main').getByRole('button', { name: /^Search$/ }).first().click();
  await expect(page.locator(`input[type="radio"][id="${patientId}"]`)).toBeAttached({ timeout: 15_000 });
  await page.locator(`label[for="${patientId}"]`).click();
  await page.getByRole('button', { name: /^Next$/ }).click();
  // 2. Program + questionnaire
  // The case is created from the PROGRAM, not the test's lab unit: an order of the same
  // Cytology test without the Cytology program (DEV...0263, 2026-09-27) created no case.
  const program = page.locator('#additionalQuestionsSelect');
  await expect(program.locator('option', { hasText: /^Cytology$/ })).toBeAttached({ timeout: 15_000 });
  const cytologyValue = await program.locator('option', { hasText: /^Cytology$/ }).getAttribute('value') ?? '';
  // Selecting before the step settles lets it reset the select to blank (seen in two runs;
  // by hand, after the step loads, the choice holds). Let it settle, then select until it sticks.
  await page.waitForLoadState('networkidle');
  await expect(async () => {
    await program.selectOption({ label: 'Cytology' });
    await expect(page.getByText(/Nature of Specimen/i)).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(1000);
    await expect(program).toHaveValue(cytologyValue, { timeout: 1000 });
  }, 'the Cytology program is selected and its questionnaire shown').toPass({ timeout: 45_000 });
  for (const answer of ANSWERS) {
    const sel = page.locator('main select').filter({ has: page.locator('option', { hasText: new RegExp(`^${answer}$`) }) }).first();
    await sel.selectOption({ label: answer });
  }
  await page.getByRole('button', { name: /^Next$/ }).click();
  // 3. Sample + test
  await page.locator('#sampleId_0').selectOption({ label: SAMPLE_TYPE });
  await page.locator('main label').filter({ hasText: new RegExp(`^${TEST_NAME}`) }).first().click();
  await page.evaluate(() => {
    const el = document.getElementById('collectionDate_0') as any;
    el?._flatpickr?.set('maxDate', null); // R26: a full load can clamp maxDate to 9 January
    el?._flatpickr?.setDate(new Date(), true);
  });
  await page.getByRole('button', { name: /^Next$/ }).click();
  // 4. Order. Let the step finish loading: the site suggestions are built from data that
  // arrives after the step mounts; typing earlier gave "No suggestions available".
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  await page.locator('main').getByText(/^Generate$/).click();
  await expect(page.locator('#labNo')).not.toHaveValue('', { timeout: 10_000 });
  const labNo = await page.locator('#labNo').inputValue();
  // Type the first word only: with "QA Aut" the list said "No suggestions available" in a
  // Playwright run (2026-09-27, unconfirmed by hand; catalogue TC-ORGW-05), while "QA" lists it.
  // One input event (fill): typed key by key, two Playwright runs saw "No suggestions
  // available" although per-key input works by hand (sites are preloaded in
  // referringSiteList and filtered client-side). Treated as harness timing.
  await expect(async () => {
    await page.locator('#siteName').fill('');
    await page.locator('#siteName').fill(siteName.split(' ')[0]);
    await expect(page.getByText(siteName, { exact: true }).locator('visible=true').first()).toBeVisible({ timeout: 3000 });
  }, 'the site search suggests the referring clinic').toPass({ timeout: 30_000 });
  // The suggestions are plain list items, not role=option; pick the first exact match.
  await page.getByText(siteName, { exact: true }).locator('visible=true').first().click();
  await expect(page.locator('#siteName'), 'the referring site is chosen').toHaveValue(siteName);
  await page.locator('#requesterFirstName').fill('Qadoc');
  await page.locator('#requesterLastName').fill('Cytoreq');
  const post = page.waitForResponse(r => /\/rest\/SamplePatientEntry$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST');
  await page.getByRole('button', { name: /^Submit$/ }).click();
  expect((await post).status(), 'order save answers 200').toBe(200);
  await expect(page.getByText(/Successfully saved/i)).toBeVisible({ timeout: 15_000 });
  const saved = await apiGet<{ sampleOrderItems?: { program?: string } }>(page, `/rest/SampleEdit?accessionNumber=${labNo}`);
  expect(saved.json?.sampleOrderItems?.program, `${labNo} was saved under the Cytology program`).toBe('Cytology');
  return labNo;
}

test.describe('Cytology workflow (TC-CYTW)', () => {
  let labNo = '';

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await ensureCytologyTest(page);
    const errors: string[] = [];
    const siteId = await ensureReferringClinic(page, errors);
    expect(siteId, `a referring clinic exists: ${errors.join(' | ')}`).toBeTruthy();
    const sites = await apiGet<Array<{ id: string; value: string }>>(page, '/rest/displayList/SAMPLE_PATIENT_REFERRING_CLINIC');
    const siteName = (sites.json ?? []).find(s => String(s.id) === String(siteId))?.value ?? '';
    const stamp = `${Date.now()}${Math.floor(Math.random() * 100)}`;
    const subjectNumber = `98${stamp}`;
    const pt = await createPatientViaAPI(page, { nationalId: `QACYT${stamp}`, subjectNumber, firstName: 'Cyto', lastName: 'Qaauto' });
    expect(pt.id, `patient seeded: ${pt.detail}`).toBeTruthy();
    labNo = await orderThroughWizard(page, subjectNumber, pt.id!, siteName);
    await page.close();
  });

  /** The dashboard shows one row per page (R55), so search for the case first. */
  async function findCaseRow(page: Page) {
    await page.goto(`${BASE}/CytologyDashboard`, { waitUntil: 'domcontentloaded' });
    const search = page.getByPlaceholder(/LabNo|Family Name/i).first();
    await search.fill(labNo);
    await search.press('Enter');
    return page.locator('tr', { hasText: labNo });
  }

  async function openCase(page: Page): Promise<void> {
    const row = await findCaseRow(page);
    await expect(row, `case for ${labNo} is listed`).toBeVisible({ timeout: 20_000 });
    await row.getByRole('button').or(row.getByRole('link')).first().click();
    await page.waitForURL(/\/CytologyCaseView\/\d+/, { timeout: 15_000 });
    // The view paints "No Patient Information Available" until the case loads.
    await expect(page.locator('main').getByText(labNo).first(), 'the case view has loaded').toBeVisible({ timeout: 20_000 });
  }

  test('TC-CYTW-01: a Cytology order creates a case on the Cytology dashboard', async ({ page }) => {
    await expect(await findCaseRow(page), `case for ${labNo} is listed`).toBeVisible({ timeout: 20_000 });
  });

  test('TC-CYTW-07: questionnaire answers from the order appear on the case view', async ({ page }) => {
    await openCase(page);
    const text = await page.locator('main').innerText();
    for (const answer of ANSWERS) expect(text, `case view shows "${answer}"`).toContain(answer);
  });

  test('TC-CYTW-06: an empty case cannot be saved as Completed', async ({ page }) => {
    // FLIP-WHEN-FIXED (R51). Observed 2026-09-27: Status = Completed with no slides, no
    // specimen adequacy, no report and no cytopathologist saved with 200 and the case left
    // every worklist.
    test.fail();
    await openCase(page);
    const caseUrl = page.url();
    await page.locator('#status').selectOption({ label: 'Completed' });
    await page.getByRole('button', { name: /^Save$/ }).first().click();
    await page.waitForTimeout(2500);
    await page.goto(caseUrl, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#status')).toBeAttached({ timeout: 15_000 });
    const status = await page.locator('#status').evaluate((s: HTMLSelectElement) => s.options[s.selectedIndex]?.text ?? '');
    expect(status, 'an empty case is not stored as Completed').not.toBe('Completed');
  });
});
