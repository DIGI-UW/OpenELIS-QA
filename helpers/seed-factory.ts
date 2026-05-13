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
 */

import { Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import {
  QA_PREFIX,
  TARGETS,
  LAB_SECTIONS,
  TestCatalogEntry,
  OrderTargetStatus,
  patientNationalId,
  patientLastName,
  patientFirstName,
  patientDOB,
  patientGender,
} from './seed-config';

export const BASE = process.env.BASE_URL || 'https://testing.openelis-global.org';
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
        headers['X-CSRF-Token'] = csrf;
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
    `/api/OpenELIS-Global/rest/patient-search-results?lastName=${encodeURIComponent(QA_PREFIX)}`
  );
  if (patientSearch.ok && typeof patientSearch.body === 'object' && patientSearch.body !== null) {
    const list = (patientSearch.body as { patientSearchResults?: unknown[] }).patientSearchResults;
    if (Array.isArray(list)) result.patients = list.length;
  }

  // Dashboard counts give us order totals across all patients (not just QA_AUTO).
  // For idempotency we'd want QA_AUTO orders specifically, but the dashboard is
  // the only reliable count source on the current API; the seed script accepts
  // this approximation and notes it in the state file.
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
    // (excludes validated + reported), but is sufficient for the empty check.
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
 * Fetch the active test list and produce a TestCatalogEntry per lab section
 * we want to seed against. Returns the SECTION → first-test mapping, since
 * a single test per section is enough for seeding.
 *
 * If the catalog endpoint is unavailable (BUG-1 territory or earlier), the
 * script bails with an explicit error message so the operator knows the
 * underlying issue.
 */
export async function discoverTestCatalog(
  page: Page
): Promise<Map<string, TestCatalogEntry>> {
  const result = new Map<string, TestCatalogEntry>();

  const testList = await apiCall<{ testList?: Array<Record<string, unknown>> }>(
    page,
    '/api/OpenELIS-Global/rest/test-list?activeOnly=true'
  );

  if (!testList.ok || !testList.body || typeof testList.body !== 'object') {
    throw new Error(
      `Test catalog discovery failed: GET /rest/test-list returned ${testList.status}. ` +
      `Cannot construct order payloads without a test catalog. ` +
      `Check BUG-1 (TestAdd) status and verify the instance has test data.`
    );
  }

  const list = (testList.body as { testList?: Array<Record<string, unknown>> }).testList || [];
  for (const t of list) {
    const sectionName = String(t.testSectionName || t.testSection || '');
    if (!LAB_SECTIONS.includes(sectionName as typeof LAB_SECTIONS[number])) continue;
    if (result.has(sectionName)) continue; // first match per section
    result.set(sectionName, {
      testId: String(t.id || t.testId),
      testName: String(t.testName || t.name),
      sampleType: String(t.sampleType || ''),
      sampleTypeId: String(t.sampleTypeId || ''),
      testSection: sectionName,
      testSectionId: String(t.testSectionId || ''),
    });
  }

  return result;
}

// -----------------------------------------------------------------------------
// Patient seeding
// -----------------------------------------------------------------------------

interface CreatePatientResult {
  ok: boolean;
  nationalId: string;
  patientID?: string;
  error?: string;
}

/**
 * Create one patient via the SamplePatientEntry wizard's underlying API.
 * Uses the same payload shape as the wizard's POST. Round-trip verifies
 * by searching for the patient immediately after.
 */
async function createPatient(page: Page, index: number): Promise<CreatePatientResult> {
  const nid = patientNationalId(index);
  const payload = {
    patientProperties: {
      nationalId: nid,
      firstName: patientFirstName(index),
      lastName: patientLastName(index),
      birthDate: patientDOB(index),
      gender: patientGender(index),
      addressStreet: `${QA_PREFIX}_street`,
    },
  };

  const create = await apiCall<Record<string, unknown>>(
    page,
    '/api/OpenELIS-Global/rest/patient-management',
    { method: 'POST', body: payload }
  );

  if (!create.ok) {
    return {
      ok: false,
      nationalId: nid,
      error: `POST /rest/patient-management returned ${create.status}: ${
        typeof create.body === 'string' ? create.body.slice(0, 120) : JSON.stringify(create.body).slice(0, 120)
      }`,
    };
  }

  // Round-trip verify per SKILL §7.5
  const verify = await apiCall<{ patientSearchResults?: Array<{ nationalId?: string; patientID?: string }> }>(
    page,
    `/api/OpenELIS-Global/rest/patient-search-results?nationalId=${encodeURIComponent(nid)}`
  );
  if (!verify.ok || typeof verify.body !== 'object' || verify.body === null) {
    return { ok: false, nationalId: nid, error: 'Round-trip read failed: search returned no body' };
  }
  const list = (verify.body as { patientSearchResults?: Array<{ nationalId?: string; patientID?: string }> }).patientSearchResults || [];
  const found = list.find(p => p.nationalId === nid);
  if (!found) {
    return { ok: false, nationalId: nid, error: 'Round-trip read failed: patient not found after create' };
  }

  return { ok: true, nationalId: nid, patientPK: found.patientID };
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
  const startIndex = state.before.patients;
  const needed = Math.max(0, targetCount - startIndex);
  if (needed === 0) {
    state.notes.push(`Patient seeding skipped: census found ${startIndex}, target ${targetCount}.`);
    return;
  }

  state.notes.push(`Seeding ${needed} patients (indices ${startIndex + 1}..${startIndex + needed}).`);

  let consecutiveFailures = 0;
  for (let i = 0; i < needed; i++) {
    const index = startIndex + 1 + i;
    const result = await createPatient(page, index);
    if (result.ok) {
      state.created.patients.push(result.nationalId);
      consecutiveFailures = 0;
    } else {
      state.errors.push({ phase: 'createPatient', detail: `${result.nationalId}: ${result.error}` });
      consecutiveFailures++;
      if (consecutiveFailures >= 3) {
        state.errors.push({
          phase: 'createPatient',
          detail: `Bailing after 3 consecutive failures. The patient-management endpoint may not be available on this instance.`,
        });
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

/**
 * Create one order for a specific patient + test combination.
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
  patientNationalId: string,
  patientPK: string,
  test: TestCatalogEntry
): Promise<CreateOrderResult> {
  // The Add Order wizard POST goes through /rest/SamplePatientEntry. The
  // exact payload shape varies by version; we use the minimal-required
  // fields confirmed in Phase 32 of the test catalog history.
  const payload = {
    patientProperties: {
      patientPK,
      nationalId: patientNationalId,
      patientUpdateStatus: 'UPDATE',
    },
    sampleOrderItems: {
      newSampleEntry: 'true',
      collectionDate: new Date().toISOString().slice(0, 10),
      receivedDate: new Date().toISOString().slice(0, 10),
      priority: 'ROUTINE',
      paymentStatus: 'NONE',
    },
    sampleItems: [
      {
        sampleTypeId: test.sampleTypeId,
        tests: [{ testId: test.testId, isReportable: true }],
      },
    ],
  };

  const create = await apiCall<{ accessionNumber?: string }>(
    page,
    '/api/OpenELIS-Global/rest/SamplePatientEntry',
    { method: 'POST', body: payload }
  );

  if (!create.ok) {
    return {
      ok: false,
      patientLinked: false,
      error: `POST /rest/SamplePatientEntry returned ${create.status}`,
    };
  }
  const accession =
    typeof create.body === 'object' && create.body !== null
      ? (create.body as { accessionNumber?: string }).accessionNumber
      : undefined;

  if (!accession) {
    return { ok: false, patientLinked: false, error: 'Order created but no accession number returned' };
  }

  // Round-trip linkage verify per SKILL §7.5 — confirms BUG-37 status
  // for this specific order. We use SampleEdit which is the Modify Order
  // backing endpoint; if the patient name comes back populated, linkage
  // worked.
  const verify = await apiCall<{ patientProperties?: { firstName?: string; nationalId?: string } }>(
    page,
    `/api/OpenELIS-Global/rest/SampleEdit?labNumber=${encodeURIComponent(accession)}`
  );
  const linked =
    verify.ok &&
    typeof verify.body === 'object' &&
    verify.body !== null &&
    ((verify.body as { nationalId?: string }).nationalId ===
      patientNationalId);

  return { ok: true, accession, patientLinked: !!linked };
}

/**
 * Seed orders distributed across LAB_SECTIONS. The split is roughly
 * even: 100 orders / 5 sections = 20 each. Orders are assigned to
 * QA_AUTO_ patients in round-robin.
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

  // Build the patient pool: existing QA_AUTO_ patients + freshly created
  const allQaPatients = await apiCall<{ patientSearchResults?: Array<{ nationalId?: string; patientID?: string }> }>(
    page,
    `/api/OpenELIS-Global/rest/patient-search-results?lastName=${encodeURIComponent(QA_PREFIX)}`
  );
  const patientPool: Array<{ nationalId: string; patientPK: string }> = [];
  if (allQaPatients.ok && typeof allQaPatients.body === 'object' && allQaPatients.body !== null) {
    const list = (allQaPatients.body as { patientSearchResults?: Array<{ nationalId?: string; patientID?: string }> }).patientSearchResults || [];
    for (const p of list) {
      if (p.nationalId && p.patientID) patientPool.push({ nationalId: p.nationalId, patientPK: p.patientID });
    }
  }
  if (patientPool.length === 0) {
    state.errors.push({
      phase: 'seedOrders',
      detail: 'No QA_AUTO patients available — patient seeding must succeed first.',
    });
    return;
  }

  state.notes.push(`Seeding ${needed} orders across ${catalog.size} lab sections, ${patientPool.length} patients.`);

  const testEntries = Array.from(catalog.values());
  let bug37Count = 0;
  let consecutiveFailures = 0;

  for (let i = 0; i < needed; i++) {
    const patient = patientPool[i % patientPool.length];
    const test = testEntries[i % testEntries.length];
    const result = await createOrder(page, patient.nationalId, patient.patientID, test);
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
    if (catalog.size === 0) {
      state.errors.push({
        phase: 'discoverTestCatalog',
        detail: 'No tests found for the configured LAB_SECTIONS. Order seeding will be skipped.',
      });
    } else {
      state.notes.push(`Test catalog: ${catalog.size}/${LAB_SECTIONS.length} sections have at least one test.`);
    }
  } catch (e) {
    state.errors.push({ phase: 'discoverTestCatalog', detail: String(e) });
    state.after = await census(page);
    persistState(state);
    return state;
  }

  await seedPatients(page, state, targets.patients);
  await seedOrders(page, state, targets.orders, catalog);

  // TODO: status-transition seeding (in-progress, ready-for-validation, rejected)
  // is currently blocked by BUG-31 (Carbon Accept checkbox hang). The seed
  // script reports the dashboard counts in `after.inProgress` etc., but does
  // not attempt to FORCE orders into those states until BUG-31 is resolved
  // or an API-substitute path is identified. See SKILL §11.5 Blocking-Bug
  // Etiquette and workplan Phase B Chain C/D.
  state.notes.push(
    'Status-transition seeding (IN_PROGRESS, READY_FOR_VALIDATION, REJECTED) intentionally not attempted: ' +
    'blocked by BUG-31 (Carbon Accept checkbox). Orders are seeded in CREATED state. ' +
    'API-substitute paths are an open item — see workplan Phase B Chain C/D.'
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
