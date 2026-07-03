// Demo-data seed capability (part 6): specialized cases — Histopathology / Immunohistochemistry / Cytology.
//   BASE=https://indonesiademo.openelis-global.org CASES_PER=5 npx playwright test --project=docs tests/docs/seed-cases.docs.spec.ts
//   RUN ON ITS OWN (one seeder per invocation).
//
// Grounded on OpenELIS-Global-2 (DIGI-UW) — SamplePatientUpdateData auto-creates a Pathology/IHC/Cytology
// case when an order is placed under a program whose name matches. So a "case" == an order with programId set.
// Payload pattern mirrors frontend/playwright/helpers/seed-tat-data.ts (createSampleOrder), verified live:
//   1) GET  /rest/SampleEntryGenerateScanProvider            -> { status:true, body:"<accession>" }
//   2) POST /rest/SamplePatientEntry                         (full form; set sampleOrderItems.programId)
//   Readback: GET /rest/{pathology|immunohistochemistry|cytology}/dashboard/count
// indonesiademo program IDs: Histopathology=7, Immunohistochemistry=6, Cytology=5 (GET /rest/displayList/PROGRAM).
import { test, expect } from '@playwright/test';
const P = '/api/OpenELIS-Global';
const PER = parseInt(process.env.CASES_PER || '5', 10);

const PROGRAMS = [
  { id: '7', tag: 'Histopathology', count: '/rest/pathology/dashboard/count' },
  { id: '6', tag: 'Immunohistochemistry', count: '/rest/immunohistochemistry/dashboard/count' },
  { id: '5', tag: 'Cytology', count: '/rest/cytology/dashboard/count' },
];
const FIRST = ['Anggun', 'Budi', 'Citra', 'Dewi', 'Eko', 'Fitri', 'Galih', 'Hana', 'Indra', 'Joko'];
const LAST = ['Wijaya', 'Santoso', 'Halim', 'Pratama', 'Kusuma', 'Lestari', 'Gunawan', 'Suryani', 'Maulana', 'Saputra'];

test('seed specialized cases', async ({ page }) => {
  test.setTimeout(300000);
  await page.goto('/SamplePatientEntry', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(2500);
  const getJson = async (path: string) => { const r: any = await page.request.get(`${P}${path}`); return r.ok() ? await r.json().catch(() => null) : null; };

  // Discover order defaults (dates, a referring site, a provider).
  const entry: any = (await getJson('/rest/SamplePatientEntry')) || {};
  const soi = entry.sampleOrderItems || {};
  const today = entry.currentDate || ''; // DD/MM/YYYY on this instance
  const [dd, mm, yyyy] = today.split('/').map((x: string) => parseInt(x, 10));
  const tomorrowDate = new Date(Date.UTC(yyyy, mm - 1, dd + 1));
  const tomorrow = `${String(tomorrowDate.getUTCDate()).padStart(2, '0')}/${String(tomorrowDate.getUTCMonth() + 1).padStart(2, '0')}/${tomorrowDate.getUTCFullYear()}`;
  const site = (soi.referringSiteList || [])[0] || { id: '', value: '' };
  const prov = (soi.providersList || [])[0] || { id: '', value: '' };
  const provName = String(prov.value || '').split(',').map((s: string) => s.trim());

  // Discover a sample type + a test that genuinely belongs to it (avoid cross-sample leaks).
  const sampleTypes: any[] = (await getJson('/rest/displayList/SAMPLE_TYPE_ACTIVE')) || [];
  let sampleTypeId = '', testId = '';
  for (const st of sampleTypes) {
    const beans: any[] = (await getJson(`/rest/test-display-beans?sampleType=${st.id}`)) || [];
    const own = beans.find((b: any) => String(b.value).includes('(' + st.value + ')'));
    if (own) { sampleTypeId = String(st.id); testId = String(own.id); break; }
  }
  console.log('ORDER_DEFAULTS', JSON.stringify({ today, tomorrow, site, prov: prov.id, sampleTypeId, testId }));
  expect(sampleTypeId && testId).toBeTruthy();

  const genAccession = async (): Promise<string> => page.evaluate(async () => {
    const csrf = localStorage.getItem('CSRF') || '';
    const r = await fetch('/api/OpenELIS-Global/rest/SampleEntryGenerateScanProvider', { credentials: 'include', headers: { 'X-CSRF-Token': csrf } });
    try { return (JSON.parse(await r.text()).body) || ''; } catch { return ''; }
  });

  const createCase = async (programId: string, labNo: string, idx: number): Promise<{ ok: boolean; status: number }> => {
    const uid = `${Date.now()}${idx}`;
    const form = {
      rememberSiteAndRequester: false, currentDate: null, projects: null, customNotificationLogic: false,
      patientEmailNotificationTestIds: [], patientSMSNotificationTestIds: [], providerEmailNotificationTestIds: [], providerSMSNotificationTestIds: [],
      patientUpdateStatus: 'NO_ACTION', referralItems: [], referralOrganizations: null, referralReasons: null, sampleTypes: null,
      sampleXML: `<?xml version="1.0" encoding="utf-8"?><samples><sample sampleID='${sampleTypeId}' date='' time='' collector='' quantity='' uom='' tests='${testId}' testSectionMap='' testSampleTypeMap='' panels='' rejected='false' rejectReasonId='' initialConditionIds='' storageLocationId='' storageLocationType='' storagePositionCoordinate='' gpsLatitude='' gpsLongitude='' gpsAccuracy='' gpsCaptureMethod='' numOrderLabels='1' numSpecimenLabels='1'/></samples>`,
      patientProperties: {
        patientPK: '', patientUpdateStatus: 'ADD',
        firstName: FIRST[idx % FIRST.length], lastName: LAST[idx % LAST.length],
        gender: idx % 2 ? 'F' : 'M', birthDateForDisplay: '01/01/1985', nationalId: uid, subjectNumber: uid,
      },
      patientSearch: null, patientEnhancedSearch: null, patientClinicalProperties: null,
      sampleOrderItems: {
        newRequesterName: '', orderTypes: [], orderType: '', externalOrderNumber: '', labNo,
        requestDate: today, receivedDateForDisplay: today, receivedTime: '09:30', nextVisitDate: tomorrow,
        requesterSampleID: '', referringPatientNumber: '', referringSiteId: String(site.id || ''), referringSiteDepartmentId: '',
        referringSiteCode: '', referringSiteName: '', referringSiteDepartmentName: '', referringSiteList: [], referringSiteDepartmentList: [],
        providersList: [], providerId: String(prov.id || ''), providerPersonId: String(prov.id || ''),
        providerFirstName: provName[1] || '', providerLastName: provName[0] || '',
        facilityAddressStreet: '', facilityAddressCommune: '', facilityPhone: '', facilityFax: '',
        paymentOptionSelection: '', paymentOptions: [], modified: true, sampleId: '', readOnly: false,
        billingReferenceNumber: '', testLocationCode: '', otherLocationCode: '', testLocationCodeList: [],
        program: '', programList: [], contactTracingIndexName: '', contactTracingIndexRecordNumber: '',
        priorityList: [], priority: 'ROUTINE', programId,
        additionalQuestions: null, isEQASample: false, eqaProgramId: '', eqaProviderOrganizationId: '', eqaProviderSampleId: '', eqaParticipantId: '', eqaDeadline: '', eqaPriority: 'STANDARD',
      },
      initialSampleConditionList: [], sampleNatureList: null, testSectionList: [], warning: false, useReferral: false, rejectReasonList: null,
    };
    return page.evaluate(async (formData) => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch('/api/OpenELIS-Global/rest/SamplePatientEntry', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify(formData),
      });
      return { ok: res.ok, status: res.status };
    }, form);
  };

  let created = 0, skipped = 0, failed = 0;
  for (const prog of PROGRAMS) {
    const c: any = (await getJson(prog.count)) || {};
    const existing = Object.values(c).reduce((a: number, b: any) => a + (Number(b) || 0), 0);
    const need = Math.max(0, PER - existing);
    console.log('PROGRAM', prog.tag, 'existing', existing, 'need', need);
    for (let i = 0; i < need; i++) {
      const labNo = await genAccession();
      if (!labNo) { failed++; console.log('FAIL_GEN', prog.tag, i); continue; }
      const r = await createCase(prog.id, labNo, created + i);
      if (r.ok) { created++; console.log('CREATED_CASE', prog.tag, labNo); }
      else { failed++; console.log('FAIL_CASE', prog.tag, labNo, r.status); }
      await page.waitForTimeout(300);
    }
    if (need === 0) skipped++;
  }

  for (const prog of PROGRAMS) { const c: any = (await getJson(prog.count)) || {}; console.log('AFTER', prog.tag, JSON.stringify(c)); }
  console.log('CASES_SEED_SUMMARY', JSON.stringify({ created, skippedPrograms: skipped, failed }));
  expect(failed).toBe(0);
});
