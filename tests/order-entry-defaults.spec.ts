/**
 * tests/order-entry-defaults.spec.ts
 *
 * Add Order defaults and dates, seen from a browser east of UTC (Port Moresby, UTC+10).
 * Written 2026-09-27 against testing 3.2.3.0 after the same walk by hand
 * (release-qa-3.2.3 R48, R52, R57; uncovered-workflows-catalogue TC-TZ-02, TC-TZ-05,
 * TC-OED-01). CI runs in UTC, where R52 and R48 cannot be seen at all.
 *
 * One order is placed through the Add Order wizard: Routine Testing, Serum, Glucose,
 * received today at 20:00 local, Date of next visit left empty.
 */
import { test, expect, Page } from '@playwright/test';
import { apiGet } from '../helpers/silentSave';
import { createPatientViaAPI, ensureReferringClinic } from '../helpers/data-factory';

const BASE = process.env.BASE_URL || process.env.BASE || 'https://testing.openelis-global.org';
test.use({ timezoneId: 'Pacific/Port_Moresby' });
test.describe.configure({ mode: 'serial' });

let labNo = '';
let defaultReception = '';   // HH:mm the wizard pre-filled
let localAtStep = '';        // HH:mm in the browser zone when that step loaded
let orderStepText = '';      // the Order step's text, for the label checks

async function next(page: Page) { await page.getByRole('button', { name: /^Next$/ }).click(); }

test.describe('Add Order defaults (UTC+10)', () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage({ timezoneId: 'Pacific/Port_Moresby' } as never);
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    const errors: string[] = [];
    const siteId = await ensureReferringClinic(page, errors);
    expect(siteId, errors.join(' | ')).toBeTruthy();
    const sites = await apiGet<Array<{ id: string; value: string }>>(page, '/rest/displayList/SAMPLE_PATIENT_REFERRING_CLINIC');
    const siteName = (sites.json ?? []).find(s => String(s.id) === String(siteId))?.value ?? '';
    const stamp = `${Date.now()}${Math.floor(Math.random() * 100)}`;
    const pt = await createPatientViaAPI(page, { nationalId: `QAOED${stamp}`, subjectNumber: `97${stamp}`, firstName: 'Defaults', lastName: 'Qaauto' });
    expect(pt.id, pt.detail).toBeTruthy();

    await page.goto(`${BASE}/SamplePatientEntry`, { waitUntil: 'domcontentloaded' });
    await page.locator('#patientId').fill(`97${stamp}`);
    await page.locator('main').getByRole('button', { name: /^Search$/ }).first().click();
    await expect(page.locator(`input[type="radio"][id="${pt.id}"]`)).toBeAttached({ timeout: 15_000 });
    await page.locator(`label[for="${pt.id}"]`).evaluate((el: HTMLLabelElement) => el.click());
    await next(page);
    await page.waitForLoadState('networkidle');
    await page.locator('#additionalQuestionsSelect').selectOption({ label: 'Routine Testing' });
    await next(page);
    await page.locator('#sampleId_0').selectOption({ label: 'Serum' });
    await page.locator('main label').filter({ hasText: /^Glucose/ }).first().click();
    await next(page);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    localAtStep = await page.evaluate(() => new Date().toTimeString().slice(0, 5));
    defaultReception = `${await page.locator('#order_receivedTime_hour').inputValue()}:${await page.locator('#order_receivedTime_minute').inputValue()}`;
    await expect(page.locator('#order_nextVisitDate'), 'Date of next visit starts empty').toHaveValue('');
    orderStepText = await page.locator('main').innerText();

    await page.locator('main').getByText(/^Generate$/).click();
    await expect(page.locator('#labNo')).not.toHaveValue('', { timeout: 10_000 });
    labNo = await page.locator('#labNo').inputValue();
    await page.locator('#order_receivedTime_hour').selectOption('20');   // after 14:00 local: the R48 window
    await page.locator('#order_receivedTime_minute').selectOption('00');
    await expect(async () => {
      await page.locator('#siteName').fill('');
      await page.locator('#siteName').fill(siteName.split(' ')[0]);
      await expect(page.getByText(siteName, { exact: true }).locator('visible=true').first()).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 30_000 });
    await page.getByText(siteName, { exact: true }).locator('visible=true').first().click();
    await page.locator('#requesterFirstName').fill('Qadoc');
    await page.locator('#requesterLastName').fill('Defaults');
    const post = page.waitForResponse(r => /\/rest\/SamplePatientEntry$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST');
    await page.getByRole('button', { name: /^Submit$/ }).click();
    expect((await post).status(), 'order save answers 200').toBe(200);
    await page.close();
  });

  test('TC-OED-00: CANARY the order saved with the received date and time entered', async ({ page }) => {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    const r = await apiGet<{ sampleOrderItems?: { receivedTime?: string; receivedDateForDisplay?: string } }>(page, `/rest/SampleEdit?accessionNumber=${labNo}`);
    const today = await page.evaluate(() => { const d = new Date(); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; });
    expect(r.json?.sampleOrderItems?.receivedTime, 'received time as entered').toBe('20:00');
    expect(r.json?.sampleOrderItems?.receivedDateForDisplay, 'received today (local)').toBe(today);
  });

  test('TC-TZ-05: Reception Time defaults to the local clock', async () => {
    // FLIP-WHEN-FIXED (R52). Observed 2026-09-27: 08:50 pre-filled at 18:52 local (UTC).
    test.fail();
    const mins = (hm: string) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
    const diff = Math.abs(mins(defaultReception) - mins(localAtStep));
    expect(Math.min(diff, 1440 - diff), `pre-filled ${defaultReception} vs local ${localAtStep}`).toBeLessThanOrEqual(3);
  });

  test('TC-OED-01: an empty Date of next visit stays empty', async ({ page }) => {
    // FLIP-WHEN-FIXED (R57). Observed 2026-09-27: today's date stored.
    test.fail();
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    const r = await apiGet<{ sampleOrderItems?: { nextVisitDate?: string } }>(page, `/rest/SampleEdit?accessionNumber=${labNo}`);
    expect(r.json?.sampleOrderItems?.nextVisitDate ?? '', 'no next visit date stored').toBe('');
  });

  test('TC-TZ-02: Order Programs shows the received date the order was saved with', async ({ page }) => {
    // FLIP-WHEN-FIXED (R48). Observed 2026-09-27: orders received after 14:00 local listed as the next day.
    test.fail();
    await page.goto(`${BASE}/genericProgram`, { waitUntil: 'domcontentloaded' });
    const search = page.getByPlaceholder(/Accession/i).first();
    await search.fill(labNo);
    await search.press('Enter');
    const row = page.locator('tbody tr', { hasText: labNo }).first();
    await expect(row).toBeVisible({ timeout: 20_000 });
    const shown = ((await row.innerText()).match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/) ?? []);
    const today = await page.evaluate(() => { const d = new Date(); return [d.getMonth() + 1, d.getDate(), d.getFullYear()]; });
    expect([Number(shown[1]), Number(shown[2]), Number(shown[3])], `Order Programs date ${shown[0]}`).toEqual(today);
  });

  test('TC-I18NK-04: payment status options are labels, not message keys', async () => {
    // FLIP-WHEN-FIXED (R53d). Observed 2026-09-27: normalCash / normalInsurance / reducedCash /
    // reducedInsurance shown as the option text.
    test.fail();
    expect(orderStepText, 'the Order step rendered').toMatch(/payment status/i);
    expect(orderStepText, 'no raw payment keys').not.toMatch(/\b(normalCash|normalInsurance|reducedCash|reducedInsurance)\b/);
  });
});
