import { Page } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page Object Model for OpenELIS Order Entry.
 * Handles the multi-step order creation process including patient selection,
 * program selection, sample addition, and order submission.
 *
 * URL: /SamplePatientEntry
 *
 * Wizard Steps:
 *   Step 1: Patient Info (Search or New Patient)
 *   Step 2: Program Selection
 *   Step 3: Add Sample (sample type + tests)
 *   Step 4: Add Order (review + submit)
 *
 * API Endpoints:
 *   GET  /rest/SamplePatientEntry — Form metadata (24 sample types, 12 programs, 15 test sections)
 *   POST /rest/SamplePatientEntry — Submit order (complex payload — needs full wizard form bean)
 *
 * React Form Interaction (Phase 30 discovery):
 *   - All text inputs are React controlled components
 *   - Must use native setter: Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
 *   - Dispatch Event('input', { bubbles: true }) + Event('change', { bubbles: true })
 *   - Radio buttons: standard .click() works
 *   - Carbon dropdowns: native setter on <select> elements
 *
 * Key Sample Types: Urines(1), Serum(2), Plasma(3), Whole Blood(4), DBS(5)
 * Key Serum Tests: GPT/ALAT(1), GOT/ASAT(2), Creatinine(4), Amylase(5)
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

  // --- API Methods (Phase 29/30) ---

  /**
   * Get form metadata via REST API.
   * Returns sample types, programs, test sections, conditions.
   */
  async getFormMetadataViaAPI(): Promise<{
    status: number;
    sampleTypes: number;
    programs: number;
    testSections: number;
    conditions: number;
    rejectReasons: number;
  }> {
    return await this.page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch('/api/OpenELIS-Global/rest/SamplePatientEntry', {
        headers: { 'X-CSRF-Token': csrf },
      });
      if (!res.ok) return { status: res.status, sampleTypes: 0, programs: 0, testSections: 0, conditions: 0, rejectReasons: 0 };
      const data = await res.json();
      return {
        status: res.status,
        sampleTypes: data.sampleTypes?.length || 0,
        programs: data.projects?.length || 0,
        testSections: data.testSectionList?.length || 0,
        conditions: data.initialSampleConditionList?.length || 0,
        rejectReasons: data.rejectReasonList?.length || 0,
      };
    });
  }

  /**
   * Get dashboard metrics (orders in progress, completed today).
   */
  async getDashboardMetrics(): Promise<{
    ordersInProgress: number;
    completedToday: number;
  }> {
    return await this.page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch('/api/OpenELIS-Global/rest/home-dashboard/metrics', {
        headers: { 'X-CSRF-Token': csrf },
      });
      const data = await res.json();
      return {
        ordersInProgress: data.ordersInProgress || 0,
        completedToday: data.completedToday || 0,
      };
    });
  }

  /**
   * Get logbook results for a test section.
   * NOTE: Endpoint is case-sensitive: /rest/LogbookResults (capital L, capital R)
   */
  async getLogbookResultsViaAPI(section: string): Promise<{
    status: number;
    resultCount: number;
  }> {
    return await this.page.evaluate(async (sec) => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch(`/api/OpenELIS-Global/rest/LogbookResults?type=${sec}`, {
        headers: { 'X-CSRF-Token': csrf },
      });
      if (!res.ok) return { status: res.status, resultCount: 0 };
      const data = await res.json();
      return { status: res.status, resultCount: data.testResult?.length || 0 };
    }, section);
  }

  /**
   * Fill new patient form using React native setter pattern.
   * This is the reliable way to set values in React controlled inputs.
   */
  async fillNewPatientViaReactSetter(data: {
    nationalId: string;
    lastName?: string;
    firstName?: string;
    age?: string;
    gender?: 'M' | 'F';
  }): Promise<void> {
    // Click New Patient tab first
    await this.page.getByRole('button', { name: /new patient/i }).click();
    await this.page.waitForTimeout(500);

    await this.page.evaluate((formData) => {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
      )!.set!;

      function fill(input: HTMLInputElement | undefined, val: string) {
        if (!input) return;
        input.focus();
        nativeSetter.call(input, val);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.blur();
      }

      const inputs = Array.from(document.querySelectorAll('input'));

      fill(inputs.find(i => i.placeholder?.includes('Nationality')) as HTMLInputElement, formData.nationalId);
      if (formData.lastName) fill(inputs.find(i => i.placeholder?.includes('Last Name')) as HTMLInputElement, formData.lastName);
      if (formData.firstName) fill(inputs.find(i => i.placeholder?.includes('First Name')) as HTMLInputElement, formData.firstName);
      if (formData.age) fill(inputs.find(i => i.placeholder?.includes('Enter Age')) as HTMLInputElement, formData.age);

      if (formData.gender) {
        const radios = inputs.filter(i => i.type === 'radio');
        const target = formData.gender === 'M' ? radios[0] : radios[1];
        if (target) target.click();
      }
    }, data);

    await this.page.waitForTimeout(300);
  }
}
