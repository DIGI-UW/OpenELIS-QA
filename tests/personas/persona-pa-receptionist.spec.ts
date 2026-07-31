/**
 * tests/personas/persona-pa-receptionist.spec.ts
 *
 * SKILL §12 Persona PA — Receptionist
 *
 * The day: a receptionist walks up to the terminal with a patient
 * standing at the counter. They:
 *   1. Search the patient by national ID
 *   2. If found, place an order for them on the right program
 *   3. If not, create the patient and place the order
 *   4. Print barcode labels
 *   5. Hand the order off to the lab
 *
 * Persona PASSes only if every step uses documented UI paths with no
 * workarounds. A FAIL means a real receptionist can't do their job
 * cleanly — i.e., the system has a hidden requirement or a broken
 * step that the existing per-screen tests pass on individually.
 *
 * Known issues this persona surfaces:
 *   BUG-37 — Step 6 will FAIL when order saves but patient linkage
 *            isn't persisted. Receptionist hands off an order with
 *            no patient on it.
 *   BUG-31 — Not exercised here (no result entry).
 *   NOTE-24 — "Succesfuly saved" typo on the success page — soft note.
 *
 * Run individually:
 *   npx playwright test --project=persona-pa
 */

import { test, expect } from '@playwright/test';
import { BASE, apiCall, markStep } from '../chains/_common';
import {
  PATIENT_MANAGEMENT,
  QA_PATIENT_NAME_SAFE,
  buildPatientCreateBody,
  patientCreateSucceeded,
  qaPatientNationalId,
  ALL_TESTS_UNSCOPED,
} from '../../helpers/apiShapes';

const PERSONA = 'PA';
/**
 * ONE national id for the whole persona: Step 1 searches for it, Step 2 creates
 * it, Step 3 orders against it, and Step 5's BUG-37 check compares the order's
 * linked patient to it. Two different ids here would manufacture a false BUG-37.
 *
 * It must satisfy nationalId's own regex — (?i)^[-a-z0-9/]*$ — hyphens and
 * slashes allowed, UNDERSCORES NOT. So the usual QA_AUTO_ tag is rejected here;
 * qaPatientNationalId() emits the hyphenated form (apiShapes §v6.23).
 */
const NATIONAL_ID = qaPatientNationalId();
/**
 * Names obey a different regex again: lowercase letters plus . ' - and space.
 * "PA_Walker" would 400 with "invalid name format".
 */
const PATIENT = {
  firstName: 'persona',
  lastName: QA_PATIENT_NAME_SAFE,
  dob: '1985-04-12',
  gender: 'F' as const,
};

test.describe.serial('Persona PA — Receptionist', () => {
  let patientPK: string | null = null;
  let accession: string | null = null;
  let testId: string | null = null;
  let sampleTypeId: string | null = null;

  test('Step 1 — Patient search by national ID (RENDER)', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    const r = await apiCall<{ patientSearchResults?: Array<unknown> }>(
      page, `/api/OpenELIS-Global/rest/patient-search-results?nationalID=${encodeURIComponent(NATIONAL_ID)}`
    );
    if (!r.ok) {
      markStep(PERSONA, 1, 'FAIL', `patient-search-results HTTP ${r.status}`);
      expect(r.ok).toBeTruthy(); return;
    }
    const items = (typeof r.body === 'object' && r.body !== null)
      ? ((r.body as { patientSearchResults?: Array<unknown> }).patientSearchResults || [])
      : [];
    markStep(PERSONA, 1, 'PASS', `Search returned ${items.length} matches (expected 0 for fresh ID)`);
  });

  test('Step 2 — Create new patient since search was empty (PERSIST)', async ({ page }) => {
    await page.goto(BASE);
    // §v6.23: the real endpoint is /rest/PatientManagement (the old
    // "/rest/patient-management" 404s) and the body is FLAT
    // CreatePatientFormValues — not wrapped in patientProperties, which belongs
    // to SamplePatientEntry. Verified live 2026-07-31: 200 {patientId, status}.
    //
    // NOTE the name: FIRST/LAST_NAME_REGEX reject uppercase, digits and
    // underscores, so the QA_AUTO_ convention cannot be used here. The
    // machine-readable tag goes in nationalId instead.
    const create = await apiCall<{ patientId?: string; status?: string; error?: string }>(
      page, PATIENT_MANAGEMENT, {
        method: 'POST',
        body: buildPatientCreateBody({
          firstName: PATIENT.firstName,
          lastName: PATIENT.lastName,
          gender: PATIENT.gender,
          nationalId: NATIONAL_ID,
        }),
      });
    if (!create.ok || !patientCreateSucceeded(create.body)) {
      markStep(PERSONA, 2, 'FAIL',
        `PatientManagement POST HTTP ${create.status}`,
        `Body: ${(typeof create.body === 'string' ? create.body : JSON.stringify(create.body)).slice(0, 250)}. ` +
        `Field-level regexes bite here: name fields allow only lowercase + . ' - and space; ` +
        `nationalId allows only (?i)[-a-z0-9/] — no underscores in either. See apiShapes §v6.23.`);
      expect(create.ok).toBeTruthy(); return;
    }
    // Round-trip to retrieve patientPK
    const verify = await apiCall<{ patientSearchResults?: Array<{ patientID?: string }> }>(
      page, `/api/OpenELIS-Global/rest/patient-search-results?nationalID=${encodeURIComponent(NATIONAL_ID)}`
    );
    patientPK = (verify.ok && typeof verify.body === 'object' && verify.body !== null)
      ? ((verify.body as { patientSearchResults?: Array<{ patientID?: string }> }).patientSearchResults?.[0]?.patientID ?? null)
      : null;
    if (!patientPK) {
      markStep(PERSONA, 2, 'FAIL', 'Patient created but PK not found in search');
      expect(patientPK).toBeTruthy(); return;
    }
    markStep(PERSONA, 2, 'PASS', `Patient ${NATIONAL_ID} created with patientPK=${patientPK}`);
  });

  test('Step 3 — Discover test catalog for order (RENDER)', async ({ page }) => {
    await page.goto(BASE);
    // FLAT ARRAY of {id, value} — NOT {testList: [...]}. apiShapes records this as
    // spec bug #4 for /rest/test-list; the same wrong unwrap was still here, which
    // made Step 3 report an empty catalogue while the endpoint returned 187 entries.
    const t = await apiCall<Array<{ id?: string; value?: string }>>(
      page, ALL_TESTS_UNSCOPED
    );
    const tests = Array.isArray(t.body) ? (t.body as Array<{ id?: string; value?: string }>) : [];
    if (tests.length === 0) {
      markStep(PERSONA, 3, 'FAIL', 'Empty test catalog',
        'displayList/ALL_TESTS returned nothing. NOTE /rest/test-list is role-scoped and is\n         empty for Reception (apiShapes §v6.23) — if you switched this back to test-list, that\n         is why.'); expect(tests.length).toBeGreaterThan(0); return;
    }
    testId = tests[0].id!;
    // ALL_TESTS carries no sample-type mapping (that lives on /rest/TestAdd's
    // sampleTypeList). Default to '1' and let Step 4 surface a mismatch.
    sampleTypeId = '1';
    markStep(PERSONA, 3, 'PASS', `Using test ${testId} (${tests[0].value}) of ${tests.length}, sampleType ${sampleTypeId}`);
  });

  test('Step 4 — Place order on Routine Testing program (PERSIST)', async ({ page }) => {
    if (!patientPK || !testId) test.skip();
    await page.goto(BASE);
    const create = await apiCall<{ accessionNumber?: string }>(
      page, '/api/OpenELIS-Global/rest/SamplePatientEntry', {
        method: 'POST',
        body: {
          patientProperties: { patientPK, nationalId: NATIONAL_ID, patientUpdateStatus: 'UPDATE' },
          sampleOrderItems: {
            newSampleEntry: 'true',
            collectionDate: new Date().toISOString().slice(0, 10),
            receivedDate: new Date().toISOString().slice(0, 10),
            priority: 'ROUTINE',
            paymentStatus: 'NONE',
          },
          sampleItems: [{ sampleTypeId, tests: [{ testId, isReportable: true }] }],
        },
      });
    if (!create.ok) {
      markStep(PERSONA, 4, 'FAIL', `Order POST HTTP ${create.status}`);
      expect(create.ok).toBeTruthy(); return;
    }
    accession = (typeof create.body === 'object' && create.body !== null)
      ? (create.body as { accessionNumber?: string }).accessionNumber ?? null
      : null;
    if (!accession) {
      markStep(PERSONA, 4, 'FAIL', 'Order saved but no accession returned');
      expect(accession).toBeTruthy(); return;
    }
    markStep(PERSONA, 4, 'PASS', `Accession ${accession} for patient ${NATIONAL_ID}`);
  });

  test('Step 5 — Verify order in Edit Order (ROUND-TRIP, BUG-37 catch)', async ({ page }) => {
    if (!accession) test.skip();
    await page.goto(BASE);
    const r = await apiCall<{ nationalId?: string }>(
      page, `/api/OpenELIS-Global/rest/SampleEdit?labNumber=${encodeURIComponent(accession!)}`
    );
    if (!r.ok) {
      markStep(PERSONA, 5, 'FAIL', `SampleEdit HTTP ${r.status}`);
      expect(r.ok).toBeTruthy(); return;
    }
    const linkedId = (typeof r.body === 'object' && r.body !== null)
      ? ((r.body as { nationalId?: string }).nationalId)
      : undefined;
    if (linkedId !== NATIONAL_ID) {
      markStep(PERSONA, 5, 'FAIL',
        `BUG-37: Modify Order shows nationalId="${linkedId}", expected "${NATIONAL_ID}"`,
        `Receptionist just handed off an order with no patient — the receptionist's day FAILed.`);
      expect(linkedId, 'BUG-37 — receptionist handoff broken').toBe(NATIONAL_ID); return;
    }
    markStep(PERSONA, 5, 'PASS', `Order ${accession} correctly linked to patient ${NATIONAL_ID}`);
  });

  test('Step 6 — Print barcode label (FUNCTION)', async ({ page }) => {
    if (!accession) test.skip();
    await page.goto(BASE);
    // The barcode print page POSTs to a labels generator. The lab tech
    // doesn't see the payload — they click Print and expect a PDF.
    const r = await apiCall<string>(
      page, `/api/OpenELIS-Global/PrintBarcode?accessionNumber=${encodeURIComponent(accession!)}`,
      { accept: 'application/pdf', expectBinary: true }
    );
    if (!r.ok) {
      markStep(PERSONA, 6, 'PARTIAL',
        `Barcode PDF HTTP ${r.status}`,
        `Print path differs from this guess. Receptionist day completes only if printing actually works.`);
      test.info().annotations.push({ type: 'partial', description: `barcode print ${r.status}` });
      return;
    }
    const buf = Buffer.from(String(r.body), 'base64');
    const isPdf = buf.length >= 4 && buf.toString('ascii', 0, 4) === '%PDF';
    if (!isPdf) {
      markStep(PERSONA, 6, 'FAIL', 'Barcode response is not a PDF');
      expect(isPdf).toBeTruthy(); return;
    }
    markStep(PERSONA, 6, 'PASS', `Barcode PDF generated, ${buf.length} bytes`);
  });

  test.afterAll(() => {
    // eslint-disable-next-line no-console
    console.log(`[Persona PA] Receptionist day summary: created ${NATIONAL_ID} → accession ${accession}`);
  });
});
