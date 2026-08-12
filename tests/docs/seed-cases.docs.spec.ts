// Demo-data seed capability (part 6): specialized cases — Histopathology / Immunohistochemistry / Cytology.
//   BASE=https://testing.openelis-global.org CASES_PER=10 npx playwright test --project=docs tests/docs/seed-cases.docs.spec.ts
//   RUN ON ITS OWN (one seeder per invocation).
//
// Grounded on OpenELIS-Global-2 (DIGI-UW): SamplePatientUpdateData auto-creates a Pathology/IHC/Cytology
// case when an order is placed under a program whose name matches. So a "case" == an order with programId set.
//
// ---------------------------------------------------------------------------------------------------
// 2026-08-12 — TWO HARNESS DEFECTS FIXED HERE. Both previously read as product bugs; both were ours.
// Full evidence record: tests/docs/HARNESS-FINDINGS.md
//
// DEFECT 1: the seeder sent `sampleOrderItems.additionalQuestions: null`.
//   A case created that way persists with NO program QuestionnaireResponse, and
//   GET /rest/{discipline}/caseView/{id} then returns HTTP 500 (no UI error shown).
//   Live evidence on testing.openelis-global.org (2026-08-12), each case queried on its OWN discipline:
//     cytology/1  -> 200 (hasQ)   [pre-existing demo case, created via the GUI]
//     cytology/22 -> 500 (nullQ)  [seeded by the old version of this file]
//     cytology/23 -> 500 (nullQ)  [seeded by the old version of this file]
//     pathology/13-> 500 (nullQ)  [seeded by the old version of this file]
//     pathology/15-> 500 (nullQ)  [seeded by the old version of this file]
//     pathology/49-> 200 (hasQ)   [created through the GUI wizard as the control]
//     cytology/50 -> 200 (hasQ)   [created through the GUI wizard as the control]
//   caseView returns 200 iff the order carries a QuestionnaireResponse. Correlation is 7/7.
//   NOTE: a 500 (rather than a graceful empty render) on a null questionnaire is arguably still a
//   product robustness gap, but it is NOT reachable through the GUI — the wizard always sends one.
//
// DEFECT 2: the status-transition POST body is PER-DISCIPLINE, and the seeder sent one shape for all.
//   Each shape captured live off the real Save button on that discipline's case view:
//     pathology            {assignedTechnicianId, status, blocks:[], slides:[], reports:[],
//                           release:false, techniques:[], requests:[], conclusions:[]}
//     cytology             {assignedTechnicianId, status, slides:[], reports:[], release:false}
//     immunohistochemistry {assignedTechnicianId, status, reports:[], release:false}
//   The shapes are NOT interchangeable, and the two failure modes are different:
//     too many keys  -> HTTP 400 HttpMessageNotReadableException (e.g. pathology shape -> cytology,
//                       or adding `slides` to the IHC body)
//     too few keys   -> HTTP 500 (e.g. dropping `reports` from the IHC body)
//   A 500 here does NOT mean the case is broken — check the body shape first.
//   Verified: case 49 GROSSING -> CUTTING, case 342 (cyto) -> SCREENING, case 401 (IHC) ->
//   READY_PATHOLOGIST, all with technician 114, each captured off that discipline's real Save button.
//
//   Trap worth naming: /ImmunohistochemistryCaseView/{id} renders a shell for an id that is not an
//   IHC case, and Save posts to a nonexistent case. Always take the id from that discipline's own
//   dashboard — pathology and cytology ids are a different sequence and will silently mislead you.
//
// Also note: caseView is route-scoped by discipline. A cytology case 500s on /pathology/caseView/{id}
// and 200s on /cytology/caseView/{id}. Always use the discipline that owns the case.
// ---------------------------------------------------------------------------------------------------
//
// Live contract (verified 2026-08-12, v3.2.1.11):
//   1) GET  /rest/program/{programId}        -> { program:{ questionnaireUUID }, additionalOrderEntryQuestions:{ Questionnaire } }
//   2) GET  /rest/SampleEntryGenerateScanProvider -> { status:true, body:"<accession>" }
//   3) POST /rest/SamplePatientEntry         (full form; sampleOrderItems.programId + .additionalQuestions)
//   4) GET  /rest/{discipline}/dashboard?statuses=... -> rows incl. pathologySampleId / immunohistochemistrySampleId
//   5) POST /rest/{discipline}/caseView/{id} (full array payload above) to advance workflow status
//
// Answer encoding, verified against what the server persisted for GUI-created case 49:
//   choice items  -> the answerOption entry echoed VERBATIM ({valueCoding:{system,code,display}} or {valueString})
//   text  items   -> {valueString: "..."}
//
// testing.openelis-global.org program IDs: Histopathology=7, Immunohistochemistry=6, Cytology=5
// (GET /rest/displayList/PROGRAM). The seeder resolves them by name, so other instances work too.

import { test, expect } from '@playwright/test';

const P = '/api/OpenELIS-Global';
const PER = parseInt(process.env.CASES_PER || '10', 10);
// Stop at this many cases per discipline unless CASES_FORCE=1. A seeder is not a test: a retry
// re-runs the whole body and seeds another full batch. On 2026-08-12 three retries turned a
// 10-per-discipline run into ~120 per discipline on testing.openelis-global.org.
const TARGET_TOTAL = parseInt(process.env.CASES_TARGET_TOTAL || '25', 10);
const FORCE = process.env.CASES_FORCE === '1';

test.describe.configure({ retries: 0 });

// Workflow status vocabularies, captured live from the Select Status control on each case view.
const PROGRAMS = [
  {
    name: 'Histopathology',
    discipline: 'pathology',
    idKey: 'pathologySampleId',
    statuses: ['GROSSING', 'CUTTING', 'PROCESSING', 'SLICING', 'STAINING', 'READY_PATHOLOGIST', 'ADDITIONAL_REQUEST', 'COMPLETED'],
    // Extra keys the transition POST must carry for THIS discipline (see DEFECT 2).
    transitionExtras: { blocks: [], slides: [], reports: [], techniques: [], requests: [], conclusions: [] },
    sampleTypeName: 'Histopathology specimen',
    testName: 'Histopathology examination',
  },
  {
    name: 'Immunohistochemistry',
    discipline: 'immunohistochemistry',
    idKey: 'immunohistochemistrySampleId',
    statuses: ['IN_PROGRESS', 'READY_PATHOLOGIST', 'COMPLETED'],
    transitionExtras: { reports: [] },
    sampleTypeName: 'Immunohistochemistry specimen',
    testName: 'Anti-Cytokeratin 7',
  },
  {
    name: 'Cytology',
    discipline: 'cytology',
    idKey: 'pathologySampleId',
    statuses: ['PREPARING_SLIDES', 'SCREENING', 'READY_FOR_CYTOPATHOLOGIST', 'COMPLETED'],
    transitionExtras: { slides: [], reports: [] },
    sampleTypeName: 'Tissue antemortem',
    testName: 'Histopathology examination',
  },
];

const FIRST = ['Anggun', 'Budi', 'Citra', 'Dewi', 'Eko', 'Fitri', 'Galih', 'Hana', 'Indra', 'Joko'];
const LAST = ['Wijaya', 'Santoso', 'Halim', 'Pratama', 'Kusuma', 'Lestari', 'Gunawan', 'Suryani', 'Maulana', 'Saputra'];

// Realistic clinical content, rotated per case index so the demo does not look copy-pasted.
// `site` must match an answerOption display on the Specimen (pathSpecimenNature) list.
const HISTO_CASES = [
  { site: 'BREAST', nature: 'Left breast, upper outer quadrant lesion, 2.1 cm', dx: 'Suspected invasive ductal carcinoma', prev: 'None' },
  { site: 'COLON SIGMOID', nature: 'Sigmoid colon polyp, pedunculated, 1.4 cm', dx: 'Tubulovillous adenoma, exclude dysplasia', prev: 'Colonoscopy 2025' },
  { site: 'SKIN', nature: 'Skin of back, pigmented lesion 8 mm with irregular border', dx: 'Rule out malignant melanoma', prev: 'None' },
  { site: 'PROSTATE GLAND', nature: 'Prostate needle cores, 12 cores, bilateral', dx: 'Elevated PSA 14.2 ng/mL, rule out adenocarcinoma', prev: 'None' },
  { site: 'THYROID', nature: 'Right thyroid lobe nodule, 3.0 cm', dx: 'Follicular neoplasm on prior FNA', prev: 'FNA 2026-03' },
  { site: 'STOMACH', nature: 'Gastric antrum, endoscopic biopsy x4', dx: 'Chronic gastritis, H. pylori suspected', prev: 'None' },
  { site: 'LYMPH NODE AXILLA / ARM', nature: 'Left axillary node, excisional, 2.6 cm', dx: 'Lymphadenopathy, rule out lymphoma', prev: 'None' },
  { site: 'CERVIX', nature: 'Cervical LLETZ specimen', dx: 'High-grade squamous intraepithelial lesion on smear', prev: 'Abnormal smear 2026-01' },
  { site: 'LIVER', nature: 'Liver core biopsy, segment VI', dx: 'Focal lesion on ultrasound, rule out metastasis', prev: 'None' },
  { site: 'UPPER LOBE, LUNG', nature: 'Right upper lobe wedge resection, 3.2 cm mass', dx: 'Suspected non-small cell lung carcinoma', prev: 'Chemotherapy 2025' },
];

const CYTO_CASES = [
  { nature: 'Conventional smear', source: 'Cervix', prev: 'No previous cytology' },
  { nature: 'Liquid-based preparation', source: 'Cervix', prev: 'Normal smear 2024' },
  { nature: 'Conventional smear', source: 'Vault', prev: 'Post-hysterectomy follow-up' },
  { nature: 'Liquid-based preparation', source: 'Vault', prev: 'ASCUS reported 2025' },
];

const IHC_CASES = [
  { panel: 'Breast panel — ER / PR / HER2', dx: 'Invasive ductal carcinoma, receptor status required' },
  { panel: 'Lymphoma panel — CD20 / CD3 / CD30', dx: 'Nodal lymphoproliferative disorder, subtype pending' },
  { panel: 'GI panel — CDX-2 / CK20 / CK7', dx: 'Metastatic adenocarcinoma, primary unknown' },
  { panel: 'Lung panel — TTF-1 / CK7 / p63', dx: 'Pulmonary mass, adenocarcinoma vs squamous' },
];

test('seed specialized cases', async ({ page }) => {
  test.setTimeout(900000);

  // Entry-form REST calls are route-scoped — land on the page first or the GETs come back empty.
  await page.goto('/SamplePatientEntry', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  const getJson = async (path: string) => {
    const r: any = await page.request.get(`${P}${path}`);
    return r.ok() ? await r.json().catch(() => null) : null;
  };

  const postJson = async (path: string, body: any) =>
    page.evaluate(
      async ({ path, body }) => {
        const csrf = localStorage.getItem('CSRF') || '';
        const res = await fetch(`/api/OpenELIS-Global${path}`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
          body: JSON.stringify(body),
        });
        return { ok: res.ok, status: res.status, text: (await res.text()).slice(0, 300) };
      },
      { path, body },
    );

  // ---- Order defaults -------------------------------------------------------------------------
  const entry: any = (await getJson('/rest/SamplePatientEntry')) || {};
  const soi = entry.sampleOrderItems || {};
  const today = entry.currentDate || '';
  const [dd, mm, yyyy] = today.split('/').map((x: string) => parseInt(x, 10));
  const tD = new Date(Date.UTC(yyyy, mm - 1, dd + 1));
  const tomorrow = `${String(tD.getUTCDate()).padStart(2, '0')}/${String(tD.getUTCMonth() + 1).padStart(2, '0')}/${tD.getUTCFullYear()}`;
  const site = (soi.referringSiteList || [])[0] || { id: '', value: '' };

  // ---- Resolve program IDs by name -------------------------------------------------------------
  const programList: any[] = (await getJson('/rest/displayList/PROGRAM')) || [];
  const programId = (name: string) => String((programList.find((p: any) => p.value === name) || {}).id || '');

  // ---- Resolve sample type + test by name ------------------------------------------------------
  const sampleTypes: any[] = (await getJson('/rest/displayList/SAMPLE_TYPE_ACTIVE')) || [];
  const resolveSample = async (stName: string, testName: string) => {
    const st = sampleTypes.find((s: any) => s.value === stName);
    if (!st) return null;
    const tests: any[] = ((await getJson(`/rest/sample-type-tests?sampleType=${st.id}`)) || {}).tests || [];
    const t = tests.find((x: any) => (x.name || x.value) === testName);
    return t ? { sampleTypeId: String(st.id), testId: String(t.id) } : null;
  };

  // ---- Questionnaire ---------------------------------------------------------------------------
  // FIX FOR DEFECT 1. Fetch the program's Questionnaire and build a QuestionnaireResponse whose
  // answers are encoded exactly the way the GUI encodes them (verified against persisted case 49).
  const getQuestionnaire = async (progId: string) => {
    const j: any = await getJson(`/rest/program/${progId}`);
    if (!j || !j.additionalOrderEntryQuestions) return null;
    return { uuid: j.program?.questionnaireUUID || '', q: j.additionalOrderEntryQuestions };
  };

  // Match a desired answer against the item's answerOption list and echo that option VERBATIM.
  // Falls back to a plain valueString for free-text items.
  const encodeAnswer = (item: any, want: string | undefined) => {
    if (want === undefined || want === null || want === '') return [];
    const opts: any[] = item.answerOption || [];
    if (opts.length) {
      const hit = opts.find(
        (o: any) =>
          (o.valueCoding && (o.valueCoding.display === want || o.valueCoding.code === want)) ||
          o.valueString === want,
      );
      // No match on a choice item means the desired text is not in this instance's list —
      // leave it unanswered rather than inventing a code the server will not recognise.
      return hit ? [hit] : [];
    }
    return [{ valueString: want }];
  };

  const buildResponse = (qw: any, answersByText: Record<string, string>) => ({
    resourceType: 'QuestionnaireResponse',
    id: '',
    questionnaire: `Questionnaire/${qw.uuid}`,
    status: 'in-progress',
    item: (qw.q.item || []).map((it: any) => ({
      linkId: it.linkId,
      text: it.text,
      answer: encodeAnswer(it, answersByText[it.text]),
    })),
  });

  const answersFor = (progName: string, i: number): Record<string, string> => {
    if (progName === 'Histopathology') {
      const c = HISTO_CASES[i % HISTO_CASES.length];
      return {
        Specimen: c.site,
        'Specimen Type': ['Biopsy', 'Partial Organ', 'Whole Organ'][i % 3],
        'Nature/Site of Specimen': c.nature,
        'Procedure performed': i % 2 ? 'Lumpectomy' : 'Core Biopsy',
        'Provisional Clinical Diagnosis': c.dx,
        'Previous Surgery / Treatment': c.prev,
        'Unit Number': `UN-2026-${String(1000 + i)}`,
        'Private Reference Number': `PRN-HP-${String(i + 1).padStart(3, '0')}`,
      };
    }
    if (progName === 'Cytology') {
      const c = CYTO_CASES[i % CYTO_CASES.length];
      return {
        'Nature of Specimen': c.nature,
        'Source of Smear': c.source,
        'Previous Cytology Report / Surgery / Treatment': c.prev,
      };
    }
    const c = IHC_CASES[i % IHC_CASES.length];
    return {
      'Nature/Site of Specimen': c.panel,
      'Provisional Clinical Diagnosis': c.dx,
      'Previous Surgery / Treatment': 'See referring histopathology report',
    };
  };

  const genAccession = async (): Promise<string> =>
    page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const r = await fetch('/api/OpenELIS-Global/rest/SampleEntryGenerateScanProvider', {
        credentials: 'include',
        headers: { 'X-CSRF-Token': csrf },
      });
      try {
        return JSON.parse(await r.text()).body || '';
      } catch {
        return '';
      }
    });

  const createCase = async (
    progId: string,
    labNo: string,
    idx: number,
    sample: { sampleTypeId: string; testId: string },
    questionnaireResponse: any,
  ) => {
    const uid = `${Date.now()}${idx}`;
    const form = {
      rememberSiteAndRequester: false, currentDate: null, projects: null, customNotificationLogic: false,
      patientEmailNotificationTestIds: [], patientSMSNotificationTestIds: [],
      providerEmailNotificationTestIds: [], providerSMSNotificationTestIds: [],
      patientUpdateStatus: 'ADD', referralItems: [], referralOrganizations: null, referralReasons: null, sampleTypes: null,
      sampleXML: `<?xml version="1.0" encoding="utf-8"?><samples><sample sampleID='${sample.sampleTypeId}' date='' time='' collector='' quantity='' uom='' tests='${sample.testId}' testSectionMap='' testSampleTypeMap='' panels='' rejected='false' rejectReasonId='' initialConditionIds='' storageLocationId='' storageLocationType='' storagePositionCoordinate='' gpsLatitude='' gpsLongitude='' gpsAccuracy='' gpsCaptureMethod='' collectionMethod='' sampleTemperature='' specimenOrigin='' numOrderLabels='1' numSpecimenLabels='1'/></samples>`,
      patientProperties: {
        patientPK: '', patientUpdateStatus: 'ADD',
        firstName: FIRST[idx % FIRST.length], lastName: LAST[(idx * 3) % LAST.length],
        gender: idx % 2 ? 'F' : 'M', birthDateForDisplay: `0${(idx % 9) + 1}/0${(idx % 9) + 1}/19${60 + (idx % 35)}`,
        nationalId: uid, subjectNumber: '',
      },
      patientSearch: null, patientEnhancedSearch: null, patientClinicalProperties: null,
      sampleOrderItems: {
        newRequesterName: '', orderTypes: [], orderType: '', externalOrderNumber: '', labNo,
        requestDate: today, receivedDateForDisplay: today, receivedTime: '09:30', nextVisitDate: tomorrow,
        requesterSampleID: '', referringPatientNumber: '', referringSiteId: String(site.id || ''),
        referringSiteDepartmentId: '', referringSiteCode: '', referringSiteName: '', referringSiteDepartmentName: '',
        referringSiteList: [], referringSiteDepartmentList: [], providersList: [],
        providerId: '', providerPersonId: '', providerFirstName: '', providerLastName: '',
        providerWorkPhone: '', providerFax: '', providerEmail: '',
        facilityAddressStreet: '', facilityAddressCommune: '', facilityPhone: '', facilityFax: '',
        paymentOptionSelection: '', paymentOptions: [], modified: true, sampleId: '', readOnly: false,
        billingReferenceNumber: '', testLocationCode: '', otherLocationCode: '', testLocationCodeList: [],
        program: '', programList: [], contactTracingIndexName: '', contactTracingIndexRecordNumber: '',
        priorityList: [], priority: 'ROUTINE', programId: progId,
        // FIX FOR DEFECT 1 — was `null`, which produced cases whose caseView 500s.
        additionalQuestions: questionnaireResponse,
        isEQASample: false, eqaProgramId: '', eqaProviderOrganizationId: '', eqaProviderSampleId: '',
        eqaParticipantId: '', eqaDeadline: '', eqaPriority: 'STANDARD',
        consentGiven: false, consentFormReference: '', consentRecordedAt: '', consentRecordedBy: '',
      },
      initialSampleConditionList: [], sampleNatureList: null, testSectionList: [],
      warning: false, useReferral: false, rejectReasonList: null,
    };
    return postJson('/rest/SamplePatientEntry', form);
  };

  // FIX FOR DEFECT 2 — the accepted body differs per discipline; pass that discipline's extras.
  const advanceCase = async (
    discipline: string,
    caseId: string | number,
    status: string,
    extras: Record<string, any>,
    technicianId = '114',
  ) =>
    postJson(`/rest/${discipline}/caseView/${caseId}`, {
      assignedTechnicianId: technicianId,
      status,
      ...extras,
      release: false,
    });

  const dashboard = async (discipline: string, statuses: string[]) =>
    (await getJson(`/rest/${discipline}/dashboard?statuses=${statuses.join(',')}`)) || [];

  // ---- Seed -------------------------------------------------------------------------------------
  let created = 0, advanced = 0, failed = 0;

  for (const prog of PROGRAMS) {
    const progId = programId(prog.name);
    if (!progId) { console.log('SKIP_PROGRAM_NOT_FOUND', prog.name); continue; }

    const sample = await resolveSample(prog.sampleTypeName, prog.testName);
    if (!sample) { console.log('SKIP_SAMPLE_NOT_FOUND', prog.name, prog.sampleTypeName, prog.testName); failed++; continue; }

    const qw = await getQuestionnaire(progId);
    if (!qw) { console.log('SKIP_NO_QUESTIONNAIRE', prog.name); failed++; continue; }
    console.log('PROGRAM', prog.name, 'id', progId, 'questionnaire', qw.uuid, 'items', (qw.q.item || []).length);

    const before = await dashboard(prog.discipline, prog.statuses);
    const seenIds = new Set(before.map((r: any) => String(r[prog.idKey])));

    if (!FORCE && before.length >= TARGET_TOTAL) {
      console.log('SKIP_ALREADY_SEEDED', prog.name, before.length, '>=', TARGET_TOTAL, '(set CASES_FORCE=1 to override)');
      continue;
    }
    const need = FORCE ? PER : Math.min(PER, TARGET_TOTAL - before.length);

    for (let i = 0; i < need; i++) {
      const labNo = await genAccession();
      if (!labNo) { failed++; console.log('FAIL_GEN', prog.name, i); continue; }

      const qr = buildResponse(qw, answersFor(prog.name, i));
      const r = await createCase(progId, labNo, i, sample, qr);
      if (!r.ok) { failed++; console.log('FAIL_CASE', prog.name, labNo, r.status, r.text); continue; }
      created++;
      console.log('CREATED_CASE', prog.name, labNo);
      await page.waitForTimeout(300);
    }

    // ---- Spread the new cases across the full workflow -------------------------------------------
    const after = await dashboard(prog.discipline, prog.statuses);
    const fresh = after.filter((r: any) => !seenIds.has(String(r[prog.idKey])));
    for (let i = 0; i < fresh.length; i++) {
      // Leave roughly the first slice at the entry status; walk the rest down the vocabulary so the
      // dashboard shows work at every stage rather than a single undifferentiated pile.
      const target = prog.statuses[i % prog.statuses.length];
      if (target === prog.statuses[0]) continue;
      const id = fresh[i][prog.idKey];
      const r = await advanceCase(prog.discipline, id, target, prog.transitionExtras);
      if (r.ok) { advanced++; console.log('ADVANCED', prog.name, id, '->', target); }
      else { failed++; console.log('FAIL_ADVANCE', prog.name, id, target, r.status, r.text); }
      await page.waitForTimeout(200);
    }

    // ---- ROUND-TRIP READ-BACK on a DIFFERENT endpoint (§7.5) --------------------------------------
    // The dashboard is the write-side view. caseView is the independent read — and it is precisely
    // the endpoint that DEFECT 1 broke, so verifying it here is what stops the regression recurring.
    for (const row of fresh.slice(0, 3)) {
      const id = row[prog.idKey];
      const v: any = await getJson(`/rest/${prog.discipline}/caseView/${id}`);
      const ok = !!(v && v.programQuestionnaireResponse);
      console.log('CASEVIEW_READBACK', prog.discipline, id, ok ? 'OK (questionnaire present)' : 'MISSING QUESTIONNAIRE');
      expect(ok, `caseView ${prog.discipline}/${id} must return a questionnaire — see DEFECT 1 at the top of this file`).toBeTruthy();
    }

    const counts: any = (await getJson(`/rest/${prog.discipline}/dashboard/count`)) || {};
    console.log('AFTER', prog.name, JSON.stringify(counts));
  }

  console.log('CASES_SEED_SUMMARY', JSON.stringify({ created, advanced, failed }));
  expect(failed).toBe(0);
});
