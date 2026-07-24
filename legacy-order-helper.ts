import { Page, expect } from '@playwright/test';

const BASE = process.env.BASE || 'https://testing.openelis-global.org';

/**
 * Place a Serum clinical order carrying the test/panel `name` via the LEGACY /SamplePatientEntry
 * wizard, and return the generated accession (lab number).
 *
 * WHY: the unified /order/enter path drops the sample's tests (OGC-1132: Hibernate type-mismatch in
 * SampleTypeRequestDAOImpl), so orders placed there are non-resultable and the runtime specs that
 * relied on it timed out at result entry. The legacy page submits a single POST /rest/SamplePatientEntry
 * with the sample+tests embedded in sampleXML → the analysis is created directly and is immediately
 * resultable (verified live 2026-07-24, e.g. DEV01260000000000037: samples=1, 1 analysis).
 *
 * Flow: Patient Info → Program Selection → Add Sample (Serum + tick `name`) → Add Order (generate lab
 * + requester Mulago/QA + Submit). Patient IDs use hyphens (validated ^[-a-z0-9/]*$, NO underscores).
 * The order is resultable on Submit — no Collect walk needed. Callers should navigate to result entry
 * by the returned accession.
 */
export async function placeLegacySerumOrder(page: Page, name: string): Promise<string> {
  const stamp = Date.now().toString().slice(-8);
  await page.goto(`${BASE}/SamplePatientEntry`, { waitUntil: 'domcontentloaded' });

  // --- Patient Info ---
  await page.getByRole('button', { name: /^New Patient$/i }).click();
  await page.waitForTimeout(800);
  await page.locator('#subjectNumber').fill(`QA-AUTO-UHID-${stamp}`);
  await page.locator('#nationalId').fill(`QA-AUTO-NID-${stamp}`);
  await page.locator('#lastName').fill('QARuntime');
  await page.locator('#firstName').fill('Rval');
  await page.locator('#date-picker-default-id').last().fill('02/02/1985');
  await page.locator('label[for="radio-1"]').click().catch(async () => { await page.getByText(/^Male$/).first().click(); });
  await page.getByRole('button', { name: /^Next$/ }).click();
  await page.waitForTimeout(1200);

  // --- Program Selection ---
  await page.locator('#additionalQuestionsSelect').selectOption({ label: 'Routine Testing' }).catch(() => {});
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /^Next$/ }).click();
  await page.waitForTimeout(1200);

  // --- Add Sample: Serum + tick the test/panel by visible label text ---
  await page.locator('#sampleId_0').selectOption({ label: 'Serum' });
  await page.waitForTimeout(1500);
  const clicked = await page.evaluate((nm) => {
    const lbl = [...document.querySelectorAll('label')].find((l) => ((l as HTMLElement).textContent || '').trim().includes(nm));
    if (lbl) { (lbl as HTMLElement).click(); return true; }
    return false;
  }, name);
  if (!clicked) throw new Error(`placeLegacySerumOrder: test/panel "${name}" not found under Serum on /SamplePatientEntry`);
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /^Next$/ }).click();
  await page.waitForTimeout(1200);

  // --- Add Order: generate lab (link), requester (free text + Mulago site), submit ---
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('a,button')].find((e) => /^\s*Generate\s*$/i.test(((e as HTMLElement).textContent || '').trim()));
    if (el) (el as HTMLElement).click();
  });
  let accession = '';
  for (let i = 0; i < 12; i++) {
    accession = (await page.locator('#labNo').inputValue().catch(() => '')).trim();
    if (accession) break;
    await page.waitForTimeout(500);
  }
  expect(accession, 'legacy order generated a lab number').toMatch(/\w{6,}/);
  await page.locator('#requesterFirstName').fill('QA');
  await page.locator('#requesterLastName').fill('Tester');
  await page.locator('#siteName').fill('Mulago');
  await page.waitForTimeout(1400);
  await page.evaluate(() => {
    const opt = [...document.querySelectorAll('[role=option],.autocomplete__item,li,[class*="menu"] *,[class*="suggest"] *')]
      .find((e) => (e as HTMLElement).children.length === 0 && /^\s*Mulago\s*$/i.test(((e as HTMLElement).textContent || '')));
    if (opt) (opt as HTMLElement).click();
  });
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: /^Submit$/ }).click();
  await page.waitForTimeout(3500);
  return accession;
}
