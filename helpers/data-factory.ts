/**
 * OpenELIS Global QA — Test Data Factory
 *
 * Creates all baseline test fixtures required for the QA suite to run.
 * Designed to be idempotent: checks whether data already exists before
 * creating it, so repeated runs do not accumulate duplicate records.
 *
 * All created records use the QA prefix so they are easily identifiable
 * and can be bulk-cleaned up after a test run.
 *
 * Output: `.auth/test-data.json`
 * Shape:
 * {
 *   patient: { nationalId, firstName, lastName, systemId, found: boolean },
 *   primaryOrder: { accession, testName, sampleType, status },
 *   secondaryOrder: { accession, testName, sampleType, status },
 *   setupTimestamp: ISO string,
 *   setupErrors: string[]
 * }
 */

import { Page, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const BASE = process.env.BASE_URL || 'https://testing.openelis-global.org';

export const TEST_PATIENT = {
  nationalId: '0123456',
  firstName: 'Abby',
  lastName: 'Sebby',
  dateOfBirth: '01/01/1990',
  gender: 'F',
  phone: '555-0100',
};

export const TEST_DATA_PATH = path.join(process.cwd(), '.auth', 'test-data.json');

export interface TestDataState {
  patient: {
    nationalId: string;
    firstName: string;
    lastName: string;
    systemId: string | null;
    found: boolean;
  };
  primaryOrder: {
    accession: string | null;
    testName: string;
    sampleType: string;
    status: string;
  };
  secondaryOrder: {
    accession: string | null;
    testName: string;
    sampleType: string;
    status: string;
  };
  setupTimestamp: string;
  setupErrors: string[];
}

// ---------------------------------------------------------------------------
// Read / Write helpers
// ---------------------------------------------------------------------------

export function readTestData(): TestDataState | null {
  try {
    if (fs.existsSync(TEST_DATA_PATH)) {
      return JSON.parse(fs.readFileSync(TEST_DATA_PATH, 'utf8')) as TestDataState;
    }
  } catch {
    // File missing or corrupt — will be regenerated
  }
  return null;
}

export function writeTestData(data: TestDataState): void {
  const dir = path.dirname(TEST_DATA_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(TEST_DATA_PATH, JSON.stringify(data, null, 2));
}

function emptyState(): TestDataState {
  return {
    patient: {
      nationalId: TEST_PATIENT.nationalId,
      firstName: TEST_PATIENT.firstName,
      lastName: TEST_PATIENT.lastName,
      systemId: null,
      found: false,
    },
    primaryOrder: { accession: null, testName: 'HGB', sampleType: 'Whole Blood', status: 'created' },
    secondaryOrder: { accession: null, testName: 'WBC', sampleType: 'Whole Blood', status: 'created' },
    setupTimestamp: new Date().toISOString(),
    setupErrors: [],
  };
}

// ---------------------------------------------------------------------------
// Patient helpers
// ---------------------------------------------------------------------------

/**
 * Check whether a patient with the given national ID already exists.
 * Returns the patient's system ID if found, null otherwise.
 */
export async function findPatientByNationalId(page: Page, nationalId: string): Promise<string | null> {
  try {
    // ENDPOINTS CORRECTED (2026-09-08). The three URLs this used to try —
    // /rest/patient?nationalId=, /rest/PatientSearch?, /rest/patient/search? —
    // ALL answer 404 NoHandlerFoundException on v3.2.2.0. Every candidate
    // failed `res.ok`, the loop fell through, and the finder returned null
    // unconditionally. It could never report an existing patient, so the setup
    // attempted creation on every single run.
    //
    // The endpoint the application itself uses is patient-search-results, which
    // answers 200 with { paging, patientSearchResults: [...] }.
    // QUERY BY NAME, NOT BY ID.
    //
    // patient-search-results answers 200 for every parameter shape, but only
    // some of them actually search. Probed on v3.2.2.0 with three patients
    // named Abby Sebby present:
    //
    //   ?lastName=Sebby&firstName=Abby   -> 3 results   <- the one that works
    //   ?searchValue=0123456             -> []
    //   ?nationalId=0123456              -> []
    //   ?searchValue=Sebby               -> []
    //   ?patientId=504                   -> []
    //
    // A 200 with an empty list is indistinguishable from "no such patient",
    // which is why the earlier version of this function looked correct and
    // reported the baseline patient missing while it sat in the database. The
    // nationalId is still used to narrow the results when the payload carries
    // it — it just cannot be the query.
    const result = await page.evaluate(async ({ nid, first, last }) => {
      const csrf = localStorage.getItem('CSRF') || '';
      // `nationalID` — capital I, capital D. This is the parameter the
      // application itself sends (captured from the search screen's own
      // request); `nationalId` is silently ignored and answers 200 with an
      // empty list, which is what made every earlier lookup here look like
      // "no such patient". Verified live: nationalID=0123456 -> 5 results,
      // nationalId=0123456 -> 0.
      const res = await fetch(
        `/api/OpenELIS-Global/rest/patient-search-results?nationalID=${encodeURIComponent(nid)}` +
        `&lastName=${encodeURIComponent(last)}&firstName=${encodeURIComponent(first)}`,
        { headers: { 'X-CSRF-Token': csrf, Accept: 'application/json' } }
      );
      if (!res.ok) return null;
      const data = await res.json();
      const list: any[] = data.patientSearchResults ?? [];
      if (!list.length) return null;
      const byNid = list.find((p: any) => String(p.nationalId ?? p.nationalIdNumber ?? '') === nid);
      const pick = byNid ?? list[0];
      return String(pick.patientID ?? pick.patientId ?? pick.id ?? 'found');
    }, { nid: nationalId, first: TEST_PATIENT.firstName, last: TEST_PATIENT.lastName });
    return result;
  } catch {
    return null;
  }
}

/**
 * Create the test patient via the Patient Management UI.
 * Returns true if creation succeeded.
 */
export async function createPatientViaUI(page: Page, state: TestDataState): Promise<boolean> {
  try {
    // GO STRAIGHT TO THE CREATE ROUTE.
    //
    // This used to load /PatientManagement and click "New Patient". The button
    // is there, but /PatientManagement is the SEARCH screen and carries its own
    // lastName / firstName / nationalId inputs — so when the click did not land
    // (or had not finished after the fixed 1s wait), the field selectors below
    // matched the SEARCH form instead, typed the patient's details into it, and
    // looked for a Save button that screen does not have. Nothing was created
    // and nothing said so. A probe on v3.2.2.0 confirms /PatientManagement has
    // 7 visible inputs and /PatientManagement/new has 12.
    //
    // The create route is known (it is the same one TC-PAT-05 was corrected to
    // use), so navigate to it and assert the form is really there rather than
    // driving the menu and hoping.
    await page.goto(`${BASE}/PatientManagement/new`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2_500);

    const formAnchor = page.locator('#lastName, #firstName, #nationalId').first();
    if (!(await formAnchor.isVisible({ timeout: 10_000 }).catch(() => false))) {
      state.setupErrors.push(
        `createPatient: the create form did not render at /PatientManagement/new (url=${page.url()})`
      );
      return false;
    }

    // Fill last name
    // `#lastName` is the real id on the create form; the loose attribute match is
    // kept as a fallback but must not be the primary — it also matches the
    // search screen's field of the same name.
    const lastNameField = page.locator('#lastName, input[name*="lastName" i]').first();
    if (await lastNameField.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Carbon controlled input requires native value setter
      await lastNameField.focus();
      await page.keyboard.type(TEST_PATIENT.lastName);
    }

    // Fill first name
    // `#firstName` is the real id on the create form; the loose attribute match is
    // kept as a fallback but must not be the primary — it also matches the
    // search screen's field of the same name.
    const firstNameField = page.locator('#firstName, input[name*="firstName" i]').first();
    if (await firstNameField.isVisible({ timeout: 3000 }).catch(() => false)) {
      await firstNameField.focus();
      await page.keyboard.type(TEST_PATIENT.firstName);
    }

    // Fill national ID
    // `#nationalId` is the real id on the create form; the loose attribute match is
    // kept as a fallback but must not be the primary — it also matches the
    // search screen's field of the same name.
    const nationalIdField = page.locator('#nationalId, input[name*="nationalId" i]').first();
    if (await nationalIdField.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nationalIdField.focus();
      await page.keyboard.type(TEST_PATIENT.nationalId);
    }

    // DATE OF BIRTH — Carbon date picker, not an input named "dob".
    //
    // The old selectors here were
    //   input[name*=dob], input[name*=dateOfBirth], input[id*=dob],
    //   input[placeholder*=date]
    // and a live probe of /PatientManagement/new on v3.2.2.0 matched ZERO
    // elements for all four. The real field is `#date-picker-default-id` with
    // placeholder `dd/mm/yyyy` — it contains neither "dob" nor "date". So DOB
    // was never filled. `legacy-order-helper.ts` has driven this same picker
    // correctly for a long time; this now uses that pattern.
    const dobField = page.locator('#date-picker-default-id').last();
    if (await dobField.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await dobField.fill(TEST_PATIENT.dateOfBirth);
    } else {
      state.setupErrors.push('createPatient: date-of-birth picker not found (#date-picker-default-id)');
    }

    // GENDER — radio buttons, not a <select>.
    //
    // The old selector was select[name*=gender] / select[id*=gender], which
    // also matched zero elements: gender renders as `input[name="gender"]`
    // radios (#radio-1 / #radio-2) in Carbon. So gender was never set either.
    //
    // Both of these were wrapped in `if (visible) { ... }` with no else, so a
    // selector matching nothing was indistinguishable from a field that had
    // been filled. The form was then submitted missing two required values,
    // Save was rejected, no "Internal Server Error" string appeared, and the
    // function reported success. Click by LABEL text so this does not depend on
    // which radio index the sex happens to occupy.
    const wantFemale = TEST_PATIENT.gender.toUpperCase().startsWith('F');
    const genderLabel = page.getByText(wantFemale ? /^Female$/ : /^Male$/).first();
    if (await genderLabel.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await genderLabel.click();
    } else {
      const fallback = page.locator(`label[for="${wantFemale ? 'radio-2' : 'radio-1'}"]`).first();
      if (await fallback.isVisible({ timeout: 2_000 }).catch(() => false)) await fallback.click();
      else state.setupErrors.push('createPatient: gender radio not found by label or index');
    }

    // SUBMIT — and this is the bug that made the whole fixture a no-op.
    //
    // The selector used to be:
    //     getByRole('button', { name: /save|submit|add|create/i }).first()
    //
    // The patient form has exactly two buttons matching that alternation:
    // "Additional Information" and "Save" — because `/add/i` matches
    // "ADDitional". "Additional Information" comes first in the DOM, so
    // `.first()` picked it, the click expanded a form section, and Save was
    // never pressed. Combined with the "no Internal Server Error means
    // success" check below, the fixture reported creating a patient on every
    // run while doing nothing but opening an accordion.
    //
    // ANCHOR the name. A loose alternation over button labels will eventually
    // match a button you did not mean, and `.first()` hides which one it hit.
    const saveBtn = page.getByRole('button', { name: /^\s*Save\s*$/i }).first();
    if (!(await saveBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
      state.setupErrors.push('createPatient: no Save button on the create form');
      return false;
    }
    await saveBtn.click();
    // The app answers POST /rest/PatientManagement with
    // {"status":"success","patientId":"<id>"} and routes to
    // /PatientManagement/<id>. Wait for the navigation rather than a fixed
    // sleep, then fall through to the read-back check.
    await page.waitForURL(/\/PatientManagement\/\d+/, { timeout: 20_000 }).catch(() => { /* read-back decides */ });

    // ROUND-TRIP, NOT "THE PAGE DID NOT CRASH" (2026-09-08).
    //
    // This used to read the body text, check it did not contain "Internal
    // Server Error", and then set patient.found = true. That is not a check
    // that a patient was created — it is a check that the browser did not show
    // one specific string. A live probe found ZERO patients matching either
    // nationalId 0123456 or lastName "Sebby" while this function was reporting
    // "Patient created successfully" on every run. Seventeen module specs
    // import PATIENT_NAME / PATIENT_ID and were searching for someone who was
    // never there, so their failures read as product defects.
    //
    // Success now means the patient READS BACK from the search endpoint. See
    // harness ref 12.3: every write path needs a round-trip.
    const bodyText = await page.locator('body').innerText();
    if (bodyText.includes('Internal Server Error')) {
      state.setupErrors.push('createPatient: Internal Server Error after save');
      return false;
    }

    const readBack = await findPatientByNationalId(page, TEST_PATIENT.nationalId);
    if (!readBack) {
      // Say WHAT the form complained about. "It did not save" sends the next
      // person back to the browser; the validation text usually names the field.
      const complaints = await page
        .locator('.cds--form-requirement, [role="alert"], .cds--inline-notification__subtitle, .error, .cds--text-input__field-wrapper--warning')
        .evaluateAll((els) => els.map((e) => (e.textContent || '').trim()).filter(Boolean).slice(0, 6))
        .catch(() => [] as string[]);
      state.setupErrors.push(
        `createPatient: save produced no error, but nationalId=${TEST_PATIENT.nationalId} ` +
        'does not read back from /rest/patient-search-results — the patient was NOT created' +
        (complaints.length ? ` :: form said: ${complaints.join(' | ')}` : ' :: form showed no validation message') +
        ` :: url=${page.url()}`
      );
      return false;
    }

    state.patient.found = true;
    state.patient.systemId = readBack === 'found' ? null : readBack;
    return true;
  } catch (e) {
    state.setupErrors.push(`createPatient: ${String(e)}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Order helpers
// ---------------------------------------------------------------------------

/**
 * Create a sample order via the Add Order wizard (4-step UI).
 * Returns the accession number assigned by the system, or null on failure.
 */
export async function createOrderViaUI(
  page: Page,
  state: TestDataState,
  testName: string,
  orderKey: 'primaryOrder' | 'secondaryOrder'
): Promise<string | null> {
  try {
    await page.goto(`${BASE}/SamplePatientEntry`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // ─── Step 1: Patient Info ───────────────────────────────────────────────
    // Search for the existing patient first
    const searchPatientBtn = page.getByRole('button', { name: /search.*patient|find.*patient/i }).first();
    const hasSearch = await searchPatientBtn.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasSearch) {
      await searchPatientBtn.click();
      await page.waitForTimeout(1000);
      // Fill national ID in the search popup
      const searchInput = page.locator('input[placeholder*="national" i], input[placeholder*="id" i]').first();
      if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await searchInput.fill(TEST_PATIENT.nationalId);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(2000);
        // Click first result row
        const firstRow = page.locator('table tbody tr, [role="row"]').first();
        if (await firstRow.isVisible({ timeout: 3000 }).catch(() => false)) {
          await firstRow.click();
          await page.waitForTimeout(1000);
        }
      }
    } else {
      // Fill patient fields directly
      const lastNameField = page.locator('input[id*="lastName" i], input[name*="lastName" i]').first();
      if (await lastNameField.isVisible({ timeout: 3000 }).catch(() => false)) {
        await lastNameField.fill(TEST_PATIENT.lastName);
      }
      const firstNameField = page.locator('input[id*="firstName" i], input[name*="firstName" i]').first();
      if (await firstNameField.isVisible({ timeout: 3000 }).catch(() => false)) {
        await firstNameField.fill(TEST_PATIENT.firstName);
      }
      const nationalIdField = page.locator('input[id*="nationalId" i], input[name*="nationalId" i]').first();
      if (await nationalIdField.isVisible({ timeout: 3000 }).catch(() => false)) {
        await nationalIdField.fill(TEST_PATIENT.nationalId);
      }
    }

    // Proceed to step 2
    const nextBtn = page.getByRole('button', { name: /next|continue|proceed/i }).first();
    if (await nextBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nextBtn.click();
      await page.waitForTimeout(1500);
    }

    // ─── Step 2: Program Selection ──────────────────────────────────────────
    // Select the first available program (or skip if not required)
    const programSelect = page.locator('select[id*="program" i], select[name*="program" i], [role="combobox"]').first();
    if (await programSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      await programSelect.selectOption({ index: 1 }).catch(() => {});
      await page.waitForTimeout(500);
    }

    const nextBtn2 = page.getByRole('button', { name: /next|continue/i }).first();
    if (await nextBtn2.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nextBtn2.click();
      await page.waitForTimeout(1500);
    }

    // ─── Step 3: Sample Information ─────────────────────────────────────────
    // Set collection date to today
    const collectionDate = page.locator(
      'input[id*="collectionDate" i], input[name*="collectionDate" i], input[placeholder*="collection" i]'
    ).first();
    if (await collectionDate.isVisible({ timeout: 3000 }).catch(() => false)) {
      const today = new Date().toISOString().slice(0, 10);
      await collectionDate.fill(today);
    }

    const nextBtn3 = page.getByRole('button', { name: /next|continue/i }).first();
    if (await nextBtn3.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nextBtn3.click();
      await page.waitForTimeout(1500);
    }

    // ─── Step 4: Tests Selection ────────────────────────────────────────────
    // Search for the test by name (HGB or WBC)
    const testSearch = page.locator('input[placeholder*="test" i], input[placeholder*="search" i]').first();
    if (await testSearch.isVisible({ timeout: 3000 }).catch(() => false)) {
      await testSearch.fill(testName);
      await page.waitForTimeout(1000);
      // Select the first matching test
      const testOption = page.locator(`text=${testName}`).first();
      if (await testOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await testOption.click();
        await page.waitForTimeout(500);
      }
    }

    // Submit the order
    const submitBtn = page.getByRole('button', { name: /submit|save|add order|place order/i }).first();
    if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await submitBtn.click();
      await page.waitForTimeout(3000);
    }

    // ─── Extract Assigned Accession ─────────────────────────────────────────
    const bodyText = await page.locator('body').innerText();
    if (bodyText.includes('Internal Server Error')) {
      state.setupErrors.push(`createOrder(${testName}): Internal Server Error`);
      return null;
    }

    // Look for accession number pattern in response
    const accessionMatch = bodyText.match(/\b\d{2}[A-Z]+\d+[A-Z]?\b/);
    const accession = accessionMatch ? accessionMatch[0] : null;

    if (accession) {
      state[orderKey].accession = accession;
      state[orderKey].status = 'created';
      console.log(`[data-setup] Created order ${accession} for test ${testName}`);
    } else {
      state.setupErrors.push(`createOrder(${testName}): could not extract accession from response`);
    }

    return accession;
  } catch (e) {
    state.setupErrors.push(`createOrder(${testName}): ${String(e)}`);
    return null;
  }
}

/**
 * Create an order via the REST API directly (faster than UI, requires working API).
 * Falls back to UI creation if API fails.
 */
export async function createOrderViaAPI(
  page: Page,
  state: TestDataState,
  testName: string,
  orderKey: 'primaryOrder' | 'secondaryOrder'
): Promise<string | null> {
  try {
    const result = await page.evaluate(async (params: { nationalId: string; testName: string }) => {
      const csrf = localStorage.getItem('CSRF') || '';

      // Build minimal patient-order payload
      const payload = {
        sampleOrderItems: {
          newRequesterName: '',
          requestDate: new Date().toISOString().slice(0, 10),
          receivedDateForDisplay: new Date().toISOString().slice(0, 10),
          receivedTime: '08:00',
          nextVisitDate: '',
          requesterSampleID: '',
          referringPatientNumber: params.nationalId,
          referringSiteId: '',
          referringSiteName: '',
          providerId: '',
          providerLastName: '',
          providerFirstName: '',
          providerWorkPhone: '',
          providerFax: '',
          providerEmail: '',
          program: '',
          billingReferenceNumber: '',
          paymentOptionSelection: 'INSURANCE',
          testLocationCode: '',
          otherLocationCode: '',
          facilityAddressStreet: '',
          facilityAddressCommune: '',
          facilityPhone: '',
          facilityFax: '',
        },
        patientProperties: {
          patientPK: '',
          subjectNumber: '',
          nationalId: params.nationalId,
          patientLastName: 'Sebby',
          patientFirstName: 'Abby',
          patientLastNameNational: '',
          patientFirstNameNational: '',
          DOB: '01/01/1990',
          gender: 'F',
          primaryPhone: '555-0100',
          streetAddress: '',
          commune: '',
          department: '',
          healthDistrict: '',
          healthRegion: '',
          mothersName: '',
          maritialStatus: '',
          nationality: '',
          educationLevel: '',
          insureNumber: '',
          activePatient: true,
        },
        sampleXML:
          '<samples>' +
          `<sample><tests><test><id>${params.testName}</id></test></tests></sample>` +
          '</samples>',
      };

      const res = await fetch('/api/OpenELIS-Global/rest/SamplePatientEntry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrf,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) return { status: res.status, accession: null };
      const data = await res.json();
      const accession = data.accessionNumber ?? data.labNo ?? data.sampleOrderItems?.labNo ?? null;
      return { status: res.status, accession };
    }, { nationalId: TEST_PATIENT.nationalId, testName });

    if (result.accession) {
      state[orderKey].accession = result.accession;
      state[orderKey].status = 'created';
      return result.accession;
    }
    return null;
  } catch (e) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main setup orchestrator
// ---------------------------------------------------------------------------

/**
 * Run the full data setup sequence.
 * 1. Check if patient exists → create if missing
 * 2. Check if orders exist → create if missing
 * 3. Write result to .auth/test-data.json
 *
 * Idempotent: safe to run on every CI invocation.
 */
export async function runDataSetup(page: Page): Promise<TestDataState> {
  const state = emptyState();

  // ── 1. Check for existing patient ────────────────────────────────────────
  console.log(`[data-setup] Checking for patient nationalId=${TEST_PATIENT.nationalId}...`);
  const existingPatientId = await findPatientByNationalId(page, TEST_PATIENT.nationalId);

  if (existingPatientId) {
    console.log(`[data-setup] Patient found (id=${existingPatientId}), skipping creation`);
    state.patient.found = true;
    state.patient.systemId = existingPatientId === 'found' ? null : existingPatientId;
  } else {
    console.log('[data-setup] Patient not found, creating via UI...');
    const created = await createPatientViaUI(page, state);
    if (created) {
      console.log('[data-setup] Patient created successfully');
    } else {
      console.warn('[data-setup] Patient creation failed:', state.setupErrors);
    }
  }

  // ── 2 & 3. Create the two baseline orders ────────────────────────────────
  //
  // ORDER OF ATTEMPTS REVERSED (2026-09-08). This used to try the UI first and
  // fall back to the API. On v3.2.2.0 the UI attempt no longer completes —
  // `createOrder(HGB): locator.click: Test timeout exceeded` — and because a
  // Playwright locator waits out the WHOLE test budget, the UI attempt consumed
  // every second the setup had and the API fallback was never reached. The
  // setup then failed on timeout, and since the module sweep depends on this
  // project, a failure here skips all 866 tests.
  //
  // API first is also the better fixture design: a fixture should take the
  // cheapest reliable path to the state a test needs, and drive the UI only
  // when the UI itself is what is under test. Set DATA_SETUP_ORDER_UI=1 to
  // restore the old order once the UI path is fixed.
  const preferUI = process.env.DATA_SETUP_ORDER_UI === '1';
  for (const [testName, slot] of [['HGB', 'primaryOrder'], ['WBC', 'secondaryOrder']] as const) {
    if (!state.patient.found) break;
    console.log(`[data-setup] Creating ${slot} (${testName})${preferUI ? '' : ' via API'}...`);
    let acc: string | null = null;
    if (preferUI) {
      acc = await createOrderViaUI(page, state, testName, slot);
      if (!acc) {
        console.warn(`[data-setup] ${slot} UI creation failed, trying API...`);
        acc = await createOrderViaAPI(page, state, testName, slot);
      }
    } else {
      acc = await createOrderViaAPI(page, state, testName, slot);
      if (!acc) console.warn(`[data-setup] ${slot} API creation failed (UI path is known-broken; not attempted)`);
    }
  }

  // ── 4. Write state ────────────────────────────────────────────────────────
  state.setupTimestamp = new Date().toISOString();
  writeTestData(state);

  console.log('[data-setup] Setup complete:');
  console.log(`  patient.found: ${state.patient.found}`);
  console.log(`  primaryOrder.accession: ${state.primaryOrder.accession}`);
  console.log(`  secondaryOrder.accession: ${state.secondaryOrder.accession}`);
  if (state.setupErrors.length > 0) {
    console.warn('[data-setup] Errors:', state.setupErrors);
  }

  return state;
}

// ---------------------------------------------------------------------------
// Duplicate-pair seeding (for the patient-merge cases)
// ---------------------------------------------------------------------------

export interface DuplicatePair {
  /** The national ID both records share. Fresh per call, so runs never collide. */
  nationalId: string;
  /**
   * The unique health ID (subject number) both records share. THIS is what the
   * merge screen's panels should search on: its "Patient Id" field matches the
   * subject number by substring, so a fresh long digit string finds exactly this
   * pair. Do not identify the pair by last name — see the soundex note below.
   */
  subjectNumber: string;
  /** The last name both records share. For display only, not for identification. */
  lastName: string;
  /** The two patient ids, in creation order. */
  ids: [string, string];
}

/**
 * Create one patient through the REST API.
 *
 * PAYLOAD CAPTURED, NOT COMPOSED (harness ref 12.4). This is the exact body
 * the Add Patient form sends, taken off the wire in Chrome on testing v3.2.2.0
 * on 2026-09-08:
 *
 *   POST /api/OpenELIS-Global/rest/PatientManagement
 *   Content-Type: application/json   Accept-Language: en   X-CSRF-Token: <token>
 *   {"patientUpdateStatus":"ADD","nationalId":…,"lastName":…,"firstName":…,
 *    "gender":"F","birthDateForDisplay":"01/01/1990", …all-empty rest…}
 *   -> 200 {"patientId":"515","status":"success"}
 *
 * The captured request also carried a stray `"date-picker-default-id"` key
 * alongside `birthDateForDisplay` — a UI artifact, the form's own field id
 * leaking into the payload. It is omitted here, and the omission is verified:
 * the request above without it answered 200 and created patient 515.
 */
export async function createPatientViaAPI(
  page: Page,
  p: { nationalId: string; firstName: string; lastName: string; subjectNumber?: string; gender?: string; dateOfBirth?: string }
): Promise<{ id: string | null; detail: string }> {
  return page.evaluate(async (pt) => {
    const csrf = localStorage.getItem('CSRF') || '';
    const body = {
      patientUpdateStatus: 'ADD',
      nationalId: pt.nationalId,
      subjectNumber: pt.subjectNumber ?? '',
      lastName: pt.lastName,
      firstName: pt.firstName,
      aka: '',
      streetAddress: '',
      city: '',
      primaryPhone: '',
      email: '',
      gender: pt.gender ?? 'F',
      birthDateForDisplay: pt.dateOfBirth ?? '01/01/1990',
      commune: '',
      education: '',
      maritialStatus: '',
      nationality: '',
      healthDistrict: '',
      healthRegion: '',
      otherNationality: '',
      occupation: '',
      customNotes: '',
      targetDiseaseProgramme: '',
      photo: '',
      idDocuments: [] as unknown[],
      patientContact: { person: { firstName: '', lastName: '', primaryPhone: '', email: '' } },
    };
    const r = await fetch('/api/OpenELIS-Global/rest/PatientManagement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept-Language': 'en', 'X-CSRF-Token': csrf },
      body: JSON.stringify(body),
    });
    const text = await r.text().catch(() => '');
    let d: any = null;
    try { d = JSON.parse(text); } catch { /* not json */ }
    return {
      id: d && d.status === 'success' ? String(d.patientId) : null,
      // Diagnostics, because "first=null, second=null" is not a bug report.
      // A 403 with "CSRF token missing or invalid" means the token was not in
      // localStorage yet (see apiShapes.ts); anything else is the server's own
      // complaint and should be read, not guessed at.
      detail: `status=${r.status} csrf=${csrf ? 'present' : 'MISSING'} origin=${location.origin} body=${text.slice(0, 200)}`,
    };
  }, p);
}

/**
 * Seed two patients that share a national ID and a last name — i.e. exactly the
 * duplicate a person would open the merge screen to resolve.
 *
 * WHY SEED RATHER THAN USE THE ABBY SEBBYS. The merge cases used to lean on the
 * five duplicate "Abby Sebby" records on the shared instance. A merge case that
 * actually merges would consume those, and after one or two runs there would be
 * nothing left to merge — the test would destroy its own precondition and start
 * failing for reasons that have nothing to do with the product. A fresh pair per
 * test is repeatable forever, and TC-MP-04 merging it is the pair's cleanup.
 *
 * Cheap on purpose: two API POSTs, well inside the 30-second policy.
 */
export async function seedDuplicatePair(page: Page, tag = 'MRG'): Promise<DuplicatePair> {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const nationalId = `QA${tag}${stamp}`;
  // Identification lives in the SUBJECT NUMBER, not the name. Two earlier
  // attempts failed and both are worth remembering:
  //
  //  1. A digit-bearing last name is rejected outright:
  //     400 {"error":"lastName: invalid name format, possibly illegal character"}
  //  2. Transliterating the stamp into letters made the name unique but NOT
  //     unique to the search. The last-name search is soundex-like — every
  //     `QAAuto…` name collided with every other one, so each run's search
  //     returned all previous runs' seeds, the pair got pushed onto page 2 of
  //     the results, and its radio was never rendered. That is what a
  //     "waiting for #patient1-select-530" timeout meant.
  //
  // The merge panel's "Patient Id" field matches the subject number by
  // substring (verified: searching "530" returned a record whose subject number
  // merely CONTAINS 530), so a fresh long digit string identifies exactly this
  // pair and nothing else. The last name can therefore be a constant.
  const subjectNumber = `99${stamp}`;
  const lastName = `Qaauto${tag}`;
  // The POST is same-origin and needs localStorage['CSRF'], so the page must
  // already be on the app. Make that a precondition with a readable message
  // rather than letting it surface as a null id.
  if (!/^https?:/.test(page.url()) || page.url().includes('about:blank')) {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  }
  const first = await createPatientViaAPI(page, { nationalId, subjectNumber, firstName: 'Alpha', lastName });
  const second = first.id
    ? await createPatientViaAPI(page, { nationalId, subjectNumber, firstName: 'Beta', lastName })
    : { id: null, detail: 'not attempted' };
  if (!first.id || !second.id) {
    throw new Error(
      `seedDuplicatePair: could not create the pair for nationalId=${nationalId}\n` +
        `  first:  ${first.detail}\n  second: ${second.detail}`
    );
  }
  return { nationalId, subjectNumber, lastName, ids: [first.id, second.id] };
}

/** Patient ids the search endpoint returns for a national ID. */
export async function findPatientIdsByNationalId(page: Page, nationalId: string): Promise<string[]> {
  return page.evaluate(async (nid) => {
    const r = await fetch(
      `/api/OpenELIS-Global/rest/patient-search-results?nationalID=${encodeURIComponent(nid)}&lastName=&firstName=`,
      { headers: { Accept: 'application/json' } }
    );
    if (!r.ok) return [];
    const d = await r.json().catch(() => null);
    return ((d && d.patientSearchResults) || []).map((p: any) => String(p.patientID ?? p.patientId));
  }, nationalId);
}

/** Patient ids the search endpoint returns for a last name. */
export async function findPatientIdsByLastName(page: Page, lastName: string): Promise<string[]> {
  return page.evaluate(async (ln) => {
    const r = await fetch(
      `/api/OpenELIS-Global/rest/patient-search-results?lastName=${encodeURIComponent(ln)}&firstName=`,
      { headers: { Accept: 'application/json' } }
    );
    if (!r.ok) return [];
    const d = await r.json().catch(() => null);
    return ((d && d.patientSearchResults) || []).map((p: any) => String(p.patientID ?? p.patientId));
  }, lastName);
}

/**
 * Execute a patient merge through the REST API.
 *
 * PAYLOAD AND RESPONSE CAPTURED (harness ref 12.23/12.24), Chrome on testing
 * v3.2.2.0, 2026-09-08:
 *
 *   POST /api/OpenELIS-Global/rest/patient/merge/execute
 *   {"patient1Id","patient2Id","primaryPatientId","reason","confirmed":true}
 *   -> 200 {"success":true,"mergeAuditId":"6","message":"Patient merge completed
 *           successfully","primaryPatientId":"566","mergedPatientId":"567",
 *           "mergeDurationMs":156}
 *
 * Use this when a case needs a merged record as a PRECONDITION. The UI wizard
 * itself is what TC-MP-04 covers; driving it again just to arrive at a merged
 * state would put the wizard's own defects inside another case's setup.
 */
export async function mergePatientsViaAPI(
  page: Page,
  args: { primaryId: string; mergedId: string; reason?: string }
): Promise<{ ok: boolean; detail: string }> {
  return page.evaluate(async (a) => {
    const csrf = localStorage.getItem('CSRF') || '';
    const r = await fetch('/api/OpenELIS-Global/rest/patient/merge/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept-Language': 'en', 'X-CSRF-Token': csrf },
      body: JSON.stringify({
        patient1Id: a.primaryId,
        patient2Id: a.mergedId,
        primaryPatientId: a.primaryId,
        reason: a.reason ?? 'QA_AUTO_ merge (fixture precondition)',
        confirmed: true,
      }),
    });
    const text = await r.text().catch(() => '');
    let d: any = null;
    try { d = JSON.parse(text); } catch { /* not json */ }
    return { ok: r.ok && !!(d && d.success), detail: `status=${r.status} body=${text.slice(0, 200)}` };
  }, args);
}

/** Seed a duplicate pair and merge the second into the first. Returns the pair. */
export async function seedMergedPair(page: Page, tag = 'FILT'): Promise<DuplicatePair> {
  const pair = await seedDuplicatePair(page, tag);
  const res = await mergePatientsViaAPI(page, { primaryId: pair.ids[0], mergedId: pair.ids[1] });
  if (!res.ok) throw new Error(`seedMergedPair: merge failed — ${res.detail}`);
  return pair;
}
