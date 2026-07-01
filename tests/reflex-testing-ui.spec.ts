import { test, expect, Page } from '@playwright/test';
import { BASE, ADMIN, QA_PREFIX, login } from '../helpers/test-helpers';
import ReflexTestPage from '../pages/ReflexTestPage';
import { SAMPLE } from '../helpers/carbon';

/**
 * Reflex Tests — UI round-trip suite (TC-REFLEX-UI)
 *
 * WHY THIS SUITE EXISTS: reflex-testing.spec.ts is API-first (it POSTs
 * reflexTestId directly, which works), so it never exercises the rule builder.
 * In live QA the builder's ACTION-test typeahead repeatedly saved an EMPTY
 * reflexTestId — a broken rule with a condition but no test to add — while the
 * display showed the chosen test. This suite drives the real builder via
 * ReflexTestPage.createReflexRuleViaUI (which includes the reload-retry guard)
 * and asserts the action reflexTestId round-trips through GET /rest/reflexrules.
 *
 * Portable: DISCOVERS numeric Serum tests; skips if the instance lacks them.
 * Created rules use the QA_AUTO_ prefix.
 */

interface DiscTest { id: string; name: string; }
const q = (name: string) => name.split('(')[0].trim();

async function discoverNumericSerum(page: Page): Promise<DiscTest[]> {
  return page.evaluate(async () => {
    const csrf = localStorage.getItem('CSRF') || '';
    const res = await fetch('/api/OpenELIS-Global/rest/test-display-beans-map?samplesTypes=2', {
      headers: { 'X-CSRF-Token': csrf, Accept: 'application/json' },
    });
    const data = await res.json();
    const list: any[] = data['2'] || [];
    return list
      .filter(t => t.resultType === 'N')
      .map(t => ({ id: String(t.id), name: String(t.value) }));
  });
}

test.describe('Reflex Tests — UI round-trip (TC-REFLEX-UI)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-REFLEX-UI-01: rule built in the UI persists condition testId AND action reflexTestId', async ({ page }) => {
    await page.goto(`${BASE}/MasterListsPage/reflex`);
    await page.waitForLoadState('networkidle');

    const numeric = await discoverNumericSerum(page);
    test.skip(numeric.length < 2, 'Needs >=2 numeric Serum tests on this instance');
    const [condTest, actionTest] = numeric;
    const numericIds = new Set(numeric.map(t => t.id));

    const reflex = new ReflexTestPage(page);
    const name = `${QA_PREFIX}_REFLEX_UI`;

    const rule = await reflex.createReflexRuleViaUI(BASE, {
      name,
      overall: 'ANY',
      condSampleId: SAMPLE.SERUM,
      condQuery: q(condTest.name),
      relation: 'GREATER_THAN_OR_EQUAL',
      value: '5',
      actionSampleId: SAMPLE.SERUM,
      actionQuery: q(actionTest.name),
    });

    expect(rule, 'rule must be saved and returned by GET /rest/reflexrules').toBeTruthy();

    const condition = rule.conditions?.[0];
    const action = rule.actions?.[0];

    expect(String(condition?.testId), 'condition testId must commit').toBeTruthy();
    expect(numericIds.has(String(condition?.testId)), 'condition must be a real numeric testId').toBe(true);
    expect(condition?.relation, 'relation must persist exactly').toBe('GREATER_THAN_OR_EQUAL');
    expect(String(condition?.value), 'threshold must persist').toBe('5');

    // The regression this suite exists for: the action reflexTestId must NOT be empty.
    expect(action?.reflexTestId, 'action reflexTestId must commit (typeahead/dirty-state guard)').toBeTruthy();
    expect(numericIds.has(String(action?.reflexTestId)), 'action must reference a real testId').toBe(true);

    console.log(`TC-REFLEX-UI-01: PASS — ${q(condTest.name)} >= 5 → add ${q(actionTest.name)} (condId=${condition?.testId}, actionId=${action?.reflexTestId})`);
  });
});
