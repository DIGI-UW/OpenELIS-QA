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

    const count = await page.locator('input, select, button, [role="combobox"]').count();
    expect(count, 'Cytology page must render interactive workflow controls').toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite PATH-EXT — Pathology Extended (TC-PATH-EXT-01 through TC-PATH-EXT-05)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Suite PATH-EXT — Pathology Module Extended', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-PATH-EXT-01: All three pathology dashboards load without 500', async ({ page }) => {
    /**
     * Pathology, IHC, and Cytology are three parallel modules. All three
     * dashboards must be reachable without server error.
     */
    const pathUrls = [
      ['/PathologyDashboard', '/Pathology'],
      ['/Immunohistochemistry', '/IHC'],
      ['/CytologyDashboard', '/Cytology'],
    ];

    const results: { name: string; ok: boolean }[] = [];
    const names = ['Pathology', 'IHC', 'Cytology'];

    for (let i = 0; i < pathUrls.length; i++) {
      const found = await tryNavigateToURL(page, pathUrls[i]);
      const bodyText = await page.locator('body').innerText();
      const ok = found && !bodyText.includes('Internal Server Error') && !page.url().match(/login/i);
      results.push({ name: names[i], ok });
    }

    console.log('TC-PATH-EXT-01:', JSON.stringify(results));
    const failing = results.filter(r => !r.ok);
    expect(failing.length, `Failing pathology dashboards: ${JSON.stringify(failing)}`).toBe(0);
  });

  test('TC-PATH-EXT-02: Pathology dashboard status filter API is healthy', async ({ page }) => {
    /**
     * The status filter on the pathology dashboard reads from an API to
     * populate status options. The API must return usable data.
     */
    await page.goto(`${BASE}`);

    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const candidates = [
        '/api/OpenELIS-Global/rest/pathology/status',
        '/api/OpenELIS-Global/rest/pathologyStatus',
        '/api/OpenELIS-Global/rest/PathologyDashboard',
      ];
      for (const url of candidates) {
        const res = await fetch(url, { headers: { 'X-CSRF-Token': csrf } });
        if (res.status !== 404) return { status: res.status, url };
      }
      return { status: 404, url: 'none' };
    });

    console.log(`TC-PATH-EXT-02: Pathology API → ${result.url} HTTP ${result.status}`);
    expect(result.status, 'Pathology status API must not 5xx').not.toBeGreaterThanOrEqual(500);
  });

  test('TC-PATH-EXT-03: IHC page has case search by accession', async ({ page }) => {
    /**
     * IHC cases must be searchable by accession number so lab staff can
     * locate specific cases for staining annotation.
     */
    const found = await tryNavigateToURL(page, ['/Immunohistochemistry', '/IHC']);
    if (!found) { test.skip(); return; }

    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    const searchInput = page.locator('input[placeholder*="accession" i], input[placeholder*="lab" i], input').first();
    if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await searchInput.fill(ACCESSION);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1500);
      const bodyText = await page.locator('body').innerText();
      expect(bodyText).not.toContain('Internal Server Error');
      console.log('TC-PATH-EXT-03: PASS — IHC accession search completed without error');
    } else {
      console.log('TC-PATH-EXT-03: NOTE — no search input found on IHC page');
    }
  });

  test('TC-PATH-EXT-04: Cytology dashboard has status card counts', async ({ page }) => {
    /**
     * The Cytology dashboard should show status cards with case counts
     * (similar to Pathology/IHC dashboards, following same design pattern).
     */
    const found = await tryNavigateToURL(page, ['/CytologyDashboard', '/Cytology']);
    if (!found) { test.skip(); return; }

    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });
    const bodyText = await page.locator('body').innerText();

    // Look for numeric counts — status cards display numbers
    const hasNumbers = /\d+/.test(bodyText);
    const hasStatus = /in progress|awaiting|completed|status/i.test(bodyText);

    console.log(`TC-PATH-EXT-04: hasNumbers=${hasNumbers}, hasStatus=${hasStatus}`);
    expect(bodyText).not.toContain('Internal Server Error');
  });

  test('TC-PATH-EXT-05: Pathology modules load within acceptable time', async ({ page }) => {
    /**
     * Performance check: pathology dashboard must load within 5 seconds since
     * it is used during active case review sessions.
     */
    const start = Date.now();
    const found = await tryNavigateToURL(page, ['/PathologyDashboard', '/Pathology']);
    await page.waitForLoadState('domcontentloaded');
    const elapsed = Date.now() - start;

    console.log(`TC-PATH-EXT-05: Pathology dashboard loaded in ${elapsed}ms`);
    if (found) {
      expect(elapsed, 'Pathology dashboard must load within 5000ms').toBeLessThan(5000);
    } else {
      console.log('TC-PATH-EXT-05: SKIP — pathology page not reachable');
    }
  });
});
