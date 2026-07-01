import { test, expect, Page } from '@playwright/test';
import { BASE, ADMIN, QA_PREFIX, login } from '../helpers/test-helpers';
import CalculatedValuePage from '../pages/CalculatedValuePage';
import { SAMPLE } from '../helpers/carbon';

/**
 * Calculated Values — UI round-trip suite (TC-CALC-UI)
 *
 * WHY THIS SUITE EXISTS: the API-first calculated-values.spec.ts POSTs rule
 * payloads directly, so it never exercises the Carbon rule builder and never
 * catches the class of bug we hit in live QA — the test-search typeahead
 * committing the *display text* but not the underlying testId, silently saving a
 * calculation with an empty operand/final-result id. These tests drive the real
 * builder via CalculatedValuePage and assert the ids round-trip through
 * GET /rest/test-calculations.
 *
 * Tests are portable: they DISCOVER numeric/dictionary tests on Serum from
 * /rest/test-display-beans-map and skip gracefully if the instance lacks them.
 * Created rules use the QA_AUTO_ prefix and are left in place (no calc DELETE API).
 */

interface DiscTest { id: string; name: string; }
interface DiscDict extends DiscTest { values: DiscTest[]; }

/** Prefix query for the typeahead: the test label without its "(Sample)" suffix. */
const q = (name: string) => name.split('(')[0].trim();

async function discoverSerumTests(page: Page): Promise<{ numeric: DiscTest[]; dict: DiscDict[] }> {
  return page.evaluate(async () => {
    const csrf = localStorage.getItem('CSRF') || '';
    const res = await fetch('/api/OpenELIS-Global/rest/test-display-beans-map?samplesTypes=2', {
      headers: { 'X-CSRF-Token': csrf, Accept: 'application/json' },
    });
    const data = await res.json();
    const list: any[] = data['2'] || [];
    const numeric = list
      .filter(t => t.resultType === 'N')
      .map(t => ({ id: String(t.id), name: String(t.value) }));
    const dict = list
      .filter(t => t.resultType === 'D' && Array.isArray(t.resultList) && t.resultList.length > 0)
      .map(t => ({
        id: String(t.id),
        name: String(t.value),
        values: t.resultList.map((v: any) => ({ id: String(v.id), name: String(v.value) })),
      }));
    return { numeric, dict };
  });
}

test.describe('Calculated Values — UI round-trip (TC-CALC-UI)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-CALC-UI-01: numeric calc built in the UI persists operand + final-result testIds', async ({ page }) => {
    await page.goto(`${BASE}/MasterListsPage/calculatedValue`);
    await page.waitForLoadState('networkidle');

    const { numeric } = await discoverSerumTests(page);
    test.skip(numeric.length < 2, 'Needs >=2 numeric Serum tests on this instance');
    const [operand, result] = numeric;
    const numericIds = new Set(numeric.map(t => t.id));

    const calc = new CalculatedValuePage(page);
    const name = `${QA_PREFIX}_CALC_UI_NUM`;

    const rule = await calc.buildNumericCalculationViaUI(BASE, {
      name,
      sampleId: SAMPLE.SERUM,
      operandQuery: q(operand.name),
      operator: 'Multiplied By',
      integer: '2',
      resultQuery: q(result.name),
    });

    expect(rule, 'rule must be saved and returned by GET /rest/test-calculations').toBeTruthy();

    const testResultOp = rule.operations?.find((o: any) => o.type === 'TEST_RESULT');
    const mathOp = rule.operations?.find((o: any) => o.type === 'MATH_FUNCTION');
    const intOp = rule.operations?.find((o: any) => o.type === 'INTEGER');

    // The regression this suite exists for: the operand testId must NOT be empty.
    expect(testResultOp?.value, 'operand testId must commit (typeahead bug guard)').toBeTruthy();
    expect(numericIds.has(String(testResultOp.value)), 'operand must be a real numeric testId').toBe(true);
    expect(String(rule.testId), 'final-result testId must commit').toBeTruthy();
    expect(numericIds.has(String(rule.testId)), 'final result must be a real numeric testId').toBe(true);
    expect(mathOp?.value, 'multiply operator must persist as "*"').toBe('*');
    expect(String(intOp?.value), 'integer operand must persist').toBe('2');

    console.log(`TC-CALC-UI-01: PASS — ${q(operand.name)} * 2 → ${q(result.name)} (operand id=${testResultOp.value}, result id=${rule.testId})`);
  });

  test('TC-CALC-UI-02: dictionary/relational calc built in the UI persists testId + dictionary value', async ({ page }) => {
    await page.goto(`${BASE}/MasterListsPage/calculatedValue`);
    await page.waitForLoadState('networkidle');

    const { numeric, dict } = await discoverSerumTests(page);
    test.skip(numeric.length < 1 || dict.length < 1,
      'Needs >=1 numeric and >=1 dictionary Serum test on this instance');
    const operand = numeric[0];
    const dictTest = dict[0];
    const dictValue = dictTest.values[0];

    const calc = new CalculatedValuePage(page);
    const name = `${QA_PREFIX}_CALC_UI_DICT`;

    const rule = await calc.buildDictionaryCalculationViaUI(BASE, {
      name,
      sampleId: SAMPLE.SERUM,
      operandQuery: q(operand.name),
      operator: 'Is Greater Than Or Equal',
      integer: '5',
      resultQuery: q(dictTest.name),
      dictValueId: dictValue.id,
    });

    expect(rule, 'rule must be saved and returned by GET').toBeTruthy();
    expect(String(rule.testId), 'dictionary final-result testId must commit').toBe(dictTest.id);
    expect(String(rule.result), 'selected dictionary value must persist').toBe(dictValue.id);

    const mathOp = rule.operations?.find((o: any) => o.type === 'MATH_FUNCTION');
    expect(mathOp?.value, 'relational operator ">=" must persist').toBe('>=');

    console.log(`TC-CALC-UI-02: PASS — ${q(operand.name)} >= 5 → ${q(dictTest.name)} = ${dictValue.name} (result id=${rule.result})`);
  });
});
