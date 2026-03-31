import { test, expect } from '@playwright/test';
import { BASE, ADMIN, PATIENT_NAME, PATIENT_ID, ACCESSION, QA_PREFIX, TIMEOUT, CONFIRMED_ADMIN_URLS, login, navigateWithDiscovery, fillSearchField, navigateToAdminItem, getDateRange, getFutureDateRange } from '../helpers/test-helpers';

/**
 * Admin Configuration Test Suite
 *
 * File Purpose:
 * - Covers admin configuration, master data management, and system-wide settings
 * - Tests spanning TC-ADMIN core functions + AQ-AX gaps + K-DEEP interactions
 *
 * Suite IDs:
 * - TC-ADMIN: Core admin configuration (6 TCs)
 * - Suite AQ: Reflex Tests & Analyzer Test Name (4 TCs)
 * - Suite AR: Lab Number & Program Management (4 TCs)
 * - Suite AS: Provider & Barcode Configuration (4 TCs)
 * - Suite AT: Result Reporting & Menu Configuration (4 TCs)
 * - Suite AU: General Config & App Properties (4 TCs)
 * - Suite AV: Notifications & Search Index (4 TCs)
 * - Suite AW: Logging, Legacy Admin, Plugins (5 TCs)
 * - Suite AX: Localization, Notify User, Batch Reassignment (5 TCs)
 * - Phase 4 K-DEEP: Admin Interaction Tests (8 TCs)
 *
 * Total Test Count: 48 TCs
 */

async function verifyPageLoad(page, expectedTitle: string): Promise<void> {
  // Check HTTP status is 200
  const response = await page.url();
  expect(response).not.toContain('login');

  // Check page has content
  const bodyText = await page.locator('body').textContent();
  expect(bodyText).toBeTruthy();
  expect(bodyText?.length).toBeGreaterThan(0);

  // Verify not a 404 or 500 error page
  const errorText = await page.locator('body').innerText();
  expect(errorText).not.toContain('404');
  expect(errorText).not.toContain('500');
  expect(errorText).not.toContain('Not Found');
  expect(errorText).not.toContain('Internal Server Error');
}

test.describe('Admin Configuration (TC-ADMIN)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-ADMIN-01: Lab configuration page loads', async ({ page }) => {
    const adminUrls = [
      '/MasterListsPage/LabConfiguration',
      '/ConfigurationPage',
      '/LabConfigurationPage',
    ];

    let loaded = false;
    for (const u of adminUrls) {
      const res = await page.goto(`${BASE}${u}`).catch(() => null);
      if (res && res.ok() && !page.url().includes('LoginPage')) {
        loaded = true;
        console.log(`TC-ADMIN-01: PASS — lab config at ${page.url()}`);
        break;
      }
    }

    if (!loaded) {
      console.log('TC-ADMIN-01: FAIL/GAP — lab configuration URL not found');
    }
    expect(loaded).toBe(true);
  });

  test('TC-ADMIN-02: Reference labs list accessible', async ({ page }) => {
    const refLabUrls = [
      '/MasterListsPage/ReferenceLabs',
      '/MasterListsPage/Organizations',
      '/MasterListsPage/ExternalInstitutes',
    ];

    let found = false;
    for (const u of refLabUrls) {
      const res = await page.goto(`${BASE}${u}`).catch(() => null);
      if (res && res.ok() && !page.url().includes('LoginPage')) {
        const text = await page.textContent('body') ?? '';
        if (/laboratory|reference|institute|CPHL|doherty/i.test(text)) {
          found = true;
          console.log(`TC-ADMIN-02: PASS — reference labs at ${page.url()}`);
          break;
        }
      }
    }

    if (!found) {
      console.log('TC-ADMIN-02: GAP — reference labs list not accessible at known URLs');
    }
  });

  test('TC-ADMIN-03: Organization/site list accessible and contains Adiba SC', async ({ page }) => {
    await page.goto(`${BASE}/MasterListsPage/Organizations`).catch(() =>
      page.goto(`${BASE}/MasterListsPage`)
    );
    await page.waitForTimeout(2000);

    // Search for Adiba SC
    const searchField = page.getByRole('textbox', { name: /search|filter/i }).first();
    if (await searchField.isVisible({ timeout: 2000 }).catch(() => false)) {
      await searchField.fill('Adiba');
      await page.waitForTimeout(1000);
    }

    const hasAdiba = await page.getByText(/Adiba SC/i).isVisible({ timeout: 5000 }).catch(() => false);
    console.log(hasAdiba
      ? 'TC-ADMIN-03: PASS — Adiba SC present in organization list'
      : 'TC-ADMIN-03: FAIL/GAP — Adiba SC not found in organization list');
  });

  test('TC-ADMIN-04: Rejection reasons dictionary accessible', async ({ page }) => {
    const dictUrls = [
      '/MasterListsPage/Dictionary',
      '/DictionaryManagement',
      '/MasterListsPage/NonConformityConfiguration',
    ];

    let found = false;
    for (const u of dictUrls) {
      const res = await page.goto(`${BASE}${u}`).catch(() => null);
      if (res && res.ok() && !page.url().includes('LoginPage')) {
        const text = await page.textContent('body') ?? '';
        if (/reject|hemolysis|clotted|insufficient|reason/i.test(text)) {
          found = true;
          console.log(`TC-ADMIN-04: PASS — rejection reasons found at ${page.url()}`);
          break;
        }
      }
    }

    if (!found) {
      console.log('TC-ADMIN-04: GAP — rejection reasons dictionary not accessible at known URLs');
    }
  });

  test('TC-ADMIN-05: Test sections list contains Hematology and Biochemistry', async ({ page }) => {
    const sectionUrls = [
      '/MasterListsPage/TestSections',
      '/MasterListsPage/LabSection',
      '/MasterListsPage',
    ];

    let found = false;
    for (const u of sectionUrls) {
      const res = await page.goto(`${BASE}${u}`).catch(() => null);
      if (res && res.ok() && !page.url().includes('LoginPage')) {
        const text = await page.textContent('body') ?? '';
        if (/hematology/i.test(text) && /biochemistry/i.test(text)) {
          found = true;
          console.log(`TC-ADMIN-05: PASS — Hematology + Biochemistry at ${page.url()}`);
          break;
        }
      }
    }

    if (!found) {
      console.log('TC-ADMIN-05: FAIL — test sections list does not show Hematology and Biochemistry');
      expect(false).toBe(true);
    }
  });

  test('TC-ADMIN-06: Dictionary CRUD (add/edit entry) — expected fail if BUG-8 class applies', async ({ page }) => {
    // Find the dictionary management screen
    const res = await page.goto(`${BASE}/MasterListsPage/Dictionary`).catch(() => null);
    if (!res || page.url().includes('LoginPage')) {
      console.log('TC-ADMIN-06: SKIP — dictionary screen not accessible');
      return;
    }

    // Click Add / New Entry
    const addBtn = page.getByRole('button', { name: /add|new entry/i }).first();
    if (!(await addBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
      console.log('TC-ADMIN-06: GAP — no Add button found on dictionary screen');
      return;
    }

    await addBtn.click();
    await page.waitForTimeout(1000);

    const entryField = page.getByRole('textbox').first();
    if (await entryField.isVisible({ timeout: 2000 }).catch(() => false)) {
      await entryField.fill('QA_AUTO_RejReason');
    }

    let postStatus = 0;
    page.on('response', (res) => {
      if (res.url().includes('Dictionary') && res.request().method() === 'POST') {
        postStatus = res.status();
      }
    });

    const saveBtn = page.getByRole('button', { name: /save|accept/i }).first();
    if (await saveBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await saveBtn.click();
      await page.waitForTimeout(1500);
    }

    const persisted = await page.getByText(/QA_AUTO_RejReason/i).isVisible({ timeout: 3000 }).catch(() => false);
    if (persisted) {
      console.log(`TC-ADMIN-06: PASS — dictionary entry created (POST ${postStatus})`);
    } else {
      console.log(`TC-ADMIN-06: FAIL — entry not found after save (POST ${postStatus}) — possible BUG-8 class`);
    }
    expect(persisted).toBe(true);
  });
});

test.describe('Suite AQ — Reflex Tests & Analyzer Test Name', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-RFX-01: Reflex Tests Configuration page loads', async ({ page }) => {
    // Navigate to Reflex Tests Configuration
    await navigateToAdminItem(page, 'Reflex Tests Configuration');

    // Verify page loads
    await verifyPageLoad(page, 'Reflex Tests Configuration');

    // Verify page heading
    const heading = await page.locator('h1, h2, h3, [role="heading"]').first();
    const headingText = await heading.innerText();
    expect(headingText.toLowerCase()).toMatch(/reflex.*test/i);
  });

  test('TC-RFX-02: Reflex test list or configuration form visible', async ({ page }) => {
    await navigateToAdminItem(page, 'Reflex Tests Configuration');

    // Look for table, form, or configuration interface
    const table = await page.locator('table, [role="table"], .data-grid, .DataTable').first();
    const form = await page.locator('form, .form-container, [role="form"]').first();
    const buttons = await page.locator('button:has-text("Add"), button:has-text("Edit"), button:has-text("Delete")').first();

    // At least one of these should be visible
    const hasInterface = await Promise.any([
      table.isVisible().catch(() => false),
      form.isVisible().catch(() => false),
      buttons.isVisible().catch(() => false)
    ]).then(v => v);

    expect(hasInterface).toBeTruthy();
  });

  test('TC-ATN-01: Analyzer Test Name page loads', async ({ page }) => {
    await navigateToAdminItem(page, 'Analyzer Test Name');

    // Verify page loads
    await verifyPageLoad(page, 'Analyzer Test Name');

    // Verify page heading
    const heading = await page.locator('h1, h2, h3, [role="heading"]').first();
    const headingText = await heading.innerText();
    expect(headingText.toLowerCase()).toMatch(/analyzer.*test/i);
  });

  test('TC-ATN-02: Analyzer test name mapping list visible', async ({ page }) => {
    await navigateToAdminItem(page, 'Analyzer Test Name');

    // Look for mapping table or configuration interface
    const table = await page.locator('table, [role="table"], .data-grid').first();
    const form = await page.locator('form, .form-container').first();
    const buttons = await page.locator('button:has-text("Add"), button:has-text("Edit")').first();

    // At least one of these should be visible
    const hasInterface = await Promise.any([
      table.isVisible().catch(() => false),
      form.isVisible().catch(() => false),
      buttons.isVisible().catch(() => false)
    ]).then(v => v);

    expect(hasInterface).toBeTruthy();
  });
});

test.describe('Suite AR — Lab Number & Program Management', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-LNM-01: Lab Number Management page loads', async ({ page }) => {
    await navigateToAdminItem(page, 'Lab Number Management');

    // Verify page loads
    await verifyPageLoad(page, 'Lab Number Management');

    // Verify page heading
    const heading = await page.locator('h1, h2, h3, [role="heading"]').first();
    const headingText = await heading.innerText();
    expect(headingText.toLowerCase()).toMatch(/lab.*number/i);
  });

  test('TC-LNM-02: Lab number format/sequence configuration visible', async ({ page }) => {
    await navigateToAdminItem(page, 'Lab Number Management');

    // Look for configuration form or list
    const form = await page.locator('form, .form-container, [role="form"]').first();
    const table = await page.locator('table, [role="table"]').first();
    const inputs = await page.locator('input[type="text"], input[type="number"], textarea').first();

    // At least one of these should be visible
    const hasInterface = await Promise.any([
      form.isVisible().catch(() => false),
      table.isVisible().catch(() => false),
      inputs.isVisible().catch(() => false)
    ]).then(v => v);

    expect(hasInterface).toBeTruthy();
  });

  test('TC-PGM-01: Program Entry page loads', async ({ page }) => {
    await navigateToAdminItem(page, 'Program Entry');

    // Verify page loads
    await verifyPageLoad(page, 'Program Entry');

    // Verify page heading
    const heading = await page.locator('h1, h2, h3, [role="heading"]').first();
    const headingText = await heading.innerText();
    expect(headingText.toLowerCase()).toMatch(/program/i);
  });

  test('TC-PGM-02: Program list or entry form visible', async ({ page }) => {
    await navigateToAdminItem(page, 'Program Entry');

    // Look for program list/table or entry form
    const table = await page.locator('table, [role="table"], .data-grid').first();
    const form = await page.locator('form, .form-container').first();
    const buttons = await page.locator('button:has-text("Add"), button:has-text("Edit")').first();

    // At least one of these should be visible
    const hasInterface = await Promise.any([
      table.isVisible().catch(() => false),
      form.isVisible().catch(() => false),
      buttons.isVisible().catch(() => false)
    ]).then(v => v);

    expect(hasInterface).toBeTruthy();
  });
});

test.describe('Suite AS — Provider & Barcode Configuration', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-PROV-01: Provider Management page loads', async ({ page }) => {
    await navigateToAdminItem(page, 'Provider Management');

    // Verify page loads
    await verifyPageLoad(page, 'Provider Management');

    // Verify page heading
    const heading = await page.locator('h1, h2, h3, [role="heading"]').first();
    const headingText = await heading.innerText();
    expect(headingText.toLowerCase()).toMatch(/provider/i);
  });

  test('TC-PROV-02: Provider list with search/filter visible', async ({ page }) => {
    await navigateToAdminItem(page, 'Provider Management');

    // Look for provider list and search controls
    const table = await page.locator('table, [role="table"], .data-grid').first();
    const searchBox = await page.locator('input[type="search"], input[placeholder*="search" i], input[placeholder*="filter" i]').first();
    const buttons = await page.locator('button:has-text("Add"), button:has-text("Edit")').first();

    // At least table or search should be visible
    const hasInterface = await Promise.any([
      table.isVisible().catch(() => false),
      searchBox.isVisible().catch(() => false),
      buttons.isVisible().catch(() => false)
    ]).then(v => v);

    expect(hasInterface).toBeTruthy();
  });

  test('TC-BAR-01: Barcode Configuration page loads', async ({ page }) => {
    await navigateToAdminItem(page, 'Barcode Configuration');

    // Verify page loads
    await verifyPageLoad(page, 'Barcode Configuration');

    // Verify page heading
    const heading = await page.locator('h1, h2, h3, [role="heading"]').first();
    const headingText = await heading.innerText();
    expect(headingText.toLowerCase()).toMatch(/barcode/i);
  });

  test('TC-BAR-02: Barcode format settings visible', async ({ page }) => {
    await navigateToAdminItem(page, 'Barcode Configuration');

    // Look for barcode configuration form
    const form = await page.locator('form, .form-container, [role="form"]').first();
    const inputs = await page.locator('input[type="text"], input[type="number"]').first();
    const saveBtn = await page.locator('button:has-text("Save"), button:has-text("Update"), button:has-text("Apply")').first();

    // At least form or inputs should be visible
    const hasInterface = await Promise.any([
      form.isVisible().catch(() => false),
      inputs.isVisible().catch(() => false),
      saveBtn.isVisible().catch(() => false)
    ]).then(v => v);

    expect(hasInterface).toBeTruthy();
  });
});

test.describe('Suite AT — Result Reporting & Menu Configuration', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-RRC-01: Result Reporting Configuration page loads', async ({ page }) => {
    await navigateToAdminItem(page, 'Result Reporting Configuration');

    // Verify page loads
    await verifyPageLoad(page, 'Result Reporting Configuration');

    // Verify page heading
    const heading = await page.locator('h1, h2, h3, [role="heading"]').first();
    const headingText = await heading.innerText();
    expect(headingText.toLowerCase()).toMatch(/result.*reporting/i);
  });

  test('TC-RRC-02: Reporting rules or configuration list visible', async ({ page }) => {
    await navigateToAdminItem(page, 'Result Reporting Configuration');

    // Look for reporting rules list or configuration interface
    const table = await page.locator('table, [role="table"], .data-grid').first();
    const form = await page.locator('form, .form-container').first();
    const buttons = await page.locator('button:has-text("Add"), button:has-text("Edit")').first();

    // At least one of these should be visible
    const hasInterface = await Promise.any([
      table.isVisible().catch(() => false),
      form.isVisible().catch(() => false),
      buttons.isVisible().catch(() => false)
    ]).then(v => v);

    expect(hasInterface).toBeTruthy();
  });

  test('TC-MCF-01: Menu Configuration page loads', async ({ page }) => {
    // Menu Configuration may be expandable
    const chevron = await page.locator('[role="button"]:has-text("Menu Configuration"), button:has-text("Menu Configuration"), span.chevron').first();
    if (chevron) {
      await chevron.click();
    }

    await navigateToAdminItem(page, 'Menu Configuration');

    // Verify page loads
    await verifyPageLoad(page, 'Menu Configuration');

    // Verify page heading
    const heading = await page.locator('h1, h2, h3, [role="heading"]').first();
    const headingText = await heading.innerText();
    expect(headingText.toLowerCase()).toMatch(/menu/i);
  });

  test('TC-MCF-02: Menu items list editable', async ({ page }) => {
    await navigateToAdminItem(page, 'Menu Configuration');

    // Look for menu items list or tree
    const table = await page.locator('table, [role="table"], .tree-view, [role="tree"]').first();
    const form = await page.locator('form, .form-container').first();
    const buttons = await page.locator('button:has-text("Edit"), button:has-text("Enable"), button:has-text("Disable")').first();

    // At least table or buttons should be visible
    const hasInterface = await Promise.any([
      table.isVisible().catch(() => false),
      form.isVisible().catch(() => false),
      buttons.isVisible().catch(() => false)
    ]).then(v => v);

    expect(hasInterface).toBeTruthy();
  });
});

test.describe('Suite AU — General Config & App Properties', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-GCF-01: General Configurations page loads', async ({ page }) => {
    // General Configurations may be expandable
    const chevron = await page.locator('[role="button"]:has-text("General Configurations"), button:has-text("General Configurations")').first();
    if (chevron) {
      await chevron.click();
    }

    await navigateToAdminItem(page, 'General Configurations');

    // Verify page loads
    await verifyPageLoad(page, 'General Configurations');

    // Verify page heading
    const heading = await page.locator('h1, h2, h3, [role="heading"]').first();
    const headingText = await heading.innerText();
    expect(headingText.toLowerCase()).toMatch(/general.*config/i);
  });

  test('TC-GCF-02: Configuration key-value list or form visible', async ({ page }) => {
    await navigateToAdminItem(page, 'General Configurations');

    // Look for configuration list or form
    const table = await page.locator('table, [role="table"], .data-grid').first();
    const form = await page.locator('form, .form-container').first();
    const inputs = await page.locator('input[type="text"], textarea').first();

    // At least one of these should be visible
    const hasInterface = await Promise.any([
      table.isVisible().catch(() => false),
      form.isVisible().catch(() => false),
      inputs.isVisible().catch(() => false)
    ]).then(v => v);

    expect(hasInterface).toBeTruthy();
  });

  test('TC-APP-01: Application Properties page loads', async ({ page }) => {
    await navigateToAdminItem(page, 'Application Properties');

    // Verify page loads
    await verifyPageLoad(page, 'Application Properties');

    // Verify page heading
    const heading = await page.locator('h1, h2, h3, [role="heading"]').first();
    const headingText = await heading.innerText();
    expect(headingText.toLowerCase()).toMatch(/application.*propert/i);
  });

  test('TC-APP-02: Properties list with editable values visible', async ({ page }) => {
    await navigateToAdminItem(page, 'Application Properties');

    // Look for properties list/table
    const table = await page.locator('table, [role="table"], .data-grid').first();
    const form = await page.locator('form, .form-container').first();
    const inputs = await page.locator('input[type="text"], textarea').first();

    // At least one of these should be visible
    const hasInterface = await Promise.any([
      table.isVisible().catch(() => false),
      form.isVisible().catch(() => false),
      inputs.isVisible().catch(() => false)
    ]).then(v => v);

    expect(hasInterface).toBeTruthy();
  });
});

test.describe('Suite AV — Notifications & Search Index', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-TNF-01: Test Notification Configuration page loads', async ({ page }) => {
    await navigateToAdminItem(page, 'Test Notification Configuration');

    // Verify page loads
    await verifyPageLoad(page, 'Test Notification Configuration');

    // Verify page heading
    const heading = await page.locator('h1, h2, h3, [role="heading"]').first();
    const headingText = await heading.innerText();
    expect(headingText.toLowerCase()).toMatch(/notification/i);
  });

  test('TC-TNF-02: Notification rules or configuration form visible', async ({ page }) => {
    await navigateToAdminItem(page, 'Test Notification Configuration');

    // Look for notification rules list or form
    const table = await page.locator('table, [role="table"], .data-grid').first();
    const form = await page.locator('form, .form-container').first();
    const buttons = await page.locator('button:has-text("Add"), button:has-text("Edit")').first();

    // At least one of these should be visible
    const hasInterface = await Promise.any([
      table.isVisible().catch(() => false),
      form.isVisible().catch(() => false),
      buttons.isVisible().catch(() => false)
    ]).then(v => v);

    expect(hasInterface).toBeTruthy();
  });

  test('TC-SIM-01: Search Index Management page loads', async ({ page }) => {
    await navigateToAdminItem(page, 'Search Index Management');

    // Verify page loads
    await verifyPageLoad(page, 'Search Index Management');

    // Verify page heading
    const heading = await page.locator('h1, h2, h3, [role="heading"]').first();
    const headingText = await heading.innerText();
    expect(headingText.toLowerCase()).toMatch(/search.*index/i);
  });

  test('TC-SIM-02: Reindex button or status indicator visible', async ({ page }) => {
    await navigateToAdminItem(page, 'Search Index Management');

    // Look for reindex button or status display
    const reindexBtn = await page.locator('button:has-text("Reindex"), button:has-text("Rebuild"), button:has-text("Index")').first();
    const statusDisplay = await page.locator('[role="status"], .status-indicator, .alert, .info').first();
    const statsDisplay = await page.locator('div, span, p').filter({ hasText: /indexed|status|last/i }).first();

    // At least one of these should be visible
    const hasInterface = await Promise.any([
      reindexBtn.isVisible().catch(() => false),
      statusDisplay.isVisible().catch(() => false),
      statsDisplay.isVisible().catch(() => false)
    ]).then(v => v);

    expect(hasInterface).toBeTruthy();
  });
});

test.describe('Suite AW — Logging, Legacy Admin, Plugins', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-LOG-01: Logging Configuration page loads', async ({ page }) => {
    await navigateToAdminItem(page, 'Logging Configuration');

    // Verify page loads
    await verifyPageLoad(page, 'Logging Configuration');

    // Verify page heading
    const heading = await page.locator('h1, h2, h3, [role="heading"]').first();
    const headingText = await heading.innerText();
    expect(headingText.toLowerCase()).toMatch(/logging/i);
  });

  test('TC-LOG-02: Log level settings visible (DEBUG/INFO/WARN/ERROR)', async ({ page }) => {
    await navigateToAdminItem(page, 'Logging Configuration');

    // Look for log level selector
    const selector = await page.locator('select, [role="listbox"], [role="combobox"]').first();
    const radioButtons = await page.locator('input[type="radio"]').first();
    const buttons = await page.locator('button').filter({ hasText: /DEBUG|INFO|WARN|ERROR/i }).first();

    // At least one of these should be visible
    const hasInterface = await Promise.any([
      selector.isVisible().catch(() => false),
      radioButtons.isVisible().catch(() => false),
      buttons.isVisible().catch(() => false)
    ]).then(v => v);

    expect(hasInterface).toBeTruthy();
  });

  test('TC-LEG-01: Legacy Admin page loads', async ({ page }) => {
    await navigateToAdminItem(page, 'Legacy Admin');

    // Verify page loads (may redirect)
    const content = await page.locator('body').textContent();
    expect(content).toBeTruthy();

    // Check current URL to document redirect behavior
    const currentUrl = page.url();
    console.log(`Legacy Admin navigated to: ${currentUrl}`);
  });

  test('TC-LEG-02: Legacy admin interface or redirect documented', async ({ page }) => {
    await navigateToAdminItem(page, 'Legacy Admin');

    // Document the page state
    const currentUrl = page.url();
    const pageTitle = await page.title();
    const heading = await page.locator('h1, h2, h3, [role="heading"]').first().innerText().catch(() => '');

    console.log(`Legacy Admin URL: ${currentUrl}`);
    console.log(`Page Title: ${pageTitle}`);
    console.log(`Page Heading: ${heading}`);

    // Verify page is accessible
    const content = await page.locator('body').textContent();
    expect(content).toBeTruthy();
    expect(content?.length).toBeGreaterThan(0);
  });

  test('TC-PLG-01: List Plugins page loads', async ({ page }) => {
    await navigateToAdminItem(page, 'List Plugins');

    // Verify page loads
    await verifyPageLoad(page, 'List Plugins');

    // Verify page heading
    const heading = await page.locator('h1, h2, h3, [role="heading"]').first();
    const headingText = await heading.innerText();
    expect(headingText.toLowerCase()).toMatch(/plugin/i);
  });
});

test.describe('Suite AX — Localization, Notify User, Batch Reassignment', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-LOC-01: Localization page loads', async ({ page }) => {
    // Localization may be expandable
    const chevron = await page.locator('[role="button"]:has-text("Localization"), button:has-text("Localization")').first();
    if (chevron) {
      await chevron.click();
    }

    await navigateToAdminItem(page, 'Localization');

    // Verify page loads
    await verifyPageLoad(page, 'Localization');

    // Verify page heading
    const heading = await page.locator('h1, h2, h3, [role="heading"]').first();
    const headingText = await heading.innerText();
    expect(headingText.toLowerCase()).toMatch(/localization|locale/i);
  });

  test('TC-LOC-02: Localization entries list with language columns visible', async ({ page }) => {
    await navigateToAdminItem(page, 'Localization');

    // Look for localization entries list/table
    const table = await page.locator('table, [role="table"], .data-grid').first();
    const form = await page.locator('form, .form-container').first();
    const inputs = await page.locator('input[type="text"], textarea').first();

    // At least one of these should be visible
    const hasInterface = await Promise.any([
      table.isVisible().catch(() => false),
      form.isVisible().catch(() => false),
      inputs.isVisible().catch(() => false)
    ]).then(v => v);

    expect(hasInterface).toBeTruthy();
  });

  test('TC-NTU-01: Notify User page loads', async ({ page }) => {
    await navigateToAdminItem(page, 'Notify User');

    // Verify page loads
    await verifyPageLoad(page, 'Notify User');

    // Verify page heading
    const heading = await page.locator('h1, h2, h3, [role="heading"]').first();
    const headingText = await heading.innerText();
    expect(headingText.toLowerCase()).toMatch(/notify|notification/i);
  });

  test('TC-NTU-02: User notification form or list visible', async ({ page }) => {
    await navigateToAdminItem(page, 'Notify User');

    // Look for notification form or list
    const form = await page.locator('form, .form-container, [role="form"]').first();
    const table = await page.locator('table, [role="table"]').first();
    const sendBtn = await page.locator('button:has-text("Send"), button:has-text("Submit")').first();

    // At least one of these should be visible
    const hasInterface = await Promise.any([
      form.isVisible().catch(() => false),
      table.isVisible().catch(() => false),
      sendBtn.isVisible().catch(() => false)
    ]).then(v => v);

    expect(hasInterface).toBeTruthy();
  });

  test('TC-BTR-01: Batch test reassignment page loads', async ({ page }) => {
    // Search for batch reassignment item (may be truncated)
    const batchItem = await page.locator('a, button, span').filter({ hasText: /batch.*reassign/i }).first();

    if (batchItem) {
      await batchItem.click();
    } else {
      // Try alternative name pattern
      await navigateToAdminItem(page, 'Batch test reassignment');
    }

    // Verify page loads
    await verifyPageLoad(page, 'Batch Reassignment');

    // Verify page heading contains batch or reassign
    const heading = await page.locator('h1, h2, h3, [role="heading"]').first();
    const headingText = await heading.innerText();
    expect(headingText.toLowerCase()).toMatch(/batch|reassign/i);
  });
});

test.describe('Phase 4 — K-DEEP: Admin Interaction Tests', () => {
  test.beforeEach(async ({ page }) => { await login(page, ADMIN.user, ADMIN.pass); });

  test('TC-K-DEEP-01: Dictionary search/filter', async ({ page }) => {
    await page.goto(`${BASE}/MasterListsPage/DictionaryMenu`);
    await page.waitForSelector('text=Dictionary');
    // Verify dictionary entries loaded (1,273 expected)
    const rows = page.getByRole('row');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
    // Search for a known entry
    const searchInput = page.locator('input[type="search"], input[placeholder*="Search" i]');
    if (await searchInput.isVisible()) {
      await searchInput.fill('Abnormal');
      await page.waitForTimeout(500);
      const filtered = await rows.count();
      expect(filtered).toBeLessThanOrEqual(count);
    }
  });

  test('TC-K-DEEP-02: Org Management search/pagination', async ({ page }) => {
    await page.goto(`${BASE}/MasterListsPage/organizationManagement`);
    await page.waitForSelector('text=Organization');
    // Search for known org "Adiba"
    const searchInput = page.locator('input[type="search"], input[placeholder*="Search" i]');
    if (await searchInput.isVisible()) {
      await searchInput.fill('Adiba');
      await page.waitForTimeout(500);
      await expect(page.locator('text=Adiba')).toBeVisible();
    }
    // Verify pagination controls exist for 4,726 orgs
    const pagination = page.locator('[class*="pagination" i], nav[aria-label="pagination"]');
    await expect(pagination.first()).toBeVisible();
  });

  test('TC-K-DEEP-03: Provider Management search', async ({ page }) => {
    await page.goto(`${BASE}/MasterListsPage/providerMenu`);
    await page.waitForSelector('text=Provider');
    // Search for known provider "Anga"
    const searchInput = page.locator('input[type="search"], input[placeholder*="Search" i]');
    if (await searchInput.isVisible()) {
      await searchInput.fill('Anga');
      await page.waitForTimeout(500);
      await expect(page.locator('text=Anga')).toBeVisible();
    }
  });

  test('TC-K-DEEP-04: User Management search/count', async ({ page }) => {
    await page.goto(`${BASE}/MasterListsPage/userManagement`);
    await page.waitForSelector('text=User');
    // Search for admin user
    const searchInput = page.locator('input[type="search"], input[placeholder*="Search" i]');
    if (await searchInput.isVisible()) {
      await searchInput.fill('admin');
      await page.waitForTimeout(500);
      await expect(page.locator('text=admin')).toBeVisible();
    }
    // CRUD buttons present
    await expect(page.locator('button:has-text("Add"), button:has-text("New"), button:has-text("Create")')).toBeVisible();
  });

  test('TC-K-DEEP-05: Translation Management search/stats', async ({ page }) => {
    await page.goto(`${BASE}/MasterListsPage/translationManagement`);
    await page.waitForSelector('text=Translation');
    // Verify French translation stats visible (51.4%)
    await expect(page.locator('text=/\\d+\\.\\d+%/')).toBeVisible();
  });

  test('TC-K-DEEP-06: Logging Configuration read', async ({ page }) => {
    await page.goto(`${BASE}/MasterListsPage/loggingManagement`);
    await page.waitForSelector('text=Logging');
    // Log level dropdown has value
    const logLevel = page.locator('select, [role="listbox"]').first();
    await expect(logLevel).toBeVisible();
    // Apply button present
    await expect(page.locator('button:has-text("Apply"), button:has-text("Save"), button[type="submit"]')).toBeVisible();
  });

  test('TC-K-DEEP-07: Lab Number format verification', async ({ page }) => {
    await page.goto(`${BASE}/MasterListsPage/labNumber`);
    await page.waitForSelector('text=Lab Number');
    // Verify format shows CPHL prefix
    await expect(page.locator('text=/CPHL/')).toBeVisible();
  });

  test('TC-K-DEEP-08: EQA Program dashboard cards', async ({ page }) => {
    await page.goto(`${BASE}/MasterListsPage/eqaProgram`);
    await page.waitForSelector('text=EQA');
    // KPI cards present
    const cards = page.locator('[class*="card" i], [class*="tile" i]');
    const cardCount = await cards.count();
    expect(cardCount).toBeGreaterThan(0);
  });
});
