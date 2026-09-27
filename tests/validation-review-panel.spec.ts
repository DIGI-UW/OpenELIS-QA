/**
 * tests/validation-review-panel.spec.ts
 *
 * Validation review panel: does it tell the validator who entered the result and when?
 * Written 2026-09-27 against testing 3.2.3.0 (release-qa-3.2.3 R4 retest and R55;
 * uncovered-workflows-catalogue TC-TBL-02/03, TC-TZ-06).
 *
 * Coverage before this file: validation specs approve results and check status changes;
 * none read the review panel's provenance fields, so "Entered by: Not recorded" (while
 * the panel's own History names the user) passed everything.
 *
 * The browser is pinned to Port Moresby (UTC+10): the "Entered on" time is shown in UTC,
 * which a UTC CI runner cannot see.
 */
import { test, expect, Page } from '@playwright/test';
import { seedOrder } from '../helpers/data-factory';

const BASE = process.env.BASE_URL || process.env.BASE || 'https://testing.openelis-global.org';
test.use({ timezoneId: 'Pacific/Port_Moresby' });
test.describe.configure({ mode: 'serial' });

let accession = '';
let enteredAtLocal = ''; // HH:mm in the browser zone when Save was pressed

async function openReviewPanel(page: Page) {
  // A freshly saved result can take a little while to reach the validation list; reload
  // the unit a few times rather than waiting on one stale render.
  // The validation list is built from role="row" elements, not <tr>.
  const row = page.getByRole('row').filter({ hasText: accession }).first();
  await expect(async () => {
    await page.goto(`${BASE}/ResultValidation`, { waitUntil: 'domcontentloaded' });
    await page.locator('#unitType').selectOption({ label: 'Biochemistry' });
    await expect(row).toBeVisible({ timeout: 10_000 });
  }, `${accession} is waiting in Biochemistry validation`).toPass({ timeout: 60_000 });
  await row.getByRole('button', { name: /review/i }).click();
  // Review expands an inline panel under the row (div.validationReviewPanel), not a dialog.
  const panel = page.locator('.validationReviewPanel, .unifiedExpandedPanel').filter({ hasText: /Entered by/ }).first();
  await expect(panel, 'the review panel opens').toBeVisible({ timeout: 10_000 });
  return panel;
}

test.describe('Validation review panel provenance', () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage({ timezoneId: 'Pacific/Port_Moresby' } as never);
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    accession = (await seedOrder(page, 'VRP')).accession;   // Glucose, numeric, Biochemistry
    await page.goto(`${BASE}/Results`, { waitUntil: 'domcontentloaded' });
    const search = page.getByPlaceholder(/Search by lab number/i);
    await search.fill(accession);
    await search.press('Enter');
    const value = page.locator('input[id^="unifiedResultValue-"][id$="-primary"]').first();
    await expect(value, `result field for ${accession}`).toBeVisible({ timeout: 20_000 });
    await value.fill('6');   // Glucose reports 0 decimals; 5.5 is refused and Save stays disabled
    await value.press('Tab');
    const saved = page.waitForResponse(r => /\/results-entry\/analysis\/\d+\/result$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST');
    enteredAtLocal = await page.evaluate(() => new Date().toTimeString().slice(0, 5));
    await page.getByRole('button', { name: 'Save', exact: true }).first().click();
    expect((await saved).status(), 'result save answers 200').toBe(200);
    await page.close();
  });

  test('TC-TBL-03: the review panel History names the user who entered the result', async ({ page }) => {
    // Canary for TC-TBL-02: the panel opens and its History carries the entering user.
    const panel = await openReviewPanel(page);
    // History is a collapsible section (its open state is remembered per browser).
    const history = panel.getByText(/History \(this analysis\)/).first();
    if (!/Accepted by technician/.test(await panel.innerText())) await history.click();
    await expect(panel.getByText(/Accepted by technician/).first(), 'History expands').toBeVisible({ timeout: 10_000 });
    const text = await panel.innerText();
    expect(text, 'the panel shows the entered value').toMatch(/Result\s*\n?\s*6\b/);
    expect(text, 'History lists an Accepted-by-technician event with a user').toMatch(/Accepted by technician[\s\S]{0,120}?[A-Za-z]+,\s*[A-Za-z]+/);   // e.g. "ELIS,Open"
  });

  test('TC-TBL-02: "Entered by" names the user who entered the result', async ({ page }) => {
    // FLIP-WHEN-FIXED (R4). Observed 2026-09-27: "Entered by Not recorded".
    test.fail();
    const text = await (await openReviewPanel(page)).innerText();
    const enteredBy = (text.match(/Entered by\s*\n?\s*([^\n]+)/) ?? [])[1] ?? '';
    expect(enteredBy.trim(), '"Entered by" is a user, not "Not recorded"').not.toMatch(/not recorded|^$/i);
  });

  test('TC-TZ-06: "Entered on" shows the local time the result was saved', async ({ page }) => {
    // FLIP-WHEN-FIXED (R55). Observed 2026-09-27 at UTC+10: 09:12 shown for a 19:12 save.
    test.fail();
    const text = await (await openReviewPanel(page)).innerText();
    const shown = (text.match(/Entered on\s*\n?\s*\d{2}\/\d{2}\/\d{4}\s+(\d{2}:\d{2})/) ?? [])[1] ?? '';
    const mins = (hm: string) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
    expect(shown, 'an "Entered on" time is shown').not.toBe('');
    const diff = Math.abs(mins(shown) - mins(enteredAtLocal));
    expect(Math.min(diff, 1440 - diff), `shown ${shown} vs saved at ${enteredAtLocal} local`).toBeLessThanOrEqual(3);
  });
});
