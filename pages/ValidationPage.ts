import { Page } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page Object Model for OpenELIS Result Validation.
 * Handles navigating to validation, searching for results to validate,
 * accepting/rejecting results, and saving validation decisions.
 */
export default class ValidationPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  /**
   * Navigate to the Result Validation page.
   */
  async navigateToValidation(): Promise<void> {
    await this.navigateViaSidebar('Validation', 'Result Validation');
  }

  /**
   * Search for results to validate by accession number.
   *
   * @param accessionNumber - The accession/order number
   */
  async searchByAccessionNumber(accessionNumber: string): Promise<void> {
    const searchInput = this.page.getByLabel(/accession|order number|lab number/i).first();
    await searchInput.fill(accessionNumber);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Search for results to validate by patient name.
   *
   * @param patientName - The patient name
   */
  async searchByPatientName(patientName: string): Promise<void> {
    const searchInput = this.page.getByLabel(/patient|name/i).first();
    await searchInput.fill(patientName);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Search for results to validate by test name.
   *
   * @param testName - The test name
   */
  async searchByTestName(testName: string): Promise<void> {
    const searchInput = this.page.getByLabel(/test|exam/i).first();
    await searchInput.fill(testName);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Search for results to validate by unit.
   *
   * @param unit - The unit name
   */
  async searchByUnit(unit: string): Promise<void> {
    const searchInput = this.page.getByLabel(/unit/i).first();
    await searchInput.fill(unit);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Apply search filters to find results.
   */
  async applySearch(): Promise<void> {
    const searchBtn = this.page.getByRole('button', { name: /search|filter|apply/i });
    await searchBtn.click();
    await this.waitForPageLoad();
  }

  /**
   * Get the count of results ready for validation.
   *
   * @returns The number of result rows
   */
  async getValidationCount(): Promise<number> {
    const resultRows = this.page.getByRole('row').filter({ hasText: /status|result/i });
    return await resultRows.count();
  }

  /**
   * Click on a result to expand it for validation.
   *
   * @param accessionNumber - The accession number of the result
   */
  async expandResultForValidation(accessionNumber: string): Promise<void> {
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
   * Accept a result in the validation view.
   */
  async acceptResult(): Promise<void> {
    const acceptBtn = this.page.getByRole('button', { name: /accept|approve|validate/i });
    await acceptBtn.click();
    await this.page.waitForTimeout(300);
  }

  /**
   * Accept a specific result by accession number.
   *
   * @param accessionNumber - The accession number
   */
  async acceptResultByAccession(accessionNumber: string): Promise<void> {
    await this.expandResultForValidation(accessionNumber);
    await this.acceptResult();
  }

  /**
   * Reject a result in the validation view.
   * May require providing a rejection reason.
   *
   * @param rejectionReason - Optional reason for rejection
   */
  async rejectResult(rejectionReason?: string): Promise<void> {
    const rejectBtn = this.page.getByRole('button', { name: /reject|decline/i });
    await rejectBtn.click();
    await this.page.waitForTimeout(300);

    // If a reason input appears, fill it
    if (rejectionReason) {
      const reasonInput = this.page.getByLabel(/reason|comment/i);
      if (await reasonInput.isVisible().catch(() => false)) {
        await reasonInput.fill(rejectionReason);
      }
    }
  }

  /**
   * Reject a specific result by accession number.
   *
   * @param accessionNumber - The accession number
   * @param rejectionReason - Optional reason for rejection
   */
  async rejectResultByAccession(accessionNumber: string, rejectionReason?: string): Promise<void> {
    await this.expandResultForValidation(accessionNumber);
    await this.rejectResult(rejectionReason);
  }

  /**
   * Add a comment or note to a result during validation.
   *
   * @param comment - The comment text
   */
  async addValidationComment(comment: string): Promise<void> {
    const commentInput = this.page.getByLabel(/comment|note|remark/i);
    if (await commentInput.isVisible().catch(() => false)) {
      await commentInput.fill(comment);
    }
  }

  /**
   * Save the validation decision.
   */
  async saveValidation(): Promise<void> {
    const saveBtn = this.page.getByRole('button', { name: /save|submit|confirm/i });
    await saveBtn.click();
    await this.waitForPageLoad();
  }

  /**
   * Get confirmation message after validation.
   *
   * @returns The confirmation message
   */
  async getValidationConfirmation(): Promise<string | null> {
    return await this.waitForToastMessage(5000).catch(() => null);
  }

  /**
   * Check if a result is ready for validation (has status).
   *
   * @param accessionNumber - The accession number
   * @returns True if the result is visible
   */
  async isResultReadyForValidation(accessionNumber: string): Promise<boolean> {
    return await this.pageContainsText(accessionNumber);
  }

  /**
   * Get all results pending validation.
   *
   * @returns Array of accession numbers
   */
  async getPendingValidationResults(): Promise<string[]> {
    const resultRows = this.page.getByRole('row');
    const results: string[] = [];
    const count = await resultRows.count();

    for (let i = 1; i < count; i++) {
      const rowText = await resultRows.nth(i).textContent();
      if (rowText && rowText.includes('pending')) {
        const match = rowText.match(/[A-Z0-9\-]+/);
        if (match) {
          results.push(match[0]);
        }
      }
    }

    return results;
  }

  /**
   * Bulk accept multiple results.
   *
   * @param accessionNumbers - Array of accession numbers to accept
   */
  async bulkAcceptResults(accessionNumbers: string[]): Promise<void> {
    for (const accession of accessionNumbers) {
      await this.acceptResultByAccession(accession);
    }
    await this.saveValidation();
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
}
