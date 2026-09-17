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
import { QA_SURFACES, BREADCRUMB_TITLE_ROUTES } from './_qa-surface-map';

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
  headingTags: string[];
  ariaHeadings: number;
  titleIsHeading: boolean | null;
  biggestText: Array<{ tag: string; fs: number; txt: string }>;
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
      // Real heading ELEMENTS, excluding the session-timeout modal, which is present on every
      // route and is not the page's heading. `headings` above is text; this is the markup.
      headingTags: Array.from(main.querySelectorAll('h1,h2,h3,h4,h5,h6'))
        .filter((e) => (e.textContent || '').trim() !== 'Still There?')
        .map((e) => `${e.tagName}: ${(e.textContent || '').trim().slice(0, 50)}`),
      ariaHeadings: Array.from(main.querySelectorAll('[role="heading"]')).length,
      // The largest text actually painted, and — the part that matters — whether that element
      // sits inside a heading. A page can carry an <h4> section heading and still have no
      // heading on its TITLE, which is exactly the shape of the defect this catches, so
      // counting headings is not enough; the title element itself has to be checked.
      titleIsHeading: (() => {
        const painted = Array.from(main.querySelectorAll('*'))
          .filter((e) => e.children.length === 0 && (e.textContent || '').trim())
          .map((e) => ({ el: e, fs: parseFloat(getComputedStyle(e).fontSize) }))
          .filter((x) => x.fs >= 24 && (x.el.textContent || '').trim() !== 'Still There?')
          .sort((a, b) => b.fs - a.fs)[0];
        if (!painted) return null;
        return !!painted.el.closest('h1,h2,h3,h4,h5,h6,[role="heading"]');
      })(),
      biggestText: Array.from(main.querySelectorAll('*'))
        .filter((e) => e.children.length === 0 && (e.textContent || '').trim())
        .map((e) => ({ tag: e.tagName, fs: parseFloat(getComputedStyle(e).fontSize), txt: (e.textContent || '').trim().slice(0, 50) }))
        .filter((x) => x.fs >= 24 && x.txt !== 'Still There?')
        .sort((a, b) => b.fs - a.fs)
        .slice(0, 4),
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

  for (const route of BREADCRUMB_TITLE_ROUTES) {
    test(`QA-S-TITLE-${route.split('/').pop()} — ${route} marks its page title up as a heading (SPEC)`, async ({ page }) => {
      test.fail(); // The title is rendered by a `page-title-breadcrumb` component as a row of
                   // <button class="page-title-breadcrumb-link"> and
                   // <span class="page-title-breadcrumb-current"> at 28px — visually the largest
                   // text on the page and unmistakably its title — with no h1..h6 and no
                   // role="heading". The only heading in the DOM is the session-timeout modal.
                   //
                   // Three consequences, in the order a lab would meet them:
                   //   1. Heading navigation, which is how screen-reader users move around a
                   //      page, finds nothing here.
                   //   2. On /qa/qc/rule-config the outline starts at <h4> "Configured Rule
                   //      Sets" with nothing above it — a heading-order break as well as a
                   //      missing one.
                   //   3. There is no fallback: document.title is "OpenELIS" on every route, so
                   //      the page has no programmatic name at all.
                   //
                   // WCAG 1.3.1 Info and Relationships (A): a visual heading has to be marked up
                   // as one. The other twenty /qa screens already do it — /qa/eqa/management has
                   // <h2>Program Administration</h2> with <h4> sections beneath — so this is one
                   // component out of step, not a module-wide pattern.
                   //
                   // It also duplicates the real Carbon <nav class="cds--breadcrumb"> directly
                   // above it, so the fix can be as small as making the current segment an <h1>.
      const r = await visit(page, route);

      // Assert the SPEC, and say what was actually painted, so a failure reads as evidence.
      // The question is whether the page's OWN TITLE is a heading — not whether the page has
      // any heading at all. /qa/qc/rule-config has an <h4> for a section and would pass a
      // heading count while its title is still a row of buttons.
      const biggest = r.biggestText[0];
      expect(
        r.titleIsHeading,
        `${route} paints its title as ${biggest ? `<${biggest.tag}> at ${biggest.fs}px ("${biggest.txt}")` : 'no large text'}, `
        + `which is not inside any heading element. Headings present: ${JSON.stringify(r.headingTags)}`
      ).toBe(true);
    });
  }
});
