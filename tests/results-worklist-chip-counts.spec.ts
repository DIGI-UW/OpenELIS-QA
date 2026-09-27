/**
 * tests/results-worklist-chip-counts.spec.ts
 *
 * Unified Results worklist: do the status chips count the worklist or the page?
 * Written 2026-09-27 against testing 3.2.3.0 (release-qa-3.2.3 R42).
 *
 * Observed by hand: Biochemistry read "All (100)" and "Not started (99)" on page 1 and
 * "All (44)" on page 2 of a 144-row, 2-page worklist. unified-results.spec.ts checks
 * the columns and rows but never compares a chip with the worklist size.
 */
import { test, expect, Page } from '@playwright/test';

const BASE = process.env.BASE_URL || process.env.BASE || 'https://testing.openelis-global.org';

async function loadUnit(page: Page, unit: string) {
  await page.goto(`${BASE}/Results`, { waitUntil: 'domcontentloaded' });
  const select = page.locator('#unifiedResultsLabUnit');
  await expect(select).toBeVisible({ timeout: 20_000 });
  await select.selectOption({ label: unit });
  await page.getByRole('button', { name: 'Load results' }).click();
  await expect(page.getByText(/^All \(\d+\)$/).first()).toBeVisible({ timeout: 30_000 });
}

async function allChip(page: Page): Promise<number> {
  const t = await page.getByText(/^All \(\d+\)$/).first().innerText();
  return Number(t.match(/\d+/)![0]);
}

async function itemsOnPage(page: Page): Promise<number> {
  const t = await page.getByText(/\d+ items? on this page/).first().innerText();
  return Number(t.match(/\d+/)![0]);
}

async function pageCount(page: Page): Promise<number> {
  const t = await page.getByText(/of \d+ pages?/).first().innerText();
  return Number(t.match(/\d+/)![0]);
}

test.describe('Unified Results status chips (R42)', () => {
  test('TC-RWC-01: the All chip is present and covers the rows on screen', async ({ page }) => {
    // Canary for TC-RWC-02: the chip, the pager text and the parsing work.
    await loadUnit(page, 'Biochemistry');
    const chip = await allChip(page);
    const onPage = await itemsOnPage(page);
    expect(chip, 'All chip is a positive count on a unit with work').toBeGreaterThan(0);
    expect(chip, 'chip is at least the rows rendered on this page').toBeGreaterThanOrEqual(onPage);
  });

  test('TC-RWC-02: on a multi-page worklist the All chip counts every page', async ({ page }) => {
    // FLIP-WHEN-FIXED. The chip should describe the worklist, not the page on screen.
    await loadUnit(page, 'Biochemistry');
    const pages = await pageCount(page);
    test.skip(pages < 2, `Biochemistry has ${pages} page(s) of work; this case needs more than 100 pending rows`);
    test.fail();
    const chipPage1 = await allChip(page);
    let total = await itemsOnPage(page);
    for (let p = 2; p <= pages; p++) {
      await page.getByRole('button', { name: /next page/i }).first().click();
      await page.waitForTimeout(2500);   // the pager text is already present; give the next page time to replace it
      total += await itemsOnPage(page);
    }
    expect(chipPage1, `All chip on page 1 should equal the ${total} rows across ${pages} pages`).toBe(total);
  });
});
