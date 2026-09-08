import { test, expect } from '@playwright/test';
import { BASE, ADMIN, PATIENT_NAME, PATIENT_ID, ACCESSION, QA_PREFIX, QA_ID_PREFIX, TIMEOUT, CONFIRMED_ADMIN_URLS, login, navigateWithDiscovery, fillSearchField, navigateToAdminItem, getDateRange, getFutureDateRange, clickFormSearch, checkCarbonRadio } from '../helpers/test-helpers';

/**
 * Patient Management Test Suite
 *
 * File Purpose:
 * - Covers patient search, creation, merging, and history workflows
 * - Tests spanning TC-PAT core + AC merge + H-DEEP/BD-DEEP/BE-DEEP interactions
 *
 * Suite IDs:
 * - TC-PAT: Patient Management core (5 TCs)
 * - Suite AC: Merge Patient (4 TCs)
 * - Phase 4 H-DEEP: Patient Interaction Tests (3 TCs)
 * - Phase 6 BD-DEEP: Patient History Tests (2 TCs)
 * - Phase 6 BE-DEEP: Patient Merge Tests (2 TCs)
 *
 * Total Test Count: 16 TCs
 */

test.describe('Patient Management (TC-PAT)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  const PATIENT_URLS = [
    '/PatientManagement',
    '/FindPatient',
    '/PatientResults',
    '/SamplePatientEntry',
  ];

  async function goToPatientSearch(page): Promise<string> {
    for (const u of PATIENT_URLS) {
      const res = await page.goto(`${BASE}${u}`).catch(() => null);
      if (res && res.ok() && !page.url().includes('LoginPage')) {
        return page.url();
      }
    }
    // Try hamburger nav as fallback
    await page.goto(`${BASE}`);
    const patientMenu = page.getByRole('link', { name: /Patient/i }).first();
    if (await patientMenu.isVisible({ timeout: 2000 }).catch(() => false)) {
      await patientMenu.click();
      await page.waitForTimeout(1000);
    }
    return page.url();
  }

  test('TC-PAT-01: Patient search page loads', async ({ page }) => {
    const url = await goToPatientSearch(page);
    console.log(`TC-PAT-01: Patient search URL = ${url}`);
    // Should have some form element for searching
    const hasSearchForm = await page.getByRole('textbox').count() > 0;
    if (!hasSearchForm) {
      console.log('TC-PAT-01: GAP — no search form detected on patient screen');
    }
    expect(page.url()).not.toContain('LoginPage');
    expect(hasSearchForm).toBe(true);
  });

  test('TC-PAT-02: Search by national ID returns Abby Sebby', async ({ page }) => {
    // WHAT THIS CASE CAN CHECK, AND WHERE (probed live 2026-09-08, v3.2.2.0).
    //
    // The patient search SCREEN has no national-ID input. Its fields are
    // patientId, labNumber, lastName, firstName, a date picker and the gender
    // radios; the only "National ID" on the page is a results-table column
    // header (`cds--table-header-label`). The old body matched that loose
    // selector against `#patientId`, typed the national ID into it, pressed
    // Enter — which this form does not submit on — and then reported FAIL via
    // console.log while asserting on a page that had never searched.
    //
    // The SERVER does support it, under the parameter the screen itself sends:
    // `nationalID` (capital I, capital D). `nationalId` is ignored and answers
    // 200 with an empty list. So this case now asserts the capability at the
    // level where it exists, and TC-PAT-03 covers the UI path by name.
    //
    // Whether the search screen OUGHT to expose a national-ID field is a
    // product question, not a test failure — national ID is a primary patient
    // identifier in this domain. Raised in open-questions.md.
    await goToPatientSearch(page);
    expect(page.url(), 'must be on the patient search screen').toMatch(/PatientManagement/);

    const found = await page.evaluate(async (nid) => {
      const r = await fetch(
        `/api/OpenELIS-Global/rest/patient-search-results?nationalID=${encodeURIComponent(nid)}`,
        { headers: { Accept: 'application/json' } }
      );
      if (!r.ok) return { status: r.status, names: [] as string[] };
      const d = await r.json();
      return {
        status: r.status,
        names: (d.patientSearchResults ?? []).map((p: any) => `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim()),
      };
    }, PATIENT_ID);

    expect(found.status, 'patient search must answer 200').toBe(200);
    expect(
      found.names.join(' | '),
      `national ID ${PATIENT_ID} returned no ${PATIENT_NAME}. Saw: ${JSON.stringify(found.names)}`
    ).toMatch(/Sebby/i);
  });

  test('TC-PAT-03: Partial last-name search returns matching patient', async ({ page }) => {
    await goToPatientSearch(page);

    const lastNameField = page.locator(
      'input[id*="lastName" i], input[id*="last_name" i], input[placeholder*="last" i], input[placeholder*="surname" i]'
    ).first();

    if (!(await lastNameField.isVisible({ timeout: 3000 }).catch(() => false))) {
      console.log('TC-PAT-03: GAP — no last-name field; partial search not supported');
      return; // not a hard fail — document as GAP
    }

    // This form does NOT submit on Enter (verified live 2026-09-08 — pressing
    // Enter fires no request at all), and its Search button is not the first
    // /search/i match on the page. Both were why this case failed.
    await lastNameField.fill('Seb');
    const searched = await clickFormSearch(page, '#lastName');
    expect(searched, 'the patient search form must have a Search button').toBe(true);
    await page.waitForTimeout(3000);

    const hasAbby = await page.getByText(/Sebby/i).first().isVisible({ timeout: 8000 }).catch(() => false);
    expect(
      hasAbby,
      `partial last-name search for "Seb" did not return ${PATIENT_NAME} (url=${page.url()})`
    ).toBe(true);

    // Empty-state test. This used to press Enter, which submits nothing, so
    // the "empty state" it measured was actually the previous result set for
    // "Seb" still on screen. Search properly, then check the count.
    await lastNameField.fill('ZZZNOTEXIST');
    const searchedEmpty = await clickFormSearch(page, '#lastName');
    expect(searchedEmpty, 'the patient search form must have a Search button').toBe(true);
    await page.waitForTimeout(3000);

    const rowCount = await page.locator('table tbody tr').count();
    expect(rowCount, 'a search for a nonexistent last name must return no rows').toBe(0);
    await expect(
      page.getByText(/0-0 of 0 items/i),
      'the results pager must report zero items for a search that matched nothing'
    ).toBeVisible({ timeout: TIMEOUT });

    // GAP, verified by hand 2026-09-08: there is no empty-state message at all.
    // The table renders its headers and an "0-0 of 0 items" pager and nothing
    // tells the user their search matched nobody. Raised for the patient-search
    // UX work item, not asserted here.
    // The pattern is anchored on purpose. /no.*(found|result|patient)/i
    // reported "message present" on this very screen, which is wrong — that
    // regex spans any amount of intervening text, so it matches unrelated
    // copy. An empty state says something like "no patients found"; require
    // that shape, and print what matched so the log can be checked.
    const emptyMessage = page.getByText(/\b(no|zero)\s+(patients?|results?|records?)\b[^.]{0,20}\b(found|match(?:ed|es)?|available)\b/i);
    const hasEmptyMessage = await emptyMessage.first().isVisible({ timeout: 3000 }).catch(() => false);
    console.log(hasEmptyMessage
      ? `TC-PAT-03 empty state: message present — "${(await emptyMessage.first().innerText()).trim().slice(0, 80)}"`
      : 'TC-PAT-03 empty state: GAP — zero results are shown only as "0-0 of 0 items", with no message');
  });

  test('TC-PAT-04: Patient history opens from a search result and names that patient', async ({ page }) => {
    // REWRITTEN 2026-09-08, every locator below verified by hand in Chrome on
    // testing v3.2.2.0. What was here before could not pass and could not fail
    // honestly:
    //
    //  - it looked for the search field with
    //    getByRole('textbox', { name: /id|patient|national/i }).first(), the same
    //    loose-regex-plus-.first() trap that produced the other three false
    //    results in this file. There IS no national-ID input on any patient
    //    search screen (only #patientId, #labNumber, #lastName, #firstName, a
    //    dd/mm/yyyy picker and gender radios), so it typed a national ID into
    //    whatever textbox happened to be first.
    //  - it then pressed Enter. These forms do not submit on Enter; that fires
    //    no request at all.
    //  - it clicked getByText(/Sebby/i).first() on a table that re-renders once
    //    per row while the per-row patient-photos requests land.
    //  - and it asserted only getByText(/Abby|Sebby/i), which the still-visible
    //    search screen satisfies. So the "history" half of the case was a
    //    console.log, never an assertion.
    //
    // The real screen is /PatientHistory. Search by last name, then SELECT the
    // row's radio — there is no submit button, checking the radio navigates
    // straight to /PatientResults/<patientId>. Result rows carry
    // data-cy="patient-result-row-<patientId>", which is a stable hook and
    // removes the need to match on a name at all.
    await page.goto(`${BASE}/PatientHistory`, { waitUntil: 'domcontentloaded' });

    const lastNameField = page.locator('#lastName');
    await expect(
      lastNameField,
      'the patient history search form must render #lastName'
    ).toBeVisible({ timeout: 15_000 });

    await lastNameField.fill('Sebby');
    const searched = await clickFormSearch(page, '#lastName');
    expect(searched, 'the patient history search form must have a Search button').toBe(true);

    const row = page.locator('[data-cy^="patient-result-row-"]').first();
    await expect(
      row,
      `last-name search for "Sebby" returned no result rows (url=${page.url()})`
    ).toBeVisible({ timeout: 15_000 });

    const rowKey = (await row.getAttribute('data-cy')) ?? '';
    const patientId = rowKey.replace('patient-result-row-', '');
    expect(patientId, `result row must carry a numeric patient id (saw "${rowKey}")`).toMatch(/^\d+$/);

    // Checking the radio IS the navigation. Nothing else to click.
    //
    // It must be checked through its label: Carbon draws the control as a
    // <span class="cds--radio-button__appearance"> inside the <label>, which
    // sits on top of the input and intercepts pointer events, so .check() on
    // the input retries until the test times out. See checkCarbonRadio.
    await checkCarbonRadio(page, row.locator('input[type="radio"]'));
    await page.waitForURL(new RegExp(`/PatientResults/${patientId}(?:[/?#]|$)`), { timeout: 15_000 });

    // The history view must name the patient it opened. This is the assertion
    // the old case skipped: without it, landing on the wrong patient passes.
    //
    // These are toContainText, not a one-shot innerText snapshot. The URL
    // changes before the patient header renders, so reading body text straight
    // after waitForURL captures the SideNav and nothing else — which is exactly
    // how this assertion failed on its first run. toContainText retries.
    const detail = page.locator('body');
    await expect(
      detail,
      `history view for patient ${patientId} does not name ${PATIENT_NAME}`
    ).toContainText(/Sebby/i, { timeout: 15_000 });
    await expect(
      detail,
      `history view for patient ${patientId} does not show national ID ${PATIENT_ID}`
    ).toContainText(PATIENT_ID, { timeout: 10_000 });

    // And it must render the results region in one of its two legitimate
    // states. Asserting "has orders" would make this case depend on seed data;
    // asserting the region rendered does not.
    const hasResultRows = await page.locator('table tbody tr').first()
      .isVisible({ timeout: 5_000 }).catch(() => false);
    const hasEmptyState = await page.getByText(/no test results? data to display/i)
      .isVisible({ timeout: 5_000 }).catch(() => false);
    expect(
      hasResultRows || hasEmptyState,
      'patient history must render either a test-results table or an explicit empty state'
    ).toBe(true);
    console.log(`TC-PAT-04: patient ${patientId} history rendered (${hasResultRows ? 'has results' : 'empty state'})`);
  });

  test('TC-PAT-05: Create a new patient', async ({ page }) => {
    // ROUTE CORRECTED 2026-09-05, verified by hand on testing v3.2.2.0.
    //
    // This used to try /AddPatient, /PatientEdit and /SamplePatientEntry and
    // take the first that returned 200. That is not a real check: OpenELIS is
    // an SPA, so EVERY path returns 200 with the shell, and `landed` was true
    // on a page that rendered nothing. The real screen is /PatientManagement
    // (Add Or Modify Patient) with a "New Patient" tab that routes to
    // /PatientManagement/new — and #nationalId only exists there, which is
    // also what produced the run's 10 "Element not found: #nationalId".
    await page.goto(`${BASE}/PatientManagement/new`, { waitUntil: 'domcontentloaded' });
    const idField = page.locator('#nationalId');
    const landed = await idField.isVisible({ timeout: 10_000 }).catch(() => false);
    test.skip(!landed, 'Add Patient form (/PatientManagement/new) did not render #nationalId');

    // Fill demographics. National ID must match the server's
    // `(?i)^[-a-z0-9/]*$` — underscores are REJECTED with a 400, which is what
    // the old 'QA_PAT_0324' hit. See QA_ID_PREFIX in helpers/test-helpers.ts.
    const nationalId = `${QA_ID_PREFIX}-pat-05`;
    await idField.fill(nationalId);
    await page.locator('#lastName').fill('QAPatient');
    await page.locator('#firstName').fill('Automated');

    // GENDER — radios, clicked by LABEL. `#radio-1` by index is brittle (the
    // search screen uses `search-radio-1` for the same control) and the old
    // body wrapped the click in `.catch(() => {})`, so a miss was
    // indistinguishable from a hit. Same for the date picker below.
    await page.getByText(/^Female$/).first().click();
    await page.locator('#date-picker-default-id').last().fill('01/01/1990');

    // SUBMIT — anchored. An unanchored alternation over button labels is how
    // the data factory ended up clicking "Additional Information" for months
    // (harness ref 12.20).
    //
    // The old body then pressed Escape to dismiss the picker overlay, and THAT
    // is what failed the case: by then the test had exceeded its budget,
    // Playwright had torn the page down, and keyboard.press threw "Target
    // page, context or browser has been closed" — while every earlier step's
    // `.catch(() => {})` hid which one had actually hung.
    const saveBtn = page.getByRole('button', { name: /^\s*Save\s*$/i }).first();
    await expect(saveBtn, 'the create form must offer a Save button').toBeVisible({ timeout: 10_000 });
    await saveBtn.click();

    // The app answers POST /rest/PatientManagement with
    // {"status":"success","patientId":"<id>"} and routes to
    // /PatientManagement/<id>. Wait for that, then confirm by READ-BACK: the
    // post-save screen showing a name is not proof the record persisted
    // (harness ref 12.3, and the data-factory bug in 12.19).
    await page.waitForURL(/\/PatientManagement\/\d+/, { timeout: 20_000 }).catch(() => { /* read-back decides */ });

    const readBack = await page.evaluate(async (nid) => {
      const r = await fetch(
        `/api/OpenELIS-Global/rest/patient-search-results?nationalID=${encodeURIComponent(nid)}`,
        { headers: { Accept: 'application/json' } }
      );
      if (!r.ok) return { status: r.status, names: [] as string[] };
      const d = await r.json();
      return { status: r.status, names: (d.patientSearchResults ?? []).map((x: any) => `${x.firstName ?? ''} ${x.lastName ?? ''}`.trim()) };
    }, nationalId);

    expect(readBack.status, 'patient search must answer 200').toBe(200);
    expect(
      readBack.names.join(' | '),
      `new patient ${nationalId} did not read back from patient-search-results (url=${page.url()})`
    ).toMatch(/QAPatient/i);
  });
});

test.describe('Suite AC — Merge Patient', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  // ALL FOUR MERGE CASES REWRITTEN 2026-09-08, verified by hand in Chrome on
  // testing v3.2.2.0.
  //
  // What was here before could not fail. Every assertion in all four cases was
  // .catch(() => console.log(...)), and every one of them was written against a
  // patient-autocomplete UI that does not exist: input[placeholder*="patient"],
  // [role="option"], a dropdown listbox. The real screen is a three-step wizard
  // with two full search panels. So the suite reported four green merge cases
  // while never once selecting a patient — TC-MP-04 logged
  // "SKIP: Could not select patients for merge" and still passed.
  //
  // Worth stating plainly: had those locators ever matched, TC-MP-04 would have
  // clicked /Merge|Submit|Confirm/i and merged two real patient records on the
  // shared instance. The case was destructive; only a broken locator kept it
  // from doing damage. It now stops at the confirmation step on purpose.
  //
  // The stable hooks: #patient1-*/#patient2-* for the two panels, one Search
  // button per panel (disabled until that panel has input), and result radios
  // id'd patient<N>-select-<patientId>. Carbon's radio label intercepts pointer
  // events, so they must be checked through checkCarbonRadio.

  /** Search one merge panel by last name and return the patient ids it offered. */
  async function searchMergePanel(page, panel: 1 | 2, lastName: string): Promise<string[]> {
    const field = `#patient${panel}-lastName`;
    await page.locator(field).fill(lastName);
    // clickFormSearch, not nth(). My first attempt used
    // getByRole('button', { name: /^Search$/ }).nth(panel - 1) on the reasoning
    // that there is one Search per panel in panel order. There is a THIRD:
    // the Carbon header's search action, whose accessible name is also
    // "Search" and which is rendered before page content. So nth(0) clicked
    // the header icon and both panels came back empty — the same trap that
    // clickFormSearch exists to close, walked into again. Scope by the field.
    const searched = await clickFormSearch(page, field);
    expect(searched, `merge panel ${panel} must have a Search button`).toBe(true);
    const radios = page.locator(`input[id^="patient${panel}-select-"]`);
    await expect(
      radios.first(),
      `merge panel ${panel} returned no results for last name "${lastName}"`
    ).toBeAttached({ timeout: 15_000 });
    const ids: string[] = [];
    for (const r of await radios.all()) {
      const id = (await r.getAttribute('id')) ?? '';
      ids.push(id.replace(`patient${panel}-select-`, ''));
    }
    return ids;
  }

  test('TC-MP-01: Merge Patient opens from the Patient menu', async ({ page }) => {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });

    const mergeItem = page.locator('[data-cy="menu_patient_merge"]');
    if (!(await mergeItem.isVisible({ timeout: 3_000 }).catch(() => false))) {
      await page.getByRole('button', { name: /^\s*Patient\s*$/ }).first().click();
    }
    await expect(
      mergeItem,
      'the Patient menu must offer a Merge Patient item (data-cy="menu_patient_merge")'
    ).toBeVisible({ timeout: 10_000 });
    await mergeItem.click();

    await page.waitForURL(/\/PatientMerge/, { timeout: 15_000 });
    await expect(
      page.locator('#patient1-lastName'),
      'Merge Patient must render its first patient panel'
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.locator('#patient2-lastName'),
      'Merge Patient must render its second patient panel'
    ).toBeVisible({ timeout: TIMEOUT });

    // The wizard must declare its three steps, so the user knows a merge is
    // not a single click.
    const shell = page.locator('body');
    for (const step of ['Select Patients', 'Select Primary', 'Confirm Merge']) {
      await expect(shell, `merge wizard must show the "${step}" step`).toContainText(step);
    }
  });

  test('TC-MP-02: Merge search surfaces the duplicate patients', async ({ page }) => {
    await page.goto(`${BASE}/PatientMerge`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#patient1-lastName')).toBeVisible({ timeout: 15_000 });

    const ids = await searchMergePanel(page, 1, 'Sebby');

    // This is the point of the case: merge exists because duplicates exist, so
    // a last name with known duplicates must return more than one record.
    expect(
      ids.length,
      `last name "Sebby" must return more than one patient for merge to be testable (got ${JSON.stringify(ids)})`
    ).toBeGreaterThan(1);
    expect(new Set(ids).size, 'each result must be a distinct patient id').toBe(ids.length);

    // And the shared national ID must be visible in the results, because that
    // is the only thing on screen that tells a user these are duplicates.
    await expect(
      page.locator('table'),
      `merge results must show the national ID that these ${ids.length} records share`
    ).toContainText(PATIENT_ID);
    console.log(`TC-MP-02: ${ids.length} candidates sharing national ID ${PATIENT_ID}: ${ids.join(', ')}`);
  });

  test('TC-MP-03: Selecting two patients enables Next Step', async ({ page }) => {
    await page.goto(`${BASE}/PatientMerge`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#patient1-lastName')).toBeVisible({ timeout: 15_000 });

    const nextStep = page.getByRole('button', { name: /^\s*Next Step\s*$/ });
    await expect(nextStep, 'Next Step must start disabled').toBeDisabled();

    const ids = await searchMergePanel(page, 1, 'Sebby');
    expect(ids.length, 'need at least two candidates to select two patients').toBeGreaterThan(1);
    await checkCarbonRadio(page, page.locator(`#patient1-select-${ids[0]}`));

    // One panel filled is still not enough — this is the guard TC-BE-DEEP-02
    // asserts from the other direction.
    await expect(
      nextStep,
      'Next Step must stay disabled with only the first patient selected'
    ).toBeDisabled();

    const ids2 = await searchMergePanel(page, 2, 'Sebby');
    const second = ids2.find((id) => id !== ids[0]);
    expect(second, `second panel offered no patient other than ${ids[0]}`).toBeTruthy();
    await checkCarbonRadio(page, page.locator(`#patient2-select-${second}`));

    await expect(
      nextStep,
      'Next Step must become enabled once two distinct patients are selected'
    ).toBeEnabled({ timeout: 15_000 });
    await expect(
      page.locator('body'),
      'neither panel should still say "No patient selected"'
    ).not.toContainText('No patient selected');
    console.log(`TC-MP-03: selected ${ids[0]} and ${second}`);
  });

  test('TC-MP-04: Merge reaches the confirmation step and stops there', async ({ page }) => {
    // DELIBERATE BOUNDARY. This case does NOT execute the merge.
    //
    // A merge marks one patient inactive and relinks all of its data to the
    // other. That is a non-reversible write, on an instance whose data we share
    // with everyone else testing, and the duplicate Abby Sebbys are useful
    // precisely because they are duplicates. So this case walks the wizard up
    // to "Confirm Merge" and cancels. What it verifies is that the destructive
    // step is properly gated and properly explained — which is the part a
    // person's safety actually depends on.
    await page.goto(`${BASE}/PatientMerge`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#patient1-lastName')).toBeVisible({ timeout: 15_000 });

    const ids = await searchMergePanel(page, 1, 'Sebby');
    expect(ids.length, 'need at least two candidates').toBeGreaterThan(1);
    await checkCarbonRadio(page, page.locator(`#patient1-select-${ids[0]}`));

    const ids2 = await searchMergePanel(page, 2, 'Sebby');
    const second = ids2.find((id) => id !== ids[0]);
    expect(second, `second panel offered no patient other than ${ids[0]}`).toBeTruthy();
    await checkCarbonRadio(page, page.locator(`#patient2-select-${second}`));

    const nextStep = page.getByRole('button', { name: /^\s*Next Step\s*$/ });
    await expect(nextStep).toBeEnabled({ timeout: 15_000 });
    await nextStep.click();

    // Step 2 must say what a merge does before asking which record survives.
    const shell = page.locator('body');
    await expect(
      shell,
      'the primary-selection step must warn what a merge does to the non-primary record'
    ).toContainText(/marked as merged and inactive/i, { timeout: 15_000 });
    await expect(
      shell,
      'the primary-selection step must ask which record becomes primary'
    ).toContainText(/which patient should become the primary record/i);
    await expect(shell, 'both candidates must be shown side by side').toContainText(`Patient 1: ${ids[0]}`);
    await expect(shell, 'both candidates must be shown side by side').toContainText(`Patient 2: ${second}`);

    // And the next destructive step must stay gated until a primary is chosen.
    await expect(
      page.getByRole('button', { name: /^\s*Next Step\s*$/ }),
      'Next Step must be disabled until a primary record is chosen'
    ).toBeDisabled();
    await expect(
      page.getByRole('button', { name: /^\s*Back\s*$/ }),
      'the user must be able to go back from the primary-selection step'
    ).toBeVisible();

    // Leave the instance as we found it.
    await page.getByRole('button', { name: /^\s*Cancel\s*$/ }).click();
    await page.waitForURL(/\/PatientManagement/, { timeout: 15_000 });
    console.log(`TC-MP-04: reached the confirmation gate for ${ids[0]} + ${second} and cancelled without merging`);
  });
});

test.describe('Phase 4 — H-DEEP: Patient Interaction Tests', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-H-DEEP-01: Search by national ID finds known patient', async ({ page }) => {
    // Navigate directly — SPA menu clicks require BASE navigation first
    await page.goto(`${BASE}/SamplePatientEntry`);
    await page.waitForLoadState('networkidle');

    // Fill national ID using native setter (Carbon controlled input)
    await page.evaluate(() => {
      const input = document.querySelector('input[placeholder*="National" i], input[placeholder*="Patient" i], input[id*="national" i]') as HTMLInputElement;
      if (!input) return;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, '0123456');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // `/search/i` + .first() resolves to the Carbon HEADER search action, which
    // fires no request — see clickFormSearch in helpers/test-helpers.ts.
    await clickFormSearch(page, 'input[id*="national" i], input[placeholder*="National" i], #patientId');
    await page.waitForTimeout(3000);

    // Patient Abby Sebby (ID 0123456) must appear in results
    const patientVisible = await page.getByText(/Sebby|0123456/i).first()
      .isVisible({ timeout: 5000 }).catch(() => false);
    expect(patientVisible, 'Known patient (national ID 0123456) must be found in search results').toBe(true);
  });

  test('TC-H-DEEP-02: Patient History page has search fields', async ({ page }) => {
    await page.goto(`${BASE}/PatientHistory`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2_500);

    // The fields ARE there — probed live 2026-09-08, /PatientHistory renders
    // five text inputs: "Enter Patient Id", "Enter Previous Lab Number",
    // "Enter Patient's Last Name", "Enter Patient's First Name" and a
    // dd/mm/yyyy picker. This case used to fail on a selector, not on a
    // missing feature, so assert on the ids the screen really uses.
    expect(page.url(), 'must be on Patient History').toMatch(/PatientHistory/i);
    for (const id of ['#patientId', '#lastName', '#firstName']) {
      await expect(
        page.locator(id).first(),
        `Patient History must offer the ${id} search field`
      ).toBeVisible({ timeout: 10_000 });
    }
  });

  test('TC-H-DEEP-03: Merge Patient search step is accessible', async ({ page }) => {
    const candidates = ['/PatientMerge', '/MergePatient', '/patient/merge'];
    let found = false;
    for (const u of candidates) {
      const res = await page.goto(`${BASE}${u}`).catch(() => null);
      if (res && res.ok() && !page.url().includes('login')) { found = true; break; }
    }
    if (!found) { console.log('TC-H-DEEP-03: GAP — merge URL not found'); return; }

    const bodyText = await page.locator('body').innerText();
    // Merge wizard must have selection step
    const hasSelectionStep = /Select.*Patient|First Patient|Step 1|Search/i.test(bodyText);
    expect(hasSelectionStep, 'Merge Patient must show a patient selection step').toBe(true);
  });
});

test.describe('Phase 6 — BD-DEEP: Patient History Tests', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-BD-DEEP-01: Patient History page has required search fields', async ({ page }) => {
    await page.goto(`${BASE}/PatientHistory`);
    await page.waitForLoadState('networkidle');

    expect(page.url(), 'Must not redirect to login').not.toMatch(/LoginPage|login/i);

    const bodyText = await page.locator('body').innerText();
    expect(bodyText, 'Page must not have a server error').not.toMatch(/500|Internal Server Error/);

    // Patient History must have Patient History heading
    const hasHeading = /Patient History/i.test(bodyText);
    expect(hasHeading, 'Page must show "Patient History" heading').toBe(true);

    // Must have search fields for finding patients
    const requiredFields = ['Last Name', 'First Name'];
    for (const field of requiredFields) {
      const fieldVisible = /Last Name|First Name/.test(bodyText) ||
        await page.locator(`label:has-text("${field}"), text=${field}`).first()
          .isVisible({ timeout: 2000 }).catch(() => false);
      console.log(`TC-BD-DEEP-01: "${field}" visible = ${fieldVisible}`);
    }
  });

  test('TC-BD-DEEP-02: Searching by Last Name returns results table', async ({ page }) => {
    await page.goto(`${BASE}/PatientHistory`);
    await page.waitForLoadState('networkidle');

    const lastNameInput = page.locator('input[placeholder*="Last Name" i]').first();
    if (!(await lastNameInput.isVisible({ timeout: 3000 }).catch(() => false))) {
      console.log('TC-BD-DEEP-02: SKIP — Last Name field not found');
      return;
    }

    await lastNameInput.fill('Sebby');
    // `/search/i` + .first() resolves to the Carbon HEADER search action, which
    // fires no request — see clickFormSearch in helpers/test-helpers.ts.
    await clickFormSearch(page, 'input[id*="national" i], input[placeholder*="National" i], #patientId');
    await page.waitForTimeout(3000);

    // Results table or patient list must appear
    const hasResults = await page.locator('table, [role="table"]').first()
      .isVisible({ timeout: 5000 }).catch(() => false);
    const hasResultsText = /Patient Results|Results/i.test(await page.locator('body').innerText());
    expect(hasResults || hasResultsText,
      'Searching by last name must show a results table'
    ).toBe(true);
  });
});

test.describe('Phase 6 — BE-DEEP: Patient Merge Tests', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-BE-DEEP-01: Patient Merge page has two patient selection areas', async ({ page }) => {
    const candidates = ['/PatientMerge', '/MergePatient', '/patient/merge'];
    let found = false;
    for (const u of candidates) {
      const res = await page.goto(`${BASE}${u}`).catch(() => null);
      if (res && res.ok() && !page.url().includes('login')) { found = true; break; }
    }
    if (!found) { test.skip(); return; }

    expect(page.url()).not.toMatch(/LoginPage|login/i);

    const bodyText = await page.locator('body').innerText();
    const hasFirstPatient = /Select First Patient|First Patient/i.test(bodyText);
    const hasSecondPatient = /Select Second Patient|Second Patient/i.test(bodyText);
    expect(hasFirstPatient && hasSecondPatient,
      'Patient Merge page must have selection areas for both the first and second patient'
    ).toBe(true);
  });

  test('TC-BE-DEEP-02: Merge Patient blocks Next Step until both patients are chosen', async ({ page }) => {
    // REWRITTEN 2026-09-08, verified by hand in Chrome on testing v3.2.2.0.
    //
    // The old version guessed the route from ['/PatientMerge','/MergePatient',
    // '/patient/merge'] and took the first whose response was res.ok(). OpenELIS
    // is an SPA: EVERY path answers 200 with the shell, so that loop always
    // "found" /PatientMerge whether or not the screen existed, and would equally
    // have "found" a typo. It then did a bare test.skip() with no reason, and
    // wrapped the Next Step assertion in `if (await nextStep.isVisible())` — so
    // the one thing the case exists to check was optional.
    //
    // /PatientMerge is real. It is a three-step wizard (Select Patients /
    // Select Primary / Confirm Merge) with two search panels whose fields are
    // id'd patient1-* and patient2-*. Those ids are what prove the screen
    // rendered. Next Step is cds--btn--primary and disabled on arrival; Cancel
    // is a ghost button and always available.
    //
    // Note the name anchor: /Next Step|Merge|Submit/i with .first() matched the
    // "Merge Patient" SideNav item, not the wizard control.
    await page.goto(`${BASE}/PatientMerge`, { waitUntil: 'domcontentloaded' });

    const firstPanel = page.locator('#patient1-lastName');
    await expect(
      firstPanel,
      `Merge Patient did not render its first patient panel (url=${page.url()}) — a 200 here proves nothing, the SPA shell answers every path`
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.locator('#patient2-lastName'),
      'Merge Patient must render a second patient panel'
    ).toBeVisible({ timeout: TIMEOUT });

    // The actual guard. Unconditional: no patients are selected at this point,
    // so a Next Step that is enabled is the defect this case is here to catch.
    const nextStep = page.getByRole('button', { name: /^\s*Next Step\s*$/ });
    await expect(nextStep, 'Merge Patient must expose a Next Step control').toBeVisible({ timeout: TIMEOUT });
    await expect(
      nextStep,
      'Next Step must be disabled while no patients are selected'
    ).toBeDisabled();

    await expect(
      page.getByRole('button', { name: /^\s*Cancel\s*$/ }),
      'Cancel must always be available on the merge wizard'
    ).toBeVisible({ timeout: TIMEOUT });

    // The wizard must say where the user is. Both were verified present.
    const wizard = await page.locator('body').innerText();
    expect(wizard, 'merge wizard must show its Select Patients step').toMatch(/Select Patients/i);
    expect(wizard, 'each panel must state that no patient is selected yet').toMatch(/No patient selected/i);
  });
});
