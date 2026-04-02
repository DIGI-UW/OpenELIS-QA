import { Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page Object Model for OpenELIS Reflex Tests Management.
 * URL: /MasterListsPage/reflex
 *
 * Reflex tests auto-order additional tests when a condition is met
 * (e.g., GPT/ALAT > 200 → auto-order GOT/ASAT).
 *
 * API Endpoints:
 * - GET  /rest/reflexrules     — list all reflex rules
 * - POST /rest/reflexrule      — create or update a reflex rule
 *
 * Rule structure:
 * {
 *   id?: number,
 *   ruleName: string,
 *   overall: "ANY" | "ALL",
 *   active: boolean,
 *   conditions: [{ sampleId: string, testId: string, relation: string, value: string }],
 *   actions: [{ reflexTestId: string, sampleId: string, addNotification: "Y"|"N" }]
 * }
 *
 * IMPORTANT: The "Over All Option" dropdown (id="0_overall") MUST be set
 * to "ANY" or "ALL" before submit, or the rule will not save.
 * Use the native setter pattern for React-controlled selects.
 */
export default class ReflexTestPage extends BasePage {
  // URL path
  readonly path = '/MasterListsPage/reflex';

  // API endpoints
  readonly apiListEndpoint = '/rest/reflexrules';
  readonly apiSaveEndpoint = '/rest/reflexrule';

  constructor(page: Page) {
    super(page);
  }

  /**
   * Navigate to the Reflex Tests Management page.
   */
  async navigate(): Promise<void> {
    await this.navigateToPath(this.path);
  }

  /**
   * Verify the page has loaded with reflex rule builder form.
   */
  async verifyPageLoaded(): Promise<void> {
    await this.waitForPageLoad();
    const url = this.page.url();
    expect(url).toContain('reflex');
  }

  /**
   * Set the Rule Name field.
   *
   * @param name - Rule name (e.g., "High ALT Reflex")
   */
  async setRuleName(name: string): Promise<void> {
    await this.page.evaluate((val) => {
      const inputs = Array.from(document.querySelectorAll('input'));
      const nameInput = inputs.find(i =>
        i.id?.toLowerCase().includes('name') ||
        i.placeholder?.toLowerCase().includes('name')
      );
      if (nameInput) {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, 'value'
        )!.set!;
        setter.call(nameInput, val);
        nameInput.dispatchEvent(new Event('input', { bubbles: true }));
        nameInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, name);
  }

  /**
   * Set the Over All Option dropdown.
   * CRITICAL: Must be set to "ANY" or "ALL" before submit.
   *
   * @param option - "ANY" or "ALL"
   */
  async setOverAllOption(option: 'ANY' | 'ALL'): Promise<void> {
    await this.page.evaluate((val) => {
      const select = document.getElementById('0_overall') as HTMLSelectElement;
      if (select) {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLSelectElement.prototype, 'value'
        )!.set!;
        setter.call(select, val);
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, option);
  }

  /**
   * Configure a condition for the reflex rule.
   *
   * @param sampleType - Sample type (e.g., "Serum")
   * @param testName - Test to monitor (e.g., "GPT/ALAT(Serum)")
   * @param relation - Comparison relation (e.g., "Is greater than")
   * @param value - Threshold value (e.g., "200")
   */
  async setCondition(
    sampleType: string,
    testName: string,
    relation: string,
    value: string
  ): Promise<void> {
    // Set sample type
    const sampleSelects = await this.page.locator('select').all();
    for (const sel of sampleSelects) {
      const options = await sel.locator('option').allTextContents();
      if (options.some(o => o.includes(sampleType))) {
        await sel.selectOption({ label: sampleType });
        break;
      }
    }

    // Set test via autocomplete input
    await this.page.evaluate((name) => {
      const inputs = Array.from(document.querySelectorAll('input'));
      const testInput = inputs.find(i =>
        i.placeholder?.toLowerCase().includes('test') ||
        i.id?.toLowerCase().includes('test')
      );
      if (testInput) {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, 'value'
        )!.set!;
        setter.call(testInput, name);
        testInput.dispatchEvent(new Event('input', { bubbles: true }));
        testInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, testName);

    // Set relation dropdown
    await this.page.evaluate((rel) => {
      const selects = Array.from(document.querySelectorAll('select'));
      const relSelect = selects.find(s =>
        Array.from(s.options).some(o =>
          o.text?.toLowerCase().includes('greater') ||
          o.text?.toLowerCase().includes('less') ||
          o.text?.toLowerCase().includes('equal')
        )
      );
      if (relSelect) {
        const option = Array.from(relSelect.options).find(o =>
          o.text?.toLowerCase().includes(rel.toLowerCase())
        );
        if (option) {
          const setter = Object.getOwnPropertyDescriptor(
            window.HTMLSelectElement.prototype, 'value'
          )!.set!;
          setter.call(relSelect, option.value);
          relSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    }, relation);

    // Set numeric threshold value
    await this.page.evaluate((val) => {
      const inputs = Array.from(document.querySelectorAll('input[type="number"], input[type="text"]'));
      const valueInput = inputs.find(i =>
        i.placeholder?.toLowerCase().includes('value') ||
        i.id?.toLowerCase().includes('value')
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
   * Click Submit to save the reflex rule.
   */
  async submit(): Promise<void> {
    const submitBtn = this.page.getByRole('button', { name: /submit/i });
    await submitBtn.click();
    await this.waitForPageLoad();
  }

  /**
   * Get all reflex rules via API.
   *
   * @param baseUrl - The base URL of the OpenELIS instance
   * @returns Array of reflex rule objects
   */
  async getReflexRulesViaAPI(baseUrl: string): Promise<any[]> {
    const response = await this.page.evaluate(async (url) => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch(`${url}/rest/reflexrules`, {
        headers: { 'X-CSRF-Token': csrf },
      });
      return res.json();
    }, baseUrl);
    return response;
  }

  /**
   * Create a reflex rule via direct API POST.
   *
   * @param baseUrl - The base URL
   * @param payload - The rule payload
   * @returns HTTP status code
   */
  async createReflexRuleViaAPI(baseUrl: string, payload: {
    ruleName: string;
    overall: 'ANY' | 'ALL';
    active: boolean;
    conditions: Array<{ sampleId: string; testId: string; relation: string; value: string }>;
    actions: Array<{ reflexTestId: string; sampleId: string; addNotification: string }>;
  }): Promise<number> {
    const status = await this.page.evaluate(async ({ url, data }) => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch(`${url}/rest/reflexrule`, {
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
   * Count the number of existing reflex rules displayed on the page.
   */
  async getRuleCount(): Promise<number> {
    return await this.page.evaluate(() => {
      const toggles = document.querySelectorAll('[class*="toggle"], [class*="rule"]');
      return toggles.length;
    });
  }
}
