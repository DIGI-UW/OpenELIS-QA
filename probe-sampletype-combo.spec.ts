// Diagnostic: prove the corrected pickCombo actually commits a "Sample types" selection.
//
// What the first pass established (34.212.225.107, v3.2.1.11):
//   label     : "Sample types" (PLURAL) + visually-hidden "Total items selected:  0."
//   wrapper   : cds--multi-select__wrapper cds--multi-select--filterable__wrapper
//   input     : #basic-info-sample-types-input  role=combobox  placeholder="Sample type"
//   menu      : <ul id="basic-info-sample-types__menu" role="listbox" hidden>
// It is a Carbon FILTERABLE MULTISELECT, not a single-select combobox. Carbon CLEARS the filter
// text after a selection, so combo.inputValue() is ALWAYS '' — which is exactly what the old
// pickCombo used as its commit check. Hence committed=false on every run, even when the click
// worked. That false negative is behind the guards/e2e failure cluster.
import { test, expect, Page } from '@playwright/test';

// --- corrected helper (candidate for promotion into the specs) ---------------------------------
async function pickCombo(page: Page, label: string, optionText: string) {
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
// ------------------------------------------------------------------------------------------------

test('corrected pickCombo commits Sample types', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/MasterListsPage/TestCatalogEditor/new/basic-info', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);

  const before = await page.locator('#basic-info-sample-types-label .cds--visually-hidden').innerText();
  console.log('BEFORE', JSON.stringify(before));

  const r = await pickCombo(page, 'Sample types', 'Serum');
  console.log('PICK_RESULT', JSON.stringify(r));

  const after = await page.locator('#basic-info-sample-types-label .cds--visually-hidden').innerText();
  console.log('AFTER', JSON.stringify(after));

  // Old check, for the record: this is what returned false even on success.
  const oldStyle = await page.locator('#basic-info-sample-types-input').inputValue();
  console.log('OLD_CHECK_inputValue', JSON.stringify(oldStyle));

  expect(after).toMatch(/Total items selected:\s*[1-9]/i);
});
