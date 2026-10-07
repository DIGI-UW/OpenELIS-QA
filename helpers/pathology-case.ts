/**
 * helpers/pathology-case.ts
 *
 * The pathology / IHC case view controls the case-workflow specs share. Added 2026-10-08 when the
 * pathology case view was redesigned into a staged workflow: an accordion of numbered sections
 * (li#pathology-section-<key>) that unlock as the stage reaches them, a Carbon dropdown for the
 * stage, and "Save draft" in place of the old Save. The IHC case view still has the older form, so
 * every helper also handles that.
 */
import { expect, type Page } from '@playwright/test';

/**
 * Set / read the case stage. REWORKED 2026-10-08: the pathology case view was redesigned into a
 * staged workflow, and its stage picker (#status) is now a Carbon dropdown (a div with options
 * labelled "Grossing", "Ready for Pathologist", ...) instead of a <select> with enum values. The
 * IHC case view may still use a <select>; both are handled.
 */
export const STAGE_LABEL: Record<string, string> = {
  ACCESSIONED: 'Accessioned', GROSSING: 'Grossing', STAINING: 'Staining', READY_PATHOLOGIST: 'Ready for Pathologist',
  UNDER_REVIEW: 'Under Pathologist Review', COMPLETED: 'Completed',
};
export async function setStage(page: Page, value: string): Promise<void> {
  const status = page.locator('#status');
  if ((await status.evaluate((e) => e.tagName)) === 'SELECT') { await status.selectOption(value); return; }
  await status.click();
  await status.getByRole('option', { name: STAGE_LABEL[value] ?? value, exact: true }).click();
}
export async function expectStage(page: Page, value: string, message = 'the stage'): Promise<void> {
  const status = page.locator('#status');
  if ((await status.evaluate((e) => e.tagName)) === 'SELECT') await expect(status, message).toHaveValue(value);
  else await expect(status, message).toContainText(STAGE_LABEL[value] ?? value);
}

/** The stage label currently shown, for either form of the picker. */
export async function readStage(page: Page): Promise<string> {
  const status = page.locator('#status');
  if ((await status.evaluate((e) => e.tagName)) === 'SELECT') {
    return status.evaluate((s: HTMLSelectElement) => s.options[s.selectedIndex]?.text ?? '');
  }
  return ((await status.innerText()) || '').split('\n')[0].trim();
}

/**
 * Open one section of the redesigned pathology case view (li#pathology-section-<key>: grossing,
 * microtomy, staining, review, findings, reports, ...). Sections start collapsed and unlock as the
 * stage reaches them. A no-op on the IHC case view, which has no sections.
 */
export async function openSection(page: Page, key: string): Promise<void> {
  const section = page.locator(`#pathology-section-${key}`);
  if (!(await section.count())) return;
  const head = section.getByRole('button').first();
  await expect(head, `the ${key} section is available`).toBeEnabled({ timeout: 15_000 });
  if ((await head.getAttribute('aria-expanded')) !== 'true') await head.click();
  await expect(head).toHaveAttribute('aria-expanded', 'true');
}

/** Press the case-level save ("Save draft" on the redesigned view, the last "Save" on the old one). */
export async function pressCaseSave(page: Page): Promise<void> {
  const draft = page.getByRole('button', { name: 'Save draft', exact: true });
  if (await draft.count()) await draft.click();
  else await page.getByRole('button', { name: /^Save$/ }).last().click();
}
