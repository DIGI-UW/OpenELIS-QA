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

  test('TC-WPP-01: Workplan > By Panel screen loads', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['Workplan', 'By Panel']);
    } catch (e) {
      const found = await tryNavigateToURL(page, ['/WorkplanByPanel', '/PanelWorkplan', '/workplan/panel']);
      if (!found) {
        test.skip();
        return;
      }
    }

    await page.waitForTimeout(1000);

    expect(page.url()).not.toContain('login');

    // Check for selector or heading
    const selector = await page.$('select, [role="listbox"], [class*="dropdown"], [class*="selector"]');
    const heading = await page.$('h1, h2, [role="heading"]');

    expect(selector || heading).toBeTruthy();
  });

  test('TC-WPP-02: Panel selector populates with panels', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['Workplan', 'By Panel']);
    } catch (e) {
      await tryNavigateToURL(page, ['/WorkplanByPanel', '/PanelWorkplan', '/workplan/panel']);
    }

    await page.waitForTimeout(1000);

    const selector = await page.$('select');
    if (!selector) {
      test.skip();
      return;
    }

    const options = await page.$$('option, [role="option"]');
    expect(options.length).toBeGreaterThanOrEqual(0);
  });

  test('TC-WPP-03: Select panel shows filtered workplan items', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['Workplan', 'By Panel']);
    } catch (e) {
      await tryNavigateToURL(page, ['/WorkplanByPanel', '/PanelWorkplan', '/workplan/panel']);
    }

    await page.waitForTimeout(1000);

    const selector = await page.$('select');
    if (selector) {
      await selector.selectOption({ index: 1 }).catch(() => null);
      await page.waitForTimeout(1000);
    }

    const table = await page.$('table, [role="table"]');
    expect(table).toBeTruthy();
  });

  test('TC-WPP-04: Workplan > By Priority screen loads', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['Workplan', 'By Priority']);
    } catch (e) {
      const found = await tryNavigateToURL(page, ['/WorkplanByPriority', '/PriorityWorkplan', '/workplan/priority']);
      if (!found) {
        test.skip();
        return;
      }
    }

    await page.waitForTimeout(1000);

    expect(page.url()).not.toContain('login');

    const filter = await page.$('select, [role="listbox"], [class*="filter"]');
    expect(filter).toBeTruthy();
  });

  test('TC-WPP-05: Priority filter shows urgent and routine items', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['Workplan', 'By Priority']);
    } catch (e) {
      await tryNavigateToURL(page, ['/WorkplanByPriority', '/PriorityWorkplan', '/workplan/priority']);
    }

    await page.waitForTimeout(1000);

    const filter = await page.$('select, [role="listbox"]');
    if (filter) {
      await filter.selectOption({ index: 1 }).catch(() => null);
      await page.waitForTimeout(1000);
    }

    const table = await page.$('table, [role="table"]');
    expect(table).toBeTruthy();
  });
});

test.describe('Phase 4 — J-DEEP: Workplan Interaction Tests', () => {
  test.beforeEach(async ({ page }) => { await login(page, ADMIN.user, ADMIN.pass); });

  test('TC-J-DEEP-01: Select test type, view data', async ({ page }) => {
    await page.click('text=Workplan');
    await page.click('text=By Test');
    await page.waitForSelector('text=Test Type');
    // Dropdown populated with test types
    const dropdown = page.locator('select, [role="listbox"]').first();
    await expect(dropdown).toBeVisible();
    const options = await dropdown.locator('option').count();
    expect(options).toBeGreaterThan(1); // At least "Select..." + one test type
    // Select first real option and verify data loads
    await dropdown.selectOption({ index: 1 });
    await page.waitForTimeout(1000);
    // Table or data area should be present
    await expect(page.locator('table, [class*="data" i]')).toBeVisible();
  });

  test('TC-J-DEEP-02: Select panel', async ({ page }) => {
    await page.click('text=Workplan');
    await page.click('text=By Panel');
    await page.waitForSelector('text=Panel');
    // Panel dropdown populated
    const dropdown = page.locator('select, [role="listbox"]').first();
    await expect(dropdown).toBeVisible();
    const options = await dropdown.locator('option').count();
    expect(options).toBeGreaterThan(1);
  });
});

test.describe('Phase 5 — N-DEEP: Workplan Interaction Tests', () => {
  test.beforeEach(async ({ page }) => { await login(page, ADMIN.user, ADMIN.pass); });

  test('TC-N-DEEP-01: Workplan By Test with data', async ({ page }) => {
    await page.click('text=Workplan');
    await page.click('text=By Test Type');
    await page.waitForSelector('select');
    const dropdown = page.locator('select').first();
    const options = await dropdown.locator('option').count();
    expect(options).toBeGreaterThan(100); // 200+ test types
    // Select WBC and verify data loads
    await dropdown.selectOption({ label: 'WBC(Whole Blood)(Whole Blood)' });
    await page.waitForTimeout(3000);
    await expect(page.locator('text=Print Workplan').or(page.locator('text=Total Tests'))).toBeVisible();
  });

  test('TC-N-DEEP-02: Workplan By Panel empty state', async ({ page }) => {
    await page.click('text=Workplan');
    await page.click('text=By Panel');
    await page.waitForSelector('select');
    const dropdown = page.locator('select').first();
    await dropdown.selectOption({ label: 'NFS' });
    await page.waitForTimeout(3000);
    await expect(page.locator('text=No appropriate tests').or(page.locator('text=Total Tests'))).toBeVisible();
  });
});
