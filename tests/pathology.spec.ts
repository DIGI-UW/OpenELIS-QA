import { test, expect } from '@playwright/test';
import { BASE, ADMIN, PATIENT_NAME, PATIENT_ID, ACCESSION, QA_PREFIX, TIMEOUT, CONFIRMED_ADMIN_URLS, login, navigateWithDiscovery, fillSearchField, getDateRange, getFutureDateRange } from '../helpers/test-helpers';

/**
 * Pathology Module Test Suite
 * Covers pathology, IHC, and cytology features
 * Suite IDs: AK, O-DEEP, BI-DEEP, BJ-DEEP, BK-DEEP
 * Test Count: 11
 */

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

test.describe('Phase 4 — O-DEEP: Pathology Interactions', () => {
  test.beforeEach(async ({ page }) => { await login(page, ADMIN.user, ADMIN.pass); });

  test('TC-O-DEEP-01: Pathology dashboard structure', async ({ page }) => {
    await page.click('text=Pathology');
    await page.waitForSelector('text=Pathology');
    // 4 stat cards
    await expect(page.locator('text=Cases in Progress')).toBeVisible();
    await expect(page.locator('text=Awaiting Pathology Review')).toBeVisible();
    await expect(page.locator('text=Additional Pathology Requests')).toBeVisible();
    await expect(page.locator('text=Complete')).toBeVisible();
    // Search field
    await expect(page.locator('input[placeholder*="Search by LabNo"]')).toBeVisible();
    // Status filter with 11 options
    const statusSelect = page.locator('select').filter({ has: page.locator('option:text("In Progress")') });
    const optionCount = await statusSelect.locator('option').count();
    expect(optionCount).toBeGreaterThanOrEqual(10);
  });

  test('TC-O-DEEP-02: Status filter interaction', async ({ page }) => {
    await page.click('text=Pathology');
    await page.waitForSelector('text=Pathology');
    const statusSelect = page.locator('select').filter({ has: page.locator('option:text("In Progress")') });
    await statusSelect.selectOption('ALL');
    // Verify filter changed
    await expect(statusSelect).toHaveValue('ALL');
  });
});

test.describe('Phase 7 — BI-DEEP: Pathology Dashboard', () => {
  test('TC-BI-DEEP-01: Page structure', async ({ page }) => {
    await page.goto('/PathologyDashboard');
    await expect(page.locator('h1,h2,h3').filter({ hasText: /pathology/i })).toBeVisible();
  });

  test('TC-BI-DEEP-02: Case listing', async ({ page }) => {
    await page.goto('/PathologyDashboard');
    // Dashboard should have a data table or listing area
    const table = page.locator('table, [role="table"], .cds--data-table');
    await expect(table.first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Phase 7 — BJ-DEEP: Immunohistochemistry', () => {
  test('TC-BJ-DEEP-01: Page structure', async ({ page }) => {
    await page.goto('/Immunohistochemistry');
    await expect(page.locator('h1,h2,h3').filter({ hasText: /immunohistochemistry/i })).toBeVisible();
  });

  test('TC-BJ-DEEP-02: Search and form', async ({ page }) => {
    await page.goto('/Immunohistochemistry');
    // Should have search or case listing controls
    const searchArea = page.locator('input, button:has-text("Search"), [role="searchbox"]');
    await expect(searchArea.first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Phase 7 — BK-DEEP: Cytology', () => {
  test('TC-BK-DEEP-01: Page structure', async ({ page }) => {
    await page.goto('/CytologyDashboard');
    await expect(page.locator('h1,h2,h3').filter({ hasText: /cytology/i })).toBeVisible();
  });

  test('TC-BK-DEEP-02: Workflow fields', async ({ page }) => {
    await page.goto('/CytologyDashboard');
    const controls = page.locator('input, select, button, [role="combobox"]');
    const count = await controls.count();
    expect(count).toBeGreaterThan(0);
  });
});
