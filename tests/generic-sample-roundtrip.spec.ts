/**
 * tests/generic-sample-roundtrip.spec.ts
 *
 * Generic Sample: create an order on /GenericSample/Order, then open it on Edit Order.
 * Written 2026-09-27 against testing 3.2.3.0 (release-qa-3.2.3 R68;
 * uncovered-workflows-catalogue TC-GSR-00..02). The existing generic-sample.spec.ts
 * checks that the pages render; nothing saved a generic sample and read it back.
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || process.env.BASE || 'https://testing.openelis-global.org';
test.describe.configure({ mode: 'serial' });

let accession = '';

test.describe('Generic Sample round trip', () => {
  test('TC-GSR-00: a generic sample order saves', async ({ page }) => {
    await page.goto(`${BASE}/GenericSample/Order`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Generate Lab Number' }).click();
    await expect(page.locator('#labNo')).not.toHaveValue('', { timeout: 15_000 });
    accession = await page.locator('#labNo').inputValue();
    await page.locator('#sampleType').selectOption({ label: 'Serum' });
    await page.locator('#quantity').fill('3');
    await page.locator('#sampleUnitOfMeasure').selectOption({ label: 'mL' });
    await page.locator('#from').fill('QA_GEN source');
    await page.locator('#collector').fill('QA_GEN collector');
    const saved = page.waitForResponse(r => r.url().includes('/rest/GenericSampleOrder') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    expect((await saved).status(), 'POST GenericSampleOrder').toBe(200);
    await expect(page.getByText(/Successfully saved/i).first()).toBeVisible({ timeout: 15_000 });
    const back = await page.evaluate(async (a) => (await fetch(`/api/OpenELIS-Global/rest/SampleEdit?accessionNumber=${a}`)).status, accession);
    expect(back, 'the sample exists (SampleEdit readback)').toBe(200);
  });

  test('TC-GSR-01: Edit Order opens the generic sample just saved', async ({ page }) => {
    // FLIP-WHEN-FIXED (R68). Observed 2026-09-27: "No sample found with this accession
    // number"; GET /rest/GenericSampleOrder answers 500 (transaction rolled back).
    test.skip(!accession, 'TC-GSR-00 did not create a sample');
    await page.goto(`${BASE}/GenericSample/Edit`, { waitUntil: 'domcontentloaded' });
    const box = page.locator('main input').first();
    await expect(box).toBeVisible({ timeout: 20_000 });
    await box.fill(accession);
    const got = page.waitForResponse(r => r.url().includes('/rest/GenericSampleOrder?accessionNumber='));
    await page.locator('main').getByRole('button', { name: 'Search', exact: true }).click();
    const status = (await got).status();
    test.fail();
    expect(status, 'GET GenericSampleOrder').toBe(200);
    await expect(page.getByText('No sample found with this accession number')).toHaveCount(0);
    await expect(page.locator('main')).toContainText('QA_GEN collector');
  });

  test('TC-GSR-06: Import rejects a file with none of the expected columns', async ({ page }) => {
    // FLIP-WHEN-FIXED (R69). Observed 2026-09-27: "foo,bar" validates as Valid, and Import
    // then creates a sample with no sample item. This test only validates; it never imports.
    await page.goto(`${BASE}/GenericSample/Import`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');
    await page.locator('main input[type=file]').setInputFiles({ name: 'qa_gen_probe.csv', mimeType: 'text/csv', buffer: Buffer.from('foo,bar\n1,2\n') });
    const res = page.waitForResponse(r => r.url().includes('/rest/GenericSampleOrder/validate'));
    await page.getByRole('button', { name: 'Validate', exact: true }).click();
    const body = await (await res).json();
    expect(typeof body.valid, 'validate answers with a verdict').toBe('boolean');
    test.fail();
    expect(body.valid, `validate: ${JSON.stringify(body).slice(0, 200)}`).toBe(false);
  });
});
