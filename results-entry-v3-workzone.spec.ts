/**
 * OGC-1021/1022/1023 R2-R4 — Results Entry v3 expanded work-zone panel (epic OGC-811, PR #4007).
 * Codifies what QA validated live on testing.openelis-global.org build index-nhUvC0cn.js (2026-08-10)
 * against the acceptance criteria in OGC-1021 (work zone + reference zone + Method/Analyzer split +
 * dilution + dual-axis notes), OGC-1022 (this-analysis History + contrast/flags + critical handling),
 * and OGC-1023 (inline NCE + refer-out + aliquoting).
 *
 * FLAG-GATED: same as results-unified-worklist.spec.ts (RESULTS_ENTRY_UNIFIED_ROUTE) — this panel only
 * exists inside the unified /Results worklist. Skips cleanly when the flag is off.
 *
 * SOURCE OF TRUTH: OGC-1021/1022/1023 acceptance criteria (Jira) + PR #4007 body, cross-checked live.
 * SPEC-DIVERGENCE: none found this pass — "Report Non-Conformity" / reject-disposition controls
 * described in OGC-1023 (gated by `allowResultRejection`) were NOT visible in the panel with default
 * config on testing.openelis-global.org. This spec does not assert their presence (asserting an absent
 * gated control would be a false negative on this instance) — it only asserts "Refer this test" and
 * Aliquots, which ARE unconditionally visible per the PR body. Flagging the NCE/reject gate as an
 * UNVERIFIED acceptance criterion for whoever next has `allowResultRejection` enabled to confirm.
 *
 * Extends results-unified-worklist.spec.ts (R1 shell) rather than duplicating it — this file assumes
 * the shell/polymorphic-cell behavior is already covered there and only exercises the R2-R4 panel.
 *
 * Runs under all-tc.config.ts (setup + storageState).
 *   BASE=https://testing.openelis-global.org \
 *   npx playwright test --config=all-tc.config.ts results-entry-v3-workzone.spec.ts
 */
import { test, expect, Page } from '@playwright/test';

const BASE = process.env.BASE || 'https://testing.openelis-global.org';

async function configProp(page: Page, key: string): Promise<string | undefined> {
  return page.evaluate(async (k) => {
    const r = await fetch('/api/OpenELIS-Global/rest/configuration-properties', { headers: { Accept: 'application/json' }, credentials: 'include' });
    const j = await r.json(); return j[k];
  }, key);
}

test.describe('OGC-1021/1022/1023 R2-R4 — Results Entry v3 work-zone panel [flag-gated]', () => {
  test('expanded work zone: Method/Analyzer split, dilution, dual-axis notes, reference sections', async ({ page }) => {
    await page.goto(`${BASE}/MasterListsPage/TestCatalogList?page=1&pageSize=25`);
    await page.waitForFunction(() => !!localStorage.getItem('CSRF'), null, { timeout: 15000 });

    const flag = await configProp(page, 'RESULTS_ENTRY_UNIFIED_ROUTE');
    test.skip(flag !== 'true', 'RESULTS_ENTRY_UNIFIED_ROUTE is off — unified worklist not active. Enable via Admin > Result Entry Configuration to run.');

    await page.goto(`${BASE}/Results`);
    await expect(page.getByRole('heading', { name: /^Results$/ }).first()).toBeVisible({ timeout: 15000 });

    const labUnit = page.getByLabel(/lab unit/i).first();
    await labUnit.selectOption({ label: 'Hematology' }).catch(async () => { await labUnit.selectOption({ label: 'Biochemistry' }); });
    await page.getByRole('button', { name: /load results/i }).click();
    await page.waitForTimeout(2500);

    const rowCount = await page.locator('table tbody tr').count();
    test.skip(rowCount === 0, 'no pending analyses in the chosen lab unit on this instance — cannot exercise the work-zone panel');

    // Expand the first row's work zone (leftmost per-row expand control).
    await page.locator('table tbody tr').first().locator('button, [role="button"]').first().click();
    await page.waitForTimeout(500);

    // --- R2: OGC-1021 work zone ---
    await expect(page.getByText(/^Result$/i).first()).toBeVisible();
    await expect(page.getByText(/^Method$/i).first()).toBeVisible();
    await expect(page.getByText(/^Analyzer$/i).first()).toBeVisible();
    await expect(page.getByText(/measured value/i).first()).toBeVisible();
    await expect(page.getByText(/dilution factor/i).first()).toBeVisible();

    // Dual-axis notes: context (Entry/Modification) + visibility (In lab only / Send with result).
    await expect(page.getByText(/in lab only/i).first()).toBeVisible();
    await expect(page.getByText(/send with result/i).first()).toBeVisible();

    // Reference & context zone — collapsed-but-summarized sections, sticky layout control.
    await expect(page.getByText(/reference (&|and) context/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /reset layout/i })).toBeVisible();

    // --- R3: OGC-1022 this-analysis History (paginated, own events only) ---
    const historyToggle = page.getByText(/^history \(this analysis\)$/i).first();
    await expect(historyToggle).toBeVisible();
    await historyToggle.click();
    await page.waitForTimeout(300);
    await expect(page.getByText(/^when$/i).first()).toBeVisible();
    await expect(page.getByText(/^event$/i).first()).toBeVisible();
    await expect(page.getByText(/items per page/i).first()).toBeVisible();

    // --- R4: OGC-1023 Aliquots section (list + create) ---
    const aliquotsToggle = page.getByText(/^aliquots$/i).first();
    await expect(aliquotsToggle).toBeVisible();
    await aliquotsToggle.click();
    await page.waitForTimeout(300);
    await expect(page.getByText(/number of aliquots/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /create aliquots/i })).toBeVisible();

    // --- R4: OGC-1023 refer-out — reference lab / reason / date, no "test to perform" field ---
    const referButton = page.getByRole('button', { name: /refer this test/i }).or(page.getByText(/^refer this test$/i));
    await expect(referButton.first()).toBeVisible();
    await referButton.first().click();
    await page.waitForTimeout(400);
    await expect(page.getByText(/reference laboratory/i).first()).toBeVisible();
    await expect(page.getByText(/referral reason/i).first()).toBeVisible();
    await expect(page.getByText(/referral date/i).first()).toBeVisible();
    // Negative/edge assertion: the form must NOT expose a "test to perform" field (per OGC-1023 —
    // the referred test is the row's own test, deliberately no test-selection field).
    await expect(page.getByText(/test to perform/i)).toHaveCount(0);

    // Edge case: Discard must fully retract the pending referral with no dangling "pending" state —
    // reloading the row should show the plain work zone again, not a stuck referral banner.
    const discard = page.getByRole('button', { name: /discard/i }).or(page.getByText(/^discard$/i));
    await discard.first().click();
    await page.waitForTimeout(300);
    await expect(page.getByText(/referral pending/i)).toHaveCount(0);
    await expect(referButton.first()).toBeVisible();
  });
});
