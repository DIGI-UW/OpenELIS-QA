/**
 * tests/programs-admin.spec.ts
 *
 * Programs: a program created or deactivated in Admin > Programs must change what
 * Add Order offers, and the Order Programs list must be readable.
 * Written 2026-09-27 against testing 3.2.3.0 after the same walk by hand
 * (uncovered-workflows-catalogue TC-PRGW-01/03/04/05; release-qa-3.2.3 R49).
 *
 * Coverage before this file: none. workflow-coverage rated "Programs & order
 * questionnaires" as none (OGC-781 was only walked by hand).
 *
 * Contract: act through the admin UI; read back what Add Order will offer from the
 * endpoint its Program dropdown loads (/rest/user-programs?domain=CLINICAL).
 */
import { test, expect, Page } from '@playwright/test';
import { apiGet } from '../helpers/silentSave';

const BASE = process.env.BASE_URL || process.env.BASE || 'https://testing.openelis-global.org';
const STAMP = `${Date.now()}`.slice(-6);
const NAME = `QA Prog ${STAMP}`;
const CODE = `QA_PRG_${STAMP}`;

test.describe.configure({ mode: 'serial' });

async function offeredOnAddOrder(page: Page): Promise<string[]> {
  const r = await apiGet<Array<{ value: string }>>(page, '/rest/user-programs?domain=CLINICAL');
  expect(r.status, 'user-programs answers').toBe(200);
  return (r.json ?? []).map(p => p.value);
}

async function openPrograms(page: Page) {
  await page.goto(`${BASE}/MasterListsPage/program`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Add Program' })).toBeVisible({ timeout: 20_000 });
}

test.describe('Programs admin (TC-PRGW)', () => {
  test('TC-PRGW-01: a program created in admin is offered on Add Order', async ({ page }) => {
    await openPrograms(page);
    await page.getByRole('button', { name: 'Add Program' }).click();
    await page.locator('#pname-new').fill(NAME);
    await page.locator('#pcode-new').fill(CODE);
    await page.locator('label[for="dc-new"]').click();                 // domain: Clinical
    // Filterable multiselect: open it with its own "Open" button, then pick the unit.
    const units = page.getByRole('combobox', { name: /Lab unit/ });
    const option = page.locator('.cds--list-box__menu-item').filter({ hasText: /^Biochemistry/ }).first();
    await expect(async () => {
      await units.click();
      if (!(await option.isVisible())) await units.press('ArrowDown');
      await expect(option).toBeVisible({ timeout: 2000 });
    }, 'the lab unit list opens').toPass({ timeout: 20_000 });
    await option.click();
    await page.keyboard.press('Escape');
    const post = page.waitForResponse(r => /\/rest\/program$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Submit', exact: true }).click();
    expect((await post).status(), 'program save answers 200').toBe(200);
    expect(await offeredOnAddOrder(page), `${NAME} is offered on Add Order`).toContain(NAME);
  });

  test('TC-PRGW-05: a deactivated program is no longer offered on Add Order', async ({ page }) => {
    await openPrograms(page);
    const row = page.locator('tbody tr', { hasText: NAME });
    await expect(row, `${NAME} is listed`).toBeVisible({ timeout: 15_000 });
    await row.getByRole('button').last().click();                         // overflow menu
    await page.getByRole('menuitem', { name: /Deactivate/ }).click();
    const dialog = page.locator('.cds--modal.is-visible');
    await expect(dialog, 'a confirmation explains the effect').toContainText(/stop appearing for new orders/i);
    const post = page.waitForResponse(r => /\/rest\/program$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST');
    await dialog.getByRole('button', { name: /Deactivate$/ }).click();   // accessible name is "danger Deactivate"
    expect((await post).status(), 'deactivation answers 200').toBe(200);
    expect(await offeredOnAddOrder(page), `${NAME} is no longer offered`).not.toContain(NAME);
  });

  test('TC-PRGW-03: Order Programs lists each order once', async ({ page }) => {
    // FLIP-WHEN-FIXED (R49). Observed 2026-09-27: DEV...0090 listed twice; Total Entries
    // counted the duplicate.
    test.fail();
    await page.goto(`${BASE}/genericProgram`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('columnheader', { name: /Accession number/i })).toBeVisible({ timeout: 20_000 });
    await page.waitForLoadState('networkidle');
    const accessions = (await page.locator('tbody tr').allInnerTexts()).map(t => (t.match(/[A-Z]+\d{10,}/) ?? [''])[0]).filter(Boolean);
    expect(accessions.length, 'Order Programs has rows').toBeGreaterThan(0);
    expect(new Set(accessions).size, `no accession listed twice: ${accessions.join(', ')}`).toBe(accessions.length);
  });

  test('TC-PRGW-04: the Questionnaire column is readable, not a raw id', async ({ page }) => {
    // FLIP-WHEN-FIXED (R49). Observed 2026-09-27: cells show UUIDs such as cd2251a4-2ce5-...
    test.fail();
    await page.goto(`${BASE}/genericProgram`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('columnheader', { name: /Questionnaire/i })).toBeVisible({ timeout: 20_000 });
    await page.waitForLoadState('networkidle');
    const text = await page.locator('tbody').innerText();
    expect(text, 'no raw UUIDs in the list').not.toMatch(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/);
  });
});
