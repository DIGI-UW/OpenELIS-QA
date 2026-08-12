// Shared Carbon dropdown / combobox / FILTERABLE MULTISELECT picker.
//
// 2026-08-12 - rewritten. The old copy (duplicated in four test-catalog specs) reported
// committed=false on the Sample types control, and that single failure is behind the ~25
// guards/e2e failures in the 2026-08-06 sweep.
//
// What the control actually is (probed live on 34.212.225.107, v3.2.1.11):
//   label   Sample types  (PLURAL - callers passing Sample type were matching the placeholder)
//           plus a visually-hidden: Total items selected:  0.
//   wrapper .cds--multi-select__wrapper .cds--multi-select--filterable__wrapper
//   input   #basic-info-sample-types-input  role=combobox  placeholder=Sample type
//   menu    ul#basic-info-sample-types__menu  role=listbox  hidden
//
// Three things the old helper got wrong:
//  1. It searched the whole page for the option row instead of scoping to the control wrapper.
//  2. It only typed to filter as a LAST RESORT. These lists are long and the menu virtualises,
//     so the option often is not in the DOM until filtered. Filter first, always.
//  3. A multiselect menu STAYS OPEN after a pick. The old code left it open, and the open menu
//     overlays the fields below - which is why the NEXT locator.fill timed out and the run looked
//     like a hang. Press Escape after picking.
//
// Commit verification is per-control-type: for a multiselect the filter text is not a reliable
// signal, so read the Total items selected: N live region (and the selection badge) instead.
//
// Verified live: Sample types -> Serum gives isMulti=true, committed=true, and the live region
// moves from Total items selected: 0. to Total items selected: 1.

import { Page } from "@playwright/test";

export async function pickCombo(page: Page, label: string, optionText: string) {
  const wrapper = page
    .locator('.cds--list-box__wrapper, .cds--multi-select__wrapper, .cds--combo-box')
    .filter({ has: page.locator(`label:has-text("${label}")`) })
    .first();
  const scope = (await wrapper.count()) ? wrapper : page.getByLabel(label, { exact: false }).first();

  const isMulti = (await wrapper.count())
    ? await wrapper.evaluate((el: any) => el.className.includes('multi-select'))
    : false;

  const input = (await wrapper.count()) ? wrapper.locator('input[role="combobox"]').first() : scope;
  await input.scrollIntoViewIfNeeded().catch(() => {});
  await input.click();
  await page.waitForTimeout(400);

  // Filter first — these lists can be long and the menu virtualises.
  await input.pressSequentially(optionText.slice(0, 10), { delay: 25 }).catch(() => {});
  await page.waitForTimeout(600);

  const option = page
    .locator('[role="listbox"] [role="option"]')
    .filter({ hasText: optionText })
    .first();
  await option.click();
  await page.waitForTimeout(400);

  if (isMulti) {
    // A multiselect menu STAYS OPEN after a pick and would swallow the next click. Close it.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
  }

  // Commit check. For a multiselect the input is empty by design — read the count instead.
  const committed = await scope.evaluate((el: any, want: string) => {
    const root = el.closest('.cds--list-box__wrapper') || el;
    const hidden = root.querySelector('.cds--visually-hidden')?.textContent || '';
    const m = hidden.match(/Total items selected:\s*(\d+)/i);
    if (m) return parseInt(m[1], 10) > 0;
    const badge = root.querySelector('.cds--list-box__selection')?.textContent || '';
    if (badge.trim()) return true;
    const inp = root.querySelector('input');
    return !!inp && new RegExp(want.slice(0, 6), 'i').test(inp.value || '');
  }, optionText);

  if (!committed) throw new Error(`pickCombo("${label}") could not commit "${optionText}"`);
  return { isMulti, committed };
}
