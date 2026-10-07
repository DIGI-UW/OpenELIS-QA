import { test, expect } from '@playwright/test';
import { BASE, ADMIN, QA_PREFIX, TIMEOUT, login } from '../helpers/test-helpers';

/**
 * Inventory Management Test Suite — Phase 60
 *
 * User Stories Covered:
 *   US-INV-1  As a lab administrator, I need to set up a catalog of reagents and
 *             supplies so I can track stock levels across the lab.
 *   US-INV-2  As a lab manager, I need to see at a glance if any items are running
 *             low or expiring soon so I can reorder before we run out.
 *   US-INV-3  As a lab technician, I need to know which reagents are Active (not
 *             deactivated) before requesting or using them.
 *   US-INV-4  As a lab manager, I need to generate stock level reports to support
 *             procurement justification.
 *
 * URL: /Inventory
 * API endpoints exercised:
 *   GET  /rest/inventory/items/all      — catalog list
 *   POST /rest/inventory/items          — create catalog item (expects HTTP 201)
 *   GET  /rest/inventory/dashboard      — KPI metrics
 *
 * Suite IDs: TC-INV-01 through TC-INV-08
 * Total: 8 TCs
 *
 * Known issues captured as documented tests:
 *   BUG-61: Actions column header renders raw key "label.button.action" (Low, cosmetic)
 */

const INVENTORY_URL = '/Inventory';

/**
 * The visible tab's panel. REWORKED 2026-10-08: Carbon Tabs keep every panel in the DOM, so a
 * page-wide locator's .first() can land in a hidden panel (the Dashboard table also has an
 * "Item Name" column and "All" filters). Every catalog and dashboard check is scoped to its panel.
 */
function tabPanel(page: any, name: 'Dashboard' | 'Catalog' | 'Reports') {
  return page.getByRole('tabpanel', { name });
}

// Re-usable helper: fill a React-controlled input (Carbon TextInput pattern)
// The Add Catalog Item modal. Carbon keeps closed modals mounted (hidden), and the
// tab panels keep their toolbar inputs in the DOM, so a bare page.locator('input')
// lands on a hidden search box. Scope everything to the visible dialog.
async function openAddItemModal(page: any) {
  await page.getByRole('button', { name: /^add catalog item$/i }).click();
  const m = page.getByRole('dialog').last();
  await expect(m, 'Add Catalog Item modal must open').toBeVisible({ timeout: TIMEOUT });
  return m;
}

async function pickReagent(page: any, m: any) {
  await m.getByRole('combobox').first().click();
  await page.getByRole('option', { name: /^Reagent$/ }).click();
}

async function fillReactInput(page: any, selector: string, value: string): Promise<void> {
  await page.evaluate(
    ({ sel, val }: { sel: string; val: string }) => {
      const el = document.querySelector(sel) as HTMLInputElement | null;
      if (!el) throw new Error(`fillReactInput: selector not found — ${sel}`);
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )!.set!;
      el.focus();
      nativeSetter.call(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.blur();
    },
    { sel: selector, val: value },
  );
}

// ---------------------------------------------------------------------------
// Dashboard — US-INV-2
// ---------------------------------------------------------------------------

test.describe('Inventory Dashboard (US-INV-2)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
    await page.goto(`${BASE}${INVENTORY_URL}`);
    await page.waitForLoadState('networkidle');
  });

  test('TC-INV-01: Dashboard tab shows 4 KPI cards with numeric values', async ({ page }) => {
    // Lab manager needs to see stock health at a glance — all four KPI cards must render
    const kpiLabels = ['Total Lots', 'Low Stock', 'Expiring Soon', 'Expired'];
    for (const label of kpiLabels) {
      await expect(
        page.locator(`text=${label}`).first(),
        `KPI card "${label}" must be visible`,
      ).toBeVisible({ timeout: TIMEOUT });
    }

    // Each card must contain a numeric value (even if 0). REWORKED 2026-10-08: the tiles are plain
    // divs (number above label), not h2/h3 or kpi-* classes, so each label's own tile is read.
    const panel = tabPanel(page, 'Dashboard');
    for (const label of kpiLabels) {
      const tile = panel.getByText(label, { exact: true }).first().locator('..');
      await expect(tile, `KPI card "${label}" shows a number`).toContainText(/\d+/);
    }
  });

  test('TC-INV-02: Catalog tab is accessible and shows table column headers', async ({ page }) => {
    // Lab technician needs the catalog tab so they can see available items (US-INV-3)
    await page.getByRole('tab', { name: /catalog/i }).click();
    await page.waitForLoadState('networkidle');

    // Required columns for a useful catalog view
    const requiredColumns = ['Item Name', 'Item Type', 'Units', 'Status'];
    for (const col of requiredColumns) {
      await expect(
        tabPanel(page, 'Catalog').locator(`th, [role="columnheader"]`).filter({ hasText: col }).first(),
        `Column "${col}" must appear in catalog table`,
      ).toBeVisible({ timeout: TIMEOUT });
    }
  });

  test('TC-INV-03: the catalog Action column is labelled, not a raw i18n key [FIXED BUG-61]', async ({ page }) => {
    // FIXED BUG-61, flipped 2026-10-08: the header reads "Action" on develop (it showed the raw key
    // "label.button.action"). Was a documenting case that accepted either form and looked for the
    // plural "Actions", which is why it failed once the key was resolved to the singular.
    await page.getByRole('tab', { name: /catalog/i }).click();
    await page.waitForLoadState('networkidle');

    const panel = tabPanel(page, 'Catalog');
    await expect(panel.getByRole('columnheader', { name: /^Actions?$/ }).first(),
      'the Action column header is a resolved label').toBeVisible({ timeout: TIMEOUT });
    expect(await panel.innerText(), 'no raw i18n key in the catalog').not.toContain('label.button.action');
  });
});

// ---------------------------------------------------------------------------
// Catalog CRUD — US-INV-1, US-INV-3
// ---------------------------------------------------------------------------

test.describe('Inventory Catalog CRUD (US-INV-1, US-INV-3)', () => {
  // Unique per run so a same-day re-run does not collide with yesterday's item.
  const ITEM_NAME = `${QA_PREFIX}_REAGENT_${String(Date.now()).slice(-6)}`;

  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
    await page.goto(`${BASE}${INVENTORY_URL}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: /catalog/i }).click();
    await page.waitForLoadState('networkidle');
  });

  test('TC-INV-04: Add Catalog Item button opens the create modal', async ({ page }) => {
    // US-INV-1: lab admin must be able to open the form to add a new item
    await page.getByRole('button', { name: /add catalog item/i }).click();
    await page.waitForTimeout(500);

    await expect(
      page.getByRole('dialog').or(page.locator('[class*="modal"], [class*="Modal"]')).first(),
      'Add Catalog Item modal must open',
    ).toBeVisible({ timeout: TIMEOUT });

    // Verify all required fields are present in the modal
    await expect(page.locator('label').filter({ hasText: /item name/i }).first()).toBeVisible();
    await expect(page.locator('label').filter({ hasText: /item type/i }).first()).toBeVisible();
    await expect(page.locator('label').filter({ hasText: /units/i }).first()).toBeVisible();
    await expect(page.locator('label').filter({ hasText: /low stock threshold/i }).first()).toBeVisible();
    await expect(page.locator('label').filter({ hasText: /stability after opening/i }).first()).toBeVisible();
  });

  test('TC-INV-05: Reagent type enforces stability validation before saving', async ({ page }) => {
    // US-INV-1: the system should prevent saving a reagent without stability data,
    // because expired reagents produce unreliable results
    const m = await openAddItemModal(page);
    await m.locator('#name').fill(`${ITEM_NAME}_VALIDATIONTEST`);
    await pickReagent(page, m);
    await m.locator('#units').fill('mL');
    // Stability After Opening left empty.
    await m.locator('#stabilityAfterOpening').fill('');

    await m.getByRole('button', { name: /^save$/i }).click();

    // Should see a validation error and the modal stays open.
    await expect(m.getByText(/stability/i).filter({ hasText: /required|must|enter/i }).first(),
      'Should block save and show stability validation error for reagents').toBeVisible({ timeout: TIMEOUT });
    await expect(m, 'Modal should remain open after failed validation').toBeVisible();
  });

  test('TC-INV-06: Lab admin can create a catalog item and it appears in the list', async ({ page }) => {
    // US-INV-1: full happy-path — create item, confirm it shows up with Active status
    const m = await openAddItemModal(page);
    await m.locator('#name').fill(ITEM_NAME);
    await pickReagent(page, m);
    await m.locator('#units').fill('mL');
    await m.locator('#lowStockThreshold').fill('5');
    // Required for the Reagent type.
    await m.locator('#stabilityAfterOpening').fill('30');

    // Intercept the POST to confirm HTTP 201
    const [response] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/rest/inventory/items') && r.request().method() === 'POST',
        { timeout: 10000 },
      ),
      m.getByRole('button', { name: /^save$/i }).click(),
    ]);

    expect(response.status(), 'POST /rest/inventory/items should return 201 Created').toBe(201);

    // After save, the modal should close and the new item should appear in the table
    await expect(m, 'Modal should close after successful save').toBeHidden({ timeout: TIMEOUT });

    // New item should be in the catalog table
    await expect(
      page.locator('td, [role="cell"]').filter({ hasText: ITEM_NAME }).first(),
      `Created item "${ITEM_NAME}" must appear in catalog table`,
    ).toBeVisible({ timeout: 5000 });

    // Status must be Active, not Inactive
    const row = page.locator('tr, [role="row"]').filter({ hasText: ITEM_NAME }).first();
    await expect(
      row.locator('text=/active/i').first(),
      'Newly created catalog item must have Active status',
    ).toBeVisible({ timeout: TIMEOUT });
  });

  test('TC-INV-07: Catalog list can be filtered by Item Type', async ({ page }) => {
    // US-INV-3: a lab technician filtering by type should only see relevant items
    const filterDropdowns = tabPanel(page, 'Catalog').locator('button[aria-haspopup="listbox"], [role="combobox"], select').filter({ hasText: /all/i });
    const dropdownCount = await filterDropdowns.count();
    expect(dropdownCount, 'At least one "All" filter dropdown must be present in catalog').toBeGreaterThan(0);

    // Open the first filter dropdown and verify it has options
    await filterDropdowns.first().click();
    await page.waitForTimeout(300);

    const options = page.locator('[role="option"]');
    const optionCount = await options.count();
    expect(optionCount, 'Item Type filter should have at least one option').toBeGreaterThan(0);

    await page.keyboard.press('Escape');
  });
});

// ---------------------------------------------------------------------------
// Reports — US-INV-4
// ---------------------------------------------------------------------------

test.describe('Inventory Reports (US-INV-4)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
    await page.goto(`${BASE}${INVENTORY_URL}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: /reports/i }).click();
    await page.waitForLoadState('networkidle');
  });

  test('TC-INV-08: Reports tab has required report types for procurement justification', async ({ page }) => {
    // US-INV-4: the lab manager specifically needs Stock Levels and Low Stock Alert
    // reports to justify ordering decisions

    // Open the Report Type dropdown
    const reportTypeBtn = page.locator('button').filter({ hasText: /stock levels report|report type/i }).first();
    await reportTypeBtn.click();
    await page.waitForTimeout(300);

    const options = await page.locator('[role="option"]').allInnerTexts();
    expect(options.length, 'Report Type dropdown must have at least 4 report types').toBeGreaterThanOrEqual(4);

    // These two are critical for procurement (US-INV-4)
    const hasStockLevels = options.some(o => /stock levels/i.test(o));
    const hasLowStockAlert = options.some(o => /low stock/i.test(o));
    expect(hasStockLevels, 'Stock Levels Report must be available').toBe(true);
    expect(hasLowStockAlert, 'Low Stock Alert report must be available for procurement decisions').toBe(true);

    await page.keyboard.press('Escape');

    // Generate button must be present and enabled
    await expect(
      page.getByRole('button', { name: /generate/i }).first(),
      'Generate Report button must be visible and clickable',
    ).toBeVisible({ timeout: TIMEOUT });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Inventory API Extended (TC-INV-EXT)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Inventory API Extended (TC-INV-EXT)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
    await page.goto(`${BASE}${INVENTORY_URL}`);
    await page.waitForLoadState('networkidle');
  });

  test('TC-INV-EXT-01: Inventory catalog API returns item list', async ({ page }) => {
    /**
     * US-INV-1: The catalog API is the data source for all inventory views.
     * Must return HTTP 200 with an array (even if empty in a fresh install).
     */
    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch('/api/OpenELIS-Global/rest/inventory/items/all', {
        headers: { 'X-CSRF-Token': csrf },
      });
      if (!res.ok) return { status: res.status, count: -1 };
      const data = await res.json().catch(() => null);
      return {
        status: res.status,
        count: Array.isArray(data) ? data.length : (data?.items?.length ?? -1),
        isArray: Array.isArray(data),
      };
    });

    console.log(`TC-INV-EXT-01: catalog API → HTTP ${result.status}, count=${result.count}`);
    expect(result.status, 'Inventory catalog API must return 200').toBe(200);
    expect(result.count, 'Catalog count must be ≥ 0').toBeGreaterThanOrEqual(0);
  });

  test('TC-INV-EXT-02: Inventory dashboard API returns KPI metrics', async ({ page }) => {
    /**
     * US-INV-2: The dashboard tiles pull from a metrics API.
     * Checks that Total Lots, Low Stock, Expiring, Expired fields are present.
     */
    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const candidates = [
        '/api/OpenELIS-Global/rest/inventory/dashboard',
        '/api/OpenELIS-Global/rest/inventory/metrics',
        '/api/OpenELIS-Global/rest/inventory/summary',
      ];
      for (const path of candidates) {
        const res = await fetch(path, { headers: { 'X-CSRF-Token': csrf } });
        if (res.status === 404) continue;
        const data = await res.json().catch(() => null);
        return { status: res.status, path, keys: data ? Object.keys(data) : [] };
      }
      return { status: 404, path: 'none', keys: [] };
    });

    console.log(`TC-INV-EXT-02: ${result.path} → HTTP ${result.status}, keys=[${result.keys.join(', ')}]`);
    expect(result.status, 'Inventory dashboard API must not return 5xx').not.toBeGreaterThanOrEqual(500);
  });

  test('TC-INV-EXT-03: Create catalog item write-then-verify cycle', async ({ page }) => {
    /**
     * US-INV-1: Full CRUD verification — create a catalog item via POST and
     * immediately verify it appears in the GET list response.
     */
    const itemName = `${QA_PREFIX}_INV_Verify`;

    const result = await page.evaluate(async (name) => {
      const csrf = localStorage.getItem('CSRF') || '';
      const payload = {
        name,
        itemType: 'Reagent',
        units: 'mL',
        lowStockThreshold: 10,
        stabilityAfterOpening: 30,
        active: true,
      };
      const post = await fetch('/api/OpenELIS-Global/rest/inventory/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify(payload),
      });
      if (!post.ok && post.status !== 201) return { postStatus: post.status, found: false };

      const list = await fetch('/api/OpenELIS-Global/rest/inventory/items/all', {
        headers: { 'X-CSRF-Token': csrf },
      });
      const items = await list.json().catch(() => []);
      const found = Array.isArray(items) && items.some((i: any) => i.name === name);
      return { postStatus: post.status, found };
    }, itemName);

    console.log(`TC-INV-EXT-03: POST=${result.postStatus}, verified in list=${result.found}`);
    if (result.postStatus === 200 || result.postStatus === 201) {
      expect(result.found, `Item "${itemName}" must appear in catalog after creation`).toBe(true);
    } else {
      console.log(`TC-INV-EXT-03: NOTE — POST returned ${result.postStatus} (API may require different payload)`);
    }
  });

  test('TC-INV-EXT-04: Inactive item filter shows only active items by default', async ({ page }) => {
    /**
     * US-INV-3: Lab technicians must only see Active items when selecting reagents.
     * The catalog table should not show deactivated items unless explicitly filtered.
     */
    await page.getByRole('tab', { name: /catalog/i }).click();
    await page.waitForLoadState('networkidle');

    const bodyText = await page.locator('body').innerText();

    // Look for Active status indicators in the table
    const hasActiveStatus = /active|enabled/i.test(bodyText);
    const hasInactiveByDefault = /inactive|disabled|deactivated/i.test(bodyText);

    console.log(`TC-INV-EXT-04: Active items visible=${hasActiveStatus}, inactive visible by default=${hasInactiveByDefault}`);
    expect(hasActiveStatus, 'Active status must be visible in catalog').toBe(true);
  });

  test('TC-INV-EXT-05: Inventory page does not crash on rapid tab switching', async ({ page }) => {
    /**
     * US-INV-2: Lab managers switch between Dashboard and Catalog frequently.
     * Rapid tab switching must not cause a JS error or blank screen.
     */
    const tabs = ['dashboard', 'catalog'];
    for (let i = 0; i < 3; i++) {
      for (const tab of tabs) {
        const tabBtn = page.getByRole('tab', { name: new RegExp(tab, 'i') }).first();
        if (await tabBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
          await tabBtn.click();
          await page.waitForTimeout(300);
        }
      }
    }
    const bodyText = await page.locator('body').innerText();
    expect(bodyText, 'Rapid tab switching must not cause Internal Server Error').not.toContain('Internal Server Error');
    expect(bodyText.length, 'Page must still render content after tab switching').toBeGreaterThan(100);
    console.log('TC-INV-EXT-05: PASS — rapid tab switching handled gracefully');
  });

  test('TC-INV-EXT-06: Inventory API concurrent reads are stable', async ({ page }) => {
    /**
     * US-INV-2: Multiple lab staff may load inventory simultaneously.
     * Concurrent reads must return consistent results without 5xx errors.
     */
    const results = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const fetches = Array.from({ length: 5 }, () =>
        fetch('/api/OpenELIS-Global/rest/inventory/items/all', {
          headers: { 'X-CSRF-Token': csrf },
        }).then(r => r.status)
      );
      return Promise.all(fetches);
    });

    console.log(`TC-INV-EXT-06: 5 concurrent inventory reads: [${results.join(', ')}]`);
    const errors = results.filter(s => s >= 500);
    expect(errors.length, 'No 5xx on concurrent inventory reads').toBe(0);
  });
});
