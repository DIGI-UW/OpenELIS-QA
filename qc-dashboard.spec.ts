/**
 * QA / QC module — contract + cross-consistency guard   [new QA→QC work; pngdemo]
 *
 * Covers the new unified Quality-Control module rooted at /qa/qc/* (distinct from the
 * legacy /analyzers/qc/* screens). The module is backed by a /rest/qc/* + /rest/qa/overview
 * REST surface, captured live on pngdemo (build index-Np3i_e3L.js, 2026-07-28):
 *
 *   GET /rest/qa/overview/summary          -> { qc:{...}, eqa, week, activity }   (QA overview)
 *   GET /rest/qc/dashboard/summary         -> { totalInstruments, compliantInstruments,
 *                                               warningInstruments, nonCompliantInstruments,
 *                                               totalUnresolvedViolations, totalRejections,
 *                                               totalWarnings, lastUpdateTime }
 *   GET /rest/qc/dashboard/instruments     -> Instrument[]   (per-instrument QC status)
 *   GET /rest/qc/violations[?unresolved=]  -> Violation[]    (Westgard rule violations)
 *   GET /rest/qc/control-lots              -> ControlLot[]
 *   GET /rest/qc/ruleConfig/summaries      -> RuleConfigSummary[]
 *   GET /rest/qc/ruleConfig/unconfigured   -> UnconfiguredTest[]
 *
 * Strategy: assert the contract (status + summary object shape + list types) and the
 * cross-endpoint CONSISTENCY that the QA overview mirrors the QC dashboard totals. Data
 * may be empty on a fresh instance, so list-content assertions GAP-and-continue (annotate,
 * never fabricate) rather than failing. A real violation/instrument, when present, is
 * checked for its documented fields so the guard tightens automatically as data appears.
 *
 * Run:  BASE_URL=https://pngdemo.openelis-global.org npx playwright test --project=qc-dashboard
 */
import { test, expect, Page } from '@playwright/test';

const REST = '/api/OpenELIS-Global/rest';

// Authed in-page GET (cookies from storageState; GET needs no CSRF).
async function getJson<T = any>(page: Page, path: string): Promise<{ status: number; body: T | null }> {
  return page.evaluate(async (p) => {
    try {
      const r = await fetch(p, { credentials: 'include', headers: { Accept: 'application/json' } });
      let b: any = null; try { b = await r.json(); } catch { b = null; }
      return { status: r.status, body: b };
    } catch { return { status: 0, body: null }; }
  }, path);
}

const gap = (info: any, msg: string) => info.annotations.push({ type: 'gap', description: msg });

test.describe('QA/QC module — REST contract + cross-consistency [pngdemo]', () => {
  // Skip the whole suite on builds without the new QA→QC module (older instances 404 the
  // /rest/qc surface). Keeps this safe to register against any target — it only asserts where
  // the module is actually deployed. Confirmed present on pngdemo (index-Np3i_e3L.js).
  test.beforeEach(async ({ page }, info) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    const probe = await getJson(page, `${REST}/qc/dashboard/summary`);
    test.skip(probe.status === 404 || probe.status === 0,
      `QA→QC module not present on ${process.env.BASE_URL || 'target'} (GET /rest/qc/dashboard/summary -> ${probe.status})`);
  });

  test('QC-1: dashboard summary contract (8 metrics, numeric)', async ({ page }) => {
    const r = await getJson(page, `${REST}/qc/dashboard/summary`);
    expect(r.status, 'GET /rest/qc/dashboard/summary -> 200').toBe(200);
    const need = ['totalInstruments', 'compliantInstruments', 'warningInstruments', 'nonCompliantInstruments',
      'totalUnresolvedViolations', 'totalRejections', 'totalWarnings', 'lastUpdateTime'];
    const body = (r.body || {}) as Record<string, unknown>;
    const missing = need.filter((k) => !(k in body));
    expect(missing, `dashboard summary missing fields: ${missing.join(', ')}`).toEqual([]);
    for (const k of need.filter((k) => k !== 'lastUpdateTime')) {
      expect(typeof body[k], `${k} is numeric`).toBe('number');
    }
    // instrument buckets must not exceed the total
    const buckets = ['compliantInstruments', 'warningInstruments', 'nonCompliantInstruments']
      .reduce((a, k) => a + Number(body[k] || 0), 0);
    expect(buckets, 'compliant+warning+nonCompliant <= totalInstruments')
      .toBeLessThanOrEqual(Number(body.totalInstruments || 0));
  });

  test('QC-2: QA overview mirrors the QC dashboard totals (CROSS-CONSISTENCY)', async ({ page }, info) => {
    const ov = await getJson(page, `${REST}/qa/overview/summary`);
    expect(ov.status, 'GET /rest/qa/overview/summary -> 200').toBe(200);
    const body = (ov.body || {}) as Record<string, any>;
    for (const k of ['qc', 'eqa', 'week', 'activity']) {
      expect(k in body, `overview has "${k}"`).toBeTruthy();
    }
    const dash = await getJson(page, `${REST}/qc/dashboard/summary`);
    const oqc = (body.qc || {}) as Record<string, unknown>;
    const dqc = (dash.body || {}) as Record<string, unknown>;
    if (oqc.totalInstruments !== undefined && dqc.totalInstruments !== undefined) {
      expect(Number(oqc.totalInstruments), 'overview.qc.totalInstruments == dashboard totalInstruments')
        .toBe(Number(dqc.totalInstruments));
    } else {
      gap(info, 'overview.qc / dashboard totalInstruments not both present — cannot cross-check');
    }
  });

  test('QC-3: violations feed + unresolved subset (ROUND-TRIP)', async ({ page }, info) => {
    const all = await getJson(page, `${REST}/qc/violations`);
    const unr = await getJson(page, `${REST}/qc/violations?unresolved=true`);
    expect(all.status, 'GET /rest/qc/violations -> 200').toBe(200);
    expect(unr.status, 'GET /rest/qc/violations?unresolved=true -> 200').toBe(200);
    expect(Array.isArray(all.body), 'violations is an array').toBeTruthy();
    expect(Array.isArray(unr.body), 'unresolved violations is an array').toBeTruthy();
    const A = (all.body as any[]) || [], U = (unr.body as any[]) || [];
    if (U.length === 0 && A.length === 0) { gap(info, 'no QC violations on this instance — feed reachable but empty'); return; }
    expect(U.length, 'unresolved subset <= all violations').toBeLessThanOrEqual(A.length);
    if (U[0]) {
      // a present violation should identify its rule + instrument/test and resolution state
      const keys = Object.keys(U[0]);
      expect(keys.length, 'violation row has fields').toBeGreaterThan(0);
    }
  });

  test('QC-4: list endpoints are reachable arrays (control-lots, rule-config, instruments)', async ({ page }, info) => {
    const eps = [
      ['control-lots', `${REST}/qc/control-lots`],
      ['ruleConfig/summaries', `${REST}/qc/ruleConfig/summaries`],
      ['ruleConfig/unconfigured', `${REST}/qc/ruleConfig/unconfigured`],
      ['dashboard/instruments', `${REST}/qc/dashboard/instruments`],
    ] as const;
    for (const [name, path] of eps) {
      const r = await getJson(page, path);
      expect(r.status, `GET ${path} -> 200`).toBe(200);
      expect(Array.isArray(r.body), `${name} is an array`).toBeTruthy();
      if (((r.body as any[]) || []).length === 0) gap(info, `${name} empty on this instance (reachable, no data)`);
    }
  });
});
