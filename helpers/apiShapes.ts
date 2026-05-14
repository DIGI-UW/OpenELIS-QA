/**
 * helpers/apiShapes.ts
 *
 * Single source of truth for OpenELIS REST API response shapes. Grounded
 * in the 2026-05-13 A1 pilot live capture (pilot-2026-05-13-session-
 * report.md), NOT in prior inference from documents.
 *
 * Every chain and persona spec that reaches into a REST response should
 * import the type and key constants from here. When the shapes change
 * (they will — see the v3.2.1.5 mgtest regression cluster), this is the
 * one file to update.
 *
 * Per SKILL §6.5a/§6.5b: do NOT add a new entry here without first
 * confirming the shape via captureAround() or read_network_requests on a
 * live instance. Inference is what produced the 10 spec bugs the pilot
 * surfaced.
 */

// =============================================================================
// Patient
// =============================================================================

/** Shape returned by `/rest/patient-search-results?lastName=X`. */
export interface PatientSearchResponse {
  paging: { totalPages: string; currentPage: string };
  /** NOTE: key is `patientSearchResults`, not `patientList` (spec bug #1). */
  patientSearchResults: PatientRecord[];
}

export interface PatientRecord {
  firstName: string;
  lastName: string;
  gender: string;
  /** Display format `dd/mm/yyyy`. */
  birthdate: string;
  nationalId: string;
  externalId?: string;          // present on testing, absent on mgdev v3.2.1.8
  dataSourceName: string;
  /** NOTE: field is `patientID` (capital ID), not `patientPK` (spec bug #2). */
  patientID: string;
  /** NOTE: field is `birthdate` (lowercase b), not `birthDate` (spec bug #3). */
  dob: string;
  formatedBirthDate: string;
  /** mgdev v3.2.1.8 adds these — optional for back-compat with v3.2.1.6 testing instance. */
  guid?: string;
  subjectNumber?: string;
  isMerged?: boolean;
}

export const PATIENT_SEARCH_RESPONSE_KEY = 'patientSearchResults' as const;
export const PATIENT_ID_FIELD = 'patientID' as const;
export const PATIENT_DOB_FIELD = 'birthdate' as const;

// =============================================================================
// Test catalog
// =============================================================================

/**
 * `/rest/test-list?activeOnly=true` returns a FLAT ARRAY of `{id, value}`.
 *
 * NOTE (spec bug #4): the previous specs assumed `{testList: [...]}` with
 * rich per-test metadata (testSectionId, sampleTypeId, testSectionName).
 * Those fields don't exist on this endpoint. To get section info, fetch
 * `/rest/TestAdd` and use its `labUnitList` (see below).
 */
export interface TestListEntry {
  id: string;
  /** Display name, e.g. "Actin Smooth Muscle(Immunohistochemistry specimen)". */
  value: string;
}

/** `/rest/TestAdd` returns Struts form metadata with the master lists. */
export interface TestAddFormResponse {
  formName: 'TestAddForm';
  formMethod: 'POST';
  jsonWad: string;
  sampleTypeList: Array<{ id: string; value: string }>;
  panelList: Array<{ id: string; value: string }>;
  uomList: Array<{ id: string; value: string }>;
  resultTypeList: Array<{ id: string; value: string }>;
  ageRangeList: Array<{ id: string; value: string }>;
  /** Section/unit list. Use these IDs for testUnitId filter elsewhere. */
  labUnitList: Array<{ id: string; value: string }>;
  dictionaryList: Array<{ id: string; value: string }>;
  groupedDictionaryList: unknown;
}

/**
 * Known lab unit IDs from the 2026-05-13 pilot capture. Updated when the
 * instance's labUnitList changes — re-derive via `discoverLabUnits()`.
 */
export const LAB_UNIT_IDS = {
  Hematology: '36',
  Biochemistry: '56',
  Immunology: '59',
  MolecularBiology: '136',
  SerologyImmunology: '117',
} as const;

/** Known result type IDs. */
export const RESULT_TYPE_IDS = {
  FreeText: '1',
  SelectList: '2',
  Numeric: '4',
  Alphanumeric: '5',
} as const;

// =============================================================================
// Logbook (results queue)
// =============================================================================

/**
 * `/rest/LogbookResults` returns a Struts form with a paged `testResult` array.
 *
 * NOTE (spec bug #5): filter parameter is `testUnitId`, NOT `testSectionId`.
 * Using `testSectionId=N` with an invalid section returns HTTP 500.
 */
export interface LogbookResponse {
  formName: 'LogbookResultsForm';
  formMethod: 'POST';
  paging: { totalPages: string; currentPage: string; searchTermToPage: unknown[] };
  singlePatient: boolean;
  currentDate: string;
  displayTestMethod: boolean;
  displayTestKit: boolean;
  testResult: LogbookEntry[];
}

export interface LogbookEntry {
  accessionNumber: string;
  testId: string;
  testName: string;
  patientID: string;
  /** … plus per-row fields we discover later. */
  [k: string]: unknown;
}

export const LOGBOOK_FILTER_PARAM = 'testUnitId' as const;

// =============================================================================
// Sample edit / order lookup
// =============================================================================

/**
 * `/rest/SampleEdit?labNumber=X` returns a Struts form, NOT a nested
 * `{patientProperties: {nationalId}}` DTO. The patient fields live at the
 * TOP LEVEL.
 *
 * NOTE (spec bug #7): BUG-37 round-trip check must compare against
 * `body.nationalId`, not `body.patientProperties.nationalId`.
 */
export interface SampleEditResponse {
  formName: 'SampleEditForm';
  formMethod: 'POST';
  noSampleFound: boolean;
  isConfirmationSample: boolean;
  isEditable: boolean;
  /** Patient display fields — these are the BUG-37 verification target. */
  patientName: string;
  dob: string;
  gender: string;
  /** This is what to compare BUG-37 expectations against. */
  nationalId: string;
  newAccessionNumber: string;
  searchFinished: boolean;
  maxAccessionNumber: string;
  sampleXML: string;
  currentDate: string;
  ableToCancelResults: boolean;
  idSeparator: string;
  accessionFormat: string;
  editableAccession: string;
  nonEditableAccession: string;
  maxAccessionLength: number;
  customNotificationLogic: unknown;
}

// =============================================================================
// Site branding
// =============================================================================

/**
 * `/rest/site-branding` GET returns this DTO. PUT accepts the same shape
 * (round-trip confirmed in the 2026-05-13 pilot — Chain I Step 5 PASS).
 *
 * NOTE (spec bug #8): there is NO `labName` field here. Chain I's premise
 * that NOTE-16 ("PDF header shows null") was about a labName field in
 * site-branding is wrong. Lab name lives in SiteInformation or in the JSP
 * properties (see Phase 60 evidence). Chain I needs rewriting.
 */
export interface SiteBrandingResponse {
  id: number;
  useHeaderLogoForLogin: boolean;
  /** Default Carbon header color: `#295785`. */
  headerColor: string;
  /** Default Carbon primary blue: `#0f62fe`. */
  primaryColor: string;
  /** Default neutral: `#393939`. */
  secondaryColor: string;
  colorMode: 'light' | 'dark';
  lastModified: string; // ISO timestamp
  lastModifiedBy: string;
}

// =============================================================================
// Dashboard
// =============================================================================

/**
 * `/rest/home-dashboard/metrics`.
 *
 * NOTE-3 typos are preserved here intentionally — the API uses these
 * exact spellings. Do NOT "fix" them in spec code or the field reads will fail.
 */
export interface DashboardMetrics {
  ordersInProgress: number;
  ordersReadyForValidation: number;
  ordersCompletedToday: number;
  /** sic — typo preserved. */
  patiallyCompletedToday: number;
  /** sic — typo preserved. */
  orderEnterdByUserToday: number;
  ordersRejectedToday: number;
  /** sic — typo preserved. */
  unPritendResults: number;
  /** sic — typo preserved. */
  incomigOrders: number;
  /** sic — typo preserved. */
  averageTurnAroudTime: number;
  delayedTurnAround: number;
}

// =============================================================================
// FHIR
// =============================================================================

/**
 * FHIR base path. Pilot 2026-05-13 found `/api/OpenELIS-Global/fhir/metadata`
 * returns HTML SPA shell on testing.openelis-global.org — possibly a BUG-56
 * regression. Chain K should probe candidates in this order.
 */
export const FHIR_BASE_PATH_CANDIDATES = [
  '/api/OpenELIS-Global/fhir',
  '/fhir',
  '/hapi-fhir-jpaserver/fhir',
] as const;

// =============================================================================
// Admin config — endpoints that do NOT exist on testing v3.2.1.6 (REST)
// =============================================================================

/**
 * Spec bug #9: `/rest/SampleEntryConfigurationMenu` returns Spring 404.
 * The `eqaEnabled` toggle (Chain F precondition, Persona PF Step 4) is
 * only accessible via the JSP form at `/api/OpenELIS-Global/SampleEntryConfigurationMenu`.
 *
 * Specs that need eqaEnabled must drive the JSP form via Chrome
 * (Playwright `page.goto` + form interaction), not POST JSON.
 */
export const EQA_CONFIG_LIVES_AT_JSP_NOT_REST = true;

/**
 * `/rest/properties` returns `Record<string, string>` of JVM properties.
 * Does NOT contain per-row admin toggles (eqaEnabled, labName, etc.).
 * Useful for facility config like `org.openelisglobal.facility.city`.
 */
export interface PropertiesResponse {
  [key: string]: string;
}

// =============================================================================
// Site information (Struts form, not REST list)
// =============================================================================

/**
 * `/rest/SiteInformation` returns Struts form METADATA, not the list of
 * settings. Chain I's lookup-labName logic was wrong — the actual setting
 * list lives at a different path (probably the JSP page action). For now,
 * specs that need a specific site info value should look in `/rest/properties`
 * if it's a JVM-level setting, OR call the JSP page directly.
 */
export interface SiteInformationStrutsForm {
  formName: 'SiteInformationForm';
  formAction: 'SiteInformation';
  formMethod: 'POST';
  cancelAction: string;
  submitOnCancel: boolean;
  cancelMethod: string;
  paramName: string;
  description: string;
  value: string;
  encrypted: boolean;
  valueType: string;
  siteInfoDomainName: string;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Type guard for a successful patient search response. Use after every
 * `apiCall` to patient-search-results.
 */
export function isPatientSearchResponse(
  body: unknown
): body is PatientSearchResponse {
  return (
    typeof body === 'object' &&
    body !== null &&
    Array.isArray((body as PatientSearchResponse).patientSearchResults)
  );
}

/**
 * Extract the first matching patient or null. Encapsulates the
 * `patientSearchResults` / `patientID` / `nationalId` lookup.
 */
export function firstPatient(
  body: unknown,
  predicate: (p: PatientRecord) => boolean = () => true
): PatientRecord | null {
  if (!isPatientSearchResponse(body)) return null;
  return body.patientSearchResults.find(predicate) ?? null;
}

// =============================================================================
// Dashboard tile drill-down — captured live in A1-bis session 2026-05-13 mgdev v3.2.1.8
// =============================================================================

/**
 * The Dashboard tile click-to-expand fires a request to:
 *   GET /api/OpenELIS-Global/rest/home-dashboard/{TYPE}
 *
 * This is the canonical queue endpoint for §13 Y-RECON KPI-vs-list reconciliation.
 * The NEW-1 "Y-RECON mismatch" claim in the A1 pilot was retracted because the
 * original probe (LogbookResults) was the wrong endpoint. This is the right one.
 *
 * Verified: ORDERS_READY_FOR_VALIDATION returned 4 displayItems matching the
 * Dashboard KPI of 4 exactly. KPI = displayItems.length on a healthy instance.
 */
export interface DashboardDrillDownResponse {
  paging: {
    totalPages: string;
    currentPage: string;
    searchTermToPage: Array<{ id: string; value: string }>;
  };
  displayItems: DashboardDrillDownItem[];
}

export interface DashboardDrillDownItem {
  priority: 'ROUTINE' | 'ASAP' | 'STAT' | 'TIMED' | 'FUTURE_STAT' | string;
  /** dd/MM/yyyy */
  orderDate: string;
  /** Patient identifier (note: lowercase `Id`, matching the response — not patientID). */
  patientId: string;
  /** The accession number, e.g. "DEV01260000000000004". */
  labNumber: string;
  testName: string;
  countOfOrdersEntered: number;
  id: string;
  /** Lab section ID, e.g. "136" (Molecular Biology). Matches TestAdd.labUnitList. */
  testSection: string;
}

/**
 * Enum names captured live for the Dashboard tile drill-down URL. Most match
 * the Dashboard metric field names; a few don't (server-side enum differs).
 */
export const DASHBOARD_TILE_TYPES = {
  inProgress: 'ORDERS_IN_PROGRESS',
  readyForValidation: 'ORDERS_READY_FOR_VALIDATION',  // canonical — verified 4/4 match
  rejectedToday: 'ORDERS_REJECTED_TODAY',
  completedToday: 'ORDERS_COMPLETED_TODAY',
  enteredByUserToday: 'ORDERS_ENTERED_BY_USER_TODAY',
  unPrintedResults: 'UN_PRINTED_RESULTS',
  // 2026-05-13: these two return 400 — the server-side enum names are slightly different.
  // Capture from a real UI click before using:
  // partiallyCompletedToday: 'ORDERS_PARTIALLY_COMPLETED_TODAY' (NOT THIS — needs capture)
  // electronicOrders: 'ELECTRONIC_ORDERS' (NOT THIS — needs capture)
} as const;

// =============================================================================
// Dashboard tile types — v6.15 additions (A1-bis Session 2, 2026-05-13)
// =============================================================================
// Captured live via UI click + read_network_requests on mgdev v3.2.1.8.
// Three new enum values + one entirely-different shape for the metrics tile.

/**
 * NEW in v6.15. The original DASHBOARD_TILE_TYPES had `partiallyCompletedToday`
 * and `electronicOrders` as TODOs because the server-side enum names were
 * unknown. A1-bis Session 2 captured them and discovered surprises:
 *
 *   - "Partially Completed Today" tile → enum `ORDERS_PATIALLY_COMPLETED_TODAY`
 *     (sic — "PATIALLY" missing the R; server-side enum typo, not ours).
 *   - "Electronic Orders" tile → enum `INCOMING_ORDERS` (label-vs-enum mismatch).
 *   - "Average Turn Around time" tile → DIFFERENT URL pattern: kebab-case
 *     `turn-around-time-metrics`, and DIFFERENT response shape (see below).
 *   - "Delayed Turn Around" tile → standard envelope, enum `DELAYED_TURN_AROUND`.
 *
 * Spread the new entries onto the existing constant via a separate export
 * rather than mutating the original, so callers that already destructure the
 * original constant keep working. Use DASHBOARD_TILE_TYPES_V615 for new code.
 */
export const DASHBOARD_TILE_TYPES_V615 = {
  ...DASHBOARD_TILE_TYPES,
  /** Note: server enum is misspelled `PATIALLY`. Do not "fix" — that breaks the request. */
  partiallyCompletedToday: 'ORDERS_PATIALLY_COMPLETED_TODAY' as const,
  /** UI label says "Electronic Orders"; server enum says INCOMING_ORDERS. */
  electronicOrders: 'INCOMING_ORDERS' as const,
  /** Standard {paging, displayItems} envelope. */
  delayedTurnAround: 'DELAYED_TURN_AROUND' as const,
  /** SPECIAL — different URL shape AND different response shape. See TurnAroundTimeMetricsResponse. */
  turnAroundTimeMetrics: 'turn-around-time-metrics' as const,
} as const;

/**
 * `/rest/home-dashboard/turn-around-time-metrics` does NOT return the standard
 * `{paging, displayItems}` envelope. It returns three TAT numbers in minutes.
 *
 * §13 Y-RECON treatment: this endpoint is NOT comparable to its Dashboard KPI
 * via "list-length == count". The Dashboard's Average TAT value is the
 * `receptionToValidation` figure from this response. Compare scalar to scalar.
 */
export interface TurnAroundTimeMetricsResponse {
  receptionToValidation: number;
  receptionToResult: number;
  resultToValidation: number;
}

// =============================================================================
// SamplePatientEntry — v6.15 NEW (A1-bis Session 2, 2026-05-13)
// =============================================================================
// Captured live via fetch+XHR monkey-patch interceptor during a successful
// end-to-end 4-step Add Order wizard submission on mgdev v3.2.1.8.
//
// Outcome of the source capture: HTTP 200, order DEV01260000000000010 persisted.
// Patient: Mana Pi (patientPK 27). Test: Hemoglobin (id 15). Sample: Serum (id 2).
// Site: Test (id 142). Provider: Test Test (providerId 3 / personId 49).
//
// IMPORTANT: the body is HYBRID — top-level JSON wrapping a LITERAL XML STRING
// in `sampleXML` that carries the actual tests + sample fields. See
// buildSampleXML() below.
//
// Evidence: a1bis-sample-patient-entry-post-2026-05-13.json

export interface SamplePatientEntrySubmitPayload {
  rememberSiteAndRequester: boolean;
  currentDate: string | null;
  projects: unknown | null;
  customNotificationLogic: boolean;
  patientEmailNotificationTestIds: string[];
  patientSMSNotificationTestIds: string[];
  providerEmailNotificationTestIds: string[];
  providerSMSNotificationTestIds: string[];
  /** "NO_ACTION" for existing patient pass-through, "UPDATE" for edit, "CREATE" for new. */
  patientUpdateStatus: 'NO_ACTION' | 'UPDATE' | 'CREATE';
  referralItems: unknown[];
  referralOrganizations: unknown | null;
  referralReasons: unknown | null;
  sampleTypes: unknown | null;
  /** LITERAL XML STRING — see buildSampleXML(). Carries the actual tests, sample type, GPS, storage, etc. */
  sampleXML: string;
  patientProperties: PatientPropertiesPayload;
  patientSearch: unknown | null;
  patientEnhancedSearch: unknown | null;
  patientClinicalProperties: unknown | null;
  sampleOrderItems: SampleOrderItemsPayload;
  initialSampleConditionList: unknown[];
  sampleNatureList: unknown | null;
  testSectionList: unknown[];
  warning: boolean;
  useReferral: boolean;
  rejectReasonList: unknown | null;
}

export interface PatientPropertiesPayload {
  patientLastUpdated: string;  // "YYYY-MM-DD HH:MM:SS.mmm"
  personLastUpdated: string;
  patientPK: string;
  subjectNumber: string;
  nationalId: string;
  guid: string;
  lastName: string;
  firstName: string;
  aka: string;
  mothersName: string;
  mothersInitial: string;
  streetAddress: string;
  city: string;
  commune: string;
  addressDepartment: string;
  gender: 'M' | 'F' | '';
  /** dd/MM/yyyy */
  birthDateForDisplay: string;
  insuranceNumber: string;
  occupation: string;
  customNotes: string;
  targetDiseaseProgramme: string;
  primaryPhone: string;
  email: string;
  healthRegion: string;
  education: string;
  maritialStatus: string;          // sic — server spelling
  nationality: string;
  healthDistrict: string;
  otherNationality: string;
  patientContact: {
    lastupdated: number;
    id: string;
    patientId: string;
    person: { lastupdated: number; id: string; lastName: string; firstName: string; primaryPhone: string; email: string };
  };
  addressHierarchy: Record<string, unknown>;
  stnumber: string;
  patientUpdateStatus: 'NO_ACTION' | 'UPDATE' | 'CREATE';
}

export interface SampleOrderItemsPayload {
  newRequesterName: string;
  orderTypes: unknown[];
  orderType: string;
  externalOrderNumber: string;
  /** The accession, e.g. "DEV01260000000000010". Generated via /rest/SampleEntryGenerateScanProvider. */
  labNo: string;
  /** dd/MM/yyyy */
  requestDate: string;
  receivedDateForDisplay: string;
  /** hh:mm */
  receivedTime: string;
  nextVisitDate: string;
  requesterSampleID: string;
  referringPatientNumber: string;
  referringSiteId: string;
  referringSiteDepartmentId: string;
  referringSiteCode: string;
  referringSiteName: string;
  referringSiteDepartmentName: string;
  referringSiteList: unknown[];
  referringSiteDepartmentList: unknown[];
  providersList: unknown[];
  providerId: string;
  providerPersonId: string;
  providerFirstName: string;
  providerLastName: string;
  providerWorkPhone: string;
  providerFax: string;
  providerEmail: string;
  facilityAddressStreet: string;
  facilityAddressCommune: string;
  facilityPhone: string;
  facilityFax: string;
  paymentOptionSelection: string;
  paymentOptions: unknown[];
  modified: boolean;
  sampleId: string;
  readOnly: boolean;
  billingReferenceNumber: string;
  testLocationCode: string;
  otherLocationCode: string;
  testLocationCodeList: unknown[];
  program: string;
  programList: unknown[];
  contactTracingIndexName: string;
  contactTracingIndexRecordNumber: string;
  priorityList: unknown[];
  priority: 'ROUTINE' | 'ASAP' | 'STAT' | 'TIMED' | 'FUTURE_STAT' | string;
  programId: string;
  additionalQuestions: unknown | null;
  isEQASample: boolean;
  eqaProgramId: string;
  eqaProviderSampleId: string;
  eqaDeadline: string;
  eqaPriority: 'STANDARD' | 'PRIORITY' | string;
  consentGiven: boolean;
  consentFormReference: string;
  consentRecordedAt: string;
  consentRecordedBy: string;
}

export interface SampleXMLBuilderInput {
  /** Sample type id, e.g. "2" for Serum. */
  sampleTypeId: string;
  /** Collection date dd/MM/yyyy. */
  collectionDate: string;
  collectionTime?: string;
  collector?: string;
  quantity?: string;
  uom?: string;
  /** Comma-separated test ids, e.g. "15" for Hemoglobin alone, "15,16,17" for multiple. */
  tests: string;
  testSectionMap?: string;
  testSampleTypeMap?: string;
  panels?: string;
  rejected?: boolean;
  rejectReasonId?: string;
  initialConditionIds?: string;
  storageLocationId?: string;
  storageLocationType?: string;
  storagePositionCoordinate?: string;
  gpsLatitude?: string;
  gpsLongitude?: string;
  gpsAccuracy?: string;
  gpsCaptureMethod?: string;
  collectionMethod?: string;
  sampleTemperature?: string;
  specimenOrigin?: string;
  numOrderLabels?: number;
  numSpecimenLabels?: number;
}

/**
 * Build the `sampleXML` string for the SamplePatientEntry POST. Captured live
 * format; do NOT change attribute names or order without re-verifying via a
 * fresh UI capture.
 */
export function buildSampleXML(input: SampleXMLBuilderInput): string {
  const a = {
    sampleID: input.sampleTypeId,
    date: input.collectionDate,
    time: input.collectionTime ?? '',
    collector: input.collector ?? '',
    quantity: input.quantity ?? '',
    uom: input.uom ?? '',
    tests: input.tests,
    testSectionMap: input.testSectionMap ?? '',
    testSampleTypeMap: input.testSampleTypeMap ?? '',
    panels: input.panels ?? '',
    rejected: String(input.rejected ?? false),
    rejectReasonId: input.rejectReasonId ?? '',
    initialConditionIds: input.initialConditionIds ?? '',
    storageLocationId: input.storageLocationId ?? '',
    storageLocationType: input.storageLocationType ?? '',
    storagePositionCoordinate: input.storagePositionCoordinate ?? '',
    gpsLatitude: input.gpsLatitude ?? '',
    gpsLongitude: input.gpsLongitude ?? '',
    gpsAccuracy: input.gpsAccuracy ?? '',
    gpsCaptureMethod: input.gpsCaptureMethod ?? '',
    collectionMethod: input.collectionMethod ?? '',
    sampleTemperature: input.sampleTemperature ?? '',
    specimenOrigin: input.specimenOrigin ?? '',
    numOrderLabels: String(input.numOrderLabels ?? 1),
    numSpecimenLabels: String(input.numSpecimenLabels ?? 1),
  };
  const attrs = Object.entries(a).map(([k, v]) => `${k}='${v}'`).join(' ');
  return `<?xml version="1.0" encoding="utf-8"?><samples><sample ${attrs}/></samples>`;
}

// =============================================================================
// Configuration properties — v6.15 NEW (A1-bis Session 2, 2026-05-13)
// =============================================================================
// On v3.2.1.8 the JSP page `/api/OpenELIS-Global/SampleEntryConfigurationMenu`
// is GONE (404). The toggles moved to REST.
//
//   GET  /api/OpenELIS-Global/rest/configuration-properties  → 200 (read)
//   PUT  /api/OpenELIS-Global/rest/configuration-properties  → 403 for non-admin
//   POST/PUT variants on /configuration-property              → 403 for non-admin
//
// Write requires SYSTEM_ADMIN (or equivalent). The 403 (not 404) confirms
// the route exists. Capture the canonical write shape from a SYSTEM_ADMIN
// session in a future A1-bis pass.

export interface ConfigurationPropertiesResponse {
  // Keys captured live on mgdev v3.2.1.8. There are 36 total; common ones below.
  // Values are STRINGS even for booleans (e.g. "true", "false").
  EQA_ENABLED: string;
  GPS_ENABLED: string;
  ACCEPT_EXTERNAL_ORDERS: string;
  REQUIRE_LAB_UNIT_AT_LOGIN: string;
  ENABLE_CLIENT_REGISTRY: string;
  ALERT_FOR_INVALID_RESULTS: string;
  AUTOFILL_COLLECTION_DATE: string;
  NEXT_VISIT_DATE_ON_WORKPLAN: string;
  USE_NEW_ADDRESS_HIERARCHY: string;
  USE_ALPHANUM_ACCESSION_PREFIX: string;
  ACCESSION_NUMBER_VALIDATE: string;
  useOauth: string;
  useSaml: string;
  useFormLogin: string;
  AccessionFormat: string;
  BANNER_TEXT: string;
  DEFAULT_PAGE_SIZE: string;
  DEFAULT_NATIONALITY: string;
  PHONE_FORMAT: string;
  LAST_NAME_REGEX: string;
  FIRST_NAME_REGEX: string;
  GPS_TIMEOUT_SECONDS: string;
  GPS_ACCURACY_METERS: string;
  currentDateAsText: string;
  currentTimeAsText: string;
  configurationName: string;
  studyManagementTab: string;
  // ... permit additional unknown keys for forward-compat
  [key: string]: string;
}


// =============================================================================
// CSRF helper — v6.16 (B-session, 2026-05-14)
// =============================================================================
// CRITICAL: in v6.15 we documented configuration-properties writes as 403 due
// to permission. B-session corrected the diagnosis: the 403 is actually CSRF.
// The OpenELIS app uses `X-CSRF-TOKEN` header sourced from `localStorage['CSRF']`,
// NOT the XSRF-TOKEN cookie.
//
// Response body `{"status":403,"message":"CSRF token missing or invalid"}` is
// the unique CSRF-failure signature. With the correct header, the request crosses
// the gate and either succeeds (200) or fails for the correct reason (405, 404,
// or business-logic 4xx).

/**
 * Browser-side: read the CSRF token. In Playwright, use the saved storage state
 * to read localStorage; in JS-injection contexts, use this directly.
 */
export function getCSRFTokenFromLocalStorage(): string {
  if (typeof localStorage === 'undefined') return '';
  return localStorage.getItem('CSRF') || '';
}

/**
 * Wrap fetch with the required CSRF header. Always use this for non-GET in
 * tests/chains/_common.ts and any custom probe code.
 */
export async function csrfFetch(input: RequestInfo, init: RequestInit = {}): Promise<Response> {
  const csrf = getCSRFTokenFromLocalStorage();
  const method = (init.method || 'GET').toUpperCase();
  const headers = new Headers(init.headers || {});
  if (method !== 'GET' && !headers.has('X-CSRF-TOKEN')) {
    headers.set('X-CSRF-TOKEN', csrf);
  }
  if (method !== 'GET' && !headers.has('Content-Type') && init.body && typeof init.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(input, { ...init, headers, credentials: 'include' });
}

// =============================================================================
// LogbookResults — v6.16 (B-session, 2026-05-14)
// =============================================================================
// Captured GET shape live on mgdev v3.2.1.8. The same URL serves BOTH:
//   GET  /api/OpenELIS-Global/rest/LogbookResults?<filters>  → result-entry queue
//   POST /api/OpenELIS-Global/rest/LogbookResults             → save entered results
//
// Filter params (all observed live):
//   labNumber, upperRangeAccessionNumber, patientPK, testSectionId,
//   collectionDate, recievedDate (sic — server typo), selectedTest,
//   selectedSampleStatus, selectedAnalysisStatus, doRange, finished

export interface LogbookResultsResponse {
  formName: string;          // 'AccessionMenuForm' etc.
  formMethod: string;        // 'POST'
  cancelAction: string;
  submitOnCancel: boolean;
  cancelMethod: string;
  paging: { totalPages: string; currentPage: string; searchTermToPage?: Array<{ id: string; value: string }> };
  accessionNumber: string;
  singlePatient: boolean;
  currentDate: string;
  displayTestMethod: boolean;
  displayTestKit: boolean;
  testResult: LogbookTestResult[];
  hivKits: unknown[];
  syphilisKits: unknown[];
  type: string;
  displayMethods: boolean;
  testSectionId: string;
  displayTestSections: boolean;
  searchByRange: boolean;
  searchFinished: boolean;
}

export interface LogbookTestResult {
  /** Internal analysis ID for this row. */
  analysisId: string;
  /** "MANUAL" | "ANALYZER_NAME" — the result-entry method. */
  analysisMethod: string;
  /** Status enum: "15" = Ready For Validation, "6" = Validated (other values TBD). */
  analysisStatusId: string;
  childReflex: boolean;
  dictionaryResults: unknown[];
  displayResultAsLog: boolean;
  eqaSample: boolean;
  failedValidation: boolean;
  hasQualifiedResult: boolean;
  /** Critical high cutoff. */
  higherCritical: number | 'Infinity';
  isGroupSeparator: boolean;
  isModified: boolean;
  /** Critical low cutoff. */
  lowerCritical: number | 'Infinity';
  /** Normal range low. */
  lowerNormalRange: number;
  /** Normal range high. */
  upperNormalRange: number;
  /** Abnormal range low/high — when result is outside, but not critical. */
  lowerAbnormalRange: number;
  upperAbnormalRange: number;
  methods: unknown[];
  multiSelectResultValues: string;       // JSON-as-string, e.g. "{}"
  nationalId: string;
  nonconforming: boolean;
  normal: boolean;
  /** Display format "12.00 - 16.00". */
  normalRange: string;
  notIncludedInWorkplan: boolean;
  patientId: string;                     // LIMS patientPK
  /** Display string "12345, F, 12/03/1999". */
  patientInfo: string;
  patientName: string;                   // "Lastname, Firstname"
  qualifiedResultValue: string;
  readOnly: boolean;
  receivedDate: string;                  // dd/MM/yyyy
  refer: boolean;
  referralCanceled: boolean;
  referredOut: boolean;
  reflexGroup: boolean;
  reflexParentGroup: number;
  rejected: boolean;
  remove: string;                        // "no" | "yes"
  reportable: string;                    // "Y" | "N"
  /** Embedded result reference info (only when a result exists). */
  result: { id: string; fhirUuidAsString: string; grouping: number; isActive: string; significantDigits: number };
  resultDisplayType: 'TEXT' | 'NUMERIC' | 'DICTIONARY' | string;
  resultFile: Record<string, unknown>;
  resultId: string;
  resultLimitId: string;
  resultType: 'N' | 'T' | 'D' | string;
  /** The entered result value as a string. */
  resultValue: string;
  resultValueLog: string;
  sampleGroupingNumber: number;
  /** External accession suffix, e.g. "DEV01260000000000010-1". */
  sampleItemExternalId: string;
  sampleItemId: string;
  sampleType: string;                    // "Serum", "Whole Blood", etc.
  sequenceNumber: string;
  servingAsTestGroupIdentifier: boolean;
  shadowReferredOut: boolean;
  shadowRejected: boolean;
  shadowResultValue: string;
  showSampleDetails: boolean;
  significantDigits: number;
  technician: string;
  technicianSignatureId: string;
  /** "dd/MM/yyyy HH:mm" */
  testDate: string;
  testId: string;
  testKitInactive: boolean;
  testMethod: string;
  /** Display name, e.g. "Hemoglobin(Whole Blood)". */
  testName: string;
  testSortOrder: string;
  unitsOfMeasure: string;
  userChoiceReflex: boolean;
  valid: boolean;
  positive?: boolean;                    // present on some result types
  // accessionNumber may appear here too but is also on top-level
}

/** Known analysis status enum mappings observed live. Extend as more states discovered. */
export const ANALYSIS_STATUS_IDS = {
  // 14 = Result Entered (Awaiting Validation)? — TBD; needs explicit capture
  // 15 = Ready For Validation (after Save on Results)
  READY_FOR_VALIDATION: '15' as const,
  // 6 = Validated (after Save on Validation)
  VALIDATED: '6' as const,
  // Other values exist; capture per state transition.
} as const;

// =============================================================================
// AccessionValidation — v6.16 (B-session, 2026-05-14)
// =============================================================================
// Captured live on mgdev v3.2.1.8. The validation queue endpoint, used by
// Validation > Routine (after picking a Test Unit), Validation > By Order, etc.
//
//   GET  /api/OpenELIS-Global/rest/AccessionValidation?accessionNumber=&unitType=N&date=&doRange=true
//   POST /api/OpenELIS-Global/rest/AccessionValidation
//
// Filter params: accessionNumber, unitType (integer lab unit ID — see LAB_UNIT_IDS),
// date (dd/MM/yyyy), doRange (true|false).

export interface AccessionValidationResponse {
  formName: string;
  formMethod: string;
  cancelAction: string;
  submitOnCancel: boolean;
  cancelMethod: string;
  searchFinished: boolean;
  paging: { totalPages: string; currentPage: string; searchTermToPage?: Array<{ id: string; value: string }> };
  currentDate: string;
  resultList: ValidationResultRow[];
  testSection: string;
  accessionNumber: string;
  testDate: string;
  testName: string;
  testSections: string[];                // ordered list of section IDs
  testSectionsByName: Record<string, unknown>;
  testSectionId: string;
  displayTestSections: boolean;
}

export interface ValidationResultRow {
  units: string;                         // "g/dl ( 12.00-16.00 )" — value WITH range
  testName: string;
  accessionNumber: string;
  patientName: string;
  patientInfo: string;
  /** The result value as a string. */
  result: string;
  /** Whether this row has been validated (Save checked + saved). */
  isAccepted: boolean;
  /** Whether this row has been marked for retest. */
  isRejected: boolean;
  sampleIsAccepted: boolean;
  sampleIsRejected: boolean;
  analysisId: string;
  testId: string;
  resultId: string;
  lowerCritical: number | 'Infinity';
  higherCritical: number;
  normalRange: string;
  resultType: 'N' | 'T' | 'D' | string;
  isHighlighted: boolean;
  testSortNumber: string;
  displayResultAsLog: boolean;
  showAcceptReject: boolean;
  dictionaryResults: unknown[];
  readOnly: boolean;
  nonconforming: boolean;
  hasQualifiedResult: boolean;
  significantDigits: number;
  valid: boolean;
  normal: boolean;
  manual: boolean;
  reflexGroup: boolean;
  childReflex: boolean;
  positive: boolean;
}

// =============================================================================
// FHIR — v6.16 (B-session, 2026-05-14) — KNOWN BROKEN ON mgdev v3.2.1.8
// =============================================================================
// The B-session discovered 4 FHIR bugs:
//   1. /fhir/metadata returns 500 (upstream proxy URL has double-slash)
//   2. /fhir/Patient/{id} returns 404 (patients not synced to upstream FHIR)
//   3. /fhir/Observation returns 200 but with 151KB of internal HAPI Java
//      domain model (formatCommentsPre, idElement.idElement.idElement...
//      recursive) — Jackson dumping the internal DOM instead of invoking
//      the FHIR JSON parser.
//   4. application/fhir+json Accept header rejected with 406 — only
//      application/json works (FHIR R4 spec compliance failure).
//
// Chain K is BLOCKED end-to-end on mgdev until these are fixed upstream.
// The FHIR module maturity is M0-M1 (corrected from a previously-wrong M3
// rating that was based only on a CapabilityStatement check).

/**
 * To call FHIR endpoints on mgdev v3.2.1.8, use this helper. It works around
 * FHIR-4 by sending application/json instead of application/fhir+json. The
 * response will be FHIR-3-broken HAPI internals JSON, NOT valid FHIR JSON.
 */
export async function brokenFhirFetch(path: string): Promise<unknown> {
  const r = await fetch(path, { credentials: 'include', headers: { 'Accept': 'application/json' } });
  return r.json();
}


// =============================================================================
// Reports / ReportPrint — v6.17 (B-session follow-up, 2026-05-14)
// =============================================================================
// IMPORTANT METHODOLOGY NOTE: the Report module endpoints are NOT under /rest/.
// All probes against /rest/ReportPrint etc. return 404 or 405. The canonical
// URL is /api/OpenELIS-Global/ReportPrint (no /rest/ segment) — a Struts-style
// JSP-mapped servlet, not a REST controller.
//
// Verified live on mgdev v3.2.1.8: Generate Printable Version on Patient Status
// Report opens a new tab to this URL and returns a fully-rendered PDF with
// patient demographics, lab number, validated result, normal range, etc.
//
// Query params observed (all in URL, not body — GET, not POST):
//   report               — the report template name, e.g. "patientCILNSP_vreduit"
//   type                 — "patient" | "site" | (others TBD)
//   accessionDirect      — the lab number (single-order mode)
//   highAccessionDirect  — upper-bound lab number for range mode (empty for single)
//   dateOfBirthSearchValue — optional DOB filter
//   selPatient           — optional patient PK
//   referringSiteId      — optional site filter
//   referringSiteDepartmentId — optional dept filter
//   onlyResults          — "true" | "false"
//   _onlyResults         — "on" (Spring form-checkbox convention)
//   dateType             — "RESULT_DATE" | "ORDER_DATE" | (others TBD)
//   lowerDateRange       — dd/MM/yyyy or empty
//   upperDateRange       — dd/MM/yyyy or empty

export interface ReportPrintQuery {
  report: string;                        // template name
  type: 'patient' | 'site' | string;
  accessionDirect?: string;
  highAccessionDirect?: string;
  dateOfBirthSearchValue?: string;
  selPatient?: string;
  referringSiteId?: string;
  referringSiteDepartmentId?: string;
  onlyResults?: boolean;
  dateType?: 'RESULT_DATE' | 'ORDER_DATE' | string;
  lowerDateRange?: string;               // dd/MM/yyyy
  upperDateRange?: string;
}

/**
 * Build the URL for the Patient Status Report PDF endpoint. The endpoint is
 * GET-only, opens a PDF directly in the browser, and is NOT under /rest/.
 */
export function buildReportPrintURL(q: ReportPrintQuery): string {
  const params = new URLSearchParams();
  params.set('report', q.report);
  params.set('type', q.type);
  if (q.accessionDirect) params.set('accessionDirect', q.accessionDirect);
  params.set('highAccessionDirect', q.highAccessionDirect ?? '');
  params.set('dateOfBirthSearchValue', q.dateOfBirthSearchValue ?? '');
  params.set('selPatient', q.selPatient ?? '');
  params.set('referringSiteId', q.referringSiteId ?? '');
  params.set('referringSiteDepartmentId', q.referringSiteDepartmentId ?? '');
  params.set('onlyResults', String(q.onlyResults ?? false));
  params.set('_onlyResults', 'on');
  params.set('dateType', q.dateType ?? 'RESULT_DATE');
  params.set('lowerDateRange', q.lowerDateRange ?? '');
  params.set('upperDateRange', q.upperDateRange ?? '');
  return `/api/OpenELIS-Global/ReportPrint?${params.toString()}`;
}

/** Known report template names captured live. Extend as more reports are tested. */
export const REPORT_TEMPLATES = {
  /** mgdev default patient status report (Madagascar CILNSP variant). */
  patientStatusReport_mgdev: 'patientCILNSP_vreduit' as const,
  // Add more as captured: hivTestSummary, statisticsReport, rejectionReport, etc.
} as const;

// =============================================================================
// Lab Number uniqueness — v6.17 (Chain L)
// =============================================================================
// POSTing a SamplePatientEntry with a labNo that already exists returns HTTP 400
// with body { fieldErrors: [], error: "Validation failed" }.
//
// Methodology caveat: the error shape is GENERIC — fieldErrors is empty even
// though the rejection IS field-specific. Clients cannot distinguish a
// duplicate-lab-number violation from any other validation failure. Filed as
// a usability bug candidate.

export interface SamplePatientEntryValidationError {
  fieldErrors: Array<{ field?: string; message?: string }>;  // observed empty
  error: string;                                              // observed "Validation failed"
}

