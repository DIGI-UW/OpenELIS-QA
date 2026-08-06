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
  /** Java enum PatientUpdateStatus. "ADD" = NEW patient (verified live on indonesiademo
   * demo-silnas v3.2.1.10, 2026-06-20, from a real Add Order submit); "UPDATE" = edit;
   * "NO_ACTION" = existing pass-through. NOTE: "CREATE" is NOT a valid enum member — sending it
   * throws HttpMessageNotReadableException (generic 400) since Jackson cannot deserialize it. */
  patientUpdateStatus: 'ADD' | 'NO_ACTION' | 'UPDATE';
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
  patientUpdateStatus: 'ADD' | 'NO_ACTION' | 'UPDATE';
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


// =============================================================================
// FHIR — v6.18 CORRECTIONS to v6.16 (Revalidation, 2026-05-14)
// =============================================================================
// v6.16 documented "FHIR-2: /fhir/Patient/N 404 — patients not synced." That
// claim is RETRACTED. Revalidation showed:
//
//   GET /fhir/Patient/{guid}           → 200, full Patient resource
//   GET /fhir/Patient?identifier={N}   → 200, Bundle wrapping the Patient
//   GET /fhir/Patient?_id={N}          → 200, Bundle
//   GET /fhir/Patient/{N}              → 404 (because the FHIR Resource ID is
//                                          the guid, NOT the LIMS patientPK)
//
// The 404 on /Patient/{N} is correct REST behavior — the resource doesn't
// exist at that path. The bug was my misunderstanding of the FHIR ID space.
//
// CORRECT WAY to look up a LIMS patient via FHIR:
//   1. Read the LIMS patient to get its `guid` (from patient-search-results
//      response or PatientPropertiesPayload.guid).
//   2. Fetch /fhir/Patient/{guid} for direct resource access.
//   3. Or fetch /fhir/Patient?identifier={nationalId} for search by identifier.
//
// FHIR-1 (metadata 500), FHIR-3 (Observation 151KB internal dump), and
// FHIR-4 (application/fhir+json 406) all remain real bugs — confirmed by
// repeat probes during revalidation.

export interface FHIRLookup {
  /** Patient resource ID is the LIMS patient's guid, not its patientPK. */
  patientResourcePath: (guid: string) => string;
  /** Search by national ID returns a Bundle wrapping the patient(s). */
  patientSearchByIdentifier: (identifier: string) => string;
}

export const FHIR_LOOKUP: FHIRLookup = {
  patientResourcePath: (guid) => `/api/OpenELIS-Global/rest/fhir/Patient/${guid}`,
  patientSearchByIdentifier: (identifier) => `/api/OpenELIS-Global/rest/fhir/Patient?identifier=${encodeURIComponent(identifier)}`,
};

// =============================================================================
// Validation error shape — v6.18 REFINED (Revalidation, 2026-05-14)
// =============================================================================
// v6.16/v6.17 claimed "validation error shape is too generic — empty fieldErrors".
// Revalidation refined this:
//
//   Bean Validation annotations (@NotBlank, @Pattern, etc.) DO populate
//   fieldErrors with field name + defaultMessage:
//     POST { sampleOrderItems.labNo: '' }
//       → 400 { fieldErrors: [{ field: 'sampleOrderItems.labNo',
//                              defaultMessage: 'must not be blank' }],
//               error: 'sampleOrderItems.labNo: must not be blank' }
//
//     POST { sampleOrderItems.labNo: 'BAD_FORMAT' }
//       → 400 { fieldErrors: [{ field: 'sampleOrderItems.labNo',
//                              defaultMessage: 'Invalid accession number format' }],
//               error: 'sampleOrderItems.labNo: Invalid accession number format' }
//
//   Service-layer business validations (uniqueness, missing FK, etc.) DO NOT
//   populate fieldErrors — they fall through to the generic shape:
//     POST { sampleOrderItems.labNo: <duplicate> }
//       → 400 { fieldErrors: [], error: 'Validation failed' }
//
//     POST { sampleOrderItems.referringSiteId: '' }
//       → 400 { fieldErrors: [], error: 'Validation failed' }
//
//   Empty body causes a different bug entirely:
//     POST {}  (totally empty body)
//       → 500 "Check server logs"  ← info-leak bug, separate Jira

export interface SamplePatientEntryAnnotationError {
  fieldErrors: Array<{ field: string; defaultMessage: string }>;
  /** Concatenated "field: message" string. */
  error: string;
}

export interface SamplePatientEntryServiceLayerError {
  /** Empty array — service-layer validations don't populate this. */
  fieldErrors: [];
  /** Always the literal string "Validation failed". */
  error: 'Validation failed';
}


// =============================================================================
// NCE (Non-Conforming Event) — v6.21 (Chain B Discovery, 2026-05-23)
// =============================================================================
// Manual NCE filing (separate from sample-rejection-at-order-entry, which
// uses sampleXML rejected='true').
//
// Endpoints discovered live on mgdev v3.2.1.8 by navigating to the Report
// Non-Conforming Event React page (/ReportNonConformingEvent):
//
//   GET /api/OpenELIS-Global/rest/nce/categories         → 200, returns NceCategory[]
//   GET /api/OpenELIS-Global/rest/nce/generate-number    → 200, returns {nceNumber}
//   POST /api/OpenELIS-Global/rest/nce (TBD — submit form not yet captured)
//   GET /api/OpenELIS-Global/rest/displayList/TEST_SECTION_ACTIVE → 200 (for Reporting Unit dropdown)
//
// NOT MAPPED yet (defer to next session):
//   - The POST body shape on form submit
//   - Whether the form auto-links to a sample (Affected Samples section is below the fold)
//   - The NCE Dashboard listing endpoint (presumably /rest/nce or similar)
//
// The form has 3+ sections: Reporter & Event Context, Classification, Details.
// Severity is a 3-tile picker (Critical/Major/Minor) with descriptive labels.
// Reporter Name defaults to "Open ELIS"; Date of Event defaults to today.

export interface NceCategory {
  id: string;                                // numeric string e.g. "1"
  name: string;                              // e.g. "General"
  types: NceType[];                          // subcategories
}

export interface NceType {
  id: string;                                // numeric string
  name: string;                              // e.g. "Documentation error", "Employee concern"
}

export interface NceGenerateNumberResponse {
  /** Auto-generated NCE identifier in format "NCE-YYYY-NNNNN" (year, 5-digit sequence). */
  nceNumber: string;
}

export interface NceFormState {
  // Section 01 — Reporter & Event Context
  nceNumber: string;                         // auto from generate-number
  reporterName: string;                      // defaults to "Open ELIS"
  dateOfEvent: string;                       // ISO date, defaults to today
  reportingUnit: string;                     // TEST_SECTION_ACTIVE id
  // Section 02 — Classification
  category: string;                          // NceCategory.id
  subcategory: string;                       // NceType.id (nested under selected category)
  severity: 'Critical' | 'Major' | 'Minor';
  // Section 03 — Details (full structure TBD; needs scroll capture)
  description?: string;
  affectedSamples?: string[];                // Lab numbers like "DEV01260000000000015"
}

// =============================================================================
// Dashboard Y-RECON validation — v6.21 (2026-05-23)
// =============================================================================
// Y-RECON math from v6.14 confirmed on mgdev v3.2.1.8: for every queue-type
// Dashboard tile, the KPI counter shown on the Dashboard exactly matches the
// length of the displayItems array returned by the drill-down endpoint.
//
// Verified 10/10 tiles (2026-05-23):
//   In Progress (3=3), Ready For Validation (4=4), Orders Completed Today (0=0),
//   Partially Completed Today (0=0), Orders Entered By Users Today (0=0),
//   Orders Rejected Today (0=0), Unprinted Results Today (0=0),
//   Electronic Orders/INCOMING_ORDERS (0=0), Delayed Turn Around (0=0).
//   Plus the metrics tile: Average Turn Around time → turn-around-time-metrics
//   {receptionToValidation: 0} matches the displayed "0".
//
// The Y-RECON test should always pass on a healthy instance; a failure
// indicates either data divergence or a tile-to-endpoint mapping bug.


// =============================================================================
// v6.22 — Session, authorization signals, and user creation
// Captured live on testing.openelis-global.org v3.2.1.11 (2026-07-30) during the
// role-scoped RBAC suite build-out (rbac.config.ts). Every item here replaced an
// inferred value that was wrong — §6.5b in action.
// =============================================================================

/**
 * Current-session endpoint. NOTE THE PATH: it is NOT under `/rest`.
 * `/rest/session` → 404 NoHandlerFoundException. The frontend fetches
 * `config.serverBaseUrl + "/session"` (see App.jsx getUserSessionDetails).
 *
 * This is the canonical identity check for any multi-user / role-scoped spec:
 * it is the ONLY cheap way to prove which user a storage state actually belongs
 * to. A "scoped" run on a stale .auth file silently probes as admin and
 * false-PASSes every deny assertion.
 */
export const SESSION_ENDPOINT = '/api/OpenELIS-Global/session';

/** Live-verified response shape of GET /api/OpenELIS-Global/session. */
export interface SessionResponse {
  authenticated: boolean;
  loginMethod: 'FORM' | 'SAML' | 'OAUTH' | string;
  sessionId: string;
  /** SystemUser PK as a string, e.g. "113". */
  userId: string;
  loginName: string;
  firstName: string;
  lastName: string;
  /** GLOBAL role names, e.g. ["Global Administrator"]. Bench roles appear below. */
  roles: string[];
  /**
   * Lab-unit roles keyed by test-section id, or the literal "AllLabUnits" when
   * the role was granted across all units.
   * e.g. {"AllLabUnits":["Reception"]} or {"36":["Results"]}.
   */
  userLabRolesMap: Record<string, string[]>;
  /** Same token as localStorage['CSRF']. */
  csrf: string;
}

/**
 * AUTHORIZATION DENIAL SIGNALS — do not assume 403.
 *
 * 1. REST: an unauthorized call returns **HTTP 401**, not 403, even with a
 *    perfectly live session. Verified: a Reception-only user calling
 *    /rest/UnifiedSystemUser gets 401 while GET /session still returns
 *    authenticated:true for that same context.
 *
 *    Consequence for Chain H (§11, Step 3): its "401 = ambiguous session issue"
 *    branch is wrong on this build. Disambiguate instead — re-check /session; if
 *    still authenticated as the expected user, a 401 IS the deny verdict.
 *
 * 2. SPA admin routes: render an in-page "Access Denied" (HTTP 200).
 *
 * 3. Legacy JSP surfaces: **redirect to `Home?access=denied` with HTTP 200**.
 *    Classify by the URL query param, not the status code. Note the legacy JSP
 *    layer runs a separate auth system (§6.4), so its verdict can differ from
 *    the SPA's for the same nominal permission.
 */
export const DENY_SIGNALS = {
  restStatus: 401 as const,
  spaBodyPattern: /not authorized|access denied|forbidden|insufficient/i,
  jspRedirectPattern: /access[=_-]denied/i,
} as const;

/**
 * USER CREATION — corrects the long-standing "BUG-3: UserCreate POST 500".
 *
 * Two SEPARATE things were conflated under "BUG-3", and this block only
 * settles the first:
 *
 * (1) PAYLOAD SHAPE — settled. `POST /rest/UnifiedSystemUser` accepts the exact
 *     `UnifiedSystemUserForm` shape below; verified 2026-07-30 00:39Z on testing
 *     v3.2.1.11 by creating qa_probe_shape, qa_recept, qa_labtech and
 *     qa_validator, all of which then authenticated and ran the full RBAC matrix.
 *     The old payload never could have worked (see the 400 note below).
 *
 * (2) A SEPARATE SERVER-SIDE 500 — open. From ~01:29Z the same day, the same
 *     instance began returning HTTP 500 {"error":"Internal Server Error"} to
 *     EVERY create, including the byte-identical body that had just succeeded.
 *     Ruled out by probe (12 payload variants): login-name length, underscores
 *     in names, AllLabUnits vs section-keyed role maps, no-roles-at-all,
 *     global-role-only, and initials collisions (createSystemUser derives
 *     initials from firstName[0]+lastName[0] — novel initials 500 too).
 *     Instance data and version were unchanged (dashboard 139/6, v3.2.1.11) and
 *     admin plus all three seeded users still authenticate, so it is not a reset.
 *     Cause needs server logs. PRACTICAL RULE: do not read a 500 here as a
 *     payload defect, and do not build a spec that depends on creating users —
 *     reuse pre-seeded role users (Chain H Step 1 does this now).
 *
 * Two distinct historic failures, two distinct causes:
 *  - **400 HttpMessageNotReadableException** — the old payload
 *    ({loginName, password, firstName, lastName, systemRoles, active}) does not
 *    match the form at all, so Jackson cannot deserialize it. It never could.
 *  - **500 Internal Server Error** — sending `loginUserId: '0'` /
 *    `systemUserId: '0'`. The controller decides new-vs-existing with
 *    `isBlankOrNull(loginUserId)`, so '0' is treated as an EXISTING id and
 *    `loginService.get(0)` NPEs. **Blank strings mean "new".**
 *
 * Also note: BOTH success and validation-failure return **HTTP 200**.
 * Discriminate on the response body:
 *   success → {forward: "redirect:/UnifiedSystemUser"}
 *   failure → {forward: "unifiedSystemUserDefinition"}
 *
 * Role ids are per-instance — resolve them from the GET preform
 * (`globalRoles` / `labUnitRoles`), never hard-code. Bench roles are LAB-UNIT
 * roles and go in `selectedTestSectionLabUnits`, NOT `selectedRoles`.
 * Observed on testing: labUnitRoles Reception=4, Results=5, Reports=7,
 * Validation=10; globalRoles Global Administrator=1, User Account Admin=2.
 */
export interface UnifiedSystemUserCreateBody {
  /** MUST be '' for a new user. '0' → server 500. */
  loginUserId: '';
  /** MUST be '' for a new user. */
  systemUserId: '';
  userLoginName: string;
  userPassword: string;
  confirmPassword: string;
  userFirstName: string;
  userLastName: string;
  /** @NotBlank @ValidDate(FUTURE), dd/MM/yyyy. */
  expirationDate: string;
  accountLocked: 'Y' | 'N';
  accountDisabled: 'Y' | 'N';
  accountActive: 'Y' | 'N';
  /** Numeric string, must parse to 1..600. */
  timeout: string;
  /** GLOBAL role ids only. */
  selectedRoles: string[];
  testSectionId: string;
  selectedLabUnitRoles: string[];
  /** Lab-unit roles: {testSectionId | 'AllLabUnits': [roleId]}. */
  selectedTestSectionLabUnits: Record<string, string[]>;
  systemUserIdToCopy: string;
  allowCopyUserRoles: 'Y' | 'N';
}

/** Build a valid create body. Pass a role id resolved from the GET preform. */
export function buildUserCreateBody(opts: {
  loginName: string;
  password: string;
  firstName?: string;
  lastName?: string;
  /** Lab-unit role id (e.g. '4' Reception) — the common case for bench users. */
  labUnitRoleId?: string;
  /** Test-section id to scope to; omit for all units. */
  testSectionId?: string;
  /** Global role ids (e.g. ['1'] Global Administrator). */
  globalRoleIds?: string[];
  /** dd/MM/yyyy in the future; defaults to +5 years. */
  expirationDate?: string;
}): UnifiedSystemUserCreateBody {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 5);
  const expiry =
    opts.expirationDate ??
    `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  return {
    loginUserId: '',
    systemUserId: '',
    userLoginName: opts.loginName,
    userPassword: opts.password,
    confirmPassword: opts.password,
    userFirstName: opts.firstName ?? 'QA',
    userLastName: opts.lastName ?? 'Auto',
    expirationDate: expiry,
    accountLocked: 'N',
    accountDisabled: 'N',
    accountActive: 'Y',
    timeout: '480',
    selectedRoles: opts.globalRoleIds ?? [],
    testSectionId: '',
    selectedLabUnitRoles: [],
    selectedTestSectionLabUnits: opts.labUnitRoleId
      ? { [opts.testSectionId ?? 'AllLabUnits']: [opts.labUnitRoleId] }
      : {},
    systemUserIdToCopy: '',
    allowCopyUserRoles: 'N',
  };
}

/** True when a UnifiedSystemUser POST actually persisted (both cases are 200). */
export function userCreateSucceeded(body: unknown): boolean {
  const f = (body && typeof body === 'object' ? (body as { forward?: string }).forward : '') ?? '';
  return /redirect:\/UnifiedSystemUser/.test(f);
}

/**
 * PLAYWRIGHT GOTCHA (not an OpenELIS fact, but it cost a debugging cycle):
 * `locator.isVisible({ timeout })` does NOT wait — it returns the current state
 * immediately, so it races the SPA render and reports a false negative. For
 * "did login succeed?", poll SESSION_ENDPOINT instead of probing the DOM.
 */
export const ISVISIBLE_DOES_NOT_WAIT = true;

// =============================================================================
// v6.23 — Persona write paths: patient create + validation save
// Captured 2026-07-31 on testing v3.2.1.11: endpoints read out of the frontend
// source (CreatePatientForm.tsx, Validation.jsx), then each POST verified live
// with a round-trip. Replaces two invented shapes in the persona specs.
// =============================================================================

/**
 * Patient create/update. The personas used `/rest/patient-management`, which
 * does not exist (404). The real endpoint is `/rest/PatientManagement` and the
 * body is FLAT — CreatePatientFormValues, not wrapped in `patientProperties`
 * (that wrapper belongs to SamplePatientEntry, a different endpoint).
 *
 * Success: HTTP 200 {patientId, status:"success"}. Verified round-trip on
 * `/rest/patient-search-results?lastName=...`.
 *
 * `patientUpdateStatus` uses the same enum as SamplePatientEntry: ADD for new,
 * UPDATE to edit, NO_ACTION to pass through. "CREATE" is not a member.
 *
 * The frontend strips `years`/`months`/`days` before submitting (display-only
 * age decomposition) — send birthDateForDisplay (dd/MM/yyyy) instead.
 */
export const PATIENT_MANAGEMENT = '/api/OpenELIS-Global/rest/PatientManagement';

export interface PatientManagementBody {
  patientUpdateStatus: 'ADD' | 'UPDATE' | 'NO_ACTION';
  nationalId: string;
  subjectNumber: string;
  lastName: string;
  firstName: string;
  aka: string;
  streetAddress: string;
  city: string;
  primaryPhone: string;
  email: string;
  gender: 'M' | 'F' | '';
  /** dd/MM/yyyy */
  birthDateForDisplay: string;
  commune: string;
  education: string;
  /** sic — server spelling. */
  maritialStatus: string;
  nationality: string;
  healthDistrict: string;
  healthRegion: string;
  otherNationality: string;
  occupation: string;
  customNotes: string;
  targetDiseaseProgramme: string;
  photo: string;
  idDocuments: unknown[];
  patientContact: { person: { firstName: string; lastName: string; primaryPhone: string; email: string } };
}

/**
 * NAME VALIDATION — this bit the QA test-data convention.
 *
 * FIRST_NAME_REGEX and LAST_NAME_REGEX (both readable from
 * `/rest/configuration-properties`) are, on a default install:
 *
 *     ^[.'a-zàâçéèêëîïôûùüÿñæœ -]*$
 *
 * i.e. LOWERCASE letters (incl. accented), period, apostrophe, space, hyphen.
 * No uppercase, NO DIGITS, NO UNDERSCORE. So the skill's `QA_AUTO_<MMDD>`
 * test-data prefix is REJECTED on patient names with
 * `400 {"error":"lastName: invalid name format, possibly illegal character"}`.
 *
 * Use a conforming marker for patient names — e.g. `qa-auto-probe`.
 *
 * AND `nationalId` enforces a SECOND, DIFFERENT regex (discovered the hard way
 * after moving the QA tag there to dodge the name rule):
 *
 *     (?i)^[-a-z0-9/]*$
 *
 * case-insensitive letters/digits plus hyphen and slash — still NO UNDERSCORE.
 * So the skill's `QA_AUTO_<MMDD>` prefix is rejected on the name fields AND on
 * nationalId. For patient records use a hyphenated tag (`qa-auto-0731-<ts>`,
 * see qaPatientNationalId()). Read both regexes per instance rather than
 * assuming the defaults; deployments localise them.
 */
export const PATIENT_NAME_REGEX_PROPERTY = 'LAST_NAME_REGEX' as const;
export const QA_PATIENT_NAME_SAFE = 'qa-auto-probe' as const;
/** nationalId-safe QA tag: hyphens only (underscores are rejected). */
export const qaPatientNationalId = (
  stamp = new Date().toISOString().slice(5, 10).replace('-', '')
) => `qa-auto-${stamp}-${Date.now()}`;

export function buildPatientCreateBody(opts: {
  firstName: string;            // must satisfy FIRST_NAME_REGEX
  lastName: string;             // must satisfy LAST_NAME_REGEX
  gender?: 'M' | 'F';
  birthDateForDisplay?: string; // dd/MM/yyyy
  nationalId?: string;          // NOT name-validated — safe place for a QA_AUTO_ tag
}): PatientManagementBody {
  return {
    patientUpdateStatus: 'ADD',
    nationalId: opts.nationalId ?? `QA${Date.now()}`,
    subjectNumber: '',
    lastName: opts.lastName,
    firstName: opts.firstName,
    aka: '', streetAddress: '', city: '', primaryPhone: '', email: '',
    gender: opts.gender ?? 'F',
    birthDateForDisplay: opts.birthDateForDisplay ?? '01/01/1990',
    commune: '', education: '', maritialStatus: '', nationality: '',
    healthDistrict: '', healthRegion: '', otherNationality: '', occupation: '',
    customNotes: '', targetDiseaseProgramme: '', photo: '', idDocuments: [],
    patientContact: { person: { firstName: '', lastName: '', primaryPhone: '', email: '' } },
  };
}

/** True when PatientManagement actually persisted. */
export function patientCreateSucceeded(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  const b = body as { status?: string; patientId?: string; error?: string };
  return !b.error && (b.status === 'success' || Boolean(b.patientId));
}

/**
 * Validation save. This is a STRUTS FORM ROUND-TRIP, not a REST resource write:
 * `Validation.jsx` does
 *
 *     postToOpenElisServer("/rest/AccessionValidation", JSON.stringify(props.results), ...)
 *
 * where `props.results` is the ENTIRE object returned by the matching GET. So the
 * write protocol is: GET the form → mutate rows in place → POST the whole object
 * back. The personas' invented `{paging, validationList:[...]}` body 400s.
 *
 * Per-row flags live on the row itself: `isAccepted`, `isRejected`, `note`
 * (the UI binds `resultList[i].isAccepted` etc.). Rows carry no usable `id` in
 * the API response — address them by array index.
 *
 * Verified live: GET (unitType=36) → POST the object back unmodified → HTTP 200
 * echoing ResultValidationForm. Echoing unmodified is also the safe way to check
 * the shape without consuming a validation queue.
 */
export const ACCESSION_VALIDATION = '/api/OpenELIS-Global/rest/AccessionValidation';

export function accessionValidationQuery(opts: { sectionId?: string; accessionNumber?: string; date?: string } = {}): string {
  const p = new URLSearchParams({
    accessionNumber: opts.accessionNumber ?? '',
    unitType: opts.sectionId ?? '',
    date: opts.date ?? '',
    doRange: 'true',
  });
  return `${ACCESSION_VALIDATION}?${p.toString()}`;
}

/**
 * Mark rows on a fetched validation form. Mutates and returns the SAME object,
 * which is what must be POSTed back.
 *
 * `accept` and `reject` are arrays of row indices. A row must not be both.
 */
export function markValidationRows(
  form: Record<string, unknown>,
  opts: { accept?: number[]; reject?: number[]; note?: string }
): Record<string, unknown> {
  const rows = (form.resultList as Array<Record<string, unknown>>) ?? [];
  for (const i of opts.accept ?? []) {
    if (!rows[i]) continue;
    rows[i].isAccepted = true;
    rows[i].isRejected = false;
    if (opts.note) rows[i].note = opts.note;
  }
  for (const i of opts.reject ?? []) {
    if (!rows[i]) continue;
    rows[i].isRejected = true;
    rows[i].isAccepted = false;
    if (opts.note) rows[i].note = opts.note;
  }
  return form;
}

/**
 * PATIENT SEARCH PARAMS — case matters, and a wrong name fails SILENTLY.
 *
 * `/rest/patient-search-results` ignores unknown params instead of erroring, so
 * `?nationalId=X` (lowercase d) returns `{patientSearchResults: []}` for every
 * value — including patients that exist. Verified 2026-07-31: patient 101 was
 * invisible to `nationalId=` and found by `nationalID=`.
 *
 * That is a vacuous-PASS generator: any test asserting "0 results" against a
 * misspelled param can never fail. Persona PA had exactly that bug.
 *
 * The supported set, from SearchPatientForm.tsx's query builder:
 */
export const PATIENT_SEARCH_PARAMS = [
  'lastName', 'firstName', 'STNumber', 'subjectNumber',
  'nationalID',        // capital D — NOT nationalId
  'labNumber', 'guid', 'dateOfBirth', 'gender', 'suppressExternalSearch',
] as const;

/** Build a patient search URL, guarding against the silent-ignore trap. */
export function patientSearchUrl(params: Partial<Record<(typeof PATIENT_SEARCH_PARAMS)[number], string>>): string {
  for (const k of Object.keys(params)) {
    if (!(PATIENT_SEARCH_PARAMS as readonly string[]).includes(k)) {
      throw new Error(
        `patientSearchUrl: "${k}" is not a supported patient-search param, and this endpoint ` +
        `IGNORES unknown params rather than failing — your filter would silently match nothing. ` +
        `Supported: ${PATIENT_SEARCH_PARAMS.join(', ')}`);
    }
  }
  const qs = new URLSearchParams(params as Record<string, string>).toString();
  return `/api/OpenELIS-Global/rest/patient-search-results?${qs}`;
}

/**
 * ROLE-SCOPED LIST ENDPOINTS — 200 + empty array is NOT the same as "allowed".
 *
 * Measured 2026-07-31 on testing v3.2.1.11, same instant, three sessions:
 *
 *   GET /rest/test-list             admin 187 · qa_labtech (Results) 187 · qa_recept (Reception) 0
 *   GET /rest/displayList/ALL_TESTS admin 187 · qa_labtech 187 · qa_recept 187
 *
 * All returned HTTP 200. `test-list` is scoped to the caller's result-entry test
 * sections, so a Reception-only user gets an empty catalogue with no error.
 * `displayList/ALL_TESTS` is not scoped — use it for anything a receptionist
 * needs (order entry), and reserve `test-list` for result-entry surfaces.
 *
 * TWO LESSONS:
 *  1. Specs must assert on CONTENT, not status. "HTTP 200" hid a total absence
 *     of data here, and Persona PA failed with "Empty test catalog" as a result.
 *  2. The RBAC matrix's own `classifyRest` grades 2xx as `allow`, so a
 *     role-scoped-to-empty endpoint records as allow. That is accurate about
 *     *access* and misleading about *usefulness* — see the note on BASE-02 in
 *     tests/rbac/_rbac.ts.
 *
 * Whether Reception SHOULD see the test catalogue is a product question, not a
 * settled bug: `/rest/test-list` is consumed by order QA review, results search,
 * referred-out tests and several admin pages, so the blast radius depends on
 * which surfaces a receptionist is expected to reach.
 */
export const TEST_LIST_IS_ROLE_SCOPED = true;
export const ALL_TESTS_UNSCOPED = '/api/OpenELIS-Global/rest/displayList/ALL_TESTS';

/**
 * ORDER-ENTRY CATALOGUE — and which endpoint is section-scoped.
 *
 * The Add Order sample/test picker (addOrder/SampleType.jsx) loads:
 *
 *     GET /rest/user-sample-types                  → the Sample Type dropdown
 *     GET /rest/sample-type-tests?sampleType=<id>   → {tests[], panels[]} for that type
 *
 * BOTH are scoped to the caller's test sections. Measured 2026-07-31 on testing
 * v3.2.1.11, same instant:
 *
 *     admin                    12 sample types · 237 tests · 5 panels
 *     Reception @ AllLabUnits  12 sample types · 237 tests · 5 panels
 *     Reception @ Hematology    1 sample type  ·  18 tests · 2 panels
 *
 * So the requirement "a section-assigned receptionist sees only their own
 * section's tests and panels" is implemented HERE — regression-tested by
 * tests/rbac/order-catalogue-scope.spec.ts.
 *
 * Do NOT use /rest/test-list for order entry: it is scoped to *result-entry*
 * sections and returns an empty array for Reception
 * (§TEST_LIST_IS_ROLE_SCOPED). And do not use displayList/ALL_TESTS either —
 * it is UNSCOPED (187 tests for every role), so it would show a Hematology
 * receptionist the whole catalogue.
 *
 * Bonus: sample-type-tests solves test↔sample-type pairing for free, because it
 * returns the tests valid FOR a given sample type. Picking a test from an
 * unscoped flat list and guessing sampleTypeId '1' is what made persona PA's
 * order POST 400 (it paired an Immunohistochemistry test with sample type 1).
 */
export const USER_SAMPLE_TYPES = '/api/OpenELIS-Global/rest/user-sample-types';
export const SAMPLE_TYPE_TESTS = (sampleTypeId: string | number) =>
  `/api/OpenELIS-Global/rest/sample-type-tests?sampleType=${sampleTypeId}`;

export interface SampleTypeTestsResponse {
  tests?: Array<{ id?: string; name?: string; value?: string }>;
  panels?: Array<{ id?: string; name?: string; value?: string }>;
}

// =============================================================================
// PR #3987 — live-validated 2026-08-06 on testing.openelis-global.org v3.2.1.11
//
// Fifteen-item defect PR (DIGI-UW/OpenELIS-Global-2#3987, merged 2026-08-05).
// Every constant and quirk below was confirmed by live capture in a browser
// context on that instance, per §6.5b — none of it is inferred from the diff.
// =============================================================================

/**
 * FHIR base path — RESOLVED for testing v3.2.1.11 (2026-08-06).
 *
 * `/api/OpenELIS-Global/fhir` answers `content-type: application/fhir+json`
 * and accepts the `application/fhir+json` Accept header. The bare `/fhir`,
 * `/fhir/R4` and `/fhir/metadata` paths all return the SPA HTML shell (200 +
 * text/html), which is what the 2026-05-13 pilot saw. So the candidate list
 * above is still correct in ORDER, but on testing the first entry now wins
 * outright — prefer this constant over re-probing.
 */
export const FHIR_BASE = '/api/OpenELIS-Global/fhir' as const;

/**
 * Range-coverage report — `GET /rest/test-catalog/tests/{testId}/ranges`.
 *
 * TWO SERIALIZATION QUIRKS a spec must encode (both confirmed live):
 *
 *  1. `AgeInterval.toAge` for an open-ended tail gap serializes as the JSON
 *     STRING `"Infinity"`, not a number. `expect(gap.toAge).toBe(Infinity)`
 *     FAILS. Compare against the string, or normalise via `toAgeAsNumber()`.
 *  2. An open-ended range is expressed by OMITTING `maxAge` (send `null`);
 *     it is then absent from the stored DTO on read-back. Sending a large
 *     finite bound like `maxAge: 999` does NOT mean "no upper limit" — it
 *     legitimately leaves a `[999, Infinity)` tail gap, which is what makes
 *     a naive fixture look like a coverage bug when it isn't.
 *
 * STATUS PRECEDENCE: `statusFor()` reports `GAP` when gaps exist even if
 * overlaps ALSO exist. To assert `OVERLAP` you need a fixture with no tail
 * gap — i.e. the widest range must be open-ended.
 */
export type CoverageStatus = 'COMPLETE' | 'GAP' | 'OVERLAP' | 'EMPTY';

export interface AgeInterval {
  fromAge: number;
  /** `number` for a bounded interval, the string `"Infinity"` for an open tail. */
  toAge: number | 'Infinity';
  componentId?: string | null;
  componentLabel?: string | null;
}

export interface SexCoverage {
  sex: 'M' | 'F';
  status: CoverageStatus;
  gaps: AgeInterval[];
  overlaps: AgeInterval[];
}

export interface CoverageReport {
  male: SexCoverage;
  female: SexCoverage;
}

export interface RangesResponse {
  testId: string;
  ranges: RangeDto[];
  coverage: CoverageReport;
  sampleTypes: Array<{ id: string; name: string; domain: string }>;
}

/**
 * `componentId` and `sampleTypeId` are OMITTED from the response when null —
 * do not assert `toBeNull()`, assert `toBeUndefined()` or use `?? null`.
 */
export interface RangeDto {
  id?: string;
  componentId?: string | null;
  sampleTypeId?: string | null;
  gender: 'M' | 'F';
  minAge: number;
  /** Absent when the range is open-ended. */
  maxAge?: number;
  lowNormal?: number;
  highNormal?: number;
  lowCritical?: number;
  highCritical?: number;
  lowValid?: number;
  highValid?: number;
  lowReporting?: number | null;
  highReporting?: number | null;
}

/** Normalise `toAge` for arithmetic/comparison. */
export const toAgeAsNumber = (i: AgeInterval): number =>
  i.toAge === 'Infinity' ? Number.POSITIVE_INFINITY : Number(i.toAge);

/** `GET /rest/test-catalog/tests/{testId}/loinc-integrity` (PR item 2). */
export interface LoincIntegrity {
  loinc?: string;
  active: boolean;
  /**
   * TRUE only when the test is active AND orderable AND `test.loinc` is blank
   * AND there is no ACTIVE LOINC terminology mapping in ANY scope. Post-#3987
   * a component-scoped or specimen-scoped mapping clears this; a SNOMED-only
   * or `is_active='N'` mapping does NOT.
   */
  noLoinc: boolean;
  duplicates: Array<{ testId: string; name: string }>;
}

/** A row of `GET /rest/test-catalog/tests` (PR items 2 + 8). */
export interface TestListRow {
  testId: string;
  /** KEEPS the "+n" abbreviation, e.g. `Anti-CD 3(Immunohistochemistry specimen +2)`. */
  name: string;
  sampleType?: string;
  sampleTypes?: string[];
  code?: string;
  domain?: string;
  active: boolean;
  amr?: boolean;
  coverageIncomplete?: boolean;
  /** `test.loinc` non-blank OR an active LOINC mapping in any scope (item 2). */
  hasLoinc: boolean;
  findings?: unknown[];
  errorCount?: number;
  warningCount?: number;
  infoCount?: number;
}

/**
 * `GET /rest/test-catalog/tests/{testId}` (PR item 8) — the EDITOR envelope.
 * `name` names EVERY associated specimen, comma-separated, with NO space
 * before the paren: `Anti-Pan Keratin(Immunohistochemistry specimen, Tissue
 * antemortem, Tissue post mortem)`. It must never match /\+\d+\)/.
 * The LIST row (above) deliberately keeps the abbreviation.
 */
export interface EditorEnvelope {
  testId: string;
  name: string;
  code?: string;
  domain?: string;
  applicableSections: string[];
}

/** Terminology mapping — test-level and sample-type-level share this shape. */
export interface TerminologyMappingDto {
  id?: string;
  source: 'LOINC' | 'SNOMED' | 'CIEL' | 'OCL' | 'WHONET';
  code: string;
  relationship?: 'SAME_AS' | 'BROADER_THAN' | 'NARROWER_THAN';
  /** Omitted when the mapping is shared across all specimens. */
  sampleTypeId?: string;
  /** Omitted for whole-test mappings. */
  componentId?: string;
}

/** Terminology system URLs emitted into FHIR codings (PR items 3 + 6). */
export const TERMINOLOGY_SYSTEM_URL: Record<string, string | null> = {
  LOINC: 'http://loinc.org',
  SNOMED: 'http://snomed.info/sct',
  CIEL: 'https://openconceptlab.org/orgs/CIEL/sources/CIEL',
  OCL: 'https://openconceptlab.org',
  /** Unrecognised by `terminologySystemUrl()` → coding is SKIPPED entirely. */
  WHONET: null,
};

export const OE_SAMPLE_TYPE_SYSTEM = 'http://openelis-global.org/sampleType' as const;

/**
 * Patient name / nationalId regexes — CORRECTION to the §PATIENT_NAME_REGEX_PROPERTY
 * note above, measured 2026-08-06 on testing v3.2.1.11.
 *
 * That note says the name regex allows "No uppercase". On this deployment
 * UPPERCASE IS ACCEPTED: `lastName: "QaAuto"` / `firstName: "Fixture"` both
 * returned `200 {"status":"success","patientId":"114"}`, and `nationalId:
 * "QAPplain"` was accepted too. What IS rejected is confirmed unchanged —
 * DIGITS and UNDERSCORES in name fields:
 *
 *     lastName: "QaAuto0806" -> 400 invalid name format
 *     lastName: "QA_AUTO_0806" -> 400 invalid name format
 *     lastName: "QaAuto"     -> 200
 *
 * Deployments localise these regexes, so the standing advice holds: read
 * `LAST_NAME_REGEX` per instance rather than trusting either note.
 */
export const PATIENT_NAME_ILLEGAL_CHAR_ERROR =
  'invalid name format, possibly illegal character' as const;

/** Exact item-14 error string — a hard-coded English literal, NOT an i18n key. */
export const PHOTO_UNREADABLE_ERROR =
  'The photo could not be read as an image. Supported formats are JPEG, PNG, GIF and BMP.' as const;

/** Valid base64 that is NOT a decodable image — trips the item-14 branch. */
export const UNDECODABLE_PHOTO_DATA_URI =
  'data:image/jpeg;base64,SGVsbG8gd29ybGQ=' as const;

/**
 * `GET /rest/patient-photos/{patientPK}/{isThumbnail}` → `{ data }`.
 * `""` when there is no photo (never undefined). Called with `false` by
 * `SearchPatientForm`, so `data` is the full `data:<type>;base64,<payload>`.
 */
export interface PatientPhotoResponse {
  data: string;
}

/**
 * `POST /rest/SamplePatientEntry` — order creation.
 *
 * WARNING (2026-08-06): the upstream helper
 * `frontend/playwright/helpers/seed-tat-data.ts` defaults
 * `providerPersonId: "9000002"`, `referringSiteId: "9000100"` and
 * `programId: "2"`. Those are dev.docker-compose fixture ids. On
 * testing.openelis-global.org they do not exist and the POST answers a bare
 * **HTTP 500** (`{"status":500,"error":"Internal Server Error"}`) with no
 * field diagnostic. Sending EMPTY STRINGS for all three succeeds (200 + a
 * generated accession). Any spec that seeds an order on a non-dev instance
 * must clear them.
 *
 * MULTI-SPECIMEN: put one `<sample sampleID='..' tests='..'/>` element per
 * specimen inside `<samples>` — that yields one analysis per specimen on the
 * SAME accession, which is the fixture PR items 4 / 6 / 12 need.
 */
export const SAMPLE_PATIENT_ENTRY = '/api/OpenELIS-Global/rest/SamplePatientEntry';
export const ACCESSION_GENERATOR =
  '/api/OpenELIS-Global/rest/SampleEntryGenerateScanProvider';
export const ORDER_SEED_DEV_ONLY_IDS = {
  providerPersonId: '9000002',
  referringSiteId: '9000100',
  programId: '2',
} as const;
