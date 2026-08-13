/**
 * OpenELIS Global — Critical-vs-Abnormal result indicator GUARD (OGC-1121).
 * Target: testing.openelis-global.org. Authored 2026-07-08 (fleshes out the TCG-02 fixme
 * in test-catalog-downstream.spec.ts, now that the Playwright order-flow is proven by
 * test-catalog-titer-runtime.spec.ts).
 *
 * BUG (OGC-1121, patient safety): at Results entry a value beyond the CRITICAL range renders
 * with the SAME styling as a merely-abnormal value (both plain yellow rgb(255,255,160),
 * aria-invalid=null, no icon/title/class) — there is no distinct critical indicator.
 *
 * GUARD SEMANTICS (flip-when-fixed): this test drives the real UI (Playwright events fire React
 * onChange — the fidelity point: native-setter/JS clicks are NOT trusted for this), enters an
 * ABNORMAL value then a CRITICAL value into the same result cell, captures each cell's rendered
 * "signature" (backgroundColor + className + title + aria-invalid + nearby icon/text), and asserts
 * they are IDENTICAL. While the bug is present the signatures match → PASS. When a distinct critical
 * marker ships, the signatures differ → this test FAILS, prompting closure of OGC-1121.
 *
 * SELF-CONTAINED: creates its own numeric test, sets Normal 5-100 / Critical 2-150, activates,
 * rides an existing panel into Add Order (OGC-1116 workaround), places a Serum order, and reads
 * the result cell at Results -> By Order. Cleans nothing destructively (deactivate-only lifecycle).
 *
 * FIRST-RUN NOTE: the Results-entry cell selector + the range Add-dialog selectors are the only
 * UI-fragile parts; if the build markup shifts, tune RESULT_CELL / range dialog locators. The
 * ranges are verified via the /ranges REST read-back before the UI comparison runs, so a range-setup
 * failure fails loudly rather than silently mis-testing.
 */

import { test, expect, Page, APIRequestContext } from '@playwright/test';
import { placeLegacySerumOrder, createTestViaRest, setComponentViaRest, setNormalCriticalRangeViaRest, activateViaRest, openResultEntryByAccession } from './legacy-order-helper';

const BASE = process.env.BASE || 'https://testing.openelis-global.org';
const REST = `${BASE}/api/OpenELIS-Global/rest`;
const TC = `${REST}/test-catalog`;
const ADMIN = { user: process.env.OE_USER || 'admin', pass: process.env.OE_PASS || 'adminADMIN!' };
const STAMP = `QA_AUTO_${new Date().toISOString().slice(5, 10).replace('-', '')}_${Date.now().toString().slice(-5)}`;
const BIOCHEM = 'Biochemistry';
const PANEL = process.env.OE_PANEL || 'Bilan Biochimique';   // existing Serum panel → rides into Add Order
const ABNORMAL = '120';   // > normal-high 100, < critical-high 150  → abnormal, not critical
const CRITICAL = '200';   // > critical-high 150                     → critical

async function login(page: Page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  // With a preloaded storageState (guards.config.ts) we're already authenticated, so /login
  // redirects away and no username field appears — skip fast instead of hanging on fill().
  const userField = page.locator('input[name="loginName"], #loginName, input[placeholder*="ser" i]').first();
  if (!(await userField.isVisible({ timeout: 4000 }).catch(() => false))) return;
  // Short timeouts + catches: the testing login page intermittently hangs ("Loginloading"); never
  // let that stall a test for 150s — storageState already authenticates us.
  await userField.fill(ADMIN.user, { timeout: 8000 }).catch(() => {});
  await page.fill('input[type="password"], #password', ADMIN.pass, { timeout: 8000 }).catch(() => {});
  await page.getByRole('button', { name: /login|sign in|submit/i }).first()
    .click({ timeout: 8000 }).catch(() => page.keyboard.press('Enter').catch(() => {}));
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
}

/** SPA-safe navigation: tolerate net::ERR_ABORTED from a client-side redirect during goto + retry. */
async function nav(page: Page, url: string) {
  for (let i = 0; i < 3; i++) {
    try { await page.goto(url, { waitUntil: 'domcontentloaded' }); return; }
    catch (e) { if (!/ERR_ABORTED|interrupted|frame was detached|navigation/i.test(String(e))) throw e; await page.waitForTimeout(1200); }
  }
  await page.goto(url, { waitUntil: 'commit' }).catch(() => {});
  await page.waitForTimeout(800);
}
const getJson = (rq: APIRequestContext, url: string) =>
  rq.get(url, { headers: { Accept: 'application/json' } }).then((r) => r.json());
// pickCombo now lives in tests/helpers/pick-combo.ts (rewritten 2026-08-12 - see the header there).
import { pickCombo } from './tests/helpers/pick-combo';

/** Create a numeric test with a single component; returns its id. */
async function createNumericTest(page: Page, name: string, code: string): Promise<string> {
  // DOCUMENTED add-test workflow (REST POST /tests → 201 {testId}). The UI
  // /TestCatalogEditor/new/basic-info form drifted with the OGC-1142 rework (getByLabel fill /
  // waitForURL times out); the editor subpages below still work, so only the create is swapped.
  const id = await createTestViaRest(page, { name, code });
  // Configure the numeric primary component via REST (the UI add-component flow drifted with OGC-1142).
  await setComponentViaRest(page, id, { code: 'VAL', label: 'Value', resultType: 'N' });
  return id;
}

/** Add a Normal 5-100 / Critical 2-150 range (Any age) via the ranges section. */
async function setNormalCriticalRange(page: Page, id: string) {
  // Set Normal 5-100 / Critical 2-150 via REST (the UI ranges dialog drifted with OGC-1142).
  await setNormalCriticalRangeViaRest(page, id, { lowNormal: 5, highNormal: 100, lowCritical: 2, highCritical: 150 });
}

/** Place a Serum order carrying `panelName`; returns the accession. (Mirrors the titer spec.) */
async function placeSerumOrder(page: Page, panelName: string): Promise<string> {
  // Migrated to the legacy /SamplePatientEntry path: the unified /order/enter drops the sample's
  // tests (OGC-1132), making the order non-resultable and timing this spec out at result entry.
  return placeLegacySerumOrder(page, panelName);
}

/** Capture the rendered "signature" of the result input cell for the given test name. */
async function cellSignature(page: Page, testName: string) {
  const row = page.locator('tr, [role=row], div').filter({ hasText: testName }).first();
  const input = row.locator('input[type=text], input:not([type=checkbox]):not([type=radio]):not([type=hidden])').first();
  return { row, input };
}

test.describe('OGC-1121 — critical vs abnormal result indicator (patient safety) [GUARD]', () => {
  test.beforeEach(async ({ page }) => login(page));

  test('TCG-02: a CRITICAL value is styled identically to an ABNORMAL value at result entry (bug present → PASS; flips when a distinct critical marker ships)', async ({ page, request }) => {
    test.setTimeout(180_000);
    const name = `${STAMP} Critical`;

    // 1. create numeric test + Normal 5-100 / Critical 2-150, verify via REST read-back
    const id = await createNumericTest(page, name, `${STAMP}_CRIT`);
    await setNormalCriticalRange(page, id);
    const ranges = (await getJson(request, `${TC}/tests/${id}/ranges`)).ranges || [];
    const r = ranges[0] || {};
    expect(Number(r.lowNormal), 'normal low persisted').toBe(5);
    expect(Number(r.highNormal), 'normal high persisted').toBe(100);
    expect(Number(r.lowCritical), 'critical low persisted').toBe(2);
    expect(Number(r.highCritical), 'critical high persisted').toBe(150);

    // 2. activate via REST. The editor's activate switch + "Add to panel" combo drifted with the
    //    OGC-1142 rework and hang the UI path (getByLabel/pickCombo time out); POST /tests/{id}/activate
    //    is the documented verb. createTestViaRest set sampleType=Serum, so once active the test is
    //    orderable on its own — no panel needed; we order it directly by name below.
    await activateViaRest(page, id);

    // 3. place the order (order the active test directly by name)
    const accession = await placeSerumOrder(page, name);

    // 4. Result entry: enter ABNORMAL, capture signature; enter CRITICAL, capture signature.
    // Flag-aware — with RESULTS_ENTRY_UNIFIED_ROUTE on, legacy /result redirects to the unified
    // /Results worklist (search-by-lab-number, not the "accession" field). openResultEntryByAccession
    // branches on the flag and loads results either way (see app-map unified-results).
    await openResultEntryByAccession(page, accession, 'Biochemistry');
    await page.waitForLoadState('networkidle').catch(() => {});
    const { row, input } = await cellSignature(page, name);
    await expect(input, 'numeric result input renders for the test').toBeVisible({ timeout: 20_000 });

    const sigOf = async () => {
      const bg = await input.evaluate((el) => getComputedStyle(el as HTMLElement).backgroundColor);
      const cls = await input.evaluate((el) => (el as HTMLElement).className);
      const title = await input.evaluate((el) => (el as HTMLElement).getAttribute('title') || '');
      const aria = await input.evaluate((el) => (el as HTMLElement).getAttribute('aria-invalid'));
      const rowText = (await row.innerText().catch(() => '')) || '';
      const hasCritWord = /critical|panic|HH|LL/i.test(rowText);
      const iconCount = await row.locator('svg, [class*=icon], [class*=warn], [class*=danger], [class*=critical]').count();
      return { bg, cls, title, aria, hasCritWord, iconCount };
    };

    await input.fill(ABNORMAL);
    await input.blur().catch(() => {});
    await page.waitForTimeout(500);
    const abn = await sigOf();

    await input.fill(CRITICAL);
    await input.blur().catch(() => {});
    await page.waitForTimeout(500);
    const crit = await sigOf();

    // GUARD: while OGC-1121 is present the two signatures are identical (no distinct critical marker).
    // When a critical marker ships (different color/class/title/icon/HH-LL text), these differ and the
    // test FAILS — that is the signal to close OGC-1121. Attach both signatures for the report.
    await test.info().attach('abnormal-signature', { body: JSON.stringify(abn, null, 2), contentType: 'application/json' });
    await test.info().attach('critical-signature', { body: JSON.stringify(crit, null, 2), contentType: 'application/json' });

    const identical =
      abn.bg === crit.bg &&
      abn.cls === crit.cls &&
      abn.title === crit.title &&
      abn.aria === crit.aria &&
      abn.hasCritWord === crit.hasCritWord &&
      abn.iconCount === crit.iconCount &&
      !crit.hasCritWord;   // and no critical wording appeared for the critical value

    expect(identical,
      'OGC-1121 present: critical value renders identically to abnormal (no distinct critical indicator). ' +
      'When a critical marker ships this flips to false → update/close the ticket.').toBe(true);
  });
});
