import fs from 'fs';

const BASE = 'https://52.88.37.243';
const auth = JSON.parse(fs.readFileSync(process.env.HOME + '/Documents/OpenELIS-QA-git/.auth/user.json', 'utf8'));
const jsess = auth.cookies.find(c => c.domain.includes('52.88.37.243')).value;
const origin = auth.origins.find(o => o.origin.includes('52.88.37.243'));
const csrf = origin.localStorage.find(l => l.name === 'CSRF').value;

async function api(pathSuffix, { method = 'GET', body } = {}) {
  const headers = { 'Accept': 'application/json', 'Cookie': `JSESSIONID=${jsess}` };
  const init = { method, headers };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    headers['X-CSRF-TOKEN'] = csrf;
    init.body = JSON.stringify(body);
  }
  const res = await fetch(BASE + pathSuffix, init);
  const text = await res.text();
  let parsed = text;
  try { parsed = JSON.parse(text); } catch {}
  return { ok: res.ok, status: res.status, body: parsed };
}

const QA_PREFIX = 'QA-AUTO';
const NAMES = [
  ['Alice','Anderson'],['Bob','Brown'],['Carol','Carter'],['David','Davis'],['Eve','Edwards'],
  ['Frank','Foster'],['Grace','Garcia'],['Henry','Hill'],['Iris','Irving'],['Jack','Johnson'],
  ['Kate','King'],['Leo','Lopez'],['Mia','Miller'],['Noah','Nelson'],['Olivia','Owens'],
  ['Peter','Patel'],['Quinn','Quigley'],['Ruth','Roberts'],['Sam','Smith'],['Tara','Thomas'],
  ['Uma','Underwood'],['Victor','Vasquez'],['Wendy','Wong'],['Xavier','Xiu'],['Yara','Young']
];

function dob(i) {
  const year = 1950 + (i * 7) % 60;
  const month = ((i * 3) % 12) + 1;
  const day = ((i * 17) % 28) + 1;
  return { yy: String(year), mm: String(month).padStart(2,'0'), dd: String(day).padStart(2,'0') };
}
function fmtDMY(d) {
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

async function createPatient(i) {
  const nid = `qa-auto-p${String(i).padStart(4,'0')}`;
  const { yy, mm, dd } = dob(i);
  const [first, last] = NAMES[i % NAMES.length];
  const payload = {
    patientUpdateStatus: 'ADD',
    nationalId: nid,
    subjectNumber: '',
    lastName: `${QA_PREFIX}-${last}`,
    firstName: first,
    aka: '',
    streetAddress: `${QA_PREFIX}_street`,
    city: '', primaryPhone: '', email: '',
    gender: i % 2 === 0 ? 'F' : 'M',
    birthDateForDisplay: `${dd}/${mm}/${yy}`,
    commune: '', education: '', maritialStatus: '', nationality: '',
    healthDistrict: '', healthRegion: '', otherNationality: '', occupation: '',
    customNotes: '', targetDiseaseProgramme: '', photo: '', idDocuments: [],
    patientContact: { person: { firstName: '', lastName: '', primaryPhone: '', email: '' } },
  };
  const r = await api('/api/OpenELIS-Global/rest/PatientManagement', { method: 'POST', body: payload });
  if (!r.ok) return { ok: false, nid, error: `${r.status}: ${JSON.stringify(r.body).slice(0,150)}` };
  const pid = String(r.body?.patientId ?? r.body?.patientID ?? '');
  if (!pid) return { ok: false, nid, error: `no patientId in response: ${JSON.stringify(r.body).slice(0,150)}` };
  const { yy: yy2, mm: mm2, dd: dd2 } = dob(i);
  return { ok: true, nid, pid, first, last: `${QA_PREFIX}-${last}`, gender: i % 2 === 0 ? 'F' : 'M', birthDateForDisplay: `${dd2}/${mm2}/${yy2}` };
}

function buildSampleXML({ sampleTypeId, collectionDateDMY, tests }) {
  const a = {
    sampleID: sampleTypeId, date: collectionDateDMY, time: '', collector: '', quantity: '', uom: '',
    tests, testSectionMap: '', testSampleTypeMap: '', panels: '', rejected: 'false', rejectReasonId: '',
    initialConditionIds: '', storageLocationId: '', storageLocationType: '', storagePositionCoordinate: '',
    gpsLatitude: '', gpsLongitude: '', gpsAccuracy: '', gpsCaptureMethod: '', collectionMethod: '',
    sampleTemperature: '', specimenOrigin: '', numOrderLabels: '1', numSpecimenLabels: '1',
  };
  const attrs = Object.entries(a).map(([k, v]) => `${k}='${v}'`).join(' ');
  return `<?xml version="1.0" encoding="utf-8"?><samples><sample ${attrs}/></samples>`;
}

async function generateLabNo() {
  const r = await api('/api/OpenELIS-Global/rest/SampleEntryGenerateScanProvider');
  if (!r.ok || !r.body?.body) return null;
  return r.body.body;
}

async function createOrder(patient, sampleTypeId, testId, collectionDate) {
  const labNo = await generateLabNo();
  if (!labNo) return { ok: false, error: 'failed to generate labNo' };

  const now = new Date();
  const requestDate = fmtDMY(now);
  const receivedDateForDisplay = fmtDMY(collectionDate);
  const receivedTime = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  const collectionDateDMY = fmtDMY(collectionDate);
  const nowTs = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}.000`;

  const payload = {
    rememberSiteAndRequester: false,
    currentDate: null,
    projects: null,
    customNotificationLogic: false,
    patientEmailNotificationTestIds: [],
    patientSMSNotificationTestIds: [],
    providerEmailNotificationTestIds: [],
    providerSMSNotificationTestIds: [],
    patientUpdateStatus: 'NO_ACTION',
    referralItems: [],
    referralOrganizations: null,
    referralReasons: null,
    sampleTypes: null,
    sampleXML: buildSampleXML({ sampleTypeId, collectionDateDMY, tests: testId }),
    patientProperties: {
      patientLastUpdated: nowTs,
      personLastUpdated: nowTs,
      patientPK: patient.pid,
      subjectNumber: '',
      nationalId: patient.nid,
      guid: '',
      lastName: patient.last,
      firstName: patient.first,
      aka: '',
      mothersName: '',
      mothersInitial: '',
      streetAddress: '',
      city: '',
      commune: '',
      addressDepartment: '',
      gender: patient.gender,
      birthDateForDisplay: patient.birthDateForDisplay,
      insuranceNumber: '',
      occupation: '',
      customNotes: '',
      targetDiseaseProgramme: '',
      primaryPhone: '',
      email: '',
      healthRegion: '',
      education: '',
      maritialStatus: '',
      nationality: '',
      healthDistrict: '',
      otherNationality: '',
      patientContact: {
        lastupdated: now.getTime(),
        id: '',
        patientId: patient.pid,
        person: { lastupdated: now.getTime(), id: '', lastName: '', firstName: '', primaryPhone: '', email: '' },
      },
      addressHierarchy: {},
      stnumber: '',
      patientUpdateStatus: 'NO_ACTION',
    },
    patientSearch: null,
    patientEnhancedSearch: null,
    patientClinicalProperties: null,
    sampleOrderItems: {
      newRequesterName: '',
      orderTypes: [],
      orderType: '',
      externalOrderNumber: '',
      labNo,
      requestDate,
      receivedDateForDisplay,
      receivedTime,
      nextVisitDate: '',
      requesterSampleID: '',
      referringPatientNumber: '',
      referringSiteId: '',
      referringSiteDepartmentId: '',
      referringSiteCode: '',
      referringSiteName: '',
      referringSiteDepartmentName: '',
      referringSiteList: [],
      referringSiteDepartmentList: [],
      providersList: [],
      providerId: '',
      providerPersonId: '',
      providerFirstName: '',
      providerLastName: '',
      providerWorkPhone: '',
      providerFax: '',
      providerEmail: '',
      facilityAddressStreet: '',
      facilityAddressCommune: '',
      facilityPhone: '',
      facilityFax: '',
      paymentOptionSelection: '',
      paymentOptions: [],
      modified: true,
      sampleId: '',
      readOnly: false,
      billingReferenceNumber: '',
      testLocationCode: '',
      otherLocationCode: '',
      testLocationCodeList: [],
      program: '',
      programList: [],
      contactTracingIndexName: '',
      contactTracingIndexRecordNumber: '',
      priorityList: [],
      priority: 'ROUTINE',
      programId: '',
      additionalQuestions: null,
      isEQASample: false,
      eqaProgramId: '',
      eqaProviderSampleId: '',
      eqaDeadline: '',
      eqaPriority: 'STANDARD',
      consentGiven: false,
      consentFormReference: '',
      consentRecordedAt: '',
      consentRecordedBy: '',
    },
    initialSampleConditionList: [],
    sampleNatureList: null,
    testSectionList: [],
    warning: false,
    useReferral: true,
    rejectReasonList: null,
  };

  const r = await api('/api/OpenELIS-Global/rest/SamplePatientEntry', { method: 'POST', body: payload });
  if (!r.ok) return { ok: false, error: `${r.status}: ${JSON.stringify(r.body).slice(0,300)}` };
  return { ok: true, accession: labNo, raw: r.body };
}

async function main() {
  const mode = process.argv[2] || 'pilot';
  console.log('=== discovering test/sampleType pairs ===');
  const sampleTypeIds = ['4','2','3','97','30'];
  const pairs = [];
  for (const stId of sampleTypeIds) {
    const r = await api(`/api/OpenELIS-Global/rest/sample-type-tests?sampleType=${stId}`);
    if (r.ok && r.body?.tests?.length) {
      const t = r.body.tests[0];
      pairs.push({ sampleTypeId: stId, testId: t.id, testName: t.name });
      console.log(`  sampleType ${stId} -> test ${t.id} (${t.name})`);
    } else {
      console.log(`  sampleType ${stId} -> FAILED ${r.status}`);
    }
  }
  if (pairs.length === 0) { console.log('NO VALID PAIRS. Aborting.'); return; }

  const nPatients = mode === 'pilot' ? 2 : 50;
  const nOrders = mode === 'pilot' ? 3 : 150;

  console.log(`\n=== creating ${nPatients} patients ===`);
  const patients = [];
  const patientErrors = [];
  for (let i = 0; i < nPatients; i++) {
    const res = await createPatient(i);
    if (res.ok) { patients.push(res); }
    else { patientErrors.push(res); console.log('  patient FAIL', i, res.error); }
  }
  console.log(`  created ${patients.length}/${nPatients} patients, ${patientErrors.length} errors`);
  if (patients.length === 0) { console.log('NO PATIENTS CREATED. Aborting orders.'); return; }

  console.log(`\n=== creating ${nOrders} orders ===`);
  const orders = [];
  const orderErrors = [];
  const today = new Date();
  for (let i = 0; i < nOrders; i++) {
    const patient = patients[i % patients.length];
    const pair = pairs[i % pairs.length];
    const daysAgo = i % 21;
    const d = new Date(today); d.setDate(d.getDate() - daysAgo);
    const res = await createOrder(patient, pair.sampleTypeId, pair.testId, d);
    if (res.ok) { orders.push(res); if (orders.length <= 3) console.log('  order OK', res.accession); }
    else {
      orderErrors.push({ i, patient: patient.nid, pair, error: res.error });
      if (orderErrors.length <= 5) console.log('  order FAIL', i, res.error);
    }
  }
  console.log(`\n  created ${orders.length}/${nOrders} orders, ${orderErrors.length} errors`);

  fs.writeFileSync('/tmp/seed150-result.json', JSON.stringify({ patients, patientErrors, orders, orderErrors, pairs }, null, 2));
  console.log('\nFull result written to /tmp/seed150-result.json');

  if (orders.length > 0) {
    console.log('\n=== round-trip verify (first 3 accessions) ===');
    for (const o of orders.slice(0,3)) {
      const v = await api(`/api/OpenELIS-Global/rest/SampleEdit?labNumber=${encodeURIComponent(o.accession)}`);
      console.log(`  ${o.accession}: verify status ${v.status}, body keys: ${v.ok && typeof v.body==='object' ? Object.keys(v.body).slice(0,10).join(',') : JSON.stringify(v.body).slice(0,150)}`);
    }
  }
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
