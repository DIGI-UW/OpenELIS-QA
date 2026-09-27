/**
 * tests/modify-order-lost-update.spec.ts
 *
 * Two screens open on Modify Order for the same order. The first raises priority to STAT;
 * the second, still showing ROUTINE, changes only the requester and submits. Does the
 * second submit silently put the priority back? Written 2026-09-28 against testing
 * 3.2.3.0 (release-qa-3.2.3 R81; uncovered-workflows-catalogue TC-RCON-03). Seeds one order.
 */
import { test, expect, Page } from '@playwright/test';
import { seedOrder } from '../helpers/data-factory';

const BASE = process.env.BASE_URL || process.env.BASE || 'https://testing.openelis-global.org';

async function toOrderStep(page: Page, accession: string) {
  await page.goto(`${BASE}/ModifyOrder?accessionNumber=${accession}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: /^Next$/ }).click();
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: /^Next$/ }).click();
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#priorityId')).toBeVisible({ timeout: 15_000 });
  for (const [id, v] of [['#requesterFirstName', 'Qadoc'], ['#requesterLastName', 'Lostupdate']] as const) {
    const f = page.locator(id);
    if (!(await f.inputValue())) { await f.fill(v); await f.press('Tab'); }
  }
}

async function submit(page: Page) {
  const post = page.waitForResponse(r => /\/rest\/SampleEdit$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST');
  await page.getByRole('button', { name: /^Submit$/ }).click();
  return (await post).status();
}

test('TC-RCON-03: a stale Modify Order submit does not undo another user\'s priority change', async ({ browser }) => {
  test.setTimeout(180_000);
  const ctx = await browser.newContext({ storageState: test.info().project.use.storageState as string });
  const a = await ctx.newPage();
  await a.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  const { accession } = await seedOrder(a, 'LOST');
  const b = await ctx.newPage();
  await toOrderStep(a, accession);
  await toOrderStep(b, accession);

  await a.locator('#priorityId').selectOption('STAT');
  expect(await submit(a), 'first submit (to STAT)').toBe(200);

  await b.locator('#requesterLastName').fill('Laterchange');
  await b.locator('#requesterLastName').press('Tab');
  const second = await submit(b);

  const stored = await a.evaluate(async (acc) => {
    const j = await (await fetch(`/api/OpenELIS-Global/rest/SampleEdit?accessionNumber=${acc}`)).json();
    return j?.sampleOrderItems?.priority;
  }, accession);
  test.info().annotations.push({ type: 'observed', description: `second submit ${second}, stored priority ${stored}` });
  // FLIP-WHEN-FIXED (R81). Observed 2026-09-28: second submit 200, priority back to ROUTINE.
  test.fail();
  expect(second === 409 || stored === 'STAT', `second submit ${second}; stored priority ${stored}`).toBe(true);
  await ctx.close();
});
