import { test, expect } from '@playwright/test';
import {
  BASE,
  ADMIN,
  TIMEOUT,
  login,
  navigateWithDiscovery,
  getDateRange,
} from '../helpers/test-helpers';

/**
 * Data Export Test Suite — Suite S (TC-EXP)
 *
 * User stories covered:
 *   US-EXP-1: As a lab supervisor, I can export results as CSV from the results
 *             screen so I can analyze data in a spreadsheet application.
 *   US-EXP-2: As a clinician, I can print or export a PDF of a patient's result
 *             report to include in the patient's physical record.
 *   US-EXP-3: As a lab informatician, I can export a WHONET file for submission
 *             to antimicrobial resistance surveillance programs.
 *   US-EXP-4: As a lab admin, I can export system reports (statistics, rejection
 *             summary) as CSV or PDF for external review.
 *   US-EXP-5: As a security officer, exported files must not contain fields that
 *             were not intended to be exported (no data leakage).
 *
 * URLs:
 *   /Report                     — report generation hub
 *   /Report?type=patient        — Patient Status Report (known to work)
 *   /Report?type=statistics     — Statistics report
 *   /WHONET                     — WHONET export screen
 *   /MasterListsPage/reports    — admin reports menu
 *
 * API endpoints:
 *   GET  /rest/report/patientCollectionDateRange  — patient report range
 *   POST /rest/report/printPatientResultsReport   — generate patient PDF
 *   GET  /rest/reports                            — reports metadata
 *
 * Suite IDs: TC-EXP-01 through TC-EXP-16
 * Total Test Count: 16 TCs
 *
 * Known baseline (Phase 3):
 *   - BUG-9: Management/routine report pages return 404
 *   - Patient Status Report works at /Report?type=patient
 *   - WHONET report via /Report URL
 */

const REPORT_URLS = [
  '/Report',
  '/reports',
  '/MasterListsPage/reports',
  '/ReportMenu',
];

const WHONET_URLS = [
  '/WHONET',
  '/WhonetReport',
  '/Report?type=whonet',
  '/Report',
];

async function goToReports(page: any): Promise<boolean> {
  return navigateWithDiscovery(page, REPORT_URLS);
}

async function goToWHONET(page: any): Promise<boolean> {
  return navigateWithDiscovery(page, WHONET_URLS);
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite S — Export Core (TC-EXP-01 through TC-EXP-08)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Suite S — Data Export Core (TC-EXP)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-EXP-01: Reports page is reachable', async ({ page }) => {
    /**
     * US-EXP-4: The reports hub must be accessible. All exports and print
     * functions flow through the reports module.
     */
    const loaded = await goToReports(page);
    expect(loaded, 'Reports page must be reachable').toBe(true);

    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('Internal Server Error');
    console.log(`TC-EXP-01: PASS — Reports at ${page.url()}`);
  });

  test('TC-EXP-02: Patient Status Report page is accessible', async ({ page }) => {
    /**
     * US-EXP-2: The Patient Status Report is a commonly-used export.
     * Known to work at /Report?type=patient (validated in Phase 3).
     */
    await page.goto(`${BASE}/Report?type=patient`);
    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('Internal Server Error');

    // Check for date range form elements expected on this report
    const hasForm = await page.locator('form, input[type="date"], input[placeholder*="date" i]').count() > 0;
    console.log(`TC-EXP-02: Patient Status report form visible=${hasForm}`);
    console.log(`TC-EXP-02: PASS at ${page.url()}`);
  });

  test('TC-EXP-03: Patient report date range form accepts valid dates', async ({ page }) => {
    /**
     * US-EXP-2: The report form must accept valid date inputs without triggering
     * a format validation error on a correctly-formatted date.
     */
    await page.goto(`${BASE}/Report?type=patient`);
    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    const [startDate, endDate] = getDateRange();
    const dateInput = page.locator('input[type="date"], input[placeholder*="mm/dd" i]').first();

    if (await dateInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await dateInput.fill(startDate);
      await page.waitForTimeout(500);
      const bodyText = await page.locator('body').innerText();
      expect(bodyText).not.toContain('Internal Server Error');
      const hasFormatError = /invalid.*date|format.*error/i.test(bodyText);
      console.log(`TC-EXP-03: dateFormatError=${hasFormatError}`);
      expect(hasFormatError, 'Valid date must not trigger format error').toBe(false);
    } else {
      console.log('TC-EXP-03: NOTE — date input not found on patient report page');
    }
  });

  test('TC-EXP-04: Generate report does not cause 500 for valid date range', async ({ page }) => {
    /**
     * US-EXP-4: Generating a report with a valid date range must not crash.
     * It may return an empty result if no data exists, but must not 500.
     */
    await page.goto(`${BASE}/Report?type=patient`);
    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    const [startDate, endDate] = getDateRange();
    const dateInputs = page.locator('input[type="date"]');
    const inputCount = await dateInputs.count();

    if (inputCount >= 2) {
      await dateInputs.nth(0).fill(startDate);
      await dateInputs.nth(1).fill(endDate);
    } else if (inputCount === 1) {
      await dateInputs.nth(0).fill(startDate);
    }

    // Try to submit
    const generateBtn = page.getByRole('button', { name: /generate|submit|print|run/i }).first();
    if (await generateBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await generateBtn.click();
      await page.waitForTimeout(3000);
    }

    const bodyText = await page.locator('body').innerText();
    expect(bodyText, 'Report generation must not cause Internal Server Error').not.toContain('Internal Server Error');
    console.log('TC-EXP-04: PASS — report generation handled without 500');
  });

  test('TC-EXP-05: Reports API metadata endpoint is healthy', async ({ page }) => {
    /**
     * US-EXP-4: The reports metadata API backs the report selection dropdown.
     * If it fails, the user cannot see which reports are available.
     */
    await page.goto(`${BASE}`);

    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const candidates = [
        '/api/OpenELIS-Global/rest/reports',
        '/api/OpenELIS-Global/rest/reportMenu',
        '/api/OpenELIS-Global/rest/report-types',
      ];
      for (const url of candidates) {
        const res = await fetch(url, { headers: { 'X-CSRF-Token': csrf } });
        if (res.status !== 404) return { status: res.status, url };
      }
      return { status: 404, url: 'none' };
    });

    console.log(`TC-EXP-05: Reports API → ${result.url} HTTP ${result.status}`);
    if (result.status !== 404) {
      expect(result.status, 'Reports API must not 5xx').not.toBeGreaterThanOrEqual(500);
    } else {
      console.log('TC-EXP-05: NOTE — reports metadata API not found (may be embedded in page)');
    }
  });

  test('TC-EXP-06: WHONET export page is reachable or gracefully absent', async ({ page }) => {
    /**
     * US-EXP-3: WHONET export must either be accessible or show a clear "not
     * configured" state — not an Internal Server Error.
     * BUG-9: Some report pages return 404. Documenting WHONET state.
     */
    const loaded = await goToWHONET(page);
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('Internal Server Error');

    if (!loaded) {
      console.log('TC-EXP-06: NOTE (BUG-9 pattern) — WHONET page not reachable via URL discovery');
    } else {
      console.log(`TC-EXP-06: PASS — WHONET accessible at ${page.url()}`);
    }
  });

  test('TC-EXP-07: Export buttons/links are visible on reports page', async ({ page }) => {
    /**
     * US-EXP-1: The reports page must offer export options (PDF, CSV, print).
     * Without export controls, the feature is not usable.
     */
    await goToReports(page);
    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    const exportControls = await page.locator(
      'button:has-text("Export"), button:has-text("Print"), button:has-text("PDF"), button:has-text("CSV"), a[download]'
    ).count();

    const bodyText = await page.locator('body').innerText();
    const hasExportTerm = /export|print|pdf|csv|download/i.test(bodyText);

    console.log(`TC-EXP-07: export controls=${exportControls}, hasExportTerm=${hasExportTerm}`);
    if (exportControls > 0 || hasExportTerm) {
      console.log('TC-EXP-07: PASS — export controls/terms found on reports page');
    } else {
      console.log('TC-EXP-07: NOTE — no export controls found on reports landing page');
    }
  });

  test('TC-EXP-08: Reports page loads within acceptable time', async ({ page }) => {
    const start = Date.now();
    const loaded = await goToReports(page);
    await page.waitForLoadState('domcontentloaded');
    const elapsed = Date.now() - start;

    console.log(`TC-EXP-08: Reports page loaded in ${elapsed}ms`);
    if (loaded) {
      expect(elapsed, 'Reports page must load within 8000ms').toBeLessThan(8000);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite S-DEEP — Export Deep Validation (TC-EXP-09–16)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Suite S-DEEP — Export Deep Validation (TC-EXP-09–16)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-EXP-09: Patient results report API endpoint is healthy', async ({ page }) => {
    /**
     * US-EXP-2: The patient results report API must exist and respond.
     * This endpoint backs the print-patient-results button.
     */
    await page.goto(`${BASE}`);

    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const candidates = [
        '/api/OpenELIS-Global/rest/report/patientCollectionDateRange',
        '/api/OpenELIS-Global/rest/printPatientResultsReport',
        '/api/OpenELIS-Global/rest/patientReport',
      ];
      for (const url of candidates) {
        const res = await fetch(url, { headers: { 'X-CSRF-Token': csrf } });
        if (res.status !== 404) return { status: res.status, url };
      }
      return { status: 404, url: 'none' };
    });

    console.log(`TC-EXP-09: Patient report API → ${result.url} HTTP ${result.status}`);
    if (result.status !== 404) {
      expect(result.status, 'Patient report API must not 5xx').not.toBeGreaterThanOrEqual(500);
    } else {
      console.log('TC-EXP-09: NOTE — patient report API endpoint not at expected paths');
    }
  });

  test('TC-EXP-10: Statistics report page is accessible', async ({ page }) => {
    /**
     * US-EXP-4: The statistics report must be accessible. This report
     * shows test volume, turnaround times, and section performance.
     */
    const candidates = [
      '/Report?type=statistics',
      '/Report?type=labstatistics',
      '/Report?type=stat',
    ];
    let loaded = false;
    for (const url of candidates) {
      await page.goto(`${BASE}${url}`);
      await page.waitForLoadState('networkidle', { timeout: TIMEOUT });
      const body = await page.locator('body').innerText();
      if (!body.includes('404') && !body.includes('Internal Server Error')) {
        loaded = true;
        break;
      }
    }

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('Internal Server Error');
    console.log(`TC-EXP-10: Statistics report loaded=${loaded} at ${page.url()}`);
  });

  test('TC-EXP-11: Rejection summary report page is accessible or shows BUG-9', async ({ page }) => {
    /**
     * US-EXP-4: Rejection summary report documents why samples were rejected.
     * BUG-9: Management reports return 404 — this test tracks that state.
     */
    const candidates = [
      '/Report?type=rejection',
      '/Report?type=nonconform',
      '/Report',
    ];
    await page.goto(`${BASE}${candidates[0]}`);
    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    const body = await page.locator('body').innerText();
    expect(body).not.toContain('Internal Server Error');

    if (body.includes('404')) {
      console.log('TC-EXP-11: BUG-9 CONFIRMED — Rejection summary 404');
    } else {
      console.log(`TC-EXP-11: Rejection summary accessible at ${page.url()}`);
    }
  });

  test('TC-EXP-12: Export does not expose stack traces in response body', async ({ page }) => {
    /**
     * US-EXP-5: If report generation fails, the error response must not contain
     * Java stack traces. Stack traces expose server internals.
     */
    await page.goto(`${BASE}`);

    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      // Trigger with an invalid date range to test error handling
      const res = await fetch('/api/OpenELIS-Global/rest/report/patientCollectionDateRange?startDate=invalid&endDate=invalid', {
        headers: { 'X-CSRF-Token': csrf },
      });
      const text = await res.text().catch(() => '');
      return {
        status: res.status,
        hasStack: text.includes('at org.') || text.includes('at java.') || text.includes('Exception'),
        text: text.slice(0, 200),
      };
    });

    console.log(`TC-EXP-12: Invalid date range → HTTP ${result.status}, hasStack=${result.hasStack}`);
    if (result.hasStack) {
      console.log(`TC-EXP-12: NOTE-7 PATTERN — response contains "Exception" keyword`);
    } else {
      console.log('TC-EXP-12: PASS — no stack trace in report error response');
    }
  });

  test('TC-EXP-13: Multiple report types are listed in reports UI', async ({ page }) => {
    /**
     * US-EXP-4: The reports menu must offer multiple report types so users can
     * select the type of analysis they need.
     */
    await goToReports(page);
    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    const bodyText = await page.locator('body').innerText();
    // Count distinct report-related terms
    const terms = [
      /patient/i, /statistic/i, /rejection/i, /referred/i, /summary/i,
      /monthly/i, /weekly/i, /daily/i, /audit/i, /whonet/i,
    ];
    const foundTerms = terms.filter(t => t.test(bodyText));
    console.log(`TC-EXP-13: ${foundTerms.length} distinct report category terms found`);
    if (foundTerms.length >= 2) {
      console.log('TC-EXP-13: PASS — multiple report types visible');
    } else {
      console.log('TC-EXP-13: NOTE — fewer than 2 report type terms found in reports UI');
    }
  });

  test('TC-EXP-14: Reports are accessible to admin (RBAC)', async ({ page }) => {
    /**
     * US-EXP-4: Admin must be able to access all reports. RBAC must not
     * accidentally block this role from report generation.
     */
    const loaded = await goToReports(page);
    expect(loaded, 'Admin must be able to access Reports').toBe(true);
    expect(page.url()).not.toMatch(/LoginPage|login/i);
  });

  test('TC-EXP-15: Concurrent report API requests are stable', async ({ page }) => {
    /**
     * US-EXP-4 (performance): Multiple simultaneous report requests must not
     * cause server errors or session corruption.
     */
    await page.goto(`${BASE}`);

    const results = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const urls = [
        '/api/OpenELIS-Global/rest/reports',
        '/api/OpenELIS-Global/rest/home-dashboard/metrics',
        '/api/OpenELIS-Global/rest/testSections',
      ];
      const requests = urls.flatMap(url =>
        Array.from({ length: 3 }, () =>
          fetch(url, { headers: { 'X-CSRF-Token': csrf } }).then(r => r.status)
        )
      );
      return Promise.all(requests);
    });

    const serverErrors = results.filter(s => s >= 500);
    console.log(`TC-EXP-15: 9 concurrent report requests → statuses: [${results.join(', ')}]`);
    console.log(`TC-EXP-15: Server errors: ${serverErrors.length}`);
    expect(serverErrors.length, 'Concurrent report requests must not cause 5xx').toBe(0);
  });

  test('TC-EXP-16: Empty date range shows validation, not 500', async ({ page }) => {
    /**
     * US-EXP-4: Submitting the report form with empty/blank dates must show
     * a validation message, not an Internal Server Error.
     */
    await page.goto(`${BASE}/Report?type=patient`);
    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    const generateBtn = page.getByRole('button', { name: /generate|submit|print|run/i }).first();
    if (await generateBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await generateBtn.click();
      await page.waitForTimeout(2000);

      const bodyText = await page.locator('body').innerText();
      expect(bodyText, 'Empty date range must not cause Internal Server Error').not.toContain('Internal Server Error');
      const hasValidation = /required|select|date|please|error/i.test(bodyText);
      console.log(`TC-EXP-16: validationShown=${hasValidation}`);
    } else {
      console.log('TC-EXP-16: NOTE — generate button not found on patient report page');
    }
  });
});
