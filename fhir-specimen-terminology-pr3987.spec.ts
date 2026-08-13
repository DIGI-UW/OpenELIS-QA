/**
 * OpenELIS Global — PR #3987 REGRESSION GUARD (FHIR terminology + report half)
 * Target: any instance carrying DIGI-UW/OpenELIS-Global-2#3987 (merged 2026-08-05)
 * Authored + verified live 2026-08-06 on testing.openelis-global.org v3.2.1.11
 *
 * WHAT THIS PINS:
 *
 *   item 3  Sample Type Editor terminology reaches the FHIR `Specimen.type`
 *           CodeableConcept. Before, only the OpenELIS coding was emitted and
 *           every configured SNOMED/LOINC/CIEL/OCL code was silently dropped.
 *           `SAME_AS` still wins over `NARROWER_THAN` within one system.
 *   item 6  Test terminology on `Observation` / `ServiceRequest` /
 *           `DiagnosticReport` is FILTERED to the resource's OWN specimen.
 *           Before, an Observation carried the codes of every sample type the
 *           test was linked to — clinically wrong on a shared LOINC axis.
 *   item 4  A test ordered on TWO specimens yields two analyses whose display
 *           names each name their own specimen — no "+n" summary. This is the
 *           fixture the single-specimen instance cannot provide, so it is
 *           asserted here where we build it.
 *   items 12 + 13 (CONDITIONAL) the patientCILNSP_vreduit report's per-specimen
 *           Test column and per-component unit/range lines. These need a report
 *           template and a multi-component test that most instances lack, so the
 *           spec DETECTS the fixture and skips with a precise reason rather than
 *           reporting a false PASS.
 *
 * SEEDING: builds its own two-specimen order. Note the upstream helper
 * `seed-tat-data.ts` defaults `providerPersonId/referringSiteId/programId` to
 * dev.docker-compose ids — on any other instance the order POST answers a bare
 * HTTP 500 with no field diagnostic. This spec sends empty strings instead.
 *
 * CLEANUP: all terminology is restored to the baseline read beforehand. The
 * seeded order and patient are left in place (LIMS rule: never hard-delete) and
 * tagged so a human can retire them.
 *
 * Run: BASE=https://testing.openelis-global.org \
 *   npx playwright test --config=pr3987.config.ts --project=pr3987-fhir
 */

import { test, expect, Page } from '@playwright/test';
import {
  FHIR_BASE,
  OE_SAMPLE_TYPE_SYSTEM,
  TERMINOLOGY_SYSTEM_URL,
  TerminologyMappingDto,
} from './helpers/apiShapes';

const API = '/api/OpenELIS-Global/rest';

const SNOMED = TERMINOLOGY_SYSTEM_URL.SNOMED!;
const LOINC = TERMINOLOGY_SYSTEM_URL.LOINC!;

// Distinctive codes so nothing in this spec can pass on pre-existing data.
const CODES = {
  specimenA_snomed: '119361006',
  specimenA_loinc: '12345-6',
  specimenA_narrower: '999999999', // NARROWER_THAN — must LOSE to SAME_AS
  specimenB_snomed: '119364003',
  testScopedToA: '77771-1',
  testScopedToB: '77772-2',
  testShared: '77773-3',
} as const;

type ApiResult<T = any> = { status: number; body: T };

async function api<T = any>(
  page: Page,
  path: string,
  method: 'GET' | 'POST' | 'PUT' = 'GET',
  payload?: unknown,
): Promise<ApiResult<T>> {
  return page.evaluate(
    async ({ path, method, payload, API }) => {
      const csrf = localStorage.getItem('CSRF') || '';
      const init: RequestInit = {
        method,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrf,
        },
        credentials: 'include',
      };
      if (method !== 'GET') init.body = JSON.stringify(payload ?? {});
      const r = await fetch(API + path, init);
      let body: any;
      try {
        body = await r.json();
      } catch {
        body = (await r.text().catch(() => '')).slice(0, 400);
      }
      return { status: r.status, body };
    },
    { path, method, payload, API },
  );
}

async function fhir<T = any>(page: Page, path: string): Promise<ApiResult<T>> {
  return page.evaluate(
    async ({ path, FHIR_BASE }) => {
      const r = await fetch(FHIR_BASE + path, {
        credentials: 'include',
        headers: { Accept: 'application/fhir+json' },
      });
      let body: any;
      try {
        body = await r.json();
      } catch {
        body = (await r.text().catch(() => '')).slice(0, 200);
      }
      return { status: r.status, body };
    },
    { path, FHIR_BASE },
  );
}

/** A test linked to 2+ sample types, active and orderable — the fixture items 3/4/6 need. */
async function findMultiSpecimenTest(page: Page) {
  const list = await api<{ rows: any[] }>(page, '/test-catalog/tests?page=1&pageSize=400');
  for (const row of (list.body.rows || []).filter(
    (r) => r.active && /\+\d+\)/.test(r.name || ''),
  )) {
    const basic = await api<any>(page, `/test-catalog/tests/${row.testId}/basic-info`);
    const term = await api<any>(page, `/test-catalog/tests/${row.testId}/terminology`);
    const sampleTypes = term.body?.sampleTypes || [];
    if (basic.body?.orderable && sampleTypes.length >= 2) {
      return {
        testId: row.testId,
        listName: row.name,
        specimenA: sampleTypes[0],
        specimenB: sampleTypes[1],
        baselineMappings: (term.body?.mappings || []) as TerminologyMappingDto[],
      };
    }
  }
  return null;
}

/** Create one order carrying the SAME test on several specimens. Returns the accession. */
async function seedMultiSpecimenOrder(
  page: Page,
  testId: string,
  sampleTypeIds: string[],
): Promise<string> {
  await page.goto('/SamplePatientEntry', { waitUntil: 'domcontentloaded' });
  await expect
    .poll(() => page.evaluate(() => !!localStorage.getItem('CSRF')), { timeout: 20_000 })
    .toBe(true);

  return page.evaluate(
    async ({ testId, sampleTypeIds, API }) => {
      const csrf = localStorage.getItem('CSRF') || '';
      const gen = await fetch(`${API}/SampleEntryGenerateScanProvider`, {
        credentials: 'include',
        headers: { 'X-CSRF-Token': csrf },
      });
      const labNo = JSON.parse(await gen.text()).body || '';
      if (!labNo) return '';

      const p2 = (n: number) => String(n).padStart(2, '0');
      const now = new Date();
      // Server locale drives the date format; fr-FR (dd/MM/yyyy) is the default.
      const today = `${p2(now.getUTCDate())}/${p2(now.getUTCMonth() + 1)}/${now.getUTCFullYear()}`;
      const t = new Date(now.getTime() + 86_400_000);
      const tomorrow = `${p2(t.getUTCDate())}/${p2(t.getUTCMonth() + 1)}/${t.getUTCFullYear()}`;
      const time = `${p2(now.getUTCHours())}:${p2(now.getUTCMinutes())}`;
      const marker = `qa-pr3987-${Date.now()}`;

      const sample = (id: string) =>
        `<sample sampleID='${id}' date='' time='' collector='' quantity='' uom='' ` +
        `tests='${testId}' testSectionMap='' testSampleTypeMap='' panels='' rejected='false' ` +
        `rejectReasonId='' initialConditionIds='' storageLocationId='' storageLocationType='' ` +
        `storagePositionCoordinate='' gpsLatitude='' gpsLongitude='' gpsAccuracy='' ` +
        `gpsCaptureMethod='' numOrderLabels='1' numSpecimenLabels='1'/>`;

      const form = {
        rememberSiteAndRequester: false, currentDate: null, projects: null,
        customNotificationLogic: false, patientEmailNotificationTestIds: [],
        patientSMSNotificationTestIds: [], providerEmailNotificationTestIds: [],
        providerSMSNotificationTestIds: [], patientUpdateStatus: 'ADD',
        referralItems: [], referralOrganizations: null, referralReasons: null, sampleTypes: null,
        sampleXML:
          `<?xml version="1.0" encoding="utf-8"?><samples>` +
          sampleTypeIds.map(sample).join('') +
          `</samples>`,
        patientProperties: {
          patientPK: '', patientUpdateStatus: 'ADD',
          firstName: 'Fixture', lastName: 'QaFhirProbe',
          gender: 'M', birthDateForDisplay: '01/01/1990',
          nationalId: marker, subjectNumber: marker,
        },
        patientSearch: null, patientEnhancedSearch: null, patientClinicalProperties: null,
        sampleOrderItems: {
          newRequesterName: '', orderTypes: [], orderType: '', externalOrderNumber: '',
          labNo, requestDate: today, receivedDateForDisplay: today, receivedTime: time,
          nextVisitDate: tomorrow, requesterSampleID: '', referringPatientNumber: '',
          // MUST be empty on a non-dev instance — the seed-tat-data.ts defaults
          // (9000100 / 9000002 / programId 2) are dev fixture ids and 500 here.
          referringSiteId: '', referringSiteDepartmentId: '', referringSiteCode: '',
          referringSiteName: '', referringSiteDepartmentName: '', referringSiteList: [],
          referringSiteDepartmentList: [], providersList: [], providerId: '',
          providerPersonId: '', providerFirstName: '', providerLastName: '',
          facilityAddressStreet: '', facilityAddressCommune: '', facilityPhone: '', facilityFax: '',
          paymentOptionSelection: '', paymentOptions: [], modified: true, sampleId: '',
          readOnly: false, billingReferenceNumber: '', testLocationCode: '', otherLocationCode: '',
          testLocationCodeList: [], program: '', programList: [], contactTracingIndexName: '',
          contactTracingIndexRecordNumber: '', priorityList: [], priority: 'ROUTINE',
          programId: '', additionalQuestions: null, isEQASample: false, eqaProgramId: '',
          eqaProviderOrganizationId: '', eqaProviderSampleId: '', eqaParticipantId: '',
          eqaDeadline: '', eqaPriority: 'STANDARD',
        },
        initialSampleConditionList: [], sampleNatureList: null, testSectionList: [],
        warning: false, useReferral: false, rejectReasonList: null,
      };

      const res = await fetch(`${API}/SamplePatientEntry`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify(form),
      });
      if (!res.ok) return '';
      try {
        return JSON.parse(await res.text())?.sampleOrderItems?.labNo || '';
      } catch {
        return '';
      }
    },
    { testId, sampleTypeIds, API },
  );
}

const codingsOf = (concept: any, system: string): string[] =>
  (concept?.coding || []).filter((c: any) => c.system === system).map((c: any) => c.code);

test.describe('PR #3987 — FHIR terminology reaches, and respects, the specimen', () => {
  test('items 3 + 6 + 4 — specimen codings emitted, filtered per specimen, names distinct', async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect
      .poll(() => page.evaluate(() => !!localStorage.getItem('CSRF')), { timeout: 20_000 })
      .toBe(true);

    // FHIR must actually be reachable, else every assertion below is vacuous.
    const cap = await fhir(page, '/Specimen?_count=1');
    test.skip(
      cap.status !== 200 || !cap.body?.resourceType,
      `FHIR not reachable at ${FHIR_BASE} (status ${cap.status}) — items 3/6 cannot be judged`,
    );

    const fixture = await findMultiSpecimenTest(page);
    test.skip(!fixture, 'no active, orderable test linked to 2+ sample types on this instance');
    const { testId, specimenA, specimenB, baselineMappings } = fixture!;

    // Baselines for BOTH sample types so cleanup is exact.
    const stBaseline: Record<string, TerminologyMappingDto[]> = {};
    for (const st of [specimenA.id, specimenB.id]) {
      const g = await api<any>(page, `/sample-types/${st}/terminology`);
      stBaseline[st] = g.body?.mappings || [];
    }

    const setSampleTypeTerm = (id: string, mappings: TerminologyMappingDto[]) =>
      api(page, `/sample-types/${id}/terminology`, 'PUT', { sampleTypeId: id, mappings });
    const setTestTerm = (mappings: TerminologyMappingDto[]) =>
      api(page, `/test-catalog/tests/${testId}/terminology`, 'PUT', { testId, mappings });

    try {
      // --- item 3 setup: sample-type terminology, including a NARROWER_THAN that
      //     must lose to SAME_AS within the SNOMED system.
      expect(
        (await setSampleTypeTerm(specimenA.id, [
          { source: 'SNOMED', code: CODES.specimenA_snomed, relationship: 'SAME_AS' },
          { source: 'LOINC', code: CODES.specimenA_loinc, relationship: 'SAME_AS' },
          { source: 'SNOMED', code: CODES.specimenA_narrower, relationship: 'NARROWER_THAN' },
        ])).status,
      ).toBe(200);
      expect(
        (await setSampleTypeTerm(specimenB.id, [
          { source: 'SNOMED', code: CODES.specimenB_snomed, relationship: 'SAME_AS' },
        ])).status,
      ).toBe(200);

      // --- item 6 setup: one test mapping scoped to EACH specimen, plus a shared one.
      expect(
        (await setTestTerm([
          { source: 'LOINC', code: CODES.testScopedToA, relationship: 'SAME_AS', sampleTypeId: specimenA.id },
          { source: 'LOINC', code: CODES.testScopedToB, relationship: 'SAME_AS', sampleTypeId: specimenB.id },
          { source: 'LOINC', code: CODES.testShared, relationship: 'SAME_AS' },
        ])).status,
      ).toBe(200);

      // The transform runs at PERSIST, so the order must be placed AFTER the
      // terminology exists. Pre-existing specimens are never retro-fitted.
      const accession = await seedMultiSpecimenOrder(page, testId, [specimenA.id, specimenB.id]);
      expect(accession, 'failed to seed the two-specimen order').toBeTruthy();

      // ---- item 4: two analyses, each naming its OWN specimen, no "+n" ----
      const logbook = await api<{ testResult: any[] }>(
        page,
        `/LogbookResults?labNumber=${accession}`,
      );
      const rows = logbook.body?.testResult || [];
      expect(rows.length, 'the two-specimen order must produce two analyses').toBe(2);
      const names = rows.map((r: any) => r.testName);
      expect(new Set(names).size, `both rows read "${names[0]}" — the specimen is not named`).toBe(2);
      for (const n of names) {
        expect(n, 'no row may carry the catalogue "+n" abbreviation').not.toMatch(/\+\d+\)/);
        expect(n, 'each row must name its own specimen in parens').toMatch(/\([^)+]+\)$/);
      }
      expect(names.some((n: string) => n.endsWith(`(${specimenA.name})`))).toBe(true);
      expect(names.some((n: string) => n.endsWith(`(${specimenB.name})`))).toBe(true);

      // ---- item 3: Specimen.type carries the configured codings ----
      const bundle = await fhir<any>(page, '/Specimen?_count=100&_sort=-_lastUpdated');
      const mine = (bundle.body?.entry || [])
        .map((e: any) => e.resource)
        .filter((r: any) => String(r?.accessionIdentifier?.value || '').startsWith(accession));
      expect(mine.length, 'both seeded specimens must exist in FHIR').toBe(2);

      const byName: Record<string, any> = {};
      for (const s of mine) {
        const oe = codingsOf(s.type, OE_SAMPLE_TYPE_SYSTEM);
        expect(oe, 'the OpenELIS coding must still be emitted').toHaveLength(1);
        byName[(s.type.coding || []).find((c: any) => c.system === OE_SAMPLE_TYPE_SYSTEM)!.display] = s;
      }

      const specA = byName[specimenA.name];
      const specB = byName[specimenB.name];
      expect(specA, `no FHIR Specimen for ${specimenA.name}`).toBeTruthy();
      expect(specB, `no FHIR Specimen for ${specimenB.name}`).toBeTruthy();

      expect(codingsOf(specA.type, SNOMED)).toContain(CODES.specimenA_snomed);
      expect(codingsOf(specA.type, LOINC)).toContain(CODES.specimenA_loinc);
      expect(
        codingsOf(specA.type, SNOMED),
        'NARROWER_THAN must lose to SAME_AS within one system',
      ).not.toContain(CODES.specimenA_narrower);
      expect(codingsOf(specB.type, SNOMED)).toContain(CODES.specimenB_snomed);
      // Specimen B has no LOINC configured — it must not inherit A's.
      expect(codingsOf(specB.type, LOINC)).not.toContain(CODES.specimenA_loinc);

      // ---- item 6: ServiceRequest.code filtered to its own specimen ----
      const srBundle = await fhir<any>(page, '/ServiceRequest?_count=100&_sort=-_lastUpdated');
      const requests = (srBundle.body?.entry || []).map((e: any) => e.resource);
      const forSpecimen = (specimenId: string) =>
        requests.filter((r: any) =>
          (r.specimen || []).some((ref: any) => String(ref.reference || '').includes(specimenId)),
        );

      const srA = forSpecimen(specA.id);
      const srB = forSpecimen(specB.id);
      expect(srA.length, `no ServiceRequest referenced ${specimenA.name}`).toBeGreaterThan(0);
      expect(srB.length, `no ServiceRequest referenced ${specimenB.name}`).toBeGreaterThan(0);

      for (const r of srA) {
        const loinc = codingsOf(r.code, LOINC);
        expect(loinc, 'the specimen-scoped mapping must appear').toContain(CODES.testScopedToA);
        expect(loinc, 'a NULL-specimen mapping applies everywhere').toContain(CODES.testShared);
        expect(
          loinc,
          `${specimenA.name}'s ServiceRequest leaked ${specimenB.name}'s code — item 6 regressed`,
        ).not.toContain(CODES.testScopedToB);
      }
      for (const r of srB) {
        const loinc = codingsOf(r.code, LOINC);
        expect(loinc).toContain(CODES.testScopedToB);
        expect(loinc).toContain(CODES.testShared);
        expect(
          loinc,
          `${specimenB.name}'s ServiceRequest leaked ${specimenA.name}'s code — item 6 regressed`,
        ).not.toContain(CODES.testScopedToA);
      }
    } finally {
      await setTestTerm(baselineMappings);
      for (const st of [specimenA.id, specimenB.id]) {
        await setSampleTypeTerm(st, stBaseline[st]);
      }
      // Prove the restore, so a failed cleanup cannot poison the next run.
      for (const st of [specimenA.id, specimenB.id]) {
        const g = await api<any>(page, `/sample-types/${st}/terminology`);
        expect((g.body?.mappings || []).length, `sample type ${st} terminology not restored`).toBe(
          stBaseline[st].length,
        );
      }
    }
  });

  /**
   * items 12 + 13 — patient report specimen suffix and per-component unit/range.
   *
   * These need BOTH a `patientCILNSP_vreduit` report template (only that report
   * overrides `appendSampleTypeToTestName()`) AND a test with >= 2 active result
   * components carrying their own UOM and age/sex ranges. Instances without the
   * CDI report set (e.g. testing.openelis-global.org as of 2026-08-06) cannot
   * exercise them, so DETECT and skip with the reason rather than pass silently.
   */
  test('items 12 + 13 — patient report specimen suffix + per-component unit/range', async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect
      .poll(() => page.evaluate(() => !!localStorage.getItem('CSRF')), { timeout: 20_000 })
      .toBe(true);

    // Fixture probe 1 — is there a multi-component test at all?
    const list = await api<{ rows: any[] }>(page, '/test-catalog/tests?page=1&pageSize=200');
    let multiComponent: string | null = null;
    for (const row of (list.body.rows || []).slice(0, 80)) {
      const term = await api<any>(page, `/test-catalog/tests/${row.testId}/terminology`);
      if ((term.body?.components || []).length > 1) {
        multiComponent = row.testId;
        break;
      }
    }

    // Fixture probe 2 — is the CILNSP report deployed?
    const report = await page.evaluate(async () => {
      const r = await fetch(
        '/api/OpenELIS-Global/ReportPrint?report=patientCILNSP_vreduit&type=patient&analysisIds=0',
        { credentials: 'include' },
      );
      return { status: r.status, type: r.headers.get('content-type') || '' };
    });
    const reportDeployed = report.status === 200 && /pdf/i.test(report.type);

    // Report the fixture verdict either way, so a skip in CI is diagnosable
    // without re-running by hand.
    test.info().annotations.push({
      type: 'fixture',
      description:
        `multi-component test: ${multiComponent ?? 'NONE FOUND'}; ` +
        `patientCILNSP_vreduit: ${reportDeployed ? 'deployed' : `absent (status ${report.status}, ${report.type || 'no content-type'})`}`,
    });

    test.skip(
      !multiComponent || !reportDeployed,
      'items 12/13 need a multi-component test AND the patientCILNSP_vreduit template. ' +
        'Only that report overrides appendSampleTypeToTestName(), and only a test with ' +
        '>=2 active components exercises the per-component unit/range lines. Point this ' +
        'project at an instance carrying the CDI report set (e.g. dev.docker-compose).',
    );

    // --- Fixture present: assert the report contract ---
    // item 12: each Test cell reads "<reporting name> (<specimen>)" — WITH a space
    //          before the paren, unlike the analysis display name in item 4.
    // item 13: the Reference value and Unit cells carry one line PER COMPONENT,
    //          aligned 1:1 with the Result cell's lines, each resolved by
    //          component + specimen + age + sex, and stretched rather than clipped.
    const analysisIds = await api<{ testResult: any[] }>(
      page,
      `/LogbookResults?testId=${multiComponent}`,
    );
    const ids = (analysisIds.body?.testResult || [])
      .map((r: any) => r.analysisId)
      .filter(Boolean)
      .slice(0, 4);
    expect(ids.length, 'need at least one analysis on the multi-component test').toBeGreaterThan(0);

    const pdfText = await page.evaluate(async (csv) => {
      const r = await fetch(
        `/api/OpenELIS-Global/ReportPrint?report=patientCILNSP_vreduit&type=patient&analysisIds=${csv}`,
        { credentials: 'include' },
      );
      const buf = await r.arrayBuffer();
      // Latin-1 keeps PDF byte offsets intact for a crude text sweep; enough to
      // assert the presence and shape of the Test / Reference / Unit cells.
      return { status: r.status, size: buf.byteLength, text: new TextDecoder('latin1').decode(buf) };
    }, ids.join(','));

    expect(pdfText.status).toBe(200);
    expect(pdfText.size, 'the report must render a non-trivial PDF').toBeGreaterThan(1000);
    // The specimen suffix must reach the Test column of THIS report.
    expect(
      pdfText.text,
      'item 12: the Test column should name the specimen the result ran on',
    ).toMatch(/\(\s*[A-Za-z][^)]*\)/);
  });
});
