/**
 * tests/patient-concurrent-edit.spec.ts
 *
 * Two screens editing the same patient in Patient Management. Written 2026-09-28 against
 * testing 3.2.3.0 (release-qa-3.2.3 R81c; uncovered-workflows-catalogue TC-RCON-04).
 * Creates one QA patient.
 */
import { test, expect, Page } from '@playwright/test';
import { createPatientViaAPI } from '../helpers/data-factory';

const BASE = process.env.BASE_URL || process.env.BASE || 'https://testing.openelis-global.org';

async function openForEdit(page: Page, id: string) {
  await page.goto(`${BASE}/PatientManagement/${id}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#lastName')).toHaveValue(/Concurrent/, { timeout: 20_000 });
  // The toggle sits under the sticky header, so a pointer click is intercepted; click it in-page.
  await page.locator('#patient-edit-toggle').evaluate((e) => (e as HTMLElement).click());
  const save = page.getByRole('button', { name: 'Save', exact: true }).locator('visible=true').first();
  await expect(save).toBeVisible({ timeout: 10_000 });
  return save;
}

test('TC-RCON-04: the second of two concurrent patient saves is refused with a message [FIXED R81c]', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: test.info().project.use.storageState as string });
  const a = await ctx.newPage();
  await a.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  const stamp = `${Date.now()}`;
  const created = await createPatientViaAPI(a, { nationalId: `QARCON${stamp}`, firstName: 'Twoscreens', lastName: 'Concurrent', gender: 'F', dateOfBirth: '01/01/1990' });
  expect(created.id, created.detail).toBeTruthy();
  const b = await ctx.newPage();
  const saveA = await openForEdit(a, created.id!);
  const saveB = await openForEdit(b, created.id!);

  // The phone must match the site format "xxxx-xxxx" (REWORKED 2026-10-08: "555-0101" is now
  // refused by the field and Save stays disabled, so the first save never happened).
  await a.locator('#primaryPhone').fill('5555-0101');
  await a.locator('#primaryPhone').press('Tab');
  const ra = a.waitForResponse(r => r.url().includes('/rest/PatientManagement') && r.request().method() === 'POST');
  await saveA.click();
  expect((await ra).status(), 'first save').toBe(200);

  await b.locator('#email').fill('qa.concurrent@example.org');
  await b.locator('#email').press('Tab');
  const rb = b.waitForResponse(r => r.url().includes('/rest/PatientManagement') && r.request().method() === 'POST');
  await saveB.click();
  const second = await rb;
  expect(second.status(), 'the stale save is not accepted').not.toBe(200);
  await b.waitForTimeout(1_500);
  const said = await b.locator('.cds--inline-notification, .cds--toast-notification, .cds--actionable-notification, [role=alert], .cds--modal.is-visible').allInnerTexts();
  // FIXED R81c, flipped 2026-10-08 (passes on local develop 2026-10-08, once the phone format above
  // let the first save through); was FLIP-WHEN-FIXED. Observed 2026-09-28: 500 with a raw Hibernate
  // message, nothing on screen.
  expect(second.status(), 'a conflict status, not a server error').toBe(409);
  expect(said.join(' ').trim().length, 'the user is told').toBeGreaterThan(0);
  await ctx.close();
});
