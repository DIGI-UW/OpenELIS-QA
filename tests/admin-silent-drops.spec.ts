/**
 * tests/admin-silent-drops.spec.ts
 *
 * Admin forms that accept input and quietly lose or change it. Written 2026-09-27
 * against testing 3.2.3.0 from a hand walk-through (release-qa-3.2.3 R35, R36, R37).
 *
 * Coverage before this file: test-catalog-sample-type-management.spec.ts creates
 * sample types by REST, label-presets.spec.ts edits presets, and nothing drove the
 * Dictionary Menu's Add dialog. None compared what was typed with what was stored.
 *
 * Contract (same as helpers/silentSave.ts): act through the UI, read back through
 * REST, compare. `test.fail()` cases are FLIP-WHEN-FIXED tripwires that assert the
 * correct behaviour; each has a canary over the same path.
 */
import { test, expect, Page } from '@playwright/test';

const BASE = process.env.BASE_URL || process.env.BASE || 'https://testing.openelis-global.org';
const STAMP = `${Date.now()}`.slice(-7);

async function getJson<T = unknown>(page: Page, path: string): Promise<T> {
  return page.evaluate(async (p) => {
    const r = await fetch(p, { headers: { Accept: 'application/json' } });
    return r.json();
  }, path) as Promise<T>;
}

// ---------------------------------------------------------------------------
// R35: Sample Type Editor drops the description typed on create
// ---------------------------------------------------------------------------
interface SampleTypeRow { id: string; name: string; description?: string }

async function createSampleTypeViaUi(page: Page, name: string, description: string): Promise<string> {
  await page.goto(`${BASE}/MasterListsPage/SampleTypeEditor/new/basic-info`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#st-name')).toBeVisible({ timeout: 20_000 });
  await page.locator('#st-name').fill(name);
  const active = page.locator('#st-active');
  if ((await active.getAttribute('aria-checked')) !== 'true') await active.click();
  await expect(active, 'Active toggle is on').toHaveAttribute('aria-checked', 'true');
  await page.locator('#st-description').fill(description);
  await page.getByRole('button', { name: /Create Sample Type/i }).click();
  await page.waitForURL(/\/SampleTypeEditor\/\d+\/basic-info/, { timeout: 20_000 });
  return page.url().match(/SampleTypeEditor\/(\d+)\//)![1];
}

test.describe('Sample Type Editor (R35)', () => {
  test('TC-ASD-01: a sample type created in the editor is stored with its name', async ({ page }) => {
    // Canary for TC-ASD-02.
    const name = `QA_AUTO_ST_${STAMP}a`;
    const id = await createSampleTypeViaUi(page, name, 'QA canary description');
    const list = await getJson<{ data?: SampleTypeRow[] }>(page, '/api/OpenELIS-Global/rest/sample-types');
    const row = (list.data ?? []).find(r => String(r.id) === id);
    expect(row?.name, 'the new sample type is listed under its name').toBe(name);
  });

  test('TC-ASD-02: the description typed on create is stored', async ({ page }) => {
    // FLIP-WHEN-FIXED. Observed 2026-09-27: POST /rest/SampleTypeCreate carries no description;
    // the saved type shows its NAME as the description, although Description is marked required.
    test.fail();
    const name = `QA_AUTO_ST_${STAMP}b`;
    const description = `QA description ${STAMP}`;
    const id = await createSampleTypeViaUi(page, name, description);
    const list = await getJson<{ data?: SampleTypeRow[] }>(page, '/api/OpenELIS-Global/rest/sample-types');
    const row = (list.data ?? []).find(r => String(r.id) === id);
    expect(row?.description, 'stored description is what was typed').toBe(description);
  });
});

// ---------------------------------------------------------------------------
// R37: Label Presets lower-cases the name on save
// ---------------------------------------------------------------------------
interface Preset { id: number; name: string }

async function addPresetViaUi(page: Page, name: string): Promise<void> {
  await page.goto(`${BASE}/MasterListsPage/labelPresets`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Add Preset' }).click();
  const dialog = page.getByRole('dialog').filter({ hasText: 'Add Label Preset' });
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await dialog.locator('#preset-name').fill(name);
  await expect(dialog.locator('#preset-name'), 'the input holds exactly what was typed').toHaveValue(name);
  const saved = page.waitForResponse(r => /\/api\/labelPresets$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST');
  await dialog.getByRole('button', { name: 'Save' }).click();
  expect((await saved).status(), 'preset create answers 201').toBe(201);
}

test.describe('Label Presets (R37)', () => {
  test('TC-ASD-03: a new preset is stored (name compared case-insensitively)', async ({ page }) => {
    // Canary for TC-ASD-04.
    const name = `QA Auto Preset ${STAMP}a`;
    await addPresetViaUi(page, name);
    const presets = await getJson<Preset[]>(page, '/api/OpenELIS-Global/api/labelPresets');
    expect(presets.some(p => p.name.toLowerCase() === name.toLowerCase()), 'the preset exists').toBe(true);
  });

  test('TC-ASD-04: a new preset keeps the capitalisation that was typed', async ({ page }) => {
    // FLIP-WHEN-FIXED. Observed 2026-09-27: "QA Tube Label" was stored and listed as
    // "qa tube label"; the system presets are Title Case.
    test.fail();
    const name = `QA Auto Preset ${STAMP}b`;
    await addPresetViaUi(page, name);
    const presets = await getJson<Preset[]>(page, '/api/OpenELIS-Global/api/labelPresets');
    expect(presets.map(p => p.name), 'stored name is exactly what was typed').toContain(name);
  });
});

// ---------------------------------------------------------------------------
// R36: Dictionary Add fails silently when Is Active is left unset
// ---------------------------------------------------------------------------
const CATEGORY = 'NoteBook Experiment Type';

async function openAddDictionary(page: Page, entry: string, isActive: 'Y' | null) {
  await page.goto(`${BASE}/MasterListsPage/DictionaryMenu`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Add', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: /Add Dictionary/i });
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await dialog.getByRole('combobox', { name: /Dictionary Category/i }).click();
  await page.getByRole('option', { name: CATEGORY, exact: true }).click();
  await dialog.getByRole('textbox', { name: /Dictionary Entry/i }).fill(entry);
  if (isActive) {
    await dialog.getByRole('combobox', { name: /Is Active/i }).click();
    await page.getByRole('option', { name: isActive, exact: true }).click();
  }
  return dialog;
}

async function dictionaryValues(page: Page): Promise<string[]> {
  const list = await getJson<Array<{ value: string }>>(page, '/api/OpenELIS-Global/rest/displayList/NOTEBOOK_EXPT_TYPE');
  return list.map(x => x.value);
}

test.describe('Dictionary Menu Add (R36)', () => {
  test('TC-ASD-05: Add with Is Active = Y creates the entry', async ({ page }) => {
    // Canary for TC-ASD-06: the dialog, category, entry field and Add button all work.
    const entry = `QA Auto Dict ${STAMP}a`;
    const dialog = await openAddDictionary(page, entry, 'Y');
    const post = page.waitForResponse(r => /\/rest\/Dictionary$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST');
    await dialog.getByRole('button', { name: 'Add', exact: true }).click();
    expect((await post).status(), 'Dictionary POST answers 200').toBe(200);
    expect(await dictionaryValues(page), 'the entry is offered in its category').toContain(entry);
  });

  test('TC-ASD-06: Add with Is Active left empty tells the user what is missing', async ({ page }) => {
    // FLIP-WHEN-FIXED. Observed 2026-09-27: the dialog closed, nothing was created and no
    // message appeared; the server had answered 400 "isActive: must not be blank".
    test.fail();
    const entry = `QA Auto Dict ${STAMP}b`;
    const dialog = await openAddDictionary(page, entry, null);
    await dialog.getByRole('button', { name: 'Add', exact: true }).click();
    await page.waitForTimeout(2500);
    const dialogOpen = await dialog.isVisible();
    const message = await page.locator('[role="alert"], .cds--inline-notification, .cds--toast-notification, .cds--form-requirement')
      .filter({ hasText: /active|required|blank/i }).count();
    expect(dialogOpen || message > 0, 'the user is told Is Active is required (dialog kept open or a message shown)').toBe(true);
  });
});
