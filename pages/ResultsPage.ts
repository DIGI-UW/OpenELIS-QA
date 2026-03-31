import { Page } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page Object Model for OpenELIS Results entry and viewing.
 * Handles navigation to results by various criteria, searching, expanding results,
 * and entering result values.
 */
export default class ResultsPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  /**
   * Navigate to Results By Unit view.
   */
  async navigateToResultsByUnit(): Promise<void> {
    await this.navigateViaSidebar('Results', 'By Unit');
  }

  /**
   * Navigate to Results By Order view.
   */
  async navigateToResultsByOrder(): Promise<void> {
    await this.navigateViaSidebar('Results', 'By Order');
  }

  /**
   * Navigate to Results By Patient view.
   */
  async navigateToResultsByPatient(): Promise<void> {
    await this.navigateViaSidebar('Results', 'By Patient');
  }

  /**
   * Navigate to Results By Range view.
   */
  async navigateToResultsByRange(): Promise<void> {
    await this.navigateViaSidebar('Results', 'By Range');
  }

  /**
   * Navigate to Results By Status view.
   */
  async navigateToResultsByStatus(): Promise<void> {
    await this.navigateViaSidebar('Results', 'By Status');
  }

  /**
   * Search for results by accession/order number.
   *
   * @param accessionNumber - The accession or order number
   */
  async searchByAccessionNumber(accessionNumber: string): Promise<void> {
    const searchInput = this.page.getByLabel(/accession|order number|lab number/i).first();
    await searchInput.fill(accessionNumber);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Search for results by patient name.
   *
   * @param patientName - The patient name
   */
  async searchByPatientName(patientName: string): Promise<void> {
    const searchInput = this.page.getByLabel(/patient|name/i).first();
    await searchInput.fill(patientName);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Search for results by test name.
   *
   * @param testName - The test name
   */
  async searchByTestName(testName: string): Promise<void> {
    const searchInput = this.page.getByLabel(/test|exam/i).first();
    await searchInput.fill(testName);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Search for results by test unit.
   *
   * @param unit - The unit name
   */
  async searchByUnit(unit: string): Promise<void> {
    const searchInput = this.page.getByLabel(/unit/i).first();
    await searchInput.fill(unit);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Search for results within a date range.
   *
   * @param startDate - Start date (format: YYYY-MM-DD)
   * @param endDate - End date (format: YYYY-MM-DD)
   */
  async searchByDateRange(startDate: string, endDate: string): Promise<void> {
    const startInput = this.page.getByLabel(/from|start date/i).first();
    const endInput = this.page.getByLabel(/to|end date/i).first();

    await startInput.fill(startDate);
    await endInput.fill(endDate);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Click the search/filter button to apply search criteria.
   */
  async applySearch(): Promise<void> {
    const searchBtn = this.page.getByRole('button', { name: /search|filter|apply/i });
    await searchBtn.click();
    await this.waitForPageLoad();
  }

  /**
   * Get the count of result rows returned by the current search.
   *
   * @returns The number of result rows
   */
  async getResultCount(): Promise<number> {
    const resultRows = this.page.getByRole('row').filter({ hasText: /test|result|status/i });
    return await resultRows.count();
  }

  /**
   * Expand a result row to view details and enter results.
   *
   * @param accessionNumber - The accession number of the result to expand
   */
  async expandResultRow(accessionNumber: string): Promise<void> {
    const resultRow = this.page.getByRole('row').filter({ hasText: accessionNumber });
    const expandBtn = resultRow.getByRole('button', { name: /expand|details|view/i });

    if (await expandBtn.isVisible().catch(() => false)) {
      await expandBtn.click();
    } else {
      await resultRow.click();
    }

    await this.page.waitForTimeout(500);
  }

  /**
   * Enter a result value for a specific test.
   *
   * @param testName - The test name
   * @param resultValue - The result value to enter
   */
  async enterResultValue(testName: string, resultValue: string): Promise<void> {
    // Find the result input field for this test
    const testRow = this.page.getByRole('row').filter({ hasText: testName });
    const resultInput = testRow.getByRole('textbox').first();

    await resultInput.fill(resultValue);
    await this.page.waitForTimeout(300);
  }

  /**
   * Enter result values for multiple tests.
   *
   * @param results - Object with test names as keys and result values
   */
  async enterMultipleResults(results: Record<string, string>): Promise<void> {
    for (const [testName, resultValue] of Object.entries(results)) {
      await this.enterResultValue(testName, resultValue);
    }
  }

  /**
   * Save the entered results.
   */
  async saveResults(): Promise<void> {
    const saveBtn = this.page.getByRole('button', { name: /save|submit|confirm/i });
    await saveBtn.click();
    await this.waitForPageLoad();
  }

  /**
   * Get a toast notification message after saving results.
   *
   * @returns The notification message
   */
  async getSaveConfirmation(): Promise<string | null> {
    return await this.waitForToastMessage(5000).catch(() => null);
  }

  /**
   * Check if a specific result row is visible in the current results.
   *
   * @param accessionNumber - The accession number to look for
   * @returns True if the result is visible
   */
  async isResultVisible(accessionNumber: string): Promise<boolean> {
    return await this.pageContainsText(accessionNumber);
  }

  /**
   * Get all visible result accession numbers.
   *
   * @returns Array of accession numbers
   */
  async getVisibleResults(): Promise<string[]> {
    const resultRows = this.page.getByRole('row').filter({ hasText: /order|accession/i });
    const results: string[] = [];
    const count = await resultRows.count();

    for (let i = 1; i < count; i++) {
      const rowText = await resultRows.nth(i).textContent();
      if (rowText) {
        const match = rowText.match(/[A-Z0-9\-]+/);
        if (match) {
          results.push(match[0]);
        }
      }
    }

    return results;
  }

  /**
   * Clear all search filters and reset the view.
   */
  async clearFilters(): Promise<void> {
    const clearBtn = this.page.getByRole('button', { name: /clear|reset|x/i });
    if (await clearBtn.isVisible().catch(() => false)) {
      await clearBtn.click();
      await this.waitForPageLoad();
    }
  }
}
