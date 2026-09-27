/**
 * tests/modify-order-priority.spec.ts
 *
 * Modify Order must be able to change an order's priority.
 * Written 2026-09-27 against testing 3.2.3.0 (release-qa-3.2.3 R62;
 * uncovered-workflows-catalogue TC-MOP-00/01).
 *
 * Observed: selecting ROUTINE on a STAT order posts "priority":"Routine" (the label, not the
 * enum); the server answers 400 and the user sees "Oops, Server error please contact
 * administrator". An unchanged submit saves.
 */
import { test, expect, Page } from '@playwright/test';
import { apiGet } from '../helpers/silentSave';
import { seedOrder } from '../helpers/data-factory';

const BASE = process.env.BASE_URL || process.env.BASE || 'https://testing.openelis-global.org';
test.describe.configure({ mode: 'serial' });

let accession = '';

async function toOrderStep(page: Page) {
  await page.goto(`${BASE}/ModifyOrder?accessionNumber=${accession}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: /^Next$/ }).click();
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: /^Next$/ }).click();
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#priorityId')).toBeVisible({ timeout: 15_000 });
  // API-seeded orders carry no requester; the form (rightly) requires one.
  for (const [id, v] of [['#requesterFirstName', 'Qadoc'], ['#requesterLastName', 'Priority']] as const) {
    const f = page.locator(id);
    if (!(await f.inputValue())) { await f.fill(v); await f.press('Tab'); }
  }
}

async function submit(page: Page) {
  const post = page.waitForResponse(r => /\/rest\/SampleEdit$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST');
  await page.getByRole('button', { name: /^Submit$/ }).click();
  return (await post).status();
}

async function storedPriority(page: Page) {
  const r = await apiGet<{ sampleOrderItems?: { priority?: string } }>(page, `/rest/SampleEdit?accessionNumber=${accession}`);
  return r.json?.sampleOrderItems?.priority;
}

test.describe('Modify Order priority (R62)', () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    accession = (await seedOrder(page, 'MOP')).accession;
    await page.close();
  });

  test('TC-MOP-00: Modify Order saves an unchanged order', async ({ page }) => {
    await toOrderStep(page);
    expect(await submit(page), 'unchanged submit answers 200').toBe(200);
    expect(await storedPriority(page), 'priority unchanged').toBe('ROUTINE');
  });

  test('TC-MOP-02: Modify Order changes the priority to STAT', async ({ page }) => {
    // Works: "STAT" is both the option label and the enum value.
    await toOrderStep(page);
    await page.locator('#priorityId').selectOption('STAT');
    expect(await submit(page), 'priority change answers 200').toBe(200);
    expect(await storedPriority(page), 'STAT is stored').toBe('STAT');
  });

  test('TC-MOP-01: Modify Order changes the priority back to Routine', async ({ page }) => {
    // FLIP-WHEN-FIXED (R62). Observed 2026-09-27: posts "Routine" (label) instead of ROUTINE;
    // 400 and "Oops, Server error please contact administrator"; the order stays STAT.
    test.fail();
    await toOrderStep(page);
    await page.locator('#priorityId').selectOption('ROUTINE');
    expect(await submit(page), 'priority change answers 200').toBe(200);
    expect(await storedPriority(page), 'ROUTINE is stored').toBe('ROUTINE');
  });
});
