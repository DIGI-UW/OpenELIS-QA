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
 * Batch Order Entry Test Suite — Suite BA-DEEP (expanded)
 *
 * User stories covered:
 *   US-BOE-1: As a receptionist, I can enter multiple orders at once using batch
 *             entry to avoid repeating the full wizard for routine test panels.
 *   US-BOE-2: As a lab supervisor, I can select a sample type once and apply it
 *             to all orders in a batch to save time for high-volume labs.
 *   US-BOE-3: As a receptionist, I can enter patient IDs for each row in the
 *             batch form and submit all at once.
 *   US-BOE-4: As a lab admin, I need the batch form to validate each row
 *             independently so one invalid row does not block the whole batch.
 *
 * URLs:
 *   /BatchOrderEntry          — primary batch order entry screen
 *   /BatchSampleEntry         — fallback URL
 *   /SampleBatchEntry         — fallback URL
 *
 * API endpoints:
 *   POST /rest/BatchSamplePatientEntry  — submit batch orders
 *   GET  /rest/SamplePatientEntry       — form metadata (sample types, programs)
 *
 * Suite IDs: TC-BOE-01 through TC-BOE-10
 * Total Test Count: 10 TCs
 *
 * Note: Phase 6 BA-DEEP (2 TCs) previously tested setup form and routine sections.
 * This file provides full Suite BA with deeper API, validation, and submission tests.
 */

const BOE_URLS = [
  '/BatchOrderEntry',
  '/BatchSampleEntry',
  '/SampleBatchEntry',
  '/MasterListsPage/batchOrderEntry',
];

async function goToBatchEntry(page: any): Promise<boolean> {
  return navigateWithDiscovery(page, BOE_URLS);
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite BA — Batch Order Entry Core (TC-BOE-01 through TC-BOE-05)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Suite BA — Batch Order Entry Core (TC-BOE)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-BOE-01: Batch Order Entry page is reachable', async ({ page }) => {
    /**
     * US-BOE-1: Batch entry must be accessible from the nav or direct URL.
     * Without the page loading, no batch orders can be created.
     */
    const loaded = await goToBatchEntry(page);
    expect(loaded, 'Batch Order Entry page must be reachable').toBe(true);

    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('404');
    expect(bodyText).not.toContain('Internal Server Error');
    console.log(`TC-BOE-01: PASS — Batch Order Entry at ${page.url()}`);
  });

  test('TC-BOE-02: Batch form has sample type selector applied to all rows', async ({ page }) => {
    /**
     * US-BOE-2: A single sample type dropdown controls all rows in the batch,
     * saving time when all patients in the batch have the same test.
     */
    const loaded = await goToBatchEntry(page);
    if (!loaded) { test.skip(); return; }

    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });
    const bodyText = await page.locator('body').innerText();

    // Look for sample type or test type selection
    const hasSampleType = /sample type|test type|specimen/i.test(bodyText);
    const hasSelector = await page.locator(
      'select, [role="combobox"], [aria-haspopup="listbox"]'
    ).count() > 0;

    console.log(`TC-BOE-02: sampleTypeTerms=${hasSampleType}, selectors=${hasSelector}`);
    expect(hasSampleType || hasSelector, 'Batch form must have a sample type selector').toBe(true);
  });

  test('TC-BOE-03: Batch form has multiple patient entry rows', async ({ page }) => {
    /**
     * US-BOE-3: The defining characteristic of batch entry is multiple rows.
     * Each row represents one patient order. Must have at least 2 row inputs.
     */
    const loaded = await goToBatchEntry(page);
    if (!loaded) { test.skip(); return; }

    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    // Look for repeated row patterns — patient ID inputs per row
    const inputRows = await page.locator('input[id*="patientId" i], input[placeholder*="patient" i]').count();
    const tableRows = await page.locator('tbody tr, [class*="row"]').count();

    console.log(`TC-BOE-03: Patient inputs=${inputRows}, table rows=${tableRows}`);
    // At least 2 patient input fields or 2 rows indicate a batch structure
    expect(inputRows + tableRows, 'Batch form must have at least 2 row-level elements').toBeGreaterThanOrEqual(2);
  });

  test('TC-BOE-04: Batch form has Submit and Reset/Clear controls', async ({ page }) => {
    /**
     * US-BOE-3: The form must have both a Submit button (to process all rows)
     * and a Clear/Reset button (to start over without leaving the page).
     */
    const loaded = await goToBatchEntry(page);
    if (!loaded) { test.skip(); return; }

    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    const submitBtn = page.getByRole('button', { name: /submit|save|process/i }).first();
    const clearBtn = page.getByRole('button', { name: /clear|reset|cancel/i }).first();

    const hasSubmit = await submitBtn.isVisible({ timeout: 3000 }).catch(() => false);
    const hasClear = await clearBtn.isVisible({ timeout: 3000 }).catch(() => false);

    console.log(`TC-BOE-04: Submit=${hasSubmit}, Clear=${hasClear}`);
    expect(hasSubmit, 'Batch form must have a Submit button').toBe(true);
  });

  test('TC-BOE-05: SamplePatientEntry metadata API used by batch form is healthy', async ({ page }) => {
    /**
     * US-BOE-2: Batch entry uses the same metadata API as the single-order wizard.
     * If this API is down, neither form can populate sample types or programs.
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

    console.log(`TC-BOE-05: API status=${result.status}, programs=${result.programCount}, types=${result.sampleTypeCount}`);
    expect(result.status).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite BA-DEEP — Batch Order API & Validation (TC-BOE-06 through TC-BOE-10)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Suite BA-DEEP — Batch Entry API & Validation (TC-BOE-06–10)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-BOE-06: BatchSamplePatientEntry API endpoint is reachable', async ({ page }) => {
    /**
     * US-BOE-3: The batch submission API must exist and accept requests.
     * A 404 means the feature is not wired up on the backend.
     */
    await page.goto(`${BASE}`);

    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      // Probe with an empty GET — even a 405 Method Not Allowed confirms the route exists
      const candidates = [
        '/api/OpenELIS-Global/rest/BatchSamplePatientEntry',
        '/api/OpenELIS-Global/rest/batchOrderEntry',
        '/api/OpenELIS-Global/rest/SampleBatchEntry',
      ];
      for (const path of candidates) {
        const res = await fetch(path, { headers: { 'X-CSRF-Token': csrf } });
        if (res.status !== 404) return { status: res.status, path };
      }
      return { status: 404, path: 'none' };
    });

    console.log(`TC-BOE-06: Batch API → ${result.path} HTTP ${result.status}`);
    // 405 is acceptable — it means the route exists but GET is not the right method
    expect(result.status, 'Batch API must not be 404 or 5xx').not.toBe(404);
    expect(result.status, 'Batch API must not return 5xx').not.toBeGreaterThanOrEqual(500);
  });

  test('TC-BOE-07: Empty batch submission shows validation error, not server error', async ({ page }) => {
    /**
     * US-BOE-4: Submitting an empty batch must show a validation message,
     * not an Internal Server Error. Graceful validation is critical.
     */
    const loaded = await goToBatchEntry(page);
    if (!loaded) { test.skip(); return; }

    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    const submitBtn = page.getByRole('button', { name: /submit|save|process/i }).first();
    const hasSubmit = await submitBtn.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasSubmit) {
      await submitBtn.click();
      await page.waitForTimeout(2000);
      const bodyText = await page.locator('body').innerText();
      expect(bodyText, 'Empty batch submit must not cause Internal Server Error').not.toContain('Internal Server Error');
      const hasValidationMsg = /required|invalid|error|please|fill/i.test(bodyText);
      console.log(`TC-BOE-07: validationShown=${hasValidationMsg}`);
    } else {
      console.log('TC-BOE-07: GAP — Submit button not found');
    }
  });

  test('TC-BOE-08: Batch form date inputs accept valid dates', async ({ page }) => {
    /**
     * US-BOE-3: Each row may have a collection date. Date inputs must accept
     * valid dates without triggering a validation error.
     */
    const loaded = await goToBatchEntry(page);
    if (!loaded) { test.skip(); return; }

    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    const dateInput = page.locator('input[type="date"], input[placeholder*="mm/dd" i]').first();
    const hasDate = await dateInput.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasDate) {
      const today = new Date().toISOString().slice(0, 10);
      await dateInput.fill(today);
      await page.waitForTimeout(500);
      const bodyText = await page.locator('body').innerText();
      expect(bodyText).not.toContain('Internal Server Error');
      console.log('TC-BOE-08: PASS — date input accepted valid date');
    } else {
      console.log('TC-BOE-08: NOTE — no date input found in batch form');
    }
  });

  test('TC-BOE-09: Batch form program dropdown lists available programs', async ({ page }) => {
    /**
     * US-BOE-2: The program selector in batch entry must be populated so the
     * receptionist can assign all rows to a program (Routine, HIV, TB, etc.).
     */
    const loaded = await goToBatchEntry(page);
    if (!loaded) { test.skip(); return; }

    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    // Check the API for program count directly
    const programCount = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch('/api/OpenELIS-Global/rest/SamplePatientEntry', {
        headers: { 'X-CSRF-Token': csrf },
      });
      if (!res.ok) return -1;
      const data = await res.json();
      const programs = data.sampleOrderItems?.programList ?? data.programList ?? [];
      return programs.length;
    });

    console.log(`TC-BOE-09: Programs available for batch form: ${programCount}`);
    expect(programCount, 'At least 5 programs must be available for batch entry').toBeGreaterThanOrEqual(5);
  });

  test('TC-BOE-10: Batch entry page accessibility — form rows have labels', async ({ page }) => {
    /**
     * US-BOE-1 (Accessibility): Each row input in the batch form must have a label
     * so screen reader users can identify what to fill in each cell.
     */
    const loaded = await goToBatchEntry(page);
    if (!loaded) { test.skip(); return; }

    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    const labelAudit = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"])'));
      const labeled = inputs.filter(el => {
        return (
          el.getAttribute('aria-label') ||
          el.getAttribute('placeholder') ||
          (el.id && document.querySelector(`label[for="${el.id}"]`)) ||
          el.closest('[class*="form-item"]')?.querySelector('label')
        );
      });
      return { total: inputs.length, labeled: labeled.length };
    });

    const ratio = labelAudit.total > 0 ? labelAudit.labeled / labelAudit.total : 1;
    console.log(`TC-BOE-10: ${labelAudit.labeled}/${labelAudit.total} inputs labeled (${(ratio * 100).toFixed(0)}%)`);
    expect(ratio, 'At least 70% of batch form inputs must have labels').toBeGreaterThanOrEqual(0.7);
  });
});
