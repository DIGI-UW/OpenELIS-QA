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
import { orderThroughWizard } from '../helpers/order-wizard';

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
    labNo = await orderThroughWizard(page, {
      subjectNumber, patientId: pt.id!, siteName, program: 'Cytology', questionnaireMarker: /Nature of Specimen/i,
      answers: ANSWERS, sampleType: SAMPLE_TYPE, testName: TEST_NAME, requesterLastName: 'Cytoreq',
    });
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
    // Read the status only once the case has loaded: before that the select shows its
    // placeholder stage (an early read "passed" this tripwire by race on 2026-09-27).
    await expect(page.locator('main').getByText(labNo).first()).toBeVisible({ timeout: 20_000 });
    await page.waitForLoadState('networkidle');
    const status = await page.locator('#status').evaluate((s: HTMLSelectElement) => s.options[s.selectedIndex]?.text ?? '');
    expect(status, 'an empty case is not stored as Completed').not.toBe('Completed');
  });
});
