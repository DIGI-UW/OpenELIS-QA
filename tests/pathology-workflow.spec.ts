/**
 * tests/pathology-workflow.spec.ts
 *
 * Pathology, end to end: a Histopathology examination ordered with the Histopathology
 * program opens a case on the Pathology dashboard, the case view carries the
 * questionnaire answers, and an empty case cannot be completed.
 * Written 2026-09-27 against testing 3.2.3.0 (release-qa-3.2.3 R51; coverage-thin
 * "Pathology: a case can be Completed with no slides or report").
 *
 * Coverage before this file: pathology specs render the dashboard and case view and
 * check field bindings; none drove an order into a case or tried to complete an empty one.
 */
import { test, expect, Page } from '@playwright/test';
import { apiGet } from '../helpers/silentSave';
import { setStage, readStage, openSection, pressCaseSave } from '../helpers/pathology-case';
import { createPatientViaAPI, ensureReferringClinic } from '../helpers/data-factory';
import { orderThroughWizard } from '../helpers/order-wizard';

const BASE = process.env.BASE_URL || process.env.BASE || 'https://testing.openelis-global.org';
const ANSWERS = ['ACCESSORY SINUSES', 'Biopsy', 'Core Biopsy'];

test.describe.configure({ mode: 'serial' });

test.describe('Pathology workflow (TC-PATHW)', () => {
  let labNo = '';

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    const errors: string[] = [];
    const siteId = await ensureReferringClinic(page, errors);
    expect(siteId, errors.join(' | ')).toBeTruthy();
    const sites = await apiGet<Array<{ id: string; value: string }>>(page, '/rest/displayList/SAMPLE_PATIENT_REFERRING_CLINIC');
    const siteName = (sites.json ?? []).find(s => String(s.id) === String(siteId))?.value ?? '';
    const stamp = `${Date.now()}${Math.floor(Math.random() * 100)}`;
    const pt = await createPatientViaAPI(page, { nationalId: `QAPATH${stamp}`, subjectNumber: `96${stamp}`, firstName: 'Patho', lastName: 'Qaauto' });
    expect(pt.id, pt.detail).toBeTruthy();
    labNo = await orderThroughWizard(page, {
      subjectNumber: `96${stamp}`, patientId: pt.id!, siteName, program: 'Histopathology',
      questionnaireMarker: /Nature\/Site of Specimen/i, answers: ANSWERS,
      sampleType: 'Histopathology specimen', testName: 'Histopathology examination', requesterLastName: 'Pathreq',
    });
    await page.close();
  });

  /** The dashboard shows one row per page (R55): search for the case. */
  async function findCaseRow(page: Page) {
    await page.goto(`${BASE}/PathologyDashboard`, { waitUntil: 'domcontentloaded' });
    const search = page.getByPlaceholder(/LabNo|Family Name/i).first();
    await search.fill(labNo);
    await search.press('Enter');
    return page.locator('tr', { hasText: labNo });
  }

  /** The IHC dashboard, searched for this order. */
  async function findIhcRow(page: Page) {
    await page.goto(`${BASE}/ImmunohistochemistryDashboard`, { waitUntil: 'domcontentloaded' });
    const search = page.getByPlaceholder(/LabNo|Family Name/i).first();
    await search.fill(labNo);
    await search.press('Enter');
    return page.locator('tr', { hasText: labNo });
  }

  async function openCase(page: Page) {
    const row = await findCaseRow(page);
    await expect(row, `case for ${labNo} is listed`).toBeVisible({ timeout: 20_000 });
    await row.click();
    await page.waitForURL(/\/PathologyCaseView\/\d+/, { timeout: 15_000 });
    await expect(page.locator('main').getByText(labNo).first(), 'the case view has loaded').toBeVisible({ timeout: 20_000 });
  }

  test('TC-PATHW-01: a Histopathology order creates a case on the Pathology dashboard', async ({ page }) => {
    await expect(await findCaseRow(page), `case for ${labNo} is listed`).toBeVisible({ timeout: 20_000 });
  });

  test('TC-PATHW-02: questionnaire answers from the order appear on the case view', async ({ page }) => {
    await openCase(page);
    // REWORKED 2026-10-08: the redesigned case view keeps the order's details in a "Case
    // Information" section that starts collapsed; open it before reading.
    // The section header is "1. Case Information"; the "Case Information Complete" button above it
    // belongs to the progress bar and does not open anything.
    const info = page.locator('main').getByRole('button', { name: /^\d+\. Case Information/ }).first();
    if (await info.count()) {
      if ((await info.getAttribute('aria-expanded')) === 'false') await info.click();
      await page.waitForTimeout(1000);
    }
    const text = await page.locator('main').innerText();
    for (const a of ANSWERS) expect(text, `case view shows "${a}"`).toContain(a);
  });

  test('TC-IHCW-01: referring the pathology case to IHC creates the IHC case', async ({ page }) => {
    await openCase(page);
    // REWORKED 2026-10-08: the referral checkbox sits in the "Findings & Conclusion" section of the
    // redesigned case view, which starts collapsed and unlocks from Ready for Pathologist on.
    await setStage(page, 'UNDER_REVIEW');
    await openSection(page, 'findings');
    await page.locator('label[for="referToImmunoHistoChemistry"]').click();
    await expect(page.locator('#referToImmunoHistoChemistry')).toBeChecked();
    const post = page.waitForResponse(r => /\/rest\/pathology\/caseView\/\d+$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST');
    await pressCaseSave(page);
    expect((await post).status(), 'pathology case save answers 200').toBe(200);
    await expect(await findIhcRow(page), `IHC case for ${labNo} is listed`).toBeVisible({ timeout: 20_000 });
  });

  test('TC-IHCW-06: an empty IHC case cannot be saved as Completed', async ({ page }) => {
    // FLIP-WHEN-FIXED (R51). By hand on 2026-09-27 IHC case 8 completed with no pathologist
    // and no report.
    test.fail();
    const row = await findIhcRow(page);
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.click();
    await page.waitForURL(/\/ImmunohistochemistryCaseView\/\d+/, { timeout: 15_000 });
    await expect(page.locator('main').getByText(labNo).first()).toBeVisible({ timeout: 20_000 });
    const caseUrl = page.url();
    // The stage control is read and set through helpers/pathology-case.ts (2026-10-08) so a
    // redesigned picker cannot make this tripwire "fail as expected" on a locator error.
    await setStage(page, 'COMPLETED');
    await pressCaseSave(page);   // the case-level Save
    await page.waitForTimeout(2500);
    await page.goto(caseUrl, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main').getByText(labNo).first()).toBeVisible({ timeout: 20_000 });
    await page.waitForLoadState('networkidle');
    const status = await readStage(page);
    expect(status, 'an empty IHC case is not stored as Completed').not.toBe('Completed');
  });

  test('TC-PATHW-03: an empty case cannot be saved as Completed', async ({ page }) => {
    // FLIP-WHEN-FIXED (R51). By hand on 2026-09-27 a case completed with no blocks, slides,
    // report or pathologist; Cytology and IHC behave the same.
    test.fail();
    await openCase(page);
    const caseUrl = page.url();
    // REWORKED 2026-10-08: the stage picker is a Carbon dropdown now, so the old selectOption threw
    // and this tripwire "failed as expected" without testing anything.
    await setStage(page, 'COMPLETED');
    await pressCaseSave(page);   // the case-level Save
    await page.waitForTimeout(2500);
    await page.goto(caseUrl, { waitUntil: 'domcontentloaded' });
    // Read the status only once the case has loaded: before that the select shows its
    // placeholder stage (an early read "passed" this tripwire by race on 2026-09-27).
    await expect(page.locator('main').getByText(labNo).first()).toBeVisible({ timeout: 20_000 });
    await page.waitForLoadState('networkidle');
    const status = await readStage(page);
    expect(status, 'an empty case is not stored as Completed').not.toBe('Completed');
  });
});
