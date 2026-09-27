/**
 * tests/results-stale-save.spec.ts
 *
 * Two screens open on the same result: the second Save must be refused as stale, not
 * overwrite the first. Written 2026-09-28 against testing 3.2.3.0 (observed working;
 * uncovered-workflows-catalogue TC-RCON-01). Seeds one order.
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
