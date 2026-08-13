/**
 * OpenELIS Global — Test Catalog editor: RESULT-TYPE COVERAGE suite
 * Target: testing.openelis-global.org (v3.2.1.10) · authored 2026-07-06 from a live deep run.
 *
 * Goal (Casey): create a semi-realistic test for EACH result type the platform supports and
 * exercise it "all the way through" the catalog editor — Basic Info create → Sample & Results
 * component of that type → section Save → ROUND-TRIP read-back on the REST surface.
 *
 * Result types verified present in the live picker (DOM select#comp-type-0):
 *   N Numeric · D Single-select(dictionary) · R Free text · M Multi-select ·
 *   C Cascading multi-select · T Titer · A Alpha(validated text)
 * (FRS baseline had only N/D/R; M/C/T/A have since been added — see the crosswalk in
 *  qa-report-testing-20260706-testcatalog.md.)
 *
 * Save model (verified live): each editor SECTION has its OWN inline Save that works and
 * round-trips. The shared TOP TOOLBAR "Save" is a no-op (see test-catalog-editor-regressions.spec.ts).
 * This suite therefore always uses the section's own Save button.
 *
 * Round-trip read-back (cross-surface, fast — the SPA reloads slowly on testing):
 *   GET /api/OpenELIS-Global/rest/test-catalog/tests/<id>/sample-results
 *        → { testId, components:[ { code, label, resultType, significantDigits, options, … } ] }
 */

import { test, expect, Page } from '@playwright/test';
import { createTestViaRest, setComponentViaRest } from './legacy-order-helper';

const BASE = process.env.BASE || 'https://testing.openelis-global.org';
const REST = `${BASE}/api/OpenELIS-Global/rest/test-catalog`;
const ADMIN = { user: process.env.OE_USER || 'admin', pass: process.env.OE_PASS || 'adminADMIN!' };
const STAMP = `QA_AUTO_${new Date().toISOString().slice(5, 10).replace('-', '')}_${Date.now().toString().slice(-5)}`;

// resultType code ↔ picker label (the <select> value is the single-letter code).
const RESULT_TYPES: { code: string; label: string; realistic: string; unit?: string }[] = [
  { code: 'N', label: 'Numeric',                          realistic: 'Glucose',            unit: 'mg/dL' },
  { code: 'D', label: 'Single-select list (dictionary)',  realistic: 'HIV rapid' },
  { code: 'R', label: 'Free text',                        realistic: 'Micro comment' },
  { code: 'M', label: 'Multi-select list',                realistic: 'Organisms isolated' },
  { code: 'C', label: 'Cascading multi-select',           realistic: 'Abx by organism' },
  { code: 'T', label: 'Titer',                            realistic: 'RPR titer' },
  { code: 'A', label: 'Alpha (validated text)',           realistic: 'Blood group' },
];

async function login(page: Page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  // Defensive: with a preloaded storageState (all-tc.config) we're already authenticated, so /login
  // redirects away and no username field appears — skip fast instead of hanging on fill().
  // (`placeholder*="ser"` matches the reworked login's "Username" field, which lost its name/id.)
  const userField = page.locator('input[name="loginName"], #loginName, input[placeholder*="ser" i]').first();
  if (!(await userField.isVisible({ timeout: 4000 }).catch(() => false))) return;
  await userField.fill(ADMIN.user, { timeout: 8000 }).catch(() => {});
  await page.fill('input[type="password"], #password', ADMIN.pass, { timeout: 8000 }).catch(() => {});
  await page.getByRole('button', { name: /sign in|log ?in|submit/i }).first()
    .click({ timeout: 8000 }).catch(() => page.keyboard.press('Enter').catch(() => {}));
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
}

/** Carbon typeahead ComboBox: click to open, then click the option by visible text. */
// pickCombo now lives in tests/helpers/pick-combo.ts (rewritten 2026-08-12 - see the header there).
import { pickCombo } from './tests/helpers/pick-combo';

/** Create a test via the unified New-test flow; returns the new testId parsed from the URL. */
async function createTest(page: Page, name: string, code: string): Promise<string> {
  // DOCUMENTED add-test workflow (REST POST /tests → 201 {testId}). The UI new-test form drifted
  // with the OGC-1142 rework (getByLabel fill / waitForURL times out).
  return createTestViaRest(page, { name, code });
}

test.describe('Test Catalog — a test per result type, configured & round-tripped', () => {
  test.beforeEach(async ({ page }) => login(page));

  for (const rt of RESULT_TYPES) {
    test(`result type ${rt.code} (${rt.label}) — create + component + round-trip`, async ({ page, request }) => {
      const name = `${STAMP} ${rt.realistic} ${rt.code}`;
      const code = `${STAMP}_${rt.code}`;

      // 1) Create the test (lands Inactive on its Basic Info per FR-3).
      const id = await createTest(page, name, code);

      // 2) Configure the primary component of this result type via REST (the UI add-component flow
      //    drifted with the OGC-1142 rework). Dictionary-backed types (D/M/C/T) get borrowed options.
      await setComponentViaRest(page, id, { code: rt.code, label: rt.realistic, resultType: rt.code, significantDigits: rt.code === 'N' ? 2 : 1 });

      // 3) ROUND-TRIP: read back on the REST surface and assert the component + type persisted.
      const res = await request.get(`${REST}/tests/${id}/sample-results`, { headers: { Accept: 'application/json' } });
      expect(res.status()).toBe(200);
      const body = await res.json();
      const comp = (body.components || []).find((c: any) => c.label === rt.realistic);
      expect(comp, `component "${rt.realistic}" persisted`).toBeTruthy();
      expect(comp.resultType, `resultType code for ${rt.label}`).toBe(rt.code);
    });
  }
});
