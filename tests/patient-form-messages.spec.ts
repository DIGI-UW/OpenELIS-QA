/**
 * tests/patient-form-messages.spec.ts
 *
 * Add Patient (Patient > Add Or Modify Patient > New Patient, /PatientManagement/new): the
 * messages a refused save shows (OGC-1497, fixed by OpenELIS-Global-2 #4731, merged 15 Oct 2026).
 * Catalogue: patient-form-messages.md (TC-PFM-*).
 *
 * Expected (OGC-1497): one message per field, next to its field; for the date of birth, one message
 * that says an age is accepted too. #4731 also moved the schema's messages to React Intl keys and,
 * once Save has been pressed, re-checks each field as it changes, so a corrected field clears at
 * once and the next Save click saves (before, the click that blurred the field removed its message,
 * moved the button and was lost).
 *
 * DATA. TC-PFM-02 saves one patient "Qapfm<stamp in letters>" with a National ID unique to the run. Patients
 * are not deleted.
 *
 * Written 2026-10-15 against local develop (images 2026-10-15).
 */
import { test, expect, type Page } from '@playwright/test';

test.setTimeout(120_000);

const NEW = '/PatientManagement/new';
const SEX_MSG = "Select the patient's sex.";
const DOB_MSG = 'Enter a date of birth or an age in years, months or days.';

async function openNew(page: Page) {
  await page.goto(NEW, { waitUntil: 'domcontentloaded' });
  const save = page.getByRole('button', { name: 'Save', exact: true });
  await expect(save).toBeVisible({ timeout: 60_000 });
  return save;
}

test.describe('Add Patient messages (OGC-1497)', () => {
  test('TC-PFM-01: Save on an empty form shows the sex and birth date messages once each, next to their fields, and no old duplicate wording', async ({ page }) => {
    const save = await openNew(page);
    await save.click();
    await expect(page.getByText(SEX_MSG), 'sex: one message').toHaveCount(1);
    await expect(page.getByText(DOB_MSG), 'birth date or age: one message').toHaveCount(1);
    await expect(page.getByText('Sex is Required'), 'not the old wording').toHaveCount(0);
    await expect(page.getByText('Patient Birth date Required'), 'not the old wording').toHaveCount(0);
    // Next to its field: the sex message sits inside the gender fieldset.
    const sexGroup = page.locator('fieldset').filter({ has: page.locator('label[for="radio-2"]') });
    await expect(sexGroup.getByText(SEX_MSG), 'inside the sex group').toHaveCount(1);
    // No message appears twice anywhere on the form.
    const texts = await page.locator('.cds--form-requirement, [class*="error"]').allInnerTexts();
    const seen = new Map<string, number>();
    for (const t of texts.map((x) => x.trim()).filter(Boolean)) seen.set(t, (seen.get(t) ?? 0) + 1);
    expect([...seen].filter(([, n]) => n > 1), 'no message shown twice').toEqual([]);
  });

  test('TC-PFM-02: after a refused save, a corrected field clears as it is typed, and one Save click saves the patient', async ({ page }) => {
    const save = await openNew(page);
    await save.click();
    await expect(page.getByText(DOB_MSG)).toHaveCount(1);
    const s = `${Date.now()}`.slice(-7);
    // Names take letters only ("invalid name format" otherwise): spell the stamp as letters.
    const letters = s.replace(/\d/g, (d) => 'abcdefghij'[Number(d)]);
    await page.locator('#nationalId').fill(`QAPFM${s}`);
    await page.locator('#lastName').fill(`Qapfm${letters}`);
    await page.locator('#firstName').fill('Messages');
    await page.locator('label[for="radio-2"]').click();
    await expect(page.getByText(SEX_MSG), 'sex clears when chosen').toHaveCount(0);
    await page.locator('#years').fill('34');
    await expect(page.getByText(DOB_MSG), 'the age clears the birth date message without leaving the field').toHaveCount(0);
    const saved = page.waitForResponse((r) => r.request().method() === 'POST' && /\/rest\/PatientManagement$/.test(r.url()), { timeout: 60_000 });
    await save.click();
    expect((await saved).status(), 'the first click saves').toBeLessThan(300);
    await expect(page).toHaveURL(/\/PatientManagement\/\d+$/, { timeout: 60_000 });
  });

  test('TC-PFM-03: an email that is not an email is reported once', async ({ page }) => {
    await openNew(page);
    const email = page.locator('#email');
    test.skip(!(await email.count()), 'no email field on this form');
    await email.fill('not-an-email');
    await email.blur();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const msgs = (await page.locator('.cds--form-requirement').allInnerTexts()).filter((t) => /email/i.test(t));
    expect(msgs.length, `one email message (${msgs.join(' | ')})`).toBe(1);
  });
});
