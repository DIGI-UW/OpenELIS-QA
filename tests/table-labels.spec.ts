/**
 * tests/table-labels.spec.ts
 *
 * Cross-cutting table checks: can a user choose a page size, and do status columns show
 * words rather than enum constants? Written 2026-09-27 against testing 3.2.3.0
 * (release-qa-3.2.3 R53a, R55; uncovered-workflows-catalogue TC-TBL-00/01,
 * TC-CYTW-09, TC-IHCW-02).
 */
import { test, expect, Page } from '@playwright/test';

const BASE = process.env.BASE_URL || process.env.BASE || 'https://testing.openelis-global.org';

async function pageSizeOptions(page: Page, path: string): Promise<string[]> {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  const sel = page.locator('select[id^="cds-pagination-select"]').filter({ hasNot: page.locator('[id$="-right"]') }).first();
  await expect(sel, `${path} has a page-size selector`).toBeAttached({ timeout: 20_000 });
  return sel.locator('option').allInnerTexts();
}

test.describe('Tables', () => {
  test('TC-TBL-00: CANARY the Inventory table offers several page sizes', async ({ page }) => {
    const opts = await pageSizeOptions(page, '/inventory');
    expect(opts.length, `Inventory page sizes: ${opts.join('/')}`).toBeGreaterThanOrEqual(3);
  });

  test('TC-TBL-01: case dashboards offer several page sizes', async ({ page }) => {
    // FLIP-WHEN-FIXED (R55). Observed 2026-09-27: one option equal to the row count.
    test.fail();
    const bad: string[] = [];
    for (const p of ['/CytologyDashboard', '/ImmunohistochemistryDashboard', '/PathologyDashboard']) {
      const opts = await pageSizeOptions(page, p);
      if (opts.length < 3) bad.push(`${p}: ${opts.join('/')}`);
    }
    expect(bad, 'dashboards with a single page-size option').toEqual([]);
  });

  test('TC-IHCW-02: case dashboards show stages as words, not enum constants [FIXED R53a]', async ({ page }) => {
    // FIXED R53a, flipped 2026-10-08 (passes on local develop 2026-10-06 and 2026-10-08 and in CI run 126); was FLIP-WHEN-FIXED (R53a). Observed 2026-09-27: PREPARING_SLIDES, IN_PROGRESS.
    const found: string[] = [];
    for (const p of ['/CytologyDashboard', '/ImmunohistochemistryDashboard']) {
      await page.goto(`${BASE}${p}`, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle');
      const sf = page.locator('#statusFilter');
      if (await sf.count()) await sf.selectOption({ label: 'All' }).catch(() => undefined);
      await page.waitForLoadState('networkidle');
      found.push(...((await page.locator('tbody').innerText()).match(/\b[A-Z]+(?:_[A-Z]+)+\b/g) ?? []).map(e => `${p}: ${e}`));
    }
    expect(found, 'enum constants in the stage column').toEqual([]);
  });
});
