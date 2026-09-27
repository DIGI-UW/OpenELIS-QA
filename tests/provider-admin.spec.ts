/**
 * tests/provider-admin.spec.ts
 *
 * Provider Management (Admin > Provider Management): add a provider, and what happens with
 * a malformed email. Written 2026-09-27 against testing 3.2.3.0 (release-qa-3.2.3 R70;
 * uncovered-workflows-catalogue TC-PRVW-00..01). Creates providers named QAProv <stamp>.
 */
import { test, expect, Page } from '@playwright/test';

const BASE = process.env.BASE_URL || process.env.BASE || 'https://testing.openelis-global.org';

async function openAdd(page: Page) {
  await page.goto(`${BASE}/MasterListsPage/providerMenu`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  await page.locator('main').getByRole('button', { name: 'Add', exact: true }).click();
  const modal = page.locator('.cds--modal.is-visible');
  await expect(modal.locator('#lastName')).toBeVisible({ timeout: 10_000 });
  return modal;
}

async function fill(modal: ReturnType<Page['locator']>, last: string, email: string) {
  await modal.locator('#lastName').fill(last);
  await modal.locator('#lastName').press('Tab');
  await modal.locator('#firstName').fill('QAProv');
  await modal.locator('#firstName').press('Tab');
  await modal.locator('#email').fill(email);
  await modal.locator('#email').press('Tab');
}

test.describe('Provider Management', () => {
  test('TC-PRVW-00: a provider with a valid email is added', async ({ page }) => {
    const modal = await openAdd(page);
    const last = `Valid${Date.now()}`.replace(/\d/g, (d) => 'abcdefghij'[Number(d)]);
    await fill(modal, last, 'qa.provider@example.org');
    const res = page.waitForResponse(r => r.url().includes('/rest/Provider') && r.request().method() === 'POST');
    await modal.getByRole('button', { name: 'Add', exact: true }).click();
    expect((await res).status(), 'create provider').toBe(200);
  });

  test('TC-PRVW-01: a malformed email is flagged on the field, not answered with a server error', async ({ page }) => {
    // FLIP-WHEN-FIXED (R70). Observed 2026-09-27: POST answers 500, generic "Oops" toast,
    // the modal closes and the typed values are lost.
    const modal = await openAdd(page);
    await fill(modal, 'Bademail', 'not-an-email');
    const res = page.waitForResponse(r => r.url().includes('/rest/Provider') && r.request().method() === 'POST', { timeout: 8_000 }).catch(() => null);
    await modal.getByRole('button', { name: 'Add', exact: true }).click();
    const r = await res;
    test.fail();
    expect(r ? r.status() : 0, 'no server error (a client-side block sends nothing)').toBeLessThan(500);
    await expect(modal.locator('#email'), 'the modal stays open with the email marked').toHaveAttribute('data-invalid', 'true');
  });
});
