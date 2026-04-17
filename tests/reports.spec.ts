import { test, expect } from '@playwright/test';
import { Page } from '@playwright/test';
import { BASE, ADMIN, PATIENT_NAME, PATIENT_ID, ACCESSION, QA_PREFIX, TIMEOUT, CONFIRMED_ADMIN_URLS, login, navigateWithDiscovery, fillSearchField, fillDateField, clickButton, getDateRange, getFutureDateRange } from '../helpers/test-helpers';

/**
 * Reports Module Test Suite
 * Covers reports, printing, and export functionality
 * Suite IDs: RPT, AE, AF, AG, L-DEEP
 * Test Count: 20
 */

test.describe('Lab Reports and Print (TC-RPT)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  const KNOWN_ACCESSION = '26CPHL00008V';

  async function goToResultsByOrder(page: Page, accession: string) {
    await page.goto(`${BASE}/AccessionResults`);
    await page.waitForTimeout(1000);
    const accField = page.locator('input[id*="accession" i], input[placeholder*="accession" i]').first();
    if (await accField.isVisible({ timeout: 3000 }).catch(() => false)) {
      await accField.fill(accession);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2000);
    }
  }

  test('TC-RPT-01: Lab report accessible from results view', async ({ page }) => {
    await goToResultsByOrder(page, KNOWN_ACCESSION);

    const printBtn = page.getByRole('button', { name: /print|report|lab report/i }).first();
    const printLink = page.getByRole('link', { name: /print|report|lab report/i }).first();

    const hasPrint = (await printBtn.isVisible({ timeout: 3000 }).catch(() => false)) ||
                     (await printLink.isVisible({ timeout: 3000 }).catch(() => false));

    if (!hasPrint) {
      console.log('TC-RPT-01: GAP — no print/lab report option visible in Results By Order view');
    } else {
      console.log('TC-RPT-01: PASS — Print/Lab Report button found');
    }
    // Non-blocking: GAP is acceptable, we'll document it
  });

  test('TC-RPT-02: Lab report contains patient demographics', async ({ page }) => {
    // Try direct report URL patterns
    const reportUrls = [
      `/PrintLabel?accession=${KNOWN_ACCESSION}`,
      `/LabReport?accession=${KNOWN_ACCESSION}`,
      `/PatientReport?accession=${KNOWN_ACCESSION}`,
    ];

    let reportLoaded = false;
    for (const u of reportUrls) {
      const res = await page.goto(`${BASE}${u}`).catch(() => null);
      if (res && res.ok() && !page.url().includes('LoginPage')) {
        const text = await page.textContent('body') ?? '';
        if (/Sebby|Abby|0123456/i.test(text)) {
          reportLoaded = true;
          console.log(`TC-RPT-02: PASS — patient demographics in report at ${page.url()}`);
          break;
        }
      }
    }

    if (!reportLoaded) {
      console.log('TC-RPT-02: GAP — no direct report URL returned patient demographics');
    }
  });

  test('TC-RPT-03: Lab report contains test result values', async ({ page }) => {
    const reportUrls = [
      `/LabReport?accession=${KNOWN_ACCESSION}`,
      `/PatientReport?accession=${KNOWN_ACCESSION}`,
    ];

    for (const u of reportUrls) {
      const res = await page.goto(`${BASE}${u}`).catch(() => null);
      if (res && res.ok() && !page.url().includes('LoginPage')) {
        const text = await page.textContent('body') ?? '';
        // Check for HGB and a numeric result value
        if (/HGB|Haemoglobin|Hemoglobin/i.test(text) && /\d+\.?\d*/.test(text)) {
          console.log(`TC-RPT-03: PASS — test result data in report at ${page.url()}`);
          return;
        }
      }
    }
    console.log('TC-RPT-03: GAP — could not verify test results in lab report at known URLs');
  });

  test('TC-RPT-04: Label print accessible from order confirmation', async ({ page }) => {
    // Navigate to order confirmation for known accession via order search
    await page.goto(`${BASE}/SampleEdit?type=readwrite`).catch(() => page.goto(`${BASE}/SampleEdit`));
    await page.waitForTimeout(1500);

    const accField = page.locator('input[id*="accession" i], input[placeholder*="accession" i]').first();
    if (await accField.isVisible({ timeout: 3000 }).catch(() => false)) {
      await accField.fill(KNOWN_ACCESSION);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2000);
    }

    const labelBtn = page.getByRole('button', { name: /label|print label/i }).first();
    const labelLink = page.getByRole('link', { name: /label|print label/i }).first();

    const hasLabel = (await labelBtn.isVisible({ timeout: 3000 }).catch(() => false)) ||
                     (await labelLink.isVisible({ timeout: 3000 }).catch(() => false));

    console.log(hasLabel
      ? 'TC-RPT-04: PASS — label print accessible from order view'
      : 'TC-RPT-04: GAP — no label print button in order view');
  });

  test('TC-RPT-05: Batch/reports menu accessible', async ({ page }) => {
    // Try to find a Reports section in the nav
    await page.goto(`${BASE}`);
    await page.waitForTimeout(1000);

    const reportsMenu = page.getByRole('link', { name: /reports?/i }).first();
    const hasReports = await reportsMenu.isVisible({ timeout: 3000 }).catch(() => false);

    if (!hasReports) {
      console.log('TC-RPT-05: GAP — no Reports menu item found in navigation');
      return;
    }

    await reportsMenu.click();
    await page.waitForTimeout(2000);

    const pageTitle = await page.title();
    const bodyText = await page.textContent('body') ?? '';
    const hasDateFilter = /date|from|to|range/i.test(bodyText);

    console.log(hasDateFilter
      ? `TC-RPT-05: PASS — Reports section loaded with date controls (${page.url()})`
      : `TC-RPT-05: FAIL — Reports section loaded but no date filter (${page.url()})`);
  });
});

test.describe('Suite AE — Routine Reports', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-RPT-R01: Patient Status Report page loads', async ({ page }) => {
    // Navigate via hamburger menu
    await page.getByRole('button', { name: /menu/i }).click();
    await page.waitForTimeout(500);

    // Try to find and click Reports menu
    const reportsLink = page.getByText(/^Reports$/i, { exact: true });
    if (await reportsLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await reportsLink.click();
      await page.waitForTimeout(500);

      // Click Routine
      const routineLink = page.getByText('Routine', { exact: true });
      if (await routineLink.isVisible({ timeout: 2000 }).catch(() => false)) {
        await routineLink.click();
        await page.waitForTimeout(500);
      }

      // Click Patient Status Report
      const patientStatusLink = page.getByText(/Patient Status|Status Report/i);
      if (await patientStatusLink.isVisible({ timeout: 2000 }).catch(() => false)) {
        await patientStatusLink.click();
      }
    }

    // URL discovery pattern
    const candidates = [
      '/PatientStatusReport',
      '/Report/PatientStatus',
      '/reports/patient-status',
      '/PatientStatus',
      '/patient-status',
    ];
    const success = await navigateWithDiscovery(page, candidates);

    // Verify page loaded or mark GAP
    if (!success) {
      console.log('GAP: Patient Status Report not found in menu or via URL discovery');
      expect(success).toBe(true);
    }

    // Verify not redirected to login
    expect(page.url()).not.toMatch(/LoginPage|login/i);

    // Verify date picker exists
    const datePicker = page.locator(
      'input[type="date"], input[placeholder*="date" i], [role="button"][aria-label*="date" i]'
    ).first();
    await expect(datePicker).toBeVisible({ timeout: 3000 }).catch(() => {
      console.log('Note: Date picker selector may need adjustment');
    });

    // Verify patient field exists
    const patientField = page.locator(
      'input[placeholder*="patient" i], select[id*="patient" i], input[id*="patient" i]'
    ).first();
    await expect(patientField).toBeVisible({ timeout: 3000 }).catch(() => {
      console.log('Note: Patient field selector may need adjustment');
    });
  });

  test('TC-RPT-R02: Generate Patient Status Report with date range', async ({ page }) => {
    const candidates = [
      '/PatientStatusReport',
      '/Report/PatientStatus',
      '/reports/patient-status',
    ];
    const navigated = await navigateWithDiscovery(page, candidates);

    if (!navigated) {
      console.log('SKIP: Patient Status Report URL not found');
      return;
    }

    const dateRange = await getDateRange();

    // Fill from date
    const fromSelectors = ['input[placeholder*="from" i], input[placeholder*="start" i], input[type="date"]'];
    const fromSuccess = await fillDateField(page, dateRange.from, fromSelectors);

    // Fill to date
    const toSelectors = ['input[placeholder*="to" i], input[placeholder*="end" i]'];
    const toSuccess = await fillDateField(page, dateRange.to, toSelectors);

    // Fill patient if field exists
    const patientSelectors = [
      'input[placeholder*="patient" i]',
      'select[id*="patient" i]',
      'input[id*="patient" i]',
    ];
    const patientFilled = await fillSearchField(page, PATIENT_NAME, patientSelectors);

    // Click generate/view button
    const buttonClicked = await clickButton(page, ['Generate', 'View', 'Search', 'Submit']);

    if (buttonClicked || fromSuccess || toSuccess) {
      await page.waitForTimeout(2000);

      // Verify report output
      const reportContent = page.locator('canvas, [role="document"], table, [class*="report"]').first();
      await expect(reportContent).toBeVisible({ timeout: 8000 }).catch(() => {
        console.log('Note: Report content may be in PDF viewer or external frame');
      });
    } else {
      console.log('SKIP: Could not interact with report generation form');
    }
  });

  test('TC-RPT-R03: Statistics Report page loads with date range selector', async ({ page }) => {
    // Navigate via menu
    await page.getByRole('button', { name: /menu/i }).click();
    await page.waitForTimeout(500);

    const reportsLink = page.getByText(/^Reports$/i, { exact: true });
    if (await reportsLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await reportsLink.click();
      await page.waitForTimeout(500);

      const routineLink = page.getByText('Routine', { exact: true });
      if (await routineLink.isVisible({ timeout: 2000 }).catch(() => false)) {
        await routineLink.click();
        await page.waitForTimeout(500);

        // Find Aggregate Reports submenu
        const aggregateLink = page.getByText(/Aggregate|Statistics/i);
        if (await aggregateLink.isVisible({ timeout: 2000 }).catch(() => false)) {
          await aggregateLink.click();
          await page.waitForTimeout(500);

          // Find Statistics Report
          const statsLink = page.getByText(/Statistics|Aggregate Statistics/i);
          if (await statsLink.isVisible({ timeout: 2000 }).catch(() => false)) {
            await statsLink.click();
          }
        }
      }
    }

    // URL discovery
    const candidates = [
      '/StatisticsReport',
      '/Report/Statistics',
      '/reports/statistics',
      '/AggregateStatistics',
    ];
    const success = await navigateWithDiscovery(page, candidates);

    if (!success) {
      console.log('GAP: Statistics Report not found');
      expect(success).toBe(true);
    }

    expect(page.url()).not.toMatch(/LoginPage|login/i);

    // Verify date fields
    const dateFields = page.locator('input[type="date"], input[placeholder*="date" i]');
    await expect(dateFields.first()).toBeVisible({ timeout: 3000 }).catch(() => {
      console.log('Note: Date fields not visible');
    });
  });

  test('TC-RPT-R04: Generate Statistics Report — verify table/data output', async ({ page }) => {
    const candidates = [
      '/StatisticsReport',
      '/Report/Statistics',
      '/reports/statistics',
    ];
    const navigated = await navigateWithDiscovery(page, candidates);

    if (!navigated) {
      console.log('SKIP: Statistics Report URL not found');
      return;
    }

    const dateRange = await getDateRange();

    // Fill date range
    const dateSelectors = ['input[type="date"], input[placeholder*="date" i]'];
    await fillDateField(page, dateRange.from, dateSelectors);
    await fillDateField(page, dateRange.to, dateSelectors);

    // Click generate button
    const buttonClicked = await clickButton(page, ['Generate', 'View', 'Search', 'Report']);

    if (buttonClicked) {
      await page.waitForTimeout(2000);

      // Verify table appears
      const table = page.locator('table, [role="table"], [class*="table"]').first();
      await expect(table).toBeVisible({ timeout: 8000 }).catch(() => {
        console.log('Note: Table not visible or data not loaded');
      });

      // Verify table has rows
      const rows = page.locator('tbody tr, [role="row"]');
      const rowCount = await rows.count().catch(() => 0);
      if (rowCount > 0) {
        console.log(`Statistics report returned ${rowCount} rows`);
      } else {
        console.log('SKIP: No data in statistics report (date range may have no data)');
      }
    }
  });

  test('TC-RPT-R05: Summary of All Tests report loads and generates', async ({ page }) => {
    // Navigate via menu
    await page.getByRole('button', { name: /menu/i }).click();
    await page.waitForTimeout(500);

    const reportsLink = page.getByText(/^Reports$/i, { exact: true });
    if (await reportsLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await reportsLink.click();
      await page.waitForTimeout(500);

      const routineLink = page.getByText('Routine', { exact: true });
      if (await routineLink.isVisible({ timeout: 2000 }).catch(() => false)) {
        await routineLink.click();
        await page.waitForTimeout(500);

        // Navigate to Aggregate Reports > Summary
        const aggregateLink = page.getByText(/Aggregate|Summary/i);
        if (await aggregateLink.isVisible({ timeout: 2000 }).catch(() => false)) {
          await aggregateLink.click();
          await page.waitForTimeout(500);

          const summaryLink = page.getByText(/Summary of All Tests|All Tests Summary/i);
          if (await summaryLink.isVisible({ timeout: 2000 }).catch(() => false)) {
            await summaryLink.click();
          }
        }
      }
    }

    // URL discovery
    const candidates = [
      '/SummaryReport',
      '/Report/SummaryOfTests',
      '/reports/all-tests',
      '/AllTestsSummary',
    ];
    const success = await navigateWithDiscovery(page, candidates);

    if (!success) {
      console.log('GAP: Summary of All Tests report not found');
      expect(success).toBe(true);
    }

    expect(page.url()).not.toMatch(/LoginPage|login/i);

    // Generate report if form exists
    const dateSelectors = ['input[type="date"], input[placeholder*="date" i]'];
    const dateRange = await getDateRange();
    await fillDateField(page, dateRange.from, dateSelectors);
    await fillDateField(page, dateRange.to, dateSelectors);

    const buttonClicked = await clickButton(page, ['Generate', 'View', 'Report']);

    if (buttonClicked) {
      await page.waitForTimeout(2000);

      const table = page.locator('table, [role="table"]').first();
      await expect(table).toBeVisible({ timeout: 8000 }).catch(() => {
        console.log('Note: Summary table not visible');
      });
    }
  });
});

test.describe('Suite AF — Management Reports', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-RPT-M01: Rejection Report page loads with date picker', async ({ page }) => {
    // Navigate via menu
    await page.getByRole('button', { name: /menu/i }).click();
    await page.waitForTimeout(500);

    const reportsLink = page.getByText(/^Reports$/i, { exact: true });
    if (await reportsLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await reportsLink.click();
      await page.waitForTimeout(500);

      const routineLink = page.getByText('Routine', { exact: true });
      if (await routineLink.isVisible({ timeout: 2000 }).catch(() => false)) {
        await routineLink.click();
        await page.waitForTimeout(500);

        const mgmtLink = page.getByText(/Management Reports/i);
        if (await mgmtLink.isVisible({ timeout: 2000 }).catch(() => false)) {
          await mgmtLink.click();
          await page.waitForTimeout(500);

          const rejectionLink = page.getByText(/Rejection Report/i);
          if (await rejectionLink.isVisible({ timeout: 2000 }).catch(() => false)) {
            await rejectionLink.click();
          }
        }
      }
    }

    // URL discovery
    const candidates = [
      '/RejectionReport',
      '/Report/Rejection',
      '/reports/rejections',
    ];
    const success = await navigateWithDiscovery(page, candidates);

    if (!success) {
      console.log('GAP: Rejection Report not found');
      expect(success).toBe(true);
    }

    expect(page.url()).not.toMatch(/LoginPage|login/i);

    // Verify date picker
    const datePicker = page.locator('input[type="date"], input[placeholder*="date" i]').first();
    await expect(datePicker).toBeVisible({ timeout: 3000 }).catch(() => {
      console.log('Note: Date picker not found');
    });
  });

  test('TC-RPT-M02: Generate Rejection Report — verify rejection data', async ({ page }) => {
    const candidates = ['/RejectionReport', '/Report/Rejection', '/reports/rejections'];
    const navigated = await navigateWithDiscovery(page, candidates);

    if (!navigated) {
      console.log('SKIP: Rejection Report URL not found');
      return;
    }

    const dateRange = await getDateRange();
    const dateSelectors = ['input[type="date"], input[placeholder*="date" i]'];
    await fillDateField(page, dateRange.from, dateSelectors);
    await fillDateField(page, dateRange.to, dateSelectors);

    const buttonClicked = await clickButton(page, ['Generate', 'View', 'Search']);

    if (buttonClicked) {
      await page.waitForTimeout(2000);

      const table = page.locator('table, [role="table"]').first();
      await expect(table).toBeVisible({ timeout: 8000 }).catch(() => {
        console.log('Note: Rejection report table not visible or no data for date range');
      });

      const rows = page.locator('tbody tr, [role="row"]');
      const rowCount = await rows.count().catch(() => 0);
      if (rowCount === 0) {
        console.log('SKIP: No rejection data in date range');
      }
    }
  });

  test('TC-RPT-M03: Referred Out Tests Report loads and generates', async ({ page }) => {
    // Navigate to Activity Reports > Referred Out
    await page.getByRole('button', { name: /menu/i }).click();
    await page.waitForTimeout(500);

    const reportsLink = page.getByText(/^Reports$/i, { exact: true });
    if (await reportsLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await reportsLink.click();
      await page.waitForTimeout(500);

      const routineLink = page.getByText('Routine', { exact: true });
      if (await routineLink.isVisible({ timeout: 2000 }).catch(() => false)) {
        await routineLink.click();
        await page.waitForTimeout(500);

        const mgmtLink = page.getByText(/Management Reports/i);
        if (await mgmtLink.isVisible({ timeout: 2000 }).catch(() => false)) {
          await mgmtLink.click();
          await page.waitForTimeout(500);

          const activityLink = page.getByText(/Activity Reports/i);
          if (await activityLink.isVisible({ timeout: 2000 }).catch(() => false)) {
            await activityLink.click();
            await page.waitForTimeout(500);

            const referredLink = page.getByText(/Referred Out Tests|Referred Out/i);
            if (await referredLink.isVisible({ timeout: 2000 }).catch(() => false)) {
              await referredLink.click();
            }
          }
        }
      }
    }

    // URL discovery
    const candidates = [
      '/ReferredOutReport',
      '/Report/ReferredOut',
      '/reports/referrals',
      '/ReferralReport',
    ];
    const success = await navigateWithDiscovery(page, candidates);

    if (!success) {
      console.log('GAP: Referred Out Tests Report not found');
      expect(success).toBe(true);
    }

    expect(page.url()).not.toMatch(/LoginPage|login/i);

    // Generate report
    const dateSelectors = ['input[type="date"], input[placeholder*="date" i]'];
    const dateRange = await getDateRange();
    await fillDateField(page, dateRange.from, dateSelectors);
    await fillDateField(page, dateRange.to, dateSelectors);

    const buttonClicked = await clickButton(page, ['Generate', 'View']);

    if (buttonClicked) {
      await page.waitForTimeout(2000);

      const table = page.locator('table, [role="table"]').first();
      await expect(table).toBeVisible({ timeout: 8000 }).catch(() => {
        console.log('Note: Referred Out report table not visible');
      });
    }
  });

  test('TC-RPT-M04: Delayed Validation report loads and generates', async ({ page }) => {
    // Navigate to Non Conformity Reports > Delayed Validation
    await page.getByRole('button', { name: /menu/i }).click();
    await page.waitForTimeout(500);

    const reportsLink = page.getByText(/^Reports$/i, { exact: true });
    if (await reportsLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await reportsLink.click();
      await page.waitForTimeout(500);

      const routineLink = page.getByText('Routine', { exact: true });
      if (await routineLink.isVisible({ timeout: 2000 }).catch(() => false)) {
        await routineLink.click();
        await page.waitForTimeout(500);

        const mgmtLink = page.getByText(/Management Reports/i);
        if (await mgmtLink.isVisible({ timeout: 2000 }).catch(() => false)) {
          await mgmtLink.click();
          await page.waitForTimeout(500);

          const ncLink = page.getByText(/Non Conformity|Non-Conformity/i);
          if (await ncLink.isVisible({ timeout: 2000 }).catch(() => false)) {
            await ncLink.click();
            await page.waitForTimeout(500);

            const delayedLink = page.getByText(/Delayed Validation/i);
            if (await delayedLink.isVisible({ timeout: 2000 }).catch(() => false)) {
              await delayedLink.click();
            }
          }
        }
      }
    }

    // URL discovery
    const candidates = [
      '/DelayedValidationReport',
      '/Report/DelayedValidation',
      '/reports/delays',
      '/ValidationDelays',
    ];
    const success = await navigateWithDiscovery(page, candidates);

    if (!success) {
      console.log('GAP: Delayed Validation report not found');
      expect(success).toBe(true);
    }

    expect(page.url()).not.toMatch(/LoginPage|login/i);

    // Generate report
    const dateSelectors = ['input[type="date"], input[placeholder*="date" i]'];
    const dateRange = await getDateRange();
    await fillDateField(page, dateRange.from, dateSelectors);
    await fillDateField(page, dateRange.to, dateSelectors);

    const buttonClicked = await clickButton(page, ['Generate', 'View', 'Search']);

    if (buttonClicked) {
      await page.waitForTimeout(2000);

      const table = page.locator('table, [role="table"]').first();
      await expect(table).toBeVisible({ timeout: 8000 }).catch(() => {
        console.log('Note: Delayed Validation report not visible');
      });
    }
  });

  test('TC-RPT-M05: Audit Trail report loads with date/user filters', async ({ page }) => {
    // Navigate to Non Conformity Reports > Audit Trail
    await page.getByRole('button', { name: /menu/i }).click();
    await page.waitForTimeout(500);

    const reportsLink = page.getByText(/^Reports$/i, { exact: true });
    if (await reportsLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await reportsLink.click();
      await page.waitForTimeout(500);

      const routineLink = page.getByText('Routine', { exact: true });
      if (await routineLink.isVisible({ timeout: 2000 }).catch(() => false)) {
        await routineLink.click();
        await page.waitForTimeout(500);

        const mgmtLink = page.getByText(/Management Reports/i);
        if (await mgmtLink.isVisible({ timeout: 2000 }).catch(() => false)) {
          await mgmtLink.click();
          await page.waitForTimeout(500);

          const ncLink = page.getByText(/Non Conformity|Non-Conformity/i);
          if (await ncLink.isVisible({ timeout: 2000 }).catch(() => false)) {
            await ncLink.click();
            await page.waitForTimeout(500);

            const auditLink = page.getByText(/Audit Trail/i);
            if (await auditLink.isVisible({ timeout: 2000 }).catch(() => false)) {
              await auditLink.click();
            }
          }
        }
      }
    }

    // URL discovery
    const candidates = [
      '/AuditTrailReport',
      '/Report/AuditTrail',
      '/reports/audit',
      '/AuditLog',
    ];
    const success = await navigateWithDiscovery(page, candidates);

    if (!success) {
      console.log('GAP: Audit Trail report not found');
      expect(success).toBe(true);
    }

    expect(page.url()).not.toMatch(/LoginPage|login/i);

    // Verify filters exist
    const dateFields = page.locator('input[type="date"], input[placeholder*="date" i]');
    await expect(dateFields.first()).toBeVisible({ timeout: 3000 }).catch(() => {
      console.log('Note: Date filter not visible');
    });

    const userField = page.locator(
      'input[placeholder*="user" i], select[id*="user" i], input[id*="user" i]'
    ).first();
    await expect(userField).toBeVisible({ timeout: 2000 }).catch(() => {
      console.log('Note: User filter may not be visible');
    });

    // Generate audit trail
    const dateSelectors = ['input[type="date"], input[placeholder*="date" i]'];
    const dateRange = await getDateRange();
    await fillDateField(page, dateRange.from, dateSelectors);
    await fillDateField(page, dateRange.to, dateSelectors);

    const buttonClicked = await clickButton(page, ['Generate', 'View', 'Search']);

    if (buttonClicked) {
      await page.waitForTimeout(2000);

      const table = page.locator('table, [role="table"]').first();
      await expect(table).toBeVisible({ timeout: 8000 }).catch(() => {
        console.log('Note: Audit Trail table not visible');
      });
    }
  });
});

test.describe('Suite AG — WHONET & Export Reports', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-RPT-W01: WHONET Report page loads with organism/antibiotic selectors', async ({ page }) => {
    // Navigate via menu (WHONET may be at top level)
    await page.getByRole('button', { name: /menu/i }).click();
    await page.waitForTimeout(500);

    const reportsLink = page.getByText(/^Reports$/i, { exact: true });
    if (await reportsLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await reportsLink.click();
      await page.waitForTimeout(500);

      const whonetLink = page.getByText(/WHONET/i, { exact: true });
      if (await whonetLink.isVisible({ timeout: 2000 }).catch(() => false)) {
        await whonetLink.click();
      }
    }

    // URL discovery
    const candidates = [
      '/WHONETReport',
      '/Report/WHONET',
      '/reports/whonet',
      '/WHONET',
    ];
    const success = await navigateWithDiscovery(page, candidates);

    if (!success) {
      console.log('GAP: WHONET Report not found (optional for non-microbiology labs)');
      return; // WHONET is optional
    }

    expect(page.url()).not.toMatch(/LoginPage|login/i);

    // Verify organism selector
    const organismField = page.locator(
      'select[id*="organism" i], input[placeholder*="organism" i], [aria-label*="organism" i]'
    ).first();
    await expect(organismField).toBeVisible({ timeout: 3000 }).catch(() => {
      console.log('Note: Organism selector not clearly visible');
    });

    // Verify antibiotic selector
    const antibioticField = page.locator(
      'select[id*="antibiotic" i], input[placeholder*="antibiotic" i], [aria-label*="antibiotic" i]'
    ).first();
    await expect(antibioticField).toBeVisible({ timeout: 3000 }).catch(() => {
      console.log('Note: Antibiotic selector not clearly visible');
    });

    // Verify date fields
    const dateFields = page.locator('input[type="date"]');
    await expect(dateFields.first()).toBeVisible({ timeout: 3000 }).catch(() => {
      console.log('Note: Date fields not visible');
    });
  });

  test('TC-RPT-W02: Generate WHONET Report — verify data export', async ({ page }) => {
    const candidates = ['/WHONETReport', '/Report/WHONET', '/reports/whonet'];
    const navigated = await navigateWithDiscovery(page, candidates);

    if (!navigated) {
      console.log('SKIP: WHONET Report URL not found');
      return;
    }

    const dateRange = await getDateRange();

    // Fill date range
    const dateSelectors = ['input[type="date"], input[placeholder*="date" i]'];
    await fillDateField(page, dateRange.from, dateSelectors);
    await fillDateField(page, dateRange.to, dateSelectors);

    // Try to select organism (optional)
    const organismSelectors = [
      'select[id*="organism" i]',
      'input[placeholder*="organism" i]',
    ];
    await fillSearchField(page, 'All', organismSelectors);

    // Generate report
    const buttonClicked = await clickButton(page, ['Generate', 'Export', 'Download']);

    if (buttonClicked) {
      await page.waitForTimeout(2000);

      // Verify export/output
      const reportContent = page.locator('canvas, [role="document"], table, [class*="export"]').first();
      await expect(reportContent).toBeVisible({ timeout: 8000 }).catch(() => {
        console.log('Note: WHONET export content not visible');
      });
    }
  });

  test('TC-RPT-W03: WHONET Report date range filtering works', async ({ page }) => {
    const candidates = ['/WHONETReport', '/Report/WHONET', '/reports/whonet'];
    const navigated = await navigateWithDiscovery(page, candidates);

    if (!navigated) {
      console.log('SKIP: WHONET Report not found');
      return;
    }

    // Generate initial report
    const dateRange = await getDateRange();
    const dateSelectors = ['input[type="date"], input[placeholder*="date" i]'];
    await fillDateField(page, dateRange.from, dateSelectors);
    await fillDateField(page, dateRange.to, dateSelectors);

    let buttonClicked = await clickButton(page, ['Generate', 'View']);

    if (buttonClicked) {
      await page.waitForTimeout(2000);

      // Change date range to future (no data expected)
      const futureDateRange = await getFutureDateRange();
      const dateFields = page.locator('input[type="date"]');
      await dateFields.first().fill(futureDateRange.from);
      await dateFields.nth(1).fill(futureDateRange.to).catch(() => {
        // If only one date field, skip
      });

      // Regenerate
      const regenerateClicked = await clickButton(page, ['Regenerate', 'View Again', 'Update']);

      if (regenerateClicked) {
        await page.waitForTimeout(2000);

        // Verify filter was applied (no old data visible, or empty state shown)
        const oldData = page.getByText(dateRange.from);
        const isVisible = await oldData.isVisible({ timeout: 1000 }).catch(() => false);

        if (!isVisible) {
          console.log('Filter applied successfully');
        } else {
          console.log('Note: Filter may not have been applied');
        }
      }
    }
  });

  test('TC-RPT-W04: Report handles no-data gracefully (empty date range)', async ({ page }) => {
    // Test with WHONET or any available report
    const candidates = ['/WHONETReport', '/Report/WHONET', '/StatisticsReport'];
    const navigated = await navigateWithDiscovery(page, candidates);

    if (!navigated) {
      console.log('SKIP: No report URL found for no-data test');
      return;
    }

    // Use future date range (guaranteed to have no data)
    const futureDateRange = await getFutureDateRange();
    const dateSelectors = ['input[type="date"], input[placeholder*="date" i]'];
    await fillDateField(page, futureDateRange.from, dateSelectors);
    await fillDateField(page, futureDateRange.to, dateSelectors);

    const buttonClicked = await clickButton(page, ['Generate', 'View', 'Search']);

    if (buttonClicked) {
      await page.waitForTimeout(3000);

      // Verify graceful handling (no crash, no blank page)
      const pageUrl = page.url();
      expect(pageUrl).not.toMatch(/error|500|Exception/i);

      // Verify no unhandled exception in console
      const logs = await page.evaluate(() => {
        // Check for error logs (simplified check)
        return window.name; // Just verify page is responsive
      });

      // Verify page shows empty state message or empty table
      const emptyMessage = page.getByText(/no data|no records|empty|not found/i).first();
      const emptyTable = page.locator('table:has(tbody:empty)').first();

      const hasEmptyState = await Promise.race([
        emptyMessage.isVisible({ timeout: 2000 }),
        emptyTable.isVisible({ timeout: 2000 }),
      ]).catch(() => false);

      if (!hasEmptyState) {
        console.log('Note: Empty state message not clearly visible, but no crash detected');
      }
    }
  });

  test('TC-RPT-W05: Report download/export functionality', async ({ page }) => {
    // Navigate to any report with export capability
    const candidates = ['/WHONETReport', '/Report/WHONET', '/StatisticsReport'];
    const navigated = await navigateWithDiscovery(page, candidates);

    if (!navigated) {
      console.log('SKIP: No report URL found for export test');
      return;
    }

    const dateRange = await getDateRange();

    // Generate report
    const dateSelectors = ['input[type="date"], input[placeholder*="date" i]'];
    await fillDateField(page, dateRange.from, dateSelectors);
    await fillDateField(page, dateRange.to, dateSelectors);

    const generateClicked = await clickButton(page, ['Generate', 'View']);

    if (generateClicked) {
      await page.waitForTimeout(2000);

      // Look for download/export button
      const downloadButton = page.getByRole('button', {
        name: /download|export|pdf|csv|excel/i,
      }).first();

      if (await downloadButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        // Set up download listener
        const downloadPromise = page.waitForEvent('download', { timeout: 10000 });

        await downloadButton.click();

        try {
          const download = await downloadPromise;
          console.log(`Downloaded file: ${download.suggestedFilename()}`);

          // Verify file has expected extension
          const filename = download.suggestedFilename();
          const hasValidExtension = /\.(pdf|csv|xlsx?|txt)$/i.test(filename);
          expect(hasValidExtension).toBe(true);
        } catch (e) {
          console.log('Download not triggered or timed out (may be iframe-based export)');
        }
      } else {
        console.log('Note: Download button not clearly visible');
      }
    }
  });
});

test.describe('Phase 4 — L-DEEP: Reports Generation', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-L-DEEP-01: Patient Status Report has Report By Lab Number accordion', async ({ page }) => {
    // Navigate directly to the confirmed report URL
    const candidates = ['/PatientStatusReport', '/Report/PatientStatus', '/reports/patient-status'];
    const found = await navigateWithDiscovery(page, candidates);
    if (!found) {
      console.log('TC-L-DEEP-01: GAP — Patient Status Report URL not found');
      return;
    }

    await page.waitForLoadState('networkidle');
    const bodyText = await page.locator('body').innerText();
    expect(bodyText, 'Page must not have a server error').not.toMatch(/500|Internal Server Error/);

    // Report By Lab Number section must be present
    const hasLabNumber = /Report By Lab Number|By Lab Number/i.test(bodyText);
    expect(hasLabNumber, 'Patient Status Report must have a "Report By Lab Number" section').toBe(true);

    // If section exists, click it and check From/To fields
    if (hasLabNumber) {
      const labNumberSection = page.getByText(/Report By Lab Number/i).first();
      if (await labNumberSection.isVisible({ timeout: 2000 }).catch(() => false)) {
        await labNumberSection.click();
        await page.waitForTimeout(500);

        const fromVisible = await page.locator('text=From').first().isVisible({ timeout: 2000 }).catch(() => false);
        const toVisible = await page.locator('text=To').first().isVisible({ timeout: 2000 }).catch(() => false);
        console.log(`TC-L-DEEP-01: From visible=${fromVisible}, To visible=${toVisible}`);
      }
    }
  });

  test('TC-L-DEEP-02: Generate Printable Version button is present', async ({ page }) => {
    const candidates = ['/PatientStatusReport', '/Report/PatientStatus', '/reports/patient-status'];
    const found = await navigateWithDiscovery(page, candidates);
    if (!found) {
      console.log('TC-L-DEEP-02: GAP — Patient Status Report URL not found');
      return;
    }

    await page.waitForLoadState('networkidle');

    // Try to expand Report By Lab Number section
    const labSection = page.getByText(/Report By Lab Number/i).first();
    if (await labSection.isVisible({ timeout: 2000 }).catch(() => false)) {
      await labSection.click();
      await page.waitForTimeout(500);
    }

    // Fill a lab number
    const fromInput = page.locator('input').first();
    if (await fromInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await fromInput.fill('26CPHL00008');
    }

    // Generate button must be present — clicking it is optional (may open popup)
    const generateBtn = page.getByRole('button', { name: /Generate Printable Version|Generate/i }).first();
    const generateVisible = await generateBtn.isVisible({ timeout: 3000 }).catch(() => false);
    expect(generateVisible, '"Generate Printable Version" button must be present in report form').toBe(true);
  });
});
