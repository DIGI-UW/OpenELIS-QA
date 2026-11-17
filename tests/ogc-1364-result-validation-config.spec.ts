/**
 * OGC-1364 Result & Validation Configuration (PRs #5013, #5069, #5073, #5077, #5093, #5094).
 *
 * Contract read from the diffs:
 *  - Admin > Result configuration (/MasterListsPage/ResultConfigurationMenu) is "Result & Validation
 *    Configuration": the result settings are switches and fields grouped by purpose, each group with
 *    its own Save; the select-a-row-then-Modify table is retired for this menu (#5093, #5094).
 *  - Every result setting has a plain-language name and a description of what On does, in place of
 *    the stored "If true ..." texts (#5094).
 *  - The technician-name autofill switches sit under "Require the technician name" and are disabled
 *    while it is off (#5093).
 *  - A setting saved from a page that loaded an older version is refused with 409, the page says so in
 *    plain words and reloads the latest values; the newer value stands (#5094).
 *  - "Use the validation policy" (useMultiLevelValidation, off by default) decides the Validation group:
 *    off, "validate all results" is a switch there; on, the Validation policy section replaces it
 *    (#5013, #5094). GET /rest/validation-policy/lab-units lists the lab units an override can be
 *    added for (#5069).
 *
 * Replaces TC-1515-13b (the settings table this menu no longer has). The dev team's
 * ogc-1364-result-validation-configuration and ogc-1364-validation-policy specs turn the policy on
 * and drive the overrides on their own stack; this spec leaves the policy flag as it finds it, since
 * testing is shared, and changes only the critical result message, restored at the end.
 */
import { test, expect, Page, Locator } from '@playwright/test';

const MENU = '/MasterListsPage/ResultConfigurationMenu';
const API = '/api/OpenELIS-Global/rest';
const MESSAGE = 'Critical result message';
const RAW_KEY = /\b[a-z][A-Za-z]+(\.[A-Za-z0-9_]+){2,}\b/;

async function openPage(page: Page): Promise<Locator> {
  await page.goto(MENU, { waitUntil: 'domcontentloaded' });
  const grouped = page.getByTestId('result-validation-settings');
  await expect(grouped).toBeVisible({ timeout: 30_000 });
  await expect(grouped.locator('[data-testid^="setting-"]').first()).toBeVisible({ timeout: 30_000 });
  return grouped;
}
const settingBlock = (grouped: Locator, name: string) =>
  grouped.locator('[data-testid^="setting-"]', { hasText: name }).first();

async function saveGroupOf(page: Page, block: Locator) {
  const group = block.locator('xpath=ancestor::*[starts-with(@data-testid,"settings-group-")][1]');
  const post = page.waitForResponse((r) => /\/rest\/ResultConfiguration/.test(r.url()) && r.request().method() === 'POST', { timeout: 30_000 });
  await group.locator('[data-testid^="save-group-"]').click();
  return post;
}

/** The stored value of one setting, read through the single-setting endpoint. */
async function storedValue(page: Page, id: string): Promise<string> {
  const r = await page.request.get(`${API}/ResultConfiguration?ID=${id}`, { headers: { 'Accept-Language': 'en-US' } });
  expect(r.status(), `GET ResultConfiguration ${id}`).toBe(200);
  return String((await r.json()).value ?? '');
}

test.describe('OGC-1364 Result & Validation Configuration (TC-1364)', () => {
  let messageId = '';
  let messageBefore = '';

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    const grouped = await openPage(page);
    const block = settingBlock(grouped, MESSAGE);
    messageId = ((await block.getAttribute('data-testid')) || '').replace('setting-', '');
    messageBefore = await block.getByRole('textbox').inputValue();
    await page.close();
  });

  test.afterAll(async ({ browser }) => {
    if (!messageId) return;
    const page = await browser.newPage();
    const grouped = await openPage(page);
    const block = settingBlock(grouped, MESSAGE);
    if ((await block.getByRole('textbox').inputValue()) !== messageBefore) {
      await block.getByRole('textbox').fill(messageBefore);
      await saveGroupOf(page, block);
    }
    await page.close();
  });

  test('TC-1364-01: the result settings are grouped switches with a Save per group, no settings table', async ({ page }) => {
    const grouped = await openPage(page);
    await expect(page.getByRole('heading', { name: 'Result & Validation Configuration' })).toBeVisible();
    for (const id of ['validation', 'resultEntry', 'modification', 'display', 'access']) {
      await expect(page.getByTestId(`settings-group-${id}`), `the ${id} group`).toBeVisible();
      await expect(page.getByTestId(`save-group-${id}`), `the ${id} group has its own Save`).toHaveCount(1);
    }
    await expect(page.getByRole('button', { name: 'Modify', exact: true }), 'the Modify table is retired').toHaveCount(0);
    const names = await grouped.locator('[data-testid^="setting-"]').evaluateAll((es) =>
      es.map((e) => ((e as HTMLElement).innerText || '').split('\n')[0].trim()));
    expect(names.length, 'settings are listed').toBeGreaterThan(10);
    expect(names.filter((n) => /^[a-z][A-Za-z]+([ .][a-z][A-Za-z]+)*$/.test(n) && !/ /.test(n)),
      'every setting shows a plain-language name, not its stored key').toEqual([]);
    // Nothing saved yet: each group's Save waits for a change.
    await expect(page.getByTestId('save-group-resultEntry')).toBeDisabled();
  });

  test('TC-1364-02: the technician-name autofill switches are disabled while the technician name is off', async ({ page }) => {
    const grouped = await openPage(page);
    const technician = page.getByRole('switch', { name: /^Require the technician name/ });
    const autofills = [page.getByRole('switch', { name: /^Show an autofill box/ }), page.getByRole('switch', { name: /^Autofill the technician name/ })];
    await expect(technician).toBeVisible();
    const on = (await technician.getAttribute('aria-checked')) === 'true';
    for (const s of autofills) {
      if (on) await expect(s, 'with the technician name on, its autofill switches can be used').toBeEnabled();
      else await expect(s, 'with the technician name off, its autofill switches are disabled').toBeDisabled();
    }
    expect(await settingBlock(grouped, 'Show an autofill box').innerText()).toMatch(/technician name/i);
  });

  test('TC-1364-03: every setting says what On does in plain words, never "If true" or a raw key', async ({ page }) => {
    // A US-English browser loads en_US.json. At testing's build (0937523e6) its Transifex text still
    // had the stored "If true ..." descriptions; develop's en_US.json has the plain ones, so this
    // fails on testing only until its next deploy (17 Nov 2026).
    const grouped = await openPage(page);
    const texts = await grouped.locator('[data-testid^="setting-"]').evaluateAll((es) =>
      es.map((e) => ((e as HTMLElement).innerText || '').replace(/\s+/g, ' ').trim()));
    expect(texts.filter((t) => /\bIf true\b/.test(t)), 'no "If true" description').toEqual([]);
    expect(texts.filter((t) => RAW_KEY.test(t)), 'no raw message keys').toEqual([]);
  });

  test('TC-1364-04: a changed setting is saved by its group, reads back on the page and on the API', async ({ page }) => {
    const grouped = await openPage(page);
    const block = settingBlock(grouped, MESSAGE);
    const stamp = `QA_AUTO call the ward ${Date.now().toString().slice(-6)}`;
    await block.getByRole('textbox').fill(stamp);
    await expect(page.getByTestId('save-group-resultEntry'), 'the change enables its group Save').toBeEnabled();
    const res = await saveGroupOf(page, block);
    expect(res.status(), 'the group save answers 200').toBe(200);
    await expect(page.locator('.cds--toast-notification, .cds--inline-notification').first(), 'the save is confirmed').toBeVisible({ timeout: 15_000 });
    const again = await openPage(page);
    await expect(settingBlock(again, MESSAGE).getByRole('textbox'), 'the value survives a reload').toHaveValue(stamp);
    expect(await storedValue(page, messageId), 'the API reads the same value').toBe(stamp);
  });

  test('TC-1364-05: a save from a page that loaded an older version is refused, and the newer value stands', async ({ page, context }) => {
    const older = await context.newPage();
    const olderGrouped = await openPage(older);
    const grouped = await openPage(page);
    const newer = `QA_AUTO newer ${Date.now().toString().slice(-6)}`;
    const block = settingBlock(grouped, MESSAGE);
    await block.getByRole('textbox').fill(newer);
    expect((await saveGroupOf(page, block)).status(), 'the up-to-date save answers 200').toBe(200);

    const stale = settingBlock(olderGrouped, MESSAGE);
    await stale.getByRole('textbox').fill('QA_AUTO stale');
    const refused = await saveGroupOf(older, stale);
    expect(refused.status(), 'the save from the outdated page is refused 409').toBe(409);
    await expect(older.locator('.cds--toast-notification, .cds--inline-notification, [role="alert"]').filter({ hasText: /\S/ }).first(),
      'the outdated page says why').toBeVisible({ timeout: 15_000 });
    const said = await older.locator('.cds--toast-notification, .cds--inline-notification, [role="alert"]').filter({ hasText: /\S/ }).first().innerText();
    expect(said, 'in plain words, not a key').not.toMatch(RAW_KEY);
    await expect(stale.getByRole('textbox'), 'the outdated page reloads the latest value').toHaveValue(newer, { timeout: 15_000 });
    expect(await storedValue(page, messageId), 'the newer value stands').toBe(newer);
    await older.close();
  });

  test('TC-1364-06: the policy flag decides what the Validation group shows', async ({ page }) => {
    const grouped = await openPage(page);
    const flag = page.getByRole('switch', { name: /^Use the validation policy/ });
    await expect(flag).toBeVisible();
    const policyOn = (await flag.getAttribute('aria-checked')) === 'true';
    const validateAll = settingBlock(grouped, 'validate all results');
    const policy = page.getByText(/^Validation policy$/).first();
    if (policyOn) {
      await expect(policy, 'with the policy on, its section is shown').toBeVisible();
      await expect(validateAll, 'and "validate all results" is not listed').toHaveCount(0);
    } else {
      await expect(validateAll, 'with the policy off, "validate all results" is a switch under Validation')
        .toBeVisible();
      await expect(page.getByTestId('settings-group-validation').getByRole('switch', { name: /validate all results/i })).toHaveCount(1);
    }
    // The overrides list is readable whatever the flag says (#5069).
    const r = await page.request.get(`${API}/validation-policy/lab-units`);
    expect(r.status(), 'GET validation-policy/lab-units').toBe(200);
    const body = await r.json();
    expect(Array.isArray(body.labUnits) && body.labUnits.length, 'it lists the active lab units').toBeTruthy();
    expect(body.labUnits.every((u: any) => u.id && u.name && u.domain), 'each with id, name and domain').toBe(true);
  });

  test('TC-1364-07: in French the page shows French text and no raw keys', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('locale', 'fr'));
    try {
      const grouped = await openPage(page);
      const text = (await grouped.innerText()).replace(/\s+/g, ' ');
      expect(text.match(new RegExp(RAW_KEY.source, 'g')) || [], 'no raw message keys in French').toEqual([]);
      // The page's own strings are in French (they reached fr.json after testing's 0937523e6 build).
      await expect(page.getByTestId('save-group-validation'), 'the group Save is in French').toHaveText(/Enregistrer/);
      await expect(grouped.getByText(/^(Activé|Désactivé)$/).first(), 'the switch states are in French').toBeVisible();
    } finally {
      // Back to English on the server too: the session keeps its last language.
      await page.evaluate(() => localStorage.setItem('locale', 'en')).catch(() => {});
      await openPage(page);
      await expect(page.getByRole('heading', { name: 'Result & Validation Configuration' })).toBeVisible();
    }
  });
});
