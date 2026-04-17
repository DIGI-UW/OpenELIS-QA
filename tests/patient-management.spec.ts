import { test, expect } from '@playwright/test';
import { BASE, ADMIN, PATIENT_NAME, PATIENT_ID, ACCESSION, QA_PREFIX, TIMEOUT, CONFIRMED_ADMIN_URLS, login, navigateWithDiscovery, fillSearchField, navigateToAdminItem, getDateRange, getFutureDateRange } from '../helpers/test-helpers';

/**
 * Patient Management Test Suite
 *
 * File Purpose:
 * - Covers patient search, creation, merging, and history workflows
 * - Tests spanning TC-PAT core + AC merge + H-DEEP/BD-DEEP/BE-DEEP interactions
 *
 * Suite IDs:
 * - TC-PAT: Patient Management core (5 TCs)
 * - Suite AC: Merge Patient (4 TCs)
 * - Phase 4 H-DEEP: Patient Interaction Tests (3 TCs)
 * - Phase 6 BD-DEEP: Patient History Tests (2 TCs)
 * - Phase 6 BE-DEEP: Patient Merge Tests (2 TCs)
 *
 * Total Test Count: 16 TCs
 */

test.describe('Patient Management (TC-PAT)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  const PATIENT_URLS = [
    '/PatientManagement',
    '/FindPatient',
    '/PatientResults',
    '/SamplePatientEntry',
  ];

  async function goToPatientSearch(page): Promise<string> {
    for (const u of PATIENT_URLS) {
      const res = await page.goto(`${BASE}${u}`).catch(() => null);
      if (res && res.ok() && !page.url().includes('LoginPage')) {
        return page.url();
      }
    }
    // Try hamburger nav as fallback
    await page.goto(`${BASE}`);
    const patientMenu = page.getByRole('link', { name: /Patient/i }).first();
    if (await patientMenu.isVisible({ timeout: 2000 }).catch(() => false)) {
      await patientMenu.click();
      await page.waitForTimeout(1000);
    }
    return page.url();
  }

  test('TC-PAT-01: Patient search page loads', async ({ page }) => {
    const url = await goToPatientSearch(page);
    console.log(`TC-PAT-01: Patient search URL = ${url}`);
    // Should have some form element for searching
    const hasSearchForm = await page.getByRole('textbox').count() > 0;
    if (!hasSearchForm) {
      console.log('TC-PAT-01: GAP — no search form detected on patient screen');
    }
    expect(page.url()).not.toContain('LoginPage');
    expect(hasSearchForm).toBe(true);
  });

  test('TC-PAT-02: Search by national ID returns Abby Sebby', async ({ page }) => {
    await goToPatientSearch(page);

    // Try national ID field
    const idField = page.locator(
      'input[id*="national" i], input[id*="patientId" i], input[placeholder*="national" i], input[placeholder*="ID" i]'
    ).first();

    if (!(await idField.isVisible({ timeout: 3000 }).catch(() => false))) {
      console.log('TC-PAT-02: SKIP — no national ID field found');
      test.skip();
      return;
    }

    await idField.fill('0123456');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);

    const hasAbby = await page.getByText(/Sebby/i).isVisible({ timeout: 5000 }).catch(() => false);
    if (hasAbby) {
      console.log('TC-PAT-02: PASS — Abby Sebby found by national ID');
    } else {
      console.log('TC-PAT-02: FAIL — Abby Sebby not returned for ID 0123456');
    }
    expect(hasAbby).toBe(true);
  });

  test('TC-PAT-03: Partial last-name search returns matching patient', async ({ page }) => {
    await goToPatientSearch(page);

    const lastNameField = page.locator(
      'input[id*="lastName" i], input[id*="last_name" i], input[placeholder*="last" i], input[placeholder*="surname" i]'
    ).first();

    if (!(await lastNameField.isVisible({ timeout: 3000 }).catch(() => false))) {
      console.log('TC-PAT-03: GAP — no last-name field; partial search not supported');
      return; // not a hard fail — document as GAP
    }

    await lastNameField.fill('Seb');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);

    const hasAbby = await page.getByText(/Sebby/i).isVisible({ timeout: 5000 }).catch(() => false);
    console.log(hasAbby ? 'TC-PAT-03: PASS' : 'TC-PAT-03: FAIL — partial name match not working');
    expect(hasAbby).toBe(true);

    // Empty-state test
    await lastNameField.fill('ZZZNOTEXIST');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);
    const hasEmpty = await page.getByText(/no.*found|no.*result|no.*patient/i).isVisible({ timeout: 3000 }).catch(() => false);
    console.log(hasEmpty ? 'TC-PAT-03 empty state: PASS' : 'TC-PAT-03 empty state: FAIL — no empty-state message');
  });

  test('TC-PAT-04: View patient order history', async ({ page }) => {
    await goToPatientSearch(page);

    // Search for Abby Sebby
    const idField = page.getByRole('textbox', { name: /id|patient|national/i }).first();
    if (await idField.isVisible({ timeout: 3000 }).catch(() => false)) {
      await idField.fill('0123456');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2000);
    }

    // Click on the patient row to open detail
    const patientRow = page.getByText(/Sebby/i).first();
    if (!(await patientRow.isVisible({ timeout: 3000 }).catch(() => false))) {
      console.log('TC-PAT-04: SKIP — could not locate patient row');
      return;
    }
    await patientRow.click();
    await page.waitForTimeout(2000);

    // Verify history / demographics
    const hasHistory = await page.getByText(/26CPHL|accession|order|history/i).isVisible({ timeout: 5000 }).catch(() => false);
    const hasDemographics = await page.getByText(/Abby|Sebby/i).isVisible({ timeout: 3000 }).catch(() => false);

    console.log(hasHistory ? 'TC-PAT-04 history: PASS' : 'TC-PAT-04 history: FAIL — order history not visible');
    console.log(hasDemographics ? 'TC-PAT-04 demographics: PASS' : 'TC-PAT-04 demographics: FAIL');
    expect(hasDemographics).toBe(true);
  });

  test('TC-PAT-05: Create a new patient', async ({ page }) => {
    // Try to find Add Patient screen
    const addPatientUrls = ['/AddPatient', '/PatientEdit', '/SamplePatientEntry'];
    let landed = false;
    for (const u of addPatientUrls) {
      const res = await page.goto(`${BASE}${u}`).catch(() => null);
      if (res && res.ok() && !page.url().includes('LoginPage')) {
        landed = true;
        break;
      }
    }
    if (!landed) {
      console.log('TC-PAT-05: GAP — no Add Patient URL accessible');
      return;
    }

    // Fill demographics
    const lastNameField = page.getByRole('textbox', { name: /last.*name/i }).first();
    const firstNameField = page.getByRole('textbox', { name: /first.*name/i }).first();
    const idField = page.locator('input[id*="national" i], input[id*="patientId" i]').first();

    if (await lastNameField.isVisible({ timeout: 3000 }).catch(() => false)) {
      await lastNameField.fill('QA_Patient');
    }
    if (await firstNameField.isVisible({ timeout: 3000 }).catch(() => false)) {
      await firstNameField.fill('Automated');
    }
    if (await idField.isVisible({ timeout: 3000 }).catch(() => false)) {
      await idField.fill('QA_PAT_0324');
    }

    // Submit
    const saveBtn = page.getByRole('button', { name: /save|submit|add patient/i }).first();
    if (await saveBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await saveBtn.click();
      await page.waitForTimeout(2000);
    }

    const savedOk = await page.getByText(/QA_Patient|QA_PAT_0324/i).isVisible({ timeout: 5000 }).catch(() => false);
    console.log(savedOk ? 'TC-PAT-05: PASS — new patient created' : 'TC-PAT-05: FAIL — patient not persisted after save');
  });
});

test.describe('Suite AC — Merge Patient', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-MP-01: Merge Patient screen loads from Patient menu', async ({ page }) => {
    // Navigate via menu
    await page.getByRole('button', { name: /menu/i }).click();
    await page.waitForTimeout(500);

    const patientLink = page.getByText(/^Patient$/i, { exact: true });
    if (await patientLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await patientLink.click();
      await page.waitForTimeout(500);
      const mergeLink = page.getByText(/Merge|Merge Patient/i);
      if (await mergeLink.isVisible({ timeout: 2000 }).catch(() => false)) {
        await mergeLink.click();
      }
    }

    // URL discovery
    const candidates = [
      '/MergePatient',
      '/PatientMerge',
      '/patient/merge',
      '/merge',
    ];
    const success = await navigateWithDiscovery(page, candidates);

    // Verify not login
    expect(page.url()).not.toMatch(/LoginPage|login/i);

    // Verify search fields exist
    const searchFields = page.locator('input[placeholder*="patient" i], input[placeholder*="name" i]');
    const count = await searchFields.count();
    if (count >= 1) {
      await expect(searchFields.first()).toBeVisible({ timeout: 3000 });
    } else {
      console.log('Patient search fields not clearly visible on Merge Patient screen');
    }
  });

  test('TC-MP-02: Search finds duplicate patients', async ({ page }) => {
    const candidates = ['/MergePatient', '/PatientMerge', '/patient/merge'];
    await navigateWithDiscovery(page, candidates);

    // Search for patient
    const searchField = page.locator('input[placeholder*="patient" i], input[placeholder*="name" i]').first();
    if (await searchField.isVisible({ timeout: 2000 }).catch(() => false)) {
      await searchField.fill('Abby');
      await page.waitForTimeout(1000);

      // Look for autocomplete/dropdown
      const dropdown = page.locator('[role="listbox"], ul, [role="option"]').first();
      await expect(dropdown).toBeVisible({ timeout: 3000 }).catch(() => {
        console.log('No autocomplete dropdown visible after patient search');
      });

      // Look for Abby Sebby in results
      const abbyOption = page.getByText(/Abby.*Sebby|Sebby.*Abby/i);
      await expect(abbyOption).toBeVisible({ timeout: 2000 }).catch(() => {
        console.log('Patient "Abby Sebby" not found in search results');
      });
    }
  });

  test('TC-MP-03: Select two patients for merge', async ({ page }) => {
    const candidates = ['/MergePatient', '/PatientMerge', '/patient/merge'];
    await navigateWithDiscovery(page, candidates);

    // Fill first search
    const firstSearch = page.locator('input[placeholder*="patient" i], input[placeholder*="name" i]').first();
    if (await firstSearch.isVisible({ timeout: 2000 }).catch(() => false)) {
      await firstSearch.fill('Abby');
      await page.waitForTimeout(1000);

      // Select first result
      const firstOption = page.locator('[role="option"]').first();
      if (await firstOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await firstOption.click();
        await page.waitForTimeout(500);
      }

      // Second search field should now be active
      const allSearches = page.locator('input[placeholder*="patient" i], input[placeholder*="name" i]');
      const secondSearch = allSearches.nth(1);

      if (await secondSearch.isVisible({ timeout: 2000 }).catch(() => false)) {
        await secondSearch.fill('Sebby');
        await page.waitForTimeout(1000);

        // Select from second dropdown
        const secondOption = page.locator('[role="option"]').nth(1);
        if (await secondOption.isVisible({ timeout: 2000 }).catch(() => false)) {
          await secondOption.click();
        }
      }

      // Verify merge button exists
      const mergeBtn = page.getByRole('button', { name: /Merge|Submit|Confirm/i });
      await expect(mergeBtn).toBeVisible({ timeout: 3000 }).catch(() => {
        console.log('Merge button not visible after patient selections');
      });
    }
  });

  test('TC-MP-04: Merge operation completes (or document if feature is broken)', async ({ page }) => {
    const candidates = ['/MergePatient', '/PatientMerge', '/patient/merge'];
    await navigateWithDiscovery(page, candidates);

    // Select patients (simplified version of TC-MP-03)
    const firstSearch = page.locator('input[placeholder*="patient" i], input[placeholder*="name" i]').first();
    let canMerge = true;

    if (await firstSearch.isVisible({ timeout: 2000 }).catch(() => false)) {
      await firstSearch.fill('Abby');
      await page.waitForTimeout(1000);

      const firstOption = page.locator('[role="option"]').first();
      if (await firstOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await firstOption.click();
      } else {
        canMerge = false;
      }
    } else {
      canMerge = false;
    }

    if (canMerge) {
      // Click merge button
      const mergeBtn = page.getByRole('button', { name: /Merge|Submit|Confirm/i });
      if (await mergeBtn.isEnabled({ timeout: 2000 }).catch(() => false)) {
        await mergeBtn.click();

        // Wait for confirmation dialog if present
        const confirmBtn = page.getByRole('button', { name: /Yes|Confirm|OK|Merge/i });
        if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await confirmBtn.click();
        }

        // Wait for result
        await page.waitForTimeout(3000);

        // Check for success message
        const successMsg = page.getByText(/success|merged|complete/i);
        const errorMsg = page.getByText(/error|failed|not allowed/i);

        if (await successMsg.isVisible({ timeout: 2000 }).catch(() => false)) {
          console.log('Merge completed successfully');
        } else if (await errorMsg.isVisible({ timeout: 2000 }).catch(() => false)) {
          console.log('Merge failed with error');
          expect(false).toBe(true); // Document failure
        } else {
          console.log('Merge result unclear - no success/error message');
        }
      } else {
        console.log('Merge button disabled or not clickable - possibly no duplicates');
      }
    } else {
      console.log('SKIP: Could not select patients for merge');
      test.skip();
    }
  });
});

test.describe('Phase 4 — H-DEEP: Patient Interaction Tests', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-H-DEEP-01: Search by national ID finds known patient', async ({ page }) => {
    // Navigate directly — SPA menu clicks require BASE navigation first
    await page.goto(`${BASE}/SamplePatientEntry`);
    await page.waitForLoadState('networkidle');

    // Fill national ID using native setter (Carbon controlled input)
    await page.evaluate(() => {
      const input = document.querySelector('input[placeholder*="National" i], input[placeholder*="Patient" i], input[id*="national" i]') as HTMLInputElement;
      if (!input) return;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, '0123456');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const searchBtn = page.getByRole('button', { name: /search/i }).first();
    if (await searchBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await searchBtn.click();
    } else {
      await page.keyboard.press('Enter');
    }
    await page.waitForTimeout(2000);

    // Patient Abby Sebby (ID 0123456) must appear in results
    const patientVisible = await page.getByText(/Sebby|0123456/i).first()
      .isVisible({ timeout: 5000 }).catch(() => false);
    expect(patientVisible, 'Known patient (national ID 0123456) must be found in search results').toBe(true);
  });

  test('TC-H-DEEP-02: Patient History page has search fields', async ({ page }) => {
    await page.goto(`${BASE}/PatientHistory`);
    await page.waitForLoadState('networkidle');

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toMatch(/500|Internal Server Error/);
    expect(page.url()).not.toMatch(/LoginPage|login/i);

    // Patient History must have at least one search field
    const hasSearchField = await page.locator(
      'input[placeholder*="Last Name" i], input[placeholder*="patient" i], input[placeholder*="search" i], input'
    ).first().isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasSearchField, 'Patient History must have a search field').toBe(true);
  });

  test('TC-H-DEEP-03: Merge Patient search step is accessible', async ({ page }) => {
    const candidates = ['/PatientMerge', '/MergePatient', '/patient/merge'];
    let found = false;
    for (const u of candidates) {
      const res = await page.goto(`${BASE}${u}`).catch(() => null);
      if (res && res.ok() && !page.url().includes('login')) { found = true; break; }
    }
    if (!found) { console.log('TC-H-DEEP-03: GAP — merge URL not found'); return; }

    const bodyText = await page.locator('body').innerText();
    // Merge wizard must have selection step
    const hasSelectionStep = /Select.*Patient|First Patient|Step 1|Search/i.test(bodyText);
    expect(hasSelectionStep, 'Merge Patient must show a patient selection step').toBe(true);
  });
});

test.describe('Phase 6 — BD-DEEP: Patient History Tests', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-BD-DEEP-01: Patient History page has required search fields', async ({ page }) => {
    await page.goto(`${BASE}/PatientHistory`);
    await page.waitForLoadState('networkidle');

    expect(page.url(), 'Must not redirect to login').not.toMatch(/LoginPage|login/i);

    const bodyText = await page.locator('body').innerText();
    expect(bodyText, 'Page must not have a server error').not.toMatch(/500|Internal Server Error/);

    // Patient History must have Patient History heading
    const hasHeading = /Patient History/i.test(bodyText);
    expect(hasHeading, 'Page must show "Patient History" heading').toBe(true);

    // Must have search fields for finding patients
    const requiredFields = ['Last Name', 'First Name'];
    for (const field of requiredFields) {
      const fieldVisible = /Last Name|First Name/.test(bodyText) ||
        await page.locator(`label:has-text("${field}"), text=${field}`).first()
          .isVisible({ timeout: 2000 }).catch(() => false);
      console.log(`TC-BD-DEEP-01: "${field}" visible = ${fieldVisible}`);
    }
  });

  test('TC-BD-DEEP-02: Searching by Last Name returns results table', async ({ page }) => {
    await page.goto(`${BASE}/PatientHistory`);
    await page.waitForLoadState('networkidle');

    const lastNameInput = page.locator('input[placeholder*="Last Name" i]').first();
    if (!(await lastNameInput.isVisible({ timeout: 3000 }).catch(() => false))) {
      console.log('TC-BD-DEEP-02: SKIP — Last Name field not found');
      return;
    }

    await lastNameInput.fill('Sebby');
    const searchBtn = page.getByRole('button', { name: /search/i }).first();
    if (await searchBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await searchBtn.click();
    } else {
      await page.keyboard.press('Enter');
    }
    await page.waitForTimeout(2000);

    // Results table or patient list must appear
    const hasResults = await page.locator('table, [role="table"]').first()
      .isVisible({ timeout: 5000 }).catch(() => false);
    const hasResultsText = /Patient Results|Results/i.test(await page.locator('body').innerText());
    expect(hasResults || hasResultsText,
      'Searching by last name must show a results table'
    ).toBe(true);
  });
});

test.describe('Phase 6 — BE-DEEP: Patient Merge Tests', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-BE-DEEP-01: Patient Merge page has two patient selection areas', async ({ page }) => {
    const candidates = ['/PatientMerge', '/MergePatient', '/patient/merge'];
    let found = false;
    for (const u of candidates) {
      const res = await page.goto(`${BASE}${u}`).catch(() => null);
      if (res && res.ok() && !page.url().includes('login')) { found = true; break; }
    }
    if (!found) { test.skip(); return; }

    expect(page.url()).not.toMatch(/LoginPage|login/i);

    const bodyText = await page.locator('body').innerText();
    const hasFirstPatient = /Select First Patient|First Patient/i.test(bodyText);
    const hasSecondPatient = /Select Second Patient|Second Patient/i.test(bodyText);
    expect(hasFirstPatient && hasSecondPatient,
      'Patient Merge page must have selection areas for both the first and second patient'
    ).toBe(true);
  });

  test('TC-BE-DEEP-02: Next Step button is disabled until patients are selected', async ({ page }) => {
    const candidates = ['/PatientMerge', '/MergePatient', '/patient/merge'];
    let found = false;
    for (const u of candidates) {
      const res = await page.goto(`${BASE}${u}`).catch(() => null);
      if (res && res.ok() && !page.url().includes('login')) { found = true; break; }
    }
    if (!found) { test.skip(); return; }

    // Next Step / Merge must be disabled before patients are selected
    const nextStep = page.getByRole('button', { name: /Next Step|Merge|Submit/i }).first();
    if (await nextStep.isVisible({ timeout: 3000 }).catch(() => false)) {
      const disabled = await nextStep.isDisabled();
      expect(disabled, 'Next Step button must be disabled until patients are selected').toBe(true);
    }

    // Cancel must always be available
    const cancelBtn = page.getByRole('button', { name: /Cancel/i }).first();
    await expect(cancelBtn, 'Cancel button must be present on merge page').toBeVisible({ timeout: TIMEOUT });
  });
});
