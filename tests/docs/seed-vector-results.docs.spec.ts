// Demo-data seed capability (part 7): Vector Field Survey orders WITH completed results.
//   BASE=https://indonesiademo.openelis-global.org VEC_N=5 npx playwright test --project=docs tests/docs/seed-vector-results.docs.spec.ts
//   RUN ON ITS OWN. NOTE: additive (no natural idempotency key for vector samples) — intended to run once.
//
// Finding (verified live, contradicts the earlier handoff assumption): a Vector Field Survey order (programId=8)
// created via POST /rest/SamplePatientEntry produces a normal analysis that DOES appear in /rest/LogbookResults,
// so the standard result-entry + validation chain (seed-tat-data.ts) completes it. Steps per order:
//   1) GET  /rest/SampleEntryGenerateScanProvider  -> accession
//   2) POST /rest/SamplePatientEntry               (programId '8')
//   3) POST /rest/LogbookResults                   (enter results)
//   4) POST /rest/AccessionValidation              (validate/release)
import { test, expect } from '@playwright/test';
const P = '/api/OpenELIS-Global';
const N = parseInt(process.env.VEC_N || '5', 10);
const FIRST = ['Andi', 'Bayu', 'Cinta', 'Dian', 'Endah', 'Faisal', 'Gita', 'Hadi'];
const LAST = ['Wibowo', 'Susanto', 'Handayani', 'Nugroho', 'Puspita', 'Rahardjo', 'Utami', 'Yulianto'];

test('seed vector results', async ({ page }) => {
  test.setTimeout(300000);
  await page.goto('/SamplePatientEntry', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(2500);
  const getJson = async (path: string) => { const r: any = await page.request.get(`${P}${path}`); return r.ok() ? await r.json().catch(() => null) : null; };

  const entry: any = (await getJson('/rest/SamplePatientEntry')) || {};
  const soi = entry.sampleOrderItems || {};
  const today = entry.currentDate || '';
  const [dd, mm, yyyy] = today.split('/').map((x: string) => parseInt(x, 10));
  const t = new Date(Date.UTC(yyyy, mm - 1, dd + 1));
  const tomorrow = `${String(t.getUTCDate()).padStart(2, '0')}/${String(t.getUTCMonth() + 1).padStart(2, '0')}/${t.getUTCFullYear()}`;
  const site = (soi.referringSiteList || [])[0] || { id: '' };
  const prov = (soi.providersList || [])[0] || { id: '' };

  // Prefer a vector-appropriate sample type; fall back to any sample type with an own test.
  const VEC = /vector|mosquito|pool|larva|tick|insect|animal/i;
  const sampleTypes: any[] = (await getJson('/rest/displayList/SAMPLE_TYPE_ACTIVE')) || [];
  const ordered = [...sampleTypes.filter((s) => VEC.test(s.value)), ...sampleTypes];
  let sid = '', tid = '';
  for (const st of ordered) {
    const beans: any[] = (await getJson(`/rest/test-display-beans?sampleType=${st.id}`)) || [];
    const own = beans.find((b: any) => String(b.value).includes('(' + st.value + ')'));
    if (own) { sid = String(st.id); tid = String(own.id); break; }
  }
  console.log('VEC_DEFAULTS', JSON.stringify({ today, site: site.id, prov: prov.id, sid, tid }));
  expect(sid && tid).toBeTruthy();

  const gen = async () => page.evaluate(async () => { const c = localStorage.getItem('CSRF') || ''; const r = await fetch('/api/OpenELIS-Global/rest/SampleEntryGenerateScanProvider', { credentials: 'include', headers: { 'X-CSRF-Token': c } }); try { return JSON.parse(await r.text()).body || ''; } catch { return ''; } });

  const createOrder = async (labNo: string, idx: number) => {
    const uid = `VEC${Date.now()}${idx}`;
    const form: any = {
      rememberSiteAndRequester: false, currentDate: null, projects: null, customNotificationLogic: false,
      patientEmailNotificationTestIds: [], patientSMSNotificationTestIds: [], providerEmailNotificationTestIds: [], providerSMSNotificationTestIds: [],
      patientUpdateStatus: 'NO_ACTION', referralItems: [], referralOrganizations: null, referralReasons: null, sampleTypes: null,
      sampleXML: `<?xml version="1.0" encoding="utf-8"?><samples><sample sampleID='${sid}' date='' time='' collector='' quantity='' uom='' tests='${tid}' testSectionMap='' testSampleTypeMap='' panels='' rejected='false' rejectReasonId='' initialConditionIds='' storageLocationId='' storageLocationType='' storagePositionCoordinate='' gpsLatitude='' gpsLongitude='' gpsAccuracy='' gpsCaptureMethod='' numOrderLabels='1' numSpecimenLabels='1'/></samples>`,
      patientProperties: { patientPK: '', patientUpdateStatus: 'ADD', firstName: FIRST[idx % FIRST.length], lastName: LAST[idx % LAST.length], gender: idx % 2 ? 'F' : 'M', birthDateForDisplay: '01/01/1980', nationalId: uid, subjectNumber: uid },
      patientSearch: null, patientEnhancedSearch: null, patientClinicalProperties: null,
      sampleOrderItems: { newRequesterName: '', orderTypes: [], orderType: '', externalOrderNumber: '', labNo, requestDate: today, receivedDateForDisplay: today, receivedTime: '09:30', nextVisitDate: tomorrow, requesterSampleID: '', referringPatientNumber: '', referringSiteId: String(site.id || ''), referringSiteDepartmentId: '', referringSiteCode: '', referringSiteName: '', referringSiteDepartmentName: '', referringSiteList: [], referringSiteDepartmentList: [], providersList: [], providerId: String(prov.id || ''), providerPersonId: String(prov.id || ''), providerFirstName: '', providerLastName: '', facilityAddressStreet: '', facilityAddressCommune: '', facilityPhone: '', facilityFax: '', paymentOptionSelection: '', paymentOptions: [], modified: true, sampleId: '', readOnly: false, billingReferenceNumber: '', testLocationCode: '', otherLocationCode: '', testLocationCodeList: [], program: '', programList: [], contactTracingIndexName: '', contactTracingIndexRecordNumber: '', priorityList: [], priority: 'ROUTINE', programId: '8', additionalQuestions: null, isEQASample: false, eqaProgramId: '', eqaProviderOrganizationId: '', eqaProviderSampleId: '', eqaParticipantId: '', eqaDeadline: '', eqaPriority: 'STANDARD' },
      initialSampleConditionList: [], sampleNatureList: null, testSectionList: [], warning: false, useReferral: false, rejectReasonList: null,
    };
    return page.evaluate(async (f) => { const c = localStorage.getItem('CSRF') || ''; const r = await fetch('/api/OpenELIS-Global/rest/SamplePatientEntry', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': c }, body: JSON.stringify(f) }); return { ok: r.ok, status: r.status }; }, form);
  };
  const enterResults = async (labNo: string) => page.evaluate(async ({ P, labNo }: any) => {
    const csrf = localStorage.getItem('CSRF') || '';
    const g = await fetch(`${P}/rest/LogbookResults?labNumber=${labNo}`, { credentials: 'include', headers: { Accept: 'application/json' } });
    let lb: any = null; try { lb = JSON.parse(await g.text()); } catch { return false; }
    if (!lb || !(lb.testResult || []).length) return false;
    for (const item of lb.testResult) { const t = (item.resultType || '').toUpperCase(); const val = (t === 'D' || t === 'M') ? (item.defaultResultValue || (item.dictionaryResults && item.dictionaryResults[0] && item.dictionaryResults[0].id) || '1') : '5.5'; item.reportable = item.reportable === 'N' ? false : true; item.resultValue = val; item.shadowResultValue = val; item.isModified = true; delete item.result; }
    const p = await fetch(`${P}/rest/LogbookResults`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify(lb) });
    return p.ok;
  }, { P, labNo });
  const validate = async (labNo: string) => page.evaluate(async ({ P, labNo }: any) => {
    const csrf = localStorage.getItem('CSRF') || '';
    const g = await fetch(`${P}/rest/AccessionValidation?accessionNumber=${labNo}`, { credentials: 'include', headers: { Accept: 'application/json' } });
    let v: any = null; try { v = JSON.parse(await g.text()); } catch { return false; }
    if (!v || !(v.resultList || []).length) return false;
    for (const it of v.resultList) it.isAccepted = true;
    const p = await fetch(`${P}/rest/AccessionValidation`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify(v) });
    return p.ok;
  }, { P, labNo });

  let created = 0, resulted = 0, validated = 0, failed = 0;
  for (let i = 0; i < N; i++) {
    const labNo = await gen();
    if (!labNo) { failed++; continue; }
    const o: any = await createOrder(labNo, i);
    if (!o.ok) { failed++; console.log('FAIL_ORDER', labNo, o.status); continue; }
    created++;
    await page.waitForTimeout(500);
    if (await enterResults(labNo)) { resulted++; await page.waitForTimeout(400); if (await validate(labNo)) validated++; else console.log('FAIL_VALIDATE', labNo); }
    else console.log('FAIL_RESULT', labNo);
    console.log('VEC_DONE', labNo);
    await page.waitForTimeout(300);
  }
  console.log('VECTOR_RESULTS_SUMMARY', JSON.stringify({ created, resulted, validated, failed, planned: N }));
  expect(failed).toBe(0); expect(validated).toBe(created);
});
