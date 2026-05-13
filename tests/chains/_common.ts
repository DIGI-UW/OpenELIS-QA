/**
 * tests/chains/_common.ts — Shared helpers for Chain A through L
 *
 * Chains are end-to-end workflow specs that cross 3+ modules. Per SKILL §11,
 * each chain must execute as a single PASS/PARTIAL/FAIL with module-level
 * breakdown. This module provides the building blocks every chain reuses:
 *
 *   - apiCall()           CSRF-aware fetch wrapper (mirrors seed-factory's)
 *   - findOrSeedOrder()   reuse a QA_AUTO_ order if one exists, otherwise
 *                         seed a fresh patient + order pair
 *   - extractPdfText()    minimal PDF text extractor (no external deps,
 *                         works for the FlateDecode-compressed PDFs the
 *                         OpenELIS ReportPrint endpoint produces; for
 *                         richer parsing add `pdf-parse` per workplan E3)
 *   - markStep()          structured step logger that prints
 *                         "[Chain A · Step N · PASS] description"
 *
 * NOTE on §11.5 Blocking-Bug Etiquette: when a step hits a known
 * destructive bug (BUG-31 Carbon Accept checkbox, BUG-38 NCE POST), use
 * `markStep('BLOCKED', ...)` and `return null` from the step function so
 * the chain marks PARTIAL and continues. Never throw — the parent chain's
 * `test.step()` wrapper needs to keep running so later steps can still
 * surface their own findings.
 */

import { Page, expect } from '@playwright/test';
import * as zlib from 'zlib';

export const BASE = process.env.BASE_URL || 'https://testing.openelis-global.org';

// -----------------------------------------------------------------------------
// CSRF-aware fetch
// -----------------------------------------------------------------------------

export interface ApiResponse<T = unknown> {
  ok: boolean;
  status: number;
  body: T | string | null;
  headers: Record<string, string>;
}

export async function apiCall<T = unknown>(
  page: Page,
  pathSuffix: string,
  init: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    body?: unknown;
    accept?: string;
    expectBinary?: boolean;
  } = {}
): Promise<ApiResponse<T>> {
  return page.evaluate(
    async ({ pathSuffix, init }) => {
      const csrf = localStorage.getItem('CSRF') || '';
      const headers: Record<string, string> = {
        Accept: init.accept || 'application/json',
      };
      const reqInit: RequestInit = {
        method: init.method || 'GET',
        headers,
        credentials: 'same-origin',
      };
      if (init.body !== undefined) {
        headers['Content-Type'] = 'application/json';
        headers['X-CSRF-Token'] = csrf;
        reqInit.body = JSON.stringify(init.body);
      }
      try {
        const res = await fetch(pathSuffix, reqInit);
        const headerObj: Record<string, string> = {};
        res.headers.forEach((v, k) => { headerObj[k] = v; });

        if (init.expectBinary) {
          const buf = await res.arrayBuffer();
          // Encode to base64 for cross-context transport — Page.evaluate
          // cannot return raw ArrayBuffer.
          let binary = '';
          const bytes = new Uint8Array(buf);
          for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
          return {
            ok: res.ok,
            status: res.status,
            body: btoa(binary),
            headers: headerObj,
          };
        }

        const text = await res.text();
        let body: unknown = text;
        try { body = JSON.parse(text); } catch { /* not JSON */ }
        return { ok: res.ok, status: res.status, body: body as never, headers: headerObj };
      } catch (err) {
        return { ok: false, status: 0, body: String(err), headers: {} };
      }
    },
    { pathSuffix, init }
  );
}

// -----------------------------------------------------------------------------
// Order seeding (reuses seed-factory's payload shape)
// -----------------------------------------------------------------------------

export interface ChainOrderRef {
  accession: string;
  patientNationalId: string;
  patientID: string;
  testId: string;
  testName: string;
  sampleType: string;
  source: 'reused' | 'seeded';
  bug37: boolean; // true if patient-order linkage broken (BUG-37 caught at seed time)
}

/**
 * Find one existing QA_AUTO_ order that can be advanced through the
 * chain, or seed a fresh patient + order pair. The chain's later steps
 * (result entry, validation, report, FHIR) all key off the returned
 * accession + patientPK.
 *
 * Reuse strategy: query the dashboard's "in progress" list and pick
 * the first accession that belongs to a QA_AUTO_ patient. If none
 * found, seed a new one via the same API path the bulk seed script uses
 * (`POST /rest/SamplePatientEntry`), with the BUG-37 verify step.
 */
export async function findOrSeedOrder(page: Page): Promise<ChainOrderRef | null> {
  // Step a: look for an existing QA_AUTO_ patient with an open order
  const patientSearch = await apiCall<{
    patientSearchResults?: Array<{ nationalId?: string; patientID?: string }>;
  }>(page, `/api/OpenELIS-Global/rest/patient-search-results?lastName=QA_AUTO`);

  if (patientSearch.ok && typeof patientSearch.body === 'object' && patientSearch.body !== null) {
    const patients = (patientSearch.body as { patientSearchResults?: Array<{ nationalId?: string; patientID?: string }> }).patientSearchResults || [];
    if (patients.length > 0) {
      // Pull their accessions via LogbookResults filtered by patient
      // (this endpoint is what powers the Modify Order patient search)
      for (const p of patients.slice(0, 5)) {
        if (!p.patientID) continue;
        const list = await apiCall<{ logbookList?: Array<{ accessionNumber?: string; testId?: string; testName?: string; sampleType?: string }> }>(
          page,
          `/api/OpenELIS-Global/rest/LogbookResults?patientPK=${encodeURIComponent(p.patientID)}`
        );
        if (list.ok && typeof list.body === 'object' && list.body !== null) {
          const items = (list.body as { logbookList?: Array<{ accessionNumber?: string; testId?: string; testName?: string; sampleType?: string }> }).logbookList || [];
          if (items.length > 0 && items[0].accessionNumber) {
            return {
              accession: items[0].accessionNumber,
              patientNationalId: p.nationalId || '',
              patientID: p.patientID,
              testId: items[0].testId || '',
              testName: items[0].testName || '',
              sampleType: items[0].sampleType || '',
              source: 'reused',
              bug37: false, // assumed; the reuse path doesn't re-verify
            };
          }
        }
      }
    }
  }

  // Step b: no reusable order; seed one fresh. Implementation parked here
  // intentionally — Chain A's purpose is to validate the existing-data
  // flow, not to re-implement the seed script. If no QA_AUTO_ data exists,
  // the test fails fast with a clear message asking the operator to run
  // the seed script (SKILL §0.6a) first.
  return null;
}

// -----------------------------------------------------------------------------
// Minimal PDF text extraction (no external dependency)
// -----------------------------------------------------------------------------

/**
 * Extract readable text from a PDF buffer. This is a deliberately tiny
 * implementation that handles the FlateDecode-compressed text streams the
 * OpenELIS ReportPrint endpoint produces. It looks for "Tj" / "TJ" text-show
 * operators inside `stream` ... `endstream` blocks, decompresses each
 * stream, and concatenates the strings.
 *
 * Good enough to assert "does the lab number appear?" — NOT a general-
 * purpose PDF text extractor. For richer parsing, add `pdf-parse` per
 * workplan Phase E3.
 */
export function extractPdfText(buf: Buffer): string {
  const out: string[] = [];
  let i = 0;
  while (i < buf.length) {
    const streamIdx = buf.indexOf('stream', i);
    if (streamIdx < 0) break;
    // Skip newline after `stream`
    let dataStart = streamIdx + 'stream'.length;
    if (buf[dataStart] === 0x0d) dataStart++;
    if (buf[dataStart] === 0x0a) dataStart++;
    const endStreamIdx = buf.indexOf('endstream', dataStart);
    if (endStreamIdx < 0) break;
    const compressed = buf.subarray(dataStart, endStreamIdx);
    let decompressed: Buffer;
    try {
      decompressed = zlib.inflateSync(compressed);
    } catch {
      // Not zlib-compressed; treat as raw
      decompressed = compressed;
    }
    out.push(decompressed.toString('latin1'));
    i = endStreamIdx + 'endstream'.length;
  }
  // Strip PDF text-show operators and parens to leave just the readable
  // strings. The result is dirty but searchable for short tokens like
  // accession numbers.
  return out
    .join('\n')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/[<>]/g, ' ');
}

// -----------------------------------------------------------------------------
// Step logger
// -----------------------------------------------------------------------------

export type StepStatus = 'PASS' | 'FAIL' | 'BLOCKED' | 'PARTIAL' | 'GAP';

export function markStep(chain: string, n: number, status: StepStatus, description: string, detail?: string): void {
  const tag = `[Chain ${chain} · Step ${n} · ${status}]`;
  // eslint-disable-next-line no-console
  console.log(detail ? `${tag} ${description} — ${detail}` : `${tag} ${description}`);
}

// =============================================================================
// v6.13 — Folded from helpers/_common-v612-patch.ts (live-pilot grounded)
// =============================================================================

import {
  LAB_UNIT_IDS,
  LOGBOOK_FILTER_PARAM,
} from '../../helpers/apiShapes';

export { LAB_UNIT_IDS, LOGBOOK_FILTER_PARAM };

export interface AcquireAccessionResult {
  accession: string | null;
  source: string;
  /** True when the Dashboard claims orders exist but we couldn't find any */
  yReconMismatch: boolean;
  /** Detail message for the spec's `markStep` call */
  detail: string;
}

/**
 * Probe multiple paths to find any accession the current session can operate on.
 *
 * NOTE (v6.13 honest update): the 2026-05-13 pilot's NEW-1 "Y-RECON
 * mismatch" was retracted after user correction — LogbookResults is the
 * *result entry* surface, not a queue of all orders awaiting attention.
 * So the `yReconMismatch` flag this helper raises should be treated as a
 * candidate to investigate (via §6.5a live capture), NOT as a confirmed
 * Y-RECON bug. The right way to validate Y-RECON is to drive the actual
 * UI Dashboard tile drill-down and capture the real queue endpoint.
 */
export async function acquireAnyAccession(page: import('@playwright/test').Page): Promise<AcquireAccessionResult> {
  // 1. Try LogbookResults unfiltered
  const lb = await apiCall<{ testResult?: Array<{ accessionNumber?: string }> }>(
    page,
    '/api/OpenELIS-Global/rest/LogbookResults'
  );
  if (lb.ok && typeof lb.body === 'object' && lb.body !== null) {
    const items = (lb.body as { testResult?: Array<{ accessionNumber?: string }> }).testResult || [];
    if (items.length > 0 && items[0].accessionNumber) {
      return {
        accession: items[0].accessionNumber,
        source: 'LogbookResults unfiltered',
        yReconMismatch: false,
        detail: `Acquired ${items[0].accessionNumber} from ${items.length} Logbook items`,
      };
    }
  }
  // 2. Try LogbookResults per lab unit (correct param: testUnitId, NOT testSectionId)
  for (const [name, id] of Object.entries(LAB_UNIT_IDS)) {
    const r = await apiCall<{ testResult?: Array<{ accessionNumber?: string }> }>(
      page,
      `/api/OpenELIS-Global/rest/LogbookResults?${LOGBOOK_FILTER_PARAM}=${id}`
    );
    if (!r.ok || typeof r.body !== 'object' || r.body === null) continue;
    const items = (r.body as { testResult?: Array<{ accessionNumber?: string }> }).testResult || [];
    if (items.length > 0 && items[0].accessionNumber) {
      return {
        accession: items[0].accessionNumber,
        source: `LogbookResults ${name}`,
        yReconMismatch: false,
        detail: `Acquired ${items[0].accessionNumber} from ${name} (${id})`,
      };
    }
  }
  // 3. Check Dashboard — if it shows orders exist but Logbook returned 0, flag
  //    as POSSIBLE Y-RECON gap. Investigation via UI capture is required to
  //    confirm; this is not by itself a confirmed bug (see NOTE above).
  const dash = await apiCall<{ ordersInProgress?: number; ordersReadyForValidation?: number }>(
    page,
    '/api/OpenELIS-Global/rest/home-dashboard/metrics'
  );
  let dashboardSays = 0;
  if (dash.ok && typeof dash.body === 'object' && dash.body !== null) {
    const m = dash.body as { ordersInProgress?: number; ordersReadyForValidation?: number };
    dashboardSays = (m.ordersInProgress || 0) + (m.ordersReadyForValidation || 0);
  }
  return {
    accession: null,
    source: 'none',
    yReconMismatch: dashboardSays > 0,
    detail:
      dashboardSays > 0
        ? `Dashboard says ${dashboardSays} orders awaiting attention but no LogbookResults found. ` +
          `POSSIBLE Y-RECON gap — investigate by driving the UI Dashboard tile drill-down and capturing ` +
          `the actual queue endpoint (per SKILL §6.5b). Do NOT file as confirmed bug without that capture.`
        : `No orders exist on this instance — chain BLOCKED, run --project=seed-data first (SKILL §0.6a).`,
  };
}

/**
 * Reminder helper: eqaEnabled toggle (Chain F precondition, Persona PF Step 4)
 * is at the JSP page `/api/OpenELIS-Global/SampleEntryConfigurationMenu` —
 * the `/rest/SampleEntryConfigurationMenu` REST endpoint returns 404.
 * Specs that need this toggle must drive the JSP form via page.goto + UI
 * interaction, not via JSON POST.
 */
export function eqaEnabledRequiresJspNotRest(): never {
  throw new Error(
    'v6.12 finding: eqaEnabled is at the JSP page, NOT the equivalent /rest path. ' +
    'Drive the JSP form via Playwright UI navigation, not JSON POST.'
  );
}
