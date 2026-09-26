// QC-fail hold on Validation (OGC-1147, accepted) and the misleading release message (OGC-1267).
//
// HOW TO READ A test.fail() HERE
// Each tripwire asserts the SPEC and is marked `test.fail()` while the bug is live. When
// the fix lands it reports "Expected to fail, but passed": delete the `test.fail()` line,
// rename the case "FIXED (OGC-xxxx)", keep the assertion. The canary (QCH-01) exercises the
// same path and must stay green, so a tripwire cannot pass for a harness reason.
//
// EVIDENCE (2026-09-26, pngtest, driven by hand): with qcFailBlocksValidation on, an RDT
// Invalid control recorded from Results Entry raises an NCE and a qcHold; Validation tags the
// row "QC failed" and does NOT release it, but the per-row "Validate & release" answers
// 200 {"outcome":"released"} and toasts "Result validated and released." (OGC-1267). The
// "QC fail (n)" filter chip reads 0 while the row carries the tag.
//
// SETTINGS: turns on qcFailBlocksValidation and resultsEntryUnifiedRoute (Result
// Configuration) for the run and puts back whatever they were in afterAll. Casey approved
// changing settings on testing for this (2026-09-27).
//
// Seeds its own patient and RDT-style order (QA- data, disposable instance). Serial: the
// cases share one order and must run in order.
import { test, expect, type Page, type Browser } from '@playwright/test';
import { BASE, ADMIN, login } from '../helpers/test-helpers';
import { seedModifiableOrder } from '../helpers/data-factory';

const REST = '/api/OpenELIS-Global/rest';
const RDT_TEST = '31'; // "HIV rapid test HIV": dictionary result type, Serum (sample type 2)
const SETTINGS: Record<string, string> = { qcFailBlocksValidation: 'true', resultsEntryUnifiedRoute: 'true' };

test.describe.configure({ mode: 'serial' });
test.setTimeout(300000);

const state: { accession?: string; labUnit?: string; original?: Record<string, string> } = {};

async function getJson(page: Page, p: string): Promise<any> {
  const r = await page.context().request.get(`${BASE}${REST}${p}`, { headers: { Accept: 'application/json' } });
  expect(r.status(), `GET ${p}`).toBe(200);
  return r.json();
}

/** Read a Result Configuration value by name (null when the instance does not have it). */
async function readResultConfig(page: Page, name: string): Promise<{ id: string; value: string } | null> {
  const menu = await getJson(page, '/ResultConfigurationMenu');
  const row = (menu.menuList || []).find((m: any) => m.name === name);
  return row ? { id: String(row.id), value: String(row.value) } : null;
}

/**
 * Set a Result Configuration value through the endpoint the admin edit screen posts to
 * (GenericConfigEdit: GET/POST /rest/ResultConfiguration?ID=<id> with the edited record).
 */
async function setResultConfig(page: Page, name: string, value: string): Promise<void> {
  const cur = await readResultConfig(page, name);
  expect(cur, `Result Configuration has "${name}"`).not.toBeNull();
  if (cur!.value === value) return;
  const record = await getJson(page, `/ResultConfiguration?ID=${cur!.id}`);
  const status = await page.evaluate(
    async ({ rest, id, body }) => {
      const r = await fetch(`${rest}/ResultConfiguration?ID=${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': localStorage.getItem('CSRF') || '' },
        body: JSON.stringify(body),
      });
      return r.status;
    },
    { rest: REST, id: cur!.id, body: { ...record, value } }
  );
  expect(status, `POST ResultConfiguration ${name}=${value}`).toBeLessThan(300);
  expect((await readResultConfig(page, name))!.value, `${name} reads back`).toBe(value);
}

async function restoreSettings(browser: Browser): Promise<void> {
  if (!state.original) return;
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  try {
    await login(page, ADMIN.user, ADMIN.pass);
    for (const [name, value] of Object.entries(state.original)) await setResultConfig(page, name, value);
  } finally {
    await ctx.close();
  }
}

/** The validation row for our order, found by lab number. */
function validationRow(page: Page) {
  // Validation rows are role="row" divs, not table rows.
  return page.getByRole('row').filter({ hasText: state.accession! }).first();
}

async function openValidation(page: Page): Promise<void> {
  await page.goto(`${BASE}/validation?type=routine&testSectionId=${state.labUnit}`);
  await expect(validationRow(page)).toBeVisible({ timeout: 45000 });
}

async function expandValidationRow(page: Page): Promise<void> {
  const row = validationRow(page);
  await row.getByRole('button', { name: 'Expand Row' }).click();
  await expect(page.getByRole('button', { name: /Validate & release/i }).first()).toBeVisible({ timeout: 15000 });
}

test.describe('QC-fail hold on Validation (OGC-1147 / OGC-1267)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test.afterAll(async ({ browser }) => {
    await restoreSettings(browser);
  });

  test('QCH-00 [setup]: settings on, RDT order seeded, result saved, Invalid control recorded in Results Entry', async ({ page }) => {
    // Settings (remember the originals first so afterAll can put them back).
    state.original = {};
    for (const name of Object.keys(SETTINGS)) {
      const cur = await readResultConfig(page, name);
      test.skip(!cur, `this build has no "${name}" setting`);
      state.original[name] = cur!.value;
    }
    for (const [name, value] of Object.entries(SETTINGS)) await setResultConfig(page, name, value);

    const info = await getJson(page, `/test-catalog/tests/${RDT_TEST}/basic-info`);
    state.labUnit = String(info.labUnitId);
    expect(state.labUnit, 'the RDT test has a lab unit').toMatch(/^\d+$/);
    const { accession } = await seedModifiableOrder(page, { testIds: [RDT_TEST] });
    state.accession = accession;

    // Results Entry (unified worklist), filtered by the test's lab unit: the control capture
    // needs testSectionId, which only the Lab Unit filter supplies.
    await page.goto(`${BASE}/Results?testSectionId=${state.labUnit}`);
    const row = page.locator('tr').filter({ hasText: accession }).first();
    await expect(row).toBeVisible({ timeout: 45000 });
    const select = row.locator('select[id^="unifiedResultValue-"]').first();
    await expect(select).toBeVisible({ timeout: 15000 });
    const firstValue = await select.evaluate((s: HTMLSelectElement) =>
      Array.from(s.options).map((o) => o.value).find((v) => v && v !== '0') || ''
    );
    expect(firstValue, 'the dictionary result has at least one option').not.toBe('');
    await select.selectOption(firstValue);
    await row.getByRole('button', { name: /^Save$/ }).click();
    await expect(row).toContainText(/Accepted by technician/i, { timeout: 20000 });

    // Record an Invalid control line from the expanded row. The row may already be open
    // (the page remembers its layout), so expand it only when the section is not showing.
    const qcSection = page.getByRole('button', { name: /Reagents, QC & Controls/ }).first();
    if (!(await qcSection.isVisible().catch(() => false))) await row.locator('button').first().click();
    await expect(qcSection).toBeVisible({ timeout: 15000 });
    const capture = page.getByTestId('qc-capture').first();
    if (!(await capture.isVisible().catch(() => false))) await qcSection.click();
    await expect(capture).toBeVisible({ timeout: 15000 });
    await capture.getByTestId('qc-outcome').selectOption('INVALID');
    await capture.getByTestId('qc-kit-lot').fill('QA-1267-KIT');
    await capture.getByTestId('qc-record').click();
    await expect(page.getByText(/Reporting is blocked for covered results/i).first()).toBeVisible({ timeout: 20000 });
  });

  test('QCH-01 [canary]: the held row is tagged "QC failed" and Validate & release does not release it', async ({ page }) => {
    await openValidation(page);
    await expect(validationRow(page)).toContainText(/QC failed/i, { timeout: 20000 });
    await expandValidationRow(page);
    await page.getByRole('button', { name: /Validate & release/i }).first().click();
    await page.waitForTimeout(3000);
    await openValidation(page); // still in the queue after a fresh load
    await expect(validationRow(page)).toContainText(/QC failed/i);
  });

  test('QCH-02: Validate & release on a held row never says "Result validated and released."', async ({ page }) => {
    // FLIP-WHEN-FIXED (OGC-1267)
    test.fail();
    await openValidation(page);
    await expandValidationRow(page);
    const release = page.getByRole('button', { name: /Validate & release/i }).first();
    const disabled = await release.isDisabled();
    let claimedReleased = false;
    if (!disabled) {
      await release.click();
      // isVisible() does not wait, and the toast arrives after the POST returns: wait for it.
      claimedReleased = await page
        .getByText(/Result validated and released/i)
        .first()
        .waitFor({ state: 'visible', timeout: 8000 })
        .then(() => true)
        .catch(() => false);
    }
    // Either fix is acceptable: the button is disabled on a held row, or the click is refused
    // with a message. What must never happen is a success toast for a release that was withheld.
    expect(claimedReleased, `toast "Result validated and released." on a held row (button disabled: ${disabled})`).toBe(false);
  });

  test('QCH-03: the "QC fail" filter counts the row that is tagged "QC failed"', async ({ page }) => {
    // FLIP-WHEN-FIXED (OGC-1267, related observation)
    test.fail();
    await openValidation(page);
    await expect(validationRow(page)).toContainText(/QC failed/i);
    const chip = page.getByRole('button', { name: /^QC fail \(\d+\)/ }).first();
    await expect(chip).toBeVisible({ timeout: 15000 });
    const n = Number(((await chip.textContent()) || '').match(/\((\d+)\)/)?.[1] ?? '0');
    expect(n, '"QC fail (n)" includes the held row').toBeGreaterThanOrEqual(1);
  });
});
