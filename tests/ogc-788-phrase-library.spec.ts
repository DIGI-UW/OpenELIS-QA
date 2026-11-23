/**
 * OGC-788 phrase library: Macro Library admin (OGC-869, OGC-871) and phrases in the
 * Microbiology V2 case fields (OGC-1596). Merged 16 Nov 2026 (#5052, e309a64a62).
 *
 * Contract read from the diff (specs/788-ogc-788-macro-library: spec, contracts/text-macro-api.md,
 * uat.md PHR-001 to PHR-012) and TextMacroServiceImpl:
 *  - Admin > Macro Library (/admin/MacroLibrary): list with search, context, category, status and
 *    sort filters kept in the URL; Add phrase (shortcut code, category, phrase text, field contexts).
 *  - Codes: a period then 1 to 14 of [a-z0-9_-]; ".help" and ".list" are reserved ("This code is
 *    reserved by the system").
 *  - GET /rest/text-macros?context=X lists active phrases for one context, code A-Z; an unknown
 *    context answers 400 INVALID_MACRO_CONTEXT.
 *  - Bulk ACTIVATE / DEACTIVATE / DELETE_LOCAL with a confirmation that names the phrases.
 *  - Export: CSV, header code,expansion_text,category,contexts,active, ordered by code, no ids.
 *  - A phrase field offers the phrases of its context only; choosing one replaces the shortcut and
 *    keeps the text around it; the saved note is plain text, so deactivating the phrase changes
 *    nothing already saved.
 *
 * Data: phrases .qa_ng24, .qa_hx, .qa_bulk_a (kept, active) and .qa_bulk_b (removed by the case);
 * case notes on the first RECEIVED or IDENTIFICATION case of the microbiology worklist.
 * Test data on testing is welcome (Casey, 17 Nov 2026).
 */
import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import { api, ready } from '../helpers/ci-fixtures';

const LIB = '/admin/MacroLibrary';
const NG24 = { code: '.qa_ng24', expansionText: 'No growth at 24 hours', category: 'CULTURE', contexts: ['MICROBIOLOGY_CULTURE_READING', 'MICROBIOLOGY_CASE_NOTE'], active: true };
const HX = { code: '.qa_hx', expansionText: 'Fever for 3 days, no antibiotics', category: 'CLINICAL', contexts: ['MICROBIOLOGY_CLINICAL_HISTORY'], active: true };
const BULK_A = { code: '.qa_bulk_a', expansionText: 'QA bulk phrase A', category: 'REPORTING', contexts: ['MICROBIOLOGY_CASE_NOTE'], active: true };
const BULK_B = { code: '.qa_bulk_b', expansionText: 'QA bulk phrase B', category: 'REPORTING', contexts: ['MICROBIOLOGY_CASE_NOTE'], active: true };

test.describe.configure({ mode: 'serial' });

async function findPhrase(page: Page, code: string): Promise<any | undefined> {
  const r = await api(page, 'GET', `/text-macros/admin?q=${encodeURIComponent(code)}&context=all&category=all&status=all&sort=code:asc&page=1&pageSize=100`);
  expect(r.status, `admin list: ${r.text}`).toBe(200);
  return (r.body?.items ?? []).find((m: any) => m.code === code);
}

/** Create or reset a phrase to the given state through the admin API. */
async function ensurePhrase(page: Page, p: typeof NG24): Promise<string> {
  await ready(page);
  const found = await findPhrase(page, p.code);
  const r = found
    ? await api(page, 'PUT', `/text-macros/admin/${found.id}`, p)
    : await api(page, 'POST', '/text-macros/admin', p);
  expect(r.status, `${p.code}: ${r.text}`).toBeLessThan(300);
  return String(r.body?.id ?? found?.id);
}

async function microCase(page: Page): Promise<string> {
  await ready(page);
  const r = await api(page, 'GET', '/microbiology/worklist');
  const row = (r.body?.rows ?? []).find((x: any) => /RECEIVED|IDENTIFICATION/.test(x.stage));
  test.skip(!row, 'no microbiology case on the worklist');
  return String(row.caseId);
}

/** The Add/Edit phrase dialog. */
const form = (page: Page) => page.getByRole('dialog').filter({ hasText: 'Shortcut code' });

/** The case's notes table (the timeline also carries a truncated, hidden copy of each note). */
const notes = (page: Page) => page.getByRole('table', { name: 'Case notes' });

/** Open Add phrase; the dialog resets its fields once its lists load, so fill after that and check. */
async function openAdd(page: Page) {
  await page.goto(`${LIB}?edit=new`);
  await expect(form(page).getByLabel('Category', { exact: true }).locator('option', { hasText: 'Culture' })).toHaveCount(1, { timeout: 20_000 });
  await page.waitForLoadState('networkidle');
}
async function fillCode(page: Page, code: string) {
  const f = form(page).getByLabel('Shortcut code', { exact: true });
  await expect(async () => { await f.fill(code); await expect(f).toHaveValue(code, { timeout: 1000 }); }).toPass({ timeout: 10_000 });
}

async function typeAndPick(page: Page, fieldId: string, typed: string) {
  const f = page.locator(`#${fieldId}`);
  await f.waitFor({ state: 'attached', timeout: 30_000 });
  if (!(await f.isVisible())) {
    // V3 (#5140, 20 Nov 2026) moved the order detail fields into the collapsed "Case info" accordion.
    await page.locator('.cds--accordion__heading', { hasText: 'Case info' }).first().click();
  }
  await f.waitFor({ timeout: 30_000 });
  await f.click();
  await f.fill('');
  await f.pressSequentially(typed, { delay: 40 });
  return f;
}

test.describe('Phrase library (TC-PHR, OGC-788)', () => {
  test('TC-PHR-01: Add phrase saves the code, category and both field contexts, and the row shows them', async ({ page }) => {
    await ready(page);
    const old = await findPhrase(page, NG24.code);
    if (old) await api(page, 'POST', '/text-macros/admin/bulk', { ids: [old.id], action: 'DELETE_LOCAL' });
    await openAdd(page);
    await fillCode(page, NG24.code);
    await form(page).getByLabel('Category', { exact: true }).selectOption({ label: 'Culture' });
    await form(page).getByLabel('Phrase text', { exact: true }).fill(NG24.expansionText);
    await form(page).getByText('Culture reading notes', { exact: true }).click();
    await form(page).getByText('Case notes', { exact: true }).click();
    const save = page.waitForResponse((r) => /\/rest\/text-macros\/admin$/.test(r.url()) && r.request().method() === 'POST');
    await form(page).getByRole('button', { name: 'Save phrase' }).click();
    expect((await save).status(), 'create answers 2xx').toBeLessThan(300);
    await page.goto(`${LIB}?q=${NG24.code}&context=all&category=all&status=all&sort=code%3Aasc&page=1&pageSize=20`);
    const row = page.locator('tr', { hasText: NG24.code });
    await expect(row).toContainText('Culture', { timeout: 20_000 });
    await expect(row).toContainText('Culture reading notes');
    await expect(row).toContainText('Case notes');
    await expect(row).toContainText('Active');
    const saved = await findPhrase(page, NG24.code);
    expect(saved?.contexts?.sort(), 'contexts read back').toEqual([...NG24.contexts].sort());
    expect(saved?.category).toBe('CULTURE');
  });

  test('TC-PHR-02: a reserved code is refused on the code field ("This code is reserved by the system")', async ({ page }) => {
    await ready(page);
    const apiTry = await api(page, 'POST', '/text-macros/admin', { ...BULK_A, code: '.help' });
    expect(apiTry.status, apiTry.text).toBe(400);
    expect(apiTry.text).toMatch(/MACRO_CODE_RESERVED/);
    await openAdd(page);
    await fillCode(page, '.help');
    await form(page).getByLabel('Category', { exact: true }).selectOption({ label: 'Reporting' });
    await form(page).getByLabel('Phrase text', { exact: true }).fill('QA reserved code check');
    await form(page).getByText('Case notes', { exact: true }).click();
    await form(page).getByRole('button', { name: 'Save phrase' }).click();
    await expect(page.getByText(/This code is reserved by the system/)).toBeVisible({ timeout: 15_000 });
    expect(await findPhrase(page, '.help'), '.help was not saved').toBeUndefined();
  });

  test('TC-PHR-03: the filtered library survives a reload from its URL', async ({ page }) => {
    await ensurePhrase(page, NG24);
    const url = `${LIB}?q=.qa_ng24&context=all&category=all&status=all&sort=code%3Aasc&page=1&pageSize=20`;
    await page.goto(url);
    await expect(page.locator('tr', { hasText: '.qa_ng24' })).toBeVisible({ timeout: 20_000 });
    await page.reload();
    await expect(page.locator('tr', { hasText: '.qa_ng24' })).toBeVisible({ timeout: 20_000 });
    const after = new URL(page.url());
    expect(after.searchParams.get('q')).toBe('.qa_ng24');
    expect(after.searchParams.get('status')).toBe('all');
    expect(after.searchParams.get('sort')).toBe('code:asc');
    await expect(page.getByRole('searchbox').first()).toHaveValue('.qa_ng24');
  });

  test('TC-PHR-04: a case note expands the phrase in place, keeps the prefix, saves plain text, and deactivating the phrase leaves the note as saved', async ({ page }) => {
    const id = await ensurePhrase(page, NG24);
    const caseId = await microCase(page);
    const stamp = `QA ${Date.now()} plate read: `;
    await page.goto(`/Microbiology/cases/${caseId}`);
    const f = await typeAndPick(page, 'case-note-text', `${stamp}.qa_ng2`);
    const option = page.locator('#case-note-text-macro-options [role=option]', { hasText: '.qa_ng24' });
    await expect(option).toBeVisible({ timeout: 10_000 });
    await expect(option, 'the suggestion shows its category').toContainText('Culture');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(f).toHaveValue(`${stamp}No growth at 24 hours`);
    expect(await page.evaluate(() => document.activeElement?.id), 'focus stays in the note').toBe('case-note-text');
    await page.getByRole('button', { name: 'Save note' }).click();
    await expect(notes(page).getByText(`${stamp}No growth at 24 hours`)).toBeVisible({ timeout: 20_000 });
    try {
      const off = await api(page, 'POST', '/text-macros/admin/bulk', { ids: [id], action: 'DEACTIVATE' });
      expect(off.status, off.text).toBeLessThan(300);
      await page.reload();
      await expect(notes(page).getByText(`${stamp}No growth at 24 hours`), 'the saved note is unchanged').toBeVisible({ timeout: 20_000 });
      await typeAndPick(page, 'case-note-text', 'again .qa_ng2');
      await page.waitForTimeout(1500);
      await expect(page.locator('#case-note-text-macro-options [role=option]', { hasText: '.qa_ng24' }), 'an inactive phrase is not offered').toHaveCount(0);
      await page.locator('#case-note-text').fill('');
    } finally {
      await api(page, 'POST', '/text-macros/admin/bulk', { ids: [id], action: 'ACTIVATE' });
    }
  });

  test('TC-PHR-05: each field offers only its own context (Clinical history phrase is not offered in case notes)', async ({ page }) => {
    await ensurePhrase(page, NG24);
    await ensurePhrase(page, HX);
    const caseId = await microCase(page);
    const rt = await api(page, 'GET', '/text-macros?context=MICROBIOLOGY_CASE_NOTE');
    expect((rt.body?.items ?? []).map((m: any) => m.code)).not.toContain('.qa_hx');
    expect(JSON.stringify(rt.body?.items?.[0] ?? {}), 'runtime list carries no audit fields').not.toMatch(/lastupdated|createdBy|actor/i);
    const bad = await api(page, 'GET', '/text-macros?context=BOGUS');
    expect(bad.status).toBe(400);
    await page.goto(`/Microbiology/cases/${caseId}`);
    await typeAndPick(page, 'case-note-text', '.qa_');
    await expect(page.locator('#case-note-text-macro-options [role=option]', { hasText: '.qa_ng24' })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#case-note-text-macro-options [role=option]', { hasText: '.qa_hx' })).toHaveCount(0);
    await page.locator('#case-note-text').fill('');
    const hx = await typeAndPick(page, 'microbiology-order-detail-clinical-history', 'Hx: .qa_h');
    const opt = page.locator('[role=option]', { hasText: '.qa_hx' });
    await expect(opt).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[role=option]', { hasText: '.qa_ng24' }), 'a case-note phrase is not offered in Clinical history').toHaveCount(0);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(hx).toHaveValue('Hx: Fever for 3 days, no antibiotics');
  });

  test('TC-PHR-06: bulk Deactivate names both phrases, Cancel changes nothing, confirm deactivates both; Activate restores both', async ({ page }) => {
    await ensurePhrase(page, BULK_A);
    await ensurePhrase(page, BULK_B);
    const url = `${LIB}?q=.qa_bulk&context=all&category=all&status=all&sort=code%3Aasc&page=1&pageSize=20`;
    const pick = async () => {
      await page.goto(url);
      for (const code of ['.qa_bulk_a', '.qa_bulk_b']) {
        await page.getByRole('checkbox', { name: `Select ${code}` }).check({ force: true, timeout: 20_000 });
        await expect(page.getByRole('checkbox', { name: `Select ${code}` })).toBeChecked();
      }
    };
    await pick();
    await page.getByRole('button', { name: /^Deactivate/ }).click();
    const dialog = page.getByRole('dialog').filter({ hasText: /Deactivate/ });
    await expect(dialog).toContainText('.qa_bulk_a');
    await expect(dialog).toContainText('.qa_bulk_b');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    expect((await findPhrase(page, '.qa_bulk_a'))?.active, 'Cancel changed nothing').toBe(true);
    await page.getByRole('button', { name: /^Deactivate/ }).click();
    await dialog.getByRole('button', { name: /^Deactivate/ }).click();
    await expect.poll(async () => [(await findPhrase(page, '.qa_bulk_a'))?.active, (await findPhrase(page, '.qa_bulk_b'))?.active], { timeout: 15_000 }).toEqual([false, false]);
    await pick();
    await page.getByRole('button', { name: /^Activate/ }).click();
    await page.getByRole('dialog').filter({ hasText: /Activate/ }).getByRole('button', { name: /^Activate/ }).click();
    await expect.poll(async () => [(await findPhrase(page, '.qa_bulk_a'))?.active, (await findPhrase(page, '.qa_bulk_b'))?.active], { timeout: 15_000 }).toEqual([true, true]);
  });

  test('TC-PHR-07: Export phrases gives a UTF-8 CSV, header row first, ordered by code, with no ids', async ({ page }) => {
    await ensurePhrase(page, NG24);
    await page.goto(LIB);
    const dl = page.waitForEvent('download', { timeout: 30_000 });
    await page.getByRole('button', { name: /Export phrases/ }).click();
    const file = await (await dl).path();
    const text = fs.readFileSync(file, 'utf8');
    const lines = text.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
    expect(lines[0]).toBe('code,expansion_text,category,contexts,active');
    const codes = lines.slice(1).map((l) => l.split(',')[0]);
    expect(codes, 'ordered by code').toEqual([...codes].sort());
    const ng = lines.find((l) => l.startsWith('.qa_ng24,'));
    expect(ng, 'the QA phrase is exported').toBeTruthy();
    expect(ng).toMatch(/CULTURE/);
    expect(ng).toMatch(/MICROBIOLOGY_CASE_NOTE\|MICROBIOLOGY_CULTURE_READING|MICROBIOLOGY_CULTURE_READING\|MICROBIOLOGY_CASE_NOTE/);
    expect(text, 'no database id or actor').not.toMatch(/\bid\b|lastupdated|admin\b/i);
  });

  test('TC-PHR-08: Remove local phrases asks for a danger confirmation and removes only the selected phrase', async ({ page }) => {
    await ensurePhrase(page, BULK_A);
    await ensurePhrase(page, BULK_B);
    await page.goto(`${LIB}?q=.qa_bulk&context=all&category=all&status=all&sort=code%3Aasc&page=1&pageSize=20`);
    await page.getByRole('checkbox', { name: 'Select .qa_bulk_b' }).check({ force: true, timeout: 20_000 });
    await expect(page.getByRole('checkbox', { name: 'Select .qa_bulk_b' })).toBeChecked();
    await page.getByRole('button', { name: 'Remove local phrases' }).click();
    const dialog = page.getByRole('dialog').filter({ hasText: /Remove/ });
    await expect(dialog).toContainText('.qa_bulk_b');
    await expect(dialog).not.toContainText('.qa_bulk_a');
    await expect(dialog, 'the confirmation says it cannot be undone').toContainText(/cannot undo/i);
    await dialog.getByRole('button', { name: /Remove phrases/ }).click();
    await expect.poll(async () => await findPhrase(page, '.qa_bulk_b'), { timeout: 15_000 }).toBeUndefined();
    expect((await findPhrase(page, '.qa_bulk_a'))?.active, '.qa_bulk_a stays').toBe(true);
    await page.reload();
    await expect(page.locator('tr', { hasText: '.qa_bulk_a' })).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('tr', { hasText: '.qa_bulk_b' })).toHaveCount(0);
  });

  test('TC-PHR-09: a non-administrator can read active phrases but cannot change the library', async ({ browser }) => {
    const state = '.auth/role-labtech.json';
    test.skip(!fs.existsSync(state), 'no lab technician session (run the roles setup)');
    const ctx = await browser.newContext({ storageState: state });
    const page = await ctx.newPage();
    try {
      await ready(page);
      const use = await api(page, 'GET', '/text-macros?context=MICROBIOLOGY_CASE_NOTE');
      expect(use.status, `runtime lookup: ${use.text}`).toBe(200);
      expect((use.body?.items ?? []).map((m: any) => m.code)).toContain('.qa_ng24');
      const list = await api(page, 'GET', '/text-macros/admin?status=all');
      expect([401, 403], `admin list: ${list.status}`).toContain(list.status);
      const write = await api(page, 'POST', '/text-macros/admin', { ...BULK_A, code: '.qa_nonadmin' });
      expect([401, 403], `admin write: ${write.status}`).toContain(write.status);
      const bulk = await api(page, 'POST', '/text-macros/admin/bulk', { ids: ['1'], action: 'DEACTIVATE' });
      expect([401, 403], `bulk: ${bulk.status}`).toContain(bulk.status);
    } finally {
      await ctx.close();
    }
  });

  test('TC-PHR-10: a culture reading note offers the Culture phrase and expands it in place', async ({ page }) => {
    await ensurePhrase(page, NG24);
    const r = await api(page, 'GET', '/microbiology/worklist');
    const row = (r.body?.rows ?? []).find((x: any) => x.stage === 'IDENTIFICATION');
    test.skip(!row, 'no case at identification (with a culture) on the worklist');
    await page.goto(`/Microbiology/cases/${row.caseId}?scope=CULTURE`);
    await page.getByRole('button', { name: 'Add reading' }).first().click({ timeout: 30_000 });
    const f = await typeAndPick(page, 'culture-note', 'Plate read: .qa_ng2');
    await expect(page.locator('[role=option]', { hasText: '.qa_ng24' })).toContainText('Culture', { timeout: 10_000 });
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(f).toHaveValue('Plate read: No growth at 24 hours');
    await f.fill('');
  });
});

