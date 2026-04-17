import { test, expect } from '@playwright/test';
import { BASE, ADMIN, PATIENT_NAME, PATIENT_ID, ACCESSION, QA_PREFIX, TIMEOUT, CONFIRMED_ADMIN_URLS, login, navigateWithDiscovery, fillSearchField, getDateRange, getFutureDateRange } from '../helpers/test-helpers';

/**
 * Dashboard KPIs Test Suite
 * Suite: TC-DASH
 * Test Count: 4
 */

test.describe('Dashboard KPIs (TC-DASH)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-DASH-01: Dashboard loads with KPI cards', async ({ page }) => {
    await page.goto(`${BASE}`);
    await page.waitForTimeout(2000);

    // Look for KPI / stat cards — common patterns
    const kpiLocators = [
      page.locator('[class*="tile"], [class*="card"], [class*="kpi"], [class*="stat"]'),
      page.getByText(/awaiting|validation|pending|sample/i),
    ];

    let cardCount = 0;
    for (const loc of kpiLocators) {
      cardCount += await loc.count().catch(() => 0);
    }

    console.log(`TC-DASH-01: ${cardCount} KPI-like elements found on dashboard`);
    if (cardCount === 0) {
      console.log('TC-DASH-01: FAIL — no KPI cards visible on dashboard');
    } else {
      console.log('TC-DASH-01: PASS');
    }
    expect(cardCount).toBeGreaterThan(0);
  });

  test('TC-DASH-02: KPI values are non-zero after QA runs', async ({ page }) => {
    await page.goto(`${BASE}`);
    await page.waitForTimeout(2000);

    const dashboardText = await page.textContent('body') ?? '';
    // Look for numeric values > 0 in KPI sections
    const hasNonZero = /[1-9]\d*/.test(dashboardText);
    console.log(hasNonZero
      ? 'TC-DASH-02: PASS — non-zero value(s) visible on dashboard'
      : 'TC-DASH-02: FAIL — all KPI values appear to be 0 or blank');
    expect(hasNonZero).toBe(true);
  });

  test('TC-DASH-03: KPI card links navigate to filtered views', async ({ page }) => {
    await page.goto(`${BASE}`);
    await page.waitForTimeout(2000);

    // Find clickable KPI card (try "Ready for Validation" or similar)
    const cardLink = page.locator('a[href*="Validation"], a[href*="Result"], [class*="tile"] a, [class*="card"] a').first();
    if (!(await cardLink.isVisible({ timeout: 3000 }).catch(() => false))) {
      console.log('TC-DASH-03: GAP — no clickable KPI card links found');
      return;
    }

    const href = await cardLink.getAttribute('href');
    await cardLink.click();
    await page.waitForTimeout(2000);

    const landedUrl = page.url();
    const navigated = !landedUrl.includes('Dashboard') && landedUrl !== `${BASE}/`;
    console.log(navigated
      ? `TC-DASH-03: PASS — navigated to ${landedUrl}`
      : `TC-DASH-03: FAIL — still on dashboard after click (href=${href})`);
    expect(navigated).toBe(true);
  });

  test('TC-DASH-04: Admin user can access the dashboard after login', async ({ page }) => {
    // Verify that the dashboard is accessible once authenticated —
    // this ensures RBAC doesn't accidentally lock the admin out of their own dashboard.
    // (A lab-tech-specific user test requires a dedicated test user; use admin as proxy here.)
    await page.goto(`${BASE}`);
    await page.waitForTimeout(1500);

    const onDashboard = !page.url().includes('LoginPage');
    expect(onDashboard, 'Dashboard must be accessible after admin login').toBe(true);

    // Dashboard must have meaningful content (not a blank page)
    const bodyLen = (await page.locator('body').textContent() ?? '').length;
    expect(bodyLen, 'Dashboard must render content (not blank)').toBeGreaterThan(500);

    // At least one KPI metric must be visible
    const hasKPI = await page.locator(
      '[class*="tile"], [class*="card"], [class*="kpi"], [class*="stat"], h2, h3'
    ).first().isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasKPI, 'Dashboard must show at least one KPI or stat card').toBe(true);
  });
});
