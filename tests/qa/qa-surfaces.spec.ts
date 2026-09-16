/**
 * tests/qa/qa-surfaces.spec.ts
 *
 * Every screen in the /qa module renders and reaches its own endpoint. Twenty-two routes
 * across four lanes: Overview, Quality Control, EQA, Quality Indicators, QMS.
 *
 * This is the layer the backend's own tests cannot reach. EQARestGuardMatrixTest and the
 * controller security slices already pin the guards; what they cannot see is a route that
 * silently falls through to another page, a lane whose screens stop calling their endpoint,
 * or a sidebar entry that leads somewhere empty.
 *
 * Run: npx playwright test -c qa.config.ts --project=qa-surfaces
 */
import { test, expect } from '@playwright/test';
import { QA_SURFACES, STUB_ROUTES, HEADLESS_ROUTES } from './_qa-surface-map';

const BASE = process.env.BASE ?? 'https://pngdemo.openelis-global.org';

interface Visit {
  status?: number;
  path: string;
  headings: string[];
  columns: string[];
  tabs: string[];
  buttons: string[];
  rows: number;
  rootLen: number;
  calls: string[];
  failedCalls: string[];
}

/**
 * Load a route and report what rendered and what it asked for.
 *
 * pngdemo serves an unbundled Vite DEV build: roughly 450 module requests land before React
 * mounts, so `networkidle` resolves in the middle of that and long before any data call.
 * Waiting on `#root > *` and then giving the data calls a fixed window is what makes these
 * assertions mean anything. An earlier census that used networkidle concluded the screens
 * were not wired to the API at all.
 */
async function visit(page: import('@playwright/test').Page, route: string): Promise<Visit> {
  const calls: string[] = [];
  const failedCalls: string[] = [];
  const onReq = (r: { url: () => string; method: () => string }) => {
    const u = r.url();
    if (u.includes('/rest/')) calls.push(`${r.method()} ${u.split('/rest/')[1]}`);
  };
  const onRes = (r: { url: () => string; status: () => number }) => {
    const u = r.url();
    if (u.includes('/rest/') && r.status() >= 400) failedCalls.push(`${r.status()} ${u.split('/rest/')[1]}`);
  };
  page.on('request', onReq);
  page.on('response', onRes);
  const resp = await page.goto(`${BASE}${route}`, { waitUntil: 'commit', timeout: 120_000 });
  await page.waitForSelector('#root > *', { timeout: 90_000 }).catch(() => undefined);
  await page.waitForTimeout(9000);
  const info = await page.evaluate(() => {
    const t = (e: Element | null) => (e?.textContent || '').trim().replace(/\s+/g, ' ');
    const main = document.querySelector('main') || document.body;
    return {
      path: location.pathname,
      headings: Array.from(main.querySelectorAll('h1,h2,h3')).map(t).filter((x) => x && x !== 'Still There?'),
      columns: Array.from(main.querySelectorAll('th'))
        .map((e) => t(e).replace(/Click to sort rows by .*? order\.?/g, '').trim()).filter(Boolean),
      tabs: Array.from(main.querySelectorAll('[role="tab"]')).map(t).filter(Boolean),
      buttons: Array.from(main.querySelectorAll('button')).map(t).filter(Boolean),
      rows: main.querySelectorAll('tbody tr').length,
      rootLen: (document.getElementById('root')?.innerHTML || '').length,
    };
  });
  page.off('request', onReq);
  page.off('response', onRes);
  return { status: resp?.status(), ...info, calls, failedCalls };
}

test.describe('QA module screens', () => {
  test('QA-S-00 — the target is serving the /qa module and we are signed in (CANARY)', async ({ page }) => {
    // NOT a tripwire, and deliberately first. Two failure modes make every assertion below
    // meaningless while still answering HTTP 200:
    //   1. Pointed at an instance without this module (testing.openelis-global.org has an
    //      older EQA at /EQAOrders; every /qa/* route there redirects away).
    //   2. A storageState captured against a different host — a logged-out app renders the
    //      login form and issues no data calls, which reads exactly like "nothing is wired".
    const r = await visit(page, '/qa/overview');
    expect(r.path, `landed on ${r.path}; this instance is not serving the /qa module, or the session is not valid on ${BASE}`).toBe('/qa/overview');
    expect(r.headings.join(' '), 'the app rendered rather than the login form').not.toMatch(/^Login/);
    expect(r.calls.join(' '), 'the overview reached its summary endpoint').toContain('qa/overview/summary');
  });

  for (const s of QA_SURFACES) {
    test(`QA-S-${s.lane}-${s.route.split('/').pop()} — ${s.label} (${s.route}) renders and calls its endpoint (FUNCTION)`, async ({ page }) => {
      const r = await visit(page, s.route);

      expect(r.status, `${s.route} answered`).toBe(200);
      expect(r.path, `${s.route} is its own route, not a fall-through`).toBe(s.route);
      expect(r.rootLen, `${s.route} rendered an application, not an empty shell`).toBeGreaterThan(10_000);

      if (s.heading) {
        expect(r.headings.join(' | '), `${s.label} heading`).toMatch(s.heading);
      }
      for (const tab of s.tabs ?? []) {
        expect(r.tabs.join(' | '), `${s.label} offers the "${tab}" tab`).toContain(tab);
      }
      for (const col of s.columns ?? []) {
        expect(r.columns.join(' | '), `${s.label} offers the "${col}" column`).toContain(col);
      }
      if (s.calls) {
        expect(r.calls.join(' '), `${s.label} calls ${s.calls}`).toContain(s.calls);
      }
      // A 4xx/5xx on a screen's own data call is a product failure, not an empty state.
      expect(r.failedCalls, `${s.label} made no failing REST calls`).toEqual([]);
    });
  }

  // ── Findings, pinned ─────────────────────────────────────────────────────────────────

  for (const route of STUB_ROUTES) {
    test(`QA-S-STUB-${route.split('/').pop()} — ${route} does something (SPEC)`, async ({ page }) => {
      test.fail(); // In the QC sidebar, and renders a heading and nothing else: no table, no
                   // controls, and no REST call of any kind. A user can navigate to it and
                   // gets no sign that it is unfinished.
      const r = await visit(page, route);
      const shellCalls = /site-branding|open-configuration|supportedlocales|properties|database-cleaning|menu|notifications|configuration-properties/;
      const ownCalls = r.calls.filter((c) => !shellCalls.test(c));
      const evidence = `columns=${r.columns.length} buttons=${r.buttons.length} ownRestCalls=${ownCalls.length}`;
      expect(
        r.columns.length + r.buttons.length + ownCalls.length,
        `${route} renders only the heading "${r.headings.join(' / ')}" (${evidence})`
      ).toBeGreaterThan(0);
    });
  }

  // RETRACTED 2026-09-16, and kept as a note rather than deleted.
  //
  // The census showed /qa/qc/alerts and /qa/qc/dashboard rendering an identical page with the
  // same tab list and the same instrument columns, and I read that as "the QC Alerts sidebar
  // link ignores its own tab". It does not. The pages look alike because the tab list and the
  // shell are shared; the SELECTED tab really does follow the route. The tripwire asserting
  // the Alerts tab was selected passed on its first run, which is exactly what a flip-when-fixed
  // marker is for — it went green against a product that was never broken.
  //
  // Two screens rendering the same chrome is not evidence about which tab is active. Read
  // aria-selected, not the tab list.

  for (const route of HEADLESS_ROUTES) {
    test(`QA-S-HEADING-${route.split('/').pop()} — ${route} names itself (SPEC)`, async ({ page }) => {
      test.fail(); // Renders no h1, h2 or h3 at all, where twenty of the twenty-two /qa screens
                   // do. A screen reader has nothing to announce for the page, and a user
                   // arriving by deep link has nothing to orient on. It is also a plain
                   // inconsistency inside one module.
      const r = await visit(page, route);
      expect(r.headings, `${route} renders a heading`).not.toEqual([]);
    });
  }
});
