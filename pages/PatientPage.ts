import { Page } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page Object Model for OpenELIS Patient Management.
 * Handles patient search, history viewing, adding/editing patients, and merging patients.
 */
export default class PatientPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  /**
   * Navigate to Patient History page.
   */
  async navigateToPatientHistory(): Promise<void> {
    await this.navigateViaSidebar('Patient', 'Patient History');
  }

  /**
   * Navigate to Add Patient page.
   */
  async navigateToAddPatient(): Promise<void> {
    await this.navigateViaSidebar('Patient', 'Add Patient');
  }

  /**
   * Navigate to Edit Patient page.
   */
  async navigateToEditPatient(): Promise<void> {
    await this.navigateViaSidebar('Patient', 'Edit Patient');
  }

  /**
   * Navigate to Merge Patient page.
   */
  async navigateToMergePatient(): Promise<void> {
    await this.navigateViaSidebar('Patient', 'Merge Patient');
  }

  /**
   * Search for a patient by name.
   *
   * @param patientName - Full or partial patient name
   */
  async searchByName(patientName: string): Promise<void> {
    const searchInput = this.page.getByLabel(/patient name|name/i).first();
    await searchInput.fill(patientName);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Search for a patient by ID.
   *
   * @param patientId - Patient identifier
   */
  async searchById(patientId: string): Promise<void> {
    const searchInput = this.page.getByLabel(/patient id|id|identifier/i).first();
    await searchInput.fill(patientId);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Search for a patient by date of birth.
   *
   * @param dateOfBirth - Date of birth (format: YYYY-MM-DD)
   */
  async searchByDateOfBirth(dateOfBirth: string): Promise<void> {
    const searchInput = this.page.getByLabel(/date of birth|dob|birth/i).first();
    await searchInput.fill(dateOfBirth);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Apply patient search.
   */
  async applySearch(): Promise<void> {
    const searchBtn = this.page.getByRole('button', { name: /search|filter|apply/i });
    await searchBtn.click();
    await this.waitForPageLoad();
  }

  /**
   * Select a patient from search results.
   *
   * @param patientName - The patient name to select
   */
  async selectPatientFromResults(patientName: string): Promise<void> {
    const patientRow = this.page.getByRole('row').filter({ hasText: patientName });
    await patientRow.click();
    await this.waitForPageLoad();
  }

  /**
   * Get the count of patients in search results.
   *
   * @returns The number of patient rows
   */
  async getPatientCount(): Promise<number> {
    const rows = this.page.getByRole('row');
    return await rows.count();
  }

  /**
   * Fill in patient information when adding or editing a patient.
   *
   * @param patientData - Object with patient field names and values
   */
  async fillPatientInfo(patientData: Record<string, string>): Promise<void> {
    for (const [fieldLabel, value] of Object.entries(patientData)) {
      const field = this.page.getByLabel(new RegExp(fieldLabel, 'i'));
      if (await field.isVisible().catch(() => false)) {
        await field.fill(value);
      }
    }
    await this.page.waitForTimeout(300);
  }

  /**
   * Get patient history details.
   * Returns the text content of the patient history section.
   *
   * @returns Patient history information
   */
  async getPatientHistory(): Promise<string | null> {
    const historySection = this.page.getByRole('region').filter({ hasText: /history|details/i });
    return await historySection.textContent().catch(() => null);
  }

  /**
   * View patient orders in the patient history.
   */
  async viewPatientOrders(): Promise<void> {
    const ordersTab = this.page.getByRole('tab', { name: /orders|samples/i });
    if (await ordersTab.isVisible().catch(() => false)) {
      await ordersTab.click();
      await this.page.waitForTimeout(300);
    }
  }

  /**
   * View patient test results in the patient history.
   */
  async viewPatientResults(): Promise<void> {
    const resultsTab = this.page.getByRole('tab', { name: /results|tests/i });
    if (await resultsTab.isVisible().catch(() => false)) {
      await resultsTab.click();
      await this.page.waitForTimeout(300);
    }
  }

  /**
   * Save patient information after adding or editing.
   */
  async savePatient(): Promise<void> {
    const saveBtn = this.page.getByRole('button', { name: /save|submit|update/i });
    await saveBtn.click();
    await this.waitForPageLoad();
  }

  /**
   * Cancel patient edit without saving.
   */
  async cancelEdit(): Promise<void> {
    const cancelBtn = this.page.getByRole('button', { name: /cancel|close/i });
    await cancelBtn.click();
    await this.waitForPageLoad();
  }

  /**
   * Initiate patient merge by selecting primary patient.
   *
   * @param primaryPatientName - The primary patient to keep
   */
  async selectPrimaryPatient(primaryPatientName: string): Promise<void> {
    const patientRow = this.page.getByRole('row').filter({ hasText: primaryPatientName });
    const selectBtn = patientRow.getByRole('button', { name: /select|primary|keep/i });

    if (await selectBtn.isVisible().catch(() => false)) {
      await selectBtn.click();
    } else {
      await patientRow.click();
    }

    await this.page.waitForTimeout(300);
  }

  /**
   * Select duplicate patient to merge.
   *
   * @param duplicatePatientName - The patient to merge away
   */
  async selectDuplicatePatient(duplicatePatientName: string): Promise<void> {
    const patientRow = this.page.getByRole('row').filter({ hasText: duplicatePatientName });
    const selectBtn = patientRow.getByRole('button', { name: /select|duplicate|merge/i });

    if (await selectBtn.isVisible().catch(() => false)) {
      await selectBtn.click();
    } else {
      await patientRow.click();
    }

    await this.page.waitForTimeout(300);
  }

  /**
   * Confirm patient merge operation.
   */
  async confirmMerge(): Promise<void> {
    const mergeBtn = this.page.getByRole('button', { name: /merge|confirm|proceed/i });
    await mergeBtn.click();
    await this.waitForPageLoad();
  }

  /**
   * Get confirmation message after patient operation.
   *
   * @returns The confirmation message
   */
  async getConfirmationMessage(): Promise<string | null> {
    return await this.waitForToastMessage(5000).catch(() => null);
  }

  /**
   * Get all visible patient names in the current list.
   *
   * @returns Array of patient names
   */
  async getVisiblePatients(): Promise<string[]> {
    const rows = this.page.getByRole('row');
    const patients: string[] = [];
    const count = await rows.count();

    for (let i = 1; i < count; i++) {
      const rowText = await rows.nth(i).textContent();
      if (rowText) {
        patients.push(rowText.trim());
      }
    }

    return patients;
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
