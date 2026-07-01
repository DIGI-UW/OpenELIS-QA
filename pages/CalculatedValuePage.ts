import { Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';
import {
  byId, setReactSelect, setReactSelectByText, setReactInput,
  commitTypeahead, submitCard, addRuleCard, expandCard, OPERATION,
} from '../helpers/carbon';

/**
 * Page Object Model for OpenELIS Calculated Value Tests Management.
 * URL: /MasterListsPage/calculatedValue
 *
 * Builds formulas that auto-compute a test result from other results, e.g.
 *   Creatinine(Serum) × 2 → Total cholesterol(Serum)                (numeric)
 *   Creatinine(Serum) ≥ 5 → Bioline(Serum) = Négatif                (dictionary)
 *
 * API Endpoints:
 * - GET  /rest/test-calculations   — list all rules
 * - POST /rest/test-calculation    — create (no id) / update (with id+lastupdated)
 * - Helpers: GET /rest/math-functions, GET /rest/test-display-beans-map?samplesTypes=<id>
 *   (the beans map tags each test resultType "N" = numeric, "D" = dictionary, with
 *    a resultList of dictionary values).
 *
 * Saved rule shape (GET /rest/test-calculations):
 * {
 *   id, name, sampleId, testId (final-result test), result (dictionary value id, "" if numeric),
 *   operations: [{ order, type, value, sampleId? }], active
 * }
 * Operation types: TEST_RESULT | MATH_FUNCTION | INTEGER | PATIENT_ATTRIBUTE.
 * For TEST_RESULT the operation `value` is the source test's testId.
 *
 * ── Builder gotchas encoded by the UI methods below (see helpers/carbon.ts) ──
 *  1. Test fields are Carbon typeaheads: commit with type → ArrowDown → Enter,
 *     NEVER the native setter (that leaves an empty testId and silently saves a
 *     broken rule). The row's sample <select> must be set FIRST.
 *  2. Operands are chained via each row's `_addoperation` select (add MATH_FUNCTION,
 *     then INTEGER, …). The math-function operator list is symbol-valued
 *     (Multiplied By = "*", Is Greater Than Or Equal = ">=").
 *  3. Choosing a dictionary (resultType "D") final-result test WITH a relational
 *     operator reveals a "Select Dictionary Value" select (`<c>_resultdictionary`).
 *  4. Each card has its own Submit; its `disabled` attribute is often STALE — the
 *     click still posts (submitCard force-clicks). There is no success toast, so
 *     always verify by GET.
 */
export default class CalculatedValuePage extends BasePage {
  readonly path = '/MasterListsPage/calculatedValue';
  readonly apiListEndpoint = '/rest/test-calculations';
  readonly apiSaveEndpoint = '/rest/test-calculation';

  constructor(page: Page) {
    super(page);
  }

  /** Navigate using an explicit base URL (avoids the stale BasePage default). */
  async navigateHere(baseUrl: string): Promise<void> {
    await this.page.goto(`${baseUrl}${this.path}`);
    await this.page.waitForLoadState('networkidle');
  }

  async navigate(): Promise<void> {
    await this.navigateToPath(this.path);
  }

  async verifyPageLoaded(): Promise<void> {
    await this.waitForPageLoad();
    expect(this.page.url()).toContain('calculatedValue');
  }

  /**
   * Build a NUMERIC calculated value via the UI and return the saved rule.
   *
   * @example
   *   await calc.buildNumericCalculationViaUI(BASE, {
   *     name: 'QA_AUTO_Ratio', sampleId: '2',
   *     operandQuery: 'Creatinine', operator: 'Multiplied By', integer: '2',
   *     resultQuery: 'Total cholesterol',
   *   });
   */
  async buildNumericCalculationViaUI(baseUrl: string, spec: {
    name: string;
    sampleId: string;
    operandQuery: string;
    operator: string;   // math-function option text, e.g. "Multiplied By"
    integer: string;
    resultQuery: string;
  }): Promise<any | undefined> {
    const idx = await this.openFreshCard(baseUrl);
    await this.fillOperandTestIntegerChain(idx, spec.sampleId, spec.operandQuery, spec.operator, spec.integer);
    // Final result (numeric test)
    await setReactSelect(byId(this.page, `${idx}_sample`), spec.sampleId);
    await commitTypeahead(this.page, byId(this.page, `${idx}_finalresult`), spec.resultQuery);
    await byId(this.page, `${idx}_name`).fill(spec.name);
    await submitCard(this.page, idx);
    return this.findCalculationByName(baseUrl, spec.name);
  }

  /**
   * Build a DICTIONARY / relational calculated value via the UI and return the
   * saved rule. `dictValueId` is the dictionary-value id to set when the
   * condition is true (from the test's resultList).
   */
  async buildDictionaryCalculationViaUI(baseUrl: string, spec: {
    name: string;
    sampleId: string;
    operandQuery: string;
    operator: string;   // relational, e.g. "Is Greater Than Or Equal"
    integer: string;
    resultQuery: string; // a resultType "D" test
    dictValueId: string;
  }): Promise<any | undefined> {
    const idx = await this.openFreshCard(baseUrl);
    await this.fillOperandTestIntegerChain(idx, spec.sampleId, spec.operandQuery, spec.operator, spec.integer);
    // Final result (dictionary test) → reveals the dictionary-value select
    await setReactSelect(byId(this.page, `${idx}_sample`), spec.sampleId);
    await commitTypeahead(this.page, byId(this.page, `${idx}_finalresult`), spec.resultQuery);
    const dictSelect = byId(this.page, `${idx}_resultdictionary`);
    await dictSelect.waitFor({ state: 'attached', timeout: 5000 });
    await setReactSelect(dictSelect, spec.dictValueId);
    await byId(this.page, `${idx}_name`).fill(spec.name);
    await submitCard(this.page, idx);
    return this.findCalculationByName(baseUrl, spec.name);
  }

  /** Add a blank card and expand it; returns the new card index. */
  private async openFreshCard(baseUrl: string): Promise<number> {
    await this.navigateHere(baseUrl);
    const idx = await addRuleCard(this.page, 'calc');
    await expandCard(this.page, idx);
    return idx;
  }

  /** operand row (sample+test) → MATH_FUNCTION operator → INTEGER value. */
  private async fillOperandTestIntegerChain(
    idx: number, sampleId: string, operandQuery: string, operator: string, integer: string,
  ): Promise<void> {
    await setReactSelect(byId(this.page, `${idx}_0_sample`), sampleId);
    await commitTypeahead(this.page, byId(this.page, `${idx}_0_testresult`), operandQuery);

    await setReactSelect(byId(this.page, `${idx}_0_addoperation`), OPERATION.MATH_FUNCTION);
    const mf = byId(this.page, `${idx}_1_mathfunction`);
    await mf.waitFor({ state: 'attached', timeout: 5000 });
    await setReactSelectByText(mf, operator);

    await setReactSelect(byId(this.page, `${idx}_1_addoperation`), OPERATION.INTEGER);
    const intInput = byId(this.page, `${idx}_2_integer`);
    await intInput.waitFor({ state: 'attached', timeout: 5000 });
    await setReactInput(intInput, integer);
  }

  /** Fetch all calculated value rules via API. */
  async getCalculatedValuesViaAPI(baseUrl: string): Promise<any[]> {
    return this.page.evaluate(async (url) => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch(`${url}/api/OpenELIS-Global/rest/test-calculations`, {
        headers: { 'X-CSRF-Token': csrf, Accept: 'application/json' },
      });
      return res.ok ? res.json() : [];
    }, baseUrl);
  }

  /** Find a saved rule by exact name (returns undefined if not found). */
  async findCalculationByName(baseUrl: string, name: string): Promise<any | undefined> {
    const rules = await this.getCalculatedValuesViaAPI(baseUrl);
    return Array.isArray(rules) ? rules.find(r => r.name === name) : undefined;
  }

  /**
   * @deprecated Use buildNumericCalculationViaUI / buildDictionaryCalculationViaUI.
   * Kept for backward compatibility. Commits a final-result test via the reliable
   * typeahead path rather than the old (broken) native-setter approach.
   */
  async selectResultTest(testName: string): Promise<void> {
    const input = this.page.locator('input[id$="_finalresult"]').first();
    await commitTypeahead(this.page, input, testName);
  }

  async submit(): Promise<void> {
    await this.page.getByRole('button', { name: /submit/i }).first().click({ force: true });
    await this.waitForPageLoad();
  }

  async getRuleCount(): Promise<number> {
    return this.page.locator('input[id$="_name"]').count();
  }
}
