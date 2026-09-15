/**
 * OGC-1134 — Test Catalog list search must debounce.
 *
 * TICKET ACCEPTANCE CRITERIA, quoted verbatim so the developer can read them from the test:
 *
 *   "typing a multi-character term issues at most one GET /rest/test-catalog/tests?search=
 *    after the user pauses (verify in the network panel); no query for a single character;
 *    results don't flicker/regress mid-type"
 *
 * and the three refinements the ticket asks for:
 *
 *   1. debounce ~300-400 ms      — only query after the user pauses, not per letter
 *   2. minimum query length 2-3  — do not query on a single character
 *   3. cancel in-flight requests — abort the previous query when a new one starts, so a slow
 *                                  earlier response cannot overwrite newer results
 *
 * HOW TO READ A test.fail() HERE
 * Same convention as tests/order-entry-release-blockers.spec.ts. Each case asserts the SPEC
 * — what the product must do — and a case that the product does not yet satisfy is marked
 * `test.fail()`. Playwright reports an expected failure as a pass, so the suite stays green
 * while the gap is open and goes RED the moment it closes. The fix for a red one is to
 * delete the `test.fail()` line and keep the assertion. Never relax the assertion.
 *
 * IS IT IMPLEMENTED? YES — ALL THREE REFINEMENTS, AND THE LAST ONE LANDED THIS WEEK.
 * Measured on two different develop frontend builds on 2026-09-15, same harness, same
 * stack, same instance, admin, /MasterListsPage/TestCatalogList. Two builds, opposite
 * results on one criterion, identical on the others:
 *
 *   itechuw/openelis-global-2-frontend:develop, image built 2026-09-11
 *     typing "amylase" at 120 ms/char : 0 requests while typing, 1 after the pause
 *                                       GET .../tests?search=amylase&page=1&pageSize=25
 *     typing "a" alone                : 1 request
 *                                       GET .../tests?search=a&page=1&pageSize=25   <- BAD
 *     requestfailed events            : 0
 *
 *   itechuw/openelis-global-2-frontend:develop, image pulled 2026-09-15 (same day)
 *     typing "amylase" at 120 ms/char : 1 request, "amylase"
 *     typing "a" alone                : 0 requests                                  <- FIXED
 *     typing "gluc"                   : 1 request, "gluc"; requestfailed events: 0
 *
 * THE BRIEFING FOR THIS WORK SAID "today it fires one request per keystroke (amylase = 7
 * requests)". THAT IS NOT WHAT THE PRODUCT DOES, on either build. The numbers above are the
 * measurement; the ticket's 7 is a description of `testing` at filing time.
 *
 * Refinements 1 (debounce) and 3 (abort) shipped in PR #3714, merged 2026-06-15 — before
 * this ticket was filed against `testing`, which is why the ticket and the product have
 * disagreed from the start. Refinement 2 (minimum length) shipped in PR #4299, merged to
 * develop as c978980 on 2026-09-14; the 2026-09-11 image predates it and the 2026-09-15
 * image contains it, which is the two-build evidence above.
 *
 * SO NO CASE HERE CARRIES A test.fail(). All three assert the acceptance criteria as
 * permanent truths and guard them against regression. TCS-2 was written with a
 * FLIP-WHEN-FIXED marker against the older image and the marker was removed when the newer
 * image reported "Expected to fail, but passed" — which is the flip-when-fixed convention
 * doing exactly its job, in the space of one afternoon.
 *
 * ON CANCELLATION (refinement 3): it is NOT directly observable from this page. With a
 * ~300 ms debounce and human-speed typing no two searches are ever in flight at once, so
 * nothing is ever aborted and `page.on('requestfailed')` sees zero events — 0 aborts is
 * indistinguishable from "abort is not implemented". Rather than assert something that
 * would pass for the wrong reason, TCS-3 asserts the CONSEQUENCE the ticket cares about:
 * the settled result set matches the final term and does not regress to a prefix.
 */
import { test, expect, Page } from '@playwright/test';

const BASE = process.env.BASE_URL || process.env.BASE || 'https://testing.openelis-global.org';
const LIST = '/MasterListsPage/TestCatalogList?page=1&pageSize=25';
const SEARCH_BOX = '#test-search';

/** Every GET the page makes to the catalog list endpoint, in order. */
type Shot = { url: string; search: string | null; at: number };

/**
 * Record the real network traffic to the search endpoint.
 *
 * Filtered on the PATH only, so a change to the query string cannot make requests vanish
 * from the count and read as a debounce that is not there. `aborted` is recorded separately
 * for refinement 3.
 */
function recorder(page: Page) {
  const seen: Shot[] = [];
  const aborted: string[] = [];
  page.on('request', (r) => {
    if (r.method() !== 'GET') return;
    const u = r.url();
    if (!/\/rest\/test-catalog\/tests(\?|$)/.test(u)) return;
    seen.push({ url: u, search: new URL(u).searchParams.get('search'), at: Date.now() });
  });
  page.on('requestfailed', (r) => {
    if (/\/rest\/test-catalog\/tests(\?|$)/.test(r.url())) aborted.push(r.failure()?.errorText || 'unknown');
  });
  return { seen, aborted, searches: () => seen.filter((s) => s.search !== null) };
}

/**
 * Open the list and assert it actually rendered before any counting starts.
 *
 * This is the guard that stops every case below from passing for the wrong reason. A count
 * of zero search requests is the PASS condition for TCS-2 and half the evidence for TCS-1,
 * and a page that never loaded, an expired session redirected to login, or a renamed
 * endpoint would all produce zero just as convincingly as a working debounce.
 */
async function openList(page: Page, rec: ReturnType<typeof recorder>) {
  await page.goto(`${BASE}${LIST}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!localStorage.getItem('CSRF'), null, { timeout: 15000 });
  await expect(
    page.locator(SEARCH_BOX),
    'the Test Catalog search box rendered (without it nothing below is measuring the search)',
  ).toBeVisible({ timeout: 20000 });
  await expect
    .poll(() => page.locator('table tbody tr').count(), { timeout: 20000 })
    .toBeGreaterThan(0);
  // The unfiltered load must have hit the endpoint this file is counting. If it did not,
  // the filter above is wrong and every "0 requests" result below would be an artefact.
  await expect
    .poll(() => rec.seen.length, { timeout: 15000 })
    .toBeGreaterThan(0);
}

/** Type a term one character at a time at a realistic speed, then wait past the debounce. */
async function typeTerm(page: Page, term: string, perChar = 120, settle = 3000) {
  const box = page.locator(SEARCH_BOX);
  await box.click();
  await box.pressSequentially(term, { delay: perChar });
  await page.waitForTimeout(settle);
}

test.describe('OGC-1134 — Test Catalog search debounce', () => {
  test('TCS-1: typing a multi-character term issues exactly one search request, after the pause', async ({ page }) => {
    // Acceptance criterion 1: "typing a multi-character term issues at most one
    // GET /rest/test-catalog/tests?search= after the user pauses".
    //
    // Asserted as EXACTLY one, not "at most one": zero would also satisfy "at most one" and
    // zero is what a broken page, a dead endpoint or a wrong URL filter all produce. A
    // search that never searches is not a debounce.
    const rec = recorder(page);
    await openList(page, rec);

    const before = rec.searches().length;
    await typeTerm(page, 'amylase');
    const shots = rec.searches().slice(before);

    console.log(`TCS-1 search requests for "amylase" = ${shots.length}: ` +
      JSON.stringify(shots.map((s) => s.search)));

    expect(
      shots.length,
      `typing the 7 characters of "amylase" must collapse to ONE request after the pause; ` +
      `saw ${shots.length} (${shots.map((s) => s.search).join(', ')}). ` +
      'One per keystroke is the defect OGC-1134 was raised on.',
    ).toBe(1);
    expect(
      shots[0].search,
      'and the one request that IS sent carries the whole term, not a prefix',
    ).toBe('amylase');
  });

  test('TCS-2: a single character issues no search request at all', async ({ page }) => {
    // Acceptance criterion 2: "no query for a single character". The ticket asks for a
    // minimum query length of 2-3 characters, because one character returns most of the
    // catalog: useless to the user and expensive for the server.
    //
    // THIS CASE WAS WRITTEN AS A FLIP-WHEN-FIXED TRIPWIRE AND UNMARKED THE SAME DAY.
    // Against the 2026-09-11 develop frontend, typing "a" alone sent
    // GET /rest/test-catalog/tests?search=a&page=1&pageSize=25 — one request, the exact
    // thing this criterion forbids — so it carried `test.fail()`. Against the develop
    // frontend pulled on 2026-09-15 the same run reported "Expected to fail, but passed"
    // and the count was 0. That is PR #4299 (develop c978980, 2026-09-14) arriving, and the
    // correct response to a red flip-when-fixed case is to delete the marker and keep the
    // assertion, which is what happened here. From now on this guards the minimum length
    // against regression.
    const rec = recorder(page);
    await openList(page, rec);

    const before = rec.searches().length;
    await typeTerm(page, 'a');
    const shots = rec.searches().slice(before);

    console.log(`TCS-2 search requests for a single "a" = ${shots.length}: ` +
      JSON.stringify(shots.map((s) => s.search)));

    expect(
      shots.map((s) => s.search),
      'a single character must not query the server (minimum query length 2-3 chars)',
    ).toEqual([]);
  });

  test('TCS-3: the settled result set matches the whole term and does not regress to a prefix', async ({ page }) => {
    // Acceptance criterion 3, asserted through its consequence rather than its mechanism:
    // "results don't flicker/regress mid-type; in-flight requests are cancelled".
    //
    // THE MECHANISM IS NOT OBSERVABLE HERE, and this comment is the "say so rather than
    // faking it" the brief asked for. With the debounce in place no two searches overlap, so
    // nothing is ever aborted: `page.on('requestfailed')` recorded ZERO events across the
    // whole 2026-09-15 run. Zero aborts is exactly what a page with no AbortController would
    // also produce, so asserting on it would be asserting on nothing. The abort count is
    // logged below as evidence, not asserted.
    //
    // What IS observable, and what the user actually cares about, is that when the typing
    // stops the table shows results for the term that was typed — not for a prefix of it
    // that a slower earlier response overwrote it with.
    const rec = recorder(page);
    await openList(page, rec);

    const before = rec.searches().length;
    await typeTerm(page, 'gluc');
    const shots = rec.searches().slice(before);
    console.log(`TCS-3 requests=${JSON.stringify(shots.map((s) => s.search))} aborted=${rec.aborted.length}`);

    expect(
      shots.length,
      'the search ran at all (a zero here would make the row assertion below meaningless)',
    ).toBeGreaterThan(0);
    expect(
      shots[shots.length - 1].search,
      'the LAST request the page made is for the full term — nothing later re-queried a prefix',
    ).toBe('gluc');

    // And the rendered table agrees with it. Every row shown must match what was searched
    // for; a row that does not is a stale response that won a race.
    const rows = await page.locator('table tbody tr').allInnerTexts();
    expect(
      rows.length,
      'the settled search returned rows to check (if "gluc" matches nothing on this instance ' +
      'the case is measuring nothing and the term needs changing, not the assertion)',
    ).toBeGreaterThan(0);
    const offenders = rows.filter((r) => !/gluc/i.test(r));
    expect(
      offenders.slice(0, 3),
      `every rendered row matches the settled term; ${offenders.length} of ${rows.length} did not, ` +
      'which is the mid-type regression this criterion forbids',
    ).toEqual([]);
  });
});
