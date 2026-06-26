/**
 * OpenELIS Global — Test Catalog Management (unified editor) QA suite
 * Target: testing.openelis-global.org (v3.2.1.10) · spec baseline: test-catalog-requirements-v2.5.md / OGC-949
 *
 * Covers the NEW unified Test Catalog Management editor (NOT the legacy
 * /MasterListsPage/testManagementConfigMenu pages). Verified live 2026-06-26.
 *
 * Routes:
 *   List   : /admin/TestCatalogList?page=1&pageSize=25
 *   Editor : /MasterListsPage/TestCatalogEditor/<testId>/<section-slug>
 *
 * Suites:
 *   TC-CAT-LIST   — list view, filter bar, search (FUNCTION), pagination, row-open (nav)
 *   TC-CAT-EDITOR — 13 SideNav sections each RENDER (testId discovered from the list, not hardcoded)
 *   TC-CAT-DELTAS — spec-vs-build reconciliation checks (Δ-1…Δ-5 from the live enumeration)
 *
 * Grading: list search/open are FUNCTION; per-section checks are RENDER (module capped at M1
 * until write round-trips are added once name/code/desc editing lands — see Δ-2).
 */

import { test, expect, Page } from '@playwright/test';

const BASE = process.env.BASE || 'https://testing.openelis-global.org';
const ADMIN = { user: process.env.OE_USER || 'admin', pass: process.env.OE_PASS || 'adminADMIN!' };
const TIMEOUT = 10000;

const SECTIONS: { slug: string; heading: RegExp; marker: RegExp; stage: 'v1' | 'v2' }[] = [
  { slug: 'basic-info',     heading: /basic info/i,        marker: /domain|orderable|active/i,            stage: 'v1' },
  { slug: 'sample-results', heading: /sample.*result/i,    marker: /result type|unit of measure|component/i, stage: 'v1' },
  { slug: 'methods',        heading: /methods/i,           marker: /link method|create new method/i,      stage: 'v1' },
  { slug: 'ranges',         heading: /ranges/i,            marker: /coverage|add range/i,                 stage: 'v1' },
  { slug: 'storage',        heading: /sample storage/i,    marker: /storage condition|disposal/i,         stage: 'v1' },
  { slug: 'panels',         heading: /panels/i,            marker: /add to panel|position/i,              stage: 'v1' },
  { slug: 'labels',         heading: /labels/i,            marker: /label preset|label type/i,            stage: 'v2' },
  { slug: 'terminology',    heading: /terminology/i,       marker: /loinc|snomed|add mapping/i,           stage: 'v1' },
  { slug: 'reagents',       heading: /reagents/i,          marker: /link reagent/i,                       stage: 'v2' },
  { slug: 'analyzers',      heading: /analyzers/i,         marker: /read-only|analyzer configuration/i,   stage: 'v1' },
  { slug: 'alerts',         heading: /alerts/i,            marker: /add rule|notify/i,                    stage: 'v2' },
  { slug: 'reflex-calc',    heading: /reflex.*calc/i,      marker: /reflex|calculated/i,                  stage: 'v2' },
  { slug: 'display-order',  heading: /display order/i,     marker: /sample type|reorder/i,                stage: 'v1' },
];

async function login(page: Page, user: string, pass: string): Promise<void> {
  await page.goto(`${BASE}/login`);
  await page.locator('input[type="text"], input[placeholder*="user" i]').first().fill(user);
  await page.locator('input[type="password"]').first().fill(pass);
  await page.locator('button:has-text("Login"), button[type="submit"]').first().click();
  await page.waitForURL('**/MasterListsPage', { timeout: TIMEOUT }).catch(() => {});
}

/** Open the list, click the first test row, return its numeric testId from the editor URL. */
async function discoverTestId(page: Page): Promise<string> {
  await page.goto(`${BASE}/admin/TestCatalogList?page=1&pageSize=25`);
  await page.waitForLoadState('networkidle', { timeout: TIMEOUT }).catch(() => {});
  const firstRow = page.locator('table tbody tr, [role="row"]').filter({ hasText: /\S/ }).first();
  await firstRow.click();
  await page.waitForURL('**/TestCatalogEditor/**', { timeout: TIMEOUT });
  const m = page.url().match(/TestCatalogEditor\/(\d+)\//);
  expect(m, 'editor URL should contain a numeric testId').toBeTruthy();
  return m![1];
}

async function expectNoErrorPage(page: Page): Promise<void> {
  const txt = (await page.locator('body').innerText()) || '';
  expect(page.url()).not.toContain('/login');
  expect(txt).not.toMatch(/\b(404|500|Not Found|Internal Server Error)\b/);
}

// ============================================================================
// TC-CAT-LIST — Test Catalog List View
// ============================================================================
test.describe('TC-CAT-LIST — Test Catalog list view', () => {
  test.beforeEach(async ({ page }) => { await login(page, ADMIN.user, ADMIN.pass); });

  test('TC-CAT-01: list view loads with rows (RENDER)', async ({ page }) => {
    await page.goto(`${BASE}/admin/TestCatalogList?page=1&pageSize=25`);
    await expectNoErrorPage(page);
    await expect(page.getByRole('heading', { name: /test catalog/i }).first()).toBeVisible();
    await expect(page.locator('table tbody tr, [role="row"]').first()).toBeVisible();
  });

  test('TC-CAT-02: filter bar present — Domain / Status / AMR / Search (RENDER)', async ({ page }) => {
    await page.goto(`${BASE}/admin/TestCatalogList?page=1&pageSize=25`);
    // Wait for the list to paint (auto-waiting locator assertions, not a body snapshot).
    await expect(page.getByRole('heading', { name: /test catalog/i }).first()).toBeVisible();
    await expect(page.getByText(/^Domain$/i).first()).toBeVisible();
    await expect(page.getByText(/^Status$/i).first()).toBeVisible();
    await expect(page.getByText(/^AMR$/i).first()).toBeVisible();
    await expect(page.locator('input[type="text"], input[type="search"]').first()).toBeVisible();
  });

  test('TC-CAT-03: search by name filters the table (FUNCTION)', async ({ page }) => {
    await page.goto(`${BASE}/admin/TestCatalogList?page=1&pageSize=25`);
    const search = page.locator('input[placeholder*="search" i], input[type="search"], input[type="text"]').first();
    await search.fill('Amylase');
    await page.waitForTimeout(1200);
    await expect(page.locator('table tbody, [role="rowgroup"]').first()).toContainText(/amylase/i);
  });

  test('TC-CAT-04: pagination present (page size + page count) (RENDER)', async ({ page }) => {
    await page.goto(`${BASE}/admin/TestCatalogList?page=1&pageSize=25`);
    await expect(page.getByText(/items per page/i).first()).toBeVisible();
    await expect(page.getByText(/of\s+\d+\s+(pages|items)/i).first()).toBeVisible();
  });

  test('TC-CAT-05: clicking a row opens the editor (FUNCTION / nav)', async ({ page }) => {
    const id = await discoverTestId(page);
    expect(page.url()).toContain(`/TestCatalogEditor/${id}/`);
    await expect(page.getByRole('heading', { name: /basic info/i }).first()).toBeVisible();
    // Editor header CTAs per spec §2.9
    await expect(page.getByRole('button', { name: /^save$/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /save as new test/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /cancel/i }).first()).toBeVisible();
  });
});

// ============================================================================
// TC-CAT-EDITOR — 13 SideNav sections each RENDER
// ============================================================================
test.describe('TC-CAT-EDITOR — editor SideNav sections', () => {
  let testId: string;
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
    testId = testId || (await discoverTestId(page));
  });

  for (const s of SECTIONS) {
    test(`TC-CAT-${s.slug}: ${s.slug} renders (${s.stage}) (RENDER)`, async ({ page }) => {
      await page.goto(`${BASE}/MasterListsPage/TestCatalogEditor/${testId}/${s.slug}`);
      await page.waitForLoadState('networkidle', { timeout: TIMEOUT }).catch(() => {});
      await expectNoErrorPage(page);
      await expect(page.getByRole('heading', { name: s.heading }).first()).toBeVisible();
      const body = await page.locator('body').innerText();
      expect(body, `section "${s.slug}" should show its content marker`).toMatch(s.marker);
      // Header CTAs persist on every section
      await expect(page.getByRole('button', { name: /^save$/i }).first()).toBeVisible();
    });
  }
});

// ============================================================================
// TC-CAT-DELTAS — spec-vs-build reconciliation (Δ-1…Δ-5)
// ============================================================================
test.describe('TC-CAT-DELTAS — spec reconciliation', () => {
  test.beforeEach(async ({ page }) => { await login(page, ADMIN.user, ADMIN.pass); });

  test('TC-CAT-D1: legacy Test Management menu still present alongside new editor (Δ-1)', async ({ page }) => {
    // FRS D-10 says legacy is decommissioned at v1 release; live shows it still routable.
    await page.goto(`${BASE}/MasterListsPage/testManagementConfigMenu`);
    await expectNoErrorPage(page);
    // Auto-waits for the legacy menu links to paint. Documents coexistence vs FRS D-10.
    await expect(page.getByText(/add new tests|view test catalog|manage panels/i).first()).toBeVisible();
    console.log('Δ-1 legacy Test Management menu still routable (FRS D-10 expects decommissioned)');
  });

  test('TC-CAT-D2: Basic Info name/code/description not yet editable (Δ-2)', async ({ page }) => {
    const id = await discoverTestId(page);
    await page.goto(`${BASE}/MasterListsPage/TestCatalogEditor/${id}/basic-info`);
    await expect(page.getByRole('heading', { name: /basic info/i }).first()).toBeVisible();
    // Live shows an explicit "later milestone" note for name/code/description (in-flight, not a regression).
    await expect(page.getByText(/later milestone/i).first()).toBeVisible();
    console.log('Δ-2 name/code/description not yet editable — "later milestone" note shown');
  });

  test('TC-CAT-D5: v2 sections (Labels/Reagents/Alerts/Reflex&Calc) are live in SideNav (Δ-5)', async ({ page }) => {
    const id = await discoverTestId(page);
    await page.goto(`${BASE}/MasterListsPage/TestCatalogEditor/${id}/basic-info`);
    for (const slug of ['labels', 'reagents', 'alerts', 'reflex-calc']) {
      const link = page.locator(`a[href*="/TestCatalogEditor/${id}/${slug}"]`);
      await expect(link, `v2 section "${slug}" should be present (FRS says hidden in v1)`).toHaveCount(1);
    }
    // Compliance (14th) is expected ABSENT
    await expect(page.locator(`a[href*="/TestCatalogEditor/${id}/compliance"]`)).toHaveCount(0);
  });
});
