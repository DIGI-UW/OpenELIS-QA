/**
 * OGC-1635 typed dates (PRs #5088, #5095, 15 and 16 Nov 2026).
 *
 * Contract read from the diffs:
 *  - A date typed into a date picker, followed by a click elsewhere, is the date the page uses (it
 *    used to reach the page only when picked from the calendar).
 *  - Text that is not a date, or lies outside the picker's range, stays in the field marked invalid,
 *    and the date is cleared; the message names the format the field shows.
 *  - The site date parser refuses years shorter than four digits ("11/11/26" read as year 0026), and
 *    a typed date must name the date it parses into ("2026-13-45" is refused, not rolled into 2027).
 *
 * Driven on Reference Lab Results (/SampleShipment/reference-lab-results, OGC-1616 filters), whose
 * date range filters the referral table in the page.
 */
import { test, expect, Page, Locator } from '@playwright/test';

const ROUTE = '/SampleShipment/reference-lab-results';

async function openPage(page: Page): Promise<{ from: Locator; to: Locator; placeholder: string }> {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  const from = page.locator('#date-from');
  const to = page.locator('#date-to');
  await expect(from).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('main table, main [role="table"]').first().or(page.getByText(/no referr/i).first())).toBeVisible({ timeout: 30_000 });
  return { from, to, placeholder: (await from.getAttribute('placeholder')) || '' };
}

/** A date written in the field's own format (its placeholder, e.g. dd/mm/yyyy or yyyy-mm-dd). */
function inFormat(placeholder: string, d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  return placeholder.toLowerCase().replace('dd', dd).replace('mm', mm).replace('yyyy', yyyy);
}

async function typeAndLeave(page: Page, field: Locator, text: string) {
  await field.click();
  await field.fill(text);
  // A click elsewhere, the case the fix is about (not Enter, not the calendar).
  // The open calendar covers part of the page, so the click lands on the page title by position.
  const title = page.locator('main h1').first();
  const box = await title.boundingBox();
  if (box) await page.mouse.click(box.x + 5, box.y + box.height / 2);
  else await page.mouse.click(10, 300);
  await page.waitForTimeout(300);
}

const markedInvalid = (field: Locator) =>
  field.evaluate((e) => e.getAttribute('data-invalid') === 'true' || e.getAttribute('aria-invalid') === 'true'
    || !!e.closest('.cds--date-picker-container')?.querySelector('.cds--form-requirement'));

test.describe('OGC-1635 typed dates (TC-TDATE)', () => {
  test('TC-TDATE-01: a typed date range, then a click elsewhere, filters the table', async ({ page }) => {
    const { from, to, placeholder } = await openPage(page);
    expect(placeholder, 'the field shows its format').toMatch(/yyyy/i);
    const rows = page.locator('main tbody tr');
    const before = await rows.count();
    const ahead = new Date(Date.now() + 400 * 86_400_000);
    const start = inFormat(placeholder, ahead);
    const end = inFormat(placeholder, new Date(ahead.getTime() + 86_400_000));
    await typeAndLeave(page, from, start);
    await typeAndLeave(page, to, end);
    await expect(from, 'the typed start date stays in the field').toHaveValue(start);
    expect(await markedInvalid(from), 'a valid typed date is not marked invalid').toBe(false);
    // Nothing is referred a year ahead: the typed range reaches the filter and empties the table.
    await expect(rows.filter({ hasText: /\d/ }), `the table is filtered (was ${before} rows)`).toHaveCount(0, { timeout: 10_000 });
  });

  test('TC-TDATE-02: a year shorter than four digits is refused, marked invalid', async ({ page }) => {
    const { from, placeholder } = await openPage(page);
    const typed = inFormat(placeholder, new Date(2026, 10, 11)).replace('2026', '26');
    await typeAndLeave(page, from, typed);
    await expect.poll(() => markedInvalid(from), { timeout: 10_000, message: `"${typed}" is marked invalid` }).toBe(true);
    const message = await from.evaluate((e) => e.closest('.cds--date-picker-container')?.querySelector('.cds--form-requirement')?.textContent || '');
    expect(message, 'the message names the field format').toMatch(new RegExp(placeholder.replace(/[/.-]/g, '.'), 'i'));
  });

  test('TC-TDATE-03: an impossible date is refused, not rolled over into another month', async ({ page }) => {
    const { from, placeholder } = await openPage(page);
    const typed = placeholder.toLowerCase().replace('dd', '45').replace('mm', '13').replace('yyyy', '2026');
    await typeAndLeave(page, from, typed);
    await expect.poll(() => markedInvalid(from), { timeout: 10_000, message: `"${typed}" is marked invalid` }).toBe(true);
    await expect(from, 'the text stays in the field for correction').toHaveValue(typed);
  });
});
