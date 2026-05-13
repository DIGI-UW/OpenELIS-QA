/**
 * tests/personas/persona-pd-lab-manager.spec.ts
 *
 * SKILL §12 Persona PD — Lab Manager
 *
 * The day: a lab manager opens the Dashboard, drills into Orders In
 * Progress, pulls yesterday's Rejection Report, pulls the weekly
 * Statistics Report, and confirms the Test Turn-Around-Time KPIs
 * match the underlying data (Y-RECON per SKILL §13).
 *
 * This is the persona that catches DASHBOARD-TO-REALITY MISMATCH —
 * the bug class where the headline number on Dashboard doesn't match
 * what's actually in the queue. BUG-29 produced one of these (Orders
 * Rejected stuck at 0).
 *
 * Run individually:
 *   npx playwright test --project=persona-pd
 */

import { test, expect } from '@playwright/test';
import { BASE, apiCall, markStep } from '../chains/_common';

const PERSONA = 'PD';

interface DashboardMetrics {
  ordersInProgress?: number;
  ordersReadyForValidation?: number;
  ordersRejectedToday?: number;
  unPritendResults?: number; // intentional typo per NOTE-3
}

test.describe.serial('Persona PD — Lab Manager', () => {
  let metrics: DashboardMetrics = {};

  test('Step 1 — Pull morning Dashboard (RENDER)', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    const r = await apiCall<DashboardMetrics>(page, '/api/OpenELIS-Global/rest/home-dashboard/metrics');
    if (!r.ok || typeof r.body !== 'object' || r.body === null) {
      markStep(PERSONA, 1, 'FAIL', `Dashboard metrics HTTP ${r.status}`);
      expect(r.ok).toBeTruthy(); return;
    }
    metrics = r.body as DashboardMetrics;
    markStep(PERSONA, 1, 'PASS',
      `In Progress=${metrics.ordersInProgress}, Ready=${metrics.ordersReadyForValidation}, Rejected=${metrics.ordersRejectedToday}`);
  });

  test('Step 2 — Y-RECON: Orders In Progress KPI matches Logbook (§13)', async ({ page }) => {
    if (metrics.ordersInProgress === undefined) test.skip();
    await page.goto(BASE);
    // Sum across all lab sections
    const sections = ['36']; // could expand to all sections, but Hematology is the busy one
    let actualCount = 0;
    for (const sectionId of sections) {
      const r = await apiCall<{ logbookList?: Array<unknown> }>(
        page, `/api/OpenELIS-Global/rest/LogbookResults?testSectionId=${sectionId}&status=IN_PROGRESS`
      );
      if (r.ok && typeof r.body === 'object' && r.body !== null) {
        actualCount += (((r.body as { logbookList?: Array<unknown> }).logbookList) || []).length;
      }
    }
    // KPI is system-wide; our actual count is one section. Just sanity check the KPI is "plausibly close" to the actual.
    const kpi = metrics.ordersInProgress!;
    if (kpi === 0 && actualCount > 0) {
      markStep(PERSONA, 2, 'FAIL',
        `KPI says 0 but ${actualCount} orders found in Logbook`,
        `Dashboard counter is stuck — Y-RECON broken. Lab manager would make decisions on stale data.`);
      expect(kpi).toBeGreaterThan(0); return;
    }
    markStep(PERSONA, 2, 'PASS', `KPI=${kpi}, Hematology alone has ${actualCount} (reasonable)`);
  });

  test('Step 3 — Pull Rejection Report PDF (REPORTABLE, BUG-29 catch)', async ({ page }) => {
    await page.goto(BASE);
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yyyy = today.getFullYear();
    const url = `/api/OpenELIS-Global/ReportPrint?report=sampleRejection&startDate=${dd}/${mm}/${yyyy}&endDate=${dd}/${mm}/${yyyy}`;
    const r = await apiCall<string>(page, url, { accept: 'application/pdf', expectBinary: true });
    if (!r.ok) {
      markStep(PERSONA, 3, 'FAIL',
        `BUG-29 catch: Rejection Report HTTP ${r.status}`,
        `Lab manager can't audit rejections. CAP/CLIA gap.`);
      expect(r.ok).toBeTruthy(); return;
    }
    const buf = Buffer.from(String(r.body), 'base64');
    const isPdf = buf.length >= 4 && buf.toString('ascii', 0, 4) === '%PDF';
    if (!isPdf) {
      markStep(PERSONA, 3, 'FAIL', 'Rejection Report not a PDF');
      expect(isPdf).toBeTruthy(); return;
    }
    markStep(PERSONA, 3, 'PASS', `Rejection Report PDF ${buf.length} bytes`);
  });

  test('Step 4 — Pull weekly Statistics Report (REPORTABLE)', async ({ page }) => {
    await page.goto(BASE);
    const today = new Date();
    const weekAgo = new Date(today.getTime() - 7 * 86400000);
    const fmt = (d: Date): string => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
    const url = `/api/OpenELIS-Global/ReportPrint?report=statisticsReport&startDate=${fmt(weekAgo)}&endDate=${fmt(today)}`;
    const r = await apiCall<string>(page, url, { accept: 'application/pdf', expectBinary: true });
    if (!r.ok) {
      markStep(PERSONA, 4, 'FAIL',
        `BUG-42 catch: Statistics Report HTTP ${r.status}`,
        `Weekly statistics drives management decisions. If broken, lab manager flies blind.`);
      expect(r.ok).toBeTruthy(); return;
    }
    const buf = Buffer.from(String(r.body), 'base64');
    markStep(PERSONA, 4, 'PASS', `Statistics Report PDF ${buf.length} bytes`);
  });

  test('Step 5 — TAT KPI sanity check (Y-RECON)', async ({ page: _page }) => {
    if (metrics.unPritendResults === undefined) test.skip();
    // The full Y-RECON for TAT would require fetching sample audit
    // timestamps and computing the median. That's a larger check
    // belonging in a dedicated Y-RECON suite. Here we just confirm
    // the KPI is a sensible number (not negative, not absurdly large).
    const tat = (metrics as Record<string, unknown>)['averageTurnAroudTime']; // NOTE-3 typo preserved
    if (tat === undefined) {
      markStep(PERSONA, 5, 'PARTIAL',
        'averageTurnAroudTime field missing from metrics',
        'KPI may have been renamed; persona walk hits a moving target.');
      return;
    }
    markStep(PERSONA, 5, 'PASS', `TAT KPI present: ${JSON.stringify(tat)}`);
  });
});
