// Place a clinical order for the multi-component QA test 446 (QA_AUTO_MC_*, Serum) via the LEGACY
// /SamplePatientEntry wizard — the flow that actually persists a resultable analysis on testing
// (the unified /order/enter drops the sample's tests via OGC-1132). Mirrors legacy-clinical-order.
// Goal: give the unified /Results worklist an analysis that exercises the multi-select (M) cell.
// Run: BASE=https://testing.openelis-global.org OE_USER=admin OE_PASS='adminADMIN!' \
//   npx playwright test --project=docs tests/docs/order-446.docs.spec.ts
import { test, expect } from '@playwright/test';
import { go, shot, saveWalkthrough } from './capture';
import { trackWrites, assertOrderPersisted, assertSamplePersisted } from './order-helpers';

test('Legacy /SamplePatientEntry — order QA_AUTO_MC (Serum) persists a resultable analysis', async ({ page }, info) => {
  test.setTimeout(180000);
  const writes = trackWrites(page);
  page.on('response', async (r) => {
    if (/SamplePatientEntry/.test(r.url()) && r.request().method() === 'POST' && r.status() >= 400) {
      console.log('SPE_ERROR ' + r.status() + ' ' + (await r.text().catch(() => '')).slice(0, 400));
    }
  });

  // --- Patient Info (IDs validated ^[-a-z0-9/]*$ — hyphens, NO underscores) ---
  await go(page, '/SamplePatientEntry');
  await page.getByRole('button', { name: /^New Patient$/i }).click();
  await page.waitForTimeout(800);
  await page.locator('#subjectNumber').fill('QA-AUTO-UHID-MC');
  await page.locator('#nationalId').fill('QA-AUTO-NID-MC');
  await page.locator('#lastName').fill('MultiCell');
  await page.locator('#firstName').fill('Poly');
  await page.locator('#date-picker-default-id').last().fill('10/10/1980');
  await page.locator('label[for="radio-1"]').click().catch(async () => { await page.getByText(/^Male$/).first().click(); });
  await page.getByRole('button', { name: /^Next$/ }).click();
  await page.waitForTimeout(1200);

  // --- Program Selection ---
  await page.locator('#additionalQuestionsSelect').selectOption({ label: 'Routine Testing' }).catch(() => {});
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /^Next$/ }).click();
  await page.waitForTimeout(1200);

  // --- Add Sample: Serum + QA_AUTO_MC (find the test's checkbox label dynamically) ---
  await page.locator('#sampleId_0').selectOption({ label: 'Serum' });
  await page.waitForTimeout(1500);
  const forAttr = await page.evaluate(() => {
    const lbl = [...document.querySelectorAll('label')].find(l => /QA_AUTO_MC_\d+/.test(l.textContent || ''));
    if (lbl) { (lbl as HTMLElement).click(); return lbl.getAttribute('for') || 'clicked'; }
    return '';
  });
  console.log('MC_TEST_LABEL for=' + forAttr);
  expect(forAttr, 'QA_AUTO_MC test row was found + clicked under Serum').toBeTruthy();
  await page.waitForTimeout(400);
  await shot(page, info, 'Add Sample — QA_AUTO_MC', { fullPage: false });
  await page.getByRole('button', { name: /^Next$/ }).click();
  await page.waitForTimeout(1200);

  // --- Add Order: generate lab, requester (free text) + site Mulago, submit ---
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('a,button')].find(e => /^\s*Generate\s*$/i.test((e.textContent || '').trim()));
    if (el) (el as HTMLElement).click();
  });
  let lab = '';
  for (let i = 0; i < 12; i++) { lab = (await page.locator('#labNo').inputValue().catch(() => '')).trim(); if (lab) break; await page.waitForTimeout(500); }
  expect(lab, 'a lab number was generated').toMatch(/\w{6,}/);
  console.log('ORDER446 lab=' + lab);
  await page.locator('#requesterFirstName').fill('QA');
  await page.locator('#requesterLastName').fill('Tester');
  await page.locator('#siteName').fill('Mulago');
  await page.waitForTimeout(1400);
  await page.evaluate(() => {
    const opt = [...document.querySelectorAll('[role=option],.autocomplete__item,li,[class*="menu"] *,[class*="suggest"] *')]
      .find(e => (e as HTMLElement).children.length === 0 && /^\s*Mulago\s*$/i.test((e.textContent || '')));
    if (opt) (opt as HTMLElement).click();
  });
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: /^Submit$/ }).click();
  await page.waitForTimeout(4000);
  console.log('ORDER446_WRITES=' + JSON.stringify(writes));
  assertOrderPersisted(writes, 'legacy QA_AUTO_MC order');
  await assertSamplePersisted(page, lab);
  console.log('ORDER446_DONE lab=' + lab);
  await saveWalkthrough(page, info).catch(() => {});
});
