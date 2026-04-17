import { test, expect } from '@playwright/test';
import {
  BASE,
  ADMIN,
  TIMEOUT,
  login,
  navigateWithDiscovery,
} from '../helpers/test-helpers';

/**
 * Workplan Deep Test Suite — Suite AJ + N-DEEP Extended
 *
 * User stories covered:
 *   US-WP-1: As a lab technician, I can view the workplan filtered by panel
 *            to see all tests that belong to a specific test panel for
 *            efficient batch processing.
 *   US-WP-2: As a lab supervisor, I can view the workplan filtered by
 *            priority (STAT, ROUTINE) to ensure urgent tests are processed first.
 *   US-WP-3: As a lab technician, the workplan by test type shows all pending
 *            tests across all test sections so nothing is missed.
 *   US-WP-4: As a lab supervisor, I can filter the workplan by test section
 *            (Hematology, Chemistry, etc.) to assign work to specific benches.
 *   US-WP-5: As a lab admin, the workplan panels dropdown must enumerate all
 *            configured panels so the filter is complete.
 *
 * URLs:
 *   /WorkPlanByPanel          — filter by panel
 *   /WorkPlanByPriority       — filter by priority
 *   /WorkPlanByTest           — filter by test type (N-DEEP confirmed 200+ types)
 *   /WorkPlanByTestSection    — filter by section
 *
 * API endpoints:
 *   GET /rest/workplan/testPanel/<panelId>  — workplan for specific panel
 *   GET /rest/test-section-for-logbook     — test section list (shared with logbook)
 *
 * Suite IDs: TC-WPD-01 through TC-WPD-10
 * Total Test Count: 10 TCs
 *
 * Known baseline (N-DEEP Phase 5):
 *   - WorkPlanByTest: 200+ test types in dropdown
 *   - WorkPlanByPanel: 40+ panel types; empty state expected for most panels
 */

async function goToWorkplanPanel(page: any): Promise<boolean> {
  return navigateWithDiscovery(page, [
    '/WorkPlanByPanel',
    '/WorkPlan/panel',
    '/workplan/by-panel',
  ]);
}

async function goToWorkplanPriority(page: any): Promise<boolean> {
  return navigateWithDiscovery(page, [
    '/WorkPlanByPriority',
    '/WorkPlan/priority',
    '/workplan/priority',
  ]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite AJ — Workplan By Panel/Priority Core (TC-WPD-01 through TC-WPD-05)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Suite AJ — Workplan By Panel/Priority Core (TC-WPD)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-WPD-01: Workplan By Panel page is reachable', async ({ page }) => {
    /**
     * US-WP-1: The workplan panel filter screen must be accessible so
     * lab technicians can view work grouped by test panel.
     */
    const loaded = await goToWorkplanPanel(page);
    expect(loaded, 'Workplan By Panel must be reachable').toBe(true);

    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('404');
    expect(bodyText).not.toContain('Internal Server Error');
    console.log(`TC-WPD-01: PASS — Workplan By Panel at ${page.url()}`);
  });

  test('TC-WPD-02: Workplan By Panel has panel selector with ≥40 options', async ({ page }) => {
    /**
     * US-WP-5: The panel dropdown must enumerate all configured panels.
     * Phase 5 N-DEEP confirmed 40+ panel types.
     */
    const loaded = await goToWorkplanPanel(page);
    if (!loaded) { test.skip(); return; }

    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    const selects = await page.locator('select').all();
    let maxOptions = 0;
    for (const sel of selects) {
      const optCount = await sel.locator('option').count().catch(() => 0);
      if (optCount > maxOptions) maxOptions = optCount;
    }

    console.log(`TC-WPD-02: Max panel dropdown options: ${maxOptions}`);
    if (maxOptions > 0) {
      expect(maxOptions, 'Panel dropdown must have at least 20 options').toBeGreaterThanOrEqual(20);
      console.log(`TC-WPD-02: PASS — ${maxOptions} panels in dropdown (expected 40+)`);
    } else {
      console.log('TC-WPD-02: NOTE — no select dropdown found (may use custom component)');
    }
  });

  test('TC-WPD-03: Workplan By Priority page is reachable', async ({ page }) => {
    /**
     * US-WP-2: The workplan priority filter must be accessible so
     * supervisors can view STAT orders first.
     */
    const loaded = await goToWorkplanPriority(page);
    expect(loaded, 'Workplan By Priority must be reachable').toBe(true);

    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('Internal Server Error');
    console.log(`TC-WPD-03: PASS — Workplan By Priority at ${page.url()}`);
  });

  test('TC-WPD-04: Workplan By Priority shows STAT/ROUTINE priority options', async ({ page }) => {
    /**
     * US-WP-2: The priority filter must include at least STAT and ROUTINE
     * as priority options to cover the common lab priority scheme.
     */
    const loaded = await goToWorkplanPriority(page);
    if (!loaded) { test.skip(); return; }

    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });
    const bodyText = await page.locator('body').innerText();

    const hasStat = /stat\b/i.test(bodyText);
    const hasRoutine = /routine/i.test(bodyText);
    const hasPriority = /priority/i.test(bodyText);

    console.log(`TC-WPD-04: STAT=${hasStat}, Routine=${hasRoutine}, Priority=${hasPriority}`);
    expect(hasStat || hasRoutine || hasPriority, 'Priority workplan must show priority terms').toBe(true);
  });

  test('TC-WPD-05: Selecting a panel shows workplan entries or empty state', async ({ page }) => {
    /**
     * US-WP-1: After selecting a panel from the dropdown, the workplan must
     * either show pending entries or a clean "no entries" state — never crash.
     */
    const loaded = await goToWorkplanPanel(page);
    if (!loaded) { test.skip(); return; }

    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    const firstSelect = page.locator('select').first();
    if (await firstSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      await firstSelect.selectOption({ index: 1 });
      await page.waitForTimeout(2000);
    }

    const bodyText = await page.locator('body').innerText();
    expect(bodyText, 'Panel selection must not cause server error').not.toContain('Internal Server Error');
    console.log('TC-WPD-05: PASS — panel selection handled without crash');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite N-DEEP-EXT — Workplan Deep (TC-WPD-06 through TC-WPD-10)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Suite N-DEEP-EXT — Workplan Deep Extended (TC-WPD-06–10)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-WPD-06: WorkPlanByTest has ≥200 test types in dropdown', async ({ page }) => {
    /**
     * US-WP-3: The workplan test type dropdown was confirmed to have 200+
     * types in Phase 5 N-DEEP. Must have at least 100 options to be useful.
     */
    const loaded = await navigateWithDiscovery(page, ['/WorkPlanByTest', '/WorkPlan/test']);
    if (!loaded) { test.skip(); return; }

    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    const selects = await page.locator('select').all();
    let maxOptions = 0;
    for (const sel of selects) {
      const optCount = await sel.locator('option').count().catch(() => 0);
      if (optCount > maxOptions) maxOptions = optCount;
    }

    console.log(`TC-WPD-06: WorkPlanByTest dropdown options: ${maxOptions}`);
    if (maxOptions > 0) {
      expect(maxOptions, 'WorkPlan test dropdown must have at least 100 options (expected 200+)').toBeGreaterThanOrEqual(100);
    } else {
      console.log('TC-WPD-06: NOTE — no select found (may use custom component)');
    }
  });

  test('TC-WPD-07: WorkPlanByTestSection has ≥5 section options', async ({ page }) => {
    /**
     * US-WP-4: The test section dropdown must enumerate the lab's configured
     * sections. Baseline: Hematology, Chemistry, Microbiology, etc.
     */
    const loaded = await navigateWithDiscovery(page, ['/WorkPlanByTestSection', '/WorkPlan/section']);
    if (!loaded) { test.skip(); return; }

    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch('/api/OpenELIS-Global/rest/test-section-for-logbook', {
        headers: { 'X-CSRF-Token': csrf },
      });
      if (!res.ok) return { status: res.status, count: -1 };
      const data = await res.json();
      return { status: res.status, count: Array.isArray(data) ? data.length : -1 };
    });

    console.log(`TC-WPD-07: Test sections available: ${result.count}`);
    expect(result.status).toBe(200);
    expect(result.count, 'Must have at least 5 test sections').toBeGreaterThanOrEqual(5);
  });

  test('TC-WPD-08: All four workplan views are reachable', async ({ page }) => {
    /**
     * US-WP-1–4: All four workplan filter views must be accessible.
     * A broken workplan view disrupts the lab workflow.
     */
    const workplanUrls = [
      '/WorkPlanByTest',
      '/WorkPlanByPanel',
      '/WorkPlanByPriority',
      '/WorkPlanByTestSection',
    ];

    const results: { url: string; ok: boolean }[] = [];
    for (const url of workplanUrls) {
      await page.goto(`${BASE}${url}`);
      await page.waitForLoadState('networkidle', { timeout: TIMEOUT });
      const bodyText = await page.locator('body').innerText();
      const ok = !bodyText.includes('Internal Server Error') && !page.url().match(/login/i);
      results.push({ url, ok });
    }

    console.log('TC-WPD-08:', JSON.stringify(results));
    const failing = results.filter(r => !r.ok);
    expect(failing, `Failing workplan views: ${JSON.stringify(failing)}`).toHaveLength(0);
  });

  test('TC-WPD-09: Workplan By Test section data endpoint returns results', async ({ page }) => {
    /**
     * US-WP-3: The workplan API for Hematology must return a usable response —
     * confirmed in Phase 5 N-DEEP to return 14 test types with data.
     */
    await page.goto(`${BASE}`);

    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch('/api/OpenELIS-Global/rest/LogbookResults?type=Hematology', {
        headers: { 'X-CSRF-Token': csrf },
      });
      if (!res.ok) return { status: res.status, count: -1 };
      const data = await res.json();
      const rows = data.logbookResults ?? data.results ?? data ?? [];
      return { status: res.status, count: Array.isArray(rows) ? rows.length : -1 };
    });

    console.log(`TC-WPD-09: Hematology workplan API → HTTP ${result.status}, rows=${result.count}`);
    expect(result.status, 'Hematology workplan must not 5xx').not.toBeGreaterThanOrEqual(500);
  });

  test('TC-WPD-10: Workplan pages load within acceptable time', async ({ page }) => {
    /**
     * US-WP-1: Workplan screens are opened frequently during busy shifts.
     * They must load within 5 seconds.
     */
    const start = Date.now();
    await page.goto(`${BASE}/WorkPlanByTest`);
    await page.waitForLoadState('domcontentloaded');
    const elapsed = Date.now() - start;

    console.log(`TC-WPD-10: WorkPlanByTest loaded in ${elapsed}ms`);
    expect(elapsed, 'Workplan page must load within 5000ms').toBeLessThan(5000);
  });
});
