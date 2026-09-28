/**
 * tests/referral-return-fhir.spec.ts
 *
 * Results coming BACK from a reference lab over FHIR: a normal result, a test the reference
 * lab did not perform, and a reflex test the reference lab added. Written 2026-09-28 against
 * testing 3.2.3.0 with the simulated external lab (scripts/fhir-sim bundles 10-return-*;
 * release-qa-3.2.3 R93 to R95; uncovered-workflows-catalogue TC-RRET).
 *
 * Fixtures: referrals seeded with createDispatchedReferral tags QA_AUTO RET-NORMAL / RET-NP /
 * RET-REFLEX / RET-ACK, then the matching bundle pushed to the simulator; the 2-minute poller
 * moves them to Returned (or At reference lab for RET-ACK). Each test finds its referral by the
 * requestor tag and skips when it is absent, so the spec is safe on other instances.
 */
import { test, expect, Page } from '@playwright/test';

const BASE = process.env.BASE_URL || process.env.BASE || 'https://testing.openelis-global.org';
const REST = '/api/OpenELIS-Global/rest/reference-lab-results';

type Card = { testName: string; value?: string; units?: string; note?: string; interpretation?: string };
type Row = { id: string; labNumber: string; requestor?: string; status: string; results?: Card[]; outcome?: string };

async function view(page: Page, v: 'outstanding' | 'returned' | 'history'): Promise<Row[]> {
  return page.evaluate(async (u) => { const r = await fetch(u); return r.ok ? r.json() : []; }, `${REST}/referrals?view=${v}`);
}

async function find(page: Page, tag: string): Promise<{ row: Row; where: string } | null> {
  for (const v of ['returned', 'history', 'outstanding'] as const) {
    const row = (await view(page, v)).find(r => (r.requestor ?? '').endsWith(tag));
    if (row) return { row, where: v };
  }
  return null;
}

async function resultsRow(page: Page, accession: string) {
  await page.goto(`${BASE}/result?accessionNumber=${accession}`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  const row = page.getByRole('row').filter({ hasText: accession }).first();
  await expect(row).toBeVisible({ timeout: 60_000 });
  return row.innerText();
}

test.describe('Referral results returned over FHIR', () => {
  test.beforeEach(async ({ page }) => {
    // Result pages are full loads of a large bundle; allow for slow links.
    test.setTimeout(300_000);
    await page.goto(`${BASE}/SampleShipment/reference-lab-results`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Returned — needs action/).first()).toBeVisible({ timeout: 60_000 });
  });

  test('TC-RRET-00: the reference lab acknowledging a Task moves the referral to At reference lab', async ({ page }) => {
    const hit = await find(page, 'RET-ACK');
    test.skip(!hit, 'RET-ACK fixture not on this instance');
    expect(hit!.where).toBe('outstanding');
    expect(hit!.row.status, 'status mirrors the remote Task accepted').toBe('received');
  });

  test('TC-RRET-01: a returned result is listed with value and unit, and Accept posts it', async ({ page }) => {
    const hit = await find(page, 'RET-NORMAL');
    test.skip(!hit, 'RET-NORMAL fixture not on this instance');
    if (hit!.where === 'returned') {
      expect(hit!.row.results?.[0]?.value, 'the card shows the value').toBe('5.4');
      const put = page.waitForResponse(r => r.url().endsWith(`/referrals/${hit!.row.id}/accept`));
      await page.getByText(/Returned — needs action/).first().click();
      await page.getByRole('row').filter({ hasText: hit!.row.labNumber }).getByRole('button', { name: 'Accept' }).click();
      expect((await put).status(), 'Accept succeeds').toBe(204);
    }
    const again = await find(page, 'RET-NORMAL');
    expect(again!.where, 'accepted rows move to History').toBe('history');
    expect(await resultsRow(page, hit!.row.labNumber)).toContain('5.4');
  });

  test('TC-RRET-02: the posted value keeps the reference lab unit or is converted', async ({ page }) => {
    // FLIP-WHEN-FIXED (R95). Observed 2026-09-28: 5.4 mmol/L stored as 5.4 on a mg/dl test.
    const hit = await find(page, 'RET-NORMAL');
    test.skip(!hit || hit.where !== 'history', 'RET-NORMAL not accepted yet (run TC-RRET-01)');
    const text = await resultsRow(page, hit!.row.labNumber);
    test.fail();
    expect(text, 'the result row does not show a mmol/L value against a mg/dl range').not.toMatch(/mg\/dl[\s\S]*\b5\.4\b/);
  });

  test('TC-RRET-03: a test the reference lab did not perform is recorded as not performed, with its reason', async ({ page }) => {
    // FLIP-WHEN-FIXED (R93). Observed 2026-09-28: Results final with a blank value; the reason was dropped.
    const hit = await find(page, 'RET-NP');
    test.skip(!hit, 'RET-NP fixture not on this instance');
    if (hit!.where === 'returned') {
      expect(hit!.row.results?.[0]?.note ?? '', 'the dashboard carries the reference lab reason').toContain('not performed');
    }
    test.skip(hit!.where !== 'history', 'RET-NP not accepted yet; accept it from Reference Lab Results');
    const text = await resultsRow(page, hit!.row.labNumber);
    test.fail();
    expect(text, 'not shown as a final result without a value').not.toContain('Results final');
  });

  test('TC-RRET-04: a reflex test added by the reference lab can be accepted', async ({ page }) => {
    // FLIP-WHEN-FIXED (R94). Observed 2026-09-28: Accept 500 (duplicate note); nothing posted.
    const hit = await find(page, 'RET-REFLEX');
    test.skip(!hit || hit.where !== 'returned', 'RET-REFLEX not waiting in Returned');
    expect((hit!.row.results ?? []).map(c => c.testName), 'both results are listed').toEqual(['Glucose', 'Alanine aminotransferase']);
    const put = page.waitForResponse(r => r.url().endsWith(`/referrals/${hit!.row.id}/accept`));
    await page.getByText(/Returned — needs action/).first().click();
    await page.getByRole('row').filter({ hasText: hit!.row.labNumber }).getByRole('button', { name: 'Accept' }).click();
    const status = (await put).status();
    test.fail();
    expect(status, 'Accept succeeds').toBe(204);
  });
});
