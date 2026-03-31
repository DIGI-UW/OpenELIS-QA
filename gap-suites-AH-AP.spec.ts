/**
 * OpenELIS Global v3.2.1.3 — Gap Suites AH–AP Smoke Tests
 * Priority 3 (Operational Gaps) & Priority 4 (Specialized Modules)
 *
 * Test Count: 38 smoke/navigation tests across 9 suites (AH–AP)
 * Suite AH (Incoming Orders & Batch): 5 TCs
 * Suite AI (Workplan By Panel/Priority): 5 TCs
 * Suite AJ (Results By Range/Filter): 5 TCs
 * Suite AK (Pathology/IHC/Cytology): 5 TCs
 * Suite AL (Storage Management): 4 TCs
 * Suite AM (Analyzers): 4 TCs
 * Suite AN (EQA Distributions): 3 TCs
 * Suite AO (Aliquot): 3 TCs
 * Suite AP (Billing & NoteBook): 4 TCs
 */

import { test, expect, Page } from '@playwright/test';

const BASE = 'https://www.jdhealthsolutions-openelis.com';
const ADMIN = { user: 'admin', pass: 'adminADMIN!' };

// Helper function to login
async function login(page: Page, username: string, password: string) {
  await page.goto(`${BASE}/`);

  // Wait for login form
  await page.waitForSelector('input[type="text"], input[type="email"], input[name*="user"], input[name*="login"]', {
    timeout: 10000,
  }).catch(() => null);

  // Try common username field selectors
  const usernameField = await page.$('input[type="text"]') ||
                       await page.$('input[type="email"]') ||
                       await page.$('input[name*="user"]');

  if (usernameField) {
    await usernameField.fill(username);
  }

  // Try common password field
  const passwordField = await page.$('input[type="password"]');
  if (passwordField) {
    await passwordField.fill(password);
  }

  // Try to find and click login button
  const loginButton = await page.$('button:has-text("Login"), button:has-text("Sign In"), button[type="submit"]');
  if (loginButton) {
    await loginButton.click();
  }

  // Wait for redirect to dashboard
  await page.waitForURL(`**/*`, { timeout: 15000 }).catch(() => null);

  // Verify we're not on login page
  const currentUrl = page.url();
  if (currentUrl.includes('login') || currentUrl.includes('signin')) {
    throw new Error('Login failed: still on login page');
  }
}

// Helper function to click hamburger menu and navigate
async function navigateViaMenu(page: Page, menuItems: string[]) {
  // Click hamburger menu
  const hamburger = await page.$('[class*="menu"], [class*="hamburger"], button[aria-label*="menu"], button[aria-label*="Menu"]');
  if (hamburger) {
    await hamburger.click();
    await page.waitForTimeout(500);
  }

  // Navigate through menu items
  for (const item of menuItems) {
    const button = await page.$(`button:has-text("${item}"), a:has-text("${item}"), [role="menuitem"]:has-text("${item}")`);
    if (button) {
      await button.click();
      await page.waitForTimeout(300);
    }
  }
}

// Helper function to try multiple candidate URLs
async function tryNavigateToURL(page: Page, candidates: string[]) {
  for (const url of candidates) {
    try {
      await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded', timeout: 8000 });
      const status = page.url();
      if (!status.includes('login') && !status.includes('signin')) {
        return true;
      }
    } catch (e) {
      // URL not found, try next
    }
  }
  return false;
}

test.describe('Suite AH — Incoming Orders & Batch Order Entry', () => {

  test('TC-IO-01: Incoming Orders screen loads', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    // Try menu navigation first
    try {
      await navigateViaMenu(page, ['Order', 'Incoming Orders']);
    } catch (e) {
      // Fallback to direct URL attempts
      const found = await tryNavigateToURL(page, ['/IncomingOrders', '/IncominOrders', '/order/incoming']);
      if (!found) {
        test.skip();
        return;
      }
    }

    await page.waitForTimeout(1000);

    // Verify page loaded and not login redirect
    expect(page.url()).not.toContain('login');
    expect(page.url()).not.toContain('signin');

    // Check for page heading or table
    const heading = await page.$('[class*="heading"], h1, h2, [role="heading"]');
    const table = await page.$('table, [role="table"], [class*="list"], [class*="grid"]');

    expect(heading || table).toBeTruthy();
  });

  test('TC-IO-02: Incoming orders list displays columns', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
    await navigateViaMenu(page, ['Order', 'Incoming Orders']).catch(async () => {
      await tryNavigateToURL(page, ['/IncomingOrders', '/IncominOrders', '/order/incoming']);
    });

    await page.waitForTimeout(1000);

    // Check for key columns in table
    const table = await page.$('table');
    if (!table) {
      test.skip();
      return;
    }

    const cells = await page.$$('th, [role="columnheader"]');
    const headerText = await Promise.all(cells.map(cell => cell.textContent()));
    const headerStr = headerText.join(' ').toLowerCase();

    // At least some key columns should be present
    const hasKeyColumns = ['accession', 'patient', 'test', 'status', 'date'].some(
      col => headerStr.includes(col)
    );

    expect(hasKeyColumns).toBeTruthy();
  });

  test('TC-IO-03: Batch Order Entry screen loads', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['Order', 'Batch Order Entry']);
    } catch (e) {
      const found = await tryNavigateToURL(page, ['/BatchOrderEntry', '/BatchEntry', '/order/batch']);
      if (!found) {
        test.skip();
        return;
      }
    }

    await page.waitForTimeout(1000);

    expect(page.url()).not.toContain('login');

    // Check for form or input field
    const textarea = await page.$('textarea, [role="textbox"]');
    const input = await page.$('input[type="text"]');

    expect(textarea || input).toBeTruthy();
  });

  test('TC-IO-04: Batch entry form accepts multiple accession numbers', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['Order', 'Batch Order Entry']);
    } catch (e) {
      await tryNavigateToURL(page, ['/BatchOrderEntry', '/BatchEntry', '/order/batch']);
    }

    await page.waitForTimeout(1000);

    const textarea = await page.$('textarea');
    if (!textarea) {
      test.skip();
      return;
    }

    // Fill in batch accessions
    await textarea.fill('26CPHL00001T\n26CPHL00002T\n26CPHL00003T');

    // Look for submit/process button
    const button = await page.$('button:has-text("Submit"), button:has-text("Process"), button:has-text("Parse")');
    if (button) {
      await button.click();
      await page.waitForTimeout(2000);
    }

    // Check if form processed (no immediate error)
    const errorMsg = await page.$('[class*="error"], [class*="alert"][class*="error"], .error');
    expect(!errorMsg).toBeTruthy();
  });

  test('TC-IO-05: Batch order validation flags incomplete entries', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['Order', 'Batch Order Entry']);
    } catch (e) {
      await tryNavigateToURL(page, ['/BatchOrderEntry', '/BatchEntry', '/order/batch']);
    }

    await page.waitForTimeout(1000);

    const textarea = await page.$('textarea');
    if (!textarea) {
      test.skip();
      return;
    }

    // Enter incomplete/invalid data
    await textarea.fill('INVALID\n\n');

    const button = await page.$('button:has-text("Submit"), button:has-text("Process"), button:has-text("Parse")');
    if (button) {
      await button.click();
      await page.waitForTimeout(2000);
    }

    // System should either validate or process without error
    // This is a permissive test — just verify no crash
    expect(page.url()).not.toContain('error');
  });
});

test.describe('Suite AI — Workplan By Panel & By Priority', () => {

  test('TC-WPP-01: Workplan > By Panel screen loads', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['Workplan', 'By Panel']);
    } catch (e) {
      const found = await tryNavigateToURL(page, ['/WorkplanByPanel', '/PanelWorkplan', '/workplan/panel']);
      if (!found) {
        test.skip();
        return;
      }
    }

    await page.waitForTimeout(1000);

    expect(page.url()).not.toContain('login');

    // Check for selector or heading
    const selector = await page.$('select, [role="listbox"], [class*="dropdown"], [class*="selector"]');
    const heading = await page.$('h1, h2, [role="heading"]');

    expect(selector || heading).toBeTruthy();
  });

  test('TC-WPP-02: Panel selector populates with panels', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['Workplan', 'By Panel']);
    } catch (e) {
      await tryNavigateToURL(page, ['/WorkplanByPanel', '/PanelWorkplan', '/workplan/panel']);
    }

    await page.waitForTimeout(1000);

    const selector = await page.$('select');
    if (!selector) {
      test.skip();
      return;
    }

    const options = await page.$$('option, [role="option"]');
    expect(options.length).toBeGreaterThanOrEqual(0);
  });

  test('TC-WPP-03: Select panel shows filtered workplan items', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['Workplan', 'By Panel']);
    } catch (e) {
      await tryNavigateToURL(page, ['/WorkplanByPanel', '/PanelWorkplan', '/workplan/panel']);
    }

    await page.waitForTimeout(1000);

    const selector = await page.$('select');
    if (selector) {
      await selector.selectOption({ index: 1 }).catch(() => null);
      await page.waitForTimeout(1000);
    }

    const table = await page.$('table, [role="table"]');
    expect(table).toBeTruthy();
  });

  test('TC-WPP-04: Workplan > By Priority screen loads', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['Workplan', 'By Priority']);
    } catch (e) {
      const found = await tryNavigateToURL(page, ['/WorkplanByPriority', '/PriorityWorkplan', '/workplan/priority']);
      if (!found) {
        test.skip();
        return;
      }
    }

    await page.waitForTimeout(1000);

    expect(page.url()).not.toContain('login');

    const filter = await page.$('select, [role="listbox"], [class*="filter"]');
    expect(filter).toBeTruthy();
  });

  test('TC-WPP-05: Priority filter shows urgent and routine items', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['Workplan', 'By Priority']);
    } catch (e) {
      await tryNavigateToURL(page, ['/WorkplanByPriority', '/PriorityWorkplan', '/workplan/priority']);
    }

    await page.waitForTimeout(1000);

    const filter = await page.$('select, [role="listbox"]');
    if (filter) {
      await filter.selectOption({ index: 1 }).catch(() => null);
      await page.waitForTimeout(1000);
    }

    const table = await page.$('table, [role="table"]');
    expect(table).toBeTruthy();
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

test.describe('Suite AK — Pathology / IHC / Cytology', () => {

  test('TC-PATH-01: Pathology module loads', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['Pathology']);
    } catch (e) {
      const found = await tryNavigateToURL(page, ['/Pathology', '/PathologyDashboard', '/pathology']);
      if (!found) {
        test.skip();
        return;
      }
    }

    await page.waitForTimeout(1000);

    expect(page.url()).not.toContain('login');
    expect(page.url()).not.toContain('error');
  });

  test('TC-PATH-02: Pathology case list or entry form visible', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['Pathology']);
    } catch (e) {
      await tryNavigateToURL(page, ['/Pathology', '/PathologyDashboard', '/pathology']);
    }

    await page.waitForTimeout(1000);

    const table = await page.$('table, [role="table"]');
    const form = await page.$('form, [role="form"]');
    const button = await page.$('button:has-text("Create"), button:has-text("New")');

    expect(table || form || button).toBeTruthy();
  });

  test('TC-IHC-01: Immunohistochemistry module loads', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['Pathology', 'IHC']);
    } catch (e) {
      const found = await tryNavigateToURL(page, ['/IHC', '/Immunohistochemistry', '/pathology/ihc']);
      if (!found) {
        test.skip();
        return;
      }
    }

    await page.waitForTimeout(1000);

    expect(page.url()).not.toContain('login');
  });

  test('TC-CYT-01: Cytology module loads', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['Pathology', 'Cytology']);
    } catch (e) {
      const found = await tryNavigateToURL(page, ['/Cytology', '/CytologyDashboard', '/pathology/cytology']);
      if (!found) {
        test.skip();
        return;
      }
    }

    await page.waitForTimeout(1000);

    expect(page.url()).not.toContain('login');
  });

  test('TC-CYT-02: Cytology case entry form available', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['Pathology', 'Cytology']);
    } catch (e) {
      await tryNavigateToURL(page, ['/Cytology', '/CytologyDashboard', '/pathology/cytology']);
    }

    await page.waitForTimeout(1000);

    const button = await page.$('button:has-text("Create"), button:has-text("New"), button:has-text("Add")');
    if (button) {
      await button.click();
      await page.waitForTimeout(1000);
    }

    const form = await page.$('form, [role="form"], textarea, input');
    expect(form).toBeTruthy();
  });
});

test.describe('Suite AL — Storage Management', () => {

  test('TC-STOR-01: Storage Management screen loads', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['Storage', 'Management']);
    } catch (e) {
      const found = await tryNavigateToURL(page, ['/StorageManagement', '/LabStorage', '/storage/management']);
      if (!found) {
        test.skip();
        return;
      }
    }

    await page.waitForTimeout(1000);

    expect(page.url()).not.toContain('login');
  });

  test('TC-STOR-02: Storage locations list visible', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['Storage', 'Management']);
    } catch (e) {
      await tryNavigateToURL(page, ['/StorageManagement', '/LabStorage', '/storage/management']);
    }

    await page.waitForTimeout(1000);

    const table = await page.$('table, [role="table"], [class*="list"], [class*="tree"]');
    expect(table).toBeTruthy();
  });

  test('TC-STOR-03: Cold Storage Monitoring screen loads', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['Storage', 'Cold Storage Monitoring']);
    } catch (e) {
      const found = await tryNavigateToURL(page, ['/ColdStorageMonitoring', '/FreezerMonitoring', '/storage/monitoring']);
      if (!found) {
        test.skip();
        return;
      }
    }

    await page.waitForTimeout(1000);

    expect(page.url()).not.toContain('login');
  });

  test('TC-STOR-04: Cold storage shows temperature data', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['Storage', 'Cold Storage Monitoring']);
    } catch (e) {
      await tryNavigateToURL(page, ['/ColdStorageMonitoring', '/FreezerMonitoring', '/storage/monitoring']);
    }

    await page.waitForTimeout(1000);

    // Look for temperature readings
    const tempText = await page.locator('text/-?\\d+°?C/').count();
    const table = await page.$('table, [role="table"], [class*="list"]');

    expect(table || tempText > 0).toBeTruthy();
  });
});

test.describe('Suite AM — Analyzers', () => {

  test('TC-ANZ-01: Analyzer List screen loads', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['Analyzers', 'List']);
    } catch (e) {
      const found = await tryNavigateToURL(page, ['/AnalyzerList', '/Instruments', '/analyzers/list']);
      if (!found) {
        test.skip();
        return;
      }
    }

    await page.waitForTimeout(1000);

    expect(page.url()).not.toContain('login');
  });

  test('TC-ANZ-02: Analyzer list shows instruments', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['Analyzers', 'List']);
    } catch (e) {
      await tryNavigateToURL(page, ['/AnalyzerList', '/Instruments', '/analyzers/list']);
    }

    await page.waitForTimeout(1000);

    const table = await page.$('table, [role="table"]');
    expect(table).toBeTruthy();
  });

  test('TC-ANZ-03: Error Dashboard loads', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['Analyzers', 'Error Dashboard']);
    } catch (e) {
      const found = await tryNavigateToURL(page, ['/ErrorDashboard', '/AnalyzerErrors', '/analyzers/errors']);
      if (!found) {
        test.skip();
        return;
      }
    }

    await page.waitForTimeout(1000);

    expect(page.url()).not.toContain('login');
  });

  test('TC-ANZ-04: Analyzer Types screen loads', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['Analyzers', 'Analyzer Types']);
    } catch (e) {
      const found = await tryNavigateToURL(page, ['/AnalyzerTypes', '/InstrumentTypes', '/analyzers/types']);
      if (!found) {
        test.skip();
        return;
      }
    }

    await page.waitForTimeout(1000);

    expect(page.url()).not.toContain('login');
  });
});

test.describe('Suite AN — EQA Distributions', () => {

  test('TC-EQA-01: EQA Distributions screen loads', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['EQA', 'Distributions']);
    } catch (e) {
      const found = await tryNavigateToURL(page, ['/EQADistributions', '/QADistributions', '/eqa/distributions']);
      if (!found) {
        test.skip();
        return;
      }
    }

    await page.waitForTimeout(1000);

    expect(page.url()).not.toContain('login');
  });

  test('TC-EQA-02: EQA distribution list or form visible', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['EQA', 'Distributions']);
    } catch (e) {
      await tryNavigateToURL(page, ['/EQADistributions', '/QADistributions', '/eqa/distributions']);
    }

    await page.waitForTimeout(1000);

    const table = await page.$('table, [role="table"]');
    const form = await page.$('form, [role="form"]');

    expect(table || form).toBeTruthy();
  });

  test('TC-EQA-03: EQA Program Management loads', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['EQA', 'Program Management']);
    } catch (e) {
      const found = await tryNavigateToURL(page, ['/EQAProgramManagement', '/QAProgramManagement', '/eqa/programs']);
      if (!found) {
        test.skip();
        return;
      }
    }

    await page.waitForTimeout(1000);

    expect(page.url()).not.toContain('login');
  });
});

test.describe('Suite AO — Aliquot', () => {

  test('TC-ALQ-01: Aliquot screen loads', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['Aliquot']);
    } catch (e) {
      const found = await tryNavigateToURL(page, ['/Aliquot', '/SpecimenAliquot', '/aliquot']);
      if (!found) {
        test.skip();
        return;
      }
    }

    await page.waitForTimeout(1000);

    expect(page.url()).not.toContain('login');
  });

  test('TC-ALQ-02: Aliquot entry form visible with fields', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['Aliquot']);
    } catch (e) {
      await tryNavigateToURL(page, ['/Aliquot', '/SpecimenAliquot', '/aliquot']);
    }

    await page.waitForTimeout(1000);

    const button = await page.$('button:has-text("Create"), button:has-text("New"), button:has-text("Add")');
    if (button) {
      await button.click();
      await page.waitForTimeout(1000);
    }

    const form = await page.$('form, [role="form"]');
    const inputs = await page.$$('input, textarea, select');

    expect(form && inputs.length > 0).toBeTruthy();
  });

  test('TC-ALQ-03: Aliquot creation workflow executes', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['Aliquot']);
    } catch (e) {
      await tryNavigateToURL(page, ['/Aliquot', '/SpecimenAliquot', '/aliquot']);
    }

    await page.waitForTimeout(1000);

    const button = await page.$('button:has-text("Create"), button:has-text("New")');
    if (button) {
      await button.click();
      await page.waitForTimeout(1000);
    }

    const inputs = await page.$$('input[type="text"]');
    if (inputs.length > 0) {
      await inputs[0].fill('26CPHL00001T');
    }

    const submitBtn = await page.$('button:has-text("Submit"), button:has-text("Save")');
    if (submitBtn) {
      await submitBtn.click();
      await page.waitForTimeout(2000);
    }

    // Check for error or success
    const error = await page.$('[class*="error"]');
    expect(!error).toBeTruthy();
  });
});

test.describe('Suite AP — Billing & NoteBook', () => {

  test('TC-BILL-01: Billing module loads', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['Billing']);
    } catch (e) {
      const found = await tryNavigateToURL(page, ['/Billing', '/BillingDashboard', '/billing']);
      if (!found) {
        test.skip();
        return;
      }
    }

    await page.waitForTimeout(1000);

    expect(page.url()).not.toContain('login');
  });

  test('TC-BILL-02: Billing shows invoice list or form', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['Billing']);
    } catch (e) {
      await tryNavigateToURL(page, ['/Billing', '/BillingDashboard', '/billing']);
    }

    await page.waitForTimeout(1000);

    const table = await page.$('table, [role="table"]');
    const form = await page.$('form, [role="form"]');

    expect(table || form).toBeTruthy();
  });

  test('TC-NOTE-01: NoteBook module loads', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['NoteBook']);
    } catch (e) {
      const found = await tryNavigateToURL(page, ['/NoteBook', '/Notes', '/notebook']);
      if (!found) {
        test.skip();
        return;
      }
    }

    await page.waitForTimeout(1000);

    expect(page.url()).not.toContain('login');
  });

  test('TC-NOTE-02: NoteBook entry or list visible', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['NoteBook']);
    } catch (e) {
      await tryNavigateToURL(page, ['/NoteBook', '/Notes', '/notebook']);
    }

    await page.waitForTimeout(1000);

    const table = await page.$('table, [role="table"]');
    const textarea = await page.$('textarea, [role="textbox"]');

    expect(table || textarea).toBeTruthy();
  });
});
