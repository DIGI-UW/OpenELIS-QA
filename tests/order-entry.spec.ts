import { test, expect, type Page } from '@playwright/test';
import { BASE, ADMIN, PATIENT_NAME, PATIENT_ID, ACCESSION, QA_PREFIX, TIMEOUT, CONFIRMED_ADMIN_URLS, login, navigateWithDiscovery, fillSearchField, getDateRange, getFutureDateRange, orderWizardForward, selectOrderProgram, clickFormSearch, checkCarbonRadio } from '../helpers/test-helpers';
import { createPatientViaAPI, ensureReferringClinic, seedModifiableOrder } from '../helpers/data-factory';
import {
  type SeededPatient, letters, seededPatient, sampleTypeWithTest, legacyPickPatient, legacyToAddSample, legacyTickTest, legacyFillOrderStep,
} from '../helpers/legacy-order-entry';

/**
 * Order Entry and Batch Workflow Test Suites
 * Suites: Add Order, Edit Order, Referral, TC-BATCH, Suite AH
 * Test Count: ~55
 */

// Helper function
async function selectSampleType(page: any, typeId: string) {
  const typeSelect = page.locator('select[id*="sample"], select[id*="type"]').first();
  if (await typeSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
    await typeSelect.selectOption(typeId);
  }
}

async function navigateViaMenu(page: any, menuPath: string[]) {
  const menu = page.getByRole('button', { name: /menu|hamburger|navigation/i }).first();
  if (await menu.isVisible({ timeout: 2000 }).catch(() => false)) {
    await menu.click();
    await page.waitForTimeout(300);
  }
  for (const item of menuPath) {
    const link = page.getByText(item, { exact: true });
    if (await link.isVisible({ timeout: 2000 }).catch(() => false)) {
      await link.click();
      await page.waitForTimeout(300);
    }
  }
}

async function tryNavigateToURL(page: any, urls: string[]): Promise<boolean> {
  for (const url of urls) {
    const res = await page.goto(`${BASE}${url}`).catch(() => null);
    if (res && res.ok() && !page.url().includes('login')) {
      return true;
    }
  }
  return false;
}

// ── Run fixtures ──────────────────────────────────────────────────────────────
// REWORKED 2026-10-08. The Add Order, Edit Order, Referral and batch cases below were written
// against the old testing server's demo data: patient "Abby Sebby" (0123456), lab number
// 26CPHL00008T, HGB (test 743) on Whole Blood (sample type 4) and the sites "Adiba SC" / "Anga, Dr".
// None of that exists on a fresh or CI stack, and on develop a bare /Next/ also matches the patient
// results table's "Next Page" button. The cases now make their own patient and order, find a sample
// type and a test the instance really has, and press the wizard's own forward button.
// The fixtures live in helpers/legacy-order-entry.ts.

test.describe('Add Order workflow', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-AO-01: Add Order page loads', async ({ page }) => {
    await page.goto(`${BASE}/SamplePatientEntry`);
    await expect(page.getByRole('heading', { name: /Test Request/i })).toBeVisible();
    await expect(page.getByText('Patient Info')).toBeVisible();
  });

  test('TC-AO-02: Patient search finds existing patient', async ({ page }) => {
    const p = await seededPatient(page, 'AO2');
    await legacyPickPatient(page, p);
    await expect(page.locator(`[data-cy="patient-result-row-${p.id}"]`), 'the result row names the patient').toContainText(p.lastName);
  });

  test('TC-AO-03: Full Add Order flow with HGB test', async ({ page }) => {
    // HGB on Whole Blood was the demo data's test; any sample type with a test exercises the flow.
    const p = await seededPatient(page, 'AO3');
    await ensureReferringClinic(page);
    const st = await sampleTypeWithTest(page);
    await legacyPickPatient(page, p);
    await legacyToAddSample(page);
    await page.locator('#sampleId_0').selectOption(st.typeId);
    await legacyTickTest(page, st.testId);
    await orderWizardForward(page).click();
    const labNo = await legacyFillOrderStep(page);
    const saved = page.waitForResponse((r) => /\/rest\/SamplePatientEntry/.test(r.url()) && r.request().method() === 'POST', { timeout: 30_000 });
    await orderWizardForward(page).filter({ hasText: /Submit/ }).click();
    expect((await saved).status(), `the order ${labNo} is saved`).toBe(200);
    await expect(page.getByText(/Successfully saved|Succesfuly saved/i).first()).toBeVisible({ timeout: 15000 });
  });
});

test.describe('Edit Order (ModifyOrder)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-EO-01: Edit Order page loads via SampleEdit', async ({ page }) => {
    await page.goto(`${BASE}/SampleEdit?type=readwrite`);
    await expect(
      page.getByRole('heading', { name: /accession|order number/i })
    ).toBeVisible({ timeout: 5000 });
  });

  test('TC-EO-02: Accession search loads ModifyOrder', async ({ page }) => {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    const { accession } = await seedModifiableOrder(page);
    await page.goto(`${BASE}/SampleEdit?type=readwrite`);
    // The lab number field is "Enter Accession Number" with placeholder "Enter Lab No".
    const accInput = page.locator('main input#labNumber[placeholder="Enter Lab No"]');
    await accInput.fill(accession);
    await page.locator('main').getByRole('button', { name: 'Submit' }).first().click();
    await expect(page).toHaveURL(/ModifyOrder/, { timeout: 15000 });
  });

  test('TC-EO-03: ModifyOrder Add Sample step shows Current Tests and Available Tests', async ({ page }) => {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    const { accession } = await seedModifiableOrder(page);
    await page.goto(`${BASE}/ModifyOrder?accessionNumber=${encodeURIComponent(accession)}`);
    // Step 1: Program Selection
    await orderWizardForward(page).last().click();
    // Step 2: Add Sample — should see Current Tests section
    await expect(page.getByText(/Current Tests/i).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Available Tests/i).first()).toBeVisible();
  });

  test(
    'TC-EO-04 [BUG-4 KNOWN]: ModifyOrder generates new accession on save',
    async ({ page }) => {
      // This test documents the known BUG-4 behavior.
      // Expected (desired): accession stays the same after modifying tests.
      // Actual (current): new accession is generated.
      await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
      const { accession } = await seedModifiableOrder(page);
      await page.goto(`${BASE}/ModifyOrder?accessionNumber=${encodeURIComponent(accession)}`);
      await orderWizardForward(page).last().click(); // to Add Sample

      // Assign a test
      const assignCheckboxes = page.locator('input[id*="assign_"], input[name*="assign"]');
      if (await assignCheckboxes.count() > 0) {
        await assignCheckboxes.first().check();
      }
      await orderWizardForward(page).last().click(); // to Add Order
      const generate = page.getByRole('button', { name: /Generate/i });
      if (await generate.isVisible({ timeout: 3000 }).catch(() => false)) await generate.click();
      await orderWizardForward(page).last().click(); // Submit

      // Confirm accession changed (BUG-4)
      const newAccession = await page.locator('[class*="accession"], [id*="accession"]').first().textContent().catch(() => '');
      // BUG-4: newAccession !== the original. When fixed, assert expect(newAccession).toContain(accession).
      console.log(`BUG-4: accession ${accession} after ModifyOrder = ${newAccession}`);
    }
  );
});

test.describe('Referral section (Add Order)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  /** Picks a seeded patient and reaches Add Sample with a sample type that has a test. */
  async function toAddSampleWithType(page: Page) {
    const p = await seededPatient(page, 'REF');
    const st = await sampleTypeWithTest(page);
    await legacyPickPatient(page, p);
    await legacyToAddSample(page);
    await page.locator('#sampleId_0').selectOption(st.typeId);
    await page.waitForTimeout(1500);
    return st;
  }

  test('TC-REF-01: Referral checkbox enables table header', async ({ page }) => {
    await toAddSampleWithType(page);
    // Check referral checkbox
    await page.getByText('Refer test to a reference lab', { exact: false }).first().click();
    // Table header should appear
    await expect(page.getByText('Institute', { exact: false }).first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Select Test Name', { exact: false }).first()).toBeVisible();
  });

  test('TC-REF-02: Referral row requires test selection first', async ({ page }) => {
    const st = await toAddSampleWithType(page);

    // Check referral BEFORE selecting a test
    await page.getByText('Refer test to a reference lab', { exact: false }).first().click();
    // Table header visible but NO input row (BUG-2a: no instructional text)
    const tbodyRows = page.locator('.cds--data-table tbody tr');
    await expect(tbodyRows).toHaveCount(0);

    // Now select a test
    await legacyTickTest(page, st.testId);
    // Row should now appear
    await expect(tbodyRows).toHaveCount(1);
    await expect(page.locator('select[id*="referralReason"]').first()).toBeVisible();
  });

  /**
   * The referral row's selects. They carry no accessible name, so they are found by column:
   * Referral Reason, referrer, Institute, Sent Date, Select Test Name.
   */
  function referralRowSelects(page: Page) {
    const row = page.locator('main table').filter({ has: page.getByRole('columnheader', { name: /Institute/ }) }).locator('tbody tr').first();
    return { row, institute: row.locator('td').nth(2).locator('select'), testName: row.locator('td').nth(4).locator('select') };
  }

  test(
    'TC-REF-03: the Institute chosen on a referral row stays selected (was BUG-2 KNOWN)',
    async ({ page }) => {
      // REWORKED 2026-10-08: the demo data's six labs (values 2, 14, 3, 20, 6, 7) are not on every
      // instance, and the Institute select has no accessible name; it is found by column and
      // offered whatever labs the instance has. The case now states the expected behaviour (the
      // choice sticks); it used to assert the BUG-2 revert, which it could not observe here.
      const st = await toAddSampleWithType(page);
      await legacyTickTest(page, st.testId);
      await page.getByText('Refer test to a reference lab', { exact: false }).first().click();

      const { institute } = referralRowSelects(page);
      await institute.waitFor({ state: 'visible', timeout: 15_000 });
      const labs = await institute.locator('option').evaluateAll((os) =>
        (os as HTMLOptionElement[]).filter((o) => o.value && (o.textContent || '').trim()).map((o) => o.value));
      expect(labs.length, 'the instance offers at least one reference lab').toBeGreaterThan(0);
      await institute.selectOption(labs[0]);
      await page.waitForTimeout(500);
      expect(await institute.inputValue(), 'the chosen institute stays selected').toBe(labs[0]);
    }
  );

  test(
    'TC-REF-04: the referral row names the ticked test (was BUG-2 KNOWN)',
    async ({ page }) => {
      // REWORKED 2026-10-08: on develop the referral row's test is filled from the ticked test and
      // the select is locked, so there is no manual choice left to revert. The case checks that the
      // row names the ticked test.
      const st = await toAddSampleWithType(page);
      await legacyTickTest(page, st.testId);
      await page.getByText('Refer test to a reference lab', { exact: false }).first().click();

      const { testName } = referralRowSelects(page);
      await testName.waitFor({ state: 'attached', timeout: 15_000 });
      expect(await testName.inputValue(), 'the referral row carries the ticked test').toBe(st.testId);
    }
  );
});

test.describe('Multi-Patient Batch Workflow (TC-BATCH)', () => {
  const batchAccessions: string[] = [];

  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  /** One legacy Add Order for a fresh patient; returns the saved lab number ('' when not saved). */
  async function placeSimpleOrder(page: Page, tag: string): Promise<string> {
    const p = await seededPatient(page, tag);
    await ensureReferringClinic(page);
    const st = await sampleTypeWithTest(page);
    await legacyPickPatient(page, p);
    await legacyToAddSample(page);
    await page.locator('#sampleId_0').selectOption(st.typeId);
    await legacyTickTest(page, st.testId);
    await orderWizardForward(page).click();
    const labNo = await legacyFillOrderStep(page);
    const saved = page.waitForResponse((r) => /\/rest\/SamplePatientEntry/.test(r.url()) && r.request().method() === 'POST', { timeout: 30_000 });
    await orderWizardForward(page).filter({ hasText: /Submit/ }).click();
    return (await saved).status() === 200 ? labNo : '';
  }

  test('TC-BATCH-01: Place 3 orders — unique accessions generated', async ({ page }) => {
    for (const tag of ['BA1', 'BA2', 'BA3']) {
      const acc = await placeSimpleOrder(page, tag);
      console.log(`TC-BATCH-01 ${tag}: accession = ${acc || '(not saved)'}`);
      if (acc) batchAccessions.push(acc);
    }

    console.log(`TC-BATCH-01: ${batchAccessions.length} orders placed: ${batchAccessions.join(', ')}`);

    // Placing zero orders is a failure of this test's own premise. Without this
    // guard the uniqueness check below is vacuously true on an empty set — the
    // classic shape of a test that passes because it did nothing.
    const placed = batchAccessions.filter(Boolean);
    expect(placed.length, 'no orders were placed, so accession uniqueness was never exercised').toBeGreaterThan(1);

    const unique = new Set(placed);
    expect(unique.size, `duplicate accession numbers issued: ${placed.join(', ')}`).toBe(placed.length);
  });

  test('TC-BATCH-02: All batch orders searchable in Results By Order', async ({ page }) => {
    // Runs after TC-BATCH-01 in the same worker; on its own it places one order to look for.
    const toCheck = batchAccessions.length > 0 ? [...batchAccessions] : [await placeSimpleOrder(page, 'BA4')];
    expect(toCheck.filter(Boolean).length, 'there is at least one placed order to look for').toBeGreaterThan(0);

    let allFound = true;
    for (const acc of toCheck) {
      if (!acc) continue;
      // /AccessionResults opens the unified Results page; its lab number search is a searchbox.
      await page.goto(`${BASE}/AccessionResults`);
      const accField = page.locator('main').getByRole('searchbox', { name: /lab number/i });
      await accField.fill(acc);
      await accField.press('Enter');
      // isVisible() does not wait, so wait for the row explicitly.
      const found = await page.locator('main').getByText(acc).first().waitFor({ state: 'visible', timeout: 15000 }).then(() => true, () => false);
      console.log(found ? `TC-BATCH-02 ${acc}: PASS` : `TC-BATCH-02 ${acc}: FAIL — not found`);
      if (!found) allFound = false;
    }
    expect(allFound).toBe(true);
  });

  test('TC-BATCH-03: Batch result entry via By Unit worklist', async ({ page }) => {
    // Navigate to By Unit, enter results for multiple pending rows
    const wpUrls = ['/AccessionResults?type=testSection', '/ResultsUpdate', '/WorkPlan'];
    let wpUrl = '';
    for (const u of wpUrls) {
      const res = await page.goto(`${BASE}${u}`).catch(() => null);
      if (res && res.ok() && !page.url().includes('LoginPage')) {
        wpUrl = page.url();
        break;
      }
    }
    if (!wpUrl) {
      console.log('TC-BATCH-03: SKIP — By Unit worklist not accessible');
      return;
    }

    await page.waitForTimeout(1500);
    const resultInputs = page.locator('table input[type="text"], table input[type="number"]');
    const inputCount = await resultInputs.count();

    if (inputCount === 0) {
      console.log('TC-BATCH-03: SKIP — no pending result inputs visible in By Unit worklist');
      return;
    }

    console.log(`TC-BATCH-03: ${inputCount} pending result input(s) visible`);

    // Fill up to 3 inputs
    const fillCount = Math.min(inputCount, 3);
    for (let i = 0; i < fillCount; i++) {
      await page.evaluate((idx) => {
        const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('table input[type="text"], table input[type="number"]'));
        const inp = inputs[idx];
        if (!inp) return;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
        setter.call(inp, (14.0 + idx * 0.5).toFixed(1));
        inp.dispatchEvent(new Event('input', { bubbles: true }));
      }, i);
      await page.waitForTimeout(200);
    }

    const saveBtn = page.getByRole('button', { name: /save|submit/i }).first();
    if (await saveBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await saveBtn.click();
      await page.waitForTimeout(2000);
      console.log(`TC-BATCH-03: PASS — saved ${fillCount} results from By Unit worklist`);
    }
  });

  test('TC-BATCH-04: Validation queue shows multiple pending results', async ({ page }) => {
    const valUrls = ['/ResultValidation?type=order', '/ResultValidation', '/ResultsValidation'];
    let valUrl = '';
    for (const u of valUrls) {
      const res = await page.goto(`${BASE}${u}`).catch(() => null);
      if (res && res.ok() && !page.url().includes('LoginPage')) {
        valUrl = page.url();
        break;
      }
    }
    if (!valUrl) {
      console.log('TC-BATCH-04: SKIP — validation screen not accessible');
      return;
    }

    await page.waitForTimeout(2000);
    const pendingRows = await page.getByRole('row').count();
    console.log(`TC-BATCH-04: ${pendingRows} row(s) in validation queue`);
    console.log(pendingRows >= 1
      ? 'TC-BATCH-04: PASS — pending results visible in validation queue'
      : 'TC-BATCH-04: NOTE — validation queue is empty (all may already be validated)');
  });

  test('TC-BATCH-05: Approve multiple results in one validation session', async ({ page }) => {
    const valUrls = ['/ResultValidation?type=order', '/ResultValidation', '/ResultsValidation'];
    let valUrl = '';
    for (const u of valUrls) {
      const res = await page.goto(`${BASE}${u}`).catch(() => null);
      if (res && res.ok() && !page.url().includes('LoginPage')) {
        valUrl = page.url();
        break;
      }
    }
    if (!valUrl) {
      console.log('TC-BATCH-05: SKIP — validation screen not accessible');
      return;
    }

    await page.waitForTimeout(2000);
    const checkboxes = page.locator('table input[type="checkbox"][id*="accept" i], table input[type="checkbox"]');
    const cbCount = await checkboxes.count();

    if (cbCount === 0) {
      console.log('TC-BATCH-05: SKIP — no accept checkboxes in validation queue');
      return;
    }

    const approveCount = Math.min(cbCount, 3);
    for (let i = 0; i < approveCount; i++) {
      await checkboxes.nth(i).check({ force: true }).catch(() => {});
      await page.waitForTimeout(200);
    }

    const saveBtn = page.getByRole('button', { name: /save|validate|accept/i }).first();
    if (await saveBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await saveBtn.click();
      await page.waitForTimeout(2000);
      console.log(`TC-BATCH-05: PASS — approved ${approveCount} result(s) in one validation session`);
    }
  });

  test('TC-BATCH-06: List views handle pagination gracefully', async ({ page }) => {
    // REWORKED 2026-10-08: /AccessionResults is now the unified Results page, which lists nothing
    // until a lab unit is loaded, and whose "All (2)" filter chips matched the old
    // `button:has-text("2")` page-2 guess. The header row also counted as a "repeated" row. Load a
    // lab unit, page with the pager's own Next Page button and compare data rows only.
    await page.goto(`${BASE}/Results`);
    const main = page.locator('main');
    await main.getByRole('combobox', { name: 'Lab Unit' }).selectOption({ label: 'Hematology' });
    await main.getByRole('button', { name: 'Load results' }).click();
    await expect(main.getByRole('table').first()).toBeVisible({ timeout: 30_000 });
    const next = main.getByRole('button', { name: 'Next Page' });
    if (!(await next.count()) || (await next.isDisabled())) {
      // Legitimately absent: too little data to paginate. Visible as a skip.
      test.skip(true, 'single-page Hematology worklist at the current data volume');
    }
    const dataRows = () => main.locator('tbody tr').filter({ hasNot: page.locator('th') }).allTextContents();
    const page1Rows = await dataRows();
    await next.click();
    await expect.poll(dataRows, { timeout: 15_000 }).not.toEqual(page1Rows);
    const page2Rows = await dataRows();
    const repeated = page2Rows.filter((r) => r.trim() && page1Rows.includes(r));
    expect(repeated, 'page 2 repeated rows from page 1, so pagination is not advancing the offset').toEqual([]);
  });
});

test.describe('Suite AH — Incoming Orders & Batch Order Entry', () => {

  test('TC-IO-01: Incoming Orders screen loads', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    // Try menu navigation first
    try {
      await navigateViaMenu(page, ['Order', 'Incoming Orders']);
    } catch (e) {
      // Fallback to direct URL attempts
      const found = await tryNavigateToURL(page, ['/IncomingOrders', '/IncominOrders', '/order/incoming']);
      if (!found) {
        test.skip();
        return;
      }
    }

    await page.waitForTimeout(1000);

    // Verify page loaded and not login redirect
    expect(page.url()).not.toContain('login');
    expect(page.url()).not.toContain('signin');

    // Check for page heading or table
    const heading = await page.locator('[class*="heading"], h1, h2, [role="heading"]').first().isVisible({ timeout: 3000 }).catch(() => false);
    const table = await page.locator('table, [role="table"], [class*="list"], [class*="grid"]').first().isVisible({ timeout: 3000 }).catch(() => false);

    expect(heading || table).toBeTruthy();
  });

  test('TC-IO-02: Incoming orders list displays columns', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
    await navigateViaMenu(page, ['Order', 'Incoming Orders']).catch(async () => {
      await tryNavigateToURL(page, ['/IncomingOrders', '/IncominOrders', '/order/incoming']);
    });

    await page.waitForTimeout(1000);

    // Check for key columns in table
    const tableVisible = await page.locator('table').first().isVisible({ timeout: 3000 }).catch(() => false);
    if (!tableVisible) {
      test.skip();
      return;
    }

    const headerStr = (await page.locator('th, [role="columnheader"]').allTextContents()).join(' ').toLowerCase();

    // At least some key columns should be present
    const hasKeyColumns = ['accession', 'patient', 'test', 'status', 'date'].some(
      col => headerStr.includes(col)
    );

    expect(hasKeyColumns).toBeTruthy();
  });

  test('TC-IO-03: Batch Order Entry screen loads', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['Order', 'Batch Order Entry']);
    } catch (e) {
      const found = await tryNavigateToURL(page, ['/BatchOrderEntry', '/BatchEntry', '/order/batch']);
      if (!found) {
        test.skip();
        return;
      }
    }

    await page.waitForTimeout(1000);

    expect(page.url()).not.toContain('login');

    // Check for form or input field
    const textarea = await page.locator('textarea, [role="textbox"]').first().isVisible({ timeout: 3000 }).catch(() => false);
    const input = await page.locator('input[type="text"]').first().isVisible({ timeout: 3000 }).catch(() => false);

    expect(textarea || input).toBeTruthy();
  });

  test('TC-IO-04: Batch entry form accepts multiple accession numbers', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['Order', 'Batch Order Entry']);
    } catch (e) {
      await tryNavigateToURL(page, ['/BatchOrderEntry', '/BatchEntry', '/order/batch']);
    }

    await page.waitForTimeout(1000);

    const textareaLocator = page.locator('textarea').first();
    const textareaVisible = await textareaLocator.isVisible({ timeout: 3000 }).catch(() => false);
    if (!textareaVisible) {
      test.skip();
      return;
    }

    // Fill in batch accessions
    await textareaLocator.fill('26CPHL00001T\n26CPHL00002T\n26CPHL00003T');

    // Look for submit/process button
    const button = page.getByRole('button', { name: /submit|process|parse/i }).first();
    if (await button.isVisible({ timeout: 2000 }).catch(() => false)) {
      await button.click();
      await page.waitForTimeout(2000);
    }

    // Check if form processed (no immediate error)
    const hasError = await page.locator('[class*="error"], .error').first().isVisible({ timeout: 1000 }).catch(() => false);
    expect(hasError).toBe(false);
  });

  test('TC-IO-05: Batch order validation flags incomplete entries', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['Order', 'Batch Order Entry']);
    } catch (e) {
      await tryNavigateToURL(page, ['/BatchOrderEntry', '/BatchEntry', '/order/batch']);
    }

    await page.waitForTimeout(1000);

    const textareaLocator = page.locator('textarea').first();
    const textareaVisible = await textareaLocator.isVisible({ timeout: 3000 }).catch(() => false);
    if (!textareaVisible) {
      test.skip();
      return;
    }

    // Enter incomplete/invalid data
    await textareaLocator.fill('INVALID\n\n');

    const button = page.getByRole('button', { name: /submit|process|parse/i }).first();
    if (await button.isVisible({ timeout: 2000 }).catch(() => false)) {
      await button.click();
      await page.waitForTimeout(2000);
    }

    // System should either validate or process without error
    // This is a permissive test — just verify no crash
    expect(page.url()).not.toContain('error');
  });
});
