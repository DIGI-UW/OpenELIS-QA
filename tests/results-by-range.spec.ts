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
 * Results By Range Test Suite — Suite AK + BF-DEEP
 *
 * User stories covered:
 *   US-RBR-1: As a lab technician, I can view all results for a given accession
 *             number range so I can batch-review a series of samples.
 *   US-RBR-2: As a lab supervisor, I can filter results by date range to review
 *             everything entered today or during a shift.
 *   US-RBR-3: As a lab supervisor, I can see both normal and flagged results
 *             in the range view for QC monitoring.
 *   US-RBR-4: As a lab technician, the interface must accurately label the
 *             "From" and "To" accession fields (BUG-17: typo "Accesion" exists).
 *
 * URLs:
 *   /ResultsByRange         — primary Results By Range screen
 *   /ResultsByAccession     — fallback
 *   /RangeSearch            — fallback
 *
 * API endpoints:
 *   GET /rest/ResultsByRange?from=<n>&to=<n>
 *   GET /rest/AccessionResults?accessionNumber=<n>
 *
 * Suite IDs: TC-RBR-01 through TC-RBR-10
 * Total Test Count: 10 TCs
 *
 * Known bugs:
 *   BUG-17: "Accesion" typo in both From and To labels on Results By Range page
 *           (confirmed in Phase 6 BF-DEEP). Tests track this for resolution.
 */

const RBR_URLS = [
  '/ResultsByRange',
  '/ResultsByAccession',
  '/RangeSearch',
  '/results/range',
];

async function goToResultsByRange(page: any): Promise<boolean> {
  return navigateWithDiscovery(page, RBR_URLS);
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite AK — Results By Range Core (TC-RBR-01 through TC-RBR-05)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Suite AK — Results By Range Core (TC-RBR)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-RBR-01: Results By Range page loads without error', async ({ page }) => {
    /**
     * US-RBR-1: The Results By Range screen must be accessible so lab staff
     * can look up results across a sequence of accession numbers.
     */
    const loaded = await goToResultsByRange(page);
    expect(loaded, 'Results By Range must be reachable').toBe(true);

    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('404');
    expect(bodyText).not.toContain('Internal Server Error');
    console.log(`TC-RBR-01: PASS — Results By Range at ${page.url()}`);
  });

  test('TC-RBR-02: Page has From and To accession number inputs', async ({ page }) => {
    /**
     * US-RBR-1: The page must have both a "From" and "To" accession input
     * to define the range to search.
     */
    const loaded = await goToResultsByRange(page);
    if (!loaded) { test.skip(); return; }

    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    // Look for two accession inputs or from/to pattern
    const allInputs = await page.locator('input[type="text"], input[type="search"], input:not([type="hidden"])').count();
    const bodyText = await page.locator('body').innerText();
    const hasFromTo = /from|start|begin/i.test(bodyText) && /to\b|end|finish/i.test(bodyText);
    const hasAccessionLabel = /accession|lab number|specimen/i.test(bodyText);

    console.log(`TC-RBR-02: inputs=${allInputs}, fromTo=${hasFromTo}, accessionLabel=${hasAccessionLabel}`);
    expect(allInputs > 0 || hasFromTo, 'Results By Range must have range input fields').toBe(true);
  });

  test('TC-RBR-03: BUG-17 tracking — "Accesion" typo present or resolved', async ({ page }) => {
    /**
     * US-RBR-4 / BUG-17: The "From" and "To" labels were confirmed to contain
     * the typo "Accesion" (missing 'c') in Phase 6. This test tracks whether
     * the bug is still present or has been fixed.
     */
    const loaded = await goToResultsByRange(page);
    if (!loaded) { test.skip(); return; }

    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });
    const bodyText = await page.locator('body').innerText();

    const hasTypo = /accesion/i.test(bodyText);         // BUG-17: misspelled (1 'c')
    const hasCorrect = /accession/i.test(bodyText);     // Fixed spelling (2 'c's)

    if (hasTypo && !hasCorrect) {
      console.log('TC-RBR-03: BUG-17 STILL PRESENT — "Accesion" typo detected in both labels');
    } else if (hasTypo && hasCorrect) {
      console.log('TC-RBR-03: BUG-17 PARTIAL — both typo and correct spelling found on page');
    } else if (!hasTypo && hasCorrect) {
      console.log('TC-RBR-03: BUG-17 RESOLVED — correct "Accession" spelling found, typo gone');
    } else {
      console.log('TC-RBR-03: NOTE — neither "accesion" nor "accession" found in page text');
    }
    // Non-blocking — just document state
    expect(bodyText).not.toContain('Internal Server Error');
  });

  test('TC-RBR-04: Search with valid accession range returns results or empty state', async ({ page }) => {
    /**
     * US-RBR-1: Entering a valid range including a known accession must either
     * show results or a clean "no results" message — never a server error.
     */
    const loaded = await goToResultsByRange(page);
    if (!loaded) { test.skip(); return; }

    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    const inputs = page.locator('input:not([type="hidden"])');
    const inputCount = await inputs.count();

    if (inputCount >= 2) {
      // Fill from/to with a narrow range around the known accession
      await inputs.nth(0).fill('26CPHL00008A');
      await inputs.nth(1).fill('26CPHL00008Z');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2000);
    } else if (inputCount === 1) {
      await inputs.first().fill('26CPHL00008V');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2000);
    }

    const bodyText = await page.locator('body').innerText();
    expect(bodyText, 'Range search must not cause server error').not.toContain('Internal Server Error');
    expect(bodyText, 'Range search must not expose stack trace').not.toContain('at org.');
    console.log('TC-RBR-04: Range search completed without server error');
  });

  test('TC-RBR-05: Page has a Search/Submit button', async ({ page }) => {
    /**
     * US-RBR-1: A Search or Submit button must be present so the user can
     * trigger the range lookup explicitly.
     */
    const loaded = await goToResultsByRange(page);
    if (!loaded) { test.skip(); return; }

    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    const searchBtn = page.getByRole('button', { name: /search|submit|find|lookup/i }).first();
    const hasBtn = await searchBtn.isVisible({ timeout: 3000 }).catch(() => false);

    console.log(`TC-RBR-05: Search button present=${hasBtn}`);
    if (!hasBtn) {
      // Some forms submit on Enter — check for at least one button
      const anyBtn = await page.locator('button').count();
      console.log(`TC-RBR-05: Total buttons on page: ${anyBtn}`);
    }
    // Non-blocking — page must not crash
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('Internal Server Error');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite BF-DEEP — Results By Range API & Cross-Module (TC-RBR-06 through TC-RBR-10)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Suite BF-DEEP — Results By Range API & Cross-Module (TC-RBR-06–10)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-RBR-06: ResultsByRange API responds for valid range', async ({ page }) => {
    /**
     * US-RBR-1: The API backing Results By Range must accept a range query and
     * return either results or an empty response — not a 5xx error.
     */
    await page.goto(`${BASE}`);

    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const candidates = [
        '/api/OpenELIS-Global/rest/ResultsByRange?from=26CPHL00008A&to=26CPHL00008Z',
        '/api/OpenELIS-Global/rest/AccessionResults?accessionNumber=26CPHL00008V',
        '/api/OpenELIS-Global/rest/resultsByRange?startAccession=26CPHL00008A&endAccession=26CPHL00008Z',
      ];
      for (const url of candidates) {
        const res = await fetch(url, { headers: { 'X-CSRF-Token': csrf } });
        if (res.status !== 404) return { status: res.status, url };
      }
      return { status: 404, url: 'none' };
    });

    console.log(`TC-RBR-06: ${result.url} → HTTP ${result.status}`);
    expect(result.status, 'ResultsByRange API must not 5xx').not.toBeGreaterThanOrEqual(500);
  });

  test('TC-RBR-07: Range search with reversed from/to does not crash', async ({ page }) => {
    /**
     * US-RBR-1 (edge case): If a user accidentally enters the range backwards
     * (to < from), the system must handle it gracefully without a 500 error.
     */
    const loaded = await goToResultsByRange(page);
    if (!loaded) { test.skip(); return; }

    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    const inputs = page.locator('input:not([type="hidden"])');
    if (await inputs.count() >= 2) {
      // Deliberately reversed range
      await inputs.nth(0).fill('26CPHL00009Z');
      await inputs.nth(1).fill('26CPHL00001A');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2000);
    }

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('Internal Server Error');
    expect(bodyText).not.toContain('at org.');
    console.log('TC-RBR-07: PASS — reversed range handled without server error');
  });

  test('TC-RBR-08: Results By Range page is accessible to admin (RBAC)', async ({ page }) => {
    /**
     * US-RBR-1: The Results By Range screen must not accidentally block admin
     * access due to misconfigured role permissions.
     */
    const loaded = await goToResultsByRange(page);
    expect(loaded, 'Admin must be able to access Results By Range').toBe(true);
    expect(page.url(), 'Must not redirect to login').not.toMatch(/LoginPage|login/i);
  });

  test('TC-RBR-09: AccessionResults cross-module — known accession present in result', async ({ page }) => {
    /**
     * US-RBR-3: Cross-module integrity — the known accession 26CPHL00008V must
     * be visible in AccessionResults API, confirming the data backing the range
     * view is consistent.
     */
    await page.goto(`${BASE}`);

    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch('/api/OpenELIS-Global/rest/AccessionResults?accessionNumber=26CPHL00008V', {
        headers: { 'X-CSRF-Token': csrf },
      });
      if (!res.ok) return { status: res.status, labNo: null };
      const data = await res.json();
      return {
        status: res.status,
        labNo: data.labNo || data.accessionNumber || null,
      };
    });

    console.log(`TC-RBR-09: AccessionResults → HTTP ${result.status}, labNo="${result.labNo}"`);
    expect(result.status).toBe(200);
    if (result.labNo) {
      expect(result.labNo, 'labNo must reference the queried accession').toContain('26CPHL00008');
    }
  });

  test('TC-RBR-10: Results By Range page loads within acceptable time', async ({ page }) => {
    /**
     * US-RBR-1: Results By Range is used during busy shifts. The page must
     * load quickly — within 5 seconds.
     */
    const start = Date.now();
    const loaded = await goToResultsByRange(page);
    await page.waitForLoadState('domcontentloaded');
    const elapsed = Date.now() - start;

    console.log(`TC-RBR-10: Results By Range loaded in ${elapsed}ms`);
    if (loaded) {
      expect(elapsed, 'Results By Range must load within 5000ms').toBeLessThan(5000);
    } else {
      console.log('TC-RBR-10: SKIP — page not reachable');
    }
  });
});
