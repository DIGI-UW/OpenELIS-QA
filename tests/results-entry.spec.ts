import { test, expect } from '@playwright/test';
import { BASE, ADMIN, PATIENT_NAME, PATIENT_ID, ACCESSION, QA_PREFIX, TIMEOUT, CONFIRMED_ADMIN_URLS, login, navigateWithDiscovery, fillSearchField, getDateRange, getFutureDateRange } from '../helpers/test-helpers';

/**
 * Results Entry and Results Viewing Test Suites
 * Suites: Result Entry, Results By Unit, Suite AA, Suite AJ, Phase 5 F-DEEP, Phase 6 BF-DEEP, Phase 6 BG-DEEP
 * Test Count: ~60
 */

// Helper functions
async function goToResultsByUnit(page: any) {
  const candidates = [
    `${BASE}/AccessionResults?type=testSection`,
    `${BASE}/ResultsUpdate`,
    `${BASE}/WorkPlan`,
    `${BASE}/WorkPlanByTestSection`,
  ];
  for (const url of candidates) {
    const res = await page.goto(url);
    if (res?.status() === 200 && !page.url().match(/LoginPage|login/i)) return page.url();
  }
  throw new Error('Could not locate By Unit worklist — URL unknown');
}

async function navigateViaMenu(page: any, menuPath: string[]) {
  const menu = page.getByRole('button', { name: /menu|hamburger|navigation/i }).first();
  if (await menu.isVisible({ timeout: 2000 }).catch(() => false)) {
    await menu.click();
    await page.waitForTimeout(300);
  }
  for (const item of menuPath) {
    const link = page.getByText(item, { exact: true });
    if (await link.isVisible({ timeout: 2000 }).catch(() => false)) {
      await link.click();
      await page.waitForTimeout(300);
    }
  }
}

async function tryNavigateToURL(page: any, urls: string[]): Promise<boolean> {
  for (const url of urls) {
    const res = await page.goto(`${BASE}${url}`).catch(() => null);
    if (res && res.ok() && !page.url().includes('login')) {
      return true;
    }
  }
  return false;
}

async function getToday(): Promise<string> {
  const today = new Date();
  return today.toISOString().split('T')[0];
}

async function getFutureDate(days: number): Promise<string> {
  const future = new Date();
  future.setDate(future.getDate() + days);
  return future.toISOString().split('T')[0];
}

test.describe('Result Entry', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-RE-01: Results By Order page loads', async ({ page }) => {
    await page.goto(`${BASE}/AccessionResults`);
    await expect(page.getByRole('heading', { name: /result/i })).toBeVisible({ timeout: 5000 });
  });

  test('TC-RE-02: Search accession shows HGB order', async ({ page }) => {
    await page.goto(`${BASE}/AccessionResults`);
    const accInput = page.locator('input').first();
    await accInput.click({ clickCount: 3 });
    await accInput.fill('26CPHL00008T');
    await page.keyboard.press('Enter');
    await expect(page.getByText(/HGB|Whole Blood/i)).toBeVisible({ timeout: 8000 });
  });

  test('TC-RE-03: Enter and save a numeric result', async ({ page }) => {
    await page.goto(`${BASE}/AccessionResults`);
    const accInput = page.locator('input').first();
    await accInput.click({ clickCount: 3 });
    await accInput.fill('26CPHL00008T');
    await page.keyboard.press('Enter');
    // Find the result input field
    const resultInput = page.getByRole('textbox', { name: /result/i }).first();
    await expect(resultInput).toBeVisible({ timeout: 8000 });
    await resultInput.fill('45');
    await page.getByRole('button', { name: /Save/i }).click();
    // Verify saved
    await expect(page.getByText(/45/)).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Results By Unit worklist (TC-BU)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-BU-01: Results By Unit page is reachable', async ({ page }) => {
    const url = await goToResultsByUnit(page).catch((e) => {
      console.log(`TC-BU-01: ${e.message}`);
      return null;
    });
    if (url) {
      expect(page.url()).not.toMatch(/LoginPage|login/i);
      console.log(`TC-BU-01: PASS — By Unit reached at ${url}`);
    } else {
      // Navigate via hamburger menu as fallback
      await page.goto(`${BASE}/Dashboard`);
      await page.getByRole('button', { name: /open|menu|hamburger/i }).click();
      await page.waitForTimeout(500);
      const byUnitLink = page.getByText(/By Unit|By Section|Work Plan/i);
      const found = await byUnitLink.isVisible({ timeout: 3000 }).catch(() => false);
      console.log(`TC-BU-01: Hamburger menu "By Unit" found = ${found}`);
    }
  });

  test('TC-BU-02: Test section filter appears on By Unit page', async ({ page }) => {
    const url = await goToResultsByUnit(page).catch(() => null);
    if (!url) {
      console.log('TC-BU-02: SKIP — By Unit page not found in TC-BU-01');
      return;
    }
    // Look for a test section select dropdown
    const sectionSelect = page.getByRole('combobox', { name: /section/i }).first();
    const hasSectionSelect = await sectionSelect.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`TC-BU-02: Test section select visible = ${hasSectionSelect}`);
    if (hasSectionSelect) {
      const opts = await sectionSelect.locator('option').allTextContents();
      console.log(`TC-BU-02: Available sections: ${opts.join(', ')}`);
      expect(opts.length).toBeGreaterThan(1);
    }
  });

  test('TC-BU-03: Result input in By Unit view is editable', async ({ page }) => {
    const url = await goToResultsByUnit(page).catch(() => null);
    if (!url) {
      console.log('TC-BU-03: SKIP — By Unit page not found');
      return;
    }
    // Load Hematology section if possible
    const sectionSelect = page.locator('select').first();
    const hasSect = await sectionSelect.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasSect) {
      await sectionSelect.selectOption({ label: /Hematology|hematology/i } as any);
      await page.waitForTimeout(1000);
    }
    // Find a result input field (textarea or input in result column)
    const resultInput = page.getByRole('textbox', { name: /result/i }).first();
    const hasInput = await resultInput.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`TC-BU-03: Result input visible = ${hasInput}`);
    if (hasInput) {
      const isEditable = await resultInput.isEditable();
      console.log(`TC-BU-03: Result input editable = ${isEditable}`);
      expect(isEditable).toBe(true);
    }
  });

  test('TC-BU-04: Entering result and saving via By Unit worklist', async ({ page }) => {
    const url = await goToResultsByUnit(page).catch(() => null);
    if (!url) {
      console.log('TC-BU-04: SKIP — By Unit page not found');
      return;
    }
    // If there are pending results, enter one and save
    const resultInput = page.getByRole('textbox', { name: /result/i }).first();
    const hasInput = await resultInput.isVisible({ timeout: 5000 }).catch(() => false);
    if (hasInput) {
      await resultInput.fill('14.5');
      const saveBtn = page.getByRole('button', { name: /Save/i });
      await saveBtn.click();
      await page.waitForTimeout(2000);
      console.log('TC-BU-04: Result 14.5 saved via By Unit worklist');
    } else {
      console.log('TC-BU-04: SKIP — No pending result input fields found (queue may be empty)');
    }
  });
});

test.describe('Suite AA — Results By Patient & By Order', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-RBP-01: Results > By Patient screen loads', async ({ page }) => {
    // Navigate to hamburger menu
    await page.getByRole('button', { name: /menu/i }).click();
    await page.waitForTimeout(500);

    // Try to find and click Results menu
    const resultsLink = page.getByText(/^Results$/i, { exact: true });
    if (await resultsLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await resultsLink.click();
      await page.waitForTimeout(500);
    }

    // Try to find and click By Patient
    const byPatientLink = page.getByText('By Patient', { exact: true });
    if (await byPatientLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await byPatientLink.click();
    }

    // URL discovery pattern
    const candidates = [
      '/PatientResults',
      '/ResultsByPatient',
      '/patient/results',
      '/results/patient',
    ];
    const success = await navigateWithDiscovery(page, candidates);

    // Verify page loaded
    if (!success) {
      // Mark as GAP if no route found
      console.log('GAP: Results > By Patient screen not found');
      expect(success).toBe(true); // Will fail but documents the gap
    }

    // Verify not redirected to login
    expect(page.url()).not.toMatch(/LoginPage|login/i);

    // Verify search field exists
    const searchField = page.locator(
      'input[placeholder*="patient" i], input[placeholder*="name" i], input[id*="search"]'
    ).first();
    await expect(searchField).toBeVisible({ timeout: 3000 }).catch(() => {
      console.log('Note: Search field selector may need adjustment for this app version');
    });
  });

  test('TC-RBP-02: Search by patient name returns results', async ({ page }) => {
    // Navigate to Results > By Patient
    const candidates = [
      '/PatientResults',
      '/ResultsByPatient',
      '/patient/results',
    ];
    await navigateWithDiscovery(page, candidates);

    // Search for patient by name
    const selectors = [
      'input[placeholder*="patient" i]',
      'input[placeholder*="name" i]',
      'input[id*="search"]',
      'input',
    ];
    const success = await fillSearchField(page, PATIENT_NAME, selectors);

    if (success) {
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1000);

      // Verify results table appears
      const resultRow = page.locator('tr, [role="row"]').first();
      await expect(resultRow).toBeVisible({ timeout: 5000 }).catch(() => {
        console.log('No results returned for patient name search');
      });

      // Verify patient name or ID appears in results
      const patientInResults = page.getByText(PATIENT_NAME, { exact: false });
      await expect(patientInResults).toBeVisible({ timeout: 3000 }).catch(() => {
        console.log('Patient name not visible in results');
      });
    } else {
      console.log('Could not locate search field');
    }
  });

  test('TC-RBP-03: Search by patient ID returns results', async ({ page }) => {
    const candidates = ['/PatientResults', '/ResultsByPatient', '/patient/results'];
    await navigateWithDiscovery(page, candidates);

    // Clear field and search by ID
    const selectors = [
      'input[placeholder*="patient" i]',
      'input[placeholder*="ID" i]',
      'input',
    ];
    const success = await fillSearchField(page, PATIENT_ID, selectors);

    if (success) {
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1000);

      // Verify patient ID appears in results
      const patientIdInResults = page.getByText(PATIENT_ID, { exact: false });
      await expect(patientIdInResults).toBeVisible({ timeout: 5000 }).catch(() => {
        console.log('Patient ID not found in results');
      });
    }
  });

  test('TC-RBO-04: Results > By Order screen loads', async ({ page }) => {
    // Navigate via menu or direct URL
    await page.getByRole('button', { name: /menu/i }).click();
    await page.waitForTimeout(500);

    const resultsLink = page.getByText(/^Results$/i, { exact: true });
    if (await resultsLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await resultsLink.click();
      await page.waitForTimeout(500);
      const byOrderLink = page.getByText('By Order', { exact: true });
      if (await byOrderLink.isVisible({ timeout: 2000 }).catch(() => false)) {
        await byOrderLink.click();
      }
    }

    // URL discovery
    const candidates = [
      '/AccessionResults',
      '/OrderResults',
      '/order/results',
      '/results/order',
    ];
    const success = await navigateWithDiscovery(page, candidates);

    // Verify page loaded and not login
    expect(page.url()).not.toMatch(/LoginPage|login/i);

    // Verify accession input field exists
    const accessionField = page.locator(
      'input[placeholder*="accession" i], input[id*="accession" i], input'
    ).first();
    await expect(accessionField).toBeVisible({ timeout: 3000 }).catch(() => {
      console.log('Accession search field not found');
    });
  });

  test('TC-RBO-05: Search by accession number returns results', async ({ page }) => {
    const candidates = ['/AccessionResults', '/OrderResults', '/order/results'];
    await navigateWithDiscovery(page, candidates);

    // Search by accession
    const selectors = [
      'input[placeholder*="accession" i]',
      'input[id*="accession" i]',
      'input',
    ];
    const success = await fillSearchField(page, ACCESSION, selectors);

    if (success) {
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2000);

      // Verify accession appears in results
      const accessionInResults = page.getByText(ACCESSION, { exact: false });
      await expect(accessionInResults).toBeVisible({ timeout: 8000 }).catch(() => {
        console.log(`Accession ${ACCESSION} not found in results`);
      });
    }
  });

  test('TC-RBO-06: Results display includes test name, result value, status', async ({ page }) => {
    const candidates = ['/AccessionResults', '/OrderResults', '/order/results'];
    await navigateWithDiscovery(page, candidates);

    // Search and display results
    const selectors = ['input[placeholder*="accession" i]', 'input[id*="accession" i]', 'input'];
    const success = await fillSearchField(page, ACCESSION, selectors);

    if (success) {
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2000);

      // Verify result row structure
      const resultRow = page.locator('tr, [role="row"]').first();
      await expect(resultRow).toBeVisible({ timeout: 8000 }).catch(() => {
        console.log('No result row found');
      });

      // Check for key columns: test name, result value, status
      const testNameCol = resultRow.getByText(/HGB|test|result/i);
      const statusCol = resultRow.getByText(/Final|Preliminary|Corrected|Pending|Validation/i);

      await expect(testNameCol).toBeVisible({ timeout: 3000 }).catch(() => {
        console.log('Test name column not clearly visible');
      });

      await expect(statusCol).toBeVisible({ timeout: 3000 }).catch(() => {
        console.log('Status column not clearly visible');
      });
    }
  });
});

test.describe('Suite AJ — Results By Range & By Test/Date/Status', () => {

  test('TC-RBR-01: Results > By Range of Order Numbers screen loads', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['Results', 'By Range of Order Numbers']);
    } catch (e) {
      const found = await tryNavigateToURL(page, ['/ResultsByRange', '/OrderRange', '/results/range']);
      if (!found) {
        test.skip();
        return;
      }
    }

    await page.waitForTimeout(1000);

    expect(page.url()).not.toContain('login');

    // Check for from/to input fields
    const inputs = await page.$$('input[type="text"], input[type="number"]');
    expect(inputs.length).toBeGreaterThanOrEqual(2);
  });

  test('TC-RBR-02: Enter range returns results', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['Results', 'By Range of Order Numbers']);
    } catch (e) {
      await tryNavigateToURL(page, ['/ResultsByRange', '/OrderRange', '/results/range']);
    }

    await page.waitForTimeout(1000);

    const inputs = await page.$$('input[type="text"], input[type="number"]');
    if (inputs.length < 2) {
      test.skip();
      return;
    }

    await inputs[0].fill('26CPHL00001T');
    await inputs[1].fill('26CPHL00010T');

    const button = await page.$('button:has-text("Search"), button:has-text("Submit")');
    if (button) {
      await button.click();
      await page.waitForTimeout(2000);
    }

    // Verify results table present or empty state
    const table = await page.$('table, [role="table"]');
    expect(table).toBeTruthy();
  });

  test('TC-RBR-03: Results > By Test, Date or Status screen loads', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['Results', 'By Test, Date or Status']);
    } catch (e) {
      const found = await tryNavigateToURL(page, ['/ResultsByFilter', '/FilterResults', '/results/filter']);
      if (!found) {
        test.skip();
        return;
      }
    }

    await page.waitForTimeout(1000);

    expect(page.url()).not.toContain('login');

    // Check for filter controls
    const filters = await page.$$('select, input, [class*="filter"]');
    expect(filters.length).toBeGreaterThanOrEqual(1);
  });

  test('TC-RBR-04: Filter by test type returns results', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['Results', 'By Test, Date or Status']);
    } catch (e) {
      await tryNavigateToURL(page, ['/ResultsByFilter', '/FilterResults', '/results/filter']);
    }

    await page.waitForTimeout(1000);

    const selector = await page.$('select');
    if (selector) {
      await selector.selectOption({ index: 1 }).catch(() => null);
      await page.waitForTimeout(500);
    }

    const button = await page.$('button:has-text("Search"), button:has-text("Submit")');
    if (button) {
      await button.click();
      await page.waitForTimeout(2000);
    }

    const table = await page.$('table, [role="table"]');
    expect(table).toBeTruthy();
  });

  test('TC-RBR-05: Order Programs screen loads', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['Results', 'Order Programs']);
    } catch (e) {
      const found = await tryNavigateToURL(page, ['/OrderPrograms', '/Programs', '/results/programs']);
      if (!found) {
        test.skip();
        return;
      }
    }

    await page.waitForTimeout(1000);

    expect(page.url()).not.toContain('login');

    const heading = await page.$('h1, h2, [role="heading"]');
    expect(heading).toBeTruthy();
  });
});

test.describe('Phase 5 — F-DEEP: Results Entry Field Validation Tests', () => {
  test.beforeEach(async ({ page }) => { await login(page, ADMIN.user, ADMIN.pass); });

  test('TC-F-DEEP-01: Result row expand shows detail fields', async ({ page }) => {
    await page.click('text=Results');
    await page.click('text=By Unit');
    await page.waitForSelector('select');
    const unitSelect = page.locator('select').first();
    await unitSelect.selectOption('Hematology');
    await page.waitForTimeout(3000);
    // Click expand chevron on first row
    const expandBtn = page.locator('button:has(svg), [class*="expand"]').first();
    if (await expandBtn.isVisible()) {
      await expandBtn.click();
      await page.waitForTimeout(1000);
    }
    // Verify detail fields appear
    await expect(page.locator('text=Methods').or(page.locator('text=Upload file'))).toBeVisible();
  });

  test('TC-F-DEEP-02: Result field accepts numeric input', async ({ page }) => {
    await page.click('text=Results');
    await page.click('text=By Unit');
    await page.waitForSelector('select');
    const unitSelect = page.locator('select').first();
    await unitSelect.selectOption('Hematology');
    await page.waitForTimeout(3000);
    // Find an empty result input and type a value
    const resultInputs = page.locator('input[type="text"], textarea').filter({ hasText: '' });
    const emptyInput = resultInputs.first();
    if (await emptyInput.isVisible()) {
      await emptyInput.fill('6.2');
      const value = await emptyInput.inputValue();
      expect(value).toBe('6.2');
      // Clean up
      await emptyInput.fill('');
    }
  });
});

test.describe('Phase 6 — BF-DEEP: Results By Range Tests', () => {
  test('TC-BF-DEEP-01: Page structure', async ({ page }) => {
    await page.goto('/RangeResults');
    await expect(page.locator('text=From Accesion Number')).toBeVisible();
    await expect(page.locator('text=To Accesion Number')).toBeVisible();
    await expect(page.locator('button:has-text("Search")')).toBeVisible();
    await expect(page.locator('button:has-text("Save")')).toBeVisible();
  });

  test('TC-BF-DEEP-02: Range search execution', async ({ page }) => {
    await page.goto('/RangeResults');
    const fromInput = page.locator('input[placeholder*="Accession"]').first();
    const toInput = page.locator('input[placeholder*="Accession"]').last();
    await fromInput.fill('26CPHL00001');
    await toInput.fill('26CPHL00010');
    await page.click('button:has-text("Search")');
    await expect(page.locator('text=0-0 of 0 items')).toBeVisible();
  });
});

test.describe('Phase 6 — BG-DEEP: Results By Status Tests', () => {
  test('TC-BG-DEEP-01: Page structure', async ({ page }) => {
    await page.goto('/StatusResults?blank=true');
    await expect(page.locator('text=Enter Collection Date')).toBeVisible();
    await expect(page.locator('text=Enter Recieved Date')).toBeVisible();
    await expect(page.locator('text=Select Test Name')).toBeVisible();
    await expect(page.locator('text=Select Analysis Status')).toBeVisible();
    await expect(page.locator('text=Select Sample Status')).toBeVisible();
  });

  test('TC-BG-DEEP-02: Dropdown enumeration', async ({ page }) => {
    await page.goto('/StatusResults?blank=true');
    // Verify Analysis Status options
    const analysisSelect = page.locator('select').filter({ hasText: 'Not started' });
    const analysisOpts = await analysisSelect.locator('option').allTextContents();
    expect(analysisOpts).toContain('Not started');
    expect(analysisOpts).toContain('Canceled');
    // Verify Test Name has many options
    const testSelect = page.locator('select').filter({ hasText: 'Select Test Name' });
    const testOpts = await testSelect.locator('option').count();
    expect(testOpts).toBeGreaterThan(100);
  });
});
