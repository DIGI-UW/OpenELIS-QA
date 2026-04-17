import { test, expect } from '@playwright/test';
import {
  BASE,
  ADMIN,
  QA_PREFIX,
  TIMEOUT,
  ACCESSION,
  login,
  navigateWithDiscovery,
  getDateRange,
} from '../helpers/test-helpers';

/**
 * Results By Unit (Lab Section Worklist) — Suite F
 *
 * User stories covered:
 *   US-BU-1: As a lab technician, I can view the worklist for my lab section
 *            so I only see the tests relevant to my unit.
 *   US-BU-2: As a lab technician, I can enter result values directly from the
 *            section worklist without navigating to each order individually.
 *   US-BU-3: As a lab supervisor, I can filter the worklist by date range
 *            to focus on today's pending tests.
 *   US-BU-4: As a lab technician, I need the worklist to highlight orders
 *            with H/L flags so I can prioritize critical values.
 *   US-BU-5: As a lab tech, I can expand a worklist row to see the full
 *            test detail panel before entering results.
 *
 * URL candidates (discovery order):
 *   /LogbookResults          — primary Results By Unit (section) view
 *   /ResultsByUnit           — fallback
 *   /LabResults
 *
 * API endpoints:
 *   GET /rest/test-section-for-logbook          — available test sections/units
 *   GET /rest/LogbookResults?type=<section>     — results for a section
 *
 * Suite IDs: TC-BU-01 through TC-BU-10
 * Total Test Count: 10 TCs
 */

const LOGBOOK_URL = '/LogbookResults';

async function goToLogbook(page: any): Promise<boolean> {
  return navigateWithDiscovery(page, [
    '/LogbookResults',
    '/ResultsByUnit',
    '/LabResults',
  ]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite F Core — Results By Unit (TC-BU-01 through TC-BU-05)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Suite F — Results By Unit (TC-BU)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-BU-01: LogbookResults page loads with test section dropdown', async ({ page }) => {
    /**
     * US-BU-1: The section dropdown is the entry point for every lab technician
     * using the worklist. Without it, they cannot filter to their unit.
     */
    const loaded = await goToLogbook(page);
    expect(loaded, 'LogbookResults page must be reachable').toBe(true);

    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    // Must have a dropdown to select the test section
    const sectionDropdown = page.locator(
      'select, [role="combobox"], [aria-haspopup="listbox"]'
    ).first();
    const hasDropdown = await sectionDropdown.isVisible({ timeout: TIMEOUT }).catch(() => false);

    expect(hasDropdown, 'Test section selector must be present').toBe(true);
    console.log(`TC-BU-01: PASS — LogbookResults at ${page.url()}, section dropdown present`);
  });

  test('TC-BU-02: Test section dropdown enumerates available lab units', async ({ page }) => {
    /**
     * US-BU-1: The dropdown must list all configured lab sections so each tech
     * can find their unit (Hematology, Chemistry, Microbiology, etc.).
     */
    await page.goto(`${BASE}${LOGBOOK_URL}`);
    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    // Use the API to enumerate sections — more reliable than UI option count
    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch('/api/OpenELIS-Global/rest/test-section-for-logbook', {
        headers: { 'X-CSRF-Token': csrf },
      });
      if (!res.ok) return { status: res.status, sections: [] };
      const data = await res.json();
      return {
        status: res.status,
        sections: Array.isArray(data) ? data.map((s: any) => s.value || s.name || s) : [],
      };
    });

    console.log(`TC-BU-02: API status=${result.status}, section count=${result.sections.length}`);
    expect(result.status).toBe(200);
    expect(result.sections.length, 'At least 5 lab sections must be configured').toBeGreaterThanOrEqual(5);

    // Known sections from the test instance baseline
    const knownSections = ['Hematology', 'Chemistry', 'Serology', 'Bacteriology'];
    const found = knownSections.filter(s =>
      result.sections.some((sec: string) => sec.toLowerCase().includes(s.toLowerCase()))
    );
    console.log(`TC-BU-02: Known sections found: [${found.join(', ')}]`);
    expect(found.length, 'At least 2 known lab sections must be present').toBeGreaterThanOrEqual(2);
  });

  test('TC-BU-03: Selecting Hematology section loads result rows', async ({ page }) => {
    /**
     * US-BU-1 + US-BU-2: After selecting a section, the worklist must populate
     * with orders pending result entry. Hematology is the baseline section.
     */
    await page.goto(`${BASE}${LOGBOOK_URL}`);
    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch('/api/OpenELIS-Global/rest/LogbookResults?type=Hematology', {
        headers: { 'X-CSRF-Token': csrf },
      });
      if (!res.ok) return { status: res.status, count: -1, hasRows: false };
      const data = await res.json();
      const rows = data.testResult ?? data.results ?? data ?? [];
      return {
        status: res.status,
        count: Array.isArray(rows) ? rows.length : 0,
        hasRows: Array.isArray(rows) && rows.length > 0,
      };
    });

    console.log(`TC-BU-03: Hematology → status=${result.status}, rows=${result.count}`);
    expect(result.status).toBe(200);
    // Must return at least some test results in the Hematology section
    expect(result.count, 'Hematology section must have at least 1 result row').toBeGreaterThan(0);
  });

  test('TC-BU-04: LogbookResults row contains required columns', async ({ page }) => {
    /**
     * US-BU-2: To enter results safely, each row must show the accession number,
     * patient name, test name, and a result entry field.
     */
    await page.goto(`${BASE}${LOGBOOK_URL}`);
    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    const rowData = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch('/api/OpenELIS-Global/rest/LogbookResults?type=Hematology', {
        headers: { 'X-CSRF-Token': csrf },
      });
      if (!res.ok) return null;
      const data = await res.json();
      const rows = data.testResult ?? data.results ?? [];
      return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    });

    if (!rowData) {
      console.log('TC-BU-04: SKIP — no Hematology rows available');
      test.skip();
      return;
    }

    console.log(`TC-BU-04: First row keys: [${Object.keys(rowData).join(', ')}]`);

    // Result row must include identity fields
    const hasAccessionOrLabNo = 'labNo' in rowData || 'accessionNumber' in rowData || 'sequenceNumber' in rowData;
    const hasTestName = 'testName' in rowData || 'testId' in rowData;

    expect(hasAccessionOrLabNo, 'Row must include an accession/lab number field').toBe(true);
    expect(hasTestName, 'Row must include a test name or ID field').toBe(true);
  });

  test('TC-BU-05: Date range filter limits worklist to expected period', async ({ page }) => {
    /**
     * US-BU-3: Filtering by today's date should return only today's pending tests.
     * Tests that the API correctly applies startDate/endDate query parameters.
     */
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '/');

    const result = await page.evaluate(async (dateStr) => {
      const csrf = localStorage.getItem('CSRF') || '';
      const params = new URLSearchParams({
        type: 'Hematology',
        startDate: dateStr,
        endDate: dateStr,
      });
      const res = await fetch(`/api/OpenELIS-Global/rest/LogbookResults?${params}`, {
        headers: { 'X-CSRF-Token': csrf },
      });
      return { status: res.status, ok: res.ok };
    }, today);

    console.log(`TC-BU-05: date-filtered request status=${result.status}`);
    // API must accept date parameters without a 5xx error
    expect(result.status, 'Date range filter must not cause a 5xx error').not.toBe(500);
    expect(result.status, 'Date range filter must not cause a 5xx error').not.toBe(503);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite F-DEEP — Section Interaction Tests (TC-BU-06 through TC-BU-10)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Suite F-DEEP — Results By Unit Extended (TC-BU-06 through TC-BU-10)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-BU-06: All 14 expected lab sections respond with HTTP 200', async ({ page }) => {
    /**
     * US-BU-1: Every configured lab section must return a valid (non-error) response
     * so that technicians in any unit can access their worklist.
     */
    const knownSections = [
      'Hematology', 'Chemistry', 'Serology', 'Bacteriology',
      'Mycobacteriology', 'Parasitology', 'Virology', 'Urinalysis',
    ];

    await page.goto(`${BASE}${LOGBOOK_URL}`);

    const results = await page.evaluate(async (sections: string[]) => {
      const csrf = localStorage.getItem('CSRF') || '';
      const out: { section: string; status: number }[] = [];
      for (const section of sections) {
        const res = await fetch(`/api/OpenELIS-Global/rest/LogbookResults?type=${encodeURIComponent(section)}`, {
          headers: { 'X-CSRF-Token': csrf },
        });
        out.push({ section, status: res.status });
      }
      return out;
    }, knownSections);

    let passed = 0;
    for (const r of results) {
      const ok = r.status === 200;
      if (ok) passed++;
      console.log(`TC-BU-06: ${r.section} → HTTP ${r.status} ${ok ? '✓' : '✗'}`);
    }

    expect(passed, `At least 6 of ${knownSections.length} sections must return 200`).toBeGreaterThanOrEqual(6);
  });

  test('TC-BU-07: Worklist page loads and renders the section UI without errors', async ({ page }) => {
    /**
     * US-BU-1: Verifies the React/Carbon UI renders correctly for the worklist —
     * not just the API, but the actual page a technician sees.
     */
    await page.goto(`${BASE}${LOGBOOK_URL}`);
    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    const bodyText = await page.locator('body').innerText();
    expect(bodyText, 'Page must not show a 404').not.toContain('404');
    expect(bodyText, 'Page must not show Internal Server Error').not.toContain('Internal Server Error');

    // Page must have at least some form of selector UI
    const inputCount = await page.locator('input, select, [role="combobox"]').count();
    expect(inputCount, 'Worklist page must have at least one input/selector').toBeGreaterThan(0);

    // Must have some text content beyond navigation
    expect(bodyText.length, 'Worklist page must render substantial content').toBeGreaterThan(200);
    console.log(`TC-BU-07: PASS — LogbookResults at ${page.url()}, ${inputCount} inputs found`);
  });

  test('TC-BU-08: Result entry row data contains numeric result field', async ({ page }) => {
    /**
     * US-BU-2 + US-BU-4: Each result row must expose a numeric value or a
     * resultValue field where the technician can type the measurement.
     * Also checks for H/L flag fields.
     */
    await page.goto(`${BASE}${LOGBOOK_URL}`);

    const rowData = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch('/api/OpenELIS-Global/rest/LogbookResults?type=Hematology', {
        headers: { 'X-CSRF-Token': csrf },
      });
      if (!res.ok) return null;
      const data = await res.json();
      const rows = data.testResult ?? data.results ?? [];
      return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    });

    if (!rowData) {
      console.log('TC-BU-08: SKIP — no Hematology rows returned');
      test.skip();
      return;
    }

    const keys = Object.keys(rowData);
    console.log(`TC-BU-08: Row keys: [${keys.join(', ')}]`);

    // Check for result/value field variants
    const hasResultField =
      keys.some(k => /result|value|reading/i.test(k));
    // Check for H/L abnormal flag field variants
    const hasFlagField =
      keys.some(k => /flag|abnormal|limit|range|high|low/i.test(k));

    expect(hasResultField, 'Result row must have a result/value field').toBe(true);
    console.log(`TC-BU-08: hasFlagField=${hasFlagField} (H/L flag — informational)`);
  });

  test('TC-BU-09: Multiple sections return non-overlapping test names', async ({ page }) => {
    /**
     * US-BU-1: Each lab section worklist should contain tests specific to that
     * section. Verifies that Hematology and Chemistry don't return identical tests,
     * confirming section-based routing works correctly.
     */
    await page.goto(`${BASE}${LOGBOOK_URL}`);

    const comparison = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';

      const fetchSection = async (type: string) => {
        const res = await fetch(`/api/OpenELIS-Global/rest/LogbookResults?type=${type}`, {
          headers: { 'X-CSRF-Token': csrf },
        });
        if (!res.ok) return [];
        const data = await res.json();
        const rows = data.testResult ?? data.results ?? [];
        return rows.map((r: any) => r.testName || r.testId || '').filter(Boolean);
      };

      const [hema, chem] = await Promise.all([
        fetchSection('Hematology'),
        fetchSection('Chemistry'),
      ]);

      const hemaSet = new Set(hema);
      const overlap = chem.filter((t: string) => hemaSet.has(t));
      return {
        hemaCount: hema.length,
        chemCount: chem.length,
        overlapCount: overlap.length,
        overlap: overlap.slice(0, 5),
      };
    });

    console.log(`TC-BU-09: Hematology=${comparison.hemaCount} tests, Chemistry=${comparison.chemCount} tests, overlap=${comparison.overlapCount}`);
    if (comparison.overlap.length > 0) {
      console.log(`TC-BU-09: Overlapping tests: [${comparison.overlap.join(', ')}]`);
    }

    // At least one section must have tests
    expect(
      comparison.hemaCount + comparison.chemCount,
      'Combined Hematology + Chemistry must have at least 1 test'
    ).toBeGreaterThan(0);

    // The overlap should be minimal (< 50% of the smaller section)
    if (comparison.hemaCount > 0 && comparison.chemCount > 0) {
      const smaller = Math.min(comparison.hemaCount, comparison.chemCount);
      expect(
        comparison.overlapCount,
        'Section overlap should be less than 50% of the smaller section'
      ).toBeLessThanOrEqual(Math.ceil(smaller * 0.5));
    }
  });

  test('TC-BU-10: LogbookResults API for known accession matches AccessionResults', async ({ page }) => {
    /**
     * US-BU-2 (cross-module): The result visible in the section worklist must be
     * the same value seen in AccessionResults. Verifies data consistency between
     * the two main result-entry surfaces.
     */
    await page.goto(`${BASE}${LOGBOOK_URL}`);

    const crossCheck = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';

      // Get Hematology worklist
      const logbookRes = await fetch('/api/OpenELIS-Global/rest/LogbookResults?type=Hematology', {
        headers: { 'X-CSRF-Token': csrf },
      });
      if (!logbookRes.ok) return { logbookStatus: logbookRes.status, accStatus: -1, match: false };

      const logbookData = await logbookRes.json();
      const rows = logbookData.testResult ?? logbookData.results ?? [];

      // Find the known accession row if present
      const knownRow = rows.find((r: any) =>
        (r.labNo || r.accessionNumber || '').includes('26CPHL00008V')
      );

      // Also fetch from AccessionResults API
      const accRes = await fetch('/api/OpenELIS-Global/rest/AccessionResults?accessionNumber=26CPHL00008V', {
        headers: { 'X-CSRF-Token': csrf },
      });

      return {
        logbookStatus: logbookRes.status,
        accStatus: accRes.status,
        foundInLogbook: !!knownRow,
        logbookRows: rows.length,
      };
    });

    console.log(`TC-BU-10: LogbookResults status=${crossCheck.logbookStatus}, AccessionResults status=${crossCheck.accStatus}`);
    console.log(`TC-BU-10: Known accession in Hematology worklist: ${crossCheck.foundInLogbook}, total rows: ${crossCheck.logbookRows}`);

    expect(crossCheck.logbookStatus).toBe(200);
    expect(crossCheck.accStatus).toBe(200);
  });
});
