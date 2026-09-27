/**
 * tests/aliquot-workflow.spec.ts
 *
 * Aliquot: split a sample item with a quantity into an aliquot, move its test, save, read
 * back. Written 2026-09-27 against testing 3.2.3.0 (release-qa-3.2.3 R66;
 * uncovered-workflows-catalogue TC-ALQW-00..03). Seeds two QA orders with 4 mL Serum.
 */
import { test, expect, Page } from '@playwright/test';
import { seedOrder } from '../helpers/data-factory';

const BASE = process.env.BASE_URL || process.env.BASE || 'https://testing.openelis-global.org';
const UOM_ML = process.env.QA_UOM_ML_ID || '47';
test.describe.configure({ mode: 'serial' });

let withTest = '';
let noTestAliquot = '';

async function search(page: Page, accession: string) {
  await page.goto(`${BASE}/Aliquot`, { waitUntil: 'domcontentloaded' });
  const box = page.locator('#accessionNumber');
  await expect(box).toBeVisible({ timeout: 20_000 });
  await box.fill(accession);
  await page.locator('#searchSample').click();
  await expect(page.locator('main tr.cds--parent-row').first()).toContainText(accession, { timeout: 20_000 });
}

async function openAliquoting(page: Page) {
  const row = page.locator('main tr.cds--parent-row').first();
  await row.locator('td button').first().click();
  await page.getByRole('button', { name: 'Show Aliquoting' }).click();
  await expect(page.getByText('Aliquoting Section')).toBeVisible({ timeout: 10_000 });
}

async function sampleItems(page: Page, accession: string): Promise<string[]> {
  return page.evaluate(async (a) => {
    const r = await fetch(`/api/OpenELIS-Global/rest/SampleItem?accessionNumber=${a}`);
    const j = await r.json();
    return (j.sampleItems || []).map((x: any) => String(x.externalId));
  }, accession);
}

test.describe('Aliquot workflow', () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    withTest = (await seedOrder(page, 'ALQ', { quantity: '4', uomId: UOM_ML })).accession;
    noTestAliquot = (await seedOrder(page, 'ALQN', { quantity: '4', uomId: UOM_ML })).accession;
    await page.close();
  });

  test('TC-ALQW-00: a sample with a quantity is listed with it on the Aliquot page', async ({ page }) => {
    await search(page, withTest);
    await expect(page.locator('main tr.cds--parent-row').first()).toContainText('4');
  });

  test('TC-ALQW-01: "Show Aliquoting" on its own opens the aliquoting section', async ({ page }) => {
    // FLIP-WHEN-FIXED (R66a). Observed 2026-09-27: the label toggles but the row stays closed
    // until the row's chevron is clicked as well.
    await search(page, withTest);
    await page.getByRole('button', { name: 'Show Aliquoting' }).click();
    test.fail();
    await expect(page.getByText('Aliquoting Section')).toBeVisible({ timeout: 5_000 });
  });

  test('TC-ALQW-02: an aliquot carrying the sample test saves and reads back', async ({ page }) => {
    await search(page, withTest);
    await openAliquoting(page);
    await page.getByRole('button', { name: 'Add Aliquot' }).click();
    const panel = page.locator('main tr.cds--expandable-row').last();
    await panel.locator('input[type=number]').fill('4');
    await panel.locator('input[type=number]').press('Tab');
    const move = panel.locator('select').first();
    await expect(move).toBeVisible();
    const opt = await move.locator('option').filter({ hasText: `${withTest}-1.1` }).first().getAttribute('value');
    await move.selectOption(opt!);
    await expect(panel).toContainText('All tests assigned');
    const posted = page.waitForRequest(r => r.url().includes('/rest/Aliquot') && r.method() === 'POST');
    await page.getByRole('button', { name: 'Save Aliquot Changes' }).click();
    const body = (await posted).postDataJSON();
    expect(JSON.stringify(body), 'the aliquot is in the request').toContain(`${withTest}-1.1`);
    await expect.poll(() => sampleItems(page, withTest), { timeout: 15_000 }).toContain(`${withTest}-1.1`);
  });

  test('TC-ALQW-03: saving an aliquot with no test either saves it or says why not', async ({ page }) => {
    // FLIP-WHEN-FIXED (R66b/c). Observed 2026-09-27: with the test left on the parent, Save
    // sends nothing and says nothing; with no tests at all it posts sampleItems: [] and resets.
    await search(page, noTestAliquot);
    await openAliquoting(page);
    // The aliquot gets the whole quantity and no test (the test stays on the parent).
    await page.getByRole('button', { name: 'Add Aliquot' }).click();
    const panel = page.locator('main tr.cds--expandable-row').last();
    await panel.locator('input[type=number]').fill('4');
    await panel.locator('input[type=number]').press('Tab');
    const posted = page.waitForRequest(r => r.url().includes('/rest/Aliquot') && r.method() === 'POST', { timeout: 8_000 }).catch(() => null);
    await page.getByRole('button', { name: 'Save Aliquot Changes' }).click({ timeout: 5_000 }).catch(() => {});
    const req = await posted;
    const sent = req ? JSON.stringify(req.postDataJSON()) : '';
    await page.waitForTimeout(1_500);
    const said = await page.locator('.cds--inline-notification, .cds--toast-notification, [role=alert]').allInnerTexts();
    test.fail();
    expect(sent.includes(`${noTestAliquot}-1.1`) || said.some(t => t.trim().length > 0),
      `request ${sent || '(none)'}; messages ${JSON.stringify(said)}`).toBe(true);
  });
});
