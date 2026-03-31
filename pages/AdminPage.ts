import { Page } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page Object Model for OpenELIS Administration Pages.
 * Handles navigation to admin pages, searching, pagination, and form interactions.
 */
export default class AdminPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  /**
   * Navigate to an admin page by its path.
   *
   * @param adminPath - The admin page path (e.g., "/MasterListsPage/Dictionary", "/MasterListsPage/Organization")
   */
  async navigateToAdminPage(adminPath: string): Promise<void> {
    await this.navigateToPath(adminPath);
  }

  /**
   * Navigate to Dictionary Administration page.
   */
  async navigateToDictionary(): Promise<void> {
    await this.navigateToPath('/MasterListsPage/Dictionary');
  }

  /**
   * Navigate to Organization Administration page.
   */
  async navigateToOrganization(): Promise<void> {
    await this.navigateToPath('/MasterListsPage/Organization');
  }

  /**
   * Navigate to Provider Administration page.
   */
  async navigateToProvider(): Promise<void> {
    await this.navigateToPath('/MasterListsPage/Provider');
  }

  /**
   * Navigate to Laboratory Setup page.
   */
  async navigateToLaboratorySetup(): Promise<void> {
    await this.navigateToPath('/MasterListsPage/Laboratory');
  }

  /**
   * Navigate to Test Catalog Administration page.
   */
  async navigateToTestCatalog(): Promise<void> {
    await this.navigateToPath('/MasterListsPage/TestCatalog');
  }

  /**
   * Search for an item in the current admin page.
   *
   * @param searchTerm - The search term
   */
  async search(searchTerm: string): Promise<void> {
    const searchInput = this.page.getByLabel(/search/i).first();
    if (await searchInput.isVisible().catch(() => false)) {
      await searchInput.fill(searchTerm);
      await this.page.waitForLoadState('networkidle');
    }
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
   * Get the count of items in the current admin list.
   *
   * @returns The number of rows
   */
  async getItemCount(): Promise<number> {
    const rows = this.page.getByRole('row');
    return await rows.count();
  }

  /**
   * Click on an item in the admin list to view or edit it.
   *
   * @param itemName - The name or identifier of the item
   */
  async clickItem(itemName: string): Promise<void> {
    const itemRow = this.page.getByRole('row').filter({ hasText: itemName });
    await itemRow.click();
    await this.waitForPageLoad();
  }

  /**
   * Fill in a form field in the admin interface.
   *
   * @param fieldLabel - The label of the field
   * @param value - The value to enter
   */
  async fillField(fieldLabel: string, value: string): Promise<void> {
    const field = this.page.getByLabel(new RegExp(fieldLabel, 'i'));
    await field.fill(value);
    await this.page.waitForTimeout(300);
  }

  /**
   * Select an option from a dropdown field.
   *
   * @param fieldLabel - The label of the dropdown
   * @param optionText - The text of the option to select
   */
  async selectDropdownOption(fieldLabel: string, optionText: string): Promise<void> {
    const dropdown = this.page.getByLabel(new RegExp(fieldLabel, 'i'));
    await dropdown.click();
    await this.page.waitForLoadState('networkidle');

    const option = this.page.getByRole('option', { name: new RegExp(optionText, 'i') });
    await option.click();
    await this.page.waitForTimeout(300);
  }

  /**
   * Check or uncheck a checkbox field.
   *
   * @param fieldLabel - The label of the checkbox
   * @param checked - True to check, false to uncheck
   */
  async setCheckbox(fieldLabel: string, checked: boolean): Promise<void> {
    const checkbox = this.page.getByLabel(new RegExp(fieldLabel, 'i'));
    const isChecked = await checkbox.isChecked();

    if (checked && !isChecked) {
      await checkbox.check();
    } else if (!checked && isChecked) {
      await checkbox.uncheck();
    }

    await this.page.waitForTimeout(300);
  }

  /**
   * Save the current form.
   */
  async saveForm(): Promise<void> {
    const saveBtn = this.page.getByRole('button', { name: /save|submit|update/i });
    await saveBtn.click();
    await this.waitForPageLoad();
  }

  /**
   * Cancel the current form without saving.
   */
  async cancelForm(): Promise<void> {
    const cancelBtn = this.page.getByRole('button', { name: /cancel|close/i });
    await cancelBtn.click();
    await this.waitForPageLoad();
  }

  /**
   * Delete an item from the admin list.
   * Usually requires confirmation.
   *
   * @param itemName - The name of the item to delete
   */
  async deleteItem(itemName: string): Promise<void> {
    const itemRow = this.page.getByRole('row').filter({ hasText: itemName });
    const deleteBtn = itemRow.getByRole('button', { name: /delete|remove/i });

    if (await deleteBtn.isVisible().catch(() => false)) {
      await deleteBtn.click();
      await this.page.waitForTimeout(300);

      // Confirm deletion if a dialog appears
      const confirmBtn = this.page.getByRole('button', { name: /confirm|yes|delete/i });
      if (await confirmBtn.isVisible().catch(() => false)) {
        await confirmBtn.click();
      }

      await this.waitForPageLoad();
    }
  }

  /**
   * Navigate to the next page in a paginated list.
   */
  async goToNextPage(): Promise<void> {
    const nextBtn = this.page.getByRole('button', { name: /next/i });
    if (await nextBtn.isVisible().catch(() => false)) {
      await nextBtn.click();
      await this.waitForPageLoad();
    }
  }

  /**
   * Navigate to the previous page in a paginated list.
   */
  async goToPreviousPage(): Promise<void> {
    const prevBtn = this.page.getByRole('button', { name: /previous|prev/i });
    if (await prevBtn.isVisible().catch(() => false)) {
      await prevBtn.click();
      await this.waitForPageLoad();
    }
  }

  /**
   * Get current page number from pagination control.
   *
   * @returns The current page number
   */
  async getCurrentPageNumber(): Promise<number> {
    const pageInfo = this.page.getByText(/page|of/i).first();
    const text = await pageInfo.textContent();
    const match = text?.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 1;
  }

  /**
   * Get all visible items in the current list.
   *
   * @returns Array of item names
   */
  async getVisibleItems(): Promise<string[]> {
    const rows = this.page.getByRole('row');
    const items: string[] = [];
    const count = await rows.count();

    for (let i = 1; i < count; i++) {
      const rowText = await rows.nth(i).textContent();
      if (rowText) {
        items.push(rowText.trim());
      }
    }

    return items;
  }

  /**
   * Add a new item via the admin interface.
   * Assumes there's an "Add" or "New" button.
   */
  async addNewItem(): Promise<void> {
    const addBtn = this.page.getByRole('button', { name: /add|new|create/i });
    await addBtn.click();
    await this.waitForPageLoad();
  }

  /**
   * Get a confirmation or error message from the admin page.
   *
   * @returns The message text
   */
  async getAdminMessage(): Promise<string | null> {
    return await this.getToastMessage();
  }
}
