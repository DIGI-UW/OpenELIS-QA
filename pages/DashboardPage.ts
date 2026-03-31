import { Page } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page Object Model for the OpenELIS Dashboard.
 * Handles dashboard navigation, KPI card interactions, and dashboard structure verification.
 */
export default class DashboardPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  /**
   * Navigate to the Dashboard page.
   */
  async navigateToDashboard(): Promise<void> {
    await this.navigateToPath('/Dashboard');
  }

  /**
   * Get the value of a KPI card by its label.
   * KPI cards display numbers like "In Progress", "Ready For Validation", etc.
   *
   * @param cardLabel - The KPI card label (e.g., "In Progress", "Ready For Validation")
   * @returns The numeric value displayed on the card
   */
  async getKPICardValue(cardLabel: string): Promise<number> {
    const cardLocator = this.page
      .getByRole('region')
      .filter({ hasText: new RegExp(cardLabel, 'i') });

    // Find the number within the card region
    const numberText = await cardLocator
      .locator('text=/\\d+/')
      .first()
      .textContent();

    return parseInt(numberText || '0', 10);
  }

  /**
   * Get all KPI card values as an object.
   * Returns a mapping of card labels to their numeric values.
   *
   * @returns Object with card labels as keys and numeric values
   */
  async getAllKPICardValues(): Promise<Record<string, number>> {
    const kpiCards = this.page.getByRole('region');
    const count = await kpiCards.count();
    const result: Record<string, number> = {};

    for (let i = 0; i < count; i++) {
      const card = kpiCards.nth(i);
      const label = await card
        .getByRole('heading')
        .or(card.getByText(/^[A-Z]/, { exact: false }))
        .first()
        .textContent();

      const value = await card
        .locator('text=/\\d+/')
        .first()
        .textContent();

      if (label && value) {
        result[label.trim()] = parseInt(value, 10);
      }
    }

    return result;
  }

  /**
   * Click on a KPI card to navigate to its associated view.
   *
   * @param cardLabel - The KPI card label to click
   */
  async clickKPICard(cardLabel: string): Promise<void> {
    const card = this.page
      .getByRole('region')
      .filter({ hasText: new RegExp(cardLabel, 'i') });

    await card.click();
    await this.waitForPageLoad();
  }

  /**
   * Verify the dashboard structure contains expected sections.
   *
   * @returns True if dashboard is properly structured
   */
  async verifyDashboardStructure(): Promise<boolean> {
    const expectedSections = ['In Progress', 'Ready For Validation', 'Completed'];
    let allPresent = true;

    for (const section of expectedSections) {
      const isVisible = await this.pageContainsText(section);
      if (!isVisible) {
        allPresent = false;
        break;
      }
    }

    return allPresent;
  }

  /**
   * Get the count of items in a specific status category.
   *
   * @param statusLabel - The status label (e.g., "In Progress", "Ready For Validation")
   * @returns The count of items in that status
   */
  async getStatusCount(statusLabel: string): Promise<number> {
    return await this.getKPICardValue(statusLabel);
  }

  /**
   * Check if a specific KPI card is visible on the dashboard.
   *
   * @param cardLabel - The KPI card label
   * @returns True if the card is visible
   */
  async isKPICardVisible(cardLabel: string): Promise<boolean> {
    const card = this.page
      .getByRole('region')
      .filter({ hasText: new RegExp(cardLabel, 'i') });

    return await card.isVisible().catch(() => false);
  }

  /**
   * Refresh the dashboard data.
   */
  async refreshDashboard(): Promise<void> {
    const refreshBtn = this.page.getByRole('button', { name: /refresh|reload/i });
    if (await refreshBtn.isVisible().catch(() => false)) {
      await refreshBtn.click();
      await this.waitForPageLoad();
    }
  }
}
