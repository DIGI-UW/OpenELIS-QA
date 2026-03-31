import { Page } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page Object Model for OpenELIS Referral Management.
 * Handles navigation to referred out tests, searching for referrals,
 * entering referral results, and generating reports.
 */
export default class ReferralPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  /**
   * Navigate to Referred Out Tests page.
   */
  async navigateToReferredOutTests(): Promise<void> {
    await this.navigateToPath('/ReferredOutTests');
  }

  /**
   * Search for referred out tests by patient name.
   *
   * @param patientName - The patient name
   */
  async searchByPatientName(patientName: string): Promise<void> {
    const searchInput = this.page.getByLabel(/patient|name/i).first();
    await searchInput.fill(patientName);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Search for referred out tests by accession number.
   *
   * @param accessionNumber - The accession/order number
   */
  async searchByAccessionNumber(accessionNumber: string): Promise<void> {
    const searchInput = this.page.getByLabel(/accession|order number|lab number/i).first();
    await searchInput.fill(accessionNumber);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Search for referred out tests by test name.
   *
   * @param testName - The test name
   */
  async searchByTestName(testName: string): Promise<void> {
    const searchInput = this.page.getByLabel(/test|exam/i).first();
    await searchInput.fill(testName);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Search for referred out tests by unit.
   *
   * @param unit - The unit name
   */
  async searchByUnit(unit: string): Promise<void> {
    const searchInput = this.page.getByLabel(/unit/i).first();
    await searchInput.fill(unit);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Search for referred out tests within a date range.
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
   * Search for referred out tests by lab number (if applicable).
   *
   * @param labNumber - Lab number
   */
  async searchByLabNumber(labNumber: string): Promise<void> {
    const searchInput = this.page.getByLabel(/lab number|lab id/i).first();
    await searchInput.fill(labNumber);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Apply search filters.
   */
  async applySearch(): Promise<void> {
    const searchBtn = this.page.getByRole('button', { name: /search|filter|apply/i });
    await searchBtn.click();
    await this.waitForPageLoad();
  }

  /**
   * Get the count of referred out tests.
   *
   * @returns The number of referral rows
   */
  async getReferralCount(): Promise<number> {
    const rows = this.page.getByRole('row');
    return await rows.count();
  }

  /**
   * Expand a referral row to view details or enter results.
   *
   * @param accessionNumber - The accession number of the referral
   */
  async expandReferralRow(accessionNumber: string): Promise<void> {
    const referralRow = this.page.getByRole('row').filter({ hasText: accessionNumber });
    const expandBtn = referralRow.getByRole('button', { name: /expand|details|view/i });

    if (await expandBtn.isVisible().catch(() => false)) {
      await expandBtn.click();
    } else {
      await referralRow.click();
    }

    await this.page.waitForTimeout(500);
  }

  /**
   * Check if referral results are available to enter.
   *
   * @param accessionNumber - The accession number
   * @returns True if results can be entered
   */
  async areResultsAvailable(accessionNumber: string): Promise<boolean> {
    const referralRow = this.page.getByRole('row').filter({ hasText: accessionNumber });
    const resultInput = referralRow.getByRole('textbox');
    return await resultInput.isVisible().catch(() => false);
  }

  /**
   * Enter referral result for a test.
   *
   * @param testName - The test name
   * @param resultValue - The result value
   */
  async enterReferralResult(testName: string, resultValue: string): Promise<void> {
    const testRow = this.page.getByRole('row').filter({ hasText: testName });
    const resultInput = testRow.getByRole('textbox').first();

    await resultInput.fill(resultValue);
    await this.page.waitForTimeout(300);
  }

  /**
   * Enter multiple referral results.
   *
   * @param results - Object with test names as keys and result values
   */
  async enterMultipleResults(results: Record<string, string>): Promise<void> {
    for (const [testName, resultValue] of Object.entries(results)) {
      await this.enterReferralResult(testName, resultValue);
    }
  }

  /**
   * Save the referral results.
   */
  async saveResults(): Promise<void> {
    const saveBtn = this.page.getByRole('button', { name: /save|submit|confirm/i });
    await saveBtn.click();
    await this.waitForPageLoad();
  }

  /**
   * Get confirmation message after saving referral results.
   *
   * @returns The confirmation message
   */
  async getSaveConfirmation(): Promise<string | null> {
    return await this.waitForToastMessage(5000).catch(() => null);
  }

  /**
   * Print the referral report.
   *
   * @param accessionNumber - The accession number of the referral
   */
  async printReferralReport(accessionNumber: string): Promise<void> {
    const referralRow = this.page.getByRole('row').filter({ hasText: accessionNumber });
    const printBtn = referralRow.getByRole('button', { name: /print|report/i });

    if (await printBtn.isVisible().catch(() => false)) {
      await printBtn.click();
      await this.page.waitForTimeout(500);
    }
  }

  /**
   * Check if a referral is marked as complete.
   *
   * @param accessionNumber - The accession number
   * @returns True if the referral is complete
   */
  async isReferralComplete(accessionNumber: string): Promise<boolean> {
    const referralRow = this.page.getByRole('row').filter({ hasText: accessionNumber });
    const statusText = await referralRow.textContent();
    return statusText?.includes('complete') || statusText?.includes('received') || false;
  }

  /**
   * Get all visible referrals in the current list.
   *
   * @returns Array of accession numbers
   */
  async getVisibleReferrals(): Promise<string[]> {
    const rows = this.page.getByRole('row');
    const referrals: string[] = [];
    const count = await rows.count();

    for (let i = 1; i < count; i++) {
      const rowText = await rows.nth(i).textContent();
      if (rowText) {
        const match = rowText.match(/[A-Z0-9\-]+/);
        if (match) {
          referrals.push(match[0]);
        }
      }
    }

    return referrals;
  }

  /**
   * Clear all search filters.
   */
  async clearFilters(): Promise<void> {
    const clearBtn = this.page.getByRole('button', { name: /clear|reset|x/i });
    if (await clearBtn.isVisible().catch(() => false)) {
      await clearBtn.click();
      await this.waitForPageLoad();
    }
  }

  /**
   * Navigate to next page of referrals.
   */
  async goToNextPage(): Promise<void> {
    const nextBtn = this.page.getByRole('button', { name: /next/i });
    if (await nextBtn.isVisible().catch(() => false)) {
      await nextBtn.click();
      await this.waitForPageLoad();
    }
  }

  /**
   * Navigate to previous page of referrals.
   */
  async goToPreviousPage(): Promise<void> {
    const prevBtn = this.page.getByRole('button', { name: /previous|prev/i });
    if (await prevBtn.isVisible().catch(() => false)) {
      await prevBtn.click();
      await this.waitForPageLoad();
    }
  }
}
