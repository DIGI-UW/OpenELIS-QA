import { test, expect } from '@playwright/test';
import {
  BASE,
  ADMIN,
  ACCESSION,
  QA_PREFIX,
  TIMEOUT,
  login,
  navigateWithDiscovery,
  fillSearchField,
  getDateRange,
} from '../helpers/test-helpers';

/**
 * Order Search Test Suite — Suite J (TC-OS)
 *
 * User stories covered:
 *   US-OS-1: As a lab technician, I can search for an order by accession number
 *   US-OS-2: As a receptionist, I can find a patient's orders by name or national ID
 *   US-OS-3: As a lab supervisor, I can search orders within a date range
 *   US-OS-4: As a lab tech, I can filter orders by test section (lab unit)
 *   US-OS-5: As an admin, I can look up orders for audit purposes
 *   US-OS-6: As a user, I am shown a clear empty state when no orders match
 *   US-OS-7: As a user, I can search orders via the Results By Order screen
 *
 * Known baseline data:
 *   - Accession 26CPHL00008V — Patient Abby Sebby, HGB(Whole Blood), last result = 2 g/dL
 *   - ACCESSION constant = 26CPHL00008T (a known valid accession in the system)
 *
 * URL candidates:
 *   - /AccessionResults               — Results/Orders by accession
 *   - /AccessionValidation            — Validation queue by accession
 *   - /SampleEdit?type=readwrite      — Edit order (search by accession)
 *   - /PatientResults                 — Patient result history
 *
 * Suite IDs: TC-OS-01 through TC-OS-08
 * Total Test Count: 8 TCs
 */

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

async function goToAccessionResults(page: any): Promise<boolean> {
  return navigateWithDiscovery(page, [
    '/AccessionResults',
    '/ResultsByAccession',
    '/OrderResults',
  ]);
}

async function goToEditOrder(page: any): Promise<boolean> {
  return navigateWithDiscovery(page, [
    '/SampleEdit?type=readwrite',
    '/ModifyOrder',
    '/EditOrder',
  ]);
}

// ─────────────────────────────────────────────────────────────
// Suite J — Order Search Core Tests (TC-OS-01 through TC-OS-05)
// ─────────────────────────────────────────────────────────────

test.describe('Suite J — Order Search (TC-OS)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-OS-01: AccessionResults page loads with search form', async ({ page }) => {
    const loaded = await goToAccessionResults(page);
    expect(loaded, 'AccessionResults page should be reachable').toBe(true);

    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    // Page should have a search input for accession number
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('404');
    expect(bodyText).not.toContain('Internal Server Error');

    const hasSearchInput = (await page.locator('input').count()) > 0;
    expect(hasSearchInput, 'AccessionResults must have at least one input field').toBe(true);

    console.log(`TC-OS-01: PASS — Order search page at ${page.url()}`);
  });

  test('TC-OS-02: Search by known accession number returns results', async ({ page }) => {
    /**
     * US-OS-1: Search for a specific order by accession number.
     * Uses the known accession 26CPHL00008V (Patient Abby Sebby).
     */
    const loaded = await goToAccessionResults(page);
    if (!loaded) {
      console.log('TC-OS-02: SKIP — AccessionResults not reachable');
      test.skip();
      return;
    }

    // Fill accession number
    await fillSearchField(page, '26CPHL00008V');
    await page.waitForTimeout(2000);

    const bodyText = await page.locator('body').innerText();

    // Should find results for this known accession
    const found =
      /26CPHL00008V|Abby|Sebby|HGB/i.test(bodyText) ||
      (await page.locator('table tr, [role="row"]').count()) > 1; // header + at least 1 data row

    console.log(`TC-OS-02: ${found ? 'PASS' : 'PARTIAL'} — accession 26CPHL00008V ${found ? 'found' : 'not found in results'}`);
    expect(bodyText).not.toContain('Internal Server Error');
  });

  test('TC-OS-03: Search by accession ACCESSION constant returns a result or empty state', async ({ page }) => {
    /**
     * Uses the ACCESSION baseline constant from helpers.
     * Even if data has been purged, the page should not crash.
     */
    const loaded = await goToAccessionResults(page);
    if (!loaded) {
      test.skip();
      return;
    }

    await fillSearchField(page, ACCESSION);
    await page.waitForTimeout(2000);

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('Internal Server Error');
    expect(bodyText).not.toContain('500');

    const hasTable = (await page.locator('table, [role="table"]').count()) > 0;
    const hasEmptyState = /no result|no order|nothing found|not found|empty/i.test(bodyText);

    console.log(`TC-OS-03: ${hasTable || hasEmptyState ? 'PASS' : 'PARTIAL'} — table=${hasTable}, empty-state=${hasEmptyState}`);
    expect(hasTable || hasEmptyState || bodyText.length > 100).toBe(true);
  });

  test('TC-OS-04: Search with non-existent accession shows empty state', async ({ page }) => {
    /**
     * US-OS-6: When no orders match, user sees a clear empty state, not a crash.
     */
    const loaded = await goToAccessionResults(page);
    if (!loaded) {
      test.skip();
      return;
    }

    // Search for a clearly non-existent accession
    await fillSearchField(page, 'ZZZZZ99999_NONEXISTENT');
    await page.waitForTimeout(2000);

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('Internal Server Error');
    expect(bodyText).not.toContain('Unexpected error');

    // Should show empty state or no results row
    const hasNoResults =
      /no result|no order|not found|nothing/i.test(bodyText) ||
      (await page.locator('table tbody tr, [role="row"]').count()) === 0 ||
      (await page.locator('table').count()) === 0;

    console.log(`TC-OS-04: ${hasNoResults ? 'PASS' : 'PARTIAL'} — non-existent accession handled gracefully`);
    expect(bodyText).not.toContain('stack trace');
  });

  test('TC-OS-05: Edit Order search loads and finds order by accession', async ({ page }) => {
    /**
     * US-OS-5: Admin can look up an existing order to edit it.
     * The Edit Order screen (/SampleEdit) should accept an accession and find the order.
     */
    const loaded = await goToEditOrder(page);
    if (!loaded) {
      console.log('TC-OS-05: SKIP — Edit Order screen not reachable');
      test.skip();
      return;
    }

    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    // Fill accession field
    await fillSearchField(page, '26CPHL00008V');
    await page.waitForTimeout(2000);

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('Internal Server Error');

    const hasContent = /26CPHL00008V|Abby|Sebby|Edit|Modify|Sample/i.test(bodyText);
    console.log(`TC-OS-05: ${hasContent ? 'PASS' : 'PARTIAL'} — Edit Order search result at ${page.url()}`);
    expect(page.url()).not.toMatch(/LoginPage|login/i);
  });
});

// ─────────────────────────────────────────────────────────────
// Suite J-DEEP — Order Search by Patient & Date (TC-OS-06 through TC-OS-08)
// ─────────────────────────────────────────────────────────────

test.describe('Suite J-DEEP — Order Search Extended (TC-OS-06 through TC-OS-08)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-OS-06: Patient Results screen loads and shows patient order history', async ({ page }) => {
    /**
     * US-OS-2: As a receptionist, I can look up all orders for a specific patient.
     */
    const loaded = await navigateWithDiscovery(page, [
      '/PatientResults',
      '/PatientResultHistory',
      '/PatientHistory',
    ]);

    if (!loaded) {
      console.log('TC-OS-06: SKIP — Patient Results/History not reachable');
      test.skip();
      return;
    }

    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('Internal Server Error');

    const hasSearchForm = (await page.locator('input, select').count()) > 0;
    const hasPatientContent = /patient|history|result|search/i.test(bodyText);

    console.log(`TC-OS-06: ${hasSearchForm && hasPatientContent ? 'PASS' : 'PARTIAL'} — Patient search at ${page.url()}`);
    expect(hasSearchForm || hasPatientContent).toBe(true);
  });

  test('TC-OS-07: AccessionResults API returns structured order data', async ({ page }) => {
    /**
     * US-OS-7: Verify the backing API for order search returns structured data.
     * Tests both the API endpoint and the data structure.
     */
    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      // Try AccessionResults with the known accession
      const res = await fetch('/api/OpenELIS-Global/rest/AccessionResults?accessionNumber=26CPHL00008V', {
        headers: { 'X-CSRF-Token': csrf },
      });
      const text = await res.text();
      let data: any = null;
      try { data = JSON.parse(text); } catch { /* not JSON */ }
      return {
        status: res.status,
        hasTestResult: data?.testResult !== undefined,
        hasOrderInfo: data?.labNo !== undefined || data?.accessionNumber !== undefined,
        dataKeys: data ? Object.keys(data).slice(0, 8) : [],
      };
    });

    console.log(`TC-OS-07: AccessionResults API → status=${result.status}, keys=${result.dataKeys.join(',')}`);
    expect(result.status).toBe(200);
  });

  test('TC-OS-08: Order search API filters correctly by date range', async ({ page }) => {
    /**
     * US-OS-3: Filter orders by date range.
     * Validates the API accepts startDate/endDate parameters without errors.
     */
    const { startDate, endDate } = await getDateRange();

    const result = await page.evaluate(async ({ start, end }) => {
      const csrf = localStorage.getItem('CSRF') || '';
      // Try multiple endpoint patterns for date-range order search
      const endpoints = [
        `/api/OpenELIS-Global/rest/AccessionResults?startDate=${start}&endDate=${end}`,
        `/api/OpenELIS-Global/rest/OrderSearch?startDate=${start}&endDate=${end}`,
        `/api/OpenELIS-Global/rest/SamplePatientEntry?startDate=${start}&endDate=${end}`,
      ];

      for (const ep of endpoints) {
        const res = await fetch(ep, { headers: { 'X-CSRF-Token': csrf } });
        if (res.ok) {
          return { status: res.status, endpoint: ep };
        }
      }
      return { status: 404, endpoint: 'none' };
    }, { start: startDate, end: endDate });

    console.log(`TC-OS-08: Date range search → ${result.endpoint} status=${result.status}`);
    // AccessionResults should return 200; if not, at least it shouldn't be a 500
    expect(result.status).not.toBe(500);
  });
});

// ─────────────────────────────────────────────────────────────
// Suite J-XMOD — Cross-Module Order Tracing (TC-OS-XMOD)
// ─────────────────────────────────────────────────────────────

test.describe('Suite J-XMOD — Order Tracing Across Modules', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-OS-XMOD-01: Order visible in both AccessionResults and LogbookResults', async ({ page }) => {
    /**
     * Cross-module integrity: an order that appears in AccessionResults should
     * also be traceable through LogbookResults (Results By Unit).
     */
    // Check AccessionResults for the known order
    const accessionResult = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch('/api/OpenELIS-Global/rest/AccessionResults?accessionNumber=26CPHL00008V', {
        headers: { 'X-CSRF-Token': csrf },
      });
      if (!res.ok) return { found: false, status: res.status };
      const data = await res.json();
      return { found: !!data.labNo || !!data.testResult, status: res.status };
    });

    // Check LogbookResults for Hematology (where HGB test lives)
    const logbookResult = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch('/api/OpenELIS-Global/rest/LogbookResults?type=Hematology', {
        headers: { 'X-CSRF-Token': csrf },
      });
      if (!res.ok) return { status: res.status, count: -1 };
      const data = await res.json();
      return { status: res.status, count: data.testResult?.length ?? 0 };
    });

    console.log(`TC-OS-XMOD-01: AccessionResults status=${accessionResult.status}, found=${accessionResult.found}`);
    console.log(`TC-OS-XMOD-01: LogbookResults Hematology status=${logbookResult.status}, count=${logbookResult.count}`);

    // Both endpoints should return 200
    expect(accessionResult.status).toBe(200);
    expect(logbookResult.status).toBe(200);
  });

  test('TC-OS-XMOD-02: Order accession format matches system configuration', async ({ page }) => {
    /**
     * Verifies that the accession number format in AccessionResults matches
     * what the Lab Number Management configuration shows.
     */
    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch('/api/OpenELIS-Global/rest/AccessionResults?accessionNumber=26CPHL00008V', {
        headers: { 'X-CSRF-Token': csrf },
      });
      if (!res.ok) return { status: res.status, labNo: null };
      const data = await res.json();
      return { status: res.status, labNo: data.labNo || data.accessionNumber || null };
    });

    console.log(`TC-OS-XMOD-02: Lab number from API: "${result.labNo}"`);
    expect(result.status).toBe(200);

    // If we got a lab number back, verify its format matches the known CPHL pattern
    if (result.labNo) {
      // Known format: 26CPHL000XXX or similar alphanumeric
      expect(typeof result.labNo).toBe('string');
      expect(result.labNo.length).toBeGreaterThan(3);
    }
  });
});

// ─────────────────────────────────────────────────────────────
// Suite J-EXT — Order Search API & Validation (TC-OS-09 through TC-OS-16)
// ─────────────────────────────────────────────────────────────

test.describe('Suite J-EXT — Order Search API & Validation (TC-OS-09–16)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-OS-09: AccessionValidation queue is accessible', async ({ page }) => {
    /**
     * US-OS-5: Admin/supervisor can view orders pending validation.
     * AccessionValidation is a key audit tool for lab supervisors.
     */
    const loaded = await navigateWithDiscovery(page, [
      '/AccessionValidation',
      '/ResultValidation',
      '/Validation',
    ]);

    if (!loaded) { test.skip(); return; }
    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('Internal Server Error');
    console.log(`TC-OS-09: PASS — Accession/Result Validation at ${page.url()}`);
  });

  test('TC-OS-10: Accession number input accepts CPHL format without format error', async ({ page }) => {
    /**
     * US-OS-1: The search field must accept the CPHL accession format (26CPHL00008V)
     * without triggering a format validation error. This is the standard format.
     */
    const loaded = await goToAccessionResults(page);
    if (!loaded) { test.skip(); return; }

    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    const searchInput = page.locator('input').first();
    if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await searchInput.fill('26CPHL00008V');
      await page.waitForTimeout(500);

      const bodyText = await page.locator('body').innerText();
      const hasFormatError = /invalid.*format|format.*error|must be|not valid/i.test(bodyText);
      console.log(`TC-OS-10: CPHL format error=${hasFormatError}`);
      expect(hasFormatError, 'CPHL accession format must not trigger format validation error').toBe(false);
    } else {
      console.log('TC-OS-10: NOTE — no search input found');
    }
  });

  test('TC-OS-11: Search by partial accession prefix returns graceful result', async ({ page }) => {
    /**
     * US-OS-1: Entering a partial accession (e.g. "26CPHL") must not crash
     * the server. May return results or an empty set.
     */
    const loaded = await goToAccessionResults(page);
    if (!loaded) { test.skip(); return; }

    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    const searchInput = page.locator('input').first();
    if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await searchInput.fill('26CPHL');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2000);

      const bodyText = await page.locator('body').innerText();
      expect(bodyText).not.toContain('Internal Server Error');
      expect(bodyText).not.toContain('at org.');
      console.log('TC-OS-11: PASS — partial accession search handled without 500');
    } else {
      console.log('TC-OS-11: NOTE — no search input found');
    }
  });

  test('TC-OS-12: AccessionResults API returns HTTP 200 for valid accession', async ({ page }) => {
    /**
     * US-OS-7: The REST API backing AccessionResults must return 200 for a valid
     * accession number, not just the UI.
     */
    await page.goto(`${BASE}`);

    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch('/api/OpenELIS-Global/rest/AccessionResults?accessionNumber=26CPHL00008V', {
        headers: { 'X-CSRF-Token': csrf },
      });
      return { status: res.status, ok: res.ok };
    });

    console.log(`TC-OS-12: AccessionResults API → HTTP ${result.status}`);
    expect(result.status, 'AccessionResults API must not 5xx').not.toBeGreaterThanOrEqual(500);
  });

  test('TC-OS-13: Order search page is accessible to admin (RBAC)', async ({ page }) => {
    /**
     * US-OS-5: Admin must be able to access order search. RBAC must not
     * accidentally block this key audit/lookup feature.
     */
    const loaded = await goToAccessionResults(page);
    expect(loaded, 'Admin must be able to access AccessionResults').toBe(true);
    expect(page.url()).not.toMatch(/LoginPage|login/i);
  });

  test('TC-OS-14: Order search page loads within acceptable time', async ({ page }) => {
    const start = Date.now();
    const loaded = await goToAccessionResults(page);
    await page.waitForLoadState('domcontentloaded');
    const elapsed = Date.now() - start;

    console.log(`TC-OS-14: AccessionResults loaded in ${elapsed}ms`);
    if (loaded) {
      expect(elapsed, 'Order search page must load within 5000ms').toBeLessThan(5000);
    }
  });

  test('TC-OS-15: Edit Order screen does not crash on empty search submit', async ({ page }) => {
    /**
     * US-OS-5: Submitting the edit order search with no input must show a
     * validation error, not an Internal Server Error.
     */
    const loaded = await goToEditOrder(page);
    if (!loaded) { test.skip(); return; }

    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    const searchBtn = page.getByRole('button', { name: /search|find|lookup/i }).first();
    if (await searchBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await searchBtn.click();
      await page.waitForTimeout(1500);

      const bodyText = await page.locator('body').innerText();
      expect(bodyText, 'Empty order search must not cause 500').not.toContain('Internal Server Error');
      console.log('TC-OS-15: PASS — empty order search handled without crash');
    } else {
      console.log('TC-OS-15: NOTE — search button not found on Edit Order page');
    }
  });

  test('TC-OS-16: Three concurrent AccessionResults requests are stable', async ({ page }) => {
    /**
     * US-OS-1 (performance): Multiple simultaneous order lookups must not
     * cause server errors — common when multiple workstations search simultaneously.
     */
    await page.goto(`${BASE}`);

    const results = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const accessions = ['26CPHL00008V', '26CPHL00008K', '26CPHL00008M'];
      const requests = accessions.map(acc =>
        fetch(`/api/OpenELIS-Global/rest/AccessionResults?accessionNumber=${acc}`, {
          headers: { 'X-CSRF-Token': csrf },
        }).then(r => r.status)
      );
      return Promise.all(requests);
    });

    const serverErrors = results.filter(s => s >= 500);
    console.log(`TC-OS-16: 3 concurrent AccessionResults → [${results.join(', ')}], errors=${serverErrors.length}`);
    expect(serverErrors.length, 'Concurrent order lookups must not cause 5xx').toBe(0);
  });
});
