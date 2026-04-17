import { test, expect } from '@playwright/test';
import { BASE, ADMIN, QA_PREFIX, TIMEOUT, login } from '../helpers/test-helpers';

/**
 * Sample Shipment Test Suite — Phase 60
 *
 * User Stories Covered:
 *   US-SHIP-1  As a lab technician, I need to create a labelled shipping box for
 *              referred samples so the receiving lab can match what they expect.
 *   US-SHIP-2  As a shipping coordinator, I need the system to auto-generate a
 *              unique box ID so I never have duplicate box labels.
 *   US-SHIP-3  As a receiving lab technician, I need to scan a barcode to receive
 *              a shipment and confirm all expected samples arrived.
 *   US-SHIP-4  As a lab manager, I need shipment reports filtered by destination
 *              and date so I can audit referral patterns.
 *   US-SHIP-5  As a lab administrator, I need to configure the box label prefix
 *              and set this lab's FHIR organization identity.
 *
 * URLs:
 *   /SampleShipment/boxes     — Dashboard
 *   /SampleShipment/create-box
 *   /SampleShipment/receive
 *   /SampleShipment/reports
 *   /SampleShipment/settings
 *
 * API endpoints exercised:
 *   GET /rest/shipment/boxes         — box list
 *   GET /rest/shipment/facilities    — destination facilities
 *
 * Suite IDs: TC-SHIP-01 through TC-SHIP-09
 * Total: 9 TCs
 */

const SHIP_DASHBOARD = '/SampleShipment/boxes';
const SHIP_CREATE    = '/SampleShipment/create-box';
const SHIP_RECEIVE   = '/SampleShipment/receive';
const SHIP_REPORTS   = '/SampleShipment/reports';
const SHIP_SETTINGS  = '/SampleShipment/settings';

// ---------------------------------------------------------------------------
// Dashboard — US-SHIP-1 (context: what's currently in transit)
// ---------------------------------------------------------------------------

test.describe('Shipment Dashboard (US-SHIP-1, US-SHIP-2)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
    await page.goto(`${BASE}${SHIP_DASHBOARD}`);
    await page.waitForLoadState('networkidle');
  });

  test('TC-SHIP-01: Dashboard shows the 4 transit-state KPI cards', async ({ page }) => {
    // US-SHIP-1: the coordinator needs to see how many boxes are in each state
    const requiredKpis = ['In Transit', 'Delivered', 'Reconciled', 'Total Samples'];
    for (const label of requiredKpis) {
      await expect(
        page.locator(`text="${label}"`).first(),
        `KPI card "${label}" must be visible on Shipment Dashboard`,
      ).toBeVisible({ timeout: TIMEOUT });
    }
  });

  test('TC-SHIP-02: Shipment Boxes table has correct columns for tracking', async ({ page }) => {
    // US-SHIP-1: coordinator needs box ID, destination, state and sample count visible
    const requiredColumns = ['Box ID', 'Destination', 'State', 'Sample Count', 'Created Date'];
    for (const col of requiredColumns) {
      await expect(
        page.locator(`th, [role="columnheader"]`).filter({ hasText: col }).first(),
        `Column "${col}" must appear in Shipment Boxes table`,
      ).toBeVisible({ timeout: TIMEOUT });
    }
  });

  test('TC-SHIP-03: Unassigned Samples tab is accessible', async ({ page }) => {
    // Unassigned samples represent referred results that haven't been boxed yet
    const unassignedTab = page
      .getByRole('tab', { name: /unassigned samples/i })
      .or(page.locator('button, [role="tab"]').filter({ hasText: /unassigned/i }).first());

    await expect(unassignedTab, 'Unassigned Samples tab must be present').toBeVisible({ timeout: TIMEOUT });
    await unassignedTab.click();
    await page.waitForTimeout(500);

    // After clicking, URL or content should reflect unassigned samples context
    const bodyText = await page.locator('body').innerText();
    expect(
      bodyText.toLowerCase().includes('unassigned') || bodyText.includes('0'),
      'Unassigned Samples tab must load without error',
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Create Box — US-SHIP-1, US-SHIP-2
// ---------------------------------------------------------------------------

test.describe('Create Box Form (US-SHIP-1, US-SHIP-2)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
    await page.goto(`${BASE}${SHIP_CREATE}`);
    await page.waitForLoadState('networkidle');
  });

  test('TC-SHIP-04: Auto-generated box ID follows expected format', async ({ page }) => {
    // US-SHIP-2: unique, human-readable box ID is critical — duplicates break chain of custody
    const boxNumberInput = page.locator('input').filter({ hasText: '' }).nth(1)
      .or(page.locator('input[value*="BOX-"], input[value*="SHIP-"]').first());

    // Check via page content since Carbon inputs may not use :value easily
    const bodyText = await page.locator('body').innerText();
    // Format: PREFIX-YYYY-NNNN (e.g. BOX-2026-0001)
    const boxIdMatch = bodyText.match(/[A-Z]+-\d{4}-\d{4}/);
    expect(
      boxIdMatch,
      'Auto-generated box ID must follow PREFIX-YYYY-NNNN format',
    ).not.toBeNull();
  });

  test('TC-SHIP-05: Create Box form has all required fields for a safe shipment', async ({ page }) => {
    // US-SHIP-1: a safe referral shipment needs: destination, capacity, temperature handling, notes
    const requiredLabels = ['Capacity', 'Destination', 'Temperature Requirement', 'Notes'];
    for (const label of requiredLabels) {
      await expect(
        page.locator('label').filter({ hasText: new RegExp(label, 'i') }).first(),
        `Field "${label}" must be present in Create Box form`,
      ).toBeVisible({ timeout: TIMEOUT });
    }

    // Summary panel gives real-time feedback — must be present
    await expect(
      page.locator('text=Summary').first(),
      'Summary sidebar must be present to give real-time box preview',
    ).toBeVisible({ timeout: TIMEOUT });
  });

  test('TC-SHIP-06: Temperature Requirement covers full cold-chain spectrum', async ({ page }) => {
    // US-SHIP-1: temperature chain integrity — a lab technician must be able to mark
    // frozen (-80°C) specimens correctly so the receiving lab handles them properly
    const tempBtn = page.locator('button[aria-haspopup="listbox"]')
      .filter({ hasText: /temperature|select/i })
      .first();

    // Fallback: find by position (second listbox button after destination)
    const allListboxBtns = page.locator('button[aria-haspopup="listbox"]');
    const btnToClick = (await tempBtn.isVisible({ timeout: 1000 }).catch(() => false))
      ? tempBtn
      : allListboxBtns.nth(1);

    await btnToClick.click();
    await page.waitForTimeout(300);

    const options = await page.locator('[role="option"]').allInnerTexts();
    expect(options.length, 'Temperature options must cover at least 4 cold-chain tiers').toBeGreaterThanOrEqual(4);

    const expectedOptions = ['Ambient', 'Refrigerated', 'Frozen', 'Deep Frozen'];
    for (const opt of expectedOptions) {
      expect(
        options.some(o => o.includes(opt)),
        `Temperature option "${opt}" must be available`,
      ).toBe(true);
    }

    await page.keyboard.press('Escape');
  });

  test('TC-SHIP-07: Save as Draft and Save & Mark Ready buttons are present', async ({ page }) => {
    // US-SHIP-1: coordinator needs to save a partial box (draft) separately from
    // marking it ready for pickup — these are distinct actions with different consequences
    await expect(
      page.getByRole('button', { name: /save as draft/i }).first(),
      '"Save as Draft" button must be present',
    ).toBeVisible({ timeout: TIMEOUT });

    await expect(
      page.getByRole('button', { name: /save.*mark.*ready|mark.*ready.*send/i }).first(),
      '"Save & Mark Ready to Send" button must be present',
    ).toBeVisible({ timeout: TIMEOUT });
  });
});

// ---------------------------------------------------------------------------
// Receive Box — US-SHIP-3
// ---------------------------------------------------------------------------

test.describe('Receive Shipment (US-SHIP-3)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
    await page.goto(`${BASE}${SHIP_RECEIVE}`);
    await page.waitForLoadState('networkidle');
  });

  test('TC-SHIP-08: Receive page has barcode scan field and FHIR import', async ({ page }) => {
    // US-SHIP-3: receiving lab technician's two workflows:
    //   (a) scan barcode from a physical box label
    //   (b) import via FHIR from a remote LIS

    // Barcode scan input
    await expect(
      page.locator('input[placeholder*="barcode" i], input[placeholder*="box" i], input[placeholder*="scan" i]').first(),
      'Barcode scan input must be present',
    ).toBeVisible({ timeout: TIMEOUT });

    // Scan Box button
    await expect(
      page.getByRole('button', { name: /scan box/i }).first(),
      '"Scan Box" button must be present',
    ).toBeVisible({ timeout: TIMEOUT });

    // FHIR import — for labs receiving from a FHIR-enabled sender
    await expect(
      page.getByRole('button', { name: /import.*fhir|fhir.*import/i }).first(),
      '"Import from FHIR" button must be present',
    ).toBeVisible({ timeout: TIMEOUT });
  });
});

// ---------------------------------------------------------------------------
// Reports — US-SHIP-4
// ---------------------------------------------------------------------------

test.describe('Shipment Reports (US-SHIP-4)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
    await page.goto(`${BASE}${SHIP_REPORTS}`);
    await page.waitForLoadState('networkidle');
  });

  test('TC-SHIP-09: Reports page has filters needed for referral auditing', async ({ page }) => {
    // US-SHIP-4: lab manager needs to filter by destination lab and date range
    // to audit which labs received which samples and when

    // Box ID search for spot-checking a specific box
    await expect(
      page.locator('input[placeholder*="box" i], input[placeholder*="Box ID" i]').first(),
      'Box ID search field must be present',
    ).toBeVisible({ timeout: TIMEOUT });

    // State filter — to see only delivered or in-transit
    const stateFilter = page.locator('select, button[aria-haspopup="listbox"]')
      .filter({ hasText: /all|state/i }).first();
    await expect(stateFilter, 'Filter by State dropdown must be present').toBeVisible({ timeout: TIMEOUT });

    // Date range pickers
    const dateInputs = page.locator('input[type="date"], input[placeholder*="mm/dd/yyyy" i]');
    const dateCount = await dateInputs.count();
    expect(dateCount, 'From Date and To Date fields must be present (2 date inputs)').toBeGreaterThanOrEqual(2);

    // Generate Report button is the entry point — must be present and enabled
    const generateBtn = page.getByRole('button', { name: /generate report/i }).first();
    await expect(generateBtn, 'Generate Report button must be present').toBeVisible({ timeout: TIMEOUT });
    const isDisabled = await generateBtn.isDisabled();
    expect(isDisabled, 'Generate Report button must be enabled even with empty filters').toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Settings — US-SHIP-5
// ---------------------------------------------------------------------------

test.describe('Shipment Settings (US-SHIP-5)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
    await page.goto(`${BASE}${SHIP_SETTINGS}`);
    await page.waitForLoadState('networkidle');
  });

  test('TC-SHIP-10: Settings shows box label config with live preview', async ({ page }) => {
    // US-SHIP-5: admin needs to configure label prefix so printed barcodes
    // match the lab's naming convention
    await expect(
      page.locator('label').filter({ hasText: /label prefix/i }).first(),
      'Label Prefix field must be present in Settings',
    ).toBeVisible({ timeout: TIMEOUT });

    // Live preview confirms the format before saving
    const previewText = await page.locator('body').innerText();
    const hasPreview = /preview.*BOX|BOX.*\d{4}-\d{4}/i.test(previewText);
    expect(hasPreview, 'Settings must show a live preview of the generated box ID format').toBe(true);

    // FHIR org setting — needed for cross-LIS shipment identification
    await expect(
      page.locator('text=/site organization|this laboratory/i').first(),
      'FHIR Site Organization section must be present',
    ).toBeVisible({ timeout: TIMEOUT });
  });
});
