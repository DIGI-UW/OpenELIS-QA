/**
 * tests/chains/env-order-payload.ts
 *
 * A REAL environmental `SamplePatientEntry` payload — captured, minimised, and
 * verified against testing.openelis-global.org v3.2.2.0 on 2026-09-03.
 *
 * WHY THIS FILE EXISTS
 * Chain N Step 4 previously posted a hand-written "best-effort minimal
 * envelope" with a comment admitting the real body had never been captured.
 * That envelope omitted the requester, so every run got HTTP 400
 * (`errors.requester.org.or.requestor.required`), recorded a GAP, and
 * returned. The chain's only write path never executed once. See OGC-1192.
 *
 * HOW THIS WAS DERIVED (so the next person can redo it)
 *   1. Drove /order/environmental/enter in a real browser to a successful
 *      save (lab no. DEV01260000000000656), with window.fetch patched to
 *      capture the outgoing request body verbatim. Captured: 6574 bytes, 26
 *      top-level keys, HTTP 200.
 *   2. Replayed the captured body with a fresh accession -> 200. Confirms the
 *      envelope is replayable and not tied to one-shot form state.
 *   3. Bisected it by deleting key groups and re-posting each variant, to find
 *      what the server actually requires. Result: 3177 bytes, still 200.
 *
 * WHAT THE BISECTION FOUND — do not "tidy" these away without re-running it:
 *   - Droppable (server does not care): referral lists, sampleTypes,
 *     testSectionList, rejectReasonList, initialSampleConditionList,
 *     sampleNatureList, patientSearch, patientEnhancedSearch,
 *     patientClinicalProperties, projects, the four notification id arrays,
 *     warning, orderEntryOnly, customNotificationLogic.
 *   - REQUIRED, surprisingly: `rememberSiteAndRequester`. Deleting this single
 *     boolean turns the request into a **500**, not a 400. Worth a ticket of
 *     its own — a missing optional flag should never be a server error.
 *   - REQUIRED: the ~37 empty-string and 8 empty-array keys in
 *     sampleOrderItems below. A trimmed sampleOrderItems carrying only the
 *     meaningful values also 500s, so the binder needs the full shape. That is
 *     why EMPTY_STRING_FIELDS / EMPTY_ARRAY_FIELDS are spelled out rather than
 *     omitted — they are load-bearing.
 *
 * The workflow discriminator is `sampleOrderItems.environmentalFields.workflowType`
 * = 'environmental'. That is the field `/rest/order/dashboard?workflowType=…`
 * is expected to filter on.
 */

/** sampleOrderItems keys the binder needs present-but-empty. Load-bearing. */
const EMPTY_STRING_FIELDS = [
  'newRequesterName', 'orderType', 'externalOrderNumber', 'nextVisitDate',
  'requesterSampleID', 'referringPatientNumber', 'referringSiteId',
  'referringSiteDepartmentId', 'referringSiteCode', 'referringSiteName',
  'referringSiteDepartmentName', 'providerId', 'providerPersonId',
  'providerFirstName', 'providerLastName', 'providerWorkPhone', 'providerFax',
  'providerEmail', 'facilityAddressStreet', 'facilityAddressCommune',
  'facilityPhone', 'facilityFax', 'paymentOptionSelection', 'sampleId',
  'billingReferenceNumber', 'testLocationCode', 'otherLocationCode', 'program',
  'contactTracingIndexName', 'contactTracingIndexRecordNumber', 'programId',
  'eqaProgramId', 'eqaProviderSampleId', 'eqaDeadline', 'consentFormReference',
  'consentRecordedAt', 'consentRecordedBy',
] as const;

/** sampleOrderItems keys the binder needs as empty arrays. Also load-bearing. */
const EMPTY_ARRAY_FIELDS = [
  'orderTypes', 'referringSiteList', 'referringSiteDepartmentList',
  'providersList', 'paymentOptions', 'testLocationCodeList', 'programList',
  'priorityList',
] as const;

export interface EnvOrderOptions {
  /** Accession from GET /rest/SampleEntryGenerateScanProvider. */
  labNo: string;
  /** dd/MM/yyyy — note the app posts dd/MM while rendering MM/dd (OGC-1048 OBS-04). */
  date: string;
  /** HH:mm, 24h. */
  time?: string;
  /** Environmental sample type id. 51 = Water on testing. */
  sampleTypeId?: string;
  /** Comma-separated test ids. 767 = pH, 769 = Lead on testing. */
  testIds?: string;
  samplingSiteId?: string;
  samplingSiteName?: string;
  samplingSiteCode?: string;
  requestorFirstName?: string;
  requestorLastName?: string;
}

/** The per-sample manifest, as the wizard serialises it. One row = one sample. */
export function buildSampleXml(o: EnvOrderOptions): string {
  const time = o.time ?? '10:30';
  const attrs = [
    `sampleID='1'`, `typeId='${o.sampleTypeId ?? '51'}'`, `sampleItemId=''`,
    `date='${o.date}'`, `time='${time}'`, `collector=''`,
    `collectionConditions=''`, `quantity=''`, `uom=''`,
    `receivedDate='${o.date}'`, `receivedTime='${time}'`,
    `tests='${o.testIds ?? '767,769'}'`, `testSectionMap=''`,
    `testSampleTypeMap=''`, `panels=''`, `rejected='false'`,
    `rejectReasonId=''`, `initialConditionIds=''`, `storageLocationId=''`,
    `storageLocationType=''`, `storagePositionCoordinate=''`,
    `gpsLatitude=''`, `gpsLongitude=''`, `gpsAccuracy=''`,
    `gpsCaptureMethod=''`, `container=''`, `locationDetails=''`,
    `labPerformedSampling='false'`, `collectionLocationId=''`, `qcType=''`,
    `qcParentSampleIndex=''`, `qcExpectedValue=''`,
  ].join(' ');
  return `<?xml version="1.0" encoding="utf-8"?><samples requiredBy=''><sample ${attrs}/></samples>`;
}

/**
 * Build the verified environmental SamplePatientEntry body.
 * Posts clean against v3.2.2.0; see the header for the bisection record.
 */
export function buildEnvOrderPayload(o: EnvOrderOptions): Record<string, unknown> {
  const time = o.time ?? '10:30';

  const sampleOrderItems: Record<string, unknown> = {
    labNo: o.labNo,
    requestDate: o.date,
    receivedDateForDisplay: o.date,
    receivedTime: time,
    modified: true,
    readOnly: false,
    priority: 'ROUTINE',
    isEQASample: false,
    eqaPriority: 'STANDARD',
    consentGiven: false,
    additionalQuestions: null,
    requestorFirstName: o.requestorFirstName ?? 'QAAuto',
    requestorLastName: o.requestorLastName ?? 'EnvChainN',
    environmentalFields: {
      workflowType: 'environmental',
      samplingSiteId: o.samplingSiteId ?? '4',
      samplingSiteName: o.samplingSiteName ?? 'CPHL',
      samplingSiteCode: o.samplingSiteCode ?? 'C-AXLS',
      siteType: '', siteSubtype: '', environmentalZone: '',
      samplingSiteContact: '', samplingSitePhone: '', samplingSiteDesc: '',
      samplingSiteGpsLat: '', samplingSiteGpsLon: '',
    },
  };
  for (const k of EMPTY_STRING_FIELDS) sampleOrderItems[k] = '';
  for (const k of EMPTY_ARRAY_FIELDS) sampleOrderItems[k] = [];

  return {
    // Deleting this boolean yields a 500, not a 400. See header.
    rememberSiteAndRequester: false,
    currentDate: o.date,
    patientUpdateStatus: 'ADD',
    sampleXML: buildSampleXml(o),
    // Environmental samples are patientless by design; this block is the empty
    // patient envelope the shared clinical endpoint still expects.
    patientProperties: {
      currentDate: '', patientLastUpdated: '', personLastUpdated: '',
      patientUpdateStatus: 'ADD', patientPK: '', stnumber: null,
      subjectNumber: '', nationalId: '', guid: '', lastName: '', firstName: '',
      aka: null, mothersName: null, mothersInitial: null, streetAddress: '',
      city: '', commune: '', addressDepartment: null, gender: '',
      ageYears: null, ageMonths: null, ageDays: null, birthDateForDisplay: '',
      patientType: '', insuranceNumber: null, occupation: null,
      primaryPhone: '', email: null, healthRegion: '', education: '',
      maritialStatus: '', nationality: '', healthDistrict: '',
      otherNationality: '',
      patientContact: { person: { lastName: '', firstName: '', email: '', primaryPhone: '' } },
      readOnly: false, patientIdentities: null,
    },
    sampleOrderItems,
  };
}

/** dd/MM/yyyy — the format the save payload uses. */
export function ddMMyyyy(d = new Date()): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}
