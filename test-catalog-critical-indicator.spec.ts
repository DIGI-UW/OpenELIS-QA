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

const BASE = process.env.BASE || 'https://testing.openelis-global.org';
const REST = `${BASE}/api/OpenELIS-Global/rest`;
const TC = `${REST}/test-catalog`;
const ADMIN = { user: process.env.OE_USER || 'admin', pass: process.env.OE_PASS || 'adminADMIN!' };
const STAMP = `QA_AUTO_${new Date().toISOString().slice(5, 10).replace('-', '')}`;
const BIOCHEM = 'Biochemistry';
const PANEL = process.env.OE_PANEL || 'Bilan Biochimique';   // existing Serum panel → rides into Add Order
const ABNORMAL = '120';   // > normal-high 100, < critical-high 150  → abnormal, not critical
const CRITICAL = '200';   // > critical-high 150                     → critical

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

/** Create a numeric test with a single component; returns its id. */
async function createNumericTest(page: Page, name: string, code: string): Promise<string> {
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

  await page.goto(`${BASE}/MasterListsPage/TestCatalogEditor/${id}/sample-results`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /add component/i }).first().click();
  await page.getByLabel('Component code', { exact: false }).first().fill('VAL');
  await page.getByLabel('Component label', { exact: false }).first().fill('Value');
  // numeric is the default primary card; no chooser action needed
  await page.getByRole('button', { name: /^Save$/ }).last().click();
  await page.waitForTimeout(1000);
  return id;
}

/** Add a Normal 5-100 / Critical 2-150 range (Any age) via the ranges section. */
async function setNormalCriticalRange(page: Page, id: string) {
  await page.goto(`${BASE}/MasterListsPage/TestCatalogEditor/${id}/ranges`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /add range/i }).first().click();
  // Add/Edit-range dialog: fill the Normal + Critical low/high fields by their labels.
  const fill = async (labelRe: RegExp, v: string) => {
    const f = page.getByLabel(labelRe).first();
    if (await f.count()) { await f.fill(v); }
  };
  await fill(/low.*normal|normal.*low/i, '5');
  await fill(/high.*normal|normal.*high/i, '100');
  await fill(/low.*critical|critical.*low/i, '2');
  await fill(/high.*critical|critical.*high/i, '150');
  // Save the dialog, then the section.
  await page.getByRole('button', { name: /^(Add|Save|Apply|OK)$/ }).last().click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /^Save$/ }).last().click();
  await page.waitForTimeout(1200);
}

/** Place a Serum order carrying `panelName`; returns the accession. (Mirrors the titer spec.) */
async function placeSerumOrder(page: Page, panelName: string): Promise<string> {
  await page.goto(`${BASE}/order/enter`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /generate lab number/i }).click();
  const labInput = page.getByPlaceholder(/enter or generate lab number/i);
  await expect(labInput).not.toHaveValue('', { timeout: 10_000 });
  const accession = await labInput.inputValue();
  await page.getByRole('button', { name: /^New Patient$/ }).click();
  await page.getByPlaceholder(/nationality identifier/i).fill(`QA${Date.now()}`);
  await page.getByPlaceholder(/last name/i).first().fill('QACrit');
  await page.getByPlaceholder(/first name/i).first().fill('Cval');
  await page.getByPlaceholder(/dd\/mm\/yyyy/i).first().fill('02/02/1985');
  await page.getByRole('radio', { name: /^Male$/ }).check();
  await page.locator('#sampleType-0').selectOption({ label: 'Serum' });
  await page.waitForTimeout(600);
  await page.getByRole('checkbox', { name: panelName, exact: false }).check({ force: true })
    .catch(async () => { await page.getByText(panelName, { exact: true }).first().click(); });
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: /^Save & Next$/ }).click();
  await page.waitForURL(/\/order\/collect/, { timeout: 20_000 });
  return accession;
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

    // 2. activate + ride the panel into Add Order
    await page.goto(`${BASE}/MasterListsPage/TestCatalogEditor/${id}/basic-info`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('switch', { name: /active/i }).first().click().catch(() => {});
    await page.waitForTimeout(1000);
    await page.goto(`${BASE}/MasterListsPage/TestCatalogEditor/${id}/panels`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    await pickCombo(page, 'Add to panel', PANEL);
    await page.getByRole('button', { name: /^Save$/ }).last().click();
    await page.waitForTimeout(1200);

    // 3. place the order
    const accession = await placeSerumOrder(page, PANEL);

    // 4. Results → By Order: enter ABNORMAL, capture signature; enter CRITICAL, capture signature
    await page.goto(`${BASE}/result?type=order&doRange=false`, { waitUntil: 'domcontentloaded' });
    await page.getByPlaceholder(/accession/i).fill(accession);
    await page.getByRole('button', { name: /^Search$/ }).click();
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
