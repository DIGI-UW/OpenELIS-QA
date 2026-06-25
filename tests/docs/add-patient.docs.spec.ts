// Docs-capture flow for the "Add a patient" user-manual entry.
// Interactive (not just routes): search -> New Patient -> fill -> show Save. Uses obviously-fake
// test data and does NOT persist (no final Save click) per harness convention (don't create data).
//   npx playwright test --project=docs tests/docs/add-patient.docs.spec.ts
import { test } from '@playwright/test';
import { go, shot, saveWalkthrough, dismissModals } from './capture';

async function fillIf(page: any, selector: string, value: string) {
  const el = page.locator(selector).first();
  if (await el.count() && await el.isVisible().catch(() => false)) {
    await el.fill(value).catch(() => {});
  }
}

test('User manual — Add a patient walkthrough', async ({ page }, info) => {
  info.annotations.push({ type: 'capability', description: 'add-patient' });
  const pii: string[] = []; // test data only — nothing real to mask

  await go(page, '/PatientManagement');
  await shot(page, info, 'Add or modify patient — search');

  // Start a new patient record.
  const newBtn = page.getByRole('button', { name: /new patient/i }).first();
  if (await newBtn.isVisible().catch(() => false)) {
    await newBtn.click().catch(() => {});
    await page.waitForTimeout(1200);
    await dismissModals(page);
  }
  await shot(page, info, 'Blank new-patient form');

  // Fill core demographics with clearly-fake data. The new-patient form fields differ from the
  // search panel, so target by visible label (robust across the two layouts).
  const fillLabel = async (re: RegExp, value: string) => {
    const el = page.getByLabel(re).first();
    if (await el.count() && await el.isVisible().catch(() => false)) await el.fill(value).catch(() => {});
  };
  await fillLabel(/Last Name/i, 'QA-AUTO');
  await fillLabel(/First Name/i, 'Testpatient');
  await fillLabel(/National ID/i, 'QA-AUTO-NID-001');
  await fillLabel(/Unique Health ID/i, 'QA-AUTO-UHID-001');
  await fillLabel(/Primary phone/i, '5550-1234');
  // Date of Birth — Carbon date input, not label-associated; target by placeholder.
  await fillIf(page, 'input[placeholder="dd/mm/yyyy"]', '01/01/1990');
  // Gender radio (radios are safe to click; the Carbon CHECKBOX is the one that hangs).
  await page.getByText(/^Male$/).first().click().catch(() => {});

  await page.waitForTimeout(500);
  await shot(page, info, 'Completed patient details', { maskPii: pii });

  // Show the action area (Save/Add) without persisting.
  const save = page.getByRole('button', { name: /save|add patient|^add$|submit/i }).first();
  if (await save.isVisible().catch(() => false)) {
    await save.scrollIntoViewIfNeeded().catch(() => {});
    await shot(page, info, 'Save the patient record', { target: save });
  }

  await saveWalkthrough(page, info);
});
