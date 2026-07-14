// Legacy clinical Add Order (/SamplePatientEntry) — the OLD patient-first, clinical-only wizard.
//
// WHY THIS SPEC EXISTS: the NEW unified wizard (/order/enter, /order/{clinical,env,vector}/enter)
// currently drops the sample's tests server-side — its decoupled `sample-type-requests` path hits a
// Hibernate type-mismatch in SampleTypeRequestDAOImpl (sampleId bound as Integer vs Sample.id String;
// OGC-1132). The LEGACY page at /SamplePatientEntry does NOT use that path — it submits a single
// `POST /rest/SamplePatientEntry` with the sample+tests embedded in `sampleXML`, so the analysis is
// created directly and the order is resultable. Verified live 2026-07-14 (order DEV01260000000000027:
// order.samples=1, 1 analysis). This spec pins that working flow end-to-end.
//
// Flow: Patient Info -> Program Selection -> Add Sample -> Add Order.
// Lab number is generated in the LAST step (Add Order), NOT step 1 (that mismatch tripped earlier runs).
//
// Run: BASE=https://testing.openelis-global.org OE_USER=admin OE_PASS='adminADMIN!' \
//   npx playwright test --config=playwright.config.ts --project=docs tests/docs/legacy-clinical-order.docs.spec.ts
import { test, expect } from '@playwright/test';
import { go, shot, saveWalkthrough } from './capture';
import { trackWrites, assertOrderPersisted, assertSamplePersisted } from './order-helpers';

test('Legacy clinical Add Order (/SamplePatientEntry) — RBC/Whole Blood persists a resultable analysis', async ({ page }, info) => {
  test.setTimeout(180000);
  const writes = trackWrites(page);
  // Log the SamplePatientEntry response body on non-2xx so a 400 reason is visible.
  page.on('response', async (r) => {
    if (/SamplePatientEntry/.test(r.url()) && r.request().method() === 'POST' && r.status() >= 400) {
      console.log('SPE_ERROR ' + r.status() + ' ' + (await r.text().catch(() => '')).slice(0, 400));
    }
  });

  // --- Patient Info ---
  await go(page, '/SamplePatientEntry');
  await page.getByRole('button', { name: /^New Patient$/i }).click();
  await page.waitForTimeout(800);
  await page.locator('#subjectNumber').fill('QA_AUTO_UHID_LEG');
  await page.locator('#nationalId').fill('QA_AUTO_NID_LEG');
  await page.locator('#lastName').fill('LegacyLast');
  await page.locator('#firstName').fill('LegacyTest');
  // NOTE: both the Patient-Search DOB and the New-Patient DOB use Carbon's default id
  // "date-picker-default-id" — scope to the New Patient form (the last one on the page).
  await page.locator('#date-picker-default-id').last().fill('10/10/1980');
  // Gender: click the VISIBLE label (clicking the hidden Carbon radio hangs).
  await page.locator('label[for="radio-1"]').click().catch(async () => {
    await page.getByText(/^Male$/).first().click();
  });
  await shot(page, info, 'Patient Info', { fullPage: false });
  await page.getByRole('button', { name: /^Next$/ }).click();
  await page.waitForTimeout(1200);

  // --- Program Selection ---
  await page.locator('#additionalQuestionsSelect').selectOption({ label: 'Routine Testing' });
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /^Next$/ }).click();
  await page.waitForTimeout(1200);

  // --- Add Sample: Whole Blood + RBC ---
  await page.locator('#sampleId_0').selectOption({ label: 'Whole Blood' });
  await page.waitForTimeout(1200);                                  // tests load after sample-type change
  await page.locator('label[for="test_0_14"]').click();            // Red Blood Cells Count (RBC)
  await expect(page.locator('#test_0_14')).toBeChecked();
  await shot(page, info, 'Add Sample — RBC', { fullPage: false });
  await page.getByRole('button', { name: /^Next$/ }).click();
  await page.waitForTimeout(1200);

  // --- Add Order: generate lab number HERE, requester (free text) + site, submit ---
  // "Generate" is a link here; click it via a DOM click (matches the verified manual step),
  // then poll #labNo until the generated accession appears.
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('a,button')]
      .find(e => /^\s*Generate\s*$/i.test((e.textContent || '').trim()));
    if (el) (el as HTMLElement).click();
  });
  let lab = '';
  for (let i = 0; i < 12; i++) {
    lab = (await page.locator('#labNo').inputValue().catch(() => '')).trim();
    if (lab) break;
    await page.waitForTimeout(500);
  }
  expect(lab, 'a lab number was generated').toMatch(/\w{6,}/);  // read the EXACT accession
  console.log('LEGACY_ORDER lab=' + lab);
  await page.locator('#requesterFirstName').fill('QA');
  await page.locator('#requesterLastName').fill('Tester');
  // Site is an autocomplete — type, then click the leaf suggestion via a DOM click (the exact
  // step verified by hand; a plain getByText click hits a wrapper and doesn't bind referringSiteId).
  await page.locator('#siteName').fill('Mulago');
  await page.waitForTimeout(1400);
  await page.evaluate(() => {
    const opt = [...document.querySelectorAll('[role=option],.autocomplete__item,li,[class*="menu"] *,[class*="suggest"] *')]
      .find(e => (e as HTMLElement).children.length === 0 && /^\s*Mulago\s*$/i.test((e.textContent || '')));
    if (opt) (opt as HTMLElement).click();
  });
  await page.waitForTimeout(700);
  await shot(page, info, 'Add Order — ready to submit', { fullPage: false });

  await page.getByRole('button', { name: /^Submit$/ }).click();
  await page.waitForTimeout(4000);
  console.log('LEGACY_WRITES=' + JSON.stringify(writes));

  // A single SamplePatientEntry POST (2xx) should carry the sample; NO sample-type-requests call.
  assertOrderPersisted(writes, 'legacy clinical order');
  expect(writes.some(w => /sample-type-requests/.test(w.url)),
    'legacy page must NOT use the decoupled sample-type-requests path').toBeFalsy();

  // Gold standard: the sample + its test actually materialized (guards against the empty-order drop).
  await assertSamplePersisted(page, lab);
  await saveWalkthrough(page, info).catch(() => {});
});
