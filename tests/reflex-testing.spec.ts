import { test, expect } from '@playwright/test';
import { BASE, ADMIN, QA_PREFIX, TIMEOUT, login } from '../helpers/test-helpers';

/**
 * Reflex Testing Suite — Phase 28
 *
 * File Purpose:
 * - Covers the Reflex Tests Management feature
 * - Tests rule builder UI, API CRUD, rule persistence, and order creation
 * - URL: /MasterListsPage/reflex
 *
 * API Endpoints:
 * - GET  /rest/reflexrules    — list all reflex rules
 * - POST /rest/reflexrule     — create or update a reflex rule
 *
 * Suite IDs:
 * - TC-REFLEX-01 through TC-REFLEX-06
 *
 * Total Test Count: 6 TCs
 *
 * Key Discoveries (Phase 28):
 * - Over All Option dropdown (id="0_overall") MUST be set to "ANY" or "ALL"
 *   before submit, otherwise rule will not save
 * - Use native setter pattern for React-controlled select elements
 * - End-to-end reflex triggering blocked by BUG-31 (cannot enter results)
 *
 * Rule structure:
 * {
 *   id?: number,
 *   ruleName: string,
 *   overall: "ANY" | "ALL",
 *   active: boolean,
 *   conditions: [{ sampleId, testId, relation: "GREATER_THAN", value }],
 *   actions: [{ reflexTestId, sampleId, addNotification: "Y"|"N" }]
 * }
 */

const REFLEX_URL = '/MasterListsPage/reflex';
const ORDER_URL = '/SamplePatientEntry';

test.describe('Reflex Tests Management (Phase 28)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-REFLEX-01: Reflex Tests Management page loads with rule builder', async ({ page }) => {
    await page.goto(`${BASE}${REFLEX_URL}`);
    await page.waitForLoadState('networkidle');

    // Verify URL
    expect(page.url()).toContain('reflex');

    // Verify form elements exist
    const bodyText = await page.locator('body').textContent();
    expect(bodyText).toBeTruthy();

    // Check for key form fields
    const inputs = await page.locator('input').count();
    expect(inputs).toBeGreaterThan(0);

    // Check for Submit button
    const submitBtn = page.getByRole('button', { name: /submit/i });
    await expect(submitBtn).toBeVisible();
  });

  test('TC-REFLEX-01b: Rule builder has required form fields', async ({ page }) => {
    await page.goto(`${BASE}${REFLEX_URL}`);
    await page.waitForLoadState('networkidle');

    // Verify Over All Option dropdown exists (critical for rule saving)
    const overAllSelect = await page.evaluate(() => {
      const el = document.getElementById('0_overall');
      return el ? {
        exists: true,
        tagName: el.tagName,
        options: el instanceof HTMLSelectElement
          ? Array.from(el.options).map(o => ({ value: o.value, text: o.text }))
          : [],
      } : { exists: false };
    });

    expect(overAllSelect.exists).toBe(true);
  });

  test('TC-REFLEX-04: GET /rest/reflexrules returns saved rules', async ({ page }) => {
    await page.goto(`${BASE}${REFLEX_URL}`);
    await page.waitForLoadState('networkidle');

    // Fetch reflex rules via API
    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch('/api/OpenELIS-Global/rest/reflexrules', {
        headers: { 'X-CSRF-Token': csrf },
      });
      if (!res.ok) return { status: res.status, data: [] };
      const data = await res.json();
      return { status: res.status, data };
    });

    expect(result.status).toBe(200);
    expect(Array.isArray(result.data)).toBe(true);

    // If rules exist, verify structure
    if (result.data.length > 0) {
      const rule = result.data[0];
      expect(rule).toHaveProperty('id');
      expect(rule).toHaveProperty('ruleName');
      expect(rule).toHaveProperty('overall');
      expect(rule).toHaveProperty('active');
      expect(rule).toHaveProperty('conditions');
      expect(rule).toHaveProperty('actions');
      expect(Array.isArray(rule.conditions)).toBe(true);
      expect(Array.isArray(rule.actions)).toBe(true);

      // Verify condition structure
      if (rule.conditions.length > 0) {
        const condition = rule.conditions[0];
        expect(condition).toHaveProperty('sampleId');
        expect(condition).toHaveProperty('testId');
        expect(condition).toHaveProperty('relation');
        expect(condition).toHaveProperty('value');
      }

      // Verify action structure
      if (rule.actions.length > 0) {
        const action = rule.actions[0];
        expect(action).toHaveProperty('reflexTestId');
        expect(action).toHaveProperty('sampleId');
      }
    }
  });

  test('TC-REFLEX-04b: POST /rest/reflexrule creates a new rule via API', async ({ page }) => {
    await page.goto(`${BASE}${REFLEX_URL}`);
    await page.waitForLoadState('networkidle');

    const ruleName = `${QA_PREFIX}_ReflexTest`;

    // Create a reflex rule via direct API
    const result = await page.evaluate(async (name) => {
      const csrf = localStorage.getItem('CSRF') || '';
      const payload = {
        ruleName: name,
        overall: 'ANY',
        active: true,
        conditions: [{
          sampleId: '2',       // Serum
          testId: '1',         // GPT/ALAT
          relation: 'GREATER_THAN',
          value: '300',
        }],
        actions: [{
          reflexTestId: '2',   // GOT/ASAT
          sampleId: '2',       // Serum
          addNotification: 'Y',
        }],
      };

      const res = await fetch('/api/OpenELIS-Global/rest/reflexrule', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrf,
        },
        body: JSON.stringify(payload),
      });

      return { status: res.status };
    }, ruleName);

    expect(result.status).toBe(200);

    // Verify the rule was created
    const rules = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch('/api/OpenELIS-Global/rest/reflexrules', {
        headers: { 'X-CSRF-Token': csrf },
      });
      return res.json();
    });

    const createdRule = rules.find((r: any) => r.ruleName === ruleName);
    expect(createdRule).toBeTruthy();
    expect(createdRule.overall).toBe('ANY');
    expect(createdRule.active).toBe(true);
  });
});

test.describe('Reflex Testing — Order Integration (Phase 28)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-REFLEX-05: Order creation wizard accessible for reflex test orders', async ({ page }) => {
    await page.goto(`${BASE}${ORDER_URL}`);
    await page.waitForLoadState('networkidle');

    // Verify SamplePatientEntry page loads (4-step wizard)
    const bodyText = await page.locator('body').textContent();
    expect(bodyText).toBeTruthy();
    expect(page.url()).toContain('SamplePatientEntry');

    // Should have Next/Previous navigation buttons
    const nextBtn = page.getByRole('button', { name: /next/i });
    await expect(nextBtn).toBeVisible();
  });

  test('TC-REFLEX-06: Results entry page loads (BUG-31 blocks interaction)', async ({ page }) => {
    // Navigate to Results By Unit
    await page.goto(`${BASE}/LogbookResults?type=`);
    await page.waitForLoadState('networkidle');

    // Verify the page loads with test unit selector
    const bodyText = await page.locator('body').textContent();
    expect(bodyText).toBeTruthy();

    // Check for "Select Test Unit" dropdown
    const selects = await page.locator('select').count();
    expect(selects).toBeGreaterThan(0);

    // NOTE: Actual result entry is blocked by BUG-31
    // The Accept checkbox causes a 60s renderer hang
    // This test verifies the page loads but does not attempt result entry
  });
});

test.describe('Reflex Testing — Over All Option Validation', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('Over All Option dropdown has ANY and ALL options', async ({ page }) => {
    await page.goto(`${BASE}${REFLEX_URL}`);
    await page.waitForLoadState('networkidle');

    // Verify Over All Option dropdown options
    const options = await page.evaluate(() => {
      const select = document.getElementById('0_overall') as HTMLSelectElement;
      if (!select) return [];
      return Array.from(select.options).map(o => ({
        value: o.value,
        text: o.text,
      }));
    });

    // Should have at least ANY and ALL options
    const values = options.map(o => o.value);
    expect(values).toContain('ANY');
    expect(values).toContain('ALL');
  });
});
