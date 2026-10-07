/**
 * tests/alerts-correctness.spec.ts
 *
 * Alerts Dashboard: are the alerts it lists dated, filterable and actionable?
 * Written 2026-09-27 against testing 3.2.3.0 (release-qa-3.2.3 R19, R50;
 * uncovered-workflows-catalogue TC-TZ-04, TC-ALRT-04/05).
 *
 * Coverage before this file: alerts-notifications.spec.ts checks that the page, its
 * KPI cards, filters and API respond. None read a row, so alerts dated 1970, a type the
 * filter cannot select, and acknowledged alerts with no way forward all passed.
 *
 * Data: uses whatever alerts exist (testing has two Referral Rejected alerts). Each case
 * skips with a reason when the rows it needs are absent; seed by rejecting a referral.
 */
import { test, expect, Page } from '@playwright/test';

const BASE = process.env.BASE_URL || process.env.BASE || 'https://testing.openelis-global.org';

interface Row { type: string; status: string; created: string; actions: string }

async function rows(page: Page): Promise<Row[]> {
  await page.goto(`${BASE}/Alerts`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('columnheader', { name: /^Type$/ })).toBeVisible({ timeout: 20_000 });
  await page.waitForLoadState('networkidle');
  const headers = (await page.getByRole('columnheader').allInnerTexts()).map(h => h.trim());
  const col = (name: string) => headers.findIndex(h => h === name);
  const out: Row[] = [];
  for (const tr of await page.locator('tbody tr').all()) {
    const cells = (await tr.locator('td').allInnerTexts()).map(c => c.trim());
    out.push({ type: cells[col('Type')] ?? '', status: cells[col('Status')] ?? '', created: cells[col('Created')] ?? '', actions: cells[col('Actions')] ?? '' });
  }
  return out;
}

test.describe('Alerts Dashboard correctness', () => {
  test('TC-ALRT-00: CANARY the alerts table lists rows with a type and a status', async ({ page }) => {
    const r = await rows(page);
    test.skip(r.length === 0, 'no alerts on this instance; seed one by rejecting a referral');
    expect(r.every(x => x.type && x.status), 'every row has a type and a status').toBe(true);
  });

  test('TC-TZ-04: alerts are dated with their real creation time, not 1970 [FIXED R19]', async ({ page }) => {
    // FIXED R19, flipped 2026-10-08 (passes on local develop 2026-10-06 and 2026-10-08); was FLIP-WHEN-FIXED (R19). Observed 2026-09-27: "1/22/1970"; the API sends epoch seconds.
    const r = await rows(page);
    test.skip(r.length === 0, 'no alerts on this instance');
    const years = r.map(x => Number((x.created.match(/\b(19|20)\d{2}\b/) ?? ['0'])[0]));
    expect(years.every(y => y >= 2020), `Created years: ${years.join(', ')}`).toBe(true);
  });

  test('TC-ALRT-05: the Alert Type filter offers every type present in the table [FIXED R50]', async ({ page }) => {
    // FIXED R50, flipped 2026-10-08 (passes on local develop 2026-10-06 and 2026-10-08); was FLIP-WHEN-FIXED (R50). Observed 2026-09-27: "Referral Rejected" rows, no such filter option.
    const r = await rows(page);
    test.skip(r.length === 0, 'no alerts on this instance');
    await page.getByRole('combobox', { name: /Alert Type/i }).click();
    const options = (await page.getByRole('option').allInnerTexts()).map(o => o.trim());
    const missing = [...new Set(r.map(x => x.type))].filter(t => !options.includes(t));
    expect(missing, `types with no filter option (options: ${options.join(' | ')})`).toEqual([]);
  });

  test('TC-ALRT-04: an acknowledged alert still offers an action to resolve it [FIXED R50]', async ({ page }) => {
    // FIXED R50, flipped 2026-10-08 (passes on local develop 2026-10-06 and 2026-10-08); was FLIP-WHEN-FIXED (R50). Observed 2026-09-27: Acknowledged rows have an empty Actions cell.
    const acked = (await rows(page)).filter(x => /^Acknowledged$/i.test(x.status));
    test.skip(acked.length === 0, 'no Acknowledged alert on this instance');
    expect(acked.every(x => /resolve/i.test(x.actions)), 'each Acknowledged row offers Resolve').toBe(true);
  });
});
