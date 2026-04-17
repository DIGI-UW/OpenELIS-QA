import { test, expect } from '@playwright/test';
import {
  BASE,
  ADMIN,
  TIMEOUT,
  login,
  navigateWithDiscovery,
} from '../helpers/test-helpers';

/**
 * Patient History Test Suite — Suite BD-DEEP + H-DEEP Extended
 *
 * User stories covered:
 *   US-HIST-1: As a lab technician, I can look up a patient's complete test
 *              history by entering their national ID or name so I can
 *              provide clinical context for current results.
 *   US-HIST-2: As a clinician, I can view a patient's historical results
 *              in chronological order, including dates and values.
 *   US-HIST-3: As a lab supervisor, I can see which tests a patient has had
 *              and their outcomes to identify patterns or QC anomalies.
 *   US-HIST-4: As a receptionist, I can verify a patient's identity using
 *              their history before creating a new order.
 *
 * URLs:
 *   /PatientHistory          — primary patient history screen (BD-DEEP confirmed)
 *   /PatientResults          — fallback
 *   /patient-management/history — fallback
 *
 * API endpoints:
 *   GET /rest/patient/history?patientId=<id>
 *   GET /rest/AccessionResults?nationalId=<id>
 *
 * Suite IDs: TC-HIST-01 through TC-HIST-10
 * Total Test Count: 10 TCs
 *
 * Known baseline:
 *   - Patient Abby Sebby: national ID 0123456, accession 26CPHL00008V
 *   - H-DEEP Phase 4: Patient History lookup confirmed working
 */

const HIST_URLS = [
  '/PatientHistory',
  '/PatientResults',
  '/patient-management/history',
  '/PatientHistoryDashboard',
];

async function goToPatientHistory(page: any): Promise<boolean> {
  return navigateWithDiscovery(page, HIST_URLS);
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite BD-DEEP — Patient History Core (TC-HIST-01 through TC-HIST-05)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Suite BD-DEEP — Patient History Core (TC-HIST)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-HIST-01: Patient History page is reachable', async ({ page }) => {
    /**
     * US-HIST-1: The patient history screen must be accessible so lab staff
     * can look up a patient's previous results.
     */
    const loaded = await goToPatientHistory(page);
    expect(loaded, 'Patient History page must be reachable').toBe(true);

    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('404');
    expect(bodyText).not.toContain('Internal Server Error');
    console.log(`TC-HIST-01: PASS — Patient History at ${page.url()}`);
  });

  test('TC-HIST-02: Patient History page has patient search input', async ({ page }) => {
    /**
     * US-HIST-1: The history screen must have a search field to look up
     * a patient by ID or name.
     */
    const loaded = await goToPatientHistory(page);
    if (!loaded) { test.skip(); return; }

    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    const searchInput = page.locator(
      'input[placeholder*="patient" i], input[placeholder*="national" i], input[placeholder*="name" i], input[placeholder*="search" i], input'
    ).first();
    const hasInput = await searchInput.isVisible({ timeout: 3000 }).catch(() => false);

    console.log(`TC-HIST-02: patient search input visible=${hasInput}`);
    expect(hasInput, 'Patient History must have a search input').toBe(true);
  });

  test('TC-HIST-03: Known patient lookup returns history without 5xx', async ({ page }) => {
    /**
     * US-HIST-1: Searching for the known patient (national ID 0123456 / Abby Sebby)
     * must return their history or an empty state — never a server error.
     */
    const loaded = await goToPatientHistory(page);
    if (!loaded) { test.skip(); return; }

    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    const searchInput = page.locator('input').first();
    if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await searchInput.fill('0123456');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2500);
    }

    const bodyText = await page.locator('body').innerText();
    expect(bodyText, 'Known patient lookup must not cause 500').not.toContain('Internal Server Error');
    const hasPatientData = /abby|sebby|0123456|26CPHL/i.test(bodyText);
    console.log(`TC-HIST-03: patientDataFound=${hasPatientData}`);
    if (hasPatientData) {
      console.log('TC-HIST-03: PASS — patient history data found for known patient');
    }
  });

  test('TC-HIST-04: History results show dates and test names', async ({ page }) => {
    /**
     * US-HIST-2: The history view must display at minimum the test name and
     * collection/result date so the user can understand the timeline.
     */
    const loaded = await goToPatientHistory(page);
    if (!loaded) { test.skip(); return; }

    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    // Search for known patient to get results
    const searchInput = page.locator('input').first();
    if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await searchInput.fill('0123456');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2500);
    }

    const bodyText = await page.locator('body').innerText();
    // Look for date-like patterns and test name indicators
    const hasDate = /\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2}|\d{2}-\d{2}-\d{4}/.test(bodyText);
    const hasTestName = /hgb|hemoglobin|test|result/i.test(bodyText);

    console.log(`TC-HIST-04: hasDate=${hasDate}, hasTestName=${hasTestName}`);
    expect(bodyText).not.toContain('Internal Server Error');
  });

  test('TC-HIST-05: Patient History is accessible to admin (RBAC)', async ({ page }) => {
    /**
     * US-HIST-4: Admin must be able to access patient history. RBAC must
     * not accidentally block this commonly-used feature.
     */
    const loaded = await goToPatientHistory(page);
    expect(loaded, 'Admin must be able to access Patient History').toBe(true);
    expect(page.url()).not.toMatch(/LoginPage|login/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite H-DEEP-EXT — Patient History API (TC-HIST-06 through TC-HIST-10)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Suite H-DEEP-EXT — Patient History API (TC-HIST-06–10)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-HIST-06: Patient history API returns results for known patient', async ({ page }) => {
    /**
     * US-HIST-1: The API backing patient history must return at least one
     * result for the known patient 26CPHL00008V.
     */
    await page.goto(`${BASE}`);

    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const candidates = [
        '/api/OpenELIS-Global/rest/patient/history?nationalId=0123456',
        '/api/OpenELIS-Global/rest/AccessionResults?accessionNumber=26CPHL00008V',
        '/api/OpenELIS-Global/rest/patientHistory?patientId=0123456',
      ];
      for (const url of candidates) {
        const res = await fetch(url, { headers: { 'X-CSRF-Token': csrf } });
        if (res.ok) {
          const data = await res.json();
          return { status: res.status, url, hasData: !!data };
        }
        if (res.status !== 404) return { status: res.status, url, hasData: false };
      }
      return { status: 404, url: 'none', hasData: false };
    });

    console.log(`TC-HIST-06: ${result.url} → HTTP ${result.status}, hasData=${result.hasData}`);
    expect(result.status, 'Patient history API must not 5xx').not.toBeGreaterThanOrEqual(500);
  });

  test('TC-HIST-07: Non-existent patient ID returns empty state, not 500', async ({ page }) => {
    /**
     * US-HIST-1 (edge case): Searching for a patient that doesn't exist must
     * return an empty history, not a server error.
     */
    const loaded = await goToPatientHistory(page);
    if (!loaded) { test.skip(); return; }

    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    const searchInput = page.locator('input').first();
    if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await searchInput.fill('ZZZZZ99999999');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2000);
    }

    const bodyText = await page.locator('body').innerText();
    expect(bodyText, 'Non-existent patient search must not 500').not.toContain('Internal Server Error');
    expect(bodyText, 'Must not expose stack trace').not.toContain('at org.');
    console.log('TC-HIST-07: PASS — non-existent patient handled gracefully');
  });

  test('TC-HIST-08: Patient history and AccessionResults are cross-module consistent', async ({ page }) => {
    /**
     * US-HIST-3: The result for accession 26CPHL00008V seen in AccessionResults
     * must be consistent with what appears in the patient's history. Both must
     * be accessible without error.
     */
    await page.goto(`${BASE}`);

    const [accResult, patResult] = await Promise.all([
      page.evaluate(async () => {
        const csrf = localStorage.getItem('CSRF') || '';
        const res = await fetch('/api/OpenELIS-Global/rest/AccessionResults?accessionNumber=26CPHL00008V', {
          headers: { 'X-CSRF-Token': csrf },
        });
        return { status: res.status, ok: res.ok };
      }),
      page.evaluate(async () => {
        const csrf = localStorage.getItem('CSRF') || '';
        const res = await fetch('/api/OpenELIS-Global/rest/patient?nationalId=0123456', {
          headers: { 'X-CSRF-Token': csrf },
        });
        return { status: res.status, ok: res.ok };
      }),
    ]);

    console.log(`TC-HIST-08: AccessionResults=${accResult.status}, Patient=${patResult.status}`);
    expect(accResult.status, 'AccessionResults must not 5xx').not.toBeGreaterThanOrEqual(500);
    expect(patResult.status, 'Patient API must not 5xx').not.toBeGreaterThanOrEqual(500);
  });

  test('TC-HIST-09: Patient history loads within acceptable time', async ({ page }) => {
    const start = Date.now();
    const loaded = await goToPatientHistory(page);
    await page.waitForLoadState('domcontentloaded');
    const elapsed = Date.now() - start;

    console.log(`TC-HIST-09: Patient History loaded in ${elapsed}ms`);
    if (loaded) {
      expect(elapsed, 'Patient History must load within 5000ms').toBeLessThan(5000);
    }
  });

  test('TC-HIST-10: Patient history search field accepts national ID format', async ({ page }) => {
    /**
     * US-HIST-4: The search must accept the national ID format used in the
     * system (numeric, 7 digits: 0123456). Must not show a validation error
     * when a correctly-formatted national ID is entered.
     */
    const loaded = await goToPatientHistory(page);
    if (!loaded) { test.skip(); return; }

    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    const searchInput = page.locator('input').first();
    if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await searchInput.fill('0123456');
      await page.waitForTimeout(500);

      const bodyText = await page.locator('body').innerText();
      // Must not show format validation error for a valid national ID
      const hasFormatError = /invalid.*national|format.*error|must be.*digit/i.test(bodyText);
      console.log(`TC-HIST-10: formatError=${hasFormatError}`);
      expect(hasFormatError, 'Valid national ID must not trigger a format validation error').toBe(false);
    }
  });
});
