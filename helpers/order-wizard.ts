/**
 * helpers/order-wizard.ts
 *
 * Place a clinical order through the Add Order wizard the way a user does:
 * patient -> program (+ questionnaire answers) -> sample + test -> order details -> Submit.
 * Extracted 2026-09-27 from cytology-workflow.spec.ts so the case-workflow specs
 * (Cytology, Pathology) share one path. Every wait below exists because a run failed
 * without it; see the comments.
 */
import { expect, Page } from '@playwright/test';
import { apiGet } from './silentSave';

const BASE = process.env.BASE_URL || process.env.BASE || 'https://testing.openelis-global.org';

export interface WizardOrder {
  subjectNumber: string;
  patientId: string;
  siteName: string;
  /** Program label on the Program step, e.g. 'Cytology', 'Histopathology'. */
  program: string;
  /** Text that proves the program's questionnaire rendered, e.g. /Nature of Specimen/. */
  questionnaireMarker?: RegExp;
  /** Option labels to pick in the questionnaire's dropdowns (one per dropdown). */
  answers?: string[];
  sampleType: string;
  /** Test label prefix on the Sample step. */
  testName: string;
  requesterLastName?: string;
}

export async function orderThroughWizard(page: Page, o: WizardOrder): Promise<string> {
  await page.goto(`${BASE}/SamplePatientEntry`, { waitUntil: 'domcontentloaded' });
  // 1. Patient
  await page.locator('#patientId').fill(o.subjectNumber);
  await page.locator('main').getByRole('button', { name: /^Search$/ }).first().click();
  await expect(page.locator(`input[type="radio"][id="${o.patientId}"]`)).toBeAttached({ timeout: 15_000 });
  await page.locator(`label[for="${o.patientId}"]`).click();
  await page.getByRole('button', { name: /^Next$/ }).click();

  // 2. Program + questionnaire. Case workflows (Cytology, Pathology) are opened from the
  // PROGRAM, not the test's lab unit (release-qa-3.2.3 R56). Selecting before the step
  // settles let it reset to blank in two runs, so settle, then select until it sticks.
  const program = page.locator('#additionalQuestionsSelect');
  const opt = program.locator('option', { hasText: new RegExp(`^${o.program}$`) });
  await expect(opt).toBeAttached({ timeout: 15_000 });
  const value = (await opt.getAttribute('value')) ?? '';
  await page.waitForLoadState('networkidle');
  await expect(async () => {
    await program.selectOption({ label: o.program });
    if (o.questionnaireMarker) await expect(page.getByText(o.questionnaireMarker).first()).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(1000);
    await expect(program).toHaveValue(value, { timeout: 1000 });
  }, `the ${o.program} program is selected`).toPass({ timeout: 45_000 });
  for (const answer of o.answers ?? []) {
    const sel = page.locator('main select').filter({ has: page.locator('option', { hasText: new RegExp(`^${answer}$`) }) }).first();
    await sel.selectOption({ label: answer });
  }
  await page.getByRole('button', { name: /^Next$/ }).click();

  // 3. Sample + test
  await page.locator('#sampleId_0').selectOption({ label: o.sampleType });
  await page.locator('main label').filter({ hasText: new RegExp(`^${o.testName}`) }).first().click();
  await page.evaluate(() => {
    const el = document.getElementById('collectionDate_0') as any;
    el?._flatpickr?.set('maxDate', null); // R26: a full load can clamp maxDate to 9 January
    el?._flatpickr?.setDate(new Date(), true);
  });
  await page.getByRole('button', { name: /^Next$/ }).click();

  // 4. Order details. The site suggestions are built from data that arrives after the step
  // mounts; typing earlier gave "No suggestions available". One input event (fill) per try.
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  await page.locator('main').getByText(/^Generate$/).click();
  await expect(page.locator('#labNo')).not.toHaveValue('', { timeout: 10_000 });
  const labNo = await page.locator('#labNo').inputValue();
  await expect(async () => {
    await page.locator('#siteName').fill('');
    await page.locator('#siteName').fill(o.siteName.split(' ')[0]);
    await expect(page.getByText(o.siteName, { exact: true }).locator('visible=true').first()).toBeVisible({ timeout: 3000 });
  }, 'the site search suggests the referring clinic').toPass({ timeout: 30_000 });
  // The suggestions are plain list items, not role=option.
  await page.getByText(o.siteName, { exact: true }).locator('visible=true').first().click();
  await expect(page.locator('#siteName'), 'the referring site is chosen').toHaveValue(o.siteName);
  await page.locator('#requesterFirstName').fill('Qadoc');
  await page.locator('#requesterLastName').fill(o.requesterLastName ?? 'Wizard');
  const post = page.waitForResponse(r => /\/rest\/SamplePatientEntry$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST');
  await page.getByRole('button', { name: /^Submit$/ }).click();
  expect((await post).status(), 'order save answers 200').toBe(200);
  await expect(page.getByText(/Successfully saved/i)).toBeVisible({ timeout: 15_000 });
  const saved = await apiGet<{ sampleOrderItems?: { program?: string } }>(page, `/rest/SampleEdit?accessionNumber=${labNo}`);
  expect(saved.json?.sampleOrderItems?.program, `${labNo} was saved under the ${o.program} program`).toBe(o.program);
  return labNo;
}
