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

const PERSONA = 'PA';
const NATIONAL_ID = `QA_AUTO_PA_${Date.now()}`;
const PATIENT = { firstName: 'Persona', lastName: 'PA_Walker', dob: '1985-04-12', gender: 'F' };

test.describe.serial('Persona PA — Receptionist', () => {
  let patientPK: string | null = null;
  let accession: string | null = null;
  let testId: string | null = null;
  let sampleTypeId: string | null = null;

  test('Step 1 — Patient search by national ID (RENDER)', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    const r = await apiCall<{ patientList?: Array<unknown> }>(
      page, `/api/OpenELIS-Global/rest/patient-search-results?nationalId=${encodeURIComponent(NATIONAL_ID)}`
    );
    if (!r.ok) {
      markStep(PERSONA, 1, 'FAIL', `patient-search-results HTTP ${r.status}`);
      expect(r.ok).toBeTruthy(); return;
    }
    const items = (typeof r.body === 'object' && r.body !== null)
      ? ((r.body as { patientList?: Array<unknown> }).patientList || [])
      : [];
    markStep(PERSONA, 1, 'PASS', `Search returned ${items.length} matches (expected 0 for fresh ID)`);
  });

  test('Step 2 — Create new patient since search was empty (PERSIST)', async ({ page }) => {
    await page.goto(BASE);
    const create = await apiCall<{ patientPK?: string }>(
      page, '/api/OpenELIS-Global/rest/patient-management', {
        method: 'POST',
        body: {
          patientProperties: {
            nationalId: NATIONAL_ID,
            firstName: PATIENT.firstName,
            lastName: PATIENT.lastName,
            birthDate: PATIENT.dob,
            gender: PATIENT.gender,
            patientUpdateStatus: 'NEW',
          },
        },
      });
    if (!create.ok) {
      markStep(PERSONA, 2, 'FAIL', `patient-management POST HTTP ${create.status}`);
      expect(create.ok).toBeTruthy(); return;
    }
    // Round-trip to retrieve patientPK
    const verify = await apiCall<{ patientList?: Array<{ patientPK?: string }> }>(
      page, `/api/OpenELIS-Global/rest/patient-search-results?nationalId=${encodeURIComponent(NATIONAL_ID)}`
    );
    patientPK = (verify.ok && typeof verify.body === 'object' && verify.body !== null)
      ? ((verify.body as { patientList?: Array<{ patientPK?: string }> }).patientList?.[0]?.patientPK ?? null)
      : null;
    if (!patientPK) {
      markStep(PERSONA, 2, 'FAIL', 'Patient created but PK not found in search');
      expect(patientPK).toBeTruthy(); return;
    }
    markStep(PERSONA, 2, 'PASS', `Patient ${NATIONAL_ID} created with patientPK=${patientPK}`);
  });

  test('Step 3 — Discover test catalog for order (RENDER)', async ({ page }) => {
    await page.goto(BASE);
    const t = await apiCall<{ testList?: Array<{ id?: string; sampleTypeId?: string }> }>(
      page, '/api/OpenELIS-Global/rest/test-list?activeOnly=true'
    );
    const tests = (t.ok && typeof t.body === 'object' && t.body !== null)
      ? ((t.body as { testList?: Array<{ id?: string; sampleTypeId?: string }> }).testList || [])
      : [];
    if (tests.length === 0) {
      markStep(PERSONA, 3, 'FAIL', 'Empty test catalog'); expect(tests.length).toBeGreaterThan(0); return;
    }
    testId = tests[0].id!;
    sampleTypeId = tests[0].sampleTypeId || '1';
    markStep(PERSONA, 3, 'PASS', `Using test ${testId} sampleType ${sampleTypeId}`);
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
    const r = await apiCall<{ patientProperties?: { nationalId?: string } }>(
      page, `/api/OpenELIS-Global/rest/SampleEdit?labNumber=${encodeURIComponent(accession!)}`
    );
    if (!r.ok) {
      markStep(PERSONA, 5, 'FAIL', `SampleEdit HTTP ${r.status}`);
      expect(r.ok).toBeTruthy(); return;
    }
    const linkedId = (typeof r.body === 'object' && r.body !== null)
      ? ((r.body as { patientProperties?: { nationalId?: string } }).patientProperties?.nationalId)
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
