import { test, expect } from '@playwright/test';

/**
 * TC-MC-ROUTE — a multi-select result must be written to the multi-select component.
 *
 * WHAT WAS FOUND (2026-08-25, testing.openelis-global.org v3.2.2.0, real Chrome)
 * Test 446 `QA_AUTO_MC_188636` has three result components:
 *
 *     PRIMARY   Numeric Result       resultType N
 *     RESULT_D  Dictionary Result    resultType D
 *     RESULT_M  Multi-Select Result  resultType M
 *
 * Selecting a value in the **Multi-Select** control and saving writes that value to the
 * **Dictionary** component instead, and coerces that component's resultType from D to M. The
 * Multi-Select component itself stays empty.
 *
 * Confirmed twice on two independent orders, using only trusted mouse/keyboard input:
 *
 *   DEV01260000000000568 — nothing else touched. After saving the multi-select:
 *       Dictionary Result    type M   val "HIV-1 DNA DETECTED"   <-- wrong component, type coerced
 *       Numeric Result       type N   val ""
 *       Multi-Select Result  type M   val ""                     <-- what the user actually filled
 *
 *   DEV01260000000000567 — dictionary already held "1330" (Inconclusive). Saving the multi-select
 *   did not overwrite it; it appended a FOURTH row, so a three-component test reported four
 *   results, one of them a phantom "Dictionary Result" carrying the multi-select's value.
 *
 * WHY IT MATTERS
 * A result is attached to the wrong analyte and, in the second shape, a result appears that no one
 * entered. Both reach "Results final" through the normal validation path with no warning.
 *
 * A NOTE ON METHOD, because it nearly produced a false report
 * An earlier pass set these controls with `nativeSetter + dispatchEvent('change')` from the
 * console. React never saw those writes, so the dictionary read back empty and looked like a
 * second defect. It is not one — driven by real keyboard input the dictionary persists correctly
 * ("1330"). Only assertions made through real input are recorded here. See HARNESS-FINDINGS.md.
 */

const TEST_ID = process.env.MC_TEST_ID ?? '446';

interface LogbookRow {
  testName?: string;
  resultType?: string;
  resultValue?: string;
}

async function readComponents(page, labNumber: string): Promise<LogbookRow[]> {
  const res = await page.request.get(
    `/api/OpenELIS-Global/rest/LogbookResults?labNumber=${labNumber}&doRange=false&finished=false`,
  );
  expect(res.status(), 'LogbookResults should answer 200').toBe(200);
  const body = await res.json();
  return (body.testResult ?? []) as LogbookRow[];
}

function componentNamed(rows: LogbookRow[], suffix: string): LogbookRow | undefined {
  return rows.find((r) => (r.testName ?? '').endsWith(suffix));
}

test.describe('TC-MC-ROUTE — multi-component result routing', () => {
  test('TC-MC-ROUTE-1: the catalog still defines the three components this test relies on', async ({
    page,
  }) => {
    const res = await page.request.get(
      `/api/OpenELIS-Global/rest/test-catalog/tests/${TEST_ID}/sample-results`,
    );
    expect(res.status()).toBe(200);
    const body = await res.text();
    for (const code of ['PRIMARY', 'RESULT_D', 'RESULT_M']) {
      expect(body, `test ${TEST_ID} should still carry a ${code} component`).toContain(code);
    }
  });

  /**
   * Guard for the defect on an order the operator supplies. Point MC_LAB_NUMBER at an order whose
   * multi-select component was filled and saved; the test asserts the value landed on the
   * multi-select component and that no extra component appeared.
   *
   * Skipped without MC_LAB_NUMBER so the suite stays runnable — driving the Carbon MultiSelect
   * needs real input, which is why this reads back state rather than creating it.
   */
  test('TC-MC-ROUTE-2: a saved multi-select value belongs to the multi-select component', async ({
    page,
  }) => {
    const labNumber = process.env.MC_LAB_NUMBER;
    test.skip(!labNumber, 'set MC_LAB_NUMBER to an order whose multi-select result was saved');

    const rows = await readComponents(page, labNumber as string);

    expect(
      rows.length,
      `a three-component test reported ${rows.length} results — a phantom component was created`,
    ).toBe(3);

    const dict = componentNamed(rows, 'Dictionary Result');
    const multi = componentNamed(rows, 'Multi-Select Result');

    expect(multi, 'the Multi-Select component should be present').toBeTruthy();
    expect(
      multi?.resultValue ?? '',
      'the Multi-Select component holds no value — the selection was routed elsewhere',
    ).not.toBe('');

    expect(
      dict?.resultType,
      'the Dictionary component had its resultType coerced away from D',
    ).toBe('D');
  });
});
