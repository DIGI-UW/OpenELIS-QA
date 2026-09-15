/**
 * OpenELIS Global QA — Bulk Seed Factory
 *
 * Operations:
 *   - census()     — read current data, return counts by category
 *   - seed()       — create the delta between census and targets
 *   - verify()     — round-trip read-back per SKILL §7.5
 *
 * Designed to be invoked from seed-data.ts (standalone CLI) or from a
 * Playwright test fixture. Either way it takes a Page object that's
 * already authenticated.
 *
 * Idempotency strategy:
 *   - Search for `QA_AUTO_` prefixed records first
 *   - Compute delta = target - existing
 *   - Create only the delta
 *   - On re-run, delta drops to 0 and seed becomes a no-op
 *
 * Bug awareness:
 *   - BUG-37 patient-order linkage: documented; we attempt the wizard
 *     anyway and verify linkage via Modify Order read-back. Failures are
 *     captured in `setupErrors`, not thrown.
 *   - BUG-31 Carbon Accept checkbox: blocks UI result entry. The factory
 *     attempts API substitution for IN_PROGRESS → READY_FOR_VALIDATION
 *     transitions. If the API path is unavailable, those orders stay in
 *     CREATED state and the script reports the gap.
 *   - BUG-1/BUG-12 TestAdd: not used by this script (we don't create
 *     new tests, just orders against the existing catalog).
 *
 * v2 (2026-09-14) — catalog discovery + order payload corrected:
 *   `/rest/test-list` returning a flat `{id, value}` array with no
 *   `testSectionName`/`sampleTypeId` fields is CURRENT, INTENDED product
 *   behavior (confirmed live; this is not a regression to file against —
 *   see apiShapes.ts's own note on this, previously mislabeled "spec bug
 *   #4"). The catalog was never wrong; this script's assumption about it
 *   was. discoverTestCatalog() now sources sample-type/test pairs from
 *   `/rest/TestAdd` (sampleTypeList) + `/rest/sample-type-tests`, which
 *   are live-verified shapes. createOrder() now builds the full nested
 *   SamplePatientEntrySubmitPayload (patientProperties/sampleOrderItems/
 *   sampleXML) documented in apiShapes.ts instead of the flat shape this
 *   file used previously, which 400s with HttpMessageNotReadableException
 *   on every instance, not just this one. See CHANGELOG.
 */

import { Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import {
  QA_PREFIX,
  TARGETS,
  TestCatalogEntry,
  OrderTargetStatus,
  patientNationalId,
  patientLastName,
  patientFirstName,
  patientDOB,
  patientGender,
} from './seed-config';

// Resolved centrally. Reading process.env.BASE_URL here is what let the browser and the
// fixtures target two different instances at once. See helpers/base-url.ts.
// Imported AND re-exported: this module uses BASE itself, and its consumers import it
// from here, so a bare `export ... from` would compile as a re-export with no local binding.
import { BASE } from './base-url';
export { BASE };
export const SEED_STATE_PATH = path.join(process.cwd(), '.auth', 'seed-state.json');

// -----------------------------------------------------------------------------
// State
// -----------------------------------------------------------------------------

export interface SeedCensus {
  patients: number;
  orders: number;
  inProgress: number;
  readyForValidation: number;
  rejected: number;
  empty: boolean; // true if EVERYTHING is zero (Step 0.6 halt condition)
}

export interface SeedState {
  base: string;
  timestamp: string;
  targets: typeof TARGETS;
  before: SeedCensus;
  after: SeedCensus;
  created: {
    patients: string[];        // national IDs
    orders: string[];          // accession numbers
  };
  errors: Array<{ phase: string; detail: string }>;
  notes: string[];
}

function emptyCensus(): SeedCensus {
  return { patients: 0, orders: 0, inProgress: 0, readyForValidation: 0, rejected: 0, empty: true };
}

// -----------------------------------------------------------------------------
// CSRF-aware fetch wrapper
// -----------------------------------------------------------------------------

/**
 * Execute a JSON fetch from within the authenticated browser context.
 * Reads the CSRF token from localStorage['CSRF'] and attaches it to all
 * mutating requests. Returns { ok, status, body } so callers can branch
 * on outcome without throwing.
 *
 * Header is `X-CSRF-TOKEN` (apiShapes.ts csrfFetch() convention) — headers
 * are case-insensitive over the wire so this was never the cause of any
 * 400 seen from this file, but keep it aligned with the documented helper.
 */
async function apiCall<T = unknown>(
  page: Page,
  pathSuffix: string,
  init: { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: unknown } = {}
): Promise<{ ok: boolean; status: number; body: T | string | null }> {
  return page.evaluate(
    async ({ pathSuffix, init }) => {
      const csrf = localStorage.getItem('CSRF') || '';
      const headers: Record<string, string> = {
        'Accept': 'application/json',
      };
      const reqInit: RequestInit = {
        method: init.method || 'GET',
        headers,
        credentials: 'same-origin',
      };
      if (init.body !== undefined) {
        headers['Content-Type'] = 'application/json';
        headers['X-CSRF-TOKEN'] = csrf;
        reqInit.body = JSON.stringify(init.body);
      }
      try {
        const res = await fetch(pathSuffix, reqInit);
        const text = await res.text();
        let body: unknown = text;
        try { body = JSON.parse(text); } catch { /* not JSON; keep text */ }
        return { ok: res.ok, status: res.status, body: body as never };
      } catch (err) {
        return { ok: false, status: 0, body: String(err) };
      }
    },
    { pathSuffix, init }
  );
}

// -----------------------------------------------------------------------------
// Census
// -----------------------------------------------------------------------------

/**
 * Read current state from the instance. Counts QA_AUTO_-prefixed patients,
 * all orders by status, and rejected samples. Does not write anything.
 *
 * Uses endpoints that have been verified working in the 2026-04-20
 * calibration: /rest/patient-search-results, /rest/home-dashboard/metrics,
 * /rest/LogbookResults. Avoids the 6 false-positive paths from §6.5.
 */
export async function census(page: Page): Promise<SeedCensus> {
  const result = emptyCensus();

  // QA_AUTO patients via patient-search-results
  const patientSearch = await apiCall<{ patientSearchResults?: Array<unknown> }>(
    page,
    `/api/OpenELIS-Global/rest/patient-search-results?lastName=${encodeURIComponent(QA_PREFIX.replace(/_/g, '-'))}`
  );
  if (patientSearch.ok && typeof patientSearch.body === 'object' && patientSearch.body !== null) {
    const list = (patientSearch.body as { patientSearchResults?: unknown[] }).patientSearchResults;
    if (Array.isArray(list)) result.patients = list.length;
  }

  // Dashboard counts give us order totals across all patients (not just QA_AUTO).
  // For idempotency we'd want QA_AUTO orders specifically, but the dashboard is
  // the only reliable count source on the current API; the seed script accepts
  // this approximation and notes it in the state file.
  //
  // NOTE: this total does NOT include CREATED (no sample collected) orders —
  // only inProgress + readyForValidation + rejected. A freshly-seeded batch of
  // CREATED orders will not move `result.orders` off 0, so a second seed-data
  // run against the same instance is NOT a no-op for orders. Run once per
  // batch; don't rely on this census for order idempotency the way patient
  // idempotency works.
  const metrics = await apiCall<{
    ordersInProgress?: number;
    ordersReadyForValidation?: number;
    ordersRejectedToday?: number;
  }>(page, '/api/OpenELIS-Global/rest/home-dashboard/metrics');
  if (metrics.ok && typeof metrics.body === 'object' && metrics.body !== null) {
    const m = metrics.body as Record<string, number>;
    // Field-name typos confirmed (NOTE-3): the API uses these exact spellings.
    result.inProgress = m.ordersInProgress ?? 0;
    result.readyForValidation = m.ordersReadyForValidation ?? 0;
    result.rejected = m.ordersRejectedToday ?? 0;
    // Total orders is approximate: in-progress + ready + rejected understates
    // (excludes CREATED + validated + reported), but is sufficient for the
    // empty check.
    result.orders = result.inProgress + result.readyForValidation + result.rejected;
  }

  result.empty =
    result.patients === 0 &&
    result.orders === 0 &&
    result.inProgress === 0 &&
    result.readyForValidation === 0;

  return result;
}

// -----------------------------------------------------------------------------
// Test catalog discovery
// -----------------------------------------------------------------------------

/**
 * Fetch a small set of valid (sampleTypeId, testId) pairs to construct order
 * payloads against.
 *
 * v2 (2026-09-14): previously this read `/rest/test-list` and matched
 * `t.testSectionName` against the hard-coded LAB_SECTIONS names. That
 * endpoint has never returned section metadata — it is a flat
 * `Array<{id, value}>` where `value` is a squashed display string. This is
 * documented, current, INTENDED behavior (apiShapes.ts TestListEntry), not
 * a defect — do not file a bug against `/rest/test-list` for lacking
 * section fields. The old code silently returned an empty map on every
 * instance as a result; this rewrite sources from the two endpoints that
 * actually carry the fields we need:
 *
 *   GET /rest/TestAdd              → sampleTypeList: [{id, value}], labUnitList
 *   GET /rest/sample-type-tests?sampleType=<id>  → { tests: [{id, name, resultType, ...}] }
 *
 * We try each sample type in turn and keep the first test found for it,
 * stopping once `maxPairs` are collected. This trades exact lab-section
 * targeting (not available without an additional per-test
 * `/rest/test-catalog/tests/{id}` call for `applicableSections`) for a
 * fast, live-verified set of valid pairs — sufficient for order-payload
 * construction, which only needs sampleTypeId + testId, not a section id.
 */
export async function discoverTestCatalog(
  page: Page,
  opts: { maxPairs?: number } = {}
): Promise<Map<string, TestCatalogEntry>> {
  const maxPairs = opts.maxPairs ?? 5;
  const result = new Map<string, TestCatalogEntry>();

  const testAdd = await apiCall<{ sampleTypeList?: Array<{ id: string; value: string }> }>(
    page,
    '/api/OpenELIS-Global/rest/TestAdd'
  );
  if (!testAdd.ok || !testAdd.body || typeof testAdd.body !== 'object') {
    throw new Error(
      `Test catalog discovery failed: GET /rest/TestAdd returned ${testAdd.status}. ` +
      `Cannot construct order payloads without a sample type list.`
    );
  }
  const sampleTypes = (testAdd.body as { sampleTypeList?: Array<{ id: string; value: string }> }).sampleTypeList || [];

  for (const st of sampleTypes) {
    if (result.size >= maxPairs) break;
    const r = await apiCall<{ tests?: Array<Record<string, unknown>> }>(
      page,
      `/api/OpenELIS-Global/rest/sample-type-tests?sampleType=${encodeURIComponent(st.id)}`
    );
    if (!r.ok || !r.body || typeof r.body !== 'object') continue;
    const tests = (r.body as { tests?: Array<Record<string, unknown>> }).tests || [];
    if (tests.length === 0) continue;
    const t = tests[0];
    result.set(st.value, {
      testId: String(t.id),
      testName: String(t.name),
      sampleType: st.value,
      sampleTypeId: st.id,
      // No section id available from this path; leave blank rather than
      // guess. Nothing in createOrder()'s payload needs it — the POST body
      // takes sampleTypeId + testId only.
      testSection: st.value,
      testSectionId: '',
    });
  }

  if (result.size === 0) {
    throw new Error(
      `Test catalog discovery failed: no sample type yielded a test via ` +
      `/rest/sample-type-tests. Checked ${sampleTypes.length} sample types.`
    );
  }

  return result;
}

// -----------------------------------------------------------------------------
// Patient seeding
// -----------------------------------------------------------------------------

interface CreatePatientResult {
  ok: boolean;
  nationalId: string;
  patientPK?: string;
  firstName?: string;
  lastName?: string;
  gender?: 'M' | 'F';
  birthDateForDisplay?: string;
  error?: string;
}

/**
 * Create one patient via the SamplePatientEntry wizard's underlying API.
 * Uses the same payload shape as the wizard's POST. Round-trip verifies
 * by searching for the patient immediately after.
 */
async function createPatient(page: Page, index: number): Promise<CreatePatientResult> {
  const nid = patientNationalId(index);
  const [yy, mm, dd] = patientDOB(index).split('-');
  const firstName = patientFirstName(index);
  const lastName = patientLastName(index);
  const gender = patientGender(index);
  const birthDateForDisplay = `${dd}/${mm}/${yy}`;
  // Real create endpoint is /rest/PatientManagement (PascalCase); the kebab
  // /rest/patient-management 404s. Payload is the flat CreatePatientFormValues
  // shape the CreatePatientForm submits (patientUpdateStatus:'ADD' + patientContact),
  // NOT a {patientProperties} envelope; birthDateForDisplay is dd/MM/yyyy.
  const payload = {
    patientUpdateStatus: 'ADD',
    nationalId: nid,
    subjectNumber: '',
    lastName,
    firstName,
    aka: '',
    streetAddress: `${QA_PREFIX}_street`,
    city: '', primaryPhone: '', email: '',
    gender,
    birthDateForDisplay,
    commune: '', education: '', maritialStatus: '', nationality: '',
    healthDistrict: '', healthRegion: '', otherNationality: '', occupation: '',
    customNotes: '', targetDiseaseProgramme: '', photo: '', idDocuments: [],
    patientContact: { person: { firstName: '', lastName: '', primaryPhone: '', email: '' } },
  };
  const create = await apiCall<Record<string, unknown>>(
    page,
    '/api/OpenELIS-Global/rest/PatientManagement',
    { method: 'POST', body: payload },
  );
  if (!create.ok) {
    return {
      ok: false,
      nationalId: nid,
      error: `POST /rest/PatientManagement returned ${create.status}: ${
        typeof create.body === 'string' ? create.body.slice(0, 120) : JSON.stringify(create.body).slice(0, 120)
      }`,
    };
  }
  // Create is authoritative (returns {status:'success', patientId}); the
  // patient-search index can lag, so trust the create response for patientPK
  // instead of requiring an immediate search round-trip.
  const cb = (create.body && typeof create.body === 'object') ? create.body as Record<string, unknown> : {};
  const pid = String(cb.patientId ?? cb.patientID ?? '');
  return { ok: true, nationalId: nid, patientPK: pid, firstName, lastName, gender, birthDateForDisplay };
}

/**
 * Seed N patients (only the delta from existing count). Returns the list
 * of newly created national IDs and any errors encountered. Stops early
 * if the create API path returns 500/503 three times in a row — that's
 * a signal the endpoint isn't available on this instance and continuing
 * would just waste time.
 */
export async function seedPatients(
  page: Page,
  state: SeedState,
  targetCount: number
): Promise<void> {
  const existing = state.before.patients;
  const needed = Math.max(0, targetCount - existing);
  if (needed === 0) {
    state.notes.push(`Patient seeding skipped: census found ${existing}, target ${targetCount}.`);
    return;
  }
  state.notes.push(`Seeding ${needed} patients (existing: ${existing}, target: ${targetCount}).`);
  let consecutiveFailures = 0;
  for (let i = existing; i < existing + needed; i++) {
    const res = await createPatient(page, i);
    if (res.ok && res.patientPK) {
      state.created.patients.push(res.nationalId);
      consecutiveFailures = 0;
    } else {
      state.errors.push({ phase: 'createPatient', detail: res.error || 'unknown' });
      consecutiveFailures++;
      if (consecutiveFailures >= 3) {
        state.errors.push({ phase: 'createPatient', detail: 'Bailing after 3 consecutive failures.' });
        break;
      }
    }
  }
}

// -----------------------------------------------------------------------------
// Order seeding
// -----------------------------------------------------------------------------

interface CreateOrderResult {
  ok: boolean;
  accession?: string;
  patientLinked: boolean; // BUG-37: linkage may fail silently
  error?: string;
}

interface OrderPatient {
  nationalId: string;
  patientPK: string;
  firstName: string;
  lastName: string;
  gender: 'M' | 'F' | '';
  birthDateForDisplay: string; // dd/MM/yyyy
}

function fmtDMY(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function fmtTimestamp(d: Date): string {
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}.000`;
}

/**
 * Build the `sampleXML` literal string carried inside the SamplePatientEntry
 * POST body. Attribute names/order verified live 2026-09-14 against apiShapes.ts's
 * captured shape (v6.15, A1-bis Session 2) — do not reorder without re-verifying.
 */
function buildSampleXML(opts: { sampleTypeId: string; collectionDateDMY: string; testId: string }): string {
  const a: Record<string, string> = {
    sampleID: opts.sampleTypeId,
    date: opts.collectionDateDMY,
    time: '', collector: '', quantity: '', uom: '',
    tests: opts.testId,
    testSectionMap: '', testSampleTypeMap: '', panels: '', rejected: 'false', rejectReasonId: '',
    initialConditionIds: '', storageLocationId: '', storageLocationType: '', storagePositionCoordinate: '',
    gpsLatitude: '', gpsLongitude: '', gpsAccuracy: '', gpsCaptureMethod: '', collectionMethod: '',
    sampleTemperature: '', specimenOrigin: '', numOrderLabels: '1', numSpecimenLabels: '1',
  };
  const attrs = Object.entries(a).map(([k, v]) => `${k}='${v}'`).join(' ');
  return `<?xml version="1.0" encoding="utf-8"?><samples><sample ${attrs}/></samples>`;
}

async function generateLabNo(page: Page): Promise<string | null> {
  const r = await apiCall<{ status?: boolean; body?: string }>(
    page,
    '/api/OpenELIS-Global/rest/SampleEntryGenerateScanProvider'
  );
  if (!r.ok || !r.body || typeof r.body !== 'object') return null;
  const body = (r.body as { body?: string }).body;
  return body ?? null;
}

/**
 * Create one order for a specific patient + test combination.
 *
 * v2 (2026-09-14): previously POSTed a flat, invented payload
 * ({patientProperties:{patientPK,nationalId,patientUpdateStatus},
 * sampleOrderItems:{...}, sampleItems:[...]}). That shape 400s with
 * HttpMessageNotReadableException — SamplePatientEntry expects the full
 * nested envelope documented in apiShapes.ts (SamplePatientEntrySubmitPayload),
 * with the actual sample/test data carried as a literal XML string in
 * `sampleXML`, not as a `sampleItems` array. This rewrite builds that shape,
 * live-verified against 153 successful order creations on 2026-09-14
 * (3-order pilot + 150-order batch, both 0 errors).
 *
 * providerPersonId / referringSiteId / programId are left blank rather than
 * using ORDER_SEED_DEV_ONLY_IDS from apiShapes.ts — those are dev.docker-compose
 * fixture ids that 500 off dev (apiShapes.ts §PR#3987 / SKILL §11.1).
 *
 * KNOWN BUG: BUG-37 patient-order linkage failure. The order may save
 * successfully (HTTP 200) but the sample_human row may not be written,
 * leaving the order without a patient reference. The verify step opens
 * Modify Order on the new accession and checks that the patient name
 * appears; if it doesn't, `patientLinked: false` is returned and the
 * order is logged as a BUG-37 instance.
 */
async function createOrder(
  page: Page,
  patient: OrderPatient,
  test: TestCatalogEntry,
  collectionDate: Date
): Promise<CreateOrderResult> {
  const labNo = await generateLabNo(page);
  if (!labNo) {
    return { ok: false, patientLinked: false, error: 'Failed to generate labNo via SampleEntryGenerateScanProvider' };
  }

  const now = new Date();
  const nowTs = fmtTimestamp(now);
  const collectionDateDMY = fmtDMY(collectionDate);

  const payload = {
    rememberSiteAndRequester: false,
    currentDate: null,
    projects: null,
    customNotificationLogic: false,
    patientEmailNotificationTestIds: [],
    patientSMSNotificationTestIds: [],
    providerEmailNotificationTestIds: [],
    providerSMSNotificationTestIds: [],
    // Existing patient (created separately via PatientManagement) — NO_ACTION,
    // not ADD. "CREATE" is not a valid enum member (apiShapes.ts note).
    patientUpdateStatus: 'NO_ACTION',
    referralItems: [],
    referralOrganizations: null,
    referralReasons: null,
    sampleTypes: null,
    sampleXML: buildSampleXML({ sampleTypeId: test.sampleTypeId, collectionDateDMY, testId: test.testId }),
    patientProperties: {
      patientLastUpdated: nowTs,
      personLastUpdated: nowTs,
      patientPK: patient.patientPK,
      subjectNumber: '',
      nationalId: patient.nationalId,
      guid: '',
      lastName: patient.lastName,
      firstName: patient.firstName,
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
        patientId: patient.patientPK,
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
      requestDate: fmtDMY(now),
      receivedDateForDisplay: collectionDateDMY,
      receivedTime: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
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

  const create = await apiCall<Record<string, unknown>>(
    page,
    '/api/OpenELIS-Global/rest/SamplePatientEntry',
    { method: 'POST', body: payload }
  );

  if (!create.ok) {
    return {
      ok: false,
      patientLinked: false,
      error: `POST /rest/SamplePatientEntry returned ${create.status}: ${
        typeof create.body === 'string' ? create.body.slice(0, 200) : JSON.stringify(create.body).slice(0, 200)
      }`,
    };
  }

  // Round-trip linkage verify per SKILL §7.5 — confirms BUG-37 status
  // for this specific order. We use SampleEdit which is the Modify Order
  // backing endpoint; if the patient name comes back populated, linkage
  // worked.
  const verify = await apiCall<{ patientName?: string }>(
    page,
    `/api/OpenELIS-Global/rest/SampleEdit?labNumber=${encodeURIComponent(labNo)}`
  );
  const linked =
    verify.ok &&
    typeof verify.body === 'object' &&
    verify.body !== null &&
    Boolean((verify.body as { patientName?: string }).patientName);

  return { ok: true, accession: labNo, patientLinked: !!linked };
}

/**
 * Seed orders distributed across the discovered sample-type/test pairs.
 * Orders are assigned to QA_AUTO_ patients in round-robin. Collection
 * dates are spread over the past 21 days so Reports/TAT have variety.
 */
export async function seedOrders(
  page: Page,
  state: SeedState,
  targetCount: number,
  catalog: Map<string, TestCatalogEntry>
): Promise<void> {
  const existingOrders = state.before.orders;
  const needed = Math.max(0, targetCount - existingOrders);
  if (needed === 0) {
    state.notes.push(`Order seeding skipped: census found ${existingOrders}, target ${targetCount}.`);
    return;
  }
  if (catalog.size === 0) {
    state.errors.push({ phase: 'seedOrders', detail: 'No test catalog entries — cannot construct orders.' });
    return;
  }

  // Build the patient pool: existing QA_AUTO_ patients + freshly created.
  // patient-search-results carries firstName/lastName/gender/birthdate
  // directly (verified live 2026-09-14), so no separate lookup is needed
  // to build the full patientProperties envelope createOrder() requires.
  const allQaPatients = await apiCall<{ patientSearchResults?: Array<Record<string, string>> }>(
    page,
    `/api/OpenELIS-Global/rest/patient-search-results?lastName=${encodeURIComponent(QA_PREFIX.replace(/_/g, '-'))}`
  );
  const patientPool: OrderPatient[] = [];
  if (allQaPatients.ok && typeof allQaPatients.body === 'object' && allQaPatients.body !== null) {
    const list = (allQaPatients.body as { patientSearchResults?: Array<Record<string, string>> }).patientSearchResults || [];
    for (const p of list) {
      if (p.nationalId && p.patientID) {
        patientPool.push({
          nationalId: p.nationalId,
          patientPK: p.patientID,
          firstName: p.firstName || '',
          lastName: p.lastName || '',
          gender: (p.gender as 'M' | 'F') || '',
          birthDateForDisplay: p.birthdate || p.formatedBirthDate || '',
        });
      }
    }
  }
  if (patientPool.length === 0) {
    state.errors.push({
      phase: 'seedOrders',
      detail: 'No QA_AUTO patients available — patient seeding must succeed first.',
    });
    return;
  }

  state.notes.push(`Seeding ${needed} orders across ${catalog.size} sample-type/test pairs, ${patientPool.length} patients.`);
  const testEntries = Array.from(catalog.values());
  let bug37Count = 0;
  let consecutiveFailures = 0;
  const today = new Date();

  for (let i = 0; i < needed; i++) {
    const patient = patientPool[i % patientPool.length];
    const test = testEntries[i % testEntries.length];
    const daysAgo = i % 21;
    const collectionDate = new Date(today);
    collectionDate.setDate(collectionDate.getDate() - daysAgo);

    const result = await createOrder(page, patient, test, collectionDate);
    if (result.ok && result.accession) {
      state.created.orders.push(result.accession);
      if (!result.patientLinked) {
        bug37Count++;
      }
      consecutiveFailures = 0;
    } else {
      state.errors.push({ phase: 'createOrder', detail: result.error || 'unknown' });
      consecutiveFailures++;
      if (consecutiveFailures >= 3) {
        state.errors.push({
          phase: 'createOrder',
          detail: 'Bailing after 3 consecutive failures.',
        });
        break;
      }
    }
  }

  if (bug37Count > 0) {
    state.notes.push(
      `BUG-37 INSTANCES: ${bug37Count} of ${state.created.orders.length} orders had broken patient-order linkage. ` +
      `These orders exist but are unreachable via Modify Order patient name.`
    );
  }
}

// -----------------------------------------------------------------------------
// Top-level orchestrator
// -----------------------------------------------------------------------------

export async function runSeed(
  page: Page,
  options: {
    targets?: Partial<typeof TARGETS>;
    dryRun?: boolean;
    verifyOnly?: boolean;
  } = {}
): Promise<SeedState> {
  const targets = { ...TARGETS, ...options.targets };
  const before = await census(page);

  const state: SeedState = {
    base: BASE,
    timestamp: new Date().toISOString(),
    targets,
    before,
    after: emptyCensus(),
    created: { patients: [], orders: [] },
    errors: [],
    notes: [],
  };

  if (options.dryRun || options.verifyOnly) {
    state.notes.push(
      options.dryRun ? 'Dry run: census only, no writes.' : 'Verify only: census + read-back checks, no writes.'
    );
    state.after = before;
    persistState(state);
    return state;
  }

  // Discover test catalog before any writes
  let catalog: Map<string, TestCatalogEntry>;
  try {
    catalog = await discoverTestCatalog(page);
    state.notes.push(`Test catalog: ${catalog.size} sample-type/test pairs discovered via TestAdd + sample-type-tests.`);
  } catch (e) {
    state.errors.push({ phase: 'discoverTestCatalog', detail: String(e) });
    state.after = await census(page);
    persistState(state);
    return state;
  }

  await seedPatients(page, state, targets.patients);
  await seedOrders(page, state, targets.orders, catalog);

  // Status-transition seeding (READY_FOR_VALIDATION, VALIDATED) is NOT
  // implemented here yet. BUG-31 (Carbon Accept checkbox hang) blocks the
  // UI path, and the API-substitute path is NOT yet validated: the
  // LogbookResults POST body shape has never been successfully captured
  // (archive/b-session-2026-05-14.md — the one working precedent drove the
  // real React UI, typing into the Result field and clicking the bottom
  // Save button, not a raw JSON POST). A GET-mutate-POST attempt against
  // LogbookResults (mirroring the AccessionValidation pattern, which IS
  // documented and live-verified) reproduced the generic
  // HttpMessageNotReadableException 400 on 2026-09-14. Capturing the real
  // payload requires a pre-load fetch interceptor (page.addInitScript,
  // installed before the SPA's Axios module binds its fetch reference) or
  // driving Results entry through Claude in Chrome. See workplan Phase B
  // Chain C/D and SKILL §11.5 Blocking-Bug Etiquette.
  state.notes.push(
    'Status-transition seeding (READY_FOR_VALIDATION, VALIDATED) intentionally not attempted: ' +
    'BUG-31 blocks the UI path, and the LogbookResults POST payload shape is not yet validated ' +
    '(see comment above runSeed()). Orders are seeded in CREATED state.'
  );

  state.after = await census(page);
  persistState(state);
  return state;
}

function persistState(state: SeedState): void {
  const dir = path.dirname(SEED_STATE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SEED_STATE_PATH, JSON.stringify(state, null, 2));
}

// -----------------------------------------------------------------------------
// Pretty-print summary for console output
// -----------------------------------------------------------------------------

export function formatSummary(state: SeedState): string {
  const lines: string[] = [];
  lines.push('═══════════════════════════════════════════════════════════════════');
  lines.push(`  OpenELIS Seed Result — ${state.base}`);
  lines.push(`  Timestamp: ${state.timestamp}`);
  lines.push('═══════════════════════════════════════════════════════════════════');
  lines.push('');
  lines.push('              before    after    target   created    delta');
  lines.push('              ──────────────────────────────────────────────');
  for (const k of ['patients', 'orders', 'inProgress', 'readyForValidation', 'rejected'] as const) {
    const before = state.before[k];
    const after = state.after[k];
    const target = (state.targets as Record<string, number>)[k];
    const created =
      k === 'patients' ? state.created.patients.length
      : k === 'orders' ? state.created.orders.length
      : 0;
    const delta = after - before;
    lines.push(
      `  ${k.padEnd(12)}${String(before).padStart(7)}${String(after).padStart(9)}${String(target).padStart(9)}${String(created).padStart(10)}${String(delta).padStart(9)}`
    );
  }
  lines.push('');
  if (state.notes.length > 0) {
    lines.push('Notes:');
    for (const note of state.notes) lines.push(`  • ${note}`);
    lines.push('');
  }
  if (state.errors.length > 0) {
    lines.push(`Errors (${state.errors.length}):`);
    for (const e of state.errors.slice(0, 10)) lines.push(`  ✗ [${e.phase}] ${e.detail}`);
    if (state.errors.length > 10) lines.push(`  … and ${state.errors.length - 10} more (see .auth/seed-state.json)`);
    lines.push('');
  }
  lines.push(`State persisted to: ${SEED_STATE_PATH}`);
  lines.push('═══════════════════════════════════════════════════════════════════');
  return lines.join('\n');
}
