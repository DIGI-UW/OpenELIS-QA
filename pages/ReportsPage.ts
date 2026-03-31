import { Page } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page Object Model for OpenELIS Reports.
 * Handles navigation to various report types, form filling, and report generation.
 */
export default class ReportsPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  /**
   * Navigate to Reports section via sidebar.
   */
  async navigateToReports(): Promise<void> {
    await this.navigateViaSidebar('Reports');
  }

  /**
   * Navigate to Patient Status Report.
   */
  async navigateToPatientStatusReport(): Promise<void> {
    await this.navigateViaSidebar('Reports', 'Patient Status');
  }

  /**
   * Navigate to Results Report.
   */
  async navigateToResultsReport(): Promise<void> {
    await this.navigateViaSidebar('Reports', 'Results');
  }

  /**
   * Navigate to Test Catalog Report.
   */
  async navigateToTestCatalogReport(): Promise<void> {
    await this.navigateViaSidebar('Reports', 'Test Catalog');
  }

  /**
   * Navigate to Patient History Report.
   */
  async navigateToPatientHistoryReport(): Promise<void> {
    await this.navigateViaSidebar('Reports', 'Patient History');
  }

  /**
   * Navigate to Test Utilization Report.
   */
  async navigateToTestUtilizationReport(): Promise<void> {
    await this.navigateViaSidebar('Reports', 'Test Utilization');
  }

  /**
   * Fill in the Patient Status Report form.
   *
   * @param patientName - Patient name or ID to filter
   * @param status - Status filter (e.g., "Active", "Inactive")
   * @param dateRange - Optional date range
   */
  async fillPatientStatusReportForm(
    patientName?: string,
    status?: string,
    dateRange?: { startDate: string; endDate: string }
  ): Promise<void> {
    if (patientName) {
      const patientInput = this.page.getByLabel(/patient|name/i).first();
      if (await patientInput.isVisible().catch(() => false)) {
        await patientInput.fill(patientName);
      }
    }

    if (status) {
      const statusSelect = this.page.getByLabel(/status/i);
      if (await statusSelect.isVisible().catch(() => false)) {
        await statusSelect.click();
        await this.page.waitForLoadState('networkidle');

        const statusOption = this.page.getByRole('option', { name: new RegExp(status, 'i') });
        await statusOption.click();
      }
    }

    if (dateRange) {
      const startInput = this.page.getByLabel(/from|start date/i).first();
      const endInput = this.page.getByLabel(/to|end date/i).first();

      if (await startInput.isVisible().catch(() => false)) {
        await startInput.fill(dateRange.startDate);
      }

      if (await endInput.isVisible().catch(() => false)) {
        await endInput.fill(dateRange.endDate);
      }
    }

    await this.page.waitForTimeout(300);
  }

  /**
   * Fill in the Results Report form.
   *
   * @param filters - Object with optional filter parameters
   */
  async fillResultsReportForm(filters: {
    patientName?: string;
    accessionNumber?: string;
    testName?: string;
    unit?: string;
    dateRange?: { startDate: string; endDate: string };
    status?: string;
  }): Promise<void> {
    if (filters.patientName) {
      const input = this.page.getByLabel(/patient|name/i).first();
      if (await input.isVisible().catch(() => false)) {
        await input.fill(filters.patientName);
      }
    }

    if (filters.accessionNumber) {
      const input = this.page.getByLabel(/accession|order number/i).first();
      if (await input.isVisible().catch(() => false)) {
        await input.fill(filters.accessionNumber);
      }
    }

    if (filters.testName) {
      const input = this.page.getByLabel(/test/i).first();
      if (await input.isVisible().catch(() => false)) {
        await input.fill(filters.testName);
      }
    }

    if (filters.unit) {
      const input = this.page.getByLabel(/unit/i).first();
      if (await input.isVisible().catch(() => false)) {
        await input.fill(filters.unit);
      }
    }

    if (filters.dateRange) {
      const startInput = this.page.getByLabel(/from|start date/i).first();
      const endInput = this.page.getByLabel(/to|end date/i).first();

      if (await startInput.isVisible().catch(() => false)) {
        await startInput.fill(filters.dateRange.startDate);
      }

      if (await endInput.isVisible().catch(() => false)) {
        await endInput.fill(filters.dateRange.endDate);
      }
    }

    if (filters.status) {
      const statusSelect = this.page.getByLabel(/status/i);
      if (await statusSelect.isVisible().catch(() => false)) {
        await statusSelect.click();
        await this.page.waitForLoadState('networkidle');

        const statusOption = this.page.getByRole('option', { name: new RegExp(filters.status, 'i') });
        await statusOption.click();
      }
    }

    await this.page.waitForTimeout(300);
  }

  /**
   * Generate the report with current form filters.
   */
  async generateReport(): Promise<void> {
    const generateBtn = this.page.getByRole('button', {
      name: /generate|create|run|submit/i,
    });
    await generateBtn.click();
    await this.waitForPageLoad();
  }

  /**
   * Generate printable version of the report.
   */
  async generatePrintableVersion(): Promise<void> {
    const printBtn = this.page.getByRole('button', { name: /print|printable/i });
    if (await printBtn.isVisible().catch(() => false)) {
      await printBtn.click();
      await this.page.waitForTimeout(500);
    }
  }

  /**
   * Export the report to PDF.
   */
  async exportToPDF(): Promise<void> {
    const exportBtn = this.page.getByRole('button', { name: /export|pdf|download/i });
    if (await exportBtn.isVisible().catch(() => false)) {
      await exportBtn.click();
      await this.page.waitForTimeout(500);
    }
  }

  /**
   * Export the report to Excel.
   */
  async exportToExcel(): Promise<void> {
    const exportBtn = this.page.getByRole('button', { name: /excel|csv|export/i });
    if (await exportBtn.isVisible().catch(() => false)) {
      await exportBtn.click();
      await this.page.waitForTimeout(500);
    }
  }

  /**
   * Get the report results count.
   *
   * @returns The number of rows in the report
   */
  async getReportResultCount(): Promise<number> {
    const rows = this.page.getByRole('row');
    return await rows.count();
  }

  /**
   * Verify report data contains expected columns.
   *
   * @param expectedColumns - Array of expected column names
   * @returns True if all columns are present
   */
  async verifyReportColumns(expectedColumns: string[]): Promise<boolean> {
    for (const column of expectedColumns) {
      const isPresent = await this.pageContainsText(column);
      if (!isPresent) {
        return false;
      }
    }
    return true;
  }

  /**
   * Get report header information.
   *
   * @returns The header text content
   */
  async getReportHeader(): Promise<string | null> {
    const header = this.page.getByRole('heading').first();
    return await header.textContent().catch(() => null);
  }

  /**
   * Get report summary information if available.
   *
   * @returns The summary text
   */
  async getReportSummary(): Promise<string | null> {
    const summary = this.page.getByText(/total|summary|count/i).first();
    return await summary.textContent().catch(() => null);
  }

  /**
   * Clear all report filters and reset form.
   */
  async clearReportFilters(): Promise<void> {
    const clearBtn = this.page.getByRole('button', { name: /clear|reset|x/i });
    if (await clearBtn.isVisible().catch(() => false)) {
      await clearBtn.click();
      await this.waitForPageLoad();
    }
  }

  /**
   * Check if report results are displayed.
   *
   * @returns True if results table is visible
   */
  async areReportResultsDisplayed(): Promise<boolean> {
    const resultTable = this.page.getByRole('table');
    return await resultTable.isVisible().catch(() => false);
  }

  /**
   * Get all report rows as text content.
   *
   * @returns Array of row text content
   */
  async getReportRows(): Promise<string[]> {
    const rows = this.page.getByRole('row');
    const result: string[] = [];
    const count = await rows.count();

    for (let i = 1; i < count; i++) {
      const rowText = await rows.nth(i).textContent();
      if (rowText) {
        result.push(rowText.trim());
      }
    }

    return result;
  }

  /**
   * Schedule a report to be generated at a specific time.
   *
   * @param scheduleTime - The time to run the report (if supported)
   */
  async scheduleReport(scheduleTime: string): Promise<void> {
    const scheduleBtn = this.page.getByRole('button', { name: /schedule|save|plan/i });
    if (await scheduleBtn.isVisible().catch(() => false)) {
      await scheduleBtn.click();
      await this.page.waitForTimeout(300);

      const timeInput = this.page.getByLabel(/time|schedule/i);
      if (await timeInput.isVisible().catch(() => false)) {
        await timeInput.fill(scheduleTime);
      }
    }
  }

  /**
   * Get confirmation message after report generation.
   *
   * @returns The confirmation message
   */
  async getReportConfirmation(): Promise<string | null> {
    return await this.waitForToastMessage(5000).catch(() => null);
  }
}
