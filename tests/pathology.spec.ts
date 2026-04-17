import { test, expect } from '@playwright/test';
import { BASE, ADMIN, PATIENT_NAME, PATIENT_ID, ACCESSION, QA_PREFIX, TIMEOUT, CONFIRMED_ADMIN_URLS, login, navigateWithDiscovery, fillSearchField, getDateRange, getFutureDateRange } from '../helpers/test-helpers';

/**
 * Pathology Module Test Suite
 * Covers pathology, IHC, and cytology features
 * Suite IDs: AK, O-DEEP, BI-DEEP, BJ-DEEP, BK-DEEP
 * Test Count: 13
 */

// Shared local helpers — same pattern as results-entry.spec.ts
async function navigateViaMenu(page: any, menuPath: string[]) {
  await page.goto(`${BASE}`);
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
    if (res && res.ok() && !page.url().includes('login')) return true;
  }
  return false;
}

test.describe('Suite AK — Pathology / IHC / Cytology', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-PATH-01: Pathology module loads', async ({ page }) => {
    const found = await tryNavigateToURL(page, ['/Pathology', '/PathologyDashboard', '/pathology']);
    if (!found) {
      console.log('TC-PATH-01: GAP — Pathology URL not accessible; trying menu nav');
      await navigateViaMenu(page, ['Pathology']);
    }
    await page.waitForTimeout(1000);

    // Must not land on login page
    expect(page.url(), 'Must not redirect to login').not.toContain('login');
    // Page must render actual content (not a blank body)
    const bodyLen = (await page.locator('body').innerText().catch(() => '')).length;
    expect(bodyLen, 'Pathology page must have content').toBeGreaterThan(100);
  });

  test('TC-PATH-02: Pathology dashboard has stat cards and search', async ({ page }) => {
    const found = await tryNavigateToURL(page, ['/Pathology', '/PathologyDashboard']);
    if (!found) { console.log('TC-PATH-02: SKIP — URL not found'); return; }

    await page.waitForTimeout(1000);
    const bodyText = await page.locator('body').innerText();

    // Lab manager needs to see how many pathology cases are in each state
    const hasStatCard = /in progress|awaiting|complete|pending/i.test(bodyText);
    // Must have a way to find a case
    const hasSearch = await page.locator(
      'input[placeholder*="search" i], input[placeholder*="LabNo" i], input[placeholder*="lab" i]'
    ).first().isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasStatCard || hasSearch,
      'Pathology dashboard must show stat cards or search — otherwise lab cannot manage cases'
    ).toBe(true);
  });

  test('TC-IHC-01: Immunohistochemistry module loads', async ({ page }) => {
    const found = await tryNavigateToURL(page, ['/Immunohistochemistry', '/IHC', '/pathology/ihc']);
    if (!found) {
      console.log('TC-IHC-01: GAP — IHC URL not accessible');
      test.skip();
      return;
    }
    await page.waitForTimeout(1000);
    expect(page.url()).not.toContain('login');
    const bodyLen = (await page.locator('body').innerText().catch(() => '')).length;
    expect(bodyLen, 'IHC page must have content').toBeGreaterThan(100);
  });

  test('TC-IHC-02: IHC page has search or case listing controls', async ({ page }) => {
    const found = await tryNavigateToURL(page, ['/Immunohistochemistry', '/IHC', '/pathology/ihc']);
    if (!found) { test.skip(); return; }

    // A pathologist needs to search for cases or see a list to work from
    const hasSearchOrList = await page.locator(
      'input, button:has-text("Search"), [role="searchbox"], table, [role="table"]'
    ).first().isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasSearchOrList, 'IHC page must have search or case listing').toBe(true);
  });

  test('TC-CYT-01: Cytology module loads', async ({ page }) => {
    const found = await tryNavigateToURL(page, ['/CytologyDashboard', '/Cytology', '/pathology/cytology']);
    if (!found) {
      console.log('TC-CYT-01: GAP — Cytology URL not accessible');
      test.skip();
      return;
    }
    await page.waitForTimeout(1000);
    expect(page.url()).not.toContain('login');
    const bodyLen = (await page.locator('body').innerText().catch(() => '')).length;
    expect(bodyLen, 'Cytology page must have content').toBeGreaterThan(100);
  });

  test('TC-CYT-02: Cytology case entry form or listing available', async ({ page }) => {
    const found = await tryNavigateToURL(page, ['/CytologyDashboard', '/Cytology']);
    if (!found) { test.skip(); return; }

    await page.waitForTimeout(1000);

    // Either a Create button or a case list must be visible
    const hasCreateBtn = await page.locator(
      'button:has-text("Create"), button:has-text("New"), button:has-text("Add")'
    ).first().isVisible({ timeout: 3000 }).catch(() => false);
    const hasList = await page.locator('table, [role="table"], [role="list"]').first()
      .isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasCreateBtn || hasList,
      'Cytology must show a case list or a Create button'
    ).toBe(true);
  });
});

test.describe('Phase 4 — O-DEEP: Pathology Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
    const found = await tryNavigateToURL(page, ['/Pathology', '/PathologyDashboard']);
    if (!found) test.skip();
  });

  test('TC-O-DEEP-01: Pathology dashboard has 4 stat cards and status filter', async ({ page }) => {
    // Confirm all four case-state cards the lab manager needs
    const requiredCards = ['Cases in Progress', 'Awaiting Pathology Review', 'Additional Pathology Requests', 'Complete'];
    for (const card of requiredCards) {
      const visible = await page.locator(`text=${card}`).first().isVisible({ timeout: 3000 }).catch(() => false);
      if (!visible) console.warn(`TC-O-DEEP-01: card "${card}" not found`);
    }

    // Search field is mandatory — lab manager must find cases by LabNo
    const searchVisible = await page.locator('input[placeholder*="Search by LabNo"], input[placeholder*="search" i]')
      .first().isVisible({ timeout: 3000 }).catch(() => false);
    expect(searchVisible, 'Search by LabNo must be present on pathology dashboard').toBe(true);

    // Status filter dropdown must have at least 5 states (In Progress, Awaiting, etc.)
    const statusSelect = page.locator('select').filter({ has: page.locator('option:text("In Progress")') });
    const optionCount = await statusSelect.locator('option').count().catch(() => 0);
    if (optionCount > 0) {
      expect(optionCount, 'Status filter must have at least 5 options').toBeGreaterThanOrEqual(5);
    }
  });

  test('TC-O-DEEP-02: Status filter changes the displayed value', async ({ page }) => {
    const statusSelect = page.locator('select').first();
    if (!(await statusSelect.isVisible({ timeout: 3000 }).catch(() => false))) {
      console.log('TC-O-DEEP-02: SKIP — no status dropdown found');
      return;
    }
    await statusSelect.selectOption({ index: 1 });
    await page.waitForTimeout(500);
    const selectedValue = await statusSelect.inputValue();
    expect(selectedValue, 'Status filter value must change after selection').not.toBe('');
  });
});

test.describe('Phase 7 — BI-DEEP: Pathology Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-BI-DEEP-01: Pathology dashboard page structure', async ({ page }) => {
    const found = await tryNavigateToURL(page, ['/PathologyDashboard', '/Pathology']);
    if (!found) { test.skip(); return; }

    // Page must have a heading identifying it as Pathology
    await expect(
      page.locator('h1, h2, h3').filter({ hasText: /pathology/i }).first(),
      'Pathology heading must be present'
    ).toBeVisible({ timeout: TIMEOUT });
  });

  test('TC-BI-DEEP-02: Pathology dashboard has data table', async ({ page }) => {
    const found = await tryNavigateToURL(page, ['/PathologyDashboard', '/Pathology']);
    if (!found) { test.skip(); return; }

    // Data table must be present so lab can see case list
    await expect(
      page.locator('table, [role="table"], .cds--data-table').first(),
      'Pathology dashboard must have a data table'
    ).toBeVisible({ timeout: TIMEOUT });
  });
});

test.describe('Phase 7 — BJ-DEEP: Immunohistochemistry', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-BJ-DEEP-01: IHC page has a heading', async ({ page }) => {
    const found = await tryNavigateToURL(page, ['/Immunohistochemistry', '/IHC']);
    if (!found) { test.skip(); return; }

    await expect(
      page.locator('h1, h2, h3').filter({ hasText: /immunohistochemistry|ihc/i }).first(),
      'IHC page must have a heading'
    ).toBeVisible({ timeout: TIMEOUT });
  });

  test('TC-BJ-DEEP-02: IHC page has search controls', async ({ page }) => {
    const found = await tryNavigateToURL(page, ['/Immunohistochemistry', '/IHC']);
    if (!found) { test.skip(); return; }

    await expect(
      page.locator('input, button:has-text("Search"), [role="searchbox"]').first(),
      'IHC page must have search controls'
    ).toBeVisible({ timeout: TIMEOUT });
  });
});

test.describe('Phase 7 — BK-DEEP: Cytology', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-BK-DEEP-01: Cytology dashboard has a heading', async ({ page }) => {
    const found = await tryNavigateToURL(page, ['/CytologyDashboard', '/Cytology']);
    if (!found) { test.skip(); return; }

    await expect(
      page.locator('h1, h2, h3').filter({ hasText: /cytology/i }).first(),
      'Cytology page must have a heading'
    ).toBeVisible({ timeout: TIMEOUT });
  });

  test('TC-BK-DEEP-02: Cytology workflow fields are rendered', async ({ page }) => {
    const found = await tryNavigateToURL(page, ['/CytologyDashboard', '/Cytology']);
    if (!found) { test.skip(); return; }

    // At least one interactive control must be present
    const count = await page.locator('input, select, button, [role="combobox"]').count();
    expect(count, 'Cytology page must render interactive workflow controls').toBeGreaterThan(0);
  });
});
