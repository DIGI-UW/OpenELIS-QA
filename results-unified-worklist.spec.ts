/**
 * OGC-1020 R1 — Unified /Results worklist (epic OGC-811). Codifies what QA validated live on testing
 * build index-u12wW6QI.js (2026-07-24) once the site flag RESULTS_ENTRY_UNIFIED_ROUTE was enabled via
 * Admin > Result Entry Configuration.
 *
 * FLAG-GATED: the unified route is behind RESULTS_ENTRY_UNIFIED_ROUTE (default off; legacy /result then
 * serves). This spec reads the flag from /configuration-properties and SKIPS when off, so it never
 * false-fails on a default (legacy) deployment.
 *
 * Verified behaviors (R1): unified route + menu switch, worklist shell (lab-number search, Lab Unit
 * selector, Test date, status chips, pagination, polymorphic columns), and the POLYMORPHIC RESULT CELL —
 * numeric→number input, dictionary→single-select, multi-select→Carbon multi-select. Edit-state machine
 * (saved row → read-only + Edit) and per-result Save round-trip were also confirmed by hand.
 * NOTE: multi-select (M) results do NOT yet flow through Validation→report (validation not upgraded).
 *
 * Runs under all-tc.config.ts (setup + storageState).
 *   BASE=https://testing.openelis-global.org \
 *   npx playwright test --config=all-tc.config.ts results-unified-worklist.spec.ts
 */
import { test, expect, Page } from '@playwright/test';

const BASE = process.env.BASE || 'https://testing.openelis-global.org';

async function configProp(page: Page, key: string): Promise<string | undefined> {
  return page.evaluate(async (k) => {
    const r = await fetch('/api/OpenELIS-Global/rest/configuration-properties', { headers: { Accept: 'application/json' }, credentials: 'include' });
    const j = await r.json(); return j[k];
  }, key);
}

test.describe('OGC-1020 R1 — unified /Results worklist [flag-gated]', () => {
  test('unified worklist renders shell + polymorphic result cells when the flag is on', async ({ page }) => {
    await page.goto(`${BASE}/MasterListsPage/TestCatalogList?page=1&pageSize=25`);
    await page.waitForFunction(() => !!localStorage.getItem('CSRF'), null, { timeout: 15000 });

    const flag = await configProp(page, 'RESULTS_ENTRY_UNIFIED_ROUTE');
    test.skip(flag !== 'true', 'RESULTS_ENTRY_UNIFIED_ROUTE is off — unified worklist not active (legacy /result serves). Enable via Admin > Result Entry Configuration to run.');

    // Route + shell
    await page.goto(`${BASE}/Results`);
    await expect(page.getByRole('heading', { name: /^Results$/ }).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByPlaceholder(/search by lab number/i)).toBeVisible();
    const labUnit = page.getByLabel(/lab unit/i).first();
    await expect(labUnit).toBeVisible();

    // Load a populated lab unit (Molecular Biology carries the seeded multi-component COVIDPCR).
    await labUnit.selectOption({ label: 'Molecular Biology' }).catch(async () => { await labUnit.selectOption({ label: 'Biochemistry' }); });
    await page.getByRole('button', { name: /load results/i }).click();
    await page.waitForTimeout(2500);

    // Polymorphic columns present
    for (const col of [/Sample \/ Patient/i, /^Test$/i, /^Result$/i, /^Status$/i]) {
      await expect(page.getByText(col).first()).toBeVisible();
    }

    // Polymorphic result CELL: when rows are present, numeric→number input and/or dictionary→select
    // render as the per-analysis result-type control (the core OGC-1020 R1 behavior).
    const rowCount = await page.locator('table tbody tr').count();
    if (rowCount > 0) {
      const numInputs = await page.locator('table input[type=number]').count();
      const selects = await page.locator('table select, table [class*="multi-select"], table [role="combobox"]').count();
      expect(numInputs + selects, 'polymorphic result controls render (numeric input / dictionary or multi-select)').toBeGreaterThan(0);
    } else {
      test.info().annotations.push({ type: 'note', description: 'no pending analyses in the chosen lab unit — shell asserted, cell render skipped' });
    }
  });
});
