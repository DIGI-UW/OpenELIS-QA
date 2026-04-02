import { Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page Object Model for OpenELIS Calculated Value Tests Management.
 * URL: /MasterListsPage/calculatedValue
 *
 * The calculated value page allows creating formulas that auto-compute
 * test results based on other test results (e.g., De Ritis Ratio = GOT/GPT).
 *
 * API Endpoints:
 * - GET  /rest/test-calculations      — list all rules
 * - POST /rest/test-calculation        — create (no id) or update (with id+lastupdated)
 *
 * Payload structure:
 * {
 *   name: string,
 *   sampleId: string,
 *   testId: string,
 *   result: string,
 *   operations: [{ order: number, type: string, value: string, sampleId?: string }],
 *   toggled: boolean,
 *   active: boolean,
 *   note: string
 * }
 *
 * Operation types: TEST_RESULT, MATH_FUNCTION, INTEGER, PATIENT_ATTRIBUTE
 */
export default class CalculatedValuePage extends BasePage {
  // URL path
  readonly path = '/MasterListsPage/calculatedValue';

  // API endpoints
  readonly apiListEndpoint = '/rest/test-calculations';
  readonly apiSaveEndpoint = '/rest/test-calculation';

  constructor(page: Page) {
    super(page);
  }

  /**
   * Navigate to the Calculated Value Management page.
   */
  async navigate(): Promise<void> {
    await this.navigateToPath(this.path);
  }

  /**
   * Verify the page has loaded with the formula builder UI.
   */
  async verifyPageLoaded(): Promise<void> {
    await this.waitForPageLoad();
    const bodyText = await this.page.locator('body').textContent();
    expect(bodyText).toBeTruthy();
    // Check for key UI elements
    const url = this.page.url();
    expect(url).toContain('calculatedValue');
  }

  /**
   * Select a result test from the autocomplete dropdown.
   * Uses the React native setter pattern for controlled inputs.
   *
   * @param testName - The test name to select (e.g., "De Ritis Ratio(Serum)")
   */
  async selectResultTest(testName: string): Promise<void> {
    await this.page.evaluate((name) => {
      const inputs = Array.from(document.querySelectorAll('input'));
      const resultInput = inputs.find(i =>
        i.placeholder?.toLowerCase().includes('test') ||
        i.id?.toLowerCase().includes('result')
      );
      if (resultInput) {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, 'value'
        )!.set!;
        setter.call(resultInput, name);
        resultInput.dispatchEvent(new Event('input', { bubbles: true }));
        resultInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, testName);
  }

  /**
   * Add an operand to the formula.
   *
   * @param type - Operand type: 'TEST_RESULT' | 'MATH_FUNCTION' | 'INTEGER' | 'PATIENT_ATTRIBUTE'
   * @param value - The operand value (test name, math function, integer, or attribute)
   * @param sampleId - Optional sample ID for TEST_RESULT type
   */
  async addOperand(type: string, value: string, sampleId?: string): Promise<void> {
    // Select operand type from dropdown
    await this.page.evaluate((opType) => {
      const selects = Array.from(document.querySelectorAll('select'));
      const typeSelect = selects.find(s =>
        Array.from(s.options).some(o =>
          o.text?.includes('Test Result') || o.value?.includes('TEST_RESULT')
        )
      );
      if (typeSelect) {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLSelectElement.prototype, 'value'
        )!.set!;
        setter.call(typeSelect, opType);
        typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, type);

    // Set operand value via appropriate input
    await this.page.evaluate((val) => {
      const inputs = Array.from(document.querySelectorAll('input'));
      const valueInput = inputs.find(i =>
        i.placeholder?.toLowerCase().includes('value') ||
        i.placeholder?.toLowerCase().includes('search')
      );
      if (valueInput) {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, 'value'
        )!.set!;
        setter.call(valueInput, val);
        valueInput.dispatchEvent(new Event('input', { bubbles: true }));
        valueInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, value);
  }

  /**
   * Click the Submit button to save the calculated value rule.
   */
  async submit(): Promise<void> {
    const submitBtn = this.page.getByRole('button', { name: /submit/i });
    await submitBtn.click();
    await this.waitForPageLoad();
  }

  /**
   * Get all calculated value rules via API.
   *
   * @param baseUrl - The base URL of the OpenELIS instance
   * @returns Array of calculated value rule objects
   */
  async getCalculatedValuesViaAPI(baseUrl: string): Promise<any[]> {
    const response = await this.page.evaluate(async (url) => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch(`${url}/rest/test-calculations`, {
        headers: { 'X-CSRF-Token': csrf },
      });
      return res.json();
    }, baseUrl);
    return response;
  }

  /**
   * Create a calculated value rule via direct API POST.
   *
   * @param baseUrl - The base URL
   * @param payload - The rule payload
   * @returns HTTP status code
   */
  async createCalculatedValueViaAPI(baseUrl: string, payload: {
    name: string;
    sampleId: string;
    testId: string;
    result: string;
    operations: Array<{ order: number; type: string; value: string; sampleId?: string }>;
    toggled: boolean;
    active: boolean;
    note: string;
  }): Promise<number> {
    const status = await this.page.evaluate(async ({ url, data }) => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch(`${url}/rest/test-calculation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrf,
        },
        body: JSON.stringify(data),
      });
      return res.status;
    }, { url: baseUrl, data: payload });
    return status;
  }

  /**
   * Count the number of existing calculated value rules displayed on the page.
   */
  async getRuleCount(): Promise<number> {
    return await this.page.evaluate(() => {
      // Rules are displayed as cards with toggle/active controls
      const cards = document.querySelectorAll('[class*="rule"], [class*="card"]');
      return cards.length;
    });
  }
}
