import { Page, expect } from '@playwright/test';

/**
 * Abstract base class for Page Object Model (POM) implementations.
 * Provides common navigation helpers, wait utilities, and modal handling
 * for OpenELIS test pages.
 */
export abstract class BasePage {
  constructor(protected readonly page: Page) {}

  /**
   * Navigate to a page section via the sidebar menu.
   * Handles main menu items and optional submenus.
   *
   * @param menuText - Main menu text (e.g., "Orders", "Results", "Validation")
   * @param submenuText - Optional submenu text (e.g., "By Order", "By Status")
   */
  async navigateViaSidebar(menuText: string, submenuText?: string): Promise<void> {
    // Click main menu item by role
    const mainMenu = this.page.getByRole('button', { name: new RegExp(menuText, 'i') });
    await mainMenu.click();
    await this.page.waitForLoadState('networkidle');

    // If submenu requested, click it
    if (submenuText) {
      const subMenu = this.page.getByRole('link', { name: new RegExp(submenuText, 'i') });
      await subMenu.click();
      await this.page.waitForLoadState('networkidle');
    }
  }

  /**
   * Wait for the page to fully load by checking for network idle state
   * and confirming no modals are present.
   */
  async waitForPageLoad(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
    await this.page.waitForTimeout(500); // Brief pause for animations
  }

  /**
   * Dismiss the "Still There?" session modal if it appears.
   * Looks for modal with keep-alive button.
   */
  async dismissSessionModal(): Promise<void> {
    const modal = this.page.getByRole('dialog');
    const isVisible = await modal.isVisible().catch(() => false);

    if (isVisible) {
      const keepAliveBtn = this.page.getByRole('button', { name: /still there|keep alive/i });
      const closeBtn = this.page.getByRole('button', { name: /close|dismiss/i });

      if (await keepAliveBtn.isVisible().catch(() => false)) {
        await keepAliveBtn.click();
      } else if (await closeBtn.isVisible().catch(() => false)) {
        await closeBtn.click();
      }

      await this.page.waitForLoadState('networkidle');
    }
  }

  /**
   * Extract toast/notification message from the page if present.
   *
   * @returns The toast message text, or null if no toast is visible
   */
  async getToastMessage(): Promise<string | null> {
    const toast = this.page.getByRole('alert');
    const isVisible = await toast.isVisible().catch(() => false);

    if (isVisible) {
      return await toast.textContent();
    }

    return null;
  }

  /**
   * Wait for a specific toast message to appear and return it.
   * Useful for validation of operations.
   *
   * @param timeoutMs - Timeout in milliseconds
   * @returns The toast message text
   */
  async waitForToastMessage(timeoutMs: number = 5000): Promise<string> {
    const toast = this.page.getByRole('alert');
    await toast.waitFor({ state: 'visible', timeout: timeoutMs });
    return await toast.textContent() as string;
  }

  /**
   * Navigate directly to a URL relative to the base domain.
   *
   * @param path - The path (e.g., "/SamplePatientEntry", "/Dashboard")
   */
  async navigateToPath(path: string): Promise<void> {
    const baseUrl = 'https://www.jdhealthsolutions-openelis.com';
    await this.page.goto(`${baseUrl}${path}`);
    await this.waitForPageLoad();
  }

  /**
   * Get the current page URL.
   *
   * @returns The current URL
   */
  getCurrentUrl(): string {
    return this.page.url();
  }

  /**
   * Check if the page contains a specific text element.
   *
   * @param text - The text to search for
   * @returns True if the text is found, false otherwise
   */
  async pageContainsText(text: string): Promise<boolean> {
    return await this.page.getByText(text).isVisible().catch(() => false);
  }
}
