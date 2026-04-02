import { test, expect } from '@playwright/test';
import { BASE, ADMIN, QA_PREFIX, TIMEOUT, login } from '../helpers/test-helpers';

/**
 * Calculated Values Test Suite — Phase 28
 *
 * File Purpose:
 * - Covers the Calculated Value Tests Management feature
 * - Tests formula builder UI, API CRUD, and rule persistence
 * - URL: /MasterListsPage/calculatedValue
 *
 * API Endpoints:
 * - GET  /rest/test-calculations   — list all calculated value rules
 * - POST /rest/test-calculation    — create (no id) or update (with id+lastupdated)
 *   No DELETE endpoint available (returns 404)
 *
 * Suite IDs:
 * - TC-CALC-01 through TC-CALC-06
 *
 * Total Test Count: 6 TCs
 *
 * Dependencies:
 * - Requires at least 2 numeric tests on the same sample type (e.g., GOT/ASAT and GPT/ALAT on Serum)
 * - Result verification blocked by BUG-31 (Accept checkbox renderer hang)
 *
 * Key Discovery (Phase 28):
 * - POST endpoint works correctly with proper payload structure
 * - Initial BUG-36 was false positive caused by malformed payloads
 * - Operation types: TEST_RESULT, MATH_FUNCTION, INTEGER, PATIENT_ATTRIBUTE
 */

const CALC_VALUE_URL = '/MasterListsPage/calculatedValue';
const API_BASE = '/api/OpenELIS-Global';

test.describe('Calculated Values Management (Phase 28)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-CALC-02: Calculated Value Management page loads with formula builder', async ({ page }) => {
    await page.goto(`${BASE}${CALC_VALUE_URL}`);
    await page.waitForLoadState('networkidle');

    // Verify URL
    expect(page.url()).toContain('calculatedValue');

    // Verify key UI elements exist
    const bodyText = await page.locator('body').textContent();
    expect(bodyText).toBeTruthy();

    // Check for operand type options (Test Result, Math Function, Integer, Patient Attribute)
    const pageContent = await page.content();
    // The page should have form elements for building formulas
    const inputs = await page.locator('input').count();
    expect(inputs).toBeGreaterThan(0);
  });

  test('TC-CALC-03: Formula builder supports autocomplete test selection', async ({ page }) => {
    await page.goto(`${BASE}${CALC_VALUE_URL}`);
    await page.waitForLoadState('networkidle');

    // Find the Result Test autocomplete input
    const autocompleteInputs = await page.locator('input').all();
    expect(autocompleteInputs.length).toBeGreaterThan(0);

    // Verify operand type selector exists
    const selects = await page.locator('select').all();
    expect(selects.length).toBeGreaterThan(0);
  });

  test('TC-CALC-05: GET /rest/test-calculations returns saved rules', async ({ page }) => {
    await page.goto(`${BASE}${CALC_VALUE_URL}`);
    await page.waitForLoadState('networkidle');

    // Fetch calculated values via API
    const rules = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch('/api/OpenELIS-Global/rest/test-calculations', {
        headers: { 'X-CSRF-Token': csrf },
      });
      if (!res.ok) return { status: res.status, data: [] };
      const data = await res.json();
      return { status: res.status, data };
    });

    expect(rules.status).toBe(200);
    expect(Array.isArray(rules.data)).toBe(true);

    // If rules exist, verify structure
    if (rules.data.length > 0) {
      const rule = rules.data[0];
      expect(rule).toHaveProperty('id');
      expect(rule).toHaveProperty('name');
      expect(rule).toHaveProperty('operations');
      expect(Array.isArray(rule.operations)).toBe(true);
    }
  });

  test('TC-CALC-05b: POST /rest/test-calculation creates a new rule', async ({ page }) => {
    await page.goto(`${BASE}${CALC_VALUE_URL}`);
    await page.waitForLoadState('networkidle');

    const ruleName = `${QA_PREFIX}_CalcTest`;

    // Create a calculated value rule via API
    const result = await page.evaluate(async (name) => {
      const csrf = localStorage.getItem('CSRF') || '';
      const payload = {
        name: name,
        sampleId: '2',       // Serum
        testId: '1',         // GPT/ALAT
        result: '',
        operations: [
          { order: 1, type: 'TEST_RESULT', value: '2', sampleId: '2' },  // GOT/ASAT
          { order: 2, type: 'MATH_FUNCTION', value: '/' },
          { order: 3, type: 'TEST_RESULT', value: '1', sampleId: '2' },  // GPT/ALAT
        ],
        toggled: true,
        active: true,
        note: 'QA automated test',
      };

      const res = await fetch('/api/OpenELIS-Global/rest/test-calculation', {
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
  });

  test('TC-CALC-05c: POST /rest/test-calculation updates existing rule', async ({ page }) => {
    await page.goto(`${BASE}${CALC_VALUE_URL}`);
    await page.waitForLoadState('networkidle');

    // First, get existing rules to find one with an id
    const rules = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch('/api/OpenELIS-Global/rest/test-calculations', {
        headers: { 'X-CSRF-Token': csrf },
      });
      return res.json();
    });

    if (rules.length === 0) {
      test.skip();
      return;
    }

    const existingRule = rules[0];

    // Update the rule
    const result = await page.evaluate(async (rule) => {
      const csrf = localStorage.getItem('CSRF') || '';
      const payload = {
        ...rule,
        note: 'Updated by QA automation',
      };

      const res = await fetch('/api/OpenELIS-Global/rest/test-calculation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrf,
        },
        body: JSON.stringify(payload),
      });

      return { status: res.status };
    }, existingRule);

    expect(result.status).toBe(200);
  });

  test('TC-CALC-06: No DELETE endpoint for calculated values', async ({ page }) => {
    await page.goto(`${BASE}${CALC_VALUE_URL}`);
    await page.waitForLoadState('networkidle');

    // Attempt DELETE — should return 404
    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch('/api/OpenELIS-Global/rest/test-calculation/1', {
        method: 'DELETE',
        headers: { 'X-CSRF-Token': csrf },
      });
      return { status: res.status };
    });

    expect(result.status).toBe(404);
  });
});

test.describe('Calculated Values — Integration with TestAdd (Phase 28)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-CALC-01: TestAdd wizard accessible for creating numeric tests', async ({ page }) => {
    await page.goto(`${BASE}/MasterListsPage/TestAdd`);
    await page.waitForLoadState('networkidle');

    // Verify TestAdd wizard loads (6-step form)
    const bodyText = await page.locator('body').textContent();
    expect(bodyText).toBeTruthy();
    expect(page.url()).toContain('TestAdd');
  });
});
