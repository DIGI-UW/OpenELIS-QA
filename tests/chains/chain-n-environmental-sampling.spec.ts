/**
 * tests/chains/chain-n-environmental-sampling.spec.ts
 *
 * SKILL §11 Chain N — Environmental Sampling (NEW domain, v3.2.1.10+)
 *
 * DEEP ROUND-TRIP rewrite (v6.15). Companion to Chain M. The previous version
 * was render-only and probed guessed `displayList/COMPLIANCE_STANDARD`
 * endpoints that 404'd. This version drives the REAL endpoints captured live
 * on indonesiadev v3.2.1.10 (2026-06-18) and verifies the order CREATE landed
 * by reading it back.
 *
 * Captured endpoints (see _common.ts VE_* + vector-env-api-captures.md):
 *   - CREATE   POST /rest/SamplePatientEntry  (shared w/ clinical+vector; then GET /rest/order/search)
 *   - READBACK GET  /rest/SampleEdit?labNumber=<acc>   (legacy edit model, carries sampleXML)
 *   - DICTS    GET  /rest/admin/vector/sampling-sites/active
 *              GET  /rest/vector/dictionary/env-collection-methods
 *              GET  /rest/vector/dictionary/env-weather
 *              GET  /rest/vector/dictionary/sample-containers
 *              GET  /rest/environmental-sample-types
 *              GET  /rest/compliance/standards/active
 *
 * Round-trip / landing-check design (S7.6):
 *   1. Order-entry dictionaries all populate (FUNCTION) — the form's backing lists.
 *   2. Compliance standards populate (FUNCTION).
 *   3. Per-sample manifest building blocks (sample types + containers) populate (FUNCTION).
 *   4. Create -> read-back (ROUND-TRIP) + OGC-1048 collection-date persistence watch.
 *   5. Environmental results route through the shared Results screen (CROSS-LINK).
 *
 * Resilience: when the environmental domain is absent (older build -> 404) the
 * affected step records GAP and continues; it never fabricates a pass. The
 * create leg attempts a best-effort payload and, on a body-shape rejection
 * (4xx), records GAP with the confirmed endpoint rather than failing the chain.
 *
 * Known-bug regression watch: OGC-1048 (default collection date not bound to
 * form state -> dropped on save unless re-picked).
 *
 * Run individually:  npx playwright test --project=chain-n
 */

import { test, expect } from '@playwright/test';
import {
  BASE,
  apiCall,
  markStep,
  VE_CREATE,
  VE_ENV_SAMPLING_SITES,
  VE_ENV_COLLECTION_METHODS,
  VE_ENV_WEATHER,
  VE_ENV_CONTAINERS,
  VE_ENV_SAMPLE_TYPES,
  VE_ENV_COMPLIANCE,
} from './_common';
import { buildEnvOrderPayload, ddMMyyyy } from './env-order-payload';

interface ListProbe { name: string; path: string; n: number; ok: boolean; status: number; }

/** GET -> {status:true, body:"DEV…"} — how the wizard's "Generate Lab Number" gets an accession. */
const ACCESSION_GENERATOR = '/api/OpenELIS-Global/rest/SampleEntryGenerateScanProvider';
const ORDER_DASHBOARD = '/api/OpenELIS-Global/rest/order/dashboard';

interface DashboardOrder { labNumber?: string }
interface DashboardPage { orders?: DashboardOrder[]; totalCount?: number }

async function probeList(page: import('@playwright/test').Page, name: string, path: string): Promise<ListProbe> {
  const r = await apiCall<unknown[]>(page, path);
  const n = Array.isArray(r.body) ? r.body.length : 0;
  return { name, path, n, ok: r.ok, status: r.status };
}

test.describe.serial('Chain N — Environmental Sampling (deep round-trip)', () => {
  let domainPresent = true;
  let createdAccession: string | null = null;

  test.beforeAll(() => {
    // eslint-disable-next-line no-console
    console.log(`[Chain N] BASE=${BASE}`);
  });

  // ---------------------------------------------------------------------------
  // Step 1 — Order-entry dictionaries all populate (FUNCTION)
  // ---------------------------------------------------------------------------
  test('Step 1 — Environmental order-entry dictionaries populate (FUNCTION)', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('domcontentloaded');
    const probes = await Promise.all([
      probeList(page, 'sampling-sites', VE_ENV_SAMPLING_SITES),
      probeList(page, 'collection-methods', VE_ENV_COLLECTION_METHODS),
      probeList(page, 'weather', VE_ENV_WEATHER),
      probeList(page, 'containers', VE_ENV_CONTAINERS),
      probeList(page, 'sample-types', VE_ENV_SAMPLE_TYPES),
    ]);
    const detail = probes.map(p => `${p.name}=${p.ok ? p.n : 'HTTP ' + p.status}`).join(', ');
    const reachable = probes.filter(p => p.ok).length;
    const populated = probes.filter(p => p.ok && p.n > 0).length;

    if (reachable === 0) {
      domainPresent = false;
      markStep('N', 1, 'GAP',
        `No environmental dictionary endpoint reachable — env domain absent on this build (${detail})`,
        'Confirmed present on indonesiadev v3.2.1.10.');
      test.info().annotations.push({ type: 'gap', description: 'env domain absent' });
      return;
    }
    if (populated >= 4) {
      markStep('N', 1, 'PASS', `Environmental dictionaries populated (${detail})`);
      expect(populated).toBeGreaterThanOrEqual(4);
    } else {
      markStep('N', 1, 'FAIL',
        `Some env dictionaries reachable but empty (${detail})`,
        'The order form would render with empty dropdowns.');
      expect(populated, 'populated env dictionaries').toBeGreaterThanOrEqual(4);
    }
  });

  // ---------------------------------------------------------------------------
  // Step 2 — Compliance standards populate (FUNCTION)
  // ---------------------------------------------------------------------------
  test('Step 2 — Applicable compliance standards populate (FUNCTION)', async ({ page }) => {
    if (!domainPresent) { markStep('N', 2, 'GAP', 'Skipped — env domain absent (see Step 1)'); return; }
    await page.goto(BASE);
    const p = await probeList(page, 'compliance', VE_ENV_COMPLIANCE);
    if (p.ok && p.n > 0) {
      markStep('N', 2, 'PASS', `Compliance standards populated (n=${p.n})`);
      expect(p.n).toBeGreaterThan(0);
    } else if (p.ok) {
      markStep('N', 2, 'GAP', 'Compliance standards endpoint reachable but empty — none configured on this instance',
        `GET ${VE_ENV_COMPLIANCE}`);
      test.info().annotations.push({ type: 'gap', description: 'no compliance standards configured' });
    } else {
      markStep('N', 2, 'GAP', `Compliance standards endpoint HTTP ${p.status}`, `GET ${VE_ENV_COMPLIANCE}`);
      test.info().annotations.push({ type: 'gap', description: `compliance HTTP ${p.status}` });
    }
  });

  // ---------------------------------------------------------------------------
  // Step 3 — Per-sample manifest building blocks (FUNCTION)
  // ---------------------------------------------------------------------------
  test('Step 3 — Per-sample manifest sample-types + containers populate (FUNCTION)', async ({ page }) => {
    if (!domainPresent) { markStep('N', 3, 'GAP', 'Skipped — env domain absent (see Step 1)'); return; }
    await page.goto(BASE);
    const types = await probeList(page, 'sample-types', VE_ENV_SAMPLE_TYPES);
    const containers = await probeList(page, 'containers', VE_ENV_CONTAINERS);
    if (types.ok && types.n > 0 && containers.ok && containers.n > 0) {
      markStep('N', 3, 'PASS',
        `Manifest grid backed: ${types.n} sample types, ${containers.n} containers (one row = one physical sample, each carries its own GPS + container)`);
      expect(types.n).toBeGreaterThan(0);
      expect(containers.n).toBeGreaterThan(0);
    } else {
      markStep('N', 3, 'GAP',
        `Manifest dropdowns incomplete (sample-types=${types.ok ? types.n : 'HTTP ' + types.status}, containers=${containers.ok ? containers.n : 'HTTP ' + containers.status})`);
      test.info().annotations.push({ type: 'gap', description: 'manifest dropdowns incomplete' });
    }
  });

  // ---------------------------------------------------------------------------
  // Step 4 — Create -> read-back (ROUND-TRIP)
  //
  // REWRITTEN 2026-09-03 (OGC-1192). The previous version posted a
  // hand-written "best-effort minimal envelope" that omitted the requester,
  // so every run got HTTP 400, recorded GAP, and returned. This chain's only
  // write path had never executed. The payload now comes from
  // env-order-payload.ts — captured from a real browser save and verified by
  // replay. If the create fails now, that is a REAL defect, not a fixture gap.
  // ---------------------------------------------------------------------------
  test('Step 4 — Env order create -> read-back (ROUND-TRIP)', async ({ page }) => {
    if (!domainPresent) { markStep('N', 4, 'GAP', 'Skipped — env domain absent (see Step 1)'); return; }
    await page.goto(BASE);

    const gen = await apiCall<{ status?: boolean; body?: string }>(page, ACCESSION_GENERATOR);
    const labNo = (gen.body && typeof gen.body === 'object')
      ? (gen.body as { body?: string }).body
      : undefined;
    if (!gen.ok || !labNo) {
      markStep('N', 4, 'FAIL',
        `Could not generate an accession (HTTP ${gen.status})`,
        `GET ${ACCESSION_GENERATOR} should return {status:true, body:"DEV…"}`);
      return;
    }

    const date = ddMMyyyy();
    const payload = buildEnvOrderPayload({ labNo, date });
    const post = await apiCall(page, VE_CREATE, { method: 'POST', body: payload });

    if (!post.ok) {
      // No GAP escape hatch here on purpose. The payload is known-good, so a
      // non-2xx is a regression in the create path itself.
      markStep('N', 4, 'FAIL',
        `Env order create returned HTTP ${post.status} with the verified payload`,
        `POST ${VE_CREATE} for ${labNo}. Body shape confirmed working on v3.2.2.0 2026-09-03; if the contract changed, re-capture per the header of env-order-payload.ts.`);
      return;
    }

    createdAccession = labNo;

    // Landing check: the sample must be readable back. NOTE: SampleEdit is the
    // endpoint that 500s on patientless samples (OGC-1192 §2), so this leg
    // doubles as the regression watch for that bug.
    const readback = await apiCall<{ sampleXML?: string; noSampleFound?: boolean }>(
      page, `/api/OpenELIS-Global/rest/SampleEdit?accessionNumber=${encodeURIComponent(labNo)}`);

    if (readback.status >= 500) {
      markStep('N', 4, 'FAIL',
        `Env order ${labNo} created (200) but SampleEdit read-back returned HTTP ${readback.status}`,
        'OGC-1192 §2: patientless samples crash patient-joining code. A nonexistent accession returns 200 + noSampleFound:true, so this 500 is specific to "exists but has no patient". When OGC-1192 is fixed this becomes a pass.');
      return;
    }

    const body = (readback.body && typeof readback.body === 'object') ? readback.body as Record<string, unknown> : {};
    if (body.noSampleFound === true) {
      markStep('N', 4, 'FAIL',
        `Env order ${labNo} created (200) but SampleEdit reports noSampleFound`,
        'The create claimed success and the row did not land.');
      return;
    }

    const hasSamples = typeof body.sampleXML === 'string' && (body.sampleXML as string).length > 0;
    if (!hasSamples) {
      markStep('N', 4, 'FAIL',
        `Env order ${labNo} read back without a sampleXML payload (HTTP ${readback.status})`,
        'Order did not land with its manifest.');
      return;
    }

    markStep('N', 4, 'PASS', `Env order ${labNo} created and read back with its manifest intact`);
    expect(hasSamples).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // Step 5 — Environmental results route through the normal Results screen (CROSS-LINK)
  // ---------------------------------------------------------------------------
  test('Step 5 — Environmental results use the shared Results screen (CROSS-LINK)', async ({ page }) => {
    await page.goto(BASE);
    const lb = await apiCall<{ testResult?: unknown[] }>(page, '/api/OpenELIS-Global/rest/LogbookResults');
    if (lb.ok) {
      markStep('N', 5, 'PASS',
        'LogbookResults reachable — environmental results use the shared Results module (no env-specific results page, by design)');
      expect(lb.ok).toBeTruthy();
    } else {
      markStep('N', 5, 'BLOCKED', `LogbookResults HTTP ${lb.status}`);
      test.info().annotations.push({ type: 'blocked', description: 'results surface unreachable' });
    }
  });

  // ---------------------------------------------------------------------------
  // Step 6 — The order we just created is VISIBLE on the dashboard (OGC-1192)
  //
  // NEW 2026-09-03. Before this, nothing in the entire repo asserted
  // /rest/order/dashboard — `grep -rn "order/dashboard"` returned zero hits in
  // any domain. app-route-census visits /order/environmental but only checks
  // that the page paints chrome and raises no 5xx, which an empty "No orders
  // found" table passes. That is the oracle gap that let OGC-1192 through.
  // ---------------------------------------------------------------------------
  test('Step 6 — Created env order is visible on the dashboard (OGC-1192)', async ({ page }) => {
    if (!domainPresent) { markStep('N', 6, 'GAP', 'Skipped — env domain absent (see Step 1)'); return; }
    if (!createdAccession) {
      markStep('N', 6, 'FAIL', 'No accession from Step 4 to look for — Step 4 must pass before visibility can be judged');
      return;
    }
    await page.goto(BASE);

    const envList = await apiCall<DashboardPage>(page, `${ORDER_DASHBOARD}?page=1&pageSize=100&workflowType=environmental`);
    const allList = await apiCall<DashboardPage>(page, `${ORDER_DASHBOARD}?page=1&pageSize=100`);

    const envBody = (envList.body && typeof envList.body === 'object') ? envList.body as DashboardPage : { orders: [], totalCount: 0 };
    const allBody = (allList.body && typeof allList.body === 'object') ? allList.body as DashboardPage : { orders: [], totalCount: 0 };
    const inEnv = (envBody.orders ?? []).some(o => o.labNumber === createdAccession);
    const inAll = (allBody.orders ?? []).some(o => o.labNumber === createdAccession);

    if (inEnv) {
      markStep('N', 6, 'PASS',
        `${createdAccession} appears on the environmental dashboard (envTotal=${envBody.totalCount})`);
      expect(inEnv).toBeTruthy();
      return;
    }

    markStep('N', 6, 'FAIL',
      `${createdAccession} saved with HTTP 200 but does not appear on the environmental dashboard`,
      `OGC-1192 §1. envTotal=${envBody.totalCount}, unfilteredTotal=${allBody.totalCount}, presentInUnfiltered=${inAll}. ` +
      'Absent from the unfiltered list too means this is not a workflowType filter problem — the row never enters the ' +
      'dashboard result set. Likely the query joins through patient, which excludes every patientless (i.e. every ' +
      'environmental) sample. When OGC-1192 is fixed this flips to PASS.');
  });
});
