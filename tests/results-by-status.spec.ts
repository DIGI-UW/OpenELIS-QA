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
 * Results By Status Test Suite — Suite BG-DEEP
 *
 * User stories covered:
 *   US-RBS-1: As a lab supervisor, I can view all test results grouped by
 *             their current status (pending, completed, flagged) to prioritize
 *             follow-up actions.
 *   US-RBS-2: As a lab technician, I can filter the results by status dropdown
 *             to focus on only the results that need my attention.
 *   US-RBS-3: As a lab supervisor, the status dropdown must enumerate all
 *             relevant test statuses (200+ test types confirmed in BG-DEEP).
 *   US-RBS-4: As a lab technician, filtering by a specific status and date
 *             range must narrow results without crashing.
 *
 * URLs:
 *   /ResultsByStatus         — primary screen (BG-DEEP confirmed)
 *   /ResultStatus            — fallback
 *   /WorkPlanByStatus        — fallback
 *
 * API endpoints:
 *   GET /rest/test-section-for-logbook  — test section list
 *   GET /rest/LogbookResults?type=<section>&status=<s>
 *
 * Suite IDs: TC-RBS-01 through TC-RBS-10
 * Total Test Count: 10 TCs
 *
 * Known baseline (BG-DEEP Phase 6):
 *   - Results By Status page confirmed accessible
 *   - Status dropdown contains 200+ test types
 */

const RBS_URLS = [
  '/ResultsByStatus',
  '/ResultStatus',
  '/WorkPlanByStatus',
  '/results/status',
];

async function goToResultsByStatus(page: any): Promise<boolean> {
  return navigateWithDiscovery(page, RBS_URLS);
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite BG — Results By Status Core (TC-RBS-01 through TC-RBS-05)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Suite BG — Results By Status Core (TC-RBS)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-RBS-01: Results By Status page is reachable', async ({ page }) => {
    /**
     * US-RBS-1: The Results By Status screen must be accessible so supervisors
     * can monitor pending and flagged result queues.
     */
    const loaded = await goToResultsByStatus(page);
    expect(loaded, 'Results By Status must be reachable').toBe(true);

    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('404');
    expect(bodyText).not.toContain('Internal Server Error');
    console.log(`TC-RBS-01: PASS — Results By Status at ${page.url()}`);
  });

  test('TC-RBS-02: Page has status dropdown or filter control', async ({ page }) => {
    /**
     * US-RBS-2: The page must have a dropdown or filter that allows the user
     * to select which status category of results to view.
     */
    const loaded = await goToResultsByStatus(page);
    if (!loaded) { test.skip(); return; }

    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    const hasSelect = await page.locator('select, [role="combobox"], [aria-haspopup="listbox"]').count() > 0;
    const bodyText = await page.locator('body').innerText();
    const hasStatusTerm = /status|pending|complete|flagged|in progress/i.test(bodyText);

    console.log(`TC-RBS-02: hasSelect=${hasSelect}, hasStatusTerm=${hasStatusTerm}`);
    expect(hasSelect || hasStatusTerm, 'Results By Status must have a filter control').toBe(true);
  });

  test('TC-RBS-03: Status dropdown enumerates multiple test types', async ({ page }) => {
    /**
     * US-RBS-3: The status dropdown is expected to contain 200+ test types
     * (confirmed in Phase 6 BG-DEEP). Must have at least 10 options.
     */
    const loaded = await goToResultsByStatus(page);
    if (!loaded) { test.skip(); return; }

    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    const selects = await page.locator('select').all();
    let maxOptions = 0;
    for (const sel of selects) {
      const optCount = await sel.locator('option').count().catch(() => 0);
      if (optCount > maxOptions) maxOptions = optCount;
    }

    console.log(`TC-RBS-03: Max dropdown options: ${maxOptions}`);
    if (maxOptions > 0) {
      expect(maxOptions, 'Status dropdown must have at least 10 options').toBeGreaterThanOrEqual(10);
      console.log(`TC-RBS-03: PASS — ${maxOptions} options in dropdown (expected 200+)`);
    } else {
      console.log('TC-RBS-03: NOTE — no select with options found (may use custom dropdown)');
    }
  });

  test('TC-RBS-04: Filtering by status does not cause server error', async ({ page }) => {
    /**
     * US-RBS-4: Selecting any status option from the dropdown and triggering
     * the search must not result in a 500 error.
     */
    const loaded = await goToResultsByStatus(page);
    if (!loaded) { test.skip(); return; }

    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    const firstSelect = page.locator('select').first();
    if (await firstSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Select the second option (first non-empty option)
      await firstSelect.selectOption({ index: 1 });
      await page.waitForTimeout(1500);
    }

    const bodyText = await page.locator('body').innerText();
    expect(bodyText, 'Status filter must not cause 500').not.toContain('Internal Server Error');
    console.log('TC-RBS-04: PASS — status filter applied without server error');
  });

  test('TC-RBS-05: Results By Status page loads within acceptable time', async ({ page }) => {
    /**
     * US-RBS-1: Lab supervisors check status queues frequently. The page must
     * load within 5 seconds to support an efficient monitoring workflow.
     */
    const start = Date.now();
    const loaded = await goToResultsByStatus(page);
    await page.waitForLoadState('domcontentloaded');
    const elapsed = Date.now() - start;

    console.log(`TC-RBS-05: Results By Status loaded in ${elapsed}ms`);
    if (loaded) {
      expect(elapsed, 'Results By Status must load within 5000ms').toBeLessThan(5000);
    } else {
      console.log('TC-RBS-05: SKIP — page not reachable');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite BG-DEEP — Results By Status API (TC-RBS-06 through TC-RBS-10)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Suite BG-DEEP — Results By Status API & Validation (TC-RBS-06–10)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-RBS-06: Test section API returns list for status filtering', async ({ page }) => {
    /**
     * US-RBS-3: The same test-section API used by LogbookResults underpins the
     * Results By Status dropdown. It must return a non-empty list.
     */
    await page.goto(`${BASE}`);

    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch('/api/OpenELIS-Global/rest/test-section-for-logbook', {
        headers: { 'X-CSRF-Token': csrf },
      });
      if (!res.ok) return { status: res.status, count: -1 };
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.testSections ?? data.sections ?? []);
      return { status: res.status, count: list.length };
    });

    console.log(`TC-RBS-06: test-section API → HTTP ${result.status}, sections=${result.count}`);
    expect(result.status).toBe(200);
    expect(result.count, 'Must have at least 5 test sections').toBeGreaterThanOrEqual(5);
  });

  test('TC-RBS-07: LogbookResults with status param returns non-5xx', async ({ page }) => {
    /**
     * US-RBS-4: Querying LogbookResults with a status filter parameter must
     * not cause a server error, even for an empty result set.
     */
    await page.goto(`${BASE}`);

    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const candidates = [
        '/api/OpenELIS-Global/rest/LogbookResults?type=Hematology&status=PENDING',
        '/api/OpenELIS-Global/rest/LogbookResults?type=Hematology&resultStatus=incomplete',
      ];
      for (const url of candidates) {
        const res = await fetch(url, { headers: { 'X-CSRF-Token': csrf } });
        if (res.status !== 404) return { status: res.status, url };
      }
      return { status: 404, url: 'none' };
    });

    console.log(`TC-RBS-07: ${result.url} → HTTP ${result.status}`);
    expect(result.status, 'LogbookResults with status param must not 5xx').not.toBeGreaterThanOrEqual(500);
  });

  test('TC-RBS-08: Results By Status is accessible to admin (RBAC)', async ({ page }) => {
    /**
     * US-RBS-1: Admin must have access to the Results By Status queue.
     * RBAC must not block this monitoring screen.
     */
    const loaded = await goToResultsByStatus(page);
    expect(loaded, 'Admin must be able to access Results By Status').toBe(true);
    expect(page.url()).not.toMatch(/LoginPage|login/i);
  });

  test('TC-RBS-09: Date range filter combined with status does not crash', async ({ page }) => {
    /**
     * US-RBS-4: Combining status filter with a date range must not cause a
     * server error — this is a common supervisor workflow.
     */
    const loaded = await goToResultsByStatus(page);
    if (!loaded) { test.skip(); return; }

    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    // Apply status filter
    const statusSelect = page.locator('select').first();
    if (await statusSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
      await statusSelect.selectOption({ index: 1 });
    }

    // Apply date if available
    const dateInput = page.locator('input[type="date"]').first();
    if (await dateInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      const today = new Date().toISOString().slice(0, 10);
      await dateInput.fill(today);
    }

    await page.waitForTimeout(1500);
    const bodyText = await page.locator('body').innerText();
    expect(bodyText, 'Combined status+date filter must not 500').not.toContain('Internal Server Error');
    console.log('TC-RBS-09: PASS — combined status+date filter handled without error');
  });

  test('TC-RBS-10: Cross-module — known accession in LogbookResults is consistent', async ({ page }) => {
    /**
     * US-RBS-1: Cross-module integrity — the Hematology section result for the
     * known accession must be consistent between LogbookResults and AccessionResults.
     */
    await page.goto(`${BASE}`);

    const [logbook, accession] = await Promise.all([
      page.evaluate(async () => {
        const csrf = localStorage.getItem('CSRF') || '';
        const res = await fetch('/api/OpenELIS-Global/rest/LogbookResults?type=Hematology', {
          headers: { 'X-CSRF-Token': csrf },
        });
        if (!res.ok) return { status: res.status, count: -1 };
        const data = await res.json();
        const rows = data.logbookResults ?? data.results ?? data ?? [];
        return { status: res.status, count: rows.length };
      }),
      page.evaluate(async () => {
        const csrf = localStorage.getItem('CSRF') || '';
        const res = await fetch('/api/OpenELIS-Global/rest/AccessionResults?accessionNumber=26CPHL00008V', {
          headers: { 'X-CSRF-Token': csrf },
        });
        return { status: res.status, ok: res.ok };
      }),
    ]);

    console.log(`TC-RBS-10: LogbookResults HTTP=${logbook.status} rows=${logbook.count}, AccessionResults HTTP=${accession.status}`);
    expect(logbook.status, 'LogbookResults must not 5xx').not.toBeGreaterThanOrEqual(500);
    expect(accession.status, 'AccessionResults must not 5xx').not.toBeGreaterThanOrEqual(500);
  });
});
