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

const BASE = process.env.BASE || 'https://testing.openelis-global.org';
const REST = `${BASE}/api/OpenELIS-Global/rest`;
const TC = `${REST}/test-catalog`;
const ADMIN = { user: process.env.OE_USER || 'admin', pass: process.env.OE_PASS || 'adminADMIN!' };
const STAMP = `QA_AUTO_${new Date().toISOString().slice(5, 10).replace('-', '')}`;
const BIOCHEM = 'Biochemistry';
const PANEL = process.env.OE_PANEL || 'Bilan Biochimique';   // an existing Serum panel to ride into Add Order

// ---------- helpers ----------
async function login(page: Page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[name="loginName"], #loginName, input[placeholder*="ser" i]', ADMIN.user);
  await page.fill('input[type="password"], #password', ADMIN.pass);
  await page.getByRole('button', { name: /login|sign in|submit/i }).first()
    .click().catch(() => page.keyboard.press('Enter'));
  await page.waitForLoadState('networkidle').catch(() => {});
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
  await page.goto(`${BASE}/MasterListsPage/TestCatalogEditor/new/basic-info`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Test name', { exact: false }).first().fill(name);
  await page.getByLabel('Reporting name', { exact: false }).first().fill(name);
  const codeField = page.getByLabel('Test code', { exact: false }).first();
  await codeField.click(); await codeField.fill(code);
  await pickCombo(page, 'Lab Unit', BIOCHEM);
  await pickCombo(page, 'Sample type', 'Serum');
  await page.getByRole('button', { name: /^Save$/ }).last().click();
  await page.waitForURL(/\/TestCatalogEditor\/\d+\/basic-info/, { timeout: 30_000 });
  const id = page.url().match(/TestCatalogEditor\/(\d+)\//)![1];

  // Sample & Results: add a Titer component
  await page.goto(`${BASE}/MasterListsPage/TestCatalogEditor/${id}/sample-results`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /add component/i }).first().click();
  await page.getByLabel('Component code', { exact: false }).first().fill('TITER1');
  await page.getByLabel('Component label', { exact: false }).first().fill('Titer Value');
  // reveal advanced/legacy types, then choose the Titer card (unique description text)
  await page.getByRole('button', { name: /advanced \/ legacy types/i }).click();
  await page.getByText(/dilution ratio such as/i).click();   // the Titer tile
  await page.getByRole('button', { name: /^Save$/ }).last().click();  // section Save
  await page.waitForTimeout(1200);
  return id;
}

/**
 * Place a Serum order through /order/enter selecting the given panel. Returns the accession number.
 * Uses Playwright real interactions (.check()/.selectOption()) so React onChange fires — the
 * failure mode of the manual native-setter runs.
 */
async function placeSerumOrderViaPanel(page: Page, panelName: string): Promise<string> {
  await page.goto(`${BASE}/order/enter`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);

  // Lab number
  await page.getByRole('button', { name: /generate lab number/i }).click();
  const labInput = page.getByPlaceholder(/enter or generate lab number/i);
  await expect(labInput).not.toHaveValue('', { timeout: 10_000 });
  const accession = await labInput.inputValue();

  // Sample category defaults to Clinical. New patient:
  await page.getByRole('button', { name: /^New Patient$/ }).click();
  await page.getByPlaceholder(/nationality identifier/i).fill(`QA${Date.now()}`);
  await page.getByPlaceholder(/last name/i).first().fill('QATiter');
  await page.getByPlaceholder(/first name/i).first().fill('Tval');
  await page.getByPlaceholder(/dd\/mm\/yyyy/i).first().fill('02/02/1985');
  await page.getByRole('radio', { name: /^Male$/ }).check();

  // Sample type -> Serum (native select #sampleType-0)
  await page.locator('#sampleType-0').selectOption({ label: 'Serum' });
  await page.waitForTimeout(600);

  // Order Panels: check the panel by row — .check() fires onChange (the crux)
  const panelRow = page.locator('div,li,label').filter({ hasText: new RegExp(`^\\s*${panelName}\\s*$`) }).first();
  await panelRow.getByRole('checkbox').check({ force: true })
    .catch(async () => { await page.getByText(panelName, { exact: true }).first().click(); });
  await page.waitForTimeout(800);

  // sanity: the panel members should now show as Order-Tests chips before we commit
  await expect(page.getByText(panelName, { exact: true }).first()).toBeVisible();

  // Save & Next (Enter Order -> Collect). Guard: it must actually advance.
  await page.getByRole('button', { name: /^Save & Next$/ }).click();
  await page.waitForURL(/\/order\/collect/, { timeout: 20_000 });

  return accession;
}

test.describe('Test Catalog editor — Titer result type at runtime', () => {
  test.beforeEach(async ({ page }) => login(page));

  test('TCC-T: Titer test → order → renders an interactive result-entry control → save → validate', async ({ page, request }) => {
    test.setTimeout(180_000);

    // 1. create Titer test
    const id = await createTiterTest(page, `${STAMP} TiterRT`, `${STAMP}_TIT`);

    // 2. verify type persisted, activate, add to panel
    const sr = await getJson(request, `${TC}/tests/${id}/sample-results`);
    expect(sr.components[0].resultType, 'component persisted as Titer (T)').toBe('T');

    await request.post(`${TC}/tests/${id}/activate`, { headers: { Accept: 'application/json' } });
    await page.goto(`${BASE}/MasterListsPage/TestCatalogEditor/${id}/panels`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    await pickCombo(page, 'Add to panel', PANEL);
    await page.getByRole('button', { name: /^Save$/ }).last().click();
    await page.waitForTimeout(1200);
    // confirm the test is reachable through the panel order-source
    const stt = await getJson(request, `${REST}/sample-type-tests?sampleType=2`);
    expect(JSON.stringify(stt.panels || []), 'test rides into Add Order via the panel').toContain(id);

    // 3. place the order (the step the manual wizard kept dropping tests on)
    const accession = await placeSerumOrderViaPanel(page, PANEL);

    // 4. Results → By Order: the Titer test row must render an interactive control (not plain text)
    await page.goto(`${BASE}/result?type=order&doRange=false`, { waitUntil: 'domcontentloaded' });
    await page.getByPlaceholder(/accession/i).fill(accession);
    await page.getByRole('button', { name: /^Search$/ }).click();
    const titerRow = page.locator('tr, [role=row], div').filter({ hasText: /Titer/i }).first();
    await expect(titerRow, 'Titer test appears at result entry').toBeVisible({ timeout: 15_000 });
    const control = titerRow.locator('select, input[type=text], input:not([type=hidden]), [role=combobox]');
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
