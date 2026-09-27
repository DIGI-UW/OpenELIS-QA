/**
 * tests/notebook-project.spec.ts
 *
 * Electronic lab notebook: a project's metadata edit must stick, and clearing a required
 * field must be refused with a message rather than reported as saved.
 * Written 2026-09-27 against testing 3.2.3.0 (release-qa-3.2.3 R59;
 * uncovered-workflows-catalogue TC-ELNW-02/05).
 *
 * Coverage before this file: notebook specs check that the dashboard renders (smoke).
 * Data: uses the first project on the Notebook dashboard (testing has "QA Notebook
 * Project 1"); its Objective is restored at the end.
 */
import { test, expect, Page } from '@playwright/test';

const BASE = process.env.BASE_URL || process.env.BASE || 'https://testing.openelis-global.org';
const EDIT = `QA objective ${Date.now()}`.slice(0, 40);

test.describe.configure({ mode: 'serial' });

let projectUrl = '';
let original = '';

async function openMetadata(page: Page) {
  await page.goto(projectUrl, { waitUntil: 'domcontentloaded' });
  await page.locator('button', { hasText: /^MetaData$/ }).first().click();
  await expect(page.locator('#objective')).toBeVisible({ timeout: 15_000 });
  await page.waitForLoadState('networkidle');
}

async function saveObjective(page: Page, value: string) {
  await page.locator('#objective').fill(value);
  await page.locator('#objective').press('Tab');
  const post = page.waitForResponse(r => /\/rest\/notebook\/update\/\d+$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  return post;
}

test.describe('Notebook project form (TC-ELNW)', () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await page.goto(`${BASE}/NotebookDashboard`, { waitUntil: 'domcontentloaded' });
    const row = page.locator('tr', { has: page.locator('svg') }).filter({ hasText: /\S/ }).nth(1);
    await expect(row, 'a notebook project is listed (seed one if absent)').toBeVisible({ timeout: 20_000 });
    await row.locator('svg').first().click();                // the project's edit pencil
    await page.waitForURL(/\/NoteBookEntryForm\/\d+/, { timeout: 15_000 });
    projectUrl = page.url();
    await page.locator('button', { hasText: /^MetaData$/ }).first().click();
    original = await page.locator('#objective').inputValue();
    await page.close();
  });

  test.afterAll(async ({ browser }) => {
    if (!projectUrl || !original) return;
    const page = await browser.newPage();
    await openMetadata(page);
    await saveObjective(page, original);
    await page.close();
  });

  test('TC-ELNW-05: an edited project Objective is kept', async ({ page }) => {
    await openMetadata(page);
    expect((await saveObjective(page, EDIT)).status(), 'update answers 200').toBe(200);
    await openMetadata(page);
    await expect(page.locator('#objective'), 'the new objective reads back').toHaveValue(EDIT);
  });

  test('TC-ELNW-02: clearing the required Objective is refused with a message', async ({ page }) => {
    // FLIP-WHEN-FIXED (R59). Observed 2026-09-27: "Successfully saved", old value kept, no
    // word about the required field.
    test.fail();
    await openMetadata(page);
    const told = page.getByText(/objective[^.]*required|required[^.]*objective|cannot be (empty|blank)/i).first();
    await page.locator('#objective').fill('');
    await page.locator('#objective').press('Tab');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(told, 'the user is told Objective is required').toBeVisible({ timeout: 3000 });
  });
});
