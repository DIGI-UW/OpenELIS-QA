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

    const options = await page.evaluate(() => {
      const select = document.getElementById('0_overall') as HTMLSelectElement;
      if (!select) return [];
      return Array.from(select.options).map(o => ({ value: o.value, text: o.text }));
    });

    const values = options.map(o => o.value);
    expect(values).toContain('ANY');
    expect(values).toContain('ALL');
  });
});

// ─────────────────────────────────────────────────────────────
// Reflex Rule Lifecycle: Create → Read → Update
// ─────────────────────────────────────────────────────────────

test.describe('Reflex Rule Lifecycle Tests (Phase 28 Extended)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-REFLEX-07: Create reflex rule and verify it appears in GET /rest/reflexrules', async ({ page }) => {
    await page.goto(`${BASE}${REFLEX_URL}`);
    await page.waitForLoadState('networkidle');

    const ruleName = `${QA_PREFIX}_LifecycleTest`;

    // Create via API
    const createResult = await page.evaluate(async (name) => {
      const csrf = localStorage.getItem('CSRF') || '';
      const payload = {
        ruleName: name,
        overall: 'ANY',
        active: true,
        conditions: [{ sampleId: '2', testId: '1', relation: 'GREATER_THAN', value: '100' }],
        actions: [{ reflexTestId: '2', sampleId: '2', addNotification: 'N' }],
      };
      const res = await fetch('/api/OpenELIS-Global/rest/reflexrule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify(payload),
      });
      return { status: res.status };
    }, ruleName);

    expect(createResult.status).toBe(200);

    // Verify the rule now appears in the GET list
    const rules = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch('/api/OpenELIS-Global/rest/reflexrules', {
        headers: { 'X-CSRF-Token': csrf },
      });
      return res.json();
    });

    const found = rules.find((r: any) => r.ruleName === ruleName);
    expect(found).toBeTruthy();
    expect(found.overall).toBe('ANY');
    expect(found.active).toBe(true);
    expect(found.conditions.length).toBeGreaterThan(0);
    expect(found.actions.length).toBeGreaterThan(0);
    console.log(`TC-REFLEX-07: PASS — Rule "${ruleName}" created and confirmed in list`);
  });

  test('TC-REFLEX-08: Update existing reflex rule and verify change persists', async ({ page }) => {
    await page.goto(`${BASE}${REFLEX_URL}`);
    await page.waitForLoadState('networkidle');

    // Get current rules
    const rules = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch('/api/OpenELIS-Global/rest/reflexrules', {
        headers: { 'X-CSRF-Token': csrf },
      });
      return res.json();
    });

    if (rules.length === 0) {
      console.log('TC-REFLEX-08: SKIP — no existing rules to update');
      test.skip();
      return;
    }

    const targetRule = rules[0];
    const updatedName = `${QA_PREFIX}_Updated_${Date.now()}`;

    const updateResult = await page.evaluate(async ({ rule, newName }) => {
      const csrf = localStorage.getItem('CSRF') || '';
      const payload = { ...rule, ruleName: newName };
      const res = await fetch('/api/OpenELIS-Global/rest/reflexrule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify(payload),
      });
      return { status: res.status };
    }, { rule: targetRule, newName: updatedName });

    expect(updateResult.status).toBe(200);

    // Verify the name changed
    const updatedRules = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch('/api/OpenELIS-Global/rest/reflexrules', {
        headers: { 'X-CSRF-Token': csrf },
      });
      return res.json();
    });

    const updatedRule = updatedRules.find((r: any) => r.id === targetRule.id);
    expect(updatedRule?.ruleName).toBe(updatedName);
    console.log(`TC-REFLEX-08: PASS — Rule updated to "${updatedName}"`);
  });

  test('TC-REFLEX-09: Inactive reflex rule is visible in the list', async ({ page }) => {
    await page.goto(`${BASE}${REFLEX_URL}`);
    await page.waitForLoadState('networkidle');

    const ruleName = `${QA_PREFIX}_InactiveRule`;

    // Create inactive rule
    const createResult = await page.evaluate(async (name) => {
      const csrf = localStorage.getItem('CSRF') || '';
      const payload = {
        ruleName: name,
        overall: 'ALL',
        active: false, // inactive
        conditions: [{ sampleId: '2', testId: '1', relation: 'LESS_THAN', value: '50' }],
        actions: [{ reflexTestId: '3', sampleId: '2', addNotification: 'N' }],
      };
      const res = await fetch('/api/OpenELIS-Global/rest/reflexrule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify(payload),
      });
      return { status: res.status };
    }, ruleName);

    expect(createResult.status).toBe(200);

    // Verify inactive rule appears (inactive rules should still be returned in the list)
    const rules = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch('/api/OpenELIS-Global/rest/reflexrules', {
        headers: { 'X-CSRF-Token': csrf },
      });
      return res.json();
    });

    const found = rules.find((r: any) => r.ruleName === ruleName);
    expect(found).toBeTruthy();
    expect(found.active).toBe(false);
    console.log(`TC-REFLEX-09: PASS — Inactive rule "${ruleName}" visible in list`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Reflex Extended — Condition Logic & Cross-Module (TC-REFLEX-EXT)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Reflex Extended — Condition Logic & Integration (TC-REFLEX-EXT)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-REFLEX-EXT-01: Rule with GREATER_THAN condition saves and round-trips correctly', async ({ page }) => {
    /**
     * US-REFLEX-1: A lab supervisor configures reflex testing: "if HGB > 18, add
     * peripheral smear". The GREATER_THAN operator must persist exactly.
     */
    await page.goto(`${BASE}/MasterListsPage/reflex`);
    const ruleName = `${QA_PREFIX}_GT_Condition`;

    const result = await page.evaluate(async (name) => {
      const csrf = localStorage.getItem('CSRF') || '';
      const payload = {
        ruleName: name,
        overall: 'ANY',
        active: true,
        conditions: [{ sampleId: '4', testId: '743', relation: 'GREATER_THAN', value: '18' }],
        actions: [{ reflexTestId: '744', sampleId: '4', addNotification: 'N' }],
      };
      const post = await fetch('/api/OpenELIS-Global/rest/reflexrule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify(payload),
      });
      if (!post.ok) return { postStatus: post.status, found: false };

      // Verify round-trip
      const get = await fetch('/api/OpenELIS-Global/rest/reflexrules', {
        headers: { 'X-CSRF-Token': csrf },
      });
      const rules = await get.json();
      const rule = rules.find((r: any) => r.ruleName === name);
      const condition = rule?.conditions?.[0];
      return {
        postStatus: post.status,
        found: !!rule,
        relation: condition?.relation,
        value: condition?.value,
      };
    }, ruleName);

    console.log(`TC-REFLEX-EXT-01: POST=${result.postStatus}, found=${result.found}, relation=${result.relation}, value=${result.value}`);
    expect(result.postStatus).toBe(200);
    expect(result.found, 'Rule must appear in GET list after creation').toBe(true);
    expect(result.relation, 'GREATER_THAN relation must persist exactly').toBe('GREATER_THAN');
    expect(result.value, 'Threshold value must persist exactly').toBe('18');
  });

  test('TC-REFLEX-EXT-02: Rule with ALL operator requires all conditions to match', async ({ page }) => {
    /**
     * US-REFLEX-2: When overall=ALL, every condition must be true for the reflex
     * to trigger. Verifies the operator is stored and returned correctly.
     */
    await page.goto(`${BASE}/MasterListsPage/reflex`);
    const ruleName = `${QA_PREFIX}_ALL_Op`;

    const result = await page.evaluate(async (name) => {
      const csrf = localStorage.getItem('CSRF') || '';
      const payload = {
        ruleName: name,
        overall: 'ALL',
        active: true,
        conditions: [
          { sampleId: '4', testId: '743', relation: 'LESS_THAN', value: '7' },
          { sampleId: '4', testId: '744', relation: 'GREATER_THAN', value: '100' },
        ],
        actions: [{ reflexTestId: '745', sampleId: '4', addNotification: 'N' }],
      };
      const post = await fetch('/api/OpenELIS-Global/rest/reflexrule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify(payload),
      });
      const get = await fetch('/api/OpenELIS-Global/rest/reflexrules', {
        headers: { 'X-CSRF-Token': csrf },
      });
      const rules = await get.json();
      const rule = rules.find((r: any) => r.ruleName === name);
      return {
        postStatus: post.status,
        found: !!rule,
        overall: rule?.overall,
        conditionCount: rule?.conditions?.length ?? 0,
      };
    }, ruleName);

    console.log(`TC-REFLEX-EXT-02: POST=${result.postStatus}, overall=${result.overall}, conditions=${result.conditionCount}`);
    expect(result.postStatus).toBe(200);
    expect(result.overall, 'ALL operator must persist').toBe('ALL');
    expect(result.conditionCount, 'Both conditions must persist').toBe(2);
  });

  test('TC-REFLEX-EXT-03: Deactivating a rule preserves it in list with active=false', async ({ page }) => {
    /**
     * US-REFLEX-3: Lab supervisors deactivate rules seasonally (e.g., malaria
     * reflex only during rainy season). Deactivation must not delete the rule.
     */
    await page.goto(`${BASE}/MasterListsPage/reflex`);
    const ruleName = `${QA_PREFIX}_Deactivate`;

    const result = await page.evaluate(async (name) => {
      const csrf = localStorage.getItem('CSRF') || '';
      // Create active
      const create = await fetch('/api/OpenELIS-Global/rest/reflexrule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify({
          ruleName: name, overall: 'ANY', active: true,
          conditions: [{ sampleId: '4', testId: '743', relation: 'LESS_THAN', value: '10' }],
          actions: [{ reflexTestId: '744', sampleId: '4', addNotification: 'N' }],
        }),
      });
      if (!create.ok) return { createStatus: create.status, deactivated: false };

      // Get the rule to find its id
      const listRes = await fetch('/api/OpenELIS-Global/rest/reflexrules', {
        headers: { 'X-CSRF-Token': csrf },
      });
      const rules = await listRes.json();
      const rule = rules.find((r: any) => r.ruleName === name);
      if (!rule) return { createStatus: create.status, deactivated: false };

      // Deactivate by updating with active=false
      const deactivate = await fetch('/api/OpenELIS-Global/rest/reflexrule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify({ ...rule, active: false }),
      });

      // Verify deactivated state
      const verify = await fetch('/api/OpenELIS-Global/rest/reflexrules', {
        headers: { 'X-CSRF-Token': csrf },
      });
      const updated = await verify.json();
      const deactivatedRule = updated.find((r: any) => r.ruleName === name);
      return {
        createStatus: create.status,
        deactivateStatus: deactivate.status,
        deactivated: deactivatedRule?.active === false,
        stillInList: !!deactivatedRule,
      };
    }, ruleName);

    console.log(`TC-REFLEX-EXT-03: create=${result.createStatus}, deactivate=${result.deactivateStatus}, deactivated=${result.deactivated}, inList=${result.stillInList}`);
    expect(result.createStatus).toBe(200);
    expect(result.stillInList, 'Deactivated rule must remain in the list').toBe(true);
    expect(result.deactivated, 'Rule must show active=false after deactivation').toBe(true);
  });

  test('TC-REFLEX-EXT-04: Reflex rules API returns consistent count on repeated calls', async ({ page }) => {
    /**
     * US-REFLEX-4: The reflex rules list must be stable — concurrent reads should
     * return the same rule count, confirming no race conditions in the list API.
     */
    await page.goto(`${BASE}/MasterListsPage/reflex`);

    const counts = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const fetchCount = async () => {
        const res = await fetch('/api/OpenELIS-Global/rest/reflexrules', {
          headers: { 'X-CSRF-Token': csrf },
        });
        const data = await res.json();
        return Array.isArray(data) ? data.length : -1;
      };
      return Promise.all([fetchCount(), fetchCount(), fetchCount()]);
    });

    console.log(`TC-REFLEX-EXT-04: 3 concurrent rule counts: [${counts.join(', ')}]`);
    expect(counts.every(c => c >= 0), 'All concurrent calls must return valid counts').toBe(true);
    // All three should agree
    const allSame = counts.every(c => c === counts[0]);
    expect(allSame, 'Rule count must be consistent across concurrent reads').toBe(true);
  });

  test('TC-REFLEX-EXT-05: Reflex rule notification flag is stored correctly', async ({ page }) => {
    /**
     * US-REFLEX-5: When addNotification='Y', the system must flag the result
     * for clinician notification. This tests that the flag persists via API.
     */
    await page.goto(`${BASE}/MasterListsPage/reflex`);
    const ruleName = `${QA_PREFIX}_Notify`;

    const result = await page.evaluate(async (name) => {
      const csrf = localStorage.getItem('CSRF') || '';
      const payload = {
        ruleName: name,
        overall: 'ANY',
        active: true,
        conditions: [{ sampleId: '4', testId: '743', relation: 'GREATER_THAN', value: '20' }],
        actions: [{ reflexTestId: '744', sampleId: '4', addNotification: 'Y' }],
      };
      await fetch('/api/OpenELIS-Global/rest/reflexrule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify(payload),
      });
      const list = await fetch('/api/OpenELIS-Global/rest/reflexrules', {
        headers: { 'X-CSRF-Token': csrf },
      });
      const rules = await list.json();
      const rule = rules.find((r: any) => r.ruleName === name);
      return {
        found: !!rule,
        notification: rule?.actions?.[0]?.addNotification,
      };
    }, ruleName);

    console.log(`TC-REFLEX-EXT-05: found=${result.found}, addNotification=${result.notification}`);
    expect(result.found).toBe(true);
    expect(result.notification, 'addNotification=Y must persist').toBe('Y');
  });

  test('TC-REFLEX-EXT-06: Multiple active rules coexist without interference', async ({ page }) => {
    /**
     * US-REFLEX-1: A lab may have many active reflex rules simultaneously.
     * Creates two rules and verifies both are independently retrievable.
     */
    await page.goto(`${BASE}/MasterListsPage/reflex`);
    const ruleA = `${QA_PREFIX}_CoexistA`;
    const ruleB = `${QA_PREFIX}_CoexistB`;

    const result = await page.evaluate(async (names) => {
      const csrf = localStorage.getItem('CSRF') || '';
      const create = async (name: string, value: string) =>
        fetch('/api/OpenELIS-Global/rest/reflexrule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
          body: JSON.stringify({
            ruleName: name, overall: 'ANY', active: true,
            conditions: [{ sampleId: '4', testId: '743', relation: 'GREATER_THAN', value }],
            actions: [{ reflexTestId: '744', sampleId: '4', addNotification: 'N' }],
          }),
        }).then(r => r.status);

      const [sA, sB] = await Promise.all([create(names[0], '5'), create(names[1], '10')]);
      const list = await fetch('/api/OpenELIS-Global/rest/reflexrules', {
        headers: { 'X-CSRF-Token': csrf },
      });
      const rules = await list.json();
      const foundA = rules.find((r: any) => r.ruleName === names[0]);
      const foundB = rules.find((r: any) => r.ruleName === names[1]);
      return { sA, sB, foundA: !!foundA, foundB: !!foundB };
    }, [ruleA, ruleB]);

    console.log(`TC-REFLEX-EXT-06: ruleA=${result.sA}/${result.foundA}, ruleB=${result.sB}/${result.foundB}`);
    expect(result.foundA, `Rule A "${ruleA}" must exist`).toBe(true);
    expect(result.foundB, `Rule B "${ruleB}" must exist`).toBe(true);
  });
});
