/**
 * tests/order-workflow-steps.spec.ts
 *
 * The order workflow pages (Collect / Label & Store / QA Review): does the progress counter
 * agree with the steps it shows as Complete, and is a freshly loaded order free of an
 * "Unsaved changes" warning? Written 2026-09-27 against testing 3.2.3.0
 * (release-qa-3.2.3 R63; uncovered-workflows-catalogue TC-OWF-00/01/02).
 *
 * REWORKED 2026-10-08 for develop, where the workflow has three steps, not four:
 *   Enter Order -> Prepare Samples (/order/clinical/collect) -> Sample check (/order/clinical/qa).
 * /order/clinical/label now redirects to Prepare Samples, and the counter reads "n/3 steps".
 * The counter and step names are read for either layout, so the spec still runs on 3.2.x.
 */
import { test, expect, Page } from '@playwright/test';
import { seedOrder } from '../helpers/data-factory';

const BASE = process.env.BASE_URL || process.env.BASE || 'https://testing.openelis-global.org';
test.describe.configure({ mode: 'serial' });

let accession = '';

async function loadOrder(page: Page, step: 'collect' | 'qa') {
  await page.goto(`${BASE}/order/clinical/${step}`, { waitUntil: 'domcontentloaded' });
  const scan = page.locator('#order-barcode-search');
  await expect(scan).toBeVisible({ timeout: 20_000 });
  await scan.fill(accession);
  await scan.press('Enter');
  await expect(page.getByText(accession).first(), 'the order loads').toBeVisible({ timeout: 20_000 });
  await page.waitForLoadState('networkidle');
}

async function progress(page: Page): Promise<{ counter: number; complete: number }> {
  const text = await page.locator('main').innerText();
  const counter = Number((text.match(/(\d)\s*\/\s*[34] steps/) ?? [])[1] ?? -1);
  const steps = await page.locator('main li button').filter({ hasText: /^(Enter Order|Collect|Label & Store|QA Review|Prepare Samples|Sample check)[\s\S]*(Complete|Current|Incomplete)\s*$/ }).allInnerTexts();
  return { counter, complete: steps.filter(s => /Complete$/.test(s.trim())).length };
}

test.describe('Order workflow steps', () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    accession = (await seedOrder(page, 'OWF')).accession;
    await page.close();
  });

  test('TC-OWF-00: an existing order loads by lab number on the Collect page', async ({ page }) => {
    await loadOrder(page, 'collect');
    const p = await progress(page);
    expect(p.counter, 'a progress counter is shown (-1 when absent)').toBeGreaterThan(0);
    expect(p.complete, 'at least Enter Order is Complete').toBeGreaterThanOrEqual(1);
  });

  test('TC-OWF-01: the progress counter matches the steps shown Complete', async ({ page }) => {
    // FLIP-WHEN-FIXED (R63a). Observed 2026-09-27: one behind (2/4 with three Complete).
    test.fail();
    for (const step of ['collect', 'qa'] as const) {
      await loadOrder(page, step);
      const p = await progress(page);
      expect(p.counter, `${step}: counter ${p.counter} vs ${p.complete} steps Complete`).toBe(p.complete);
    }
  });

  test('TC-OWF-02: a freshly loaded order shows no "Unsaved changes" warning', async ({ page }) => {
    // FLIPPED 2026-09-29 (R63b). This was a tripwire; it passed unexpectedly in three
    // runs on local develop, webapp image 2026-09-28 23:01 UTC, frontend 2026-09-29 01:21 UTC.
    await loadOrder(page, 'collect');
    await expect(page.getByText(/Unsaved changes/i), 'no unsaved-changes banner before any edit').toHaveCount(0);
  });
});
