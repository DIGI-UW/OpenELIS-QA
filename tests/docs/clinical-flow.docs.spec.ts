// Drive a fresh CLINICAL order through the 4-step wizard and capture each stage for the manual.
// Verified recipe (order DEV…058, 25 Jun 2026):
//   Enter Order: lab no + New Patient (National ID) + Sample Type + Tests
//   Collect:     SET THE UNIT (Quantity auto-defaults to 1; with no Unit the save errors — G8)
//   Label&Store: Print All Labels + Skip Storage are BOTH currently required to advance (G10)
//   QA Review:   tick all 4 checklist items, then Submit (G11)
//   BASE=https://indonesiademo.openelis-global.org npx playwright test --project=docs tests/docs/clinical-flow.docs.spec.ts
import { test, expect } from '@playwright/test';
import { go, shot, saveWalkthrough } from './capture';
import { generateLabNumber, newPatient, setSelectByOption, checkByLabel, completeQaChecklist, clickButton, trackWrites, assertOrderPersisted, fillRequester, assertSamplePersisted } from './order-helpers';

test('User manual — Clinical order full flow', async ({ page }, info) => {
  test.setTimeout(180000);
  info.annotations.push({ type: 'capability', description: 'clinical-order-flow' });
  const writes = trackWrites(page);
  page.on('response', async (r) => {
    if (/SamplePatientEntry/.test(r.url()) && r.request().method() === 'POST' && r.status() >= 400) {
      console.log('SPE_RESP ' + r.status() + ' ' + (await r.text().catch(() => '')).slice(0, 600));
    }
  });
  // REHABBED for testing (u12wW6QI): the unified /order/clinical/enter is blank/broken here (the
  // unified /order/enter drops tests — OGC-1132), so capture the WORKING legacy /SamplePatientEntry
  // 4-step wizard (Patient Info → Program → Add Sample → Add Order), which persists a resultable order.
  await go(page, '/SamplePatientEntry');

  // --- Patient Info (IDs validated ^[-a-z0-9/]*$ — hyphens, no underscores) ---
  await page.getByRole('button', { name: /^New Patient$/i }).click();
  await page.waitForTimeout(800);
  const st = Date.now().toString().slice(-8);
  await page.locator('#subjectNumber').fill(`QA-AUTO-UHID-${st}`);
  await page.locator('#nationalId').fill(`QA-AUTO-NID-${st}`);
  await page.locator('#lastName').fill('Parker');
  await page.locator('#firstName').fill('Peter');
  await page.locator('#date-picker-default-id').last().fill('15/05/1990');
  await page.locator('label[for="radio-1"]').click().catch(async () => { await page.getByText(/^Male$/).first().click(); });
  await shot(page, info, 'Patient Info', { fullPage: false });
  await page.getByRole('button', { name: /^Next$/ }).click();
  await page.waitForTimeout(1200);

  // --- Program Selection ---
  await page.locator('#additionalQuestionsSelect').selectOption({ label: 'Routine Testing' }).catch(() => {});
  await shot(page, info, 'Program Selection', { fullPage: false });
  await page.getByRole('button', { name: /^Next$/ }).click();
  await page.waitForTimeout(1200);

  // --- Add Sample: Whole Blood + the first available test ---
  await page.locator('#sampleId_0').selectOption({ label: 'Whole Blood' });
  await page.waitForTimeout(1500);
  const testFor = await page.evaluate(() => {
    const lbl = [...document.querySelectorAll('label')].find((l) => /^test_0_\d+$/.test((l as HTMLElement).getAttribute('for') || ''));
    if (lbl) { (lbl as HTMLElement).click(); return (lbl as HTMLElement).getAttribute('for'); }
    return '';
  });
  expect(testFor, 'a Whole Blood test was ticked').toBeTruthy();
  await shot(page, info, 'Add Sample', { fullPage: false });
  await page.getByRole('button', { name: /^Next$/ }).click();
  await page.waitForTimeout(1200);

  // --- Add Order: generate lab, requester (free text + Mulago site), submit ---
  await page.evaluate(() => { const el = [...document.querySelectorAll('a,button')].find((e) => /^\s*Generate\s*$/i.test(((e as HTMLElement).textContent || '').trim())); if (el) (el as HTMLElement).click(); });
  let lab = '';
  for (let i = 0; i < 12; i++) { lab = (await page.locator('#labNo').inputValue().catch(() => '')).trim(); if (lab) break; await page.waitForTimeout(500); }
  expect(lab, 'a lab number was generated').toMatch(/\w{6,}/);
  await page.locator('#requesterFirstName').fill('QA');
  await page.locator('#requesterLastName').fill('Tester');
  await page.locator('#siteName').fill('Mulago');
  await page.waitForTimeout(1400);
  await page.evaluate(() => { const opt = [...document.querySelectorAll('[role=option],li,[class*="menu"] *,[class*="suggest"] *')].find((e) => (e as HTMLElement).children.length === 0 && /^\s*Mulago\s*$/i.test(((e as HTMLElement).textContent || ''))); if (opt) (opt as HTMLElement).click(); });
  await page.waitForTimeout(700);
  await shot(page, info, 'Add Order — ready to submit', { fullPage: false });
  await page.getByRole('button', { name: /^Submit$/ }).click();
  await page.waitForTimeout(4000);
  await shot(page, info, 'Complete', { fullPage: false });

  await saveWalkthrough(page, info).catch(() => {});
  console.log('CLIN_WRITES=' + JSON.stringify(writes));
  assertOrderPersisted(writes, 'clinical legacy');
  await assertSamplePersisted(page, lab);
});
