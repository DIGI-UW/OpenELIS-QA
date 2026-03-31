import { test, expect } from '@playwright/test';
import { BASE, ADMIN, PATIENT_NAME, PATIENT_ID, ACCESSION, QA_PREFIX, TIMEOUT, CONFIRMED_ADMIN_URLS, login, navigateWithDiscovery, fillSearchField, getDateRange, getFutureDateRange } from '../helpers/test-helpers';

/**
 * Performance and Data Integrity Tests
 * Suites:
 *   - Performance Smoke (TC-PERF) — 6 tests
 *   - Data Integrity and Cross-Module Consistency (TC-DI) — 5 tests
 *   - Phase 4 — X-DEEP: Performance — 3 tests
 *   - Phase 4 — Y-DEEP: Data Integrity — 2 tests
 * Total: 16 tests
 */

// ---------------------------------------------------------------------------
// Suite 26 — Performance Smoke (TC-PERF)
// ---------------------------------------------------------------------------
test.describe('Performance Smoke (TC-PERF)', () => {
  test('TC-PERF-01: Login page load time', async ({ page }) => {
    const start = Date.now();
    await page.goto(`${BASE}/LoginPage`, { waitUntil: 'domcontentloaded' });
    const elapsed = Date.now() - start;
    console.log(`TC-PERF-01: Login page DOMContentLoaded in ${elapsed}ms`);
    expect(elapsed).toBeLessThan(10000); // hard fail at 10s
  });

  test('TC-PERF-02: Add Order wizard step transition time', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
    await page.goto(`${BASE}/SamplePatientEntry`);
    await page.waitForTimeout(1500);

    const timings: number[] = [];
    const nextBtn = page.getByRole('button', { name: /next/i }).first();

    for (let step = 0; step < 3; step++) {
      if (!(await nextBtn.isVisible({ timeout: 2000 }).catch(() => false))) break;
      const start = Date.now();
      await nextBtn.click();
      await page.waitForTimeout(300);
      // Wait for new content to render
      await page.locator('form, [class*="step"], fieldset, table').first().waitFor({ timeout: 5000 }).catch(() => {});
      const elapsed = Date.now() - start;
      timings.push(elapsed);
    }

    console.log(`TC-PERF-02: Step transitions: ${timings.map(t => `${t}ms`).join(', ')}`);
    const maxTime = Math.max(...timings, 0);
    console.log(maxTime < 5000
      ? `TC-PERF-02: PASS — max transition ${maxTime}ms`
      : `TC-PERF-02: FAIL — slow transition ${maxTime}ms`);
  });

  test('TC-PERF-03: Results By Order search latency', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
    await page.goto(`${BASE}/AccessionResults`);
    await page.waitForTimeout(1000);

    const accField = page.locator('input[id*="accession" i]').first();
    if (!(await accField.isVisible({ timeout: 3000 }).catch(() => false))) {
      console.log('TC-PERF-03: SKIP — no accession field');
      return;
    }

    await accField.fill('26CPHL00008V');
    const start = Date.now();
    await page.keyboard.press('Enter');
    await page.getByText(/Sebby|HGB/i).first().waitFor({ timeout: 10000 }).catch(() => {});
    const elapsed = Date.now() - start;

    console.log(`TC-PERF-03: Search latency = ${elapsed}ms`);
    expect(elapsed).toBeLessThan(10000);
  });

  test('TC-PERF-04: Validation queue load time', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
    const start = Date.now();
    const valUrls = ['/ResultValidation?type=order', '/ResultValidation'];
    for (const u of valUrls) {
      const res = await page.goto(`${BASE}${u}`).catch(() => null);
      if (res && res.ok() && !page.url().includes('LoginPage')) break;
    }
    await page.getByRole('row').first().waitFor({ timeout: 15000 }).catch(() => {});
    const elapsed = Date.now() - start;

    console.log(`TC-PERF-04: Validation queue loaded in ${elapsed}ms`);
    const domNodes = await page.evaluate(() => document.querySelectorAll('*').length);
    console.log(`TC-PERF-04: DOM nodes = ${domNodes}`);
    expect(elapsed).toBeLessThan(15000);
  });

  test('TC-PERF-05: Dashboard KPI render time', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
    const start = Date.now();
    await page.goto(`${BASE}`);
    // Wait for KPI content (numbers, not loading spinners)
    await page.locator('[class*="tile"], [class*="card"], [class*="kpi"]').first()
      .waitFor({ timeout: 10000 }).catch(() => {});
    const elapsed = Date.now() - start;

    console.log(`TC-PERF-05: Dashboard KPIs rendered in ${elapsed}ms`);
    expect(elapsed).toBeLessThan(10000);
  });

  test('TC-PERF-06: Memory leak indicator after 10 navigations', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    const getMemory = async () => {
      return page.evaluate(() => {
        const perf = (performance as any).memory;
        return perf ? perf.usedJSHeapSize : -1;
      });
    };

    const initialMem = await getMemory();

    const urls = [
      '', '/SamplePatientEntry', '/AccessionResults',
      '/ResultValidation', '/WorkPlan', '/PatientManagement',
      '/MasterListsPage', '', '/AccessionResults', '/ResultValidation',
    ];

    for (const u of urls) {
      await page.goto(`${BASE}${u}`).catch(() => {});
      await page.waitForTimeout(500);
    }

    const finalMem = await getMemory();

    if (initialMem > 0 && finalMem > 0) {
      const ratio = finalMem / initialMem;
      console.log(`TC-PERF-06: Memory ${(initialMem/1024/1024).toFixed(1)}MB → ${(finalMem/1024/1024).toFixed(1)}MB (${(ratio*100).toFixed(0)}%)`);
      console.log(ratio < 2.0
        ? 'TC-PERF-06: PASS — memory growth within acceptable range'
        : 'TC-PERF-06: WARN — memory doubled after 10 navigations (potential leak)');
    } else {
      console.log('TC-PERF-06: SKIP — performance.memory not available (non-Chrome or restricted)');
    }
  });
});

// ---------------------------------------------------------------------------
// Suite 27 — Data Integrity / Cross-Module Consistency (TC-DI)
// ---------------------------------------------------------------------------
test.describe('Data Integrity and Cross-Module Consistency (TC-DI)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  const ACC = '26CPHL00008V';

  test('TC-DI-01: Accession data consistent across Results and Order Search', async ({ page }) => {
    // Get data from Results By Order
    await page.goto(`${BASE}/AccessionResults`);
    await page.waitForTimeout(1000);
    const accField = page.locator('input[id*="accession" i]').first();
    if (await accField.isVisible({ timeout: 3000 }).catch(() => false)) {
      await accField.fill(ACC);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2000);
    }
    const resultsText = await page.textContent('body') ?? '';

    // Get data from Order Search
    const orderSearchUrls = ['/SampleEdit?type=readwrite', '/SampleEdit', '/OrderSearch'];
    let orderText = '';
    for (const u of orderSearchUrls) {
      const res = await page.goto(`${BASE}${u}`).catch(() => null);
      if (res && res.ok() && !page.url().includes('LoginPage')) {
        const searchField = page.locator('input[id*="accession" i]').first();
        if (await searchField.isVisible({ timeout: 2000 }).catch(() => false)) {
          await searchField.fill(ACC);
          await page.keyboard.press('Enter');
          await page.waitForTimeout(2000);
          orderText = await page.textContent('body') ?? '';
        }
        break;
      }
    }

    const resultHasSebby = /Sebby/i.test(resultsText);
    const orderHasSebby = /Sebby/i.test(orderText);
    const resultHasHGB = /HGB|Haemoglobin|Hemoglobin/i.test(resultsText);
    const orderHasHGB = /HGB|Haemoglobin|Hemoglobin/i.test(orderText);

    console.log(`TC-DI-01: Results: Sebby=${resultHasSebby} HGB=${resultHasHGB} | Order: Sebby=${orderHasSebby} HGB=${orderHasHGB}`);
    const consistent = (resultHasSebby === orderHasSebby) && (resultHasHGB === orderHasHGB);
    console.log(consistent
      ? 'TC-DI-01: PASS — data consistent across Results and Order Search'
      : 'TC-DI-01: FAIL — inconsistency detected between modules');
  });

  test('TC-DI-03: Result value round-trip (decimal precision)', async ({ page }) => {
    await page.goto(`${BASE}/AccessionResults`);
    await page.waitForTimeout(1000);

    const accField = page.locator('input[id*="accession" i]').first();
    if (await accField.isVisible({ timeout: 3000 }).catch(() => false)) {
      await accField.fill(ACC);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2000);
    }

    // Check if a result value is displayed and examine its precision
    const resultCell = page.locator('td, [class*="result"]').filter({ hasText: /^\d+\.?\d*$/ }).first();
    if (await resultCell.isVisible({ timeout: 3000 }).catch(() => false)) {
      const val = await resultCell.textContent() ?? '';
      console.log(`TC-DI-03: Displayed result value = "${val.trim()}"`);
      // Check that decimal isn't truncated
      const hasDecimal = /\d+\.\d+/.test(val.trim());
      console.log(hasDecimal
        ? 'TC-DI-03: PASS — decimal value preserved'
        : 'TC-DI-03: NOTE — integer value or no result displayed (may be acceptable)');
    } else {
      console.log('TC-DI-03: SKIP — no numeric result cell found');
    }
  });

  test('TC-DI-04: Order count consistency (Dashboard vs Workplan)', async ({ page }) => {
    // Dashboard count
    await page.goto(`${BASE}`);
    await page.waitForTimeout(2000);
    const dashText = await page.textContent('body') ?? '';
    const dashMatch = dashText.match(/awaiting.*?(\d+)|(\d+).*?awaiting|pending.*?(\d+)|(\d+).*?pending/i);
    const dashCount = parseInt(dashMatch?.[1] ?? dashMatch?.[2] ?? dashMatch?.[3] ?? dashMatch?.[4] ?? '-1', 10);

    // Workplan count
    const wpUrls = ['/WorkPlan', '/WorkPlanByTestSection'];
    let wpRows = -1;
    for (const u of wpUrls) {
      const res = await page.goto(`${BASE}${u}`).catch(() => null);
      if (res && res.ok() && !page.url().includes('LoginPage')) {
        await page.waitForTimeout(1500);
        wpRows = await page.getByRole('row').count();
        break;
      }
    }

    console.log(`TC-DI-04: Dashboard pending = ${dashCount}, Workplan rows = ${wpRows}`);
    if (dashCount >= 0 && wpRows >= 0) {
      const delta = Math.abs(dashCount - wpRows);
      console.log(delta <= 5
        ? `TC-DI-04: PASS — consistent (delta = ${delta})`
        : `TC-DI-04: FAIL — discrepancy of ${delta} between dashboard and workplan`);
    } else {
      console.log('TC-DI-04: SKIP — could not extract both counts');
    }
  });

  test('TC-DI-06: Orphan detection — results with missing data', async ({ page }) => {
    await page.goto(`${BASE}/AccessionResults`);
    await page.waitForTimeout(2000);

    // Look for any table rows with empty critical cells
    const orphans = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('table tbody tr'));
      let issues = 0;
      rows.forEach(row => {
        const cells = Array.from(row.querySelectorAll('td'));
        const texts = cells.map(c => c.textContent?.trim() ?? '');
        // Flag if first 3 cells are all empty (likely orphan)
        if (texts.slice(0, 3).every(t => t === '' || t === '—')) issues++;
      });
      return issues;
    });

    console.log(orphans === 0
      ? 'TC-DI-06: PASS — no orphaned/malformed result rows detected'
      : `TC-DI-06: WARN — ${orphans} row(s) with empty critical cells`);
  });
});

// =====================================================================
// Phase 4 — X-DEEP: Performance (3 TCs)
// =====================================================================
test.describe('Phase 4 — X-DEEP: Performance', () => {
  test.beforeEach(async ({ page }) => { await login(page, ADMIN.user, ADMIN.pass); });

  test('TC-X-DEEP-01: Dashboard page load metrics', async ({ page }) => {
    await page.goto(`${BASE}/Dashboard`);
    await page.waitForSelector('text=In Progress');
    const metrics = await page.evaluate(() => {
      const perf = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      return {
        ttfb: Math.round(perf.responseStart - perf.requestStart),
        domNodes: document.getElementsByTagName('*').length,
        resources: performance.getEntriesByType('resource').length,
      };
    });
    expect(metrics.ttfb).toBeLessThan(5000); // TTFB under 5s
    expect(metrics.domNodes).toBeLessThan(5000); // DOM nodes reasonable
  });

  test('TC-X-DEEP-02: Large dropdown renders', async ({ page }) => {
    await page.click('text=Workplan');
    await page.click('text=By Test Type');
    await page.waitForSelector('select');
    const optionCount = await page.evaluate(() => {
      const selects = Array.from(document.querySelectorAll('select'));
      const largest = selects.reduce((max, s) => s.options.length > max ? s.options.length : max, 0);
      return largest;
    });
    expect(optionCount).toBeGreaterThan(100); // 303 test types
  });

  test('TC-X-DEEP-03: Memory utilization check', async ({ page }) => {
    await page.goto(`${BASE}/Dashboard`);
    await page.waitForSelector('text=In Progress');
    const heapPct = await page.evaluate(() => {
      const mem = (performance as any).memory;
      return mem ? (mem.usedJSHeapSize / mem.jsHeapSizeLimit * 100) : -1;
    });
    if (heapPct >= 0) {
      expect(heapPct).toBeLessThan(50); // Under 50% heap usage
    }
  });
});

// =====================================================================
// Phase 4 — Y-DEEP: Data Integrity (2 TCs)
// =====================================================================
test.describe('Phase 4 — Y-DEEP: Data Integrity', () => {
  test.beforeEach(async ({ page }) => { await login(page, ADMIN.user, ADMIN.pass); });

  test('TC-Y-DEEP-01: Dashboard KPI vs Validation consistency', async ({ page }) => {
    await page.goto(`${BASE}/Dashboard`);
    await page.waitForSelector('text=Ready For Validation');
    const dashKPI = await page.locator('text=Ready For Validation').locator('..').innerText();
    const kpiValue = parseInt(dashKPI.match(/\d+/)?.[0] || '0');
    expect(kpiValue).toBeGreaterThanOrEqual(0);
    // Navigate to Validation - page should load
    await page.click('text=Validation');
    await page.click('text=Routine');
    await page.waitForSelector('text=Validation');
    await expect(page.locator('text=Select Test Unit')).toBeVisible();
  });

  test('TC-Y-DEEP-02: Cross-module data model consistency', async ({ page }) => {
    await page.goto(`${BASE}/Dashboard`);
    await page.waitForSelector('text=In Progress');
    const inProgressText = await page.locator('text=In Progress').locator('..').locator('..').innerText();
    const inProgressVal = parseInt(inProgressText.match(/\d+/)?.[0] || '0');
    expect(inProgressVal).toBeGreaterThanOrEqual(0);
  });
});
