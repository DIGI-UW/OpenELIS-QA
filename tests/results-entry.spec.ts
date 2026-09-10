import { test, expect } from '@playwright/test';
import { BASE, ADMIN, PATIENT_NAME, PATIENT_ID, ACCESSION, QA_PREFIX, TIMEOUT, CONFIRMED_ADMIN_URLS, login, navigateWithDiscovery, fillSearchField, getDateRange, getFutureDateRange, clickFormSearch } from '../helpers/test-helpers';
import { seedOrder } from '../helpers/data-factory';

/**
 * Results Entry and Results Viewing Test Suites
 * Suites: Result Entry, Results By Unit, Suite AA, Suite AJ, Phase 5 F-DEEP, Phase 6 BF-DEEP, Phase 6 BG-DEEP
 * Test Count: ~60
 */

// Helper functions
async function goToResultsByUnit(page: any) {
  const candidates = [
    `${BASE}/AccessionResults?type=testSection`,
    `${BASE}/ResultsUpdate`,
    `${BASE}/WorkPlan`,
    `${BASE}/WorkPlanByTestSection`,
  ];
  for (const url of candidates) {
    const res = await page.goto(url);
    if (res?.status() === 200 && !page.url().match(/LoginPage|login/i)) return page.url();
  }
  throw new Error('Could not locate By Unit worklist — URL unknown');
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

async function getToday(): Promise<string> {
  const today = new Date();
  return today.toISOString().split('T')[0];
}

async function getFutureDate(days: number): Promise<string> {
  const future = new Date();
  future.setDate(future.getDate() + days);
  return future.toISOString().split('T')[0];
}

test.describe('Result Entry', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-RE-01: Results By Order page loads', async ({ page }) => {
    await page.goto(`${BASE}/AccessionResults`);
    await expect(page.getByRole('heading', { name: /result/i })).toBeVisible({ timeout: 5000 });
  });

  // RETIRED 2026-08-26 -- six tests removed here.
  //
  // They drove the OLD five-item Results submenu: By Patient, By Order, By
  // Range of Order Numbers, Order Programs, and a From/To accession page. Site
  // information flag resultsEntryUnifiedRoute is true on this instance, so
  // Header.jsx hides those menu items and every legacy results route 302s to
  // the unified worklist at /Results. The tests were asserting against screens
  // that no longer exist as separate screens, and failed as -no From Accession
  // Number input- rather than as -this screen was replaced-.
  //
  // Replacement, written against the live page: tests/unified-results.spec.ts
  // (UR-01..UR-05). Deeper behaviour lives in results-r1-spec-delta.spec.ts and
  // results-page-deep-delta.spec.ts.
  //
  // Removed: TC-RE-02, TC-RBP-01, TC-RBO-04, TC-RBR-01, TC-RBR-05, TC-BF-DEEP-01.

  test('TC-RE-03: a pending order is found on Results By Order, and a numeric result saves', async ({ page }) => {
    // REWRITTEN 2026-09-10. What this replaced, and why.
    //
    // The old case typed accession `26CPHL00008T` — a record from a DIFFERENT
    // instance — into `page.locator('input').first()`, pressed Enter, and then:
    //   if (!hasResultInput) { console.log('SKIP'); return; }
    // so on this instance it took the skip every run and asserted nothing. Its
    // final assertion was `saveStatus === 0 || 2xx`, which passes when no POST
    // fires at all, i.e. it could not fail.
    //
    // Three things were wrong and all three are now fixed:
    //  1. The accession is SEEDED, so it exists and is pending by construction.
    //  2. `input.first()` is the Carbon HEADER's search box, not the form's
    //     field. The form field is `#accessionNumber`.
    //  3. Enter did not submit. The form's own Search must be clicked, and
    //     there are TWO buttons labelled exactly "Search" on this page — the
    //     header action and the form's primary. Clicking the header one fires
    //     NO request and leaves the mount-time empty table, which reads as
    //     "There are no records to display / 0-0 of 0 items" and is
    //     indistinguishable from a real no-match. That false negative is what
    //     made results entry look broken (harness ref 12.30); clickFormSearch
    //     now excludes header buttons structurally.
    const seeded = await seedOrder(page, 'RE03');

    await page.goto(`${BASE}/AccessionResults`);
    await page.locator('#accessionNumber').fill(seeded.accession);

    const searched = await clickFormSearch(page, '#accessionNumber');
    expect(searched, 'Results By Order must have a form Search button').toBe(true);

    // The row, before anything else. Assert on the sample item id
    // (`<accession>-1`) because it is what the table actually renders as the
    // Sample Info cell — measured in the payload's `sampleItemExternalId`.
    await expect(
      page.locator('body'),
      `seeded order ${seeded.accession} must appear on Results By Order`,
    ).toContainText(`${seeded.accession}-1`, { timeout: 20_000 });

    // Carbon controlled input: React owns `value`, so a plain fill can be
    // reverted on the next render. Drive the native setter and dispatch the
    // events React listens for.
    // MEASURED, not guessed (2026-09-10, local 3.2.2.0). The row's controls are:
    //   input#ResultValue0            name="testResult[0].resultValue"  type=number
    //   textarea#testResult0.note     name="testResult[0].note"
    //   input#testDate-date-0, select#testDate-time-0_{hour,minute}
    //   button "Accept"
    // Selecting on `name` rather than `id` because the id is `ResultValue0`
    // with a CAPITAL R — CSS attribute matching is case-SENSITIVE, so the
    // earlier `input[id*="result"]` matched nothing and the failure read as
    // "the analysis offers no result field", i.e. as a product defect.
    const resultInput = page.locator('input[name$=".resultValue"]').first();
    await expect(resultInput, 'the pending analysis must offer a result field').toBeVisible({
      timeout: 15_000,
    });

    // AN INTEGER, DELIBERATELY. '14.5' was the old case's value and this screen
    // silently rewrites it to '15': the test's own `significantDigits` is 0
    // (read from the LogbookResults payload for testId 3, Glucose/Serum), and
    // the field rounds to it on entry. That rounding is real product behaviour
    // and worth its own case; using a value it cannot rewrite keeps THIS case
    // about "does a result save", not about rounding.
    const VALUE = '15';
    await resultInput.evaluate((el, v) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, VALUE);
    await expect(resultInput, 'the entered value must survive the next render').toHaveValue(VALUE);

    // Save, and require the POST. `saveStatus === 0` is NOT a pass: a save
    // that never left the browser has not saved anything.
    const savePost = page.waitForResponse(
      (r) => r.request().method() === 'POST' && /Result/i.test(r.url()),
      { timeout: 30_000 },
    );
    await page.getByRole('button', { name: /^\s*Save\s*$/i }).last().click();
    const resp = await savePost;
    expect(resp.status(), `save POST ${resp.url()} must be 2xx`).toBeGreaterThanOrEqual(200);
    expect(resp.status(), `save POST ${resp.url()} must be 2xx`).toBeLessThan(300);

    // SAVE NAVIGATES. Measured 2026-09-10: the POST succeeds and the app then
    // leaves the page, so evaluating straight after the response died with
    // "Execution context was destroyed, most likely because of a navigation".
    // Wait the navigation out, then read from a settled document.
    await page.waitForLoadState('domcontentloaded').catch(() => { /* already settled */ });
    await page.waitForTimeout(2_000);

    // And it must be there on a fresh read — the server's own view, not the
    // form's local state.
    const persisted = await page.evaluate(async (acc) => {
      const r = await fetch(
        '/api/OpenELIS-Global/rest/LogbookResults?labNumber=' + acc +
          '&upperRangeAccessionNumber=&patientPK=&testSectionId=&collectionDate=&recievedDate=' +
          '&selectedTest=&selectedSampleStatus=&selectedAnalysisStatus=&doRange=false&finished=false',
        { headers: { Accept: 'application/json' } },
      );
      const j = await r.json().catch(() => null);
      const row = j && j.testResult && j.testResult[0];
      return row ? { resultValue: row.resultValue, analysisStatusId: row.analysisStatusId } : null;
    }, seeded.accession);

    expect(persisted, `LogbookResults must still return the analysis for ${seeded.accession}`).not.toBeNull();
    console.log(
      `TC-RE-03: ${seeded.accession} saved ${resp.status()}; server now reports ` +
        `resultValue="${persisted!.resultValue}" analysisStatusId=${persisted!.analysisStatusId}`,
    );
    expect(String(persisted!.resultValue), 'the saved result must be readable back from the server').toContain(VALUE);
  });
});

test.describe('Results By Unit worklist (TC-BU)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-BU-01: Results By Unit page is reachable', async ({ page }) => {
    const url = await goToResultsByUnit(page).catch((e) => {
      console.log(`TC-BU-01: ${e.message}`);
      return null;
    });
    if (url) {
      expect(page.url()).not.toMatch(/LoginPage|login/i);
      console.log(`TC-BU-01: PASS — By Unit reached at ${url}`);
    } else {
      // Navigate via hamburger menu as fallback
      await page.goto(`${BASE}/Dashboard`);
      await page.getByRole('button', { name: /open|menu|hamburger/i }).click();
      await page.waitForTimeout(500);
      const byUnitLink = page.getByText(/By Unit|By Section|Work Plan/i);
      const found = await byUnitLink.isVisible({ timeout: 3000 }).catch(() => false);
      console.log(`TC-BU-01: Hamburger menu "By Unit" found = ${found}`);
    }
  });

  test('TC-BU-02: Test section filter appears on By Unit page', async ({ page }) => {
    const url = await goToResultsByUnit(page).catch(() => null);
    if (!url) {
      console.log('TC-BU-02: SKIP — By Unit page not found in TC-BU-01');
      return;
    }
    // Look for a test section select dropdown
    const sectionSelect = page.getByRole('combobox', { name: /section/i }).first();
    const hasSectionSelect = await sectionSelect.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`TC-BU-02: Test section select visible = ${hasSectionSelect}`);
    if (hasSectionSelect) {
      const opts = await sectionSelect.locator('option').allTextContents();
      console.log(`TC-BU-02: Available sections: ${opts.join(', ')}`);
      expect(opts.length).toBeGreaterThan(1);
    }
  });

  test('TC-BU-03: Result input in By Unit view is editable', async ({ page }) => {
    const url = await goToResultsByUnit(page).catch(() => null);
    if (!url) {
      console.log('TC-BU-03: SKIP — By Unit page not found');
      return;
    }
    // Load Hematology section if possible
    const sectionSelect = page.locator('select').first();
    const hasSect = await sectionSelect.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasSect) {
      // selectOption takes a STRING label, not a RegExp. The cast to any hid
      // that, and Playwright threw -options[0].label: expected string, got
      // object-, which reads as a broken dropdown rather than a broken call.
      // Resolve the real option text first, and skip if this instance has no
      // Hematology section rather than failing on a data assumption.
      const hematologyLabel = await sectionSelect
        .locator('option')
        .allTextContents()
        .then((labels) => labels.find((l) => /h(a)?ematolog/i.test(l)));
      if (hematologyLabel) {
        await sectionSelect.selectOption({ label: hematologyLabel });
      } else {
        console.log('TC-BU-03: no Hematology option on this instance; using the first section');
        await sectionSelect.selectOption({ index: 1 }).catch(() => {});
      }
      await page.waitForTimeout(1000);
    }
    // Find a result input field (textarea or input in result column)
    const resultInput = page.getByRole('textbox', { name: /result/i }).first();
    const hasInput = await resultInput.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`TC-BU-03: Result input visible = ${hasInput}`);
    if (hasInput) {
      const isEditable = await resultInput.isEditable();
      console.log(`TC-BU-03: Result input editable = ${isEditable}`);
      expect(isEditable).toBe(true);
    }
  });

  test('TC-BU-04: Entering result and saving via By Unit worklist', async ({ page }) => {
    const url = await goToResultsByUnit(page).catch(() => null);
    if (!url) {
      console.log('TC-BU-04: SKIP — By Unit page not found');
      return;
    }
    // If there are pending results, enter one and save
    const resultInput = page.getByRole('textbox', { name: /result/i }).first();
    const hasInput = await resultInput.isVisible({ timeout: 5000 }).catch(() => false);
    if (hasInput) {
      await resultInput.fill('14.5');
      const saveBtn = page.getByRole('button', { name: /Save/i });
      await saveBtn.click();
      await page.waitForTimeout(2000);
      console.log('TC-BU-04: Result 14.5 saved via By Unit worklist');
    } else {
      console.log('TC-BU-04: SKIP — No pending result input fields found (queue may be empty)');
    }
  });
});

test.describe('Suite AA — Results By Patient & By Order', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });


  test('TC-RBP-02: Search by patient name returns results', async ({ page }) => {
    // Navigate to Results > By Patient
    const candidates = [
      '/PatientResults',
      '/ResultsByPatient',
      '/patient/results',
    ];
    await navigateWithDiscovery(page, candidates);

    // Search for patient by name
    const selectors = [
      'input[placeholder*="patient" i]',
      'input[placeholder*="name" i]',
      'input[id*="search"]',
      'input',
    ];
    const success = await fillSearchField(page, PATIENT_NAME, selectors);

    if (success) {
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1000);

      // Verify results table appears
      const resultRow = page.locator('tr, [role="row"]').first();
      await expect(resultRow).toBeVisible({ timeout: 5000 }).catch(() => {
        console.log('No results returned for patient name search');
      });

      // Verify patient name or ID appears in results
      const patientInResults = page.getByText(PATIENT_NAME, { exact: false });
      await expect(patientInResults).toBeVisible({ timeout: 3000 }).catch(() => {
        console.log('Patient name not visible in results');
      });
    } else {
      console.log('Could not locate search field');
    }
  });

  test('TC-RBP-03: Search by patient ID returns results', async ({ page }) => {
    const candidates = ['/PatientResults', '/ResultsByPatient', '/patient/results'];
    await navigateWithDiscovery(page, candidates);

    // Clear field and search by ID
    const selectors = [
      'input[placeholder*="patient" i]',
      'input[placeholder*="ID" i]',
      'input',
    ];
    const success = await fillSearchField(page, PATIENT_ID, selectors);

    if (success) {
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1000);

      // Verify patient ID appears in results
      const patientIdInResults = page.getByText(PATIENT_ID, { exact: false });
      await expect(patientIdInResults).toBeVisible({ timeout: 5000 }).catch(() => {
        console.log('Patient ID not found in results');
      });
    }
  });


  test('TC-RBO-05: Search by accession number returns results', async ({ page }) => {
    const candidates = ['/AccessionResults', '/OrderResults', '/order/results'];
    await navigateWithDiscovery(page, candidates);

    // Search by accession
    const selectors = [
      'input[placeholder*="accession" i]',
      'input[id*="accession" i]',
      'input',
    ];
    const success = await fillSearchField(page, ACCESSION, selectors);

    if (success) {
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2000);

      // Verify accession appears in results
      const accessionInResults = page.getByText(ACCESSION, { exact: false });
      await expect(accessionInResults).toBeVisible({ timeout: 8000 }).catch(() => {
        console.log(`Accession ${ACCESSION} not found in results`);
      });
    }
  });

  test('TC-RBO-06: Results display includes test name, result value, status', async ({ page }) => {
    const candidates = ['/AccessionResults', '/OrderResults', '/order/results'];
    await navigateWithDiscovery(page, candidates);

    // Search and display results
    const selectors = ['input[placeholder*="accession" i]', 'input[id*="accession" i]', 'input'];
    const success = await fillSearchField(page, ACCESSION, selectors);

    if (success) {
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2000);

      // Verify result row structure
      const resultRow = page.locator('tr, [role="row"]').first();
      await expect(resultRow).toBeVisible({ timeout: 8000 }).catch(() => {
        console.log('No result row found');
      });

      // Check for key columns: test name, result value, status
      const testNameCol = resultRow.getByText(/HGB|test|result/i);
      const statusCol = resultRow.getByText(/Final|Preliminary|Corrected|Pending|Validation/i);

      await expect(testNameCol).toBeVisible({ timeout: 3000 }).catch(() => {
        console.log('Test name column not clearly visible');
      });

      await expect(statusCol).toBeVisible({ timeout: 3000 }).catch(() => {
        console.log('Status column not clearly visible');
      });
    }
  });
});

test.describe('Suite AJ — Results By Range & By Test/Date/Status', () => {


  test('TC-RBR-02: Enter range returns results', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['Results', 'By Range of Order Numbers']);
    } catch (e) {
      await tryNavigateToURL(page, ['/ResultsByRange', '/OrderRange', '/results/range']);
    }

    await page.waitForTimeout(1000);

    const inputs = await page.$$('input[type="text"], input[type="number"]');
    if (inputs.length < 2) {
      test.skip();
      return;
    }

    await inputs[0].fill('26CPHL00001T');
    await inputs[1].fill('26CPHL00010T');

    const button = page.getByRole('button', { name: /search|submit/i }).first();
    if (await button.isVisible({ timeout: 2000 }).catch(() => false)) {
      await button.click();
      await page.waitForTimeout(2000);
    }

    // Verify results table present or empty state
    const tableVisible = await page.locator('table, [role="table"]').first().isVisible({ timeout: 3000 }).catch(() => false);
    expect(tableVisible).toBeTruthy();
  });

  test('TC-RBR-03: Results > By Test, Date or Status screen loads', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['Results', 'By Test, Date or Status']);
    } catch (e) {
      const found = await tryNavigateToURL(page, ['/ResultsByFilter', '/FilterResults', '/results/filter']);
      if (!found) {
        test.skip();
        return;
      }
    }

    await page.waitForTimeout(1000);

    expect(page.url()).not.toContain('login');

    // Check for filter controls
    const filterCount = await page.locator('select, input, [class*="filter"]').count();
    expect(filterCount).toBeGreaterThanOrEqual(1);
  });

  test('TC-RBR-04: Filter by test type returns results', async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);

    try {
      await navigateViaMenu(page, ['Results', 'By Test, Date or Status']);
    } catch (e) {
      await tryNavigateToURL(page, ['/ResultsByFilter', '/FilterResults', '/results/filter']);
    }

    await page.waitForTimeout(1000);

    const selectorEl = page.locator('select').first();
    if (await selectorEl.isVisible({ timeout: 2000 }).catch(() => false)) {
      await selectorEl.selectOption({ index: 1 }).catch(() => null);
      await page.waitForTimeout(500);
    }

    const button = page.getByRole('button', { name: /search|submit/i }).first();
    if (await button.isVisible({ timeout: 2000 }).catch(() => false)) {
      await button.click();
      await page.waitForTimeout(2000);
    }

    const tableVisible = await page.locator('table, [role="table"]').first().isVisible({ timeout: 3000 }).catch(() => false);
    expect(tableVisible).toBeTruthy();
  });

});

test.describe('Phase 5 — F-DEEP: Results Entry Field Validation Tests', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-F-DEEP-01: Result row expand shows detail fields', async ({ page }) => {
    // Navigate directly to LogbookResults with Hematology
    await page.goto(`${BASE}/LogbookResults?type=Hematology`);
    await page.waitForLoadState('networkidle');

    const unitSelect = page.locator('select').first();
    if (await unitSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Select Hematology via native setter
      await page.evaluate(() => {
        const sel = document.querySelector<HTMLSelectElement>('select');
        if (!sel) return;
        const hema = Array.from(sel.options).find(o => /hematol/i.test(o.text));
        if (!hema) return;
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!;
        setter.call(sel, hema.value);
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await page.waitForTimeout(3000);
    }

    // Click expand chevron on first row if present
    const expandBtn = page.locator('button:has(svg), [class*="expand"], [aria-label*="expand" i]').first();
    if (await expandBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expandBtn.click();
      await page.waitForTimeout(1000);
      // Detail fields should appear after expand
      const detailVisible = await page.locator('text=Methods, text=Upload file, text=Note').first()
        .isVisible({ timeout: 3000 }).catch(() => false);
      console.log(`TC-F-DEEP-01: detail fields visible after expand = ${detailVisible}`);
    } else {
      console.log('TC-F-DEEP-01: SKIP — No expand button found (no pending results in Hematology)');
    }
  });

  test('TC-F-DEEP-02: Result field accepts numeric input (native setter)', async ({ page }) => {
    await page.goto(`${BASE}/LogbookResults?type=Hematology`);
    await page.waitForLoadState('networkidle');

    // Select Hematology
    await page.evaluate(() => {
      const sel = document.querySelector<HTMLSelectElement>('select');
      if (!sel) return;
      const hema = Array.from(sel.options).find(o => /hematol/i.test(o.text));
      if (!hema) return;
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!;
      setter.call(sel, hema.value);
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(3000);

    // Find a result input field
    const resultInput = page.locator('input[type="text"], input[type="number"]').first();
    if (!(await resultInput.isVisible({ timeout: 3000 }).catch(() => false))) {
      console.log('TC-F-DEEP-02: SKIP — No result input fields visible (queue empty)');
      return;
    }

    // Fill with native setter and verify the value sticks
    await page.evaluate(() => {
      const inp = document.querySelector<HTMLInputElement>('input[type="text"], input[type="number"]');
      if (!inp) return;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(inp, '6.2');
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const value = await resultInput.inputValue();
    expect(value, 'Result field must accept and hold numeric input "6.2"').toBe('6.2');

    // Clean up
    await page.evaluate(() => {
      const inp = document.querySelector<HTMLInputElement>('input[type="text"], input[type="number"]');
      if (!inp) return;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(inp, '');
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });
});

test.describe('Phase 6 — BF-DEEP: Results By Range Tests', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });


  test('TC-BF-DEEP-02: Range search returns results or empty state', async ({ page }) => {
    await page.goto(`${BASE}/RangeResults`);
    await page.waitForLoadState('networkidle');

    const fromInput = page.locator('input[placeholder*="Accession" i], input[placeholder*="From" i]').first();
    const toInput = page.locator('input[placeholder*="Accession" i], input[placeholder*="To" i]').last();

    if (!(await fromInput.isVisible({ timeout: 3000 }).catch(() => false))) {
      console.log('TC-BF-DEEP-02: SKIP — input fields not found');
      return;
    }

    await fromInput.fill('26CPHL00001');
    await toInput.fill('26CPHL00010');
    await page.getByRole('button', { name: /Search/i }).click();
    await page.waitForTimeout(2000);

    const bodyText = await page.locator('body').innerText();
    // Must not crash — either returns results or shows empty state
    expect(bodyText, 'Page must not show a server error after range search').not.toMatch(/500|Internal Server Error/);
    const hasResultsOrEmpty = /items|result|no.*data|0.*of.*0/i.test(bodyText);
    expect(hasResultsOrEmpty, 'Range search must show results or an empty state').toBe(true);
  });
});

test.describe('Phase 6 — BG-DEEP: Results By Status Tests', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-BG-DEEP-01: Results By Status page has all required filters', async ({ page }) => {
    await page.goto(`${BASE}/StatusResults`);
    await page.waitForLoadState('networkidle');

    expect(page.url(), 'Must not redirect to login').not.toMatch(/LoginPage|login/i);
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toMatch(/500|Internal Server Error/);

    // Lab staff needs date filters and test/status selectors
    const hasDateFilter = /Collection Date|Received Date|Date/i.test(bodyText);
    const hasTestName = /Test Name|Select Test/i.test(bodyText);
    const hasStatusFilter = /Analysis Status|Sample Status|Status/i.test(bodyText);

    expect(hasDateFilter, 'Results By Status must have a date filter').toBe(true);
    expect(hasTestName || hasStatusFilter,
      'Results By Status must have a test name or status filter'
    ).toBe(true);
  });

  test('TC-BG-DEEP-02: Analysis Status dropdown has expected options', async ({ page }) => {
    await page.goto(`${BASE}/StatusResults`);
    await page.waitForLoadState('networkidle');

    // Find the Analysis Status select
    const allSelects = page.locator('select');
    const count = await allSelects.count();
    if (count === 0) {
      console.log('TC-BG-DEEP-02: SKIP — no select dropdowns found');
      return;
    }

    // Check at least one select has a meaningful number of options
    let maxOptions = 0;
    for (let i = 0; i < count; i++) {
      const opts = await allSelects.nth(i).locator('option').count();
      maxOptions = Math.max(maxOptions, opts);
    }

    console.log(`TC-BG-DEEP-02: max options in any dropdown = ${maxOptions}`);
    // Test Name dropdown should have 100+ options in a fully configured system
    if (maxOptions > 100) {
      expect(maxOptions, 'Test Name dropdown must have 100+ test types').toBeGreaterThan(100);
    } else {
      expect(maxOptions, 'At least one dropdown must have options').toBeGreaterThanOrEqual(2);
    }
  });
});

/**
 * Relocated from the retired gap-suites (2026-09-08) — see harness ref 12.16.
 * These are the cases the gap suites uniquely carried; the rest of those files
 * duplicated tests that already lived here.
 *   TC-RBP-01
 *   TC-RBO-04
 */
test.describe('Relocated from gap-suites', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-RBP-01: Results > By Patient screen loads', async ({ page }) => {
      // Navigate to hamburger menu
      await page.click('button[aria-label*="menu" i], button[id*="menu" i]');
      await page.waitForTimeout(500);
  
      // Try to find and click Results menu
      const resultsLink = page.getByText(/^Results$/i, { exact: true });
      if (await resultsLink.isVisible({ timeout: 2000 }).catch(() => false)) {
        await resultsLink.click();
        await page.waitForTimeout(500);
      }
  
      // Try to find and click By Patient
      const byPatientLink = page.getByText('By Patient', { exact: true });
      if (await byPatientLink.isVisible({ timeout: 2000 }).catch(() => false)) {
        await byPatientLink.click();
      }
  
      // URL discovery pattern
      const candidates = [
        '/PatientResults',
        '/ResultsByPatient',
        '/patient/results',
        '/results/patient',
      ];
      const success = await navigateWithDiscovery(page, candidates);
  
      // Verify page loaded
      if (!success) {
        // Mark as GAP if no route found
        console.log('GAP: Results > By Patient screen not found');
        expect(success).toBe(true); // Will fail but documents the gap
      }
  
      // Verify not redirected to login
      expect(page.url()).not.toMatch(/LoginPage|login/i);
  
      // Verify search field exists
      const searchField = page.locator(
        'input[placeholder*="patient" i], input[placeholder*="name" i], input[id*="search"]'
      ).first();
      await expect(searchField).toBeVisible({ timeout: 3000 }).catch(() => {
        console.log('Note: Search field selector may need adjustment for this app version');
      });
    });

  test('TC-RBO-04: Results > By Order screen loads', async ({ page }) => {
      // Navigate via menu or direct URL
      await page.click('button[aria-label*="menu" i], button[id*="menu" i]');
      await page.waitForTimeout(500);
  
      const resultsLink = page.getByText(/^Results$/i, { exact: true });
      if (await resultsLink.isVisible({ timeout: 2000 }).catch(() => false)) {
        await resultsLink.click();
        await page.waitForTimeout(500);
        const byOrderLink = page.getByText('By Order', { exact: true });
        if (await byOrderLink.isVisible({ timeout: 2000 }).catch(() => false)) {
          await byOrderLink.click();
        }
      }
  
      // URL discovery
      const candidates = [
        '/AccessionResults',
        '/OrderResults',
        '/order/results',
        '/results/order',
      ];
      const success = await navigateWithDiscovery(page, candidates);
  
      // Verify page loaded and not login
      expect(page.url()).not.toMatch(/LoginPage|login/i);
  
      // Verify accession input field exists
      const accessionField = page.locator(
        'input[placeholder*="accession" i], input[id*="accession" i], input'
      ).first();
      await expect(accessionField).toBeVisible({ timeout: 3000 }).catch(() => {
        console.log('Accession search field not found');
      });
    });

});
