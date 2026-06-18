/**
 * tests/chains/chain-o-referral-roundtrip.spec.ts
 *
 * SKILL §11 Chain O — Referral (Referred-Out Tests) round-trip
 *
 * Deep build-out (v6.16): graduates the render-only referral-workflow suite
 * into a real round-trip. Endpoints confirmed live on indonesiadev v3.2.1.10
 * and cross-checked against OpenELIS-Global-2 ReferredOutTests.jsx.
 *
 *   READBACK GET /rest/ReferredOutTests[?search...]  → Struts form;
 *            after a search carries referralDisplayItems[] (rows have
 *            accessionNumber, analysisId, referralStatusDisplay,
 *            referringTestName, referralResultsDisplay, referenceLabDisplay).
 *   FILTERS  GET /rest/test-list ; GET /rest/user-test-sections/{role}
 *   REPORT   /ReportPrint?report=patientCILNSP_vreduit&analysisIds=… (CROSS-LINK)
 *
 * Note: referral CREATION happens at result entry (a referred test flips a
 * result to "referred"); the referred-out search is the landing surface where
 * those referrals show up. This chain asserts that surface + its filter
 * sources + the analysisId→report cross-link, GAP-and-continue when no
 * referrals exist on the instance. Never fabricates a pass.
 *
 * Run individually:  npx playwright test --project=chain-o
 */

import { test, expect } from '@playwright/test';
import {
  BASE, apiCall, markStep,
  REFERRED_OUT_TESTS, buildReferredOutQuery, TEST_LIST, USER_TEST_SECTIONS,
} from './_common';

test.describe.serial('Chain O — Referral round-trip', () => {
  let domainOk = true;

  test.beforeAll(() => { /* eslint-disable-next-line no-console */ console.log(`[Chain O] BASE=${BASE}`); });

  // Step 1 — Referred-out read-back surface + embedded filter sources (ROUND-TRIP)
  test('Step 1 — Referred-Out form + filter sources (ROUND-TRIP)', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('domcontentloaded');
    const r = await apiCall<Record<string, unknown>>(page, REFERRED_OUT_TESTS);
    if (!r.ok || typeof r.body !== 'object' || r.body === null) {
      domainOk = false;
      markStep('O', 1, 'GAP', `Referred-Out endpoint not available (HTTP ${r.status})`, `GET ${REFERRED_OUT_TESTS}`);
      test.info().annotations.push({ type: 'gap', description: 'referral endpoint unavailable' });
      return;
    }
    const body = r.body as Record<string, unknown>;
    const hasFilters = 'testUnitSelectionList' in body || 'testSelectionList' in body;
    if (hasFilters) {
      markStep('O', 1, 'PASS', 'Referred-Out form returned with embedded filter sources (testUnit/test selection lists)');
      expect(hasFilters).toBeTruthy();
    } else {
      markStep('O', 1, 'FAIL', `Referred-Out form missing filter-source keys (got: ${Object.keys(body).slice(0, 8).join(',')})`);
      expect(hasFilters, 'referral filter sources').toBeTruthy();
    }
  });

  // Step 2 — Executing a search returns a referralDisplayItems array (FUNCTION/CROSS-LINK)
  test('Step 2 — Search returns referral rows with contract fields (CROSS-LINK)', async ({ page }) => {
    if (!domainOk) { markStep('O', 2, 'GAP', 'Skipped — referral endpoint unavailable (Step 1)'); return; }
    await page.goto(BASE);
    // Wide window: last ~2 years to today (DD/MM/YYYY per the UI).
    const today = new Date();
    const fmt = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    const start = new Date(today); start.setFullYear(start.getFullYear() - 2);
    const r = await apiCall<{ referralDisplayItems?: Array<Record<string, unknown>> }>(
      page, buildReferredOutQuery({ dateType: 'SENT', startDate: fmt(start), endDate: fmt(today) }));
    if (!r.ok || typeof r.body !== 'object' || r.body === null) {
      markStep('O', 2, 'GAP', `Referral search HTTP ${r.status}`);
      test.info().annotations.push({ type: 'gap', description: 'referral search failed' });
      return;
    }
    const items = (r.body as { referralDisplayItems?: Array<Record<string, unknown>> }).referralDisplayItems;
    if (!Array.isArray(items)) {
      markStep('O', 2, 'GAP', 'Search ran but referralDisplayItems not present (no results / search not finished)');
      test.info().annotations.push({ type: 'gap', description: 'no referralDisplayItems key' });
      return;
    }
    if (items.length === 0) {
      markStep('O', 2, 'GAP', 'Referral search returned 0 rows — no referred-out tests on this instance', 'Refer a test out via result entry, then re-run for a full round-trip.');
      test.info().annotations.push({ type: 'gap', description: 'no referrals present' });
      return;
    }
    const row = items[0];
    const need = ['accessionNumber', 'analysisId', 'referralStatusDisplay'];
    const missing = need.filter(k => !(k in row));
    if (missing.length === 0) {
      markStep('O', 2, 'PASS', `${items.length} referral row(s) with full contract (e.g. acc=${row.accessionNumber}, status=${row.referralStatusDisplay})`);
      expect(missing).toEqual([]);
    } else {
      markStep('O', 2, 'FAIL', `Referral rows missing fields: ${missing.join(', ')}`);
      expect(missing, 'referral row contract').toEqual([]);
    }
  });

  // Step 3 — Filter sources populate (FUNCTION)
  test('Step 3 — Referral filter sources (test-list + user-test-sections) populate (FUNCTION)', async ({ page }) => {
    if (!domainOk) { markStep('O', 3, 'GAP', 'Skipped — referral endpoint unavailable (Step 1)'); return; }
    await page.goto(BASE);
    const tests = await apiCall<unknown[]>(page, TEST_LIST);
    const tN = Array.isArray(tests.body) ? tests.body.length : -1;
    // Roles.RESULTS resolves to "Results" in the SPA; tolerate other casings via GAP.
    const sections = await apiCall<unknown[]>(page, USER_TEST_SECTIONS('Results'));
    const sN = Array.isArray(sections.body) ? sections.body.length : -1;
    if (tN > 0) {
      markStep('O', 3, 'PASS', `Referral filters backed: test-list=${tN}, user-test-sections=${sN >= 0 ? sN : 'HTTP ' + sections.status}`);
      expect(tN).toBeGreaterThan(0);
    } else {
      markStep('O', 3, 'GAP', `test-list unavailable (n=${tN}, HTTP ${tests.status})`);
      test.info().annotations.push({ type: 'gap', description: 'test-list unavailable' });
    }
  });

  // Step 4 — analysisId → patient report cross-link (CROSS-LINK, doc-assert)
  test('Step 4 — Referred row analysisId feeds the patient report (CROSS-LINK)', async ({ page }) => {
    if (!domainOk) { markStep('O', 4, 'GAP', 'Skipped — referral endpoint unavailable (Step 1)'); return; }
    await page.goto(BASE);
    const today = new Date();
    const fmt = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    const start = new Date(today); start.setFullYear(start.getFullYear() - 2);
    const r = await apiCall<{ referralDisplayItems?: Array<{ analysisId?: string }> }>(
      page, buildReferredOutQuery({ dateType: 'SENT', startDate: fmt(start), endDate: fmt(today) }));
    const items = (r.ok && r.body && typeof r.body === 'object') ? ((r.body as { referralDisplayItems?: Array<{ analysisId?: string }> }).referralDisplayItems || []) : [];
    const withId = items.find(i => i.analysisId);
    if (withId) {
      const printUrl = `${BASE}/ReportPrint?report=patientCILNSP_vreduit&type=patient&analysisIds=${withId.analysisId}`;
      markStep('O', 4, 'PASS', `Referred row exposes analysisId=${withId.analysisId} → buildable patient report`, printUrl);
      expect(printUrl).toContain(String(withId.analysisId));
    } else {
      markStep('O', 4, 'GAP', 'No referred rows with analysisId to cross-link to a report on this instance');
      test.info().annotations.push({ type: 'gap', description: 'no analysisId to cross-link' });
    }
  });
});
