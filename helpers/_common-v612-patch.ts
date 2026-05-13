/**
 * tests/chains/_common.ts — v6.12 corrections
 *
 * This file is the v6.12 PATCH that replaces / amends sections of the
 * existing _common.ts. The diff is grounded in the 2026-05-13 live pilot
 * (pilot-2026-05-13-session-report.md) and the corrected shapes in
 * `helpers/apiShapes.ts`.
 *
 * Changes:
 *   - `findOrSeedOrder()` now reads `patientSearchResults` (not `patientList`)
 *     and uses `patientID` (not `patientPK`) per the live capture.
 *   - New `acquireAnyAccession(page)` helper that probes multiple paths and
 *     surfaces the Y-RECON mismatch (NEW-1 from the pilot) clearly when no
 *     accession can be found despite Dashboard saying orders exist.
 *   - New `assertEqaEnabledViaJsp(page)` reminder helper documenting that
 *     the eqaEnabled toggle isn't accessible via JSON REST (spec bug #9).
 *
 * To apply: merge into tests/chains/_common.ts replacing the existing
 * `findOrSeedOrder` implementation. The other helpers (apiCall,
 * extractPdfText, markStep) are unchanged.
 */

import type { Page } from '@playwright/test';
import {
  PATIENT_SEARCH_RESPONSE_KEY,
  LAB_UNIT_IDS,
  LOGBOOK_FILTER_PARAM,
  type PatientSearchResponse,
  type LogbookResponse,
  type LogbookEntry,
  type DashboardMetrics,
  isPatientSearchResponse,
} from '../../helpers/apiShapes';

// Re-export for convenience; existing chain specs import from _common.ts
export { LAB_UNIT_IDS, LOGBOOK_FILTER_PARAM };

export const BASE = process.env.BASE_URL || 'https://testing.openelis-global.org';

// -----------------------------------------------------------------------------
// findOrSeedOrder — v6.12 corrected
// -----------------------------------------------------------------------------

/**
 * Local minimal version of apiCall — full one is in the original _common.ts.
 * Inlined here so this patch file is self-contained for review.
 */
async function apiCallLocal<T = unknown>(
  page: Page,
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<{ ok: boolean; status: number; body: T | string | null }> {
  return page.evaluate(
    async ({ path, init }) => {
      const csrf = localStorage.getItem('CSRF') || '';
      const headers: Record<string, string> = { Accept: 'application/json' };
      const ri: RequestInit = { method: init.method || 'GET', headers, credentials: 'same-origin' };
      if (init.body !== undefined) {
        headers['Content-Type'] = 'application/json';
        headers['X-CSRF-Token'] = csrf;
        ri.body = JSON.stringify(init.body);
      }
      try {
        const r = await fetch(path, ri);
        const t = await r.text();
        let body: unknown = t;
        try { body = JSON.parse(t); } catch {}
        return { ok: r.ok, status: r.status, body: body as never };
      } catch (e) { return { ok: false, status: 0, body: String(e) }; }
    },
    { path, init }
  );
}

export interface ChainOrderRef {
  accession: string;
  patientNationalId: string;
  /** v6.12: was `patientPK`. Live shape uses `patientID`. */
  patientID: string;
  testId: string;
  testName: string;
  sampleType: string;
  source: 'reused' | 'seeded';
  bug37: boolean;
}

/**
 * v6.12: corrected reads. Looks for an existing QA_AUTO_ patient; if
 * found, looks up an existing order via LogbookResults filtered by
 * patient. Falls back to fail-fast with a clear seed-script message if
 * no QA_AUTO_ data exists.
 *
 * Major change from v6.11: reads `patientSearchResults` not `patientList`,
 * uses `patientID` not `patientPK`.
 */
export async function findOrSeedOrder(page: Page): Promise<ChainOrderRef | null> {
  // Search for QA_AUTO_ patients
  const search = await apiCallLocal<PatientSearchResponse>(
    page,
    '/api/OpenELIS-Global/rest/patient-search-results?lastName=QA_AUTO'
  );
  if (!search.ok || !isPatientSearchResponse(search.body)) return null;

  const patients = search.body.patientSearchResults;
  if (patients.length === 0) return null;

  // Try each patient's logbook to find an active order
  for (const p of patients.slice(0, 5)) {
    if (!p.patientID) continue;
    const list = await apiCallLocal<LogbookResponse>(
      page,
      `/api/OpenELIS-Global/rest/LogbookResults?patientPK=${encodeURIComponent(p.patientID)}`
    );
    if (!list.ok || typeof list.body !== 'object' || list.body === null) continue;
    const items = (list.body as LogbookResponse).testResult || [];
    if (items.length === 0) continue;
    const first = items[0] as LogbookEntry & { sampleType?: string };
    if (!first.accessionNumber) continue;

    return {
      accession: first.accessionNumber,
      patientNationalId: p.nationalId,
      patientID: p.patientID,
      testId: String(first.testId || ''),
      testName: String(first.testName || ''),
      sampleType: first.sampleType || '',
      source: 'reused',
      bug37: false,
    };
  }
  return null;
}

// -----------------------------------------------------------------------------
// acquireAnyAccession — NEW in v6.12
// -----------------------------------------------------------------------------

export interface AcquireAccessionResult {
  accession: string | null;
  source: string;
  /** True when the Dashboard claims orders exist but we couldn't find any */
  yReconMismatch: boolean;
  /** Detail message for the spec's `markStep` call */
  detail: string;
}

/**
 * Probe multiple paths to find any accession the current session can
 * operate on. Returns a structured result that distinguishes:
 *   - "found an accession" (acquire+continue path)
 *   - "no orders exist on this instance" (skip path)
 *   - "Dashboard says orders exist but we can't find them" (Y-RECON mismatch — file a real bug)
 *
 * Caught NEW-1 in the 2026-05-13 pilot: dashboard.ordersInProgress=14
 * but LogbookResults returned 0 across all filters. Without this helper,
 * each chain rediscovers the gap independently.
 */
export async function acquireAnyAccession(page: Page): Promise<AcquireAccessionResult> {
  // 1. Try LogbookResults unfiltered
  const lb = await apiCallLocal<LogbookResponse>(
    page,
    '/api/OpenELIS-Global/rest/LogbookResults'
  );
  if (lb.ok && typeof lb.body === 'object' && lb.body !== null) {
    const items = (lb.body as LogbookResponse).testResult || [];
    if (items.length > 0 && items[0].accessionNumber) {
      return {
        accession: items[0].accessionNumber,
        source: 'LogbookResults unfiltered',
        yReconMismatch: false,
        detail: `Acquired ${items[0].accessionNumber} from ${items.length} unfiltered Logbook items`,
      };
    }
  }
  // 2. Try LogbookResults per lab section
  for (const [name, id] of Object.entries(LAB_UNIT_IDS)) {
    const r = await apiCallLocal<LogbookResponse>(
      page,
      `/api/OpenELIS-Global/rest/LogbookResults?${LOGBOOK_FILTER_PARAM}=${id}`
    );
    if (!r.ok || typeof r.body !== 'object' || r.body === null) continue;
    const items = (r.body as LogbookResponse).testResult || [];
    if (items.length > 0 && items[0].accessionNumber) {
      return {
        accession: items[0].accessionNumber,
        source: `LogbookResults ${name}`,
        yReconMismatch: false,
        detail: `Acquired ${items[0].accessionNumber} from ${name} (${id})`,
      };
    }
  }
  // 3. Check Dashboard to detect Y-RECON mismatch
  const dash = await apiCallLocal<DashboardMetrics>(
    page,
    '/api/OpenELIS-Global/rest/home-dashboard/metrics'
  );
  let dashboardSays = 0;
  if (dash.ok && typeof dash.body === 'object' && dash.body !== null) {
    const m = dash.body as DashboardMetrics;
    dashboardSays = (m.ordersInProgress || 0) + (m.ordersReadyForValidation || 0);
  }
  return {
    accession: null,
    source: 'none',
    yReconMismatch: dashboardSays > 0,
    detail:
      dashboardSays > 0
        ? `Y-RECON MISMATCH (§13): Dashboard says ${dashboardSays} orders in queue but LogbookResults returns 0 across all filters tried. File as candidate bug — methodology working as designed.`
        : `No orders exist on this instance — chain BLOCKED, run --project=seed-data first (SKILL §0.6a).`,
  };
}

// -----------------------------------------------------------------------------
// EQA enablement reminder
// -----------------------------------------------------------------------------

/**
 * v6.12 reminder: the eqaEnabled toggle (Chain F precondition,
 * Persona PF Step 4) is ONLY accessible via the JSP form. The
 * `/rest/SampleEntryConfigurationMenu` REST endpoint returns Spring 404.
 *
 * Calling this throws to prevent specs from re-trying the dead path.
 */
export function eqaEnabledRequiresJspNotRest(): never {
  throw new Error(
    'v6.12 reminder per pilot 2026-05-13: eqaEnabled toggle is at the JSP page ' +
    '`/api/OpenELIS-Global/SampleEntryConfigurationMenu`, NOT at the equivalent ' +
    '/rest path (which returns 404). Specs needing this toggle must drive the ' +
    'JSP form via page.goto + Playwright UI interactions, not via JSON POST.'
  );
}
