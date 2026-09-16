/**
 * tests/eqa/eqa-surfaces.spec.ts
 *
 * The EQA screens as they ship: each registered route renders its own heading, and each page
 * calls the endpoint it is supposed to call. This is the census turned into assertions.
 *
 * Two things this file exists to prevent, both of which happened while writing it:
 *
 *  1. A census run with a storageState captured against a DIFFERENT host silently measures a
 *     logged-OUT app: every route answers 200, lands on /login, renders zero rows and issues
 *     no EQA calls. That reads exactly like "the EQA pages are not wired to the API". Hence
 *     EQA-S-00, which fails loudly rather than letting the rest report a fiction.
 *
 *  2. Guessing route names. /MyPrograms is not a route -- it is /EQAMyPrograms -- and the
 *     guess falls through to the legacy JSP shell and renders nothing. The list below is the
 *     set App.jsx actually registers as SecureRoute exact.
 *
 * Run: npx playwright test -c eqa.config.ts --project=eqa-surfaces
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.BASE ?? 'https://testing.openelis-global.org';

interface Surface {
  route: string;
  heading: RegExp;
  /** A substring of the EQA endpoint this page must call. */
  calls: string;
  /** Column headers the table must offer, when the page has one. */
  columns?: string[];
}

const SURFACES: Surface[] = [
  { route: '/EQAResults', heading: /EQA Results/i, calls: 'eqa/orders',
    columns: ['Lab Number', 'Programme', 'Provider', 'Priority', 'Status', 'Deadline'] },
  { route: '/EQAOrders', heading: /EQA Orders/i, calls: 'eqa/orders',
    columns: ['Lab Number', 'EQA Program', 'Provider', 'Status', 'Deadline', 'Priority', 'Date Entered'] },
  { route: '/EQAMyPrograms', heading: /My EQA Programs/i, calls: 'eqa/my-programs',
    columns: ['Program Name', 'Provider', 'Lab Unit(s)', 'Tests', 'Panels', 'Status'] },
  { route: '/EQAParticipants', heading: /Participants/i, calls: 'eqa/programs' },
  { route: '/EQADistribution', heading: /EQA Distribution/i, calls: 'eqa/distributions' },
];

/** Load a route and report what rendered and which REST calls it made. */
async function visit(page: import('@playwright/test').Page, route: string) {
  const calls: string[] = [];
  const onReq = (r: { url: () => string; method: () => string }) => {
    const u = r.url();
    if (u.includes('/rest/')) calls.push(`${r.method()} ${u.split('/rest/')[1]}`);
  };
  page.on('request', onReq);
  const resp = await page.goto(`${BASE}${route}`, { waitUntil: 'commit', timeout: 120_000 });
  // The EQA box serves an unbundled Vite dev build: ~450 module requests land before React
  // mounts, so networkidle fires in the middle of that and long before any data call.
  await page.waitForSelector('#root > *', { timeout: 90_000 }).catch(() => undefined);
  await page.waitForTimeout(8000);
  const info = await page.evaluate(() => {
    const t = (e: Element | null) => (e?.textContent || '').trim().replace(/\s+/g, ' ');
    return {
      path: location.pathname,
      headings: Array.from(document.querySelectorAll('h1,h2,h3')).map(t).filter((x) => x && x !== 'Still There?'),
      columns: Array.from(document.querySelectorAll('th'))
        .map((e) => t(e).replace(/Click to sort rows by .*? order\.?/g, '').trim()).filter(Boolean),
      rootLen: (document.getElementById('root')?.innerHTML || '').length,
    };
  });
  page.off('request', onReq);
  return { status: resp?.status(), calls, ...info };
}

test.describe('EQA screens', () => {
  test('EQA-S-00 — the session is authenticated against THIS host (CANARY)', async ({ page }) => {
    // NOT a tripwire, and deliberately first. Every assertion below is meaningless if the
    // run is looking at a login page, and a login page answers 200 for any route.
    const r = await visit(page, '/EQAOrders');
    expect(r.path, `landed on ${r.path}; a redirect to /login or /api/OpenELIS-Global/** means the storageState is not a session on ${BASE}`).toBe('/EQAOrders');
    expect(r.headings.join(' '), 'the app rendered rather than the login form').not.toMatch(/^Login/);
  });

  for (const s of SURFACES) {
    test(`EQA-S-${s.route.replace(/\W/g, '')} — ${s.route} renders and calls ${s.calls} (FUNCTION)`, async ({ page }) => {
      const r = await visit(page, s.route);
      expect(r.status, `${s.route} answered`).toBe(200);
      expect(r.path, `${s.route} is a registered React route, not a fall-through to the legacy shell`).toBe(s.route);
      expect(r.rootLen, `${s.route} rendered something`).toBeGreaterThan(1000);
      expect(r.headings.join(' | '), `${s.route} heading`).toMatch(s.heading);
      expect(r.calls.join(' '), `${s.route} calls ${s.calls}`).toContain(s.calls);
      for (const col of s.columns ?? []) {
        expect(r.columns.join(' | '), `${s.route} offers the "${col}" column`).toContain(col);
      }
    });
  }
});
