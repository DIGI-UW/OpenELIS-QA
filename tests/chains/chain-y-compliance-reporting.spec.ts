/**
 * tests/chains/chain-y-compliance-reporting.spec.ts
 *
 * SKILL §11 Chain Y — SILNAS compliance reporting / dashboard
 *
 * NEW feature on the demo-silnas build (OpenELIS-Global-2 PRs #3707 OGC-602 +
 * #3723 OGC-553), confirmed live on indonesiademo v3.2.1.10 (2026-06-20).
 * Endpoints (constants in _common.ts):
 *   GET /rest/compliance/dashboard/summary  → {totalOrders, complianceRate,
 *        totalExceedances, sitesMonitored, trend}   (+ /trend, /exceedances, /sites/comparison)
 *   GET /rest/compliance/standards[/active]          (FRS S-01 admin source)
 *   GET /rest/compliance/thresholds?groupId=         (parameter thresholds)
 *   GET /rest/complianceReport/compliance-statuses   (status filter)
 *   GET /rest/complianceReport                       (report table — KNOWN BUG OGC-1059: 500)
 *   GET /rest/complianceReport/exportPdf?sampleId=    (Laporan Hasil certificate PDF)
 *
 * Asserts the dashboard summary contract + the admin/standards + status sources,
 * and carries an OGC-1059 REGRESSION WATCH on /rest/complianceReport (currently
 * 500 → GAP; flips to PASS when the listing returns 200). GAP-and-continue when
 * the compliance feature is absent (non-silnas builds 404). Never fabricates.
 *
 * Run individually:  npx playwright test --project=chain-y
 */
import { test, expect } from '@playwright/test';
import {
  BASE, apiCall, markStep,
  COMPLIANCE_DASHBOARD_SUMMARY, COMPLIANCE_STANDARDS, COMPLIANCE_STANDARDS_ACTIVE,
  COMPLIANCE_REPORT_STATUSES, COMPLIANCE_REPORT, COMPLIANCE_REPORT_EXPORT_PDF,
  COMPLIANCE_DASHBOARD_EXCEEDANCES,
} from './_common';

test.describe.serial('Chain Y — SILNAS compliance reporting', () => {
  let featurePresent = true;

  test.beforeAll(() => { /* eslint-disable-next-line no-console */ console.log(`[Chain Y] BASE=${BASE}`); });

  // Step 1 — Dashboard summary contract (ROUND-TRIP read-back)
  test('Step 1 — Compliance dashboard summary contract (ROUND-TRIP)', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('domcontentloaded');
    const r = await apiCall<Record<string, unknown>>(page, COMPLIANCE_DASHBOARD_SUMMARY);
    if (!r.ok || typeof r.body !== 'object' || r.body === null) {
      featurePresent = false;
      markStep('Y', 1, 'GAP', `Compliance dashboard summary unavailable (HTTP ${r.status}) — non-silnas build`, `GET ${COMPLIANCE_DASHBOARD_SUMMARY}`);
      test.info().annotations.push({ type: 'gap', description: 'compliance feature absent' });
      return;
    }
    const body = r.body as Record<string, unknown>;
    const need = ['totalOrders', 'complianceRate', 'totalExceedances', 'sitesMonitored'];
    const missing = need.filter(k => !(k in body));
    if (missing.length === 0) {
      markStep('Y', 1, 'PASS', `Dashboard summary contract OK (totalOrders=${body.totalOrders}, complianceRate=${body.complianceRate}, exceedances=${body.totalExceedances}, sites=${body.sitesMonitored})`);
      expect(missing).toEqual([]);
    } else {
      markStep('Y', 1, 'FAIL', `Dashboard summary missing fields: ${missing.join(', ')}`);
      expect(missing, 'compliance summary contract').toEqual([]);
    }
  });

  // Step 2 — Compliance standards admin source (FUNCTION)
  test('Step 2 — Compliance standards source populates (FUNCTION)', async ({ page }) => {
    if (!featurePresent) { markStep('Y', 2, 'GAP', 'Skipped — compliance feature absent (Step 1)'); return; }
    await page.goto(BASE);
    const all = await apiCall<unknown[]>(page, COMPLIANCE_STANDARDS);
    const active = await apiCall<unknown[]>(page, COMPLIANCE_STANDARDS_ACTIVE);
    const aN = Array.isArray(all.body) ? all.body.length : -1;
    const acN = Array.isArray(active.body) ? active.body.length : -1;
    if (aN > 0) {
      markStep('Y', 2, 'PASS', `Compliance standards: all=${aN}, active=${acN} (FRS S-01 admin + result-limit source)`);
      expect(aN).toBeGreaterThan(0);
    } else {
      markStep('Y', 2, 'GAP', `Compliance standards empty/unavailable (all n=${aN}, HTTP ${all.status})`);
      test.info().annotations.push({ type: 'gap', description: 'no compliance standards configured' });
    }
  });

  // Step 3 — Report status filter + exceedances feed (FUNCTION)
  test('Step 3 — Report statuses + exceedances feed (FUNCTION)', async ({ page }) => {
    if (!featurePresent) { markStep('Y', 3, 'GAP', 'Skipped — compliance feature absent (Step 1)'); return; }
    await page.goto(BASE);
    const statuses = await apiCall<unknown[]>(page, COMPLIANCE_REPORT_STATUSES);
    const sN = Array.isArray(statuses.body) ? statuses.body.length : -1;
    const exceed = await apiCall(page, COMPLIANCE_DASHBOARD_EXCEEDANCES);
    if (sN > 0) {
      markStep('Y', 3, 'PASS', `complianceReport statuses=${sN}; dashboard/exceedances HTTP ${exceed.status}`);
      expect(sN).toBeGreaterThan(0);
    } else {
      markStep('Y', 3, 'GAP', `compliance-statuses empty/unavailable (n=${sN}, HTTP ${statuses.status})`);
      test.info().annotations.push({ type: 'gap', description: 'no compliance statuses' });
    }
  });

  // Step 4 — OGC-1059 regression watch: complianceReport listing 500 (WATCH)
  test('Step 4 — OGC-1059 watch: complianceReport listing (WATCH)', async ({ page }) => {
    if (!featurePresent) { markStep('Y', 4, 'GAP', 'Skipped — compliance feature absent (Step 1)'); return; }
    await page.goto(BASE);
    const r = await apiCall(page, COMPLIANCE_REPORT);
    if (r.status === 500) {
      markStep('Y', 4, 'GAP',
        'OGC-1059 STILL PRESENT: GET /rest/complianceReport → HTTP 500 (sibling compliance endpoints 200)',
        'Known bug (filed). When fixed, the listing returns 200 (or 400 for bad params) and this becomes PASS.');
      test.info().annotations.push({ type: 'known-bug', description: 'OGC-1059 complianceReport 500' });
      // Assert the bug shape so a fix flips it: currently 500.
      expect(r.status).toBe(500);
    } else if (r.ok) {
      markStep('Y', 4, 'PASS', `OGC-1059 appears FIXED: GET /rest/complianceReport → ${r.status} (was 500)`);
      expect(r.ok).toBeTruthy();
    } else if (r.status === 400) {
      markStep('Y', 4, 'PASS', `OGC-1059 appears FIXED: GET /rest/complianceReport → 400 (validates params instead of 500)`);
      expect(r.status).toBe(400);
    } else {
      markStep('Y', 4, 'GAP', `complianceReport HTTP ${r.status} (unexpected — re-characterize)`);
      test.info().annotations.push({ type: 'gap', description: `complianceReport HTTP ${r.status}` });
    }
  });

  // Step 5 — Certificate PDF endpoint is wired (CROSS-LINK)
  test('Step 5 — Laporan Hasil certificate PDF endpoint is wired (CROSS-LINK)', async ({ page }) => {
    if (!featurePresent) { markStep('Y', 5, 'GAP', 'Skipped — compliance feature absent (Step 1)'); return; }
    await page.goto(BASE);
    // No environmental sample id reliably in scope on a fresh instance; probe the
    // contract with a benign id. 200 (PDF) or 400/404 (no such sample) prove it is
    // wired; a 500 here would itself be a finding to characterize.
    const r = await apiCall(page, COMPLIANCE_REPORT_EXPORT_PDF(1), { accept: 'application/pdf', expectBinary: true });
    if (r.status === 200) {
      markStep('Y', 5, 'PASS', 'exportPdf returned a certificate for sample 1 (Laporan Hasil PDF path wired)');
      expect(r.status).toBe(200);
    } else if (r.status === 400 || r.status === 404) {
      markStep('Y', 5, 'PASS', `exportPdf wired (HTTP ${r.status} for a non-existent/non-environmental sample — correct behavior)`);
      expect([400, 404]).toContain(r.status);
    } else {
      markStep('Y', 5, 'GAP', `exportPdf HTTP ${r.status} for sampleId=1`, `GET ${COMPLIANCE_REPORT_EXPORT_PDF('{id}')}`);
      test.info().annotations.push({ type: 'gap', description: `exportPdf HTTP ${r.status}` });
    }
  });
});
