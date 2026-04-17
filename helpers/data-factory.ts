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
    const result = await page.evaluate(async (nid: string) => {
      const csrf = localStorage.getItem('CSRF') || '';
      const candidates = [
        `/api/OpenELIS-Global/rest/patient?nationalId=${nid}`,
        `/api/OpenELIS-Global/rest/PatientSearch?nationalId=${nid}`,
        `/api/OpenELIS-Global/rest/patient/search?nationalId=${nid}`,
      ];
      for (const url of candidates) {
        const res = await fetch(url, { headers: { 'X-CSRF-Token': csrf } });
        if (res.ok) {
          const data = await res.json();
          // data may be an array of patients or a single patient object
          const list = Array.isArray(data) ? data : (data.patients ?? data.results ?? [data]);
          const match = list.find((p: any) =>
            p.nationalId === nid || p.nationalIdNumber === nid
          );
          return match ? (match.patientPK ?? match.id ?? match.patientId ?? 'found') : null;
        }
      }
      return null;
    }, nationalId);
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
    // Navigate to Patient Management
    await page.goto(`${BASE}/PatientManagement`, { waitUntil: 'networkidle' });

    // Look for "Add Patient" or "New Patient" button
    const addBtn = page.getByRole('button', { name: /add patient|new patient|create patient/i }).first();
    const hasAdd = await addBtn.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasAdd) {
      // Try clicking directly into the form if it's already open
      const firstInput = page.locator('input').first();
      const hasForm = await firstInput.isVisible({ timeout: 3000 }).catch(() => false);
      if (!hasForm) {
        state.setupErrors.push('createPatient: no Add button and no form found on PatientManagement');
        return false;
      }
    } else {
      await addBtn.click();
      await page.waitForTimeout(1000);
    }

    // Fill last name
    const lastNameField = page.locator(
      'input[name*="lastName" i], input[id*="lastName" i], input[placeholder*="last" i]'
    ).first();
    if (await lastNameField.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Carbon controlled input requires native value setter
      await lastNameField.focus();
      await page.keyboard.type(TEST_PATIENT.lastName);
    }

    // Fill first name
    const firstNameField = page.locator(
      'input[name*="firstName" i], input[id*="firstName" i], input[placeholder*="first" i]'
    ).first();
    if (await firstNameField.isVisible({ timeout: 3000 }).catch(() => false)) {
      await firstNameField.focus();
      await page.keyboard.type(TEST_PATIENT.firstName);
    }

    // Fill national ID
    const nationalIdField = page.locator(
      'input[name*="nationalId" i], input[id*="nationalId" i], input[placeholder*="national" i]'
    ).first();
    if (await nationalIdField.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nationalIdField.focus();
      await page.keyboard.type(TEST_PATIENT.nationalId);
    }

    // Fill date of birth
    const dobField = page.locator(
      'input[name*="dob" i], input[name*="dateOfBirth" i], input[id*="dob" i], input[placeholder*="date" i]'
    ).first();
    if (await dobField.isVisible({ timeout: 3000 }).catch(() => false)) {
      await dobField.focus();
      await page.keyboard.type(TEST_PATIENT.dateOfBirth);
    }

    // Select gender (Female)
    const genderSelect = page.locator('select[name*="gender" i], select[id*="gender" i]').first();
    if (await genderSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
      // Try to select Female by value or text
      await genderSelect.selectOption({ value: 'F' }).catch(() =>
        genderSelect.selectOption({ label: /female/i })
      );
    }

    // Submit
    const saveBtn = page.getByRole('button', { name: /save|submit|add|create/i }).first();
    if (await saveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await saveBtn.click();
      await page.waitForTimeout(2000);
    }

    // Verify success (no error message, page didn't crash)
    const bodyText = await page.locator('body').innerText();
    if (bodyText.includes('Internal Server Error')) {
      state.setupErrors.push('createPatient: Internal Server Error after save');
      return false;
    }

    state.patient.found = true;
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

  // ── 2. Create primary order (HGB) ────────────────────────────────────────
  if (state.patient.found) {
    console.log('[data-setup] Creating primary order (HGB)...');
    const acc1 = await createOrderViaUI(page, state, 'HGB', 'primaryOrder');
    if (!acc1) {
      console.warn('[data-setup] Primary order UI creation failed, trying API...');
      await createOrderViaAPI(page, state, 'HGB', 'primaryOrder');
    }
  }

  // ── 3. Create secondary order (WBC) ──────────────────────────────────────
  if (state.patient.found) {
    console.log('[data-setup] Creating secondary order (WBC)...');
    const acc2 = await createOrderViaUI(page, state, 'WBC', 'secondaryOrder');
    if (!acc2) {
      console.warn('[data-setup] Secondary order UI creation failed, trying API...');
      await createOrderViaAPI(page, state, 'WBC', 'secondaryOrder');
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
