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
