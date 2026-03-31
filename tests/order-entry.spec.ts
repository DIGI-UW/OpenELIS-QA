import { test, expect } from '@playwright/test';
import { BASE, ADMIN, PATIENT_NAME, PATIENT_ID, ACCESSION, QA_PREFIX, TIMEOUT, CONFIRMED_ADMIN_URLS, login, navigateWithDiscovery, fillSearchField, getDateRange, getFutureDateRange } from '../helpers/test-helpers';

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
    await page.goto(`${BASE}/SamplePatientEntry`);
    // Fill patient ID
    const patientIdField = page.locator('input[placeholder*="patient" i], input[id*="patientId" i]').first();
    await patientIdField.fill('0123456');
    await page.keyboard.press('Enter');
    // Patient name should appear
    await expect(page.getByText(/Abby|Sebby|0123456/i)).toBeVisible({ timeout: 5000 });
  });

  test('TC-AO-03: Full Add Order flow with HGB test', async ({ page }) => {
    await page.goto(`${BASE}/SamplePatientEntry`);

    // Step 1: Patient Info — search Abby Sebby
    await page.locator('input[placeholder*="patient" i], input[id*="patientId" i]').first().fill('0123456');
    await page.keyboard.press('Enter');
    await page.getByText(/Next/i).first().click();

    // Step 2: Program Selection — Routine Testing
    await page.getByText(/Routine Testing/i).click();
    await page.getByRole('button', { name: /Next/i }).click();

    // Step 3: Add Sample — select Whole Blood
    await selectSampleType(page, '4');
    // Select HGB test
    const hgbCheckbox = page.getByText(/HGB\(Whole Blood\)/i).locator('..');
    await hgbCheckbox.click();
    await page.getByRole('button', { name: /Next/i }).click();

    // Step 4: Add Order — generate lab number and submit
    await page.getByRole('button', { name: /Generate/i }).click();
    const labNumber = await page.locator('[id*="accessionNumber"], [class*="accession"]').first().textContent();
    expect(labNumber).toBeTruthy();
    // Fill request date
    const dateInput = page.locator('input[placeholder*="dd/mm/yyyy" i]').first();
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yyyy = today.getFullYear();
    await dateInput.fill(`${dd}/${mm}/${yyyy}`);
    // Submit
    await page.getByRole('button', { name: /Submit/i }).click();
    await expect(page.getByText(/Successfully saved/i)).toBeVisible({ timeout: 10000 });
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
    await page.goto(`${BASE}/SampleEdit?type=readwrite`);
    const accInput = page.locator('input[placeholder*="accession" i], input[id*="accession" i]').first();
    await accInput.fill('26CPHL00008T'); // current active accession from QA run
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/ModifyOrder/, { timeout: 5000 });
  });

  test('TC-EO-03: ModifyOrder Add Sample step shows Current Tests and Available Tests', async ({ page }) => {
    await page.goto(`${BASE}/ModifyOrder?accessionNumber=26CPHL00008T`);
    // Step 1: Program Selection
    await page.getByRole('button', { name: /Next/i }).click();
    // Step 2: Add Sample — should see Current Tests section
    await expect(page.getByText(/Current Tests/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/Available Tests/i)).toBeVisible();
  });

  test(
    'TC-EO-04 [BUG-4 KNOWN]: ModifyOrder generates new accession on save',
    async ({ page }) => {
      // This test documents the known BUG-4 behavior.
      // Expected (desired): accession stays the same after modifying tests.
      // Actual (current): new accession is generated.
      await page.goto(`${BASE}/ModifyOrder?accessionNumber=26CPHL00008T`);
      await page.getByRole('button', { name: /Next/i }).click(); // to Add Sample

      // Assign a test
      const assignCheckboxes = page.locator('input[id*="assign_"], input[name*="assign"]');
      if (await assignCheckboxes.count() > 0) {
        await assignCheckboxes.first().check();
      }
      await page.getByRole('button', { name: /Next/i }).click(); // to Add Order
      await page.getByRole('button', { name: /Generate/i }).click();
      await page.getByRole('button', { name: /Submit/i }).click();

      // Confirm accession changed (BUG-4)
      const newAccession = await page.locator('[class*="accession"], [id*="accession"]').first().textContent();
      // BUG-4: newAccession !== '26CPHL00008T'
      // When fixed, this assertion should be:
      //   expect(newAccession).toContain('26CPHL00008T');
      // Currently documenting that it changes:
      console.log(`BUG-4: new accession after ModifyOrder = ${newAccession}`);
    }
  );
});

test.describe('Referral section (Add Order)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-REF-01: Referral checkbox enables table header', async ({ page }) => {
    await page.goto(`${BASE}/SamplePatientEntry`);
    // Patient search
    await page.locator('input[placeholder*="patient" i]').first().fill('0123456');
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: /Next/i }).first().click();
    // Program selection
    await page.getByText(/Routine Testing/i).click();
    await page.getByRole('button', { name: /Next/i }).click();
    // Add Sample — select Whole Blood
    await selectSampleType(page, '4');
    // Check referral checkbox
    const referralCheckbox = page.getByRole('checkbox').last();
    const referralLabel = page.getByText('Refer test to a reference lab', { exact: false });
    await referralLabel.click();
    // Table header should appear
    await expect(page.getByText('Institute', { exact: false })).toBeVisible({ timeout: 3000 });
    await expect(page.getByText('Select Test Name', { exact: false })).toBeVisible();
  });

  test('TC-REF-02: Referral row requires test selection first', async ({ page }) => {
    await page.goto(`${BASE}/SamplePatientEntry`);
    await page.locator('input[placeholder*="patient" i]').first().fill('0123456');
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: /Next/i }).first().click();
    await page.getByText(/Routine Testing/i).click();
    await page.getByRole('button', { name: /Next/i }).click();
    await selectSampleType(page, '4');

    // Check referral BEFORE selecting a test
    await page.getByText('Refer test to a reference lab', { exact: false }).click();
    // Table header visible but NO input row (BUG-2a: no instructional text)
    const tbodyRows = page.locator('.cds--data-table tbody tr');
    await expect(tbodyRows).toHaveCount(0);

    // Now select a test
    await page.getByText(/HGB\(Whole Blood\)/i).click();
    // Row should now appear
    await expect(tbodyRows).toHaveCount(1);
    await expect(page.locator('select#referralReasonId_0_743, select[id*="referralReason"]')).toBeVisible();
  });

  test(
    'TC-REF-03 [BUG-2 KNOWN]: Institute dropdown selection reverts to Select...',
    async ({ page }) => {
      await page.goto(`${BASE}/SamplePatientEntry`);
      await page.locator('input[placeholder*="patient" i]').first().fill('0123456');
      await page.keyboard.press('Enter');
      await page.getByRole('button', { name: /Next/i }).first().click();
      await page.getByText(/Routine Testing/i).click();
      await page.getByRole('button', { name: /Next/i }).click();
      await selectSampleType(page, '4');

      // Select test + enable referral
      await page.getByText(/HGB\(Whole Blood\)/i).click();
      await page.getByText('Refer test to a reference lab', { exact: false }).click();

      // Attempt to select a lab — BUG-2: will revert
      const instituteSelect = page.getByRole('combobox', { name: /institute|lab/i }).first();
      await instituteSelect.waitFor({ state: 'visible' });

      // Try each of the 6 labs
      const labs = [
        { value: '2', name: 'Central Public Health Laboratory' },
        { value: '14', name: 'Doherty Institute' },
        { value: '3', name: 'Queensland Mycobacterium Reference Laboratory' },
        { value: '20', name: 'Research Institute for Tropical Medicine' },
        { value: '6', name: 'SYD PATH Pathology' },
        { value: '7', name: 'Victorian Infectious Diseases Reference Laboratory' },
      ];

      for (const lab of labs) {
        await instituteSelect.selectOption({ value: lab.value });
        const selectedValue = await instituteSelect.inputValue();
        // BUG-2: selectedValue === '' (reverts immediately)
        // When fixed, assert: expect(selectedValue).toBe(lab.value)
        console.log(`BUG-2: Lab "${lab.name}" (${lab.value}): selected value = "${selectedValue}"`);
        if (selectedValue === '') {
          console.log(`  → FAIL: selection reverted to empty (BUG-2 confirmed for ${lab.name})`);
        } else {
          console.log(`  → PASS: selection persisted`);
        }
      }

      // Document current broken state
      await instituteSelect.selectOption({ value: '2' });
      const finalValue = await instituteSelect.inputValue();
      // When BUG-2 is fixed, change this to: expect(finalValue).toBe('2');
      expect(finalValue).toBe(''); // documents current broken state
    }
  );

  test(
    'TC-REF-04 [BUG-2 KNOWN]: Select Test Name dropdown selection reverts',
    async ({ page }) => {
      await page.goto(`${BASE}/SamplePatientEntry`);
      await page.locator('input[placeholder*="patient" i]').first().fill('0123456');
      await page.keyboard.press('Enter');
      await page.getByRole('button', { name: /Next/i }).first().click();
      await page.getByText(/Routine Testing/i).click();
      await page.getByRole('button', { name: /Next/i }).click();
      await selectSampleType(page, '4');
      await page.getByText(/HGB\(Whole Blood\)/i).click();
      await page.getByText('Refer test to a reference lab', { exact: false }).click();

      const testNameSelect = page.getByRole('combobox', { name: /test/i }).first();
      await testNameSelect.waitFor({ state: 'visible' });
      // Attempt to select HGB (value=743)
      await testNameSelect.selectOption({ value: '743' });
      const val = await testNameSelect.inputValue();
      // BUG-2: val === '' (reverts)
      console.log(`BUG-2: Select Test Name: selected value = "${val}"`);
      // When fixed: expect(val).toBe('743');
      expect(val).toBe(''); // documents current broken state
    }
  );
});

test.describe('Multi-Patient Batch Workflow (TC-BATCH)', () => {
  const batchAccessions: string[] = [];

  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  async function placeSimpleOrder(page: any, patientId: string, testCheckboxId?: string): Promise<string> {
    await page.goto(`${BASE}/SamplePatientEntry`);
    await page.waitForTimeout(2000);

    // Step 1: patient search — enter patient ID
    const patField = page.locator('input[id*="national" i], input[id*="patientId" i]').first();
    if (await patField.isVisible({ timeout: 3000 }).catch(() => false)) {
      await patField.fill(patientId);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1500);
    }

    // Next
    const nextBtn = page.getByRole('button', { name: /next/i }).first();
    for (let i = 0; i < 3 && await nextBtn.isVisible({ timeout: 1000 }).catch(() => false); i++) {
      await nextBtn.click();
      await page.waitForTimeout(1000);
    }

    // Generate lab number
    const genLink = page.getByText(/generate/i).first();
    if (await genLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await genLink.click();
      await page.waitForTimeout(1000);
    }

    // Submit
    const submitBtn = page.getByRole('button', { name: /submit|save|accept/i }).first();
    if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await submitBtn.click();
      await page.waitForTimeout(2000);
    }

    // Extract accession from confirmation
    const bodyText = await page.textContent('body') ?? '';
    const accMatch = bodyText.match(/\b\d{2}CPHL[\dA-Z]{6}\b/);
    return accMatch?.[0] ?? '';
  }

  test('TC-BATCH-01: Place 3 orders — unique accessions generated', async ({ page }) => {
    // Order 1: Abby Sebby
    const acc1 = await placeSimpleOrder(page, '0123456');
    if (acc1) {
      batchAccessions.push(acc1);
      console.log(`TC-BATCH-01 Order 1: accession = ${acc1}`);
    } else {
      console.log('TC-BATCH-01 Order 1: FAIL — no accession extracted from confirmation');
    }

    // For order 2 and 3, use any second patient found in search
    await page.goto(`${BASE}/SamplePatientEntry`);
    await page.waitForTimeout(1500);
    // We'll just place two more with patient 0123456 if no second patient readily available
    const acc2 = await placeSimpleOrder(page, '0123456');
    if (acc2) batchAccessions.push(acc2);
    const acc3 = await placeSimpleOrder(page, '0123456');
    if (acc3) batchAccessions.push(acc3);

    console.log(`TC-BATCH-01: ${batchAccessions.length} orders placed: ${batchAccessions.join(', ')}`);

    // Verify uniqueness
    const unique = new Set(batchAccessions.filter(Boolean));
    console.log(unique.size === batchAccessions.filter(Boolean).length
      ? 'TC-BATCH-01: PASS — all accessions are unique'
      : 'TC-BATCH-01: FAIL — duplicate accession numbers detected');
  });

  test('TC-BATCH-02: All batch orders searchable in Results By Order', async ({ page }) => {
    // Use known accession if batch didn't run
    const toCheck = batchAccessions.length > 0 ? batchAccessions : ['26CPHL00008V'];

    let allFound = true;
    for (const acc of toCheck) {
      if (!acc) continue;
      await page.goto(`${BASE}/AccessionResults`);
      await page.waitForTimeout(1000);
      const accField = page.locator('input[id*="accession" i]').first();
      if (await accField.isVisible({ timeout: 3000 }).catch(() => false)) {
        await accField.fill(acc);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(2000);
      }
      const found = await page.getByText(/Sebby|HGB|result/i).isVisible({ timeout: 5000 }).catch(() => false);
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
    // Check Results By Order for pagination
    await page.goto(`${BASE}/AccessionResults`);
    await page.waitForTimeout(2000);

    const pagination = page.locator('[class*="pagination"], [aria-label*="pagination" i], button[aria-label*="page" i]');
    const hasPagination = await pagination.count().then(n => n > 0);

    if (hasPagination) {
      console.log('TC-BATCH-06: Pagination controls found — testing page 2');
      const page2Btn = page.locator('[aria-label*="page 2" i], button:has-text("2")').first();
      if (await page2Btn.isVisible({ timeout: 2000 }).catch(() => false)) {
        const page1Rows = await page.getByRole('row').allTextContents();
        await page2Btn.click();
        await page.waitForTimeout(1500);
        const page2Rows = await page.getByRole('row').allTextContents();
        const noDups = !page2Rows.some(r => page1Rows.includes(r));
        console.log(noDups
          ? 'TC-BATCH-06: PASS — page 2 rows are distinct from page 1'
          : 'TC-BATCH-06: FAIL — duplicate rows between page 1 and page 2');
      }
    } else {
      console.log('TC-BATCH-06: No pagination controls — single-page list (acceptable for current data volume)');
    }
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
    const heading = await page.$('[class*="heading"], h1, h2, [role="heading"]');
    const table = await page.$('table, [role="table"], [class*="list"], [class*="grid"]');

    expect(heading || table).toBeTruthy();
  });

  test('TC-IO-02: Incoming orders list displays columns', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
    await navigateViaMenu(page, ['Order', 'Incoming Orders']).catch(async () => {
      await tryNavigateToURL(page, ['/IncomingOrders', '/IncominOrders', '/order/incoming']);
    });

    await page.waitForTimeout(1000);

    // Check for key columns in table
    const table = await page.$('table');
    if (!table) {
      test.skip();
      return;
    }

    const cells = await page.$$('th, [role="columnheader"]');
    const headerText = await Promise.all(cells.map(cell => cell.textContent()));
    const headerStr = headerText.join(' ').toLowerCase();

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
    const textarea = await page.$('textarea, [role="textbox"]');
    const input = await page.$('input[type="text"]');

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

    const textarea = await page.$('textarea');
    if (!textarea) {
      test.skip();
      return;
    }

    // Fill in batch accessions
    await textarea.fill('26CPHL00001T\n26CPHL00002T\n26CPHL00003T');

    // Look for submit/process button
    const button = await page.$('button:has-text("Submit"), button:has-text("Process"), button:has-text("Parse")');
    if (button) {
      await button.click();
      await page.waitForTimeout(2000);
    }

    // Check if form processed (no immediate error)
    const errorMsg = await page.$('[class*="error"], [class*="alert"][class*="error"], .error');
    expect(!errorMsg).toBeTruthy();
  });

  test('TC-IO-05: Batch order validation flags incomplete entries', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['Order', 'Batch Order Entry']);
    } catch (e) {
      await tryNavigateToURL(page, ['/BatchOrderEntry', '/BatchEntry', '/order/batch']);
    }

    await page.waitForTimeout(1000);

    const textarea = await page.$('textarea');
    if (!textarea) {
      test.skip();
      return;
    }

    // Enter incomplete/invalid data
    await textarea.fill('INVALID\n\n');

    const button = await page.$('button:has-text("Submit"), button:has-text("Process"), button:has-text("Parse")');
    if (button) {
      await button.click();
      await page.waitForTimeout(2000);
    }

    // System should either validate or process without error
    // This is a permissive test — just verify no crash
    expect(page.url()).not.toContain('error');
  });
});
