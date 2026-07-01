import { Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';
import {
  byId, setReactSelect, setReactInput, commitTypeahead,
  submitCard, addRuleCard, expandCard, cardIndexByName, RELATION,
} from '../helpers/carbon';

/**
 * Page Object Model for OpenELIS Reflex Tests Management.
 * URL: /MasterListsPage/reflex
 *
 * A reflex rule auto-orders an additional test when a condition on a result is
 * met, e.g. Creatinine(Serum) ≥ 5 → add Amylase(Serum).
 *
 * API Endpoints:
 * - GET  /rest/reflexrules        — list all reflex rules
 * - POST /rest/reflexrule         — create / update a rule
 *   NOTE: this POST has been observed to return 503 yet still persist the rule.
 *   Treat 503 here as transient and confirm the result via GET.
 * - GET  /rest/reflexrule-options — relation/option enums
 *
 * Saved rule shape (GET /rest/reflexrules):
 * {
 *   id, ruleName, overall: "ANY"|"ALL", active,
 *   conditions: [{ sampleId, testId, relation, value, value2 }],
 *   actions:    [{ reflexTestId, sampleId, addNotification: "Y"|"N" }]
 * }
 *
 * ── Builder gotchas (see helpers/carbon.ts) ──
 *  1. Condition-test AND action-test fields are Carbon typeaheads — commit with
 *     type → ArrowDown → Enter after setting the row's sample; the native setter
 *     leaves an EMPTY testId/reflexTestId and the rule saves broken.
 *  2. THE ACTION TEST IS ESPECIALLY FLAKY: after heavy prior mutation of the card
 *     it can save with an empty reflexTestId even when the display shows the test.
 *     createReflexRuleViaUI() handles this with a reload-then-reselect retry.
 *  3. Condition and action sample <select>s share the id `<c>_0_sample`; target by
 *     nth() (0 = condition, 1 = action).
 *  4. "Over All Option" (`<c>_overall`) must be ANY or ALL.
 */
export default class ReflexTestPage extends BasePage {
  readonly path = '/MasterListsPage/reflex';
  readonly apiListEndpoint = '/rest/reflexrules';
  readonly apiSaveEndpoint = '/rest/reflexrule';

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
    expect(this.page.url()).toContain('reflex');
  }

  /**
   * Build a reflex rule through the UI and return the saved rule (or undefined).
   * Includes the reload-retry guard for the flaky action-test binding: if the
   * first save comes back with an empty reflexTestId, it reloads to a clean form
   * and re-selects the action test once before giving up.
   */
  async createReflexRuleViaUI(baseUrl: string, spec: {
    name: string;
    overall: 'ANY' | 'ALL';
    condSampleId: string;
    condQuery: string;
    relation: keyof typeof RELATION | string;
    value: string;
    actionSampleId: string;
    actionQuery: string;
  }): Promise<any | undefined> {
    await this.navigateHere(baseUrl);
    const idx = await addRuleCard(this.page, 'reflex');
    await expandCard(this.page, idx);

    await byId(this.page, `${idx}_rulename`).fill(spec.name);
    await setReactSelect(byId(this.page, `${idx}_overall`), spec.overall);

    // Condition: sample (nth 0) + test + relation + value
    await setReactSelect(this.page.locator(`[id="${idx}_0_sample"]`).nth(0), spec.condSampleId);
    await commitTypeahead(this.page, byId(this.page, `${idx}_0_conditionTestId`), spec.condQuery);
    await setReactSelect(byId(this.page, `${idx}_0_relation`),
      (RELATION as Record<string, string>)[spec.relation] ?? spec.relation);
    await setReactInput(byId(this.page, `${idx}_0_value`), spec.value);

    // Action: sample (nth 1) + reflex test
    await setReactSelect(this.page.locator(`[id="${idx}_0_sample"]`).nth(1), spec.actionSampleId);
    await commitTypeahead(this.page, byId(this.page, `${idx}_0_reflexTestId`), spec.actionQuery);

    await submitCard(this.page, idx);

    let rule = await this.findRuleByName(baseUrl, spec.name);
    if (rule && rule.actions?.[0]?.reflexTestId) return rule;

    // Reload-retry: clean form, re-select just the action test on the saved card.
    await this.navigateHere(baseUrl);
    const idx2 = await cardIndexByName(this.page, 'reflex', spec.name);
    if (idx2 < 0) return rule; // rule not created at all — nothing to fix here
    await expandCard(this.page, idx2);
    await setReactSelect(this.page.locator(`[id="${idx2}_0_sample"]`).nth(1), spec.actionSampleId);
    await commitTypeahead(this.page, byId(this.page, `${idx2}_0_reflexTestId`), spec.actionQuery);
    await submitCard(this.page, idx2);

    rule = await this.findRuleByName(baseUrl, spec.name);
    return rule;
  }

  /** Fetch all reflex rules via API. */
  async getReflexRulesViaAPI(baseUrl: string): Promise<any[]> {
    return this.page.evaluate(async (url) => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch(`${url}/api/OpenELIS-Global/rest/reflexrules`, {
        headers: { 'X-CSRF-Token': csrf, Accept: 'application/json' },
      });
      return res.ok ? res.json() : [];
    }, baseUrl);
  }

  /** Find a saved reflex rule by exact ruleName (returns undefined if not found). */
  async findRuleByName(baseUrl: string, name: string): Promise<any | undefined> {
    const rules = await this.getReflexRulesViaAPI(baseUrl);
    return Array.isArray(rules) ? rules.find(r => r.ruleName === name) : undefined;
  }

  async submit(): Promise<void> {
    await this.page.getByRole('button', { name: /submit/i }).first().click({ force: true });
    await this.waitForPageLoad();
  }

  async getRuleCount(): Promise<number> {
    return this.page.locator('input[id$="_rulename"]').count();
  }
}
