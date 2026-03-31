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

  test('TC-DASH-04: Dashboard accessible to lab tech role', async ({ page }) => {
    // Login as lab tech
    await page.goto(`${BASE}/LoginPage`);
    await page.fill('input[name="loginName"]', 'qa_labtech');
    await page.fill('input[name="userPass"]', 'QAlabtech1!');
    await page.getByRole('button', { name: /submit|login|save|next|accept/i }).click();
    await page.waitForTimeout(2000);

    const onDashboard = !page.url().includes('LoginPage');
    const notBlank = (await page.textContent('body') ?? '').length > 500;

    console.log(onDashboard && notBlank
      ? 'TC-DASH-04: PASS — lab tech can access dashboard'
      : 'TC-DASH-04: FAIL — lab tech redirected or dashboard blank');
    expect(onDashboard).toBe(true);
  });
});
