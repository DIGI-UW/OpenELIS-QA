/**
 * tests/results-stale-save.spec.ts
 *
 * Two screens open on the same result: the second Save must be refused as stale, not
 * overwrite the first. Written 2026-09-28 against testing 3.2.3.0 (observed working;
 * uncovered-workflows-catalogue TC-RCON-01/02). Seeds one order.
 */
import { test, expect, Page } from '@playwright/test';
import { seedOrder } from '../helpers/data-factory';

const BASE = process.env.BASE_URL || process.env.BASE || 'https://testing.openelis-global.org';

async function openResult(page: Page, accession: string) {
  await page.goto(`${BASE}/Results?accessionNumber=${accession}`, { waitUntil: 'domcontentloaded' });
  const input = page.locator('main input[id^="unifiedResultValue-"][id$="-primary"]').first();
  await expect(input).toBeVisible({ timeout: 20_000 });
  return input;
}

async function saveValue(page: Page, input: ReturnType<Page['locator']>, value: string) {
  await input.fill(value);
  await input.press('Tab');
  const res = page.waitForResponse(r => /\/results-entry\/analysis\/\d+\/result$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST');
  await page.locator('main').getByRole('button', { name: 'Save', exact: true }).last().click();
  return res;
}

test('TC-RCON-01: a second screen saving the same result is told it is stale', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: test.info().project.use.storageState as string });
  const a = await ctx.newPage();
  await a.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  const { accession } = await seedOrder(a, 'RCON');
  const b = await ctx.newPage();
  const inA = await openResult(a, accession);
  const inB = await openResult(b, accession);

  const first = await saveValue(a, inA, '1');
  expect(first.status(), 'first save').toBe(200);
  const second = await saveValue(b, inB, '2');
  expect(second.status(), 'second (stale) save is refused').toBe(409);
  await expect(b.getByText(/refresh to see the latest value/i)).toBeVisible({ timeout: 10_000 });

  await ctx.close();
});

async function openValidation(page: Page, accession: string) {
  await page.goto(`${BASE}/validation?type=order&accessionNumber=${accession}`, { waitUntil: 'domcontentloaded' });
  const row = page.getByRole('row').filter({ hasText: accession }).first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  const review = row.getByRole('button', { name: /Review/ });
  if (await review.count()) await review.first().click(); else await row.locator('button').first().click();
  const release = page.locator('main').getByRole('button', { name: 'Validate & release', exact: true });
  await expect(release).toBeVisible({ timeout: 10_000 });
  return release;
}

test('TC-RCON-02: a second validator releasing the same result is told it changed', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: test.info().project.use.storageState as string });
  const a = await ctx.newPage();
  await a.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  const { accession } = await seedOrder(a, 'RCON2');
  const input = await openResult(a, accession);
  expect((await saveValue(a, input, '1')).status(), 'result saved').toBe(200);
  const b = await ctx.newPage();
  const relA = await openValidation(a, accession);
  const relB = await openValidation(b, accession);
  const ra = a.waitForResponse(r => /\/AccessionValidation\/analysis\/\d+\/release$/.test(new URL(r.url()).pathname));
  await relA.click();
  expect((await ra).status(), 'first release').toBe(200);
  const rb = b.waitForResponse(r => /\/AccessionValidation\/analysis\/\d+\/release$/.test(new URL(r.url()).pathname));
  await relB.click();
  expect((await rb).status(), 'second release refused').toBe(409);
  await expect(b.getByText(/changed since the page loaded/i)).toBeVisible({ timeout: 10_000 });
  await ctx.close();
});
