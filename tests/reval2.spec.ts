/**
 * PULLED INTO THE REPO 2026-08-26 and re-run. Previously it lived only in
 * ~/Documents/OpenELIS QA, which is not a git repo.
 *
 * RESULT OF THE 2026-08-26 RE-RUN (4 legs: 3x same session + 1 fresh context)
 *
 *   A  sample type 51 name disagreement ....... CONFIRMED, 4/4 legs
 *        GET /sample-types/51            -> name: Water
 *        GET /test-catalog/sample-types  -> name: Q335406594_CREATE  (same id)
 *      Re-checked independently the same day: still divergent. Passes the
 *      2-of-3 revalidation bar. FILED as OGC-1190 (mozzy) on 2026-08-26.
 *      Root cause: rename writes localization; the Test Catalog list reads
 *      type_of_sample.description, which the frontend round-trips stale.
 *
 *   B  PUT /sample-types/51 500 on its own GET payload ... NOT REPRODUCING
 *        full payload 200, minimal payload 200, all four legs.
 *
 *   D  POST /test-catalog/tests 500 (all-tc BLOCKER-1) ... NOT REPRODUCING
 *        201 every leg, including the fresh context. The session-scoped cache
 *        pattern this was chasing did not appear.
 *
 * CAUTION -- THIS SPEC WRITES.
 * Each probe call PUTs sample type 51 and CREATES a test in lab unit 56. One
 * run of the two legs therefore creates FOUR tests (825-828 on 2026-08-26).
 * Do not put it in a scheduled or broad run. Run it deliberately, when you are
 * revalidating these three candidates, and expect the catalogue to grow.
 */
import { test, expect } from '@playwright/test';

// Revalidation gate for the three candidates from the 2026-08-21 run.
// Legs: (1) 3x repeat in one session, (2) a FRESH browser context. A candidate needs 2 of 3.
//
//  A  GET /test-catalog/sample-types serves a stale name after a successful rename, while
//     GET /sample-types/[id] serves the new one.
//  B  PUT /sample-types/[id] 500s on the exact payload its own GET returns; 200 on a minimal body.
//  D  POST /test-catalog/tests -> 500 (all-tc BLOCKER-1 guard) where isolated creates returned 201.
//     If a fresh session creates fine, that matches OGC-1180 session-scoped cache pattern.
test.describe.configure({ retries: 0, mode: 'serial' });
const BASE = process.env.BASE || 'https://testing.openelis-global.org';
const API = '/api/OpenELIS-Global/rest';

async function probe(page: any, tag: string) {
  const r = await page.evaluate(async (api: string) => {
    const csrf = localStorage.getItem('CSRF') || '';
    const H = { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Token': csrf };
    const out: any = {};

    const one = await fetch(api + '/sample-types/51', { headers: { Accept: 'application/json' } });
    const oneJ: any = await one.json().catch(() => null);
    const listR = await fetch(api + '/test-catalog/sample-types', { headers: { Accept: 'application/json' } });
    const listJ: any[] = listR.ok ? await listR.json().catch(() => []) : [];
    const row = listJ.find((x: any) => String(x.id) === '51');
    out.A_single_name = oneJ && oneJ.data ? oneJ.data.name : 'ERR';
    out.A_list_name = row ? row.name : 'ERR';
    out.A_agree = out.A_single_name === out.A_list_name;

    if (oneJ && oneJ.data) {
      const full = await fetch(api + '/sample-types/51', { method: 'PUT', headers: H, body: JSON.stringify(oneJ.data) });
      out.B_full_status = full.status;
    }
    const min = await fetch(api + '/sample-types/51', {
      method: 'PUT', headers: H,
      body: JSON.stringify({ id: '51', name: out.A_single_name, domain: 'ENVIRONMENTAL' }),
    });
    out.B_minimal_status = min.status;

    const stamp = String(Date.now()).slice(-6);
    const nm = 'QA Reval ' + stamp;
    const cr = await fetch(api + '/test-catalog/tests', {
      method: 'POST', headers: H,
      body: JSON.stringify({ name: nm, reportingName: nm, code: 'QAREV' + stamp, domain: 'CLINICAL', labUnitId: '56', sampleTypeId: '1' }),
    });
    out.D_create_status = cr.status;
    out.D_create_body = (await cr.text()).slice(0, 90);
    return out;
  }, API);
  console.log('[reval ' + tag + '] ' + JSON.stringify(r));
  return r;
}

test('LEG 1 - 3x in one session', async ({ page }) => {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  expect(page.url()).not.toContain('/login');
  for (let i = 1; i <= 3; i++) { await probe(page, 'leg1-' + i); await page.waitForTimeout(1500); }
});

test('LEG 2 - fresh browser context', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: '.auth/user.json', ignoreHTTPSErrors: true, baseURL: BASE });
  const p = await ctx.newPage();
  await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3000);
  await probe(p, 'leg2-fresh');
  await ctx.close();
});
