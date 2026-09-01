/**
 * The analyzer-type picker, settled.
 *
 * Four readings of this one control were live at once across three sessions, and one of them was
 * queued to be filed as a product defect:
 *
 *   (a) "typing GeneX leaves 7 of 7 — it does not filter"         (0ca45ac, reverted a flip)
 *   (b) "it filters by PREFIX — anchor on the manufacturer"        (fd82fe0)
 *   (c) "the search empties the menu 13→0 — probable defect"       (54f311b, unfiled)
 *   (d) "it filters on a plain substring"                          (PR #86)
 *
 * They disagree because two variables were moving together:
 *
 *   1. THE QUERY. The seed publishes site-derived *GeneXpert* profiles, so a GeneXpert-shaped
 *      query matches most rows and cannot tell "no filtering" from "filtering, everything matches".
 *      A query is only useful here if the competing hypotheses predict DIFFERENT counts.
 *   2. THE TYPING METHOD. `input.fill('')` fires Carbon's clear, which can CLOSE the listbox; the
 *      keystrokes that follow then filter a menu that is not mounted and `[role="option"]` reads 0.
 *      Select-all-then-type replaces the value in place and leaves the menu open.
 *
 * These tests hold the control fixed and vary one thing at a time. They ASSERT NOTHING — they
 * print, so the numbers can be read rather than argued about. Run them before re-opening the
 * question.
 *
 *   npx playwright test -c probe-typepicker.config.ts
 *
 * Result on 2026-09-01, at 4 options and again at 13: a CASE-INSENSITIVE SUBSTRING filter over the
 * whole option label. Not prefix-anchored. Does not empty the menu under either typing method.
 */
import { test } from '@playwright/test';

const BASE = process.env.BASE || 'https://analyzers.openelis-global.org';

async function openPicker(page: any) {
  await page.goto(`${BASE}/analyzers?setup=instrument`);
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => {
    const h = document.getElementById('oe-review-host');
    if (h) (h as HTMLElement).style.display = 'none';
  });
  // The held-results banner takes focus on mount when an analyzer is holding results.
  if (await page.locator('.cds--actionable-notification').count()) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }
  const input = page.locator('#analyzer-setup-type');
  const options = page.locator('[role="option"]');
  await input.click();
  await options.first().waitFor({ state: 'attached', timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(500);
  return { input, options };
}

test('probe: PREFIX or SUBSTRING — queries only a substring match can satisfy', async ({ page }) => {
  const { input, options } = await openPicker(page);
  const all = await options.allInnerTexts();
  console.log(`[shape] baseline ${all.length} options:`);
  for (const o of all) console.log(`         · ${o}`);

  // "Bruker" → prefix of "Bruker FluoroCycler XT"           — both hypotheses predict a match
  // "Fluoro" → mid-string in "Bruker FluoroCycler XT"       — ONLY substring predicts a match
  // "Cycler" → mid-string                                    — ONLY substring
  // "Fisher" → mid-string in "Thermo Fisher QuantStudio"    — ONLY substring
  // "zzz"    → matches nothing                               — both predict 0
  for (const q of ['Bruker', 'Fluoro', 'Cycler', 'Fisher', 'zzz']) {
    await input.press('ControlOrMeta+a');
    await input.pressSequentially(q, { delay: 90 });
    await page.waitForTimeout(900);
    const shown = await options.allInnerTexts();
    const substring = all.filter((t) => t.toLowerCase().includes(q.toLowerCase())).length;
    const prefix = all.filter((t) => t.toLowerCase().startsWith(q.toLowerCase())).length;
    console.log(
      `[shape] "${q}": ${all.length} → ${shown.length}   (substring predicts ${substring}, prefix predicts ${prefix})`,
    );
    for (const s of shown) console.log(`         · ${s}`);
  }
});

test('probe: typing METHOD — fill("") vs select-all, same query, same control', async ({ page }) => {
  for (const method of ['fill', 'select-all'] as const) {
    const { input, options } = await openPicker(page);
    const baseline = await options.count();

    if (method === 'fill') {
      await input.fill('');
      await page.waitForTimeout(300);
      await input.pressSequentially('Bruker', { delay: 110 });
    } else {
      await input.press('ControlOrMeta+a');
      await input.pressSequentially('Bruker', { delay: 90 });
    }
    await page.waitForTimeout(900);

    console.log(
      `[method] ${method.padEnd(10)} baseline ${baseline} → ${await options.count()}   ` +
        `input value="${await input.inputValue()}"`,
    );
  }
});

test('probe: CASE sensitivity', async ({ page }) => {
  const { input, options } = await openPicker(page);
  console.log(`[case] baseline ${await options.count()} options`);

  // Each pair differs ONLY in case. A case-insensitive filter gives the same count for both.
  for (const [proper, other] of [
    ['Bruker', 'bruker'],
    ['GeneXpert', 'genexpert'],
    ['Thermo', 'THERMO'],
    ['Cepheid', 'cepheid'],
  ] as Array<[string, string]>) {
    const counts: Record<string, number> = {};
    for (const q of [proper, other]) {
      await input.press('ControlOrMeta+a');
      await input.pressSequentially(q, { delay: 90 });
      await page.waitForTimeout(900);
      counts[q] = await options.count();
    }
    console.log(
      `[case] "${proper}" → ${counts[proper]}   |   "${other}" → ${counts[other]}   ` +
        `${counts[proper] === counts[other] ? 'case-INSENSITIVE' : '*** CASE-SENSITIVE ***'}`,
    );
  }
});
