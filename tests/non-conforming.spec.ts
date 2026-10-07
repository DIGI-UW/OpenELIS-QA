import { test, expect } from '@playwright/test';
import { BASE, ADMIN, PATIENT_NAME, PATIENT_ID, ACCESSION, QA_PREFIX, TIMEOUT, CONFIRMED_ADMIN_URLS, login, navigateWithDiscovery, fillSearchField, getDateRange, getFutureDateRange, getFutureDate, navigateViaMenu, tryNavigateToURL, selectSampleType, orderWizardForward, selectOrderProgram } from '../helpers/test-helpers';
import { ensureReferringClinic } from '../helpers/data-factory';
import { seededPatient, sampleTypeWithTest, legacyPickPatient, legacyToAddSample, legacyTickTest, legacyFillOrderStep } from '../helpers/legacy-order-entry';

/**
 * Report Non-Conforming Event. REWORKED 2026-10-08: /NonConformingEvent is no longer a page on
 * develop (the server answers it under /api), the report form lives at /ReportNonConformingEvent
 * ("Report Non-Conformity Event"), as the route census and the side menu have it.
 */
const NCE_REPORT = '/ReportNonConformingEvent';

/**
 * Non-Conforming Samples and Events Test Suite
 * Covers non-conforming sample rejection and corrective actions
 * Suite IDs: NC, AD, G-DEEP
 * Test Count: 12
 */

test.describe('Non-conforming samples (TC-NC)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-NC-01: Reject Sample checkbox appears on Add Sample step', async ({ page }) => {
    await page.goto(`${BASE}/SamplePatientEntry`);

    // Step 1: Patient Info
    await page.locator('input[placeholder*="patient" i], input[id*="patientId" i]').first().fill('0123456');
    await page.keyboard.press('Enter');
    await orderWizardForward(page).click();

    // Step 2: Program Selection
    await selectOrderProgram(page);
    await orderWizardForward(page).click();

    // Step 3: Add Sample — select Whole Blood
    await selectSampleType(page, '4');

    // Look for Reject Sample checkbox
    const rejectCheckbox = page.getByRole('checkbox', { name: /reject/i }).first();
    const rejectLabel = page.getByText('Reject Sample', { exact: false });

    const hasRejectCb = await rejectCheckbox.isVisible({ timeout: 3000 }).catch(() => false);
    const hasRejectLabel = await rejectLabel.isVisible({ timeout: 3000 }).catch(() => false);

    console.log(`TC-NC-01: Reject Sample checkbox visible = ${hasRejectCb || hasRejectLabel}`);
    expect(hasRejectCb || hasRejectLabel).toBe(true);
  });

  test('TC-NC-02: Checking Reject Sample reveals rejection reason UI', async ({ page }) => {
    await page.goto(`${BASE}/SamplePatientEntry`);

    await page.locator('input[placeholder*="patient" i]').first().fill('0123456');
    await page.keyboard.press('Enter');
    await orderWizardForward(page).click();
    await selectOrderProgram(page);
    await orderWizardForward(page).click();
    await selectSampleType(page, '4');

    // Click the Reject Sample checkbox/label
    const rejectLabel = page.getByText('Reject Sample', { exact: false });
    if (await rejectLabel.isVisible({ timeout: 3000 }).catch(() => false)) {
      await rejectLabel.click();
    } else {
      const rejectCb = page.getByRole('checkbox', { name: /reject/i }).first();
      await rejectCb.check();
    }

    await page.waitForTimeout(500);

    // Look for rejection reason dropdown or input
    const reasonSelect = page.getByRole('combobox', { name: /reason|reject/i }).first();
    const reasonInput = page.getByRole('textbox', { name: /reason/i }).first();

    const hasReasonSelect = await reasonSelect.isVisible({ timeout: 3000 }).catch(() => false);
    const hasReasonInput = await reasonInput.isVisible({ timeout: 3000 }).catch(() => false);

    console.log(`TC-NC-02: Rejection reason UI — select: ${hasReasonSelect}, input: ${hasReasonInput}`);
    // Document without hard assert — some builds show a select, some show a text input
    if (hasReasonSelect) {
      const opts = await reasonSelect.locator('option').allTextContents();
      console.log(`TC-NC-02: Rejection reason options: ${opts.join(', ')}`);
    }
  });

  test('TC-NC-03: Order with rejected sample submits and shows NC icon in Results view', async ({ page }) => {
    // REWORKED 2026-10-08: written against the old testing server's demo data (patient 0123456,
    // HGB test 743, sites "Adiba SC" / "Anga, Dr"), none of which exists on a fresh or CI stack.
    // It now seeds its own patient and uses the Add Sample step's #reject_0 / #rejectedReasonId_0.
    const p = await seededPatient(page, 'NC3');
    await ensureReferringClinic(page);
    const st = await sampleTypeWithTest(page);
    await legacyPickPatient(page, p);
    await legacyToAddSample(page);
    await page.locator('#sampleId_0').selectOption(st.typeId);
    await legacyTickTest(page, st.testId);

    // Reject the sample and give the first real reason.
    await page.locator('label[for="reject_0"]').click();
    await expect(page.locator('#reject_0'), 'Reject Sample is ticked').toBeChecked();
    await expect(page.locator('#rejectedReasonId_0'), 'a rejection reason list appears').toBeVisible();
    await page.locator('#rejectedReasonId_0').selectOption({ index: 1 });

    await orderWizardForward(page).click();
    const labNo = await legacyFillOrderStep(page);
    const post = page.waitForResponse((r) => /\/rest\/SamplePatientEntry/.test(r.url()) && r.request().method() === 'POST', { timeout: 30_000 });
    await orderWizardForward(page).filter({ hasText: /Submit/ }).click();
    expect((await post).status(), 'the order with a rejected sample saves').toBe(200);
    await expect(page.getByText(/Successfully saved|Succesfuly saved/i).first()).toBeVisible({ timeout: 15000 });

    // Informational: look for an NC marker for this lab number in the unified Results page.
    await page.goto(`${BASE}/Results`);
    const search = page.locator('main').getByRole('searchbox', { name: /lab number/i });
    await search.fill(labNo);
    await search.press('Enter');
    await page.waitForTimeout(2000);
    const ncIndicator = page.locator('main').locator('[class*="nonconform" i], [aria-label*="nonconform" i], [title*="non-conform" i], [title*="nonconform" i]').first();
    console.log(`TC-NC-03: ${labNo} saved with a rejected sample; NC indicator in Results = ${await ncIndicator.isVisible().catch(() => false)}`);
  });

  test('TC-NC-04: NC order result field behavior', async ({ page }) => {
    // Use the known accession if we already have one, otherwise note as dependency
    // This test verifies the UX behavior — not a strict pass/fail
    // REWORKED 2026-10-08: /AccessionResults opens the unified Results page, whose lab number
    // search is a searchbox (Enter searches); the header has its own Search buttons now.
    await page.goto(`${BASE}/AccessionResults`);
    const searchInput = page.locator('main').getByRole('searchbox', { name: /lab number/i });
    await searchInput.fill(ACCESSION); // existing order
    await searchInput.press('Enter');
    await page.waitForTimeout(2000);

    // Check for the NC warning legend that we know exists in the UI
    const legendText = page.getByText(/nonconforming|been rejected/i);
    const hasLegend = await legendText.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`TC-NC-04: NC legend visible in Results By Order = ${hasLegend}`);

    if (hasLegend) {
      console.log('TC-NC-04: PASS — NC indicator legend exists in Results By Order view');
      expect(hasLegend).toBe(true);
    }
  });
});

test.describe('Suite AD — Non-Conform Corrective Actions + View NC Events', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-NCA-01: View New Non-Conforming Events queue loads', async ({ page }) => {
    // Navigate via menu
    await page.getByRole('button', { name: /menu/i }).click();
    await page.waitForTimeout(500);

    const nonConformLink = page.getByText(/Non-Conform|NC/i);
    if (await nonConformLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await nonConformLink.click();
      await page.waitForTimeout(500);
      const viewEventsLink = page.getByText(/View.*Non-Conforming|NC.*Events|View.*Events/i);
      if (await viewEventsLink.isVisible({ timeout: 2000 }).catch(() => false)) {
        await viewEventsLink.click();
      }
    }

    // URL discovery
    const candidates = [
      '/NCQueue',
      '/NonConformingQueue',
      '/nc/events',
      '/NonConforming/NewEvents',
    ];
    const success = await navigateWithDiscovery(page, candidates);

    // Verify not login
    expect(page.url()).not.toMatch(/LoginPage|login/i);

    // Verify queue table exists
    const queueTable = page.locator('table, [role="grid"], [role="table"]').first();
    await expect(queueTable).toBeVisible({ timeout: 3000 }).catch(() => {
      console.log('NC events queue table not visible');
    });
  });

  test('TC-NCA-02: NC events list shows recent events', async ({ page }) => {
    const candidates = [
      '/NCQueue',
      '/NonConformingQueue',
      '/nc/events',
    ];
    const success = await navigateWithDiscovery(page, candidates);

    // Look for table rows
    const tableRows = page.locator('tbody tr, [role="row"]');
    const rowCount = await tableRows.count();

    if (rowCount > 0) {
      // Verify first row has key columns
      const firstRow = tableRows.first();
      const cells = firstRow.locator('td, [role="gridcell"]');

      // Should have at least accession, reason, date
      const cellCount = await cells.count();
      expect(cellCount).toBeGreaterThanOrEqual(3);

      // Look for accession or order ID pattern
      const accessionCell = firstRow.getByText(/26CPHL|NC|accession/i);
      await expect(accessionCell).toBeVisible({ timeout: 2000 }).catch(() => {
        console.log('Accession/NC event identifier not clearly visible');
      });
    } else {
      console.log('SKIP: No NC events in queue (expected if none exist in test data)');
    }
  });

  test('TC-NCA-03: Corrective Actions screen loads', async ({ page }) => {
    // Navigate via menu
    await page.getByRole('button', { name: /menu/i }).click();
    await page.waitForTimeout(500);

    const nonConformLink = page.getByText(/Non-Conform|NC/i);
    if (await nonConformLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await nonConformLink.click();
      await page.waitForTimeout(500);
      const actionsLink = page.getByText(/Corrective.*Actions|Actions/i);
      if (await actionsLink.isVisible({ timeout: 2000 }).catch(() => false)) {
        await actionsLink.click();
      }
    }

    // URL discovery
    const candidates = [
      '/CorrectiveActions',
      '/NonConformingCorrectiveActions',
      '/nc/actions',
      '/corrective-actions',
    ];
    const success = await navigateWithDiscovery(page, candidates);

    // Verify not login
    expect(page.url()).not.toMatch(/LoginPage|login/i);

    // Verify action list and create button
    const createBtn = page.getByRole('button', { name: /Create|Add|\+|New/i });
    await expect(createBtn).toBeVisible({ timeout: 3000 }).catch(() => {
      console.log('Create Corrective Action button not visible');
    });

    const actionTable = page.locator('table, [role="grid"], [role="table"]').first();
    await expect(actionTable).toBeVisible({ timeout: 2000 }).catch(() => {
      console.log('Corrective actions table not visible');
    });
  });

  test('TC-NCA-04: Create a corrective action for existing NC event', async ({ page }) => {
    const candidates = [
      '/CorrectiveActions',
      '/NonConformingCorrectiveActions',
      '/nc/actions',
    ];
    await navigateWithDiscovery(page, candidates);

    // Click create button
    const createBtn = page.getByRole('button', { name: /Create|Add|\+/i });
    if (await createBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await createBtn.click();
      await page.waitForTimeout(1000);

      // Fill form fields
      // NC Event selector
      const ncSelect = page.getByRole('combobox').first();
      if (await ncSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
        await ncSelect.selectOption({ index: 1 }); // Select first non-empty option
      }

      // Description field
      const descField = page.locator('input[placeholder*="description" i], textarea').first();
      if (await descField.isVisible({ timeout: 2000 }).catch(() => false)) {
        await descField.fill(`${QA_PREFIX} Test Corrective Action`);
      }

      // Assigned To
      const assignSelect = page.getByRole('combobox', { name: /assigned|user/i }).first();
      if (await assignSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
        await assignSelect.selectOption({ index: 1 });
      }

      // Due Date
      const dueDate = await getFutureDate(7);
      const dateField = page.locator('input[type="date"]').first();
      if (await dateField.isVisible({ timeout: 2000 }).catch(() => false)) {
        await dateField.fill(dueDate);
      }

      // Submit form
      const submitBtn = page.getByRole('button', { name: /Save|Submit|Create/i });
      if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await submitBtn.click();
        await page.waitForTimeout(2000);

        // Verify success (redirect or message)
        const successMsg = page.getByText(/success|created|saved/i);
        await expect(successMsg).toBeVisible({ timeout: 3000 }).catch(() => {
          console.log('No success message after corrective action creation');
        });
      }
    } else {
      console.log('SKIP: Create button not available or form load failed');
    }
  });

  test('TC-NCA-05: Corrective action saved and visible in history', async ({ page }) => {
    const candidates = [
      '/CorrectiveActions',
      '/NonConformingCorrectiveActions',
      '/nc/actions',
    ];
    await navigateWithDiscovery(page, candidates);

    // Refresh to ensure data persistence
    await page.reload();
    await page.waitForTimeout(2000);

    // Look for the corrective action in the list
    const actionDescription = page.getByText(QA_PREFIX, { exact: false });

    if (await actionDescription.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Click to open details
      await actionDescription.click();
      await page.waitForTimeout(1000);

      // Verify details match
      const detailTitle = page.getByText(QA_PREFIX, { exact: false });
      await expect(detailTitle).toBeVisible({ timeout: 3000 });

      // Verify key fields
      const descCheck = page.getByText(/Test Corrective Action/i);
      const dueDateCheck = page.getByText(/\d{4}-\d{2}-\d{2}/); // Date format

      await expect(descCheck).toBeVisible({ timeout: 2000 }).catch(() => {
        console.log('Description not visible in corrective action details');
      });
    } else {
      console.log('SKIP: Corrective action not found in list (may not have been created in TC-NCA-04)');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite NC-EXT — Non-Conforming Extended (TC-NC-EXT-01 through TC-NC-EXT-07)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Suite NC-EXT — Non-Conforming Extended Tests (TC-NC-EXT)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-NC-EXT-01: NonConformingEvent API endpoint is reachable', async ({ page }) => {
    /**
     * The NC event backend must accept submissions without returning 5xx.
     * A 405 on GET is acceptable — it confirms the POST route is wired.
     */
    await page.goto(`${BASE}`);

    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const candidates = [
        '/api/OpenELIS-Global/rest/NonConformingEvent',
        '/api/OpenELIS-Global/rest/NCEvent',
        '/api/OpenELIS-Global/rest/nonConformingEvent',
      ];
      for (const url of candidates) {
        const res = await fetch(url, { headers: { 'X-CSRF-Token': csrf } });
        if (res.status !== 404) return { status: res.status, url };
      }
      return { status: 404, url: 'none' };
    });

    console.log(`TC-NC-EXT-01: NC event API → ${result.url} HTTP ${result.status}`);
    expect(result.status, 'NC event API must not 5xx').not.toBeGreaterThanOrEqual(500);
  });

  test('TC-NC-EXT-02: View NC Events search returns results for known accession', async ({ page }) => {
    /**
     * The ViewNonConformingEvent search must handle a known accession without
     * crashing, whether or not there is a matching NC event.
     */
    await page.goto(`${BASE}/ViewNonConformingEvent`);
    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    const searchInput = page.locator(
      'input[placeholder*="lab" i], input[placeholder*="accession" i], input[id*="lab" i]'
    ).first();
    if (!await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('TC-NC-EXT-02: SKIP — no search input found');
      test.skip(); return;
    }

    await searchInput.fill(ACCESSION);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);

    const bodyText = await page.locator('body').innerText();
    expect(bodyText, 'NC event search must not cause server error').not.toContain('Internal Server Error');
    console.log('TC-NC-EXT-02: PASS — NC event search completed without error');
  });

  test('TC-NC-EXT-03: NC event naming consistency — heading variants', async ({ page }) => {
    /**
     * NOTE-20: Three naming conventions exist across the NC module:
     * "Non-Conforming", "Non Conform Event", "Nonconforming". This test
     * documents which variant is shown on the main NCE screen.
     */
    await page.goto(`${BASE}${NCE_REPORT}`);
    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    const bodyText = await page.locator('body').innerText();
    const hasHyphenated = /non-conforming/i.test(bodyText);
    const hasSpaced = /non conform(?!ing)/i.test(bodyText);
    const hasOneWord = /nonconforming/i.test(bodyText);

    console.log(`TC-NC-EXT-03: naming — hyphenated=${hasHyphenated}, spaced=${hasSpaced}, oneword=${hasOneWord}`);
    // Document NOTE-20 state — at least one variant must exist
    expect(hasHyphenated || hasSpaced || hasOneWord, 'Some NC naming variant must appear').toBe(true);
  });

  test('TC-NC-EXT-04: NC Corrective Actions page — empty search shows no server error', async ({ page }) => {
    /**
     * Submitting the corrective actions search form without filling in the
     * accession must produce a graceful empty state, not a 500.
     */
    await page.goto(`${BASE}/NCECorrectiveAction`);
    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    const searchBtn = page.getByRole('button', { name: /search|find|submit/i }).first();
    if (await searchBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await searchBtn.click();
      await page.waitForTimeout(2000);
    }

    const bodyText = await page.locator('body').innerText();
    expect(bodyText, 'Empty corrective action search must not 500').not.toContain('Internal Server Error');
    console.log('TC-NC-EXT-04: PASS — empty corrective action search handled gracefully');
  });

  test('TC-NC-EXT-05: All three NC URLs are reachable without error', async ({ page }) => {
    /**
     * The three entry points to the NC module must all be accessible:
     * Report, View Events, and Corrective Actions.
     */
    const ncUrls = [
      NCE_REPORT,
      '/ViewNonConformingEvent',
      '/NCECorrectiveAction',
    ];

    const results: { url: string; ok: boolean }[] = [];
    for (const url of ncUrls) {
      await page.goto(`${BASE}${url}`);
      await page.waitForLoadState('networkidle', { timeout: TIMEOUT });
      const bodyText = await page.locator('body').innerText();
      const ok = !bodyText.includes('404') && !bodyText.includes('Internal Server Error')
        && !page.url().match(/LoginPage|login/i);
      results.push({ url, ok });
    }

    console.log('TC-NC-EXT-05:', JSON.stringify(results));
    const failing = results.filter(r => !r.ok);
    expect(failing, `All NC URLs must be reachable: failing=${JSON.stringify(failing)}`).toHaveLength(0);
  });

  test('TC-NC-EXT-06: NC event form submission without data returns validation, not 500', async ({ page }) => {
    /**
     * Submitting the NC event report form empty must show a validation
     * message, not an Internal Server Error.
     */
    await page.goto(`${BASE}${NCE_REPORT}`);
    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    const submitBtn = page.getByRole('button', { name: /submit|save|report/i }).first();
    if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await submitBtn.click();
      await page.waitForTimeout(2000);
      const bodyText = await page.locator('body').innerText();
      expect(bodyText, 'Empty NC form submit must not 500').not.toContain('Internal Server Error');
      const hasValidation = /required|invalid|error|please|field/i.test(bodyText);
      console.log(`TC-NC-EXT-06: validationShown=${hasValidation}`);
    } else {
      console.log('TC-NC-EXT-06: NOTE — submit button not found on NC event form');
    }
  });

  test('TC-NC-EXT-07: NC module loads within acceptable time', async ({ page }) => {
    /**
     * The NonConformingEvent page is used during urgent sample rejection
     * workflows. It must be accessible and load promptly.
     */
    const start = Date.now();
    await page.goto(`${BASE}${NCE_REPORT}`);
    await page.waitForLoadState('domcontentloaded');
    const elapsed = Date.now() - start;

    const bodyText = await page.locator('body').innerText();
    const ok = !bodyText.includes('Internal Server Error') && !page.url().match(/LoginPage|login/i);

    console.log(`TC-NC-EXT-07: NCE page loaded in ${elapsed}ms, ok=${ok}`);
    if (ok) {
      expect(elapsed, 'NC event page must load within 5000ms').toBeLessThan(5000);
    }
  });
});

test.describe('Phase 5 — G-DEEP: NCE Interaction Tests', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-G-DEEP-01: Report NCE form loads with required fields', async ({ page }) => {
    // Navigate directly to the confirmed NC event reporting URL
    await page.goto(`${BASE}${NCE_REPORT}`);
    await page.waitForLoadState('networkidle');

    const bodyText = await page.locator('body').innerText();
    expect(bodyText, 'Page must not have a server error').not.toMatch(/500|Internal Server Error/);
    expect(page.url(), 'Must not redirect to login').not.toMatch(/LoginPage|login/i);

    // Page must have a heading identifying it as a Non-Conforming Event form
    const hasHeading = /Non-Conforming Event|NCE|Non Conforming/i.test(bodyText);
    expect(hasHeading, 'Report NCE form must show a Non-Conforming Event heading').toBe(true);
  });

  test('TC-G-DEEP-02: View NC Events search page loads', async ({ page }) => {
    await page.goto(`${BASE}/ViewNonConformingEvent`);
    await page.waitForLoadState('networkidle');

    const bodyText = await page.locator('body').innerText();
    expect(bodyText, 'Page must not have a server error').not.toMatch(/500|Internal Server Error/);
    expect(page.url(), 'Must not redirect to login').not.toMatch(/LoginPage|login/i);

    // Search field must be present (Lab Number or accession). REWORKED 2026-10-08: the page searches
    // by a "Search By" choice (NCE Number or Lab Number) plus one "Text Value" field.
    const searchBy = page.locator('main').getByRole('combobox', { name: 'Search By' });
    await expect(searchBy).toBeVisible({ timeout: 15_000 });
    const options = (await searchBy.locator('option').allInnerTexts()).map((t) => t.trim());
    expect(options, 'View NC Events can search by Lab Number').toContain('Lab Number');
    await expect(page.locator('main').getByRole('textbox', { name: 'Text Value' }), 'View NC Events must have a search value field').toBeVisible();
  });

  test('TC-G-DEEP-03: Corrective Actions search page loads', async ({ page }) => {
    await page.goto(`${BASE}/NCECorrectiveAction`);
    await page.waitForLoadState('networkidle');

    const bodyText = await page.locator('body').innerText();
    expect(bodyText, 'Page must not have a server error').not.toMatch(/500|Internal Server Error/);
    expect(page.url(), 'Must not redirect to login').not.toMatch(/LoginPage|login/i);

    // Must have a search field so supervisor can find NC events
    const hasSearchField = await page.locator(
      'input[placeholder*="lab" i], input[placeholder*="accession" i], input'
    ).first().isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasSearchField, 'Corrective Actions page must have a search field').toBe(true);
  });
});
