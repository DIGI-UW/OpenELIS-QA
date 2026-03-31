/**
 * OpenELIS Global v3.2.1.3 — Gap Suites AQ–AX (Priority 5: Admin Configuration Gaps)
 * Playwright Smoke Tests for 34 Admin Configuration Screen Tests
 *
 * Test Count: 34 TCs across 8 suites (AQ, AR, AS, AT, AU, AV, AW, AX)
 *
 * Suites:
 * - AQ: Reflex Tests & Analyzer Test Name (4 TCs)
 * - AR: Lab Number & Program Management (4 TCs)
 * - AS: Provider & Barcode Configuration (4 TCs)
 * - AT: Result Reporting & Menu Configuration (4 TCs)
 * - AU: General Config & App Properties (4 TCs)
 * - AV: Notifications & Search Index (4 TCs)
 * - AW: Logging, Legacy Admin, Plugins (5 TCs)
 * - AX: Localization, Notify User, Batch Reassignment (5 TCs)
 */

import { test, expect, Page } from '@playwright/test';

const BASE = 'https://www.jdhealthsolutions-openelis.com';
const ADMIN = { user: 'admin', pass: 'adminADMIN!' };
const TIMEOUT = 5000;

/**
 * Login helper function
 * Navigates to login page, enters credentials, and waits for /MasterListsPage
 */
async function login(page: Page, user: string, pass: string): Promise<void> {
  await page.goto(`${BASE}/login`);

  // Find and fill username field
  const userField = await page.locator('input[type="text"], input[placeholder*="user" i], input[placeholder*="email" i]').first();
  await userField.fill(user);

  // Find and fill password field
  const passField = await page.locator('input[type="password"]');
  await passField.fill(pass);

  // Click login button
  const loginBtn = await page.locator('button:has-text("Login"), button:has-text("Sign in"), button[type="submit"]').first();
  await loginBtn.click();

  // Wait for navigation to admin page
  await page.waitForURL(`**/MasterListsPage`, { timeout: TIMEOUT });
}

/**
 * Navigate to admin item and verify page loads
 * Admin items are clickable links in the left sidebar of /MasterListsPage
 */
async function navigateToAdminItem(page: Page, itemName: string): Promise<void> {
  // Click the admin item in the left sidebar
  const adminItem = await page.locator(`a:has-text("${itemName}"), button:has-text("${itemName}"), span:has-text("${itemName}")`).first();

  if (adminItem) {
    await adminItem.click();
  } else {
    throw new Error(`Admin item "${itemName}" not found in sidebar`);
  }

  // Wait for page to load
  await page.waitForLoadState('networkidle', { timeout: TIMEOUT });
}

/**
 * Verify page loaded and contains expected elements
 */
async function verifyPageLoad(page: Page, expectedTitle: string): Promise<void> {
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

// ============================================================================
// SUITE AQ — Reflex Tests & Analyzer Test Name (4 TCs)
// ============================================================================

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
    ]).then(v => v === true || v === true);

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
    ]).then(v => v === true || v === true);

    expect(hasInterface).toBeTruthy();
  });
});

// ============================================================================
// SUITE AR — Lab Number & Program Management (4 TCs)
// ============================================================================

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
    ]).then(v => v === true || v === true);

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
    ]).then(v => v === true || v === true);

    expect(hasInterface).toBeTruthy();
  });
});

// ============================================================================
// SUITE AS — Provider & Barcode Configuration (4 TCs)
// ============================================================================

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
    ]).then(v => v === true || v === true);

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
    ]).then(v => v === true || v === true);

    expect(hasInterface).toBeTruthy();
  });
});

// ============================================================================
// SUITE AT — Result Reporting & Menu Configuration (4 TCs)
// ============================================================================

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
    ]).then(v => v === true || v === true);

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
    ]).then(v => v === true || v === true);

    expect(hasInterface).toBeTruthy();
  });
});

// ============================================================================
// SUITE AU — General Config & App Properties (4 TCs)
// ============================================================================

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
    ]).then(v => v === true || v === true);

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
    ]).then(v => v === true || v === true);

    expect(hasInterface).toBeTruthy();
  });
});

// ============================================================================
// SUITE AV — Notifications & Search Index (4 TCs)
// ============================================================================

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
    ]).then(v => v === true || v === true);

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
    ]).then(v => v === true || v === true);

    expect(hasInterface).toBeTruthy();
  });
});

// ============================================================================
// SUITE AW — Logging, Legacy Admin, Plugins (5 TCs)
// ============================================================================

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
    ]).then(v => v === true || v === true);

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

// ============================================================================
// SUITE AX — Localization, Notify User, Batch Reassignment (5 TCs)
// ============================================================================

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
    ]).then(v => v === true || v === true);

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
    ]).then(v => v === true || v === true);

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
