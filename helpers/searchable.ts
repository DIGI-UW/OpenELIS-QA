/**
 * helpers/searchable.ts
 *
 * Pick from a list whether it is a native <select> or the searchable combobox that #4975
 * (6 Nov 2026) put in its place (SearchableSelect, a Carbon ComboBox: an <input role=combobox>
 * whose options render only while the menu is open). R-26: lists offer a search, so specs
 * pick by the label a user sees, not by a hidden value.
 */
import { expect, Locator } from '@playwright/test';

async function isNativeSelect(target: Locator): Promise<boolean> {
  return (await target.evaluate((e) => e.tagName)) === 'SELECT';
}

/** The labels the list offers now (opens and closes a combobox menu to read them). */
export async function optionTexts(target: Locator, filter = ''): Promise<string[]> {
  if (await isNativeSelect(target)) {
    return (await target.locator('option').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
  }
  await target.click();
  await target.fill(filter);
  const menu = await target.getAttribute('aria-controls');
  const opts = menu ? target.page().locator(`[id="${menu}"] [role="option"]`) : target.page().getByRole('option');
  await opts.first().waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
  const texts = (await opts.allInnerTexts()).map((t) => t.trim()).filter(Boolean);
  await target.press('Escape');
  return texts;
}

/** Wait until the list offers an option whose label contains `text`. */
export async function expectOffered(target: Locator, text: string, timeout = 30_000): Promise<void> {
  await expect.poll(async () => (await optionTexts(target, text)).some((t) => t.includes(text)),
    { timeout, message: `"${text}" is offered` }).toBe(true);
}

/** Pick the option whose label is `text` (or, failing that, the first that contains it). */
export async function pick(target: Locator, text: string, timeout = 30_000): Promise<void> {
  await expect(target, 'the list is shown').toBeVisible({ timeout });
  if (await isNativeSelect(target)) {
    await expect.poll(async () => (await target.locator('option').allInnerTexts()).some((t) => t.trim().includes(text)),
      { timeout, message: `"${text}" is offered` }).toBe(true);
    const labels = (await target.locator('option').allInnerTexts()).map((t) => t.trim());
    await target.selectOption({ label: labels.find((l) => l === text) ?? labels.find((l) => l.includes(text))! });
    return;
  }
  await expectOffered(target, text, timeout);
  await target.click();
  await target.fill(text);
  const menu = await target.getAttribute('aria-controls');
  const opts = menu ? target.page().locator(`[id="${menu}"] [role="option"]`) : target.page().getByRole('option');
  const exact = opts.filter({ hasText: new RegExp(`^\\s*${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`) });
  await ((await exact.count()) ? exact.first() : opts.filter({ hasText: text }).first()).click();
  await expect(target, `"${text}" chosen`).toHaveValue(new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}

/** A pre-selected list: the id on a native select, a chosen (non-empty) label on a combobox. */
export async function expectPreselected(target: Locator, id: string, label?: string, timeout = 15_000): Promise<void> {
  await expect(target, 'the list is shown').toBeVisible({ timeout });
  if (await isNativeSelect(target)) await expect(target, 'pre-selected').toHaveValue(id, { timeout });
  else if (label) await expect(target, 'pre-selected').toHaveValue(new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), { timeout });
  else await expect(target, 'pre-selected').not.toHaveValue('', { timeout });
}
