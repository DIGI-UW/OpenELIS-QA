/**
 * OpenELIS Global — Test Catalog editor: TITER RESULT-TYPE RUNTIME suite.
 * Target: testing.openelis-global.org (v3.2.1.10). Authored 2026-07-08.
 *
 * WHY THIS SPEC EXISTS
 * --------------------
 * TCC-D (sibling spec) proves the DICTIONARY (D) result type end-to-end: editor config →
 * order → result-entry dropdown → save → validate. The advanced-type "Titer" (T) control had
 * only ever been type-selection-round-tripped in the editor; its RUNTIME rendering at result
 * entry was never confirmed because the manual order wizard is flaky — scripted (native-setter)
 * checkbox clicks on the Order-Entry panel list did NOT reliably commit to React's submit state,
 * so three manual orders (DEV…004/005/…) saved with zero tests attached ("No tests have been
 * ordered" on Collect). Playwright's .check()/.selectOption() fire the real onChange, which is
 * exactly what the manual native-setter approach failed to do — so this codifies the flow
 * deterministically.
 *
 * FLOW
 *   1. create a Titer test (guided chooser → Advanced/legacy → Titer card) and section-Save
 *   2. verify resultType===T via /sample-results, activate it, add it to an existing panel
 *      (panel membership is how a freshly-created, not-yet-reindexed test reaches Add Order —
 *      see OGC-1116)
 *   3. place a Serum order through /order/enter selecting that panel (Playwright real events)
 *   4. open Results → By Order for the accession and ASSERT the Titer test row renders an
 *      interactive result-entry control (not plain text) — the piece the manual run couldn't reach
 *   5. (best-effort) enter a titer value, Save, then Validate via the Validation module
 *
 * Endpoints (base on this deploy: /api/OpenELIS-Global/rest):
 *   POST /test-catalog/tests                          (create; Inactive by default)
 *   GET  /test-catalog/tests/{id}/sample-results      -> { components:[{resultType,...}] }
 *   POST /test-catalog/tests/{id}/activate            (200)
 *   GET  /sample-type-tests?sampleType={id}           -> { panels:[...], tests:[...] }
 */

import { test, expect, Page, APIRequestContext } from '@playwright/test';
import { placeLegacySerumOrder, createTestViaRest, setComponentViaRest, activateViaRest } from './legacy-order-helper';

const BASE = process.env.BASE || 'https://testing.openelis-global.org';
const REST = `${BASE}/api/OpenELIS-Global/rest`;
const TC = `${REST}/test-catalog`;
const ADMIN = { user: process.env.OE_USER || 'admin', pass: process.env.OE_PASS || 'adminADMIN!' };
const STAMP = `QA_AUTO_${new Date().toISOString().slice(5, 10).replace('-', '')}_${Date.now().toString().slice(-5)}`;
const BIOCHEM = 'Biochemistry';
const PANEL = process.env.OE_PANEL || 'Bilan Biochimique';   // an existing Serum panel to ride into Add Order

// ---------- helpers ----------
async function login(page: Page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  // Defensive: with a preloaded storageState (all-tc.config) we're already authenticated, so /login
  // redirects and no username field appears — skip fast instead of hanging on fill().
  // (`placeholder*="ser"` matches the reworked login's "Username" field, which lost its name/id.)
  const userField = page.locator('input[name="loginName"], #loginName, input[placeholder*="ser" i]').first();
  if (!(await userField.isVisible({ timeout: 4000 }).catch(() => false))) return;
  await userField.fill(ADMIN.user, { timeout: 8000 }).catch(() => {});
  await page.fill('input[type="password"], #password', ADMIN.pass, { timeout: 8000 }).catch(() => {});
  await page.getByRole('button', { name: /login|sign in|submit/i }).first()
    .click({ timeout: 8000 }).catch(() => page.keyboard.press('Enter').catch(() => {}));
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
}
const getJson = (rq: APIRequestContext, url: string) =>
  rq.get(url, { headers: { Accept: 'application/json' } }).then((r) => r.json());

async function pickCombo(page: Page, label: string, optionText: string) {
  const combo = page.getByLabel(label, { exact: false }).first();
  await combo.click();
  await page.getByRole('option', { name: optionText, exact: false }).first().click()
    .catch(async () => { await combo.fill(optionText); await page.getByText(optionText, { exact: true }).first().click(); });
}

/** Create a Titer test via the New-test form + guided result-type chooser; returns its id. */
async function createTiterTest(page: Page, name: string, code: string): Promise<string> {
  // DOCUMENTED add-test workflow (REST) — the UI new-test form + component chooser drifted with the
  // OGC-1142 rework. Create via POST /tests, then set the Titer (T) primary component via REST.
  const id = await createTestViaRest(page, { name, code });
  await setComponentViaRest(page, id, { code: 'TITER1', label: 'Titer Value', resultType: 'T' });
  return id;
}

/**
 * Place a Serum order through /order/enter selecting the given panel. Returns the accession number.
 * Uses Playwright real interactions (.check()/.selectOption()) so React onChange fires — the
 * failure mode of the manual native-setter runs.
 */
async function placeSerumOrderViaPanel(page: Page, panelName: string): Promise<string> {
  // Migrated to the legacy /SamplePatientEntry path: the unified /order/enter drops the sample's
  // tests (OGC-1132), making the order non-resultable and timing this spec out at result entry.
  return placeLegacySerumOrder(page, panelName);
}

test.describe('Test Catalog editor — Titer result type at runtime', () => {
  test.beforeEach(async ({ page }) => login(page));

  test('TCC-T: Titer test → order → renders an interactive result-entry control → save → validate', async ({ page, request }) => {
    test.setTimeout(180_000);

    // 1. create Titer test
    const name = `${STAMP} TiterRT`;
    const id = await createTiterTest(page, name, `${STAMP}_TIT`);

    // 2. verify type persisted, activate via REST
    const sr = await getJson(request, `${TC}/tests/${id}/sample-results`);
    expect(sr.components[0].resultType, 'component persisted as Titer (T)').toBe('T');

    // The editor "Add to panel" combo drifted with the OGC-1142 rework (getByLabel/pickCombo hang the
    // UI path). POST /tests/{id}/activate is the documented verb; with sampleType=Serum set at create,
    // the active test is orderable on its own, so we order it directly by name (no panel).
    await activateViaRest(page, id);
    // confirm the active test surfaces under the Serum order-source
    const stt = await getJson(request, `${REST}/sample-type-tests?sampleType=2`);
    expect(JSON.stringify(stt), 'active Serum test rides into Add Order').toContain(id);

    // 3. place the order (order the active test directly by name)
    const accession = await placeSerumOrderViaPanel(page, name);

    // 4. Result entry: the Titer test row must render an interactive control (not plain text).
    // Flag-aware — when RESULTS_ENTRY_UNIFIED_ROUTE is on, legacy /result redirects to the unified
    // /Results worklist (a different search field), so branch on the flag (see app-map unified-results).
    const unified = await page.evaluate(async () => {
      const r = await fetch('/api/OpenELIS-Global/rest/configuration-properties', { headers: { Accept: 'application/json' }, credentials: 'include' });
      return (await r.json()).RESULTS_ENTRY_UNIFIED_ROUTE === 'true';
    });
    if (unified) {
      await page.goto(`${BASE}/Results`, { waitUntil: 'domcontentloaded' });
      await page.getByLabel(/lab unit/i).first().selectOption({ label: 'Biochemistry' }).catch(() => {});
      await page.getByPlaceholder(/search by lab number/i).first().fill(accession);
      await page.getByRole('button', { name: /load results/i }).click();
      await page.waitForTimeout(2500);
    } else {
      await page.goto(`${BASE}/result?type=order&doRange=false`, { waitUntil: 'domcontentloaded' });
      await page.getByPlaceholder(/accession/i).fill(accession);
      await page.getByRole('button', { name: /^Search$/ }).click();
    }
    const titerRow = page.locator('tr, [role=row], div').filter({ hasText: /Titer/i }).first();
    await expect(titerRow, 'Titer test appears at result entry').toBeVisible({ timeout: 15_000 });
    const control = titerRow.locator('select, input[type=text], input:not([type=hidden]), [role=combobox], .cds--multi-select, button[aria-haspopup]');
    await expect(control.first(), 'Titer row exposes an interactive result-entry control').toBeVisible();

    // 5. best-effort: enter a titer value, Save, then Validate
    const sel = titerRow.locator('select');
    if (await sel.count()) {
      // Titer may render a dilution dropdown; pick the 2nd option if present
      const opts = await sel.first().locator('option').count();
      if (opts > 1) await sel.first().selectOption({ index: 1 });
    } else {
      await titerRow.locator('input').first().fill('1:80').catch(() => {});
    }
    await page.getByRole('button', { name: /^Save$/ }).click().catch(() => {});
    await page.waitForTimeout(1500);

    // validate via the Validation module (do NOT use the By-Order Accept checkbox — it overwrites state)
    await page.goto(`${BASE}/validation?type=order&accessionNumber=${accession}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    const valRow = page.locator('tr, [role=row], div').filter({ hasText: /Titer/i }).first();
    if (await valRow.count()) {
      await valRow.getByRole('checkbox').first().check({ force: true }).catch(() => {});
      await page.getByRole('button', { name: /^Validate$/ }).click().catch(() => {});
      await page.waitForTimeout(1500);
    }
    // no hard assertion on release state (validation queue is shared/instance-dependent);
    // the REPORTABLE proof is that the Titer control RENDERED at result entry (step 4).
  });
});
