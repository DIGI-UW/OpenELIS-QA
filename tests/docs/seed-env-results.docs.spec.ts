// Demo-data seed capability (part 8): Environmental orders WITH completed results.
//   BASE=https://indonesiademo.openelis-global.org ENV_N=5 npx playwright test --project=docs tests/docs/seed-env-results.docs.spec.ts
//   RUN ON ITS OWN. Additive (run once).
//
// Grounded on OpenELIS-Global-2 (DIGI-UW) SamplePatientUpdateData.addEnvironmentalObservations +
// createPopulatedSample: sampleOrderItems.environmentalFields is a free-form map (stored as observations,
// no FK validation); workflowType:"environmental" sets the sample domain to E (environmental). The order is
// otherwise created via the same GET /rest/SampleEntryGenerateScanProvider + POST /rest/SamplePatientEntry
// path as clinical/vector, and its analysis appears in /rest/LogbookResults, so the standard result chain
// (LogbookResults + AccessionValidation) completes it.
import { test, expect } from '@playwright/test';
const P = '/api/OpenELIS-Global';
const N = parseInt(process.env.ENV_N || '5', 10);
const SITES = ['Riverside Monitoring Station', 'East Bay Water Intake', 'Central Reservoir Site', 'Harbor Outfall Monitor', 'Northern Canal Station', 'Upland Spring Source', 'Coastal Lagoon Trap', 'Industrial Zone Monitor'];

test('seed environmental results', async ({ page }) => {
  test.setTimeout(300000);
  await page.goto('/SamplePatientEntry', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(2500);
  const getJson = async (path: string) => { const r: any = await page.request.get(`${P}${path}`); return r.ok() ? await r.json().catch(() => null) : null; };

  const entry: any = (await getJson('/rest/SamplePatientEntry')) || {};
  const soi = entry.sampleOrderItems || {};
  const today = entry.currentDate || '';
  const [dd, mm, yyyy] = today.split('/').map((x: string) => parseInt(x, 10));
  const t = new Date(Date.UTC(yyyy, mm - 1, dd + 1));
  const tomorrow = `${String(t.getUTCDate()).padStart(2, '0')}/${String(t.getUTCMonth() + 1).padStart(2, '0')}/${t.getUTCFullYear()}`;
  const prov = (soi.providersList || [])[0] || { id: '' };

  // Env sample type: prefer water/waste/environmental names with an own test.
  // Env sample types come from the SamplePatientEntry response's `sampleTypes` (NOT /rest/displayList/
  // SAMPLE_TYPE_ACTIVE, which omits them), and their tests come from /rest/sample-type-tests (test-display-beans
  // returns nothing for env water types on this build). Prefer Surface Water for realistic water tests (pH, Lead, TDS).
  const ENV = /surface water|groundwater|liquid waste|sea water|drinking water|bath water|hygiene|water/i;
  const entryTypes: any[] = entry.sampleTypes || [];
  const envTypes = entryTypes.filter((s) => ENV.test(s.value));
  let sid = '', tid = '', stName = '';
  for (const st of [...envTypes, ...entryTypes]) {
    const stt: any = await getJson(`/rest/sample-type-tests?sampleType=${st.id}`);
    const tests = (stt && stt.tests) || [];
    if (tests.length >= 1) { sid = String(st.id); tid = String(tests[0].id); stName = st.value; break; }
  }
  console.log('ENV_DEFAULTS', JSON.stringify({ today, prov: prov.id, sid, stName, tid }));
  expect(sid && tid).toBeTruthy();

  const gen = async () => page.evaluate(async () => { const c = localStorage.getItem('CSRF') || ''; const r = await fetch('/api/OpenELIS-Global/rest/SampleEntryGenerateScanProvider', { credentials: 'include', headers: { 'X-CSRF-Token': c } }); try { return JSON.parse(await r.text()).body || ''; } catch { return ''; } });

  const createOrder = async (labNo: string, idx: number) => {
    const form: any = {
      rememberSiteAndRequester: false, currentDate: null, projects: null, customNotificationLogic: false,
      patientEmailNotificationTestIds: [], patientSMSNotificationTestIds: [], providerEmailNotificationTestIds: [], providerSMSNotificationTestIds: [],
      patientUpdateStatus: 'NO_ACTION', referralItems: [], referralOrganizations: null, referralReasons: null, sampleTypes: null,
      sampleXML: `<?xml version="1.0" encoding="utf-8"?><samples><sample sampleID='${sid}' date='' time='' collector='' quantity='' uom='' tests='${tid}' testSectionMap='' testSampleTypeMap='' panels='' rejected='false' rejectReasonId='' initialConditionIds='' storageLocationId='' storageLocationType='' storagePositionCoordinate='' gpsLatitude='' gpsLongitude='' gpsAccuracy='' gpsCaptureMethod='' numOrderLabels='1' numSpecimenLabels='1'/></samples>`,
      // Environmental workflow: no patient. Domain flips to E via environmentalFields.workflowType.
      patientProperties: { patientPK: '', patientUpdateStatus: 'NO_ACTION' },
      patientSearch: null, patientEnhancedSearch: null, patientClinicalProperties: null,
      sampleOrderItems: {
        newRequesterName: '', orderTypes: [], orderType: '', externalOrderNumber: '', labNo,
        requestDate: today, receivedDateForDisplay: today, receivedTime: '09:30', nextVisitDate: tomorrow,
        requesterSampleID: '', referringPatientNumber: '', referringSiteId: '', referringSiteDepartmentId: '', referringSiteCode: '',
        referringSiteName: '', referringSiteDepartmentName: '', referringSiteList: [], referringSiteDepartmentList: [],
        providersList: [], providerId: String(prov.id || ''), providerPersonId: String(prov.id || ''), providerFirstName: '', providerLastName: '',
        facilityAddressStreet: '', facilityAddressCommune: '', facilityPhone: '', facilityFax: '', paymentOptionSelection: '', paymentOptions: [],
        modified: true, sampleId: '', readOnly: false, billingReferenceNumber: '', testLocationCode: '', otherLocationCode: '', testLocationCodeList: [],
        program: '', programList: [], contactTracingIndexName: '', contactTracingIndexRecordNumber: '', priorityList: [], priority: 'ROUTINE',
        programId: '', additionalQuestions: null, isEQASample: false, eqaProgramId: '', eqaProviderOrganizationId: '', eqaProviderSampleId: '', eqaParticipantId: '', eqaDeadline: '', eqaPriority: 'STANDARD',
        environmentalFields: {
          workflowType: 'environmental',
          samplingSiteId: '', samplingSiteName: SITES[idx % SITES.length],
          collectionMethod: 'Grab Sample', environmentalConditions: 'Clear / Sunny',
          collectionSiteDescription: 'Routine environmental surveillance (seeded demo).',
        },
      },
      initialSampleConditionList: [], sampleNatureList: null, testSectionList: [], warning: false, useReferral: false, rejectReasonList: null,
    };
    return page.evaluate(async (f) => { const c = localStorage.getItem('CSRF') || ''; const r = await fetch('/api/OpenELIS-Global/rest/SamplePatientEntry', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': c }, body: JSON.stringify(f) }); return { ok: r.ok, status: r.status, text: (await r.text().catch(() => '')).slice(0, 200) }; }, form);
  };
  const enterResults = async (labNo: string) => page.evaluate(async ({ P, labNo }: any) => {
    const csrf = localStorage.getItem('CSRF') || '';
    const g = await fetch(`${P}/rest/LogbookResults?labNumber=${labNo}`, { credentials: 'include', headers: { Accept: 'application/json' } });
    let lb: any = null; try { lb = JSON.parse(await g.text()); } catch { return false; }
    if (!lb || !(lb.testResult || []).length) return false;
    for (const item of lb.testResult) { const ty = (item.resultType || '').toUpperCase(); const val = (ty === 'D' || ty === 'M') ? (item.defaultResultValue || (item.dictionaryResults && item.dictionaryResults[0] && item.dictionaryResults[0].id) || '1') : '5.5'; item.reportable = item.reportable === 'N' ? false : true; item.resultValue = val; item.shadowResultValue = val; item.isModified = true; delete item.result; }
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
    if (!o.ok) { failed++; console.log('FAIL_ORDER', labNo, o.status, o.text.replace(/\s+/g, ' ')); continue; }
    created++;
    await page.waitForTimeout(500);
    if (await enterResults(labNo)) { resulted++; await page.waitForTimeout(400); if (await validate(labNo)) validated++; else console.log('FAIL_VALIDATE', labNo); }
    else console.log('FAIL_RESULT', labNo);
    console.log('ENV_DONE', labNo);
    await page.waitForTimeout(300);
  }
  console.log('ENV_RESULTS_SUMMARY', JSON.stringify({ created, resulted, validated, failed, planned: N }));
  expect(failed).toBe(0); expect(validated).toBe(created);
});
