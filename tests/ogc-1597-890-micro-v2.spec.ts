/**
 * Microbiology V2: the V1 inoculation write path is retired (OGC-1597, #5049, 363180e290) and the
 * case pages meet the keyboard, contrast and offline requirements (OGC-890, #5050, a2e66aed15).
 *
 * Contract read from the diffs:
 *  - POST /rest/microbiology/cases/{caseId}/inoculations is gone (MicroCaseInoculationRestController
 *    removed). Cultures are inoculated only through the culture workspace's "Inoculate culture"
 *    dialog, which requires a source, an atmosphere, a duration and its unit (M4 rules).
 *  - Historic inoculation rows still display on the V2 case page.
 *  - Focus moves into the culture, isolate, incoming-result and note dialogs and returns to the
 *    trigger on close (returnFocus.js). Helper text meets contrast; case tables scroll by keyboard.
 *  - Offline, the worklist and case page show "Working offline; refresh when network returns." and
 *    turn off saves (OfflineNotice.jsx, useOnline); no queue or replay on reconnect.
 *
 * Data: reads only, except an empty Save attempt in the inoculation dialog (refused).
 */
import { test, expect, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { api, ready } from '../helpers/ci-fixtures';

const OFFLINE = 'Working offline; refresh when network returns.';

async function cultureCase(page: Page): Promise<string> {
  await ready(page);
  const r = await api(page, 'GET', '/microbiology/worklist');
  expect(r.status, r.text).toBe(200);
  const row = (r.body?.rows ?? []).find((x: any) => x.stage === 'IDENTIFICATION');
  test.skip(!row, 'no case at identification (with an inoculated culture) on the worklist');
  return String(row.caseId);
}

test.describe('Microbiology V2: V1 inoculation retired (OGC-1597), keyboard, contrast, offline (OGC-890)', () => {
  test('TC-MV2-01: the V1 inoculation endpoint no longer accepts a write', async ({ page }) => {
    const id = await cultureCase(page);
    const r = await api(page, 'POST', `/microbiology/cases/${id}/inoculations`, {});
    expect([404, 405], `POST inoculations answered ${r.status}: ${r.text}`).toContain(r.status);
  });

  test('TC-MV2-02: Inoculate culture keeps Save off without a source, atmosphere and duration, and focus returns to the trigger on Cancel', async ({ page }) => {
    const id = await cultureCase(page);
    await page.goto(`/Microbiology/cases/${id}?scope=CULTURE`);
    const trigger = page.getByRole('button', { name: 'Inoculate culture' }).first();
    await trigger.click({ timeout: 30_000 });
    const dialog = page.getByRole('dialog').filter({ hasText: 'Inoculate culture' });
    await expect(dialog).toBeVisible();
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]')), 'focus moves into the dialog').toBe(true);
    // Save stays off until the required fields are chosen (source, atmosphere, duration and unit).
    const save = dialog.getByRole('button', { name: 'Save' });
    await expect(save, 'Save is off with nothing chosen').toBeDisabled();
    const source = dialog.getByLabel('Source sample or aliquot');
    const firstSource = await source.locator('option').nth(1).getAttribute('value');
    expect(firstSource, 'the case offers a source').toBeTruthy();
    await source.selectOption(firstSource!);
    await expect(save, 'a source alone is not enough').toBeDisabled();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    await expect.poll(() => page.evaluate(() => document.activeElement?.textContent?.trim() ?? ''), { message: 'focus returns to the trigger', timeout: 5000 }).toBe('Inoculate culture');
  });

  test('TC-MV2-03: historic inoculations still display on the culture workspace', async ({ page }) => {
    const id = await cultureCase(page);
    await page.goto(`/Microbiology/cases/${id}?scope=CULTURE`);
    const main = page.locator('main');
    for (const label of ['Medium lot', 'Atmosphere', 'Incubation duration', 'Inoculated at']) {
      await expect(main.getByText(label, { exact: true }).first(), label).toBeVisible({ timeout: 30_000 });
    }
  });

  test('TC-MV2-04: the case page has no color-contrast or scrollable-region-focusable violations (WCAG 2.1 AA)', async ({ page }) => {
    const id = await cultureCase(page);
    for (const scope of ['', '?scope=CULTURE']) {
      await page.goto(`/Microbiology/cases/${id}${scope}`);
      await expect(page.locator('main')).toContainText('Case info', { timeout: 30_000 });
      await page.waitForLoadState('networkidle');
      const r = await new AxeBuilder({ page }).include('main').withRules(['color-contrast', 'scrollable-region-focusable']).analyze();
      const found = r.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
      expect(found, `case page${scope}`).toEqual([]);
    }
  });

  test('TC-MV2-05: offline, the case page and worklist show the offline notice; back online the notice goes', async ({ page, context }) => {
    const id = await cultureCase(page);
    await page.goto(`/Microbiology/cases/${id}`);
    await page.locator('#case-note-text').waitFor({ timeout: 30_000 });
    try {
      await context.setOffline(true);
      await expect(page.getByText(OFFLINE).first()).toBeVisible({ timeout: 10_000 });
    } finally {
      await context.setOffline(false);
    }
    await expect(page.getByText(OFFLINE)).toHaveCount(0, { timeout: 10_000 });
    await page.goto('/Microbiology/worklist');
    await expect(page.getByTestId('microbiology-worklist')).toContainText(/DEV0|\d{6}/, { timeout: 30_000 });
    try {
      await context.setOffline(true);
      await expect(page.getByText(OFFLINE).first(), 'worklist offline notice').toBeVisible({ timeout: 10_000 });
    } finally {
      await context.setOffline(false);
    }
    await expect(page.getByText(OFFLINE)).toHaveCount(0, { timeout: 10_000 });
  });

  test('TC-MV2-06: offline, the case page turns off its own saves (case note, case information)', async ({ page, context }) => {
    // FLIP-WHEN-FIXED (OGC-1659, blocks OGC-890 AC-NFR-01-02). Observed 18 Nov 2026 on develop
    // cd4bfc602: with the offline notice showing, Save note, Save (Case info), Save order detail and
    // Save questionnaire answers stay enabled; Save note then shows "Unable to load or save case testing
    // data." The gate (useOnline) is on the dialogs only (CaseTestingWorkspace, OrderDetailPanel,
    // CaseQuestionnaire and CaseContextEditor have none).
    test.fail();
    const id = await cultureCase(page);
    await page.goto(`/Microbiology/cases/${id}`);
    const note = page.locator('#case-note-text');
    await note.waitFor({ timeout: 30_000 });
    await note.fill('QA offline check');
    await expect(page.getByRole('button', { name: 'Save note' })).toBeEnabled();
    try {
      await context.setOffline(true);
      await expect(page.getByText(OFFLINE).first()).toBeVisible({ timeout: 10_000 });
      await expect(page.getByRole('button', { name: 'Save note' }), 'Save note is off while offline').toBeDisabled({ timeout: 3000 });
      await expect(page.getByRole('button', { name: 'Save order detail' }), 'Save order detail is off while offline').toBeDisabled({ timeout: 3000 });
    } finally {
      await context.setOffline(false);
      await note.fill('');
    }
  });
});
