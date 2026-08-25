import { test, expect } from '@playwright/test';

/**
 * TC-RTYPE — every result type the Test Catalogue Editor offers must be enterable.
 *
 * WHAT WAS FOUND (2026-08-25, testing.openelis-global.org v3.2.2.0, real Chrome)
 * The editor offers **seven** result types as radio tiles in Sample & Results:
 *
 *     PRIMARY_RESULT_TYPES  = ["N", "D", "R"]        Numeric, Single-select, Free text
 *     ADVANCED_RESULT_TYPES = ["M", "C", "T", "A"]   Multi-select, Cascading, Titer, Alpha
 *
 * Results Entry renders a control for six of them. `PolymorphicResultCell.tsx` switches on
 * `row.resultType` with cases for D, M, C, N, R and A, and a `default:` branch that returns a bare
 * `<span>{row.resultValue || ""}</span>`. **There is no `case "T"`.** A titer test therefore lands
 * in `default` and renders no control at all — no input, no Save, nothing.
 *
 * `resultType === "T"` and `case "T"` appear nowhere in `frontend/src`. The word "Titer" appears
 * only in the catalog editor that offers it.
 *
 * Observed on order DEV01260000000000570, test 548 `QA_AUTO_0727_02754 TiterRT` (component TITER1,
 * resultType T). The Result cell contained exactly:
 *
 *     <span class="unifiedValueAccent"><span></span></span>
 *
 * The row stayed "Not started" with no way to advance it, while the numeric test ordered on the
 * same sample resulted and validated normally. Tests 547 and 538 carry the same TITER1:T shape.
 *
 * The editor presents Titer as an enabled, described choice — "A dilution ratio such as 1:10 or
 * 1:20 (common in serology)" — so a lab can configure a test that can never be resulted.
 *
 * TC-RTYPE-1 is a catalog-side census: it finds every active test whose components declare a
 * result type, and fails on any type the results UI cannot render. It is written against the
 * renderable set rather than against "T" specifically, so adding an eighth type without a matching
 * case also trips it.
 */

/** Result types PolymorphicResultCell has an explicit case for, as of v3.2.2.0. */
const RENDERABLE = new Set(['N', 'D', 'R', 'M', 'C', 'A']);

/** Types the Test Catalogue Editor offers. Kept separate so a drift in either list is visible. */
const OFFERED_BY_EDITOR = ['N', 'D', 'R', 'M', 'C', 'T', 'A'];

const SAMPLE_TEST_IDS = (process.env.RTYPE_TEST_IDS ?? '548,547,538,446,546')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

test.describe('TC-RTYPE — result type coverage', () => {
  test('TC-RTYPE-1: no configured test declares a result type the results UI cannot render', async ({
    page,
  }) => {
    const offenders: string[] = [];

    for (const id of SAMPLE_TEST_IDS) {
      const res = await page.request.get(
        `/api/OpenELIS-Global/rest/test-catalog/tests/${id}/sample-results`,
      );
      if (res.status() !== 200) continue; // test may have been retired; TC-RTYPE-2 covers drift
      const body = await res.json();
      for (const c of (body.components ?? []) as Array<{ code?: string; resultType?: string }>) {
        const type = c.resultType ?? '';
        if (!RENDERABLE.has(type)) {
          offenders.push(`test ${id} component ${c.code ?? '?'} declares resultType "${type}"`);
        }
      }
    }

    expect(
      offenders,
      'these components cannot be resulted — PolymorphicResultCell has no case for their type',
    ).toEqual([]);
  });

  test('TC-RTYPE-2: the editor does not offer a type the results UI cannot render', async () => {
    const unrenderable = OFFERED_BY_EDITOR.filter((t) => !RENDERABLE.has(t));
    expect(
      unrenderable,
      'the Test Catalogue Editor offers these result types but Results Entry cannot render them',
    ).toEqual([]);
  });
});
