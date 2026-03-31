import { Page } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page Object Model for OpenELIS Pathology Management.
 * Handles navigation to pathology sections, case listing, and searching cases.
 */
export default class PathologyPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  /**
   * Navigate to Pathology Dashboard.
   */
  async navigateToPathologyDashboard(): Promise<void> {
    await this.navigateViaSidebar('Pathology', 'Dashboard');
  }

  /**
   * Navigate to Immunohistochemistry section.
   */
  async navigateToImmunohistochemistry(): Promise<void> {
    await this.navigateViaSidebar('Pathology', 'Immunohistochemistry');
  }

  /**
   * Navigate to Cytology section.
   */
  async navigateToCytology(): Promise<void> {
    await this.navigateViaSidebar('Pathology', 'Cytology');
  }

  /**
   * Navigate to General Histopathology section.
   */
  async navigateToHistopathology(): Promise<void> {
    await this.navigateViaSidebar('Pathology', 'Histopathology');
  }

  /**
   * Get the count of cases in the current pathology view.
   *
   * @returns The number of case rows
   */
  async getCaseCount(): Promise<number> {
    const rows = this.page.getByRole('row');
    return await rows.count();
  }

  /**
   * Search for cases by case number.
   *
   * @param caseNumber - The case number
   */
  async searchByCaseNumber(caseNumber: string): Promise<void> {
    const searchInput = this.page.getByLabel(/case number|case id/i).first();
    if (await searchInput.isVisible().catch(() => false)) {
      await searchInput.fill(caseNumber);
      await this.page.waitForLoadState('networkidle');
    }
  }

  /**
   * Search for cases by patient name.
   *
   * @param patientName - The patient name
   */
  async searchByPatientName(patientName: string): Promise<void> {
    const searchInput = this.page.getByLabel(/patient|name/i).first();
    if (await searchInput.isVisible().catch(() => false)) {
      await searchInput.fill(patientName);
      await this.page.waitForLoadState('networkidle');
    }
  }

  /**
   * Search for cases by specimen type.
   *
   * @param specimenType - The specimen type (e.g., "Tissue", "Slide", "Cell block")
   */
  async searchBySpecimenType(specimenType: string): Promise<void> {
    const searchInput = this.page.getByLabel(/specimen|type/i).first();
    if (await searchInput.isVisible().catch(() => false)) {
      await searchInput.fill(specimenType);
      await this.page.waitForLoadState('networkidle');
    }
  }

  /**
   * Search for cases by pathologist name.
   *
   * @param pathologistName - The pathologist name
   */
  async searchByPathologist(pathologistName: string): Promise<void> {
    const searchInput = this.page.getByLabel(/pathologist|assigned to/i).first();
    if (await searchInput.isVisible().catch(() => false)) {
      await searchInput.fill(pathologistName);
      await this.page.waitForLoadState('networkidle');
    }
  }

  /**
   * Search for cases within a date range.
   *
   * @param startDate - Start date (format: YYYY-MM-DD)
   * @param endDate - End date (format: YYYY-MM-DD)
   */
  async searchByDateRange(startDate: string, endDate: string): Promise<void> {
    const startInput = this.page.getByLabel(/from|start date/i).first();
    const endInput = this.page.getByLabel(/to|end date/i).first();

    if (await startInput.isVisible().catch(() => false)) {
      await startInput.fill(startDate);
    }

    if (await endInput.isVisible().catch(() => false)) {
      await endInput.fill(endDate);
    }

    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Apply search filters.
   */
  async applySearch(): Promise<void> {
    const searchBtn = this.page.getByRole('button', { name: /search|filter|apply/i });
    if (await searchBtn.isVisible().catch(() => false)) {
      await searchBtn.click();
      await this.waitForPageLoad();
    }
  }

  /**
   * Click on a case to view its details.
   *
   * @param caseNumber - The case number to click
   */
  async clickCase(caseNumber: string): Promise<void> {
    const caseRow = this.page.getByRole('row').filter({ hasText: caseNumber });
    await caseRow.click();
    await this.waitForPageLoad();
  }

  /**
   * View detailed information for a case.
   *
   * @param caseNumber - The case number
   */
  async viewCaseDetails(caseNumber: string): Promise<void> {
    const caseRow = this.page.getByRole('row').filter({ hasText: caseNumber });
    const viewBtn = caseRow.getByRole('button', { name: /view|details|open/i });

    if (await viewBtn.isVisible().catch(() => false)) {
      await viewBtn.click();
      await this.waitForPageLoad();
    } else {
      await this.clickCase(caseNumber);
    }
  }

  /**
   * Get the status of a pathology case.
   *
   * @param caseNumber - The case number
   * @returns The case status (e.g., "Pending", "In Progress", "Completed")
   */
  async getCaseStatus(caseNumber: string): Promise<string | null> {
    const caseRow = this.page.getByRole('row').filter({ hasText: caseNumber });
    const statusText = await caseRow
      .getByText(/pending|progress|completed|signed/i)
      .first()
      .textContent()
      .catch(() => null);

    return statusText;
  }

  /**
   * Get the pathologist assigned to a case.
   *
   * @param caseNumber - The case number
   * @returns The pathologist name
   */
  async getAssignedPathologist(caseNumber: string): Promise<string | null> {
    const caseRow = this.page.getByRole('row').filter({ hasText: caseNumber });
    const pathologistText = await caseRow.textContent().catch(() => null);

    // This is a simplified extraction - adjust based on actual table layout
    if (pathologistText) {
      const parts = pathologistText.split('\t');
      return parts.length > 2 ? parts[2].trim() : null;
    }

    return null;
  }

  /**
   * Get all visible case numbers in the current list.
   *
   * @returns Array of case numbers
   */
  async getVisibleCases(): Promise<string[]> {
    const rows = this.page.getByRole('row');
    const cases: string[] = [];
    const count = await rows.count();

    for (let i = 1; i < count; i++) {
      const rowText = await rows.nth(i).textContent();
      if (rowText) {
        const match = rowText.match(/[A-Z0-9\-]+/);
        if (match) {
          cases.push(match[0]);
        }
      }
    }

    return cases;
  }

  /**
   * Filter cases by status.
   *
   * @param status - The status to filter by (e.g., "Pending", "In Progress")
   */
  async filterByStatus(status: string): Promise<void> {
    const statusSelect = this.page.getByLabel(/status/i);
    if (await statusSelect.isVisible().catch(() => false)) {
      await statusSelect.click();
      await this.page.waitForLoadState('networkidle');

      const statusOption = this.page.getByRole('option', { name: new RegExp(status, 'i') });
      await statusOption.click();
      await this.page.waitForTimeout(300);
    }
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
   * Navigate to next page of cases.
   */
  async goToNextPage(): Promise<void> {
    const nextBtn = this.page.getByRole('button', { name: /next/i });
    if (await nextBtn.isVisible().catch(() => false)) {
      await nextBtn.click();
      await this.waitForPageLoad();
    }
  }

  /**
   * Navigate to previous page of cases.
   */
  async goToPreviousPage(): Promise<void> {
    const prevBtn = this.page.getByRole('button', { name: /previous|prev/i });
    if (await prevBtn.isVisible().catch(() => false)) {
      await prevBtn.click();
      await this.waitForPageLoad();
    }
  }

  /**
   * Check if a case is available for editing.
   *
   * @param caseNumber - The case number
   * @returns True if the case can be edited
   */
  async isCaseEditable(caseNumber: string): Promise<boolean> {
    const caseRow = this.page.getByRole('row').filter({ hasText: caseNumber });
    const editBtn = caseRow.getByRole('button', { name: /edit/i });
    return await editBtn.isVisible().catch(() => false);
  }
}
