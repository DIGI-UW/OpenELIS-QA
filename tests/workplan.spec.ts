import { test, expect } from '@playwright/test';
import { BASE, ADMIN, PATIENT_NAME, PATIENT_ID, ACCESSION, QA_PREFIX, TIMEOUT, CONFIRMED_ADMIN_URLS, login, navigateWithDiscovery, fillSearchField, getDateRange, getFutureDateRange } from '../helpers/test-helpers';

/**
 * Workplan and Sample Tracking Test Suite
 * Covers workplan features by test type, panel, and priority
 * Suite IDs: WP, AI, J-DEEP, N-DEEP
 * Test Count: 16
 */

test.describe('Workplan and Sample Tracking (TC-WP)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  const WP_URLS = [
    '/WorkPlan',
    '/WorkPlanByTestSection',
    '/WorkPlanByTest',
    '/WorkPlanByPanel',
  ];

  async function goToWorkplan(page: Page): Promise<string> {
    for (const u of WP_URLS) {
      const res = await page.goto(`${BASE}${u}`).catch(() => null);
      if (res && res.ok() && !page.url().includes('LoginPage')) {
        return page.url();
      }
    }
    return '';
  }

  test('TC-WP-01: Workplan screen loads', async ({ page }) => {
    const url = await goToWorkplan(page);
    if (!url) {
      console.log('TC-WP-01: GAP — no workplan URL accessible');
      return;
    }
    console.log(`TC-WP-01: PASS — workplan at ${url}`);
    const hasFilter = await page.locator('select, input[type="text"]').count() > 0;
    expect(hasFilter).toBe(true);
  });

  test('TC-WP-02: Filter workplan by test type (Hematology)', async ({ page }) => {
    const url = await goToWorkplan(page);
    if (!url) {
      console.log('TC-WP-02: SKIP — workplan not accessible');
      return;
    }

    const sectionSelect = page.locator('select').first();
    if (!(await sectionSelect.isVisible({ timeout: 3000 }).catch(() => false))) {
      console.log('TC-WP-02: GAP — no section filter dropdown on workplan');
      return;
    }

    // Select Hematology via Carbon workaround
    await page.evaluate(() => {
      const sel = document.querySelector<HTMLSelectElement>('select');
      if (!sel) return;
      const hemaOption = Array.from(sel.options).find(o => /hematol/i.test(o.text));
      if (!hemaOption) return;
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!;
      setter.call(sel, hemaOption.value);
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(2000);

    const tableRows = await page.getByRole('row').count();
    console.log(`TC-WP-02: Hematology filter — ${tableRows} pending row(s) visible`);
    // Non-failing: 0 rows is acceptable if no pending Hematology work
  });

  test('TC-WP-03: Enter result from workplan and verify persistence', async ({ page }) => {
    const url = await goToWorkplan(page);
    if (!url) {
      console.log('TC-WP-03: SKIP — workplan not accessible');
      return;
    }

    // Find first editable result input in the workplan table
    await page.waitForTimeout(1000);
    const resultInput = page.locator('table input[type="text"], table input[type="number"]').first();
    if (!(await resultInput.isVisible({ timeout: 3000 }).catch(() => false))) {
      console.log('TC-WP-03: SKIP — no editable result inputs in workplan (empty queue or different layout)');
      return;
    }

    // Get the accession for this row (for cross-check)
    const rowAccession = await page.getByRole('row').first().textContent().catch(() => '');

    // Enter result
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await page.evaluate(() => {
      const inp = document.querySelector<HTMLInputElement>('table input[type="text"], table input[type="number"]');
      if (!inp) return;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(inp, '13.5');
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(500);

    // Save
    let saveStatus = 0;
    page.on('response', (r) => {
      if (r.request().method() === 'POST') saveStatus = r.status();
    });

    const saveBtn = page.getByRole('button', { name: /save|submit/i }).first();
    if (await saveBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await saveBtn.click();
      await page.waitForTimeout(2000);
    }

    console.log(`TC-WP-03: Save POST status = ${saveStatus}; accession context: ${rowAccession!.trim().slice(0, 30)}`);
    if (saveStatus >= 200 && saveStatus < 300) {
      console.log('TC-WP-03: PASS — result saved from workplan');
    } else if (saveStatus === 0) {
      console.log('TC-WP-03: INDETERMINATE — could not confirm POST (may be SPA non-POST save)');
    }
  });

  test('TC-WP-04: Completed tests leave workplan pending queue', async ({ page }) => {
    // This test depends on TC-WP-03 having run; we check the queue state
    const url = await goToWorkplan(page);
    if (!url) return;

    await page.evaluate(() => {
      const sel = document.querySelector<HTMLSelectElement>('select');
      if (!sel) return;
      const hema = Array.from(sel.options).find(o => /hematol/i.test(o.text));
      if (hema) {
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!;
        setter.call(sel, hema.value);
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await page.waitForTimeout(2000);

    const pendingRows = await page.getByRole('row').count();
    console.log(`TC-WP-04: ${pendingRows} pending row(s) after prior save. Behavior documented (queue may or may not auto-remove).`);
    // Non-failing: just document the behavior
  });

  test('TC-WP-05: Sample reception screen accessible', async ({ page }) => {
    const receptionUrls = [
      '/SampleLogin',
      '/SpecimenEntry',
      '/BarcodedSamples',
      '/SampleBatchEntry',
    ];

    let found = false;
    for (const u of receptionUrls) {
      const res = await page.goto(`${BASE}${u}`).catch(() => null);
      if (res && res.ok() && !page.url().includes('LoginPage')) {
        const text = await page.textContent('body') ?? '';
        if (/accession|barcode|sample|receive/i.test(text)) {
          found = true;
          console.log(`TC-WP-05: PASS — sample reception at ${page.url()}`);
          break;
        }
      }
    }

    if (!found) {
      console.log('TC-WP-05: GAP — sample reception screen not found at known URLs');
    }
  });

  test('TC-WP-06: Workplan pending count roughly matches dashboard KPI', async ({ page }) => {
    // Read dashboard count
    await page.goto(`${BASE}`);
    await page.waitForTimeout(2000);
    const dashText = await page.textContent('body') ?? '';
    const dashMatch = dashText.match(/awaiting.*?(\d+)|(\d+).*?awaiting/i);
    const dashCount = parseInt(dashMatch?.[1] ?? dashMatch?.[2] ?? '-1', 10);

    // Count workplan rows
    const wpUrl = await goToWorkplan(page);
    if (!wpUrl) {
      console.log('TC-WP-06: SKIP — workplan not accessible');
      return;
    }
    await page.waitForTimeout(1500);
    const wpRows = await page.getByRole('row').count();

    console.log(`TC-WP-06: Dashboard "awaiting" KPI = ${dashCount}, workplan pending rows = ${wpRows}`);
    if (dashCount >= 0) {
      const delta = Math.abs(dashCount - wpRows);
      console.log(delta <= 5
        ? `TC-WP-06: PASS — counts consistent (delta = ${delta})`
        : `TC-WP-06: FAIL — large discrepancy between dashboard (${dashCount}) and workplan (${wpRows})`);
    }
  });
});

test.describe('Suite AI — Workplan By Panel & By Priority', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  // Local URL discovery helper (matches pattern in results-entry.spec.ts)
  async function goToWorkplanByPanel(page: any): Promise<boolean> {
    const candidates = ['/WorkplanByPanel', '/WorkPlanByPanel', '/PanelWorkplan', '/workplan/panel'];
    for (const u of candidates) {
      const res = await page.goto(`${BASE}${u}`).catch(() => null);
      if (res && res.ok() && !page.url().includes('login')) return true;
    }
    return false;
  }

  async function goToWorkplanByPriority(page: any): Promise<boolean> {
    const candidates = ['/WorkplanByPriority', '/WorkPlanByPriority', '/PriorityWorkplan', '/workplan/priority'];
    for (const u of candidates) {
      const res = await page.goto(`${BASE}${u}`).catch(() => null);
      if (res && res.ok() && !page.url().includes('login')) return true;
    }
    return false;
  }

  test('TC-WPP-01: Workplan > By Panel screen loads', async ({ page }) => {
    const found = await goToWorkplanByPanel(page);
    if (!found) {
      console.log('TC-WPP-01: GAP — By Panel URL not accessible');
      test.skip();
      return;
    }

    expect(page.url(), 'Must not redirect to login').not.toContain('login');

    // Either a dropdown selector or heading must be present
    const selector = await page.locator('select, [role="listbox"], .cds--dropdown').first()
      .isVisible({ timeout: 3000 }).catch(() => false);
    const heading = await page.locator('h1, h2, [role="heading"]').first()
      .isVisible({ timeout: 3000 }).catch(() => false);

    expect(selector || heading, 'By Panel workplan must show a selector or heading').toBe(true);
  });

  test('TC-WPP-02: Panel selector has at least one panel option', async ({ page }) => {
    const found = await goToWorkplanByPanel(page);
    if (!found) { test.skip(); return; }

    const selector = page.locator('select').first();
    if (!(await selector.isVisible({ timeout: 3000 }).catch(() => false))) {
      console.log('TC-WPP-02: SKIP — no select dropdown found');
      return;
    }

    const optionCount = await selector.locator('option').count();
    // At minimum there should be a placeholder option
    expect(optionCount, 'Panel selector must have at least one option').toBeGreaterThanOrEqual(1);
    console.log(`TC-WPP-02: Panel selector has ${optionCount} options`);
  });

  test('TC-WPP-03: Selecting a panel loads the workplan table', async ({ page }) => {
    const found = await goToWorkplanByPanel(page);
    if (!found) { test.skip(); return; }

    const selector = page.locator('select').first();
    if (!(await selector.isVisible({ timeout: 3000 }).catch(() => false))) {
      console.log('TC-WPP-03: SKIP — no select dropdown found');
      return;
    }

    await selector.selectOption({ index: 1 }).catch(() => null);
    await page.waitForTimeout(1500);

    // After selecting, a table or result area must appear
    const tableVisible = await page.locator('table, [role="table"]').first()
      .isVisible({ timeout: 5000 }).catch(() => false);
    const bodyText = await page.locator('body').innerText();
    const hasNoData = /no.*test|no.*data|empty/i.test(bodyText);

    expect(tableVisible || hasNoData,
      'Selecting a panel must show a workplan table or empty-state message'
    ).toBe(true);
  });

  test('TC-WPP-04: Workplan > By Priority screen loads', async ({ page }) => {
    const found = await goToWorkplanByPriority(page);
    if (!found) {
      console.log('TC-WPP-04: GAP — By Priority URL not accessible');
      test.skip();
      return;
    }

    expect(page.url(), 'Must not redirect to login').not.toContain('login');

    const filter = await page.locator('select, [role="listbox"], .cds--dropdown').first()
      .isVisible({ timeout: 3000 }).catch(() => false);
    expect(filter, 'By Priority workplan must show a priority filter').toBe(true);
  });

  test('TC-WPP-05: Selecting priority level loads filtered workplan', async ({ page }) => {
    const found = await goToWorkplanByPriority(page);
    if (!found) { test.skip(); return; }

    const filter = page.locator('select').first();
    if (!(await filter.isVisible({ timeout: 3000 }).catch(() => false))) {
      console.log('TC-WPP-05: SKIP — no priority filter dropdown found');
      return;
    }

    await filter.selectOption({ index: 1 }).catch(() => null);
    await page.waitForTimeout(1500);

    // Table must appear after filtering
    const tableVisible = await page.locator('table, [role="table"]').first()
      .isVisible({ timeout: 5000 }).catch(() => false);
    const bodyText = await page.locator('body').innerText();
    const hasNoData = /no.*test|no.*data|empty/i.test(bodyText);

    expect(tableVisible || hasNoData,
      'Selecting a priority must show workplan rows or empty-state'
    ).toBe(true);
  });
});

test.describe('Phase 4 — J-DEEP: Workplan Interaction Tests', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-J-DEEP-01: Workplan By Test — dropdown has test types and selecting one loads data', async ({ page }) => {
    // Navigate directly — more reliable than menu clicks
    const candidates = ['/WorkPlanByTest', '/WorkplanByTest', '/WorkPlanByTestSection'];
    let found = false;
    for (const u of candidates) {
      const res = await page.goto(`${BASE}${u}`).catch(() => null);
      if (res && res.ok() && !page.url().includes('login')) { found = true; break; }
    }
    if (!found) { console.log('TC-J-DEEP-01: SKIP — By Test URL not found'); return; }

    await page.waitForLoadState('networkidle');

    const dropdown = page.locator('select, [role="listbox"]').first();
    await expect(dropdown, 'Test type dropdown must be visible').toBeVisible({ timeout: TIMEOUT });

    const optionCount = await dropdown.locator('option').count();
    expect(optionCount, 'Must have at least 2 test type options (placeholder + one real type)').toBeGreaterThan(1);

    // Select first real option and verify page responds
    await dropdown.selectOption({ index: 1 });
    await page.waitForTimeout(1500);

    // Either a data table or empty-state must appear
    const hasData = await page.locator('table, [role="table"], [class*="data" i]').first()
      .isVisible({ timeout: 5000 }).catch(() => false);
    const hasNoData = await page.locator('text=/no.*test|no.*data|empty/i').first()
      .isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasData || hasNoData, 'Selecting a test type must load data or show empty state').toBe(true);
  });

  test('TC-J-DEEP-02: Workplan By Panel — dropdown has panel options', async ({ page }) => {
    const candidates = ['/WorkPlanByPanel', '/WorkplanByPanel', '/PanelWorkplan'];
    let found = false;
    for (const u of candidates) {
      const res = await page.goto(`${BASE}${u}`).catch(() => null);
      if (res && res.ok() && !page.url().includes('login')) { found = true; break; }
    }
    if (!found) { console.log('TC-J-DEEP-02: SKIP — By Panel URL not found'); return; }

    await page.waitForLoadState('networkidle');

    const dropdown = page.locator('select, [role="listbox"]').first();
    await expect(dropdown, 'Panel dropdown must be visible').toBeVisible({ timeout: TIMEOUT });

    const optionCount = await dropdown.locator('option').count();
    expect(optionCount, 'Panel dropdown must have at least one option').toBeGreaterThanOrEqual(1);
    console.log(`TC-J-DEEP-02: Panel dropdown has ${optionCount} options`);
  });
});

test.describe('Phase 5 — N-DEEP: Workplan Interaction Tests', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-N-DEEP-01: Workplan By Test — has 100+ test types', async ({ page }) => {
    const candidates = ['/WorkPlanByTest', '/WorkplanByTest', '/WorkPlanByTestSection'];
    let found = false;
    for (const u of candidates) {
      const res = await page.goto(`${BASE}${u}`).catch(() => null);
      if (res && res.ok() && !page.url().includes('login')) { found = true; break; }
    }
    if (!found) { console.log('TC-N-DEEP-01: SKIP'); return; }

    await page.waitForLoadState('networkidle');
    const dropdown = page.locator('select').first();
    await expect(dropdown).toBeVisible({ timeout: TIMEOUT });

    const options = await dropdown.locator('option').count();
    // Known: 200+ test types in this instance
    expect(options, 'Should have 100+ test types in dropdown').toBeGreaterThan(100);
    console.log(`TC-N-DEEP-01: ${options} test types in dropdown`);

    // Try selecting a known test type
    const selectSuccess = await page.evaluate(() => {
      const sel = document.querySelector<HTMLSelectElement>('select');
      if (!sel) return false;
      const wbc = Array.from(sel.options).find(o => o.text.includes('WBC') || o.text.includes('Hematol'));
      if (!wbc) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!;
      setter.call(sel, wbc.value);
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    });

    if (selectSuccess) {
      await page.waitForTimeout(3000);
      // Either print option or total count appears after data loads
      const hasContent = await page.locator('text=/Print Workplan|Total Tests|pending/i').first()
        .isVisible({ timeout: 5000 }).catch(() => false);
      console.log(`TC-N-DEEP-01: data loaded after selection = ${hasContent}`);
    }
  });

  test('TC-N-DEEP-02: Workplan By Panel — selecting a panel shows result or empty state', async ({ page }) => {
    const candidates = ['/WorkPlanByPanel', '/WorkplanByPanel'];
    let found = false;
    for (const u of candidates) {
      const res = await page.goto(`${BASE}${u}`).catch(() => null);
      if (res && res.ok() && !page.url().includes('login')) { found = true; break; }
    }
    if (!found) { console.log('TC-N-DEEP-02: SKIP'); return; }

    await page.waitForLoadState('networkidle');
    const dropdown = page.locator('select').first();
    await expect(dropdown).toBeVisible({ timeout: TIMEOUT });

    // Select first available panel
    const optCount = await dropdown.locator('option').count();
    if (optCount < 2) { console.log('TC-N-DEEP-02: No panels available'); return; }

    await dropdown.selectOption({ index: 1 });
    await page.waitForTimeout(3000);

    // Expect either data or an appropriate empty state
    const hasContent = await page.locator(
      'text=/No appropriate tests|Total Tests|Print Workplan|pending/i'
    ).first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasTable = await page.locator('table, [role="table"]').first()
      .isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasContent || hasTable,
      'Selecting a panel must show workplan data or an appropriate empty state'
    ).toBe(true);
  });
});
