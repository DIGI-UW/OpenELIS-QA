/**
 * OpenELIS Global — Panel Management Redesign v2.2 (OGC-224, PR #4039)
 * Target: testing.openelis-global.org · merged to develop, live as of 2026-08-12.
 *
 * Covers the NEW panel-side Test Catalog Management surface reached via
 * Admin > Test Catalog Management > Panels: the Panels list, the panel editor shell,
 * the Basic Info (Domain) section, and the Tests (ordered membership) section.
 *
 * SOURCE OF TRUTH: FRS `designs/admin-config/panel.md` (v2.2, OGC-224) in DIGI-UW/openelis-work —
 * per this project's anti-blind-spot rule, prefer the FRS over the PR diff for expected behavior.
 * Where the live instance wasn't directly exercised, this spec cross-checks the FRS's paired
 * mockup (`designs/admin-config/panel.jsx`) for exact copy/labels/aria-labels — see
 * SPEC-DIVERGENCE notes inline.
 *
 * Routes:
 *   List   : /admin/TestCatalogList?entity=panels                                   (confirmed live)
 *   Editor : opened by clicking a panel name from the list (SideNav shows
 *            "Editing panel: <name>"). FRS gives a URL pattern of
 *            /MasterListsPage/TestCatalogEditor/panel/<id>/<section> but that was NOT
 *            confirmed byte-for-byte live, so this spec navigates via UI clicks/SideNav
 *            rather than hardcoding the editor URL.
 *
 * Verified LIVE on testing.openelis-global.org (2026-08-12): list columns/banner/filters/
 * Add Panel button; editor shell (PANEL badge + Clinical domain tag, "Editing panel: <name>"
 * SideNav heading, Basic Info / Tests / Terminology sections); Basic Info Domain radios
 * (Environmental/Vector disabled); Tests section filter + typeahead + ordered table.
 *
 * NOT yet exercised live (derived from the FRS + its paired mockup instead):
 *   - Terminology section UI (out of scope for this pass — not asserted here)
 *   - the zero-test activation guard (PANEL-GUARD-01 below)
 *   - the Add Panel creation flow itself
 *   - cross-domain test-add 422 rejection — SKIPPED entirely: at launch only Clinical is
 *     enabled (Environmental/Vector radios are disabled), so there is no way to construct
 *     a cross-domain mismatch on this instance to exercise that guard. Revisit once a later
 *     phase enables a second domain.
 *
 * Run: BASE=https://testing.openelis-global.org \
 *   npx playwright test --config=all-tc.config.ts panel-management-v2.spec.ts
 *   (NOTE: all-tc.config.ts's `test-catalog` project testMatch is currently
 *   /(test-catalog-.*|results-.*)\.spec\.ts/ and won't pick up this filename — broaden the
 *   pattern or add a dedicated project before wiring this into CI.)
 */

import { test, expect, Page } from '@playwright/test';

const BASE = process.env.BASE || 'https://testing.openelis-global.org';
const ADMIN = { user: process.env.OE_USER || 'admin', pass: process.env.OE_PASS || 'adminADMIN!' };
const TIMEOUT = 10000;

async function login(page: Page, user: string, pass: string): Promise<void> {
  // Under all-tc.config.ts the context is pre-authenticated via storageState. Navigating to a
  // protected page then stays put; only when genuinely unauthenticated does the SPA bounce to
  // /login (same pattern as test-catalog-mgmt.spec.ts's login()).
  await page.goto(`${BASE}/admin/TestCatalogList?entity=panels`);
  await page.waitForLoadState('domcontentloaded');
  if (!/\/login/i.test(page.url())) return; // already authenticated
  await page.locator('input[type="text"], input[placeholder*="user" i]').first().fill(user);
  await page.locator('input[type="password"]').first().fill(pass);
  await page.locator('button:has-text("Login"), button[type="submit"]').first().click();
  await page.waitForURL('**/admin/TestCatalogList**', { timeout: TIMEOUT }).catch(() => {});
}

async function expectNoErrorPage(page: Page): Promise<void> {
  const txt = (await page.locator('body').innerText()) || '';
  expect(page.url()).not.toContain('/login');
  expect(txt).not.toMatch(/\b(404|500|Not Found|Internal Server Error)\b/);
}

/** Open the Panels list and click the first panel's name link into its editor shell. */
async function openFirstPanel(page: Page): Promise<void> {
  await page.goto(`${BASE}/admin/TestCatalogList?entity=panels`);
  await expectNoErrorPage(page);
  const firstRow = page.locator('table tbody tr').filter({ hasText: /\S/ }).first();
  await firstRow.waitFor({ state: 'visible', timeout: TIMEOUT });
  // The Panel Name cell is a Link (per the FRS mockup); click it rather than the row's
  // trailing "Edit" button, to match "Clicking a panel name opens an editor shell" as confirmed live.
  await firstRow.getByRole('link').first().click();
  await expect(page.getByText(/^Editing panel:/i).first()).toBeVisible({ timeout: TIMEOUT });
}

/** Click a SideNav section item (Basic Info / Tests / Terminology) inside an open panel editor. */
async function openSection(page: Page, name: RegExp): Promise<void> {
  const link = page.getByRole('link', { name }).or(page.getByRole('button', { name })).or(page.getByText(name));
  await link.first().click();
  await page.waitForTimeout(400);
}

// ============================================================================
// PANEL-LIST — Panels list view
// ============================================================================
test.describe('PANEL-LIST — Panels list view (OGC-224)', () => {
  test.beforeEach(async ({ page }) => { await login(page, ADMIN.user, ADMIN.pass); });

  test('PANEL-LIST-01: list loads with the domain-upgrade banner and all table columns (RENDER)', async ({ page }) => {
    await page.goto(`${BASE}/admin/TestCatalogList?entity=panels`);
    await expectNoErrorPage(page);

    // Info banner (confirmed live copy).
    await expect(page.getByText(/Panels now have a Domain; existing panels were set to Clinical\.?/i).first()).toBeVisible();
    await expect(page.getByText(/Environmental and Vector domains are enabled in a later phase\.?/i).first()).toBeVisible();

    // Columns — confirmed live: Panel Name / LOINC / Tests / Domain / Sample Types (derived) / Status.
    await expect(page.getByRole('columnheader', { name: /^Panel Name$/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /^LOINC$/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /^Tests$/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /^Domain$/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /sample types/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /^Status$/i })).toBeVisible();

    // At least one row renders with a Domain tag and derived Sample Types tag(s).
    const firstRow = page.locator('table tbody tr').filter({ hasText: /\S/ }).first();
    await expect(firstRow).toBeVisible();
  });

  test('PANEL-LIST-02: search box, Domain/Status filters, and Add Panel button are present (RENDER)', async ({ page }) => {
    await page.goto(`${BASE}/admin/TestCatalogList?entity=panels`);
    await expect(page.getByPlaceholder(/search by name or loinc/i)).toBeVisible();

    // Filter dropdowns — confirmed live default option text.
    await expect(page.getByText(/^All domains$/i).or(page.locator('select', { hasText: /all domains/i })).first()).toBeVisible();
    await expect(page.getByText(/^All statuses$/i).or(page.locator('select', { hasText: /all statuses/i })).first()).toBeVisible();

    await expect(page.getByRole('button', { name: /^Add Panel$/i })).toBeVisible();
  });

  test('PANEL-LIST-03: search by name filters the table (FUNCTION)', async ({ page }) => {
    await page.goto(`${BASE}/admin/TestCatalogList?entity=panels`);
    const search = page.getByPlaceholder(/search by name or loinc/i);
    await search.fill('Complete Blood Count');
    await page.waitForTimeout(1000);
    await expect(page.locator('table tbody').first()).toContainText(/complete blood count/i);
  });
});

// ============================================================================
// PANEL-EDITOR — editor shell + Basic Info section
// ============================================================================
test.describe('PANEL-EDITOR — editor shell and Basic Info (OGC-224)', () => {
  test.beforeEach(async ({ page }) => { await login(page, ADMIN.user, ADMIN.pass); });

  test('PANEL-EDIT-01: opening a panel shows the editor shell with PANEL badge and SideNav sections (RENDER)', async ({ page }) => {
    await openFirstPanel(page);

    await expect(page.getByText(/^Editing panel:/i).first()).toBeVisible();
    await expect(page.getByText(/^PANEL$/).first()).toBeVisible();
    await expect(page.getByText(/^Clinical$/).first()).toBeVisible();

    // SideNav sections: Basic Info, Tests, Terminology.
    await expect(page.getByText(/^Basic Info$/i).first()).toBeVisible();
    await expect(page.getByText(/^Tests$/i).first()).toBeVisible();
    await expect(page.getByText(/^Terminology$/i).first()).toBeVisible();
  });

  test('PANEL-EDIT-02: Basic Info shows the Domain radio group with Environmental/Vector disabled (RENDER)', async ({ page }) => {
    await openFirstPanel(page);
    await openSection(page, /^Basic Info$/i);

    const clinical = page.getByRole('radio', { name: /^Clinical$/i }).first();
    const environmental = page.getByRole('radio', { name: /^Environmental$/i }).first();
    const vector = page.getByRole('radio', { name: /^Vector$/i }).first();

    await expect(clinical).toBeVisible();
    await expect(clinical).toBeEnabled();
    await expect(environmental).toBeDisabled();
    await expect(vector).toBeDisabled();

    // Helper text — confirmed live copy under the Domain radios.
    await expect(page.getByText(/Only Clinical-domain tests can be added to this panel\.?/i).first()).toBeVisible();
    await expect(page.getByText(/Environmental and Vector domains are enabled in a later phase\.?/i).first()).toBeVisible();
  });

  test('PANEL-EDIT-03: Basic Info shows derived Sample Types, Description, Active toggle, and Save (RENDER)', async ({ page }) => {
    await openFirstPanel(page);
    await openSection(page, /^Basic Info$/i);

    await expect(page.getByText(/sample types \(derived\)/i).first()).toBeVisible();
    await expect(page.getByLabel(/^Description$/i).or(page.getByRole('textbox', { name: /description/i })).first()).toBeVisible();
    await expect(page.getByText(/^Active$/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^Save$/i }).first()).toBeVisible();
  });
});

// ============================================================================
// PANEL-TESTS — Tests section
// ============================================================================
test.describe('PANEL-TESTS — Tests section (OGC-224)', () => {
  test.beforeEach(async ({ page }) => { await login(page, ADMIN.user, ADMIN.pass); });

  test('PANEL-TESTS-01: count header, sample-type filter, and Add-a-test typeahead render (RENDER)', async ({ page }) => {
    await openFirstPanel(page);
    await openSection(page, /^Tests$/i);

    await expect(page.getByText(/\d+\s+tests/i).first()).toBeVisible();

    // Filter by sample type + Add a test typeahead sit side-by-side on one row.
    await expect(page.getByText(/^All sample types$/i).or(page.getByLabel(/filter by sample type/i)).first()).toBeVisible();
    await expect(page.getByPlaceholder(/search by name or code/i)).toBeVisible();

    // Helper text — confirmed live copy for the Add-a-test control.
    await expect(page.getByText(/Only Clinical-domain tests can be added to this panel\.?/i).first()).toBeVisible();
    await expect(page.getByText(/Membership writes keep order entry.s panel list in sync\.?/i).first()).toBeVisible();
  });

  test('PANEL-TESTS-02: ordered table renders with reorder/delete controls per row (RENDER)', async ({ page }) => {
    await openFirstPanel(page);
    await openSection(page, /^Tests$/i);

    await expect(page.getByRole('columnheader', { name: /^Order$/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /test name/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /^Code$/i })).toBeVisible();

    const rowCount = await page.locator('table tbody tr').count();
    test.skip(rowCount === 0, 'first panel opened has zero member tests on this instance — cannot assert per-row controls');

    const firstRow = page.locator('table tbody tr').first();
    // Carbon IconButton `label` props from the FRS mockup: "Up" / "Down" / "Remove".
    await expect(firstRow.getByRole('button', { name: /up/i }).or(firstRow.locator('[aria-label*="up" i]')).first()).toBeVisible();
    await expect(firstRow.getByRole('button', { name: /down/i }).or(firstRow.locator('[aria-label*="down" i]')).first()).toBeVisible();
    await expect(firstRow.getByRole('button', { name: /remove|delete/i }).or(firstRow.locator('[aria-label*="remove" i], [aria-label*="delete" i]')).first()).toBeVisible();
  });
});

// ============================================================================
// PANEL-GUARDS — zero-test activation guard (FRS/mockup-derived — NOT confirmed live)
// ============================================================================
test.describe('PANEL-GUARDS — activation rules (OGC-224, FRS-derived)', () => {
  test.beforeEach(async ({ page }) => { await login(page, ADMIN.user, ADMIN.pass); });

  // SPEC-DIVERGENCE: the Add Panel creation flow and this zero-test activation guard were NOT
  // exercised live on testing.openelis-global.org as of this spec's authoring (2026-08-12).
  // The assertion below uses the FRS's exact wording (panel.md, "Activation rules": "A panel
  // cannot be activated until it has at least one test. With zero tests the Active toggle is
  // disabled (not clickable) and shows helper text: 'Add at least one test before this panel
  // can be activated.'"), corroborated by the paired mockup's implementation
  // (`Toggle ... disabled={!canActivate}` where `canActivate = memberCount > 0`,
  // `designs/admin-config/panel.jsx`). If the live copy differs, loosen the helper-text
  // assertion to the disabled-state check only.
  test('PANEL-GUARD-01: a newly created panel with zero tests cannot activate — toggle disabled + helper text (EDGE)', async ({ page }) => {
    await page.goto(`${BASE}/admin/TestCatalogList?entity=panels`);
    await expectNoErrorPage(page);

    const addPanel = page.getByRole('button', { name: /^Add Panel$/i });
    await expect(addPanel).toBeVisible();
    await addPanel.click();
    await page.waitForTimeout(500);

    // A brand-new panel opens straight into the editor shell (Basic Info by default, per the
    // FRS mockup) rather than the "Editing panel: <name>" state used by openFirstPanel() above,
    // since it has no saved name yet — assert on the PANEL badge instead.
    await expect(page.getByText(/^PANEL$/).first()).toBeVisible({ timeout: TIMEOUT });

    const activeToggle = page
      .getByRole('switch', { name: /active/i })
      .or(page.locator('#p-active, [id*="active" i][type="checkbox"], button[aria-label*="active" i]'))
      .first();
    await expect(activeToggle).toBeDisabled();

    await expect(page.getByText(/Add at least one test before this panel can be activated\.?/i).first()).toBeVisible();
  });
});
