/**
 * helpers/legacy-order-entry.ts
 *
 * Fixtures for cases that drive the legacy Add Order page (/SamplePatientEntry) end to end.
 * Moved 2026-10-08 out of tests/order-entry.spec.ts so non-conforming.spec.ts can share them.
 * The old cases used the testing server's demo data (patient "Abby Sebby" 0123456, HGB test 743
 * on sample type 4, the sites "Adiba SC" / "Anga, Dr"). None of that exists on a fresh or CI stack,
 * so these make their own patient, find a sample type and test the instance really has, and press
 * the wizard's own forward button.
 */
import { expect, type Page } from '@playwright/test';
import { BASE, orderWizardForward, selectOrderProgram, clickFormSearch, checkCarbonRadio } from './test-helpers';
import { createPatientViaAPI } from './data-factory';

/** Letters only: patient names reject digits ("invalid name format"). */
export const letters = (n: number) => n.toString(10).split('').map((d) => 'abcdefghij'[Number(d)]).join('');

export type SeededPatient = { id: string; code: string; lastName: string };

/** A patient made for this case, with a last name nobody else has. */
export async function seededPatient(page: Page, tag: string): Promise<SeededPatient> {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!localStorage.getItem('CSRF'), null, { timeout: 30_000 });
  const n = Date.now();
  const code = `QAOE${tag}${String(n).slice(-7)}`;
  const lastName = `Orderentry${letters(n % 10_000_000)}`;
  const created = await createPatientViaAPI(page, {
    nationalId: code, subjectNumber: code, firstName: 'Abby', lastName, gender: 'F', dateOfBirth: '01/01/1990',
  });
  expect(created.id, `seed a patient for ${tag}: ${created.detail}`).toBeTruthy();
  return { id: String(created.id), code, lastName };
}

/** A sample type that offers tests, Whole Blood when the instance has it, and its first test. */
export async function sampleTypeWithTest(page: Page): Promise<{ typeId: string; typeName: string; testId: string; testName: string }> {
  const found = await page.evaluate(async () => {
    const types = await (await fetch('/api/OpenELIS-Global/rest/user-sample-types')).json();
    const ordered = [...(types || [])].sort((a: any, b: any) => Number(!/whole blood/i.test(a.value)) - Number(!/whole blood/i.test(b.value)));
    for (const t of ordered.slice(0, 25)) {
      const r = await fetch(`/api/OpenELIS-Global/rest/sample-type-tests?sampleType=${t.id}`);
      if (!r.ok) continue;
      const j = await r.json();
      const test = (j?.tests || [])[0];
      if (test) return { typeId: String(t.id), typeName: String(t.value), testId: String(test.id), testName: String(test.name) };
    }
    return null;
  });
  expect(found, 'the instance has a sample type with at least one orderable test').toBeTruthy();
  return found!;
}

/** Legacy Add Order: find the seeded patient by last name and pick them. */
export async function legacyPickPatient(page: Page, p: SeededPatient): Promise<void> {
  await page.goto(`${BASE}/SamplePatientEntry`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#lastName')).toBeVisible({ timeout: 60_000 });
  await page.locator('#lastName').fill(p.lastName);
  expect(await clickFormSearch(page, '#lastName'), 'Add Order has a patient Search button').toBe(true);
  const row = page.locator(`[data-cy="patient-result-row-${p.id}"]`);
  await expect(row, `the seeded patient ${p.lastName} is found`).toBeAttached({ timeout: 20_000 });
  await checkCarbonRadio(page, row.locator('input[type="radio"]'));
}

/** From a picked patient through Program to the Add Sample step. */
export async function legacyToAddSample(page: Page): Promise<void> {
  await orderWizardForward(page).click();
  await selectOrderProgram(page);
  await orderWizardForward(page).click();
  await expect(page.locator('#sampleId_0'), 'the Add Sample step renders').toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(() => (document.querySelector('#sampleId_0') as HTMLSelectElement)?.options.length > 1, null, { timeout: 30_000 });
}

export async function legacyTickTest(page: Page, testId: string): Promise<void> {
  const id = `test_0_${testId}`;
  await expect(page.locator(`[id="${id}"]`), `the test checkbox ${id} is offered`).toBeAttached({ timeout: 15_000 });
  if (!(await page.locator(`[id="${id}"]`).isChecked())) await page.locator(`label[for="${id}"]`).click();
  await expect(page.locator(`[id="${id}"]`)).toBeChecked();
}

/** The Add Order step: generate a lab number, pick the referring site, name a requester. */
export async function legacyFillOrderStep(page: Page): Promise<string> {
  await page.getByRole('button', { name: /^Generate/ }).or(page.locator('a', { hasText: /^\s*Generate\s*$/ })).first().click();
  await expect.poll(async () => (await page.locator('#labNo').inputValue().catch(() => '')).trim(), { timeout: 15_000 }).not.toBe('');
  const labNo = (await page.locator('#labNo').inputValue()).trim();
  const site: string = await page.evaluate(async () => {
    const r = await fetch('/api/OpenELIS-Global/rest/displayList/SAMPLE_PATIENT_REFERRING_CLINIC', { headers: { Accept: 'application/json' } });
    const rows = r.ok ? await r.json() : [];
    return String((rows || [])[0]?.value ?? '');
  });
  expect(site, 'a referring clinic exists (ensureReferringClinic seeds one)').not.toBe('');
  await page.locator('#siteName').fill(site.slice(0, 6));
  await page.locator('main li').filter({ hasText: site }).first().click();
  await page.locator('input[placeholder="Enter Requester\'s First Name"]').fill('Quinn');
  await page.locator('input[placeholder="Enter Requester\'s Last Name"]').fill('Requester');
  return labNo;
}
