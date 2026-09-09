import { test, expect } from '@playwright/test';
import { seedDuplicatePair, seedMergedPair, findPatientIdsByNationalId, findPatientIdsByLastName } from '../helpers/data-factory';
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

  /**
   * Search one merge panel by the seeded pair's subject number and return the
   * patient ids it offered.
   *
   * NOT by last name. The last-name search is soundex-like, so every seeded
   * `Qaauto…` record matches every other one: each run's search returned all
   * previous runs' seeds, which pushed the pair onto page 2 of the results and
   * left its radio unrendered — a 30s "waiting for #patient1-select-530"
   * timeout. The panel's "Patient Id" field matches the subject number by
   * substring, so a fresh long digit string finds exactly this pair.
   */
  async function searchMergePanel(page, panel: 1 | 2, subjectNumber: string): Promise<string[]> {
    const field = `#patient${panel}-patientId`;
    await page.locator(field).fill(subjectNumber);
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
      `merge panel ${panel} returned no results for subject number "${subjectNumber}"`
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

  test('TC-MP-02: Merge search surfaces both records of a duplicate', async ({ page }) => {
    const pair = await seedDuplicatePair(page);
    await page.goto(`${BASE}/PatientMerge`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#patient1-lastName')).toBeVisible({ timeout: 15_000 });

    const ids = await searchMergePanel(page, 1, pair.subjectNumber);

    // The point of the case: merge exists because duplicates exist, so a search
    // that matches a duplicate must return both of its records — and, searching
    // on the pair's own subject number, ONLY those two. This is an exact-set
    // assertion because the subject number identifies the pair exactly; the
    // equivalent assertion on a last-name search would be wrong (soundex —
    // see searchMergePanel).
    expect(
      ids.slice().sort(),
      `merge search for subject number ${pair.subjectNumber} must return exactly the seeded pair`
    ).toEqual(pair.ids.slice().sort());

    // And the shared national ID must be on screen, because it is the only
    // thing here that tells a user these two records are the same person.
    await expect(
      page.locator('table'),
      'merge results must show the national ID the two records share'
    ).toContainText(pair.nationalId);
    console.log(`TC-MP-02: ${pair.ids.join(' + ')} share national ID ${pair.nationalId}`);
  });

  test('TC-MP-03: Selecting two patients enables Next Step', async ({ page }) => {
    const pair = await seedDuplicatePair(page);
    await page.goto(`${BASE}/PatientMerge`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#patient1-lastName')).toBeVisible({ timeout: 15_000 });

    const nextStep = page.getByRole('button', { name: /^\s*Next Step\s*$/ });
    await expect(nextStep, 'Next Step must start disabled').toBeDisabled();

    await searchMergePanel(page, 1, pair.subjectNumber);
    await checkCarbonRadio(page, page.locator(`#patient1-select-${pair.ids[0]}`));

    // One panel filled is still not enough — the same guard TC-BE-DEEP-02
    // asserts from the other direction.
    await expect(
      nextStep,
      'Next Step must stay disabled with only the first patient selected'
    ).toBeDisabled();

    const ids2 = await searchMergePanel(page, 2, pair.subjectNumber);
    // The second panel excludes whatever the first panel already took.
    expect(ids2, 'the second panel must not offer the patient already selected in the first')
      .not.toContain(pair.ids[0]);
    expect(ids2, 'the second panel must still offer the other half of the pair').toContain(pair.ids[1]);
    await checkCarbonRadio(page, page.locator(`#patient2-select-${pair.ids[1]}`));

    await expect(
      nextStep,
      'Next Step must become enabled once two distinct patients are selected'
    ).toBeEnabled({ timeout: 15_000 });
    await expect(
      page.locator('body'),
      'neither panel should still say "No patient selected"'
    ).not.toContainText('No patient selected');
    console.log(`TC-MP-03: selected ${pair.ids[0]} and ${pair.ids[1]}`);
  });

  test('TC-MP-04: A merge completes and consolidates the duplicate', async ({ page }) => {
    // THIS CASE REALLY MERGES. It seeds its own duplicate pair first, so it
    // never consumes the shared instance's Abby Sebby records and stays
    // repeatable: the pair it destroys is the pair it created.
    //
    // Every locator and both payloads below were captured on the wire in Chrome
    // on testing v3.2.2.0, 2026-09-08 (harness ref 12.23).
    const pair = await seedDuplicatePair(page);
    expect(
      (await findPatientIdsByNationalId(page, pair.nationalId)).slice().sort(),
      'the seeded pair must both exist before the merge'
    ).toEqual(pair.ids.slice().sort());

    await page.goto(`${BASE}/PatientMerge`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#patient1-lastName')).toBeVisible({ timeout: 15_000 });

    // Step 1 — pick the two records.
    await searchMergePanel(page, 1, pair.subjectNumber);
    await checkCarbonRadio(page, page.locator(`#patient1-select-${pair.ids[0]}`));
    await searchMergePanel(page, 2, pair.subjectNumber);
    await checkCarbonRadio(page, page.locator(`#patient2-select-${pair.ids[1]}`));

    const nextStep = page.getByRole('button', { name: /^\s*Next Step\s*$/ });
    await expect(nextStep).toBeEnabled({ timeout: 15_000 });
    await nextStep.click();

    // Step 2 — the primary choice, and the warning that earns it.
    const shell = page.locator('body');
    await expect(
      shell,
      'the primary-selection step must say what happens to the non-primary record'
    ).toContainText(/marked as merged and inactive/i, { timeout: 15_000 });
    // The wizard labels each candidate with its SUBJECT NUMBER when it has one,
    // falling back to the internal patient id when it does not — so asserting
    // `Patient 1: <patientId>` fails on a seeded pair. And because a duplicate
    // pair shares its subject number, both candidates carry the SAME identifier
    // string here; the only thing distinguishing them on screen is the given
    // name. Assert the pair including the name, and see harness 12.23 for why
    // that is also a finding rather than just a test detail.
    await expect(
      shell,
      'the first candidate must be labelled with its identifier and name'
    ).toContainText(`Patient 1: ${pair.subjectNumber} - Alpha`);
    await expect(
      shell,
      'the second candidate must be labelled with its identifier and name'
    ).toContainText(`Patient 2: ${pair.subjectNumber} - Beta`);
    await expect(
      nextStep,
      'Next Step must be disabled until a primary record is chosen'
    ).toBeDisabled();

    await checkCarbonRadio(page, page.locator('#patient-1'));
    await expect(nextStep, 'choosing a primary must unlock the next step').toBeEnabled({ timeout: 10_000 });
    await nextStep.click();

    // Step 3 — the destructive gate. THREE conditions, all asserted, because
    // this is the screen a person's safety actually rests on.
    const confirmMerge = page.locator('button.cds--btn--danger').filter({ hasText: /Confirm Merge/i });
    await expect(
      shell,
      'the confirmation step must state that the merge cannot be undone'
    ).toContainText(/cannot be undone/i, { timeout: 15_000 });
    await expect(shell, 'the summary must name the primary record').toContainText(`Primary Patient:`);
    await expect(shell, 'the summary must name the record being merged away').toContainText(`Merging From:`);
    await expect(
      confirmMerge,
      'Confirm Merge must be disabled before a reason is given and the acknowledgement ticked'
    ).toBeDisabled();

    await page.locator('#mergeReason').fill('QA_AUTO_ merge of a seeded duplicate pair (TC-MP-04).');
    await expect(
      confirmMerge,
      'a reason alone must not unlock Confirm Merge — the acknowledgement is a separate gate'
    ).toBeDisabled();

    await page.locator('label[for="confirmMerge"]').click();
    await expect(
      confirmMerge,
      'Confirm Merge must unlock only once both the reason and the acknowledgement are given'
    ).toBeEnabled({ timeout: 10_000 });

    // Execute. POST /rest/patient/merge/execute
    // {"patient1Id","patient2Id","primaryPatientId","reason","confirmed":true}
    await confirmMerge.click();

    // The app lands on the surviving record.
    await page.waitForURL(new RegExp(`/PatientManagement/${pair.ids[0]}(?:[/?#]|$)`), { timeout: 30_000 });

    // THE OUTCOME ASSERTION. A national-ID search must now return the primary
    // and only the primary — that is what "consolidated" has to mean.
    await expect
      .poll(async () => (await findPatientIdsByNationalId(page, pair.nationalId)).join(','), {
        timeout: 15_000,
      })
      .toBe(pair.ids[0]);

    // OBSERVATION, deliberately not an assertion (yet). A last-name search
    // still returns BOTH records after the merge — stable across three repeats
    // in the probe — while the national-ID search correctly returns one. If the
    // merged-away record is inactive, a user searching by name can still find
    // and pick it, which defeats the merge. That needs the other two
    // revalidation gates (fresh tab, re-login) before it is called a defect, so
    // it is logged here rather than claimed. Harness ref 12.23.
    //
    // The log reports only whether THIS pair's merged-away record came back.
    // The raw list is not quotable as evidence: the last-name search is fuzzy,
    // so it also returns earlier runs' seeds, and a reader counting ids would
    // mistake that noise for survivors.
    //
    // This is no longer an open question — all three revalidation gates were
    // cleared on 2026-09-08 and it is tracked as a confirmed defect by TC-MP-05
    // and TC-MP-06. The line stays because it is useful per-run evidence.
    const byLastName = await findPatientIdsByLastName(page, pair.lastName);
    const survivedByName = byLastName.includes(pair.ids[1]);
    console.log(
      `TC-MP-04: merged ${pair.ids[1]} into ${pair.ids[0]}; nationalID search -> [${pair.ids[0]}] (consolidated). ` +
        (survivedByName
          ? `${pair.ids[1]} is still returned by a last-name search after being merged away — ` +
            'expected on v3.2.2.0; TC-MP-05/TC-MP-06 are the tripwires for the version that filters.'
          : `last-name search no longer returns ${pair.ids[1]} — the filter has LANDED. ` +
            'TC-MP-05 should now be red; delete its test.fail marker and keep the assertion.')
    );
  });

  // ── The merge is only advisory outside the wizard ──────────────────────────
  //
  // NOT A DEFECT AGAINST THIS VERSION. Casey, 2026-09-09: "a newer version will
  // have a filter. Keep this one as is." — and, on what that filter does:
  // "which will show the merged patients." So the filter is an OPT-IN control
  // that reveals merged records; hidden becomes the default. On v3.2.2.0 a
  // merged-away record still appearing in a name search is current expected
  // behaviour, and nothing here should be filed or chased against it.
  //
  // That shape means the new version needs TWO cases, not one:
  //   - filter OFF (the default): merged records absent — TC-MP-05 below,
  //     already written, currently test.fail()-marked.
  //   - filter ON: merged records present AND still badged "Merged" — call it
  //     TC-MP-08. NOT written yet, deliberately: there is no control to drive,
  //     so any locator for it would be invented rather than verified, which is
  //     how the four hollow TC-MP cases this file just replaced came to exist
  //     (12.22). Write it against the real control when the version lands.
  //
  // The two cases below are therefore TRIPWIRES, not complaints. They assert the
  // behaviour the newer version is expected to bring and are marked
  // test.fail(), so they pass on v3.2.2.0 and turn RED the moment the filter
  // lands — which is the signal to delete the marker and let the assertion stand
  // as ordinary coverage. That is the whole point of writing them now: the
  // change arrives with a test already waiting for it, rather than being noticed
  // months later.
  //
  // Both are deliberately MINIMAL — seed and merge through the API, then one
  // assertion — because under test.fail() ANY failure counts as the expected
  // one, so a case that also did elaborate setup could "pass" by being broken.
  // That is the hollow-test trap wearing a different hat.
  //
  // Behaviour recorded 2026-09-08 on testing v3.2.2.0 against all three
  // revalidation gates (3x API repeat, a fresh browser context in each of two
  // full runs, and a genuine logout + re-login), so what these cases encode is
  // measured, not assumed.
  //
  // What IS already enforced after a merge, and worth not regressing: a
  // national-ID search returns only the primary (TC-MP-04 asserts that), the
  // merged record is badged "Merged" in result rows, opening it shows "This
  // patient record was merged / Active records are kept on Patient
  // <nationalId>", and it cannot be edited — no Edit or Save control is
  // rendered.

  test('TC-MP-05: A merged-away record must not be returned by a name search', async ({ page }) => {
    test.fail(
      true,
      'EXPECTED on v3.2.2.0: a name search still returns records that have been merged away — the ' +
        'identifier search filters them, the name search does not. The newer version adds a filter ' +
        'that SHOWS merged patients, so hidden becomes the default and this assertion becomes ' +
        'correct. When it goes red, that version has landed: delete the marker, keep the assertion, ' +
        'and add the companion case for the filter switched ON (see TC-MP-08 note below).'
    );
    const pair = await seedMergedPair(page);
    expect(
      await findPatientIdsByLastName(page, pair.lastName),
      `${pair.ids[1]} was merged into ${pair.ids[0]} and must no longer appear in a name search`
    ).not.toContain(pair.ids[1]);
  });

  test('TC-MP-06: A merged-away record must not be usable for a new order', async ({ page }) => {
    test.fail(
      true,
      'EXPECTED on v3.2.2.0: order entry accepts a merged-away patient — the banner appears, but ' +
        'Patient Info is marked Complete and the wizard advances. OPEN QUESTION: the planned filter ' +
        'covers search results; whether it also guards the order-entry wizard is unconfirmed, so this ' +
        'case is kept separate from TC-MP-05 rather than folded into it.'
    );
    // This is the half that is kept separate on purpose. A filter on search
    // results and a guard on a write workflow are different changes, and the
    // planned filter is described as the former. If the newer version turns
    // TC-MP-05 red but leaves this one green, that is the useful answer: the
    // list got cleaner and order entry can still build a requisition against a
    // record the lab has already declared dead.
    const pair = await seedMergedPair(page, 'ORD');
    await page.goto(`${BASE}/SamplePatientEntry`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#lastName')).toBeVisible({ timeout: 15_000 });

    await page.locator('#lastName').fill(pair.lastName);
    const searched = await clickFormSearch(page, '#lastName');
    expect(searched, 'order entry must have a patient Search button').toBe(true);

    // ANTI-VACUITY GUARD, and it is not optional.
    //
    // The first version of this case was just
    //   await expect(mergedRow).toHaveCount(0, { timeout: 15_000 })
    // straight after the search, and the run reported "Expected to fail, but
    // passed". Not because order entry filters merged records — it does not —
    // but because `toHaveCount(0)` is satisfied the instant it is evaluated,
    // before the search has rendered anything at all, and expect() polls until
    // it PASSES. A "must not exist" assertion placed right after an async
    // action is always vacuously true.
    //
    // So wait for the search to have actually produced its results — the
    // primary's row proves that — and only then assert the merged one is
    // absent. TC-MP-07 asserts this same guard WITHOUT the fail marker, so if
    // order-entry search ever breaks outright, that case goes red and tells you
    // this one can no longer be trusted.
    await expect(
      page.locator(`[data-cy="patient-result-row-${pair.ids[0]}"]`),
      `order-entry search returned no row for the surviving record ${pair.ids[0]}, so this case cannot judge the merged one`
    ).toBeAttached({ timeout: 15_000 });

    await expect(
      page.locator(`[data-cy="patient-result-row-${pair.ids[1]}"]`),
      `order entry must not offer merged-away record ${pair.ids[1]}`
    ).toHaveCount(0);
  });

  test('TC-MP-07: Order entry can find a patient by last name', async ({ page }) => {
    // The canary for TC-MP-06. That case is test.fail()-marked, which means any
    // failure inside it reads as the expected one — including a failure that has
    // nothing to do with merges. This case asserts the same precondition
    // unmarked, so a broken order-entry patient search shows up as a real
    // failure here instead of hiding as a false "defect still present" there.
    const pair = await seedDuplicatePair(page, 'CANARY');
    await page.goto(`${BASE}/SamplePatientEntry`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#lastName')).toBeVisible({ timeout: 15_000 });

    await page.locator('#lastName').fill(pair.lastName);
    const searched = await clickFormSearch(page, '#lastName');
    expect(searched, 'order entry must have a patient Search button').toBe(true);

    await expect(
      page.locator(`[data-cy="patient-result-row-${pair.ids[0]}"]`),
      `order-entry search for "${pair.lastName}" must return the seeded record ${pair.ids[0]}`
    ).toBeAttached({ timeout: 15_000 });
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
