/**
 * tests/org-admin.spec.ts
 *
 * Organization Management: a new organization saves; a duplicate name does not.
 * Written 2026-09-27 against testing 3.2.3.0 (release-qa-3.2.3 R60;
 * uncovered-workflows-catalogue TC-ORGW-00/02).
 *
 * Coverage before this file: admin-config and admin-route-census render the page.
 * Nothing saved an organization, so duplicate names (six "QA Auto Clinic" in the Add
 * Order site search) went unnoticed.
 */
import { test, expect, Page } from '@playwright/test';

const BASE = process.env.BASE_URL || process.env.BASE || 'https://testing.openelis-global.org';
const STAMP = `${Date.now()}`.slice(-6);
const NAME = `QA Org ${STAMP}`;

test.describe.configure({ mode: 'serial' });

async function addOrganization(page: Page, name: string, prefix: string): Promise<{ status: number; body: string }> {
  await page.goto(`${BASE}/MasterListsPage/organizationEdit?ID=0`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#org-name')).toBeVisible({ timeout: 20_000 });
  // Filling before the form's initial data arrives sends a bare body ({organization:{}}),
  // which the server rejects with a 500. Let the page settle first.
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  // The form records a field on change/blur, not on input: without the Tab the request went
  // out with no organizationName or shortName ("Validation errors exist").
  for (const [id, v] of [['#org-name', name], ['#org-prefix', prefix], ['#is-active', 'Y']] as const) {
    await page.locator(id).fill(v);
    await page.locator(id).press('Tab');
  }
  const post = page.waitForResponse(r => /\/rest\/Organization$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const r = await post;
  return { status: r.status(), body: `${await r.text()} REQUEST ${r.request().postData() ?? ''}` };
}

async function countByName(page: Page, name: string): Promise<number> {
  await page.goto(`${BASE}/MasterListsPage/organizationManagement`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByText(/Showing \d+ - \d+ of \d+/)).toBeVisible({ timeout: 20_000 });
  await page.waitForLoadState('networkidle');
  return (await page.locator('tbody tr').allInnerTexts()).filter(t => t.split(/\t|\n/).map(c => c.trim()).includes(name)).length;
}

test.describe('Organization Management (TC-ORGW)', () => {
  test('TC-ORGW-00: a new organization saves and is listed', async ({ page }) => {
    const r = await addOrganization(page, NAME, `QO${STAMP}`);
    expect(r.status, `save answers 200: ${r.body.slice(0, 900)}`).toBe(200);
    expect(await countByName(page, NAME), `${NAME} is listed once`).toBe(1);
  });

  test('TC-ORGW-02: a second organization with the same name is refused', async ({ page }) => {
    // FLIP-WHEN-FIXED (R60). Observed 2026-09-27: the duplicate saved (id 15) with
    // "Organization Information Updated Succesfully."
    test.fail();
    const r = await addOrganization(page, NAME, `QD${STAMP}`);
    const saved = r.status === 200 && /"success"\s*:\s*true/.test(r.body);
    expect(saved, 'the duplicate is not saved').toBe(false);
    expect(await countByName(page, NAME), `${NAME} is still listed once`).toBe(1);
  });
});
