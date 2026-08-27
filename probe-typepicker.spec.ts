/**
 * Standalone probe: does the ANALYZER-TYPE picker filter?
 *
 * Two readings disagree in the record:
 *   - "typing GeneX leaves 7 of 7 — it does not filter"  (2026-08-27, commit 0ca45ac)
 *   - "typing Fluo narrows 7 to 1 — it filters"          (2026-08-27, this session)
 *
 * Both can be true at once, which is the whole point: the seed publishes site-derived
 * *GeneXpert* duplicates of its own, so a GeneXpert-shaped query legitimately matches almost
 * every row. A count-based read using that query cannot distinguish "does not filter" from
 * "filters, and nearly everything matches".
 *
 * This probe types several queries into the same control in one session and prints what survives,
 * so the answer does not depend on which word someone happened to pick.
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.BASE || 'https://analyzers.openelis-global.org';

test('probe: analyzer-type picker filter behaviour, several queries', async ({ page }) => {
  await page.goto(`${BASE}/analyzers?setup=instrument`);
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => {
    const h = document.getElementById('oe-review-host');
    if (h) (h as HTMLElement).style.display = 'none';
  });
  // The held-results banner takes focus on mount; Escape dismisses it.
  if (await page.locator('.cds--actionable-notification').count()) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }

  const input = page.locator('#analyzer-setup-type');
  const options = page.locator('[role="option"]');

  await input.click();
  await expect(options.first()).toBeVisible({ timeout: 15_000 });
  const all = await options.allInnerTexts();
  console.log(`[probe] baseline ${all.length} options:`);
  for (const o of all) console.log(`         · ${o}`);

  for (const q of ['GeneX', 'Fluo', 'Thermo', 'zzz']) {
    await input.press('ControlOrMeta+a');
    await input.pressSequentially(q, { delay: 90 });
    await page.waitForTimeout(900);
    const shown = await options.allInnerTexts();
    const expectedMatches = all.filter((t) => t.toLowerCase().includes(q.toLowerCase())).length;
    console.log(
      `[probe] "${q}": ${all.length} → ${shown.length}  (rows whose text contains "${q}": ${expectedMatches})`,
    );
    for (const s of shown) console.log(`         · ${s}`);
  }
});
