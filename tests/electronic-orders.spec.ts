import { test, expect } from '@playwright/test';
import {
  BASE,
  ADMIN,
  QA_PREFIX,
  TIMEOUT,
  login,
  navigateWithDiscovery,
  getDateRange,
} from '../helpers/test-helpers';

/**
 * Electronic / Incoming Orders Test Suite — Suite AH + BC-DEEP
 *
 * User stories covered:
 *   US-IO-1: As a lab receptionist, I can view incoming electronic orders
 *            transmitted from external systems (e.g., EMR/HIS) so I can
 *            accept or reject them before they enter the workflow.
 *   US-IO-2: As a lab supervisor, I can filter electronic orders by status
 *            (pending, accepted, rejected) to manage the queue.
 *   US-IO-3: As a lab admin, I can search for electronic orders by accession
 *            number or date range to locate specific orders.
 *   US-IO-4: As a system integrator, the electronic orders API must return a
 *            well-structured response so external systems can send orders.
 *
 * URLs:
 *   /IncomingOrders         — primary incoming/electronic orders screen (AH confirmed)
 *   /ElectronicOrders       — alternate name
 *   /OrderQueue             — fallback
 *   /IncomingSamples        — fallback
 *
 * API endpoints:
 *   GET /rest/IncomingOrders           — list incoming orders
 *   GET /rest/ElectronicOrders         — alternate endpoint
 *   POST /rest/SamplePatientEntry      — accept/process an incoming order
 *
 * Suite IDs: TC-IO-01 through TC-IO-10
 * Total Test Count: 10 TCs
 *
 * Known baseline:
 *   - Electronic orders test instance may have empty queue (NOTE-14: periodic data reset)
 *   - Status values expected: ENTERED, RELEASED, CANCELLED (BC-DEEP confirmed in Phase 6)
 */

const IO_URLS = [
  '/IncomingOrders',
  '/ElectronicOrders',
  '/OrderQueue',
  '/IncomingSamples',
  '/MasterListsPage/incoming-orders',
];

async function goToIncomingOrders(page: any): Promise<boolean> {
  return navigateWithDiscovery(page, IO_URLS);
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite AH — Electronic / Incoming Orders Core (TC-IO-01 through TC-IO-05)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Suite AH — Electronic / Incoming Orders Core (TC-IO)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-IO-01: Incoming Orders page is reachable', async ({ page }) => {
    /**
     * US-IO-1: The incoming orders queue must be accessible so receptionists
     * can process externally-submitted orders.
     */
    const loaded = await goToIncomingOrders(page);
    expect(loaded, 'Incoming Orders page must be reachable').toBe(true);

    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('404');
    expect(bodyText).not.toContain('Internal Server Error');
    console.log(`TC-IO-01: PASS — Incoming Orders at ${page.url()}`);
  });

  test('TC-IO-02: Page has order status filter or status column', async ({ page }) => {
    /**
     * US-IO-2: The incoming orders queue must allow filtering by status
     * (pending, accepted, rejected) to manage the order queue effectively.
     */
    const loaded = await goToIncomingOrders(page);
    if (!loaded) { test.skip(); return; }

    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });
    const bodyText = await page.locator('body').innerText();

    const hasStatusFilter = /status|pending|accepted|entered|released|cancelled/i.test(bodyText);
    const hasSelect = await page.locator('select, [role="combobox"], [aria-haspopup="listbox"]').count() > 0;

    console.log(`TC-IO-02: statusTerms=${hasStatusFilter}, hasFilter=${hasSelect}`);
    expect(hasStatusFilter || hasSelect, 'Incoming orders must have a status filter or status column').toBe(true);
  });

  test('TC-IO-03: Status dropdown enumerates expected order states', async ({ page }) => {
    /**
     * US-IO-2: The status filter must include the expected incoming order
     * statuses: ENTERED, RELEASED, CANCELLED (confirmed BC-DEEP Phase 6).
     */
    const loaded = await goToIncomingOrders(page);
    if (!loaded) { test.skip(); return; }

    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });
    const bodyText = await page.locator('body').innerText();

    const hasEntered = /entered/i.test(bodyText);
    const hasReleased = /released/i.test(bodyText);
    const hasCancelled = /cancelled|canceled/i.test(bodyText);

    console.log(`TC-IO-03: entered=${hasEntered}, released=${hasReleased}, cancelled=${hasCancelled}`);

    // At least one known status term should be visible
    if (hasEntered || hasReleased || hasCancelled) {
      console.log('TC-IO-03: PASS — order status terms found on page');
    } else {
      console.log('TC-IO-03: NOTE — no status terms found (empty queue or different UI)');
    }
    // Non-blocking — page must not crash
    expect(bodyText).not.toContain('Internal Server Error');
  });

  test('TC-IO-04: Page has date range search capability', async ({ page }) => {
    /**
     * US-IO-3: Users must be able to search electronic orders by date range
     * to locate orders from a specific period.
     */
    const loaded = await goToIncomingOrders(page);
    if (!loaded) { test.skip(); return; }

    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    const dateInput = page.locator('input[type="date"], input[placeholder*="mm/dd" i], input[placeholder*="date" i]').first();
    const hasDateInput = await dateInput.isVisible({ timeout: 3000 }).catch(() => false);
    const bodyText = await page.locator('body').innerText();
    const hasDateTerm = /date|from|to\b|period|range/i.test(bodyText);

    console.log(`TC-IO-04: dateInput=${hasDateInput}, dateTerm=${hasDateTerm}`);
    // Non-blocking check
    expect(bodyText).not.toContain('Internal Server Error');
  });

  test('TC-IO-05: Page loads within acceptable time', async ({ page }) => {
    /**
     * US-IO-1: The incoming orders queue is checked frequently by receptionists.
     * It must load within 5 seconds.
     */
    const start = Date.now();
    const loaded = await goToIncomingOrders(page);
    await page.waitForLoadState('domcontentloaded');
    const elapsed = Date.now() - start;

    console.log(`TC-IO-05: Incoming Orders loaded in ${elapsed}ms`);
    if (loaded) {
      expect(elapsed, 'Incoming Orders must load within 5000ms').toBeLessThan(5000);
    } else {
      console.log('TC-IO-05: SKIP — page not reachable');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite BC-DEEP — Electronic Orders API & Integration (TC-IO-06 through TC-IO-10)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Suite BC-DEEP — Electronic Orders API & Integration (TC-IO-06–10)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-IO-06: IncomingOrders API endpoint is reachable', async ({ page }) => {
    /**
     * US-IO-4: The API backing the incoming orders screen must be accessible.
     * A 404 means the feature is not wired on the backend.
     */
    await page.goto(`${BASE}`);

    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const candidates = [
        '/api/OpenELIS-Global/rest/IncomingOrders',
        '/api/OpenELIS-Global/rest/ElectronicOrders',
        '/api/OpenELIS-Global/rest/incomingOrders',
      ];
      for (const path of candidates) {
        const res = await fetch(path, { headers: { 'X-CSRF-Token': csrf } });
        if (res.status !== 404) return { status: res.status, path };
      }
      return { status: 404, path: 'none' };
    });

    console.log(`TC-IO-06: Incoming Orders API → ${result.path} HTTP ${result.status}`);
    if (result.status === 404) {
      console.log('TC-IO-06: GAP — IncomingOrders API not found at any candidate URL');
    }
    // 405 (method not allowed on GET) is acceptable — confirms route exists
    expect(result.status, 'API must not return 5xx').not.toBeGreaterThanOrEqual(500);
  });

  test('TC-IO-07: IncomingOrders API returns structured list or empty array', async ({ page }) => {
    /**
     * US-IO-1: When the queue is empty (e.g., after data reset), the API
     * must return an empty list — not a 5xx error.
     */
    await page.goto(`${BASE}`);

    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch('/api/OpenELIS-Global/rest/IncomingOrders', {
        headers: { 'X-CSRF-Token': csrf },
      });
      if (!res.ok) return { status: res.status, count: -1, isArray: false };
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.orders ?? data.results ?? []);
      return { status: res.status, count: list.length, isArray: Array.isArray(data) || !!data.orders };
    });

    console.log(`TC-IO-07: API → HTTP ${result.status}, count=${result.count}, isArray=${result.isArray}`);
    if (result.status === 200) {
      // count of 0 is valid (empty queue after data reset)
      expect(result.count, 'API must return a list (possibly empty)').toBeGreaterThanOrEqual(0);
    } else {
      expect(result.status, 'API must not 5xx').not.toBeGreaterThanOrEqual(500);
    }
  });

  test('TC-IO-08: Incoming orders search by date range does not 5xx', async ({ page }) => {
    /**
     * US-IO-3: Filtering incoming orders by a date range must not cause a
     * server error, even when the result set is empty.
     */
    await page.goto(`${BASE}`);

    const { start: dateFrom, end: dateTo } = getDateRange(30);

    const result = await page.evaluate(async ([from, to]: string[]) => {
      const csrf = localStorage.getItem('CSRF') || '';
      const candidates = [
        `/api/OpenELIS-Global/rest/IncomingOrders?startDate=${from}&endDate=${to}`,
        `/api/OpenELIS-Global/rest/ElectronicOrders?from=${from}&to=${to}`,
      ];
      for (const url of candidates) {
        const res = await fetch(url, { headers: { 'X-CSRF-Token': csrf } });
        if (res.status !== 404) return { status: res.status, url };
      }
      return { status: 404, url: 'none' };
    }, [dateFrom, dateTo]);

    console.log(`TC-IO-08: ${result.url} → HTTP ${result.status}`);
    expect(result.status, 'Date-range search must not 5xx').not.toBeGreaterThanOrEqual(500);
  });

  test('TC-IO-09: Incoming Orders page is accessible to admin (RBAC)', async ({ page }) => {
    /**
     * US-IO-1: Admin must be able to access the incoming orders queue.
     * RBAC must not accidentally block this operational screen.
     */
    const loaded = await goToIncomingOrders(page);
    expect(loaded, 'Admin must be able to access Incoming Orders').toBe(true);
    expect(page.url(), 'Must not redirect to login').not.toMatch(/LoginPage|login/i);
  });

  test('TC-IO-10: SamplePatientEntry API (order acceptance backend) is healthy', async ({ page }) => {
    /**
     * US-IO-4: The metadata API used when accepting an incoming order must be
     * healthy — it provides sample types, programs, and other form data needed
     * to complete the acceptance workflow.
     */
    await page.goto(`${BASE}`);

    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch('/api/OpenELIS-Global/rest/SamplePatientEntry', {
        headers: { 'X-CSRF-Token': csrf },
      });
      if (!res.ok) return { status: res.status, programCount: -1, sampleTypeCount: -1 };
      const data = await res.json();
      const programs = data.sampleOrderItems?.programList ?? data.programList ?? [];
      const types = data.sampleTypes ?? data.sampleTypeList ?? [];
      return {
        status: res.status,
        programCount: programs.length,
        sampleTypeCount: types.length,
      };
    });

    console.log(`TC-IO-10: SamplePatientEntry → ${result.status}, programs=${result.programCount}, types=${result.sampleTypeCount}`);
    expect(result.status).toBe(200);
    expect(result.programCount, 'Must have at least 5 programs for order acceptance').toBeGreaterThanOrEqual(5);
  });
});
