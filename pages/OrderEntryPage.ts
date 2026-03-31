import { Page } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page Object Model for OpenELIS Order Entry.
 * Handles the multi-step order creation process including patient selection,
 * program selection, sample addition, and order submission.
 */
export default class OrderEntryPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  /**
   * Navigate to the Order Entry page.
   */
  async navigateToOrderEntry(): Promise<void> {
    await this.navigateToPath('/SamplePatientEntry');
  }

  /**
   * STEP 1: Search for a patient by name.
   *
   * @param patientName - Full or partial patient name
   */
  async searchPatientByName(patientName: string): Promise<void> {
    const searchInput = this.page.getByLabel(/patient name|search/i).first();
    await searchInput.click();
    await searchInput.fill(patientName);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * STEP 1: Search for a patient by ID.
   *
   * @param patientId - Patient identifier
   */
  async searchPatientById(patientId: string): Promise<void> {
    const searchInput = this.page.getByLabel(/patient id|id/i).first();
    await searchInput.click();
    await searchInput.fill(patientId);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * STEP 1: Search for a patient by lab number.
   *
   * @param labNumber - Lab/accession number
   */
  async searchPatientByLabNumber(labNumber: string): Promise<void> {
    const searchInput = this.page.getByLabel(/lab number|accession/i).first();
    await searchInput.click();
    await searchInput.fill(labNumber);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * STEP 1: Select a patient from the search results.
   *
   * @param patientName - The patient name to select from results
   */
  async selectPatientFromResults(patientName: string): Promise<void> {
    const patientRow = this.page.getByRole('row').filter({ hasText: patientName });
    await patientRow.click();
    await this.waitForPageLoad();
  }

  /**
   * STEP 2: Select a program from the program dropdown.
   *
   * @param programName - The program name (e.g., "Microbiology", "Chemistry")
   */
  async selectProgram(programName: string): Promise<void> {
    const programSelect = this.page.getByLabel(/program/i);
    await programSelect.click();
    await this.page.waitForLoadState('networkidle');

    const programOption = this.page.getByRole('option', { name: new RegExp(programName, 'i') });
    await programOption.click();
    await this.page.waitForTimeout(300);
  }

  /**
   * STEP 3: Select a sample type for the order.
   *
   * @param sampleType - Sample type (e.g., "Blood", "Serum", "Plasma", "Urine")
   */
  async selectSampleType(sampleType: string): Promise<void> {
    const sampleTypeSelect = this.page.getByLabel(/sample type|specimen type/i);
    await sampleTypeSelect.click();
    await this.page.waitForLoadState('networkidle');

    const sampleOption = this.page.getByRole('option', { name: new RegExp(sampleType, 'i') });
    await sampleOption.click();
    await this.page.waitForTimeout(300);
  }

  /**
   * STEP 3: Add a test to the sample.
   *
   * @param testName - Test name (e.g., "Hemoglobin", "Glucose")
   */
  async addTest(testName: string): Promise<void> {
    const addTestBtn = this.page.getByRole('button', { name: /add test|add/i });
    await addTestBtn.click();
    await this.page.waitForLoadState('networkidle');

    const testOption = this.page.getByRole('option', { name: new RegExp(testName, 'i') });
    await testOption.click();
    await this.page.waitForTimeout(300);
  }

  /**
   * STEP 3: Add multiple tests to the sample.
   *
   * @param testNames - Array of test names
   */
  async addMultipleTests(testNames: string[]): Promise<void> {
    for (const testName of testNames) {
      await this.addTest(testName);
    }
  }

  /**
   * STEP 3: Enable referral checkbox if the sample requires referral.
   */
  async enableReferral(): Promise<void> {
    const referralCheckbox = this.page.getByLabel(/referral|refer out/i);
    const isChecked = await referralCheckbox.isChecked();

    if (!isChecked) {
      await referralCheckbox.check();
      await this.page.waitForTimeout(300);
    }
  }

  /**
   * STEP 3: Disable referral checkbox.
   */
  async disableReferral(): Promise<void> {
    const referralCheckbox = this.page.getByLabel(/referral|refer out/i);
    const isChecked = await referralCheckbox.isChecked();

    if (isChecked) {
      await referralCheckbox.uncheck();
      await this.page.waitForTimeout(300);
    }
  }

  /**
   * STEP 3: Fill in referral details.
   *
   * @param referralLab - Lab to refer to
   * @param referralReason - Reason for referral
   */
  async fillReferralDetails(referralLab: string, referralReason: string): Promise<void> {
    const referralLabInput = this.page.getByLabel(/referral lab|refer to/i);
    const reasonInput = this.page.getByLabel(/reason|referral reason/i);

    await referralLabInput.fill(referralLab);
    await reasonInput.fill(referralReason);
    await this.page.waitForTimeout(300);
  }

  /**
   * STEP 4: Submit the order.
   * Clicks the submit button and waits for the order to be processed.
   *
   * @returns The generated accession number from the confirmation page
   */
  async submitOrder(): Promise<string> {
    const submitBtn = this.page.getByRole('button', { name: /submit|save|complete order/i });
    await submitBtn.click();
    await this.waitForPageLoad();

    // Extract accession number from confirmation message
    const accessionMsg = await this.page
      .getByText(/accession|order number|sample number/i)
      .first()
      .textContent();

    const accessionMatch = accessionMsg?.match(/[\d\-]+$/);
    return accessionMatch ? accessionMatch[0] : '';
  }

  /**
   * Get the generated accession number after order submission.
   *
   * @returns The accession number
   */
  async getGeneratedAccessionNumber(): Promise<string> {
    const accessionElement = this.page.getByText(/accession number|lab number/i).first();
    const text = await accessionElement.textContent();
    const match = text?.match(/[\d\-A-Z]+$/);
    return match ? match[0] : '';
  }

  /**
   * Cancel the current order and return to the main menu.
   */
  async cancelOrder(): Promise<void> {
    const cancelBtn = this.page.getByRole('button', { name: /cancel|close/i });
    await cancelBtn.click();
    await this.waitForPageLoad();
  }

  /**
   * Verify that a specific test has been added to the sample.
   *
   * @param testName - Test name to verify
   * @returns True if the test is present
   */
  async isTestAdded(testName: string): Promise<boolean> {
    return await this.pageContainsText(testName);
  }

  /**
   * Get all currently added tests.
   *
   * @returns Array of test names
   */
  async getAddedTests(): Promise<string[]> {
    const testRows = this.page.getByRole('row').filter({ hasText: /test|exam/i });
    const tests: string[] = [];
    const count = await testRows.count();

    for (let i = 0; i < count; i++) {
      const testText = await testRows.nth(i).textContent();
      if (testText) {
        tests.push(testText.trim());
      }
    }

    return tests;
  }
}
