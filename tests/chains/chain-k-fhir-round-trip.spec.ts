/**
 * tests/chains/chain-k-fhir-round-trip.spec.ts
 *
 * SKILL §11 Chain K — Cross-installation FHIR Round-trip
 *
 * What this chain proves: the FHIR R4 surface OpenELIS markets actually
 * round-trips. A UI-created order/patient/result can be fetched as the
 * declared FHIR resource and the fields match. Conversely (where the
 * server accepts writes): a FHIR-POSTed resource appears in the UI.
 *
 * Why this matters: OpenELIS declares 5 FHIR resources in its
 * Capability Statement (Patient, Observation, Practitioner,
 * Organization, OperationDefinition). EMR integrators (OpenSRP /
 * OpenMRS) rely on this advertised capability. A CapabilityStatement
 * that declares support without round-trip verification is a
 * trust-but-don't-verify integration footgun.
 *
 * Run individually:
 *   npx playwright test --project=chain-k
 */

import { test, expect } from '@playwright/test';
import { BASE, apiCall, findOrSeedOrder, markStep, ChainOrderRef } from './_common';

const FHIR_BASES = [
  '/api/OpenELIS-Global/fhir',
  '/fhir',
  '/hapi-fhir-jpaserver/fhir',
];

async function findFhirBase(page: import('@playwright/test').Page): Promise<string | null> {
  for (const path of FHIR_BASES) {
    const r = await apiCall<unknown>(page, `${path}/metadata`, { accept: 'application/fhir+json' });
    if (r.ok) return path;
  }
  return null;
}

test.describe.serial('Chain K — FHIR Round-trip', () => {
  let order: ChainOrderRef | null = null;
  let fhirBase: string | null = null;
  let postedPatientId: string | null = null;

  test.beforeAll(() => {
    // eslint-disable-next-line no-console
    console.log(`[Chain K] BASE=${BASE}`);
  });

  test('Step 1 — FHIR metadata endpoint reachable (RENDER)', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    fhirBase = await findFhirBase(page);
    if (!fhirBase) {
      markStep('K', 1, 'FAIL',
        `No FHIR base path responded to /metadata`,
        `Tried [${FHIR_BASES.join(', ')}]. Either FHIR is not deployed (BUG-56 territory) or the path differs.`);
      expect(fhirBase).not.toBeNull(); return;
    }
    markStep('K', 1, 'PASS', `FHIR base = ${fhirBase}`);
  });

  test('Step 2 — CapabilityStatement declares expected resources (FUNCTION)', async ({ page }) => {
    if (!fhirBase) test.skip();
    await page.goto(BASE);
    const r = await apiCall<{ rest?: Array<{ resource?: Array<{ type?: string }> }> }>(
      page, `${fhirBase}/metadata`, { accept: 'application/fhir+json' }
    );
    if (!r.ok || typeof r.body !== 'object' || r.body === null) {
      markStep('K', 2, 'FAIL', `metadata HTTP ${r.status}`); expect(r.ok).toBeTruthy(); return;
    }
    const declared: string[] = [];
    const rest = (r.body as { rest?: Array<{ resource?: Array<{ type?: string }> }> }).rest || [];
    for (const r1 of rest) {
      for (const res of r1.resource || []) if (res.type) declared.push(res.type);
    }
    const expected = ['Patient', 'Observation'];
    const missing = expected.filter(t => !declared.includes(t));
    if (missing.length > 0) {
      markStep('K', 2, 'FAIL', `CapabilityStatement missing core resources: [${missing.join(', ')}]`);
      expect(missing.length).toBe(0); return;
    }
    markStep('K', 2, 'PASS', `Declared resources: ${declared.join(', ')}`);
  });

  test('Step 3 — Acquire an order so we have a Patient + Observation to round-trip (RENDER)', async ({ page }) => {
    await page.goto(BASE);
    order = await findOrSeedOrder(page);
    if (!order) {
      markStep('K', 3, 'FAIL', 'No QA_AUTO_ order; run --project=seed-data first');
      expect(order).not.toBeNull(); return;
    }
    markStep('K', 3, 'PASS', `Order ${order.accession} for patient ${order.patientNationalId}`);
  });

  test('Step 4 — Fetch UI-created patient as FHIR Patient (CROSS-LINK)', async ({ page }) => {
    if (!fhirBase || !order) test.skip();
    await page.goto(BASE);
    const r = await apiCall<{ entry?: Array<{ resource?: { identifier?: Array<{ value?: string }>; name?: Array<{ family?: string }> } }> }>(
      page,
      `${fhirBase}/Patient?identifier=${encodeURIComponent(order!.patientNationalId)}`,
      { accept: 'application/fhir+json' }
    );
    if (!r.ok) { markStep('K', 4, 'FAIL', `Patient search HTTP ${r.status}`); expect(r.ok).toBeTruthy(); return; }
    const entries = (typeof r.body === 'object' && r.body !== null)
      ? ((r.body as { entry?: Array<{ resource?: { identifier?: Array<{ value?: string }>; name?: Array<{ family?: string }> } }>}).entry || [])
      : [];
    const match = entries.find(e =>
      e.resource?.identifier?.some(id => id.value === order!.patientNationalId)
    );
    if (!match) {
      markStep('K', 4, 'FAIL',
        `Patient ${order!.patientNationalId} not findable as FHIR Patient`,
        `UI created the patient (Chain A round-trip works) but the FHIR projection does not include it. CROSS-LINK broken.`);
      expect(match).toBeTruthy(); return;
    }
    markStep('K', 4, 'PASS', `Patient ${order!.patientNationalId} found in FHIR (family=${match.resource?.name?.[0]?.family})`);
  });

  test('Step 5 — POST a new Patient via FHIR (PERSIST, write surface)', async ({ page }) => {
    if (!fhirBase) test.skip();
    await page.goto(BASE);
    const nationalId = `QA_AUTO_FHIR_${Date.now()}`;
    const r = await apiCall<{ id?: string; resourceType?: string }>(
      page, `${fhirBase}/Patient`, {
        method: 'POST',
        accept: 'application/fhir+json',
        body: {
          resourceType: 'Patient',
          identifier: [{ system: 'urn:ietf:rfc:3986', value: nationalId }],
          name: [{ family: 'QA_AUTO_Chain_K', given: ['FHIR-POSTed'] }],
          gender: 'female',
          birthDate: '2000-01-01',
        },
      });
    if (!r.ok) {
      markStep('K', 5, 'BLOCKED',
        `FHIR Patient POST returned HTTP ${r.status}`,
        `OpenELIS may be FHIR-read-only. Write surface is not deployed; downstream UI-write verification (Step 6) skipped.`);
      test.info().annotations.push({ type: 'blocked', description: 'FHIR write not deployed' });
      return;
    }
    postedPatientId = (typeof r.body === 'object' && r.body !== null) ? (r.body as { id?: string }).id ?? null : null;
    markStep('K', 5, 'PASS', `FHIR Patient created id=${postedPatientId}`);
  });

  test('Step 6 — FHIR-POSTed patient appears in UI patient search (CROSS-LINK, reverse direction)', async ({ page }) => {
    if (!postedPatientId) test.skip();
    await page.goto(BASE);
    // Search UI patient list for our QA_AUTO_FHIR_ prefix
    const r = await apiCall<{ patientList?: Array<{ nationalId?: string; lastName?: string }> }>(
      page, `/api/OpenELIS-Global/rest/patient-search-results?lastName=QA_AUTO_Chain_K`
    );
    if (!r.ok) { markStep('K', 6, 'FAIL', `patient-search HTTP ${r.status}`); expect(r.ok).toBeTruthy(); return; }
    const found = (typeof r.body === 'object' && r.body !== null)
      ? ((r.body as { patientList?: Array<{ lastName?: string }> }).patientList || []).some(p => p.lastName === 'QA_AUTO_Chain_K')
      : false;
    if (!found) {
      markStep('K', 6, 'FAIL',
        `FHIR-POSTed patient (id=${postedPatientId}) does NOT appear in UI patient search`,
        `FHIR write surface accepts the POST but the data doesn't project to the UI's patient repository. ` +
        `One-way FHIR (read-out only); a true round-trip integration requires this to work.`);
      expect(found).toBeTruthy(); return;
    }
    markStep('K', 6, 'PASS', `FHIR-POSTed patient surfaces in UI patient search — full round-trip works`);
  });
});
