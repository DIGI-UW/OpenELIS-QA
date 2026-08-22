import { test, expect } from '@playwright/test';
import { setComponentViaRest, activateViaRest } from '../../legacy-order-helper';

/**
 * seed-domain-catalog — ENVIRONMENTAL + VECTOR catalog data.
 *
 * WHY THIS EXISTS
 * OGC-936 backfills every existing test to domain CLINICAL, as specified. Nothing has ever
 * assigned a non-clinical domain, and the Domain radio group (OGC-951) is still Backlog. So a
 * migrated instance reports domain=ENVIRONMENTAL total:0 and domain=VECTOR total:0, and any suite
 * that expects non-clinical catalog rows fails for want of data rather than for a defect.
 *
 * THE ROUTE IN — every line below is a live status from testing.openelis-global.org v3.2.2.0:
 *   POST /rest/sample-types                            -> 405   (OGC-1152, open)
 *   POST /rest/test-catalog/sample-types               -> 405   (no alternate create route)
 *   POST /rest/test-catalog/tests  ENV + clinical spec -> 422    (domain/sample-type guard)
 *   POST /rest/test-catalog/tests  CLINICAL control    -> 201    (endpoint + shape are fine)
 *   PUT  /rest/sample-types/{id}   minimal body        -> 200    <- the only open door
 *   PUT  /rest/sample-types/{id}   full object from GET-> 500
 *   POST /rest/test-catalog/tests/{id}/activate        -> 422 NO_PRIMARY_RESULT_TYPE until a
 *                                                        primary result component exists
 *
 * So: flip a QA-junk sample type's domain by PUT (they cannot be created), create tests against
 * it, give each a primary result component, then activate. Only an ACTIVE test appears in
 * /rest/sample-type-tests, which is what order forms and the compliance-tests seeder read.
 *
 * SCOPE LIMIT — this does NOT unblock the new three-lane order wizard. Those lanes read
 * /rest/environmental-sample-types and /rest/vector-sample-types, which return [] and are POST
 * 405; they do not derive from sample_type.domain. Seeding the catalog cannot fix them.
 *
 * SAFETY — only sample types whose names are obvious QA debris (QA_/QA / Q<digits>/ZQA_) are
 * touched; never a real clinical type. Idempotent: re-running reuses whatever is already in the
 * target domain and skips tests that already exist.
 */
test.describe.configure({ retries: 0, mode: 'serial' });
const BASE = process.env.BASE || 'https://testing.openelis-global.org';
const API = '/api/OpenELIS-Global/rest';

const PLAN = [
  { domain: 'ENVIRONMENTAL', tests: [
    { name: 'QA Env Turbidity', code: 'TURB', type: 'N', digits: 2 },
    { name: 'QA Env pH', code: 'PH', type: 'N', digits: 2 },
    { name: 'QA Env Lead', code: 'PB', type: 'N', digits: 3 },
  ] },
  { domain: 'VECTOR', tests: [
    { name: 'QA Vector Species ID', code: 'SPEC', type: 'R', digits: 1 },
    { name: 'QA Vector Pathogen PCR', code: 'PCR', type: 'D', digits: 1 },
  ] },
];

test('seed env + vector catalog data', async ({ page }) => {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  expect(page.url(), 'session must be live').not.toContain('/login');

  const created: { id: string; type: string; code: string; label: string; digits: number }[] = [];

  for (const plan of PLAN) {
    const step = await page.evaluate(async (args: any) => {
      const api = args.api;
      const csrf = localStorage.getItem('CSRF') || '';
      const H = { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Token': csrf };
      const log: string[] = [];
      const list = async () => {
        const r = await fetch(api + '/test-catalog/sample-types', { headers: { Accept: 'application/json' } });
        return r.ok ? await r.json().catch(() => []) : [];
      };

      const sts: any[] = await list();
      let st = sts.find((s: any) => s.domain === args.domain);
      if (st) {
        log.push(args.domain + ': reusing sample type ' + st.id + ' [' + st.name + ']');
      } else {
        const cand = sts.find((s: any) => /^(QA[_ ]|Q[0-9]{4,}|ZQA_)/.test(s.name || '') && s.domain === 'CLINICAL');
        if (!cand) { log.push(args.domain + ': NO QA-junk sample type available - cannot seed (see OGC-1152)'); return { log, ids: [] }; }
        const r = await fetch(api + '/sample-types/' + cand.id, {
          method: 'PUT', headers: H,
          body: JSON.stringify({ id: String(cand.id), name: cand.name, domain: args.domain }),
        });
        log.push('PUT /sample-types/' + cand.id + ' domain -> ' + args.domain + ' :: HTTP ' + r.status);
        if (!r.ok) return { log, ids: [] };
        st = cand;
      }

      // Which of the planned tests already exist for this domain?
      const exR = await fetch(api + '/test-catalog/tests?domain=' + args.domain + '&page=0&size=200', { headers: { Accept: 'application/json' } });
      const exJ: any = exR.ok ? await exR.json().catch(() => null) : null;
      const existing = new Map<string, string>();
      for (const row of (exJ && exJ.rows) || []) existing.set(String(row.name), String(row.testId || row.id));

      const ids: any[] = [];
      for (const t of args.tests) {
        if (existing.has(t.name)) {
          log.push('exists: ' + t.name + ' -> ' + existing.get(t.name));
          ids.push({ id: existing.get(t.name), type: t.type, code: t.code, label: t.name, digits: t.digits });
          continue;
        }
        const r = await fetch(api + '/test-catalog/tests', {
          method: 'POST', headers: H,
          body: JSON.stringify({
            name: t.name, reportingName: t.name,
            code: t.name.replace(/[^A-Za-z0-9]/g, '').slice(0, 14).toUpperCase(),
            domain: args.domain, labUnitId: '56', sampleTypeId: String(st.id),
          }),
        });
        const body = await r.text();
        log.push('POST ' + t.name + ' -> ' + r.status + ' ' + body.slice(0, 90).replace(/\s+/g, ' '));
        try {
          const j = JSON.parse(body);
          if (j.testId) ids.push({ id: String(j.testId), type: t.type, code: t.code, label: t.name, digits: t.digits });
        } catch (e) { /* status already logged */ }
      }
      return { log, ids };
    }, { api: API, domain: plan.domain, tests: plan.tests });

    for (const l of step.log) console.log('[seed-domain] ' + l);
    for (const i of step.ids) created.push(i as any);
  }

  // A created test is Inactive and activation is refused with NO_PRIMARY_RESULT_TYPE, so give
  // each a primary component first. Both helpers are the live-verified ones in
  // legacy-order-helper.ts - do not re-derive these payloads here.
  for (const c of created) {
    try {
      await setComponentViaRest(page, c.id, { code: c.code, label: c.label, resultType: c.type, significantDigits: c.digits });
      await activateViaRest(page, c.id);
      console.log('[seed-domain] ' + c.id + ' component(' + c.type + ') + ACTIVATED');
    } catch (e: any) {
      console.log('[seed-domain] ' + c.id + ' component/activate FAILED: ' + String(e).slice(0, 200));
    }
  }

  // Read back on the surfaces that gate orderability, not on the create response.
  const rb = await page.evaluate(async (api: string) => {
    const j = async (u: string) => {
      const r = await fetch(api + u, { headers: { Accept: 'application/json' } });
      return await r.text();
    };
    const tot = async (d: string) => {
      const t = await j('/test-catalog/tests?domain=' + d + '&page=0&size=1');
      try { const p = JSON.parse(t); return p.total; } catch (e) { return 'n/a'; }
    };
    const out: string[] = [];
    out.push('domain totals CLINICAL=' + (await tot('CLINICAL')) + ' ENVIRONMENTAL=' + (await tot('ENVIRONMENTAL')) + ' VECTOR=' + (await tot('VECTOR')));
    const sts: any[] = JSON.parse(await j('/test-catalog/sample-types'));
    for (const s of sts.filter((x: any) => x.domain !== 'CLINICAL')) {
      const t = JSON.parse(await j('/sample-type-tests?sampleType=' + s.id));
      out.push('sample-type ' + s.id + ' [' + s.domain + '] orderable tests = ' + ((t.tests || []).length));
    }
    out.push('environmental-sample-types (new wizard) = ' + (await j('/environmental-sample-types')).slice(0, 60));
    out.push('vector-sample-types (new wizard) = ' + (await j('/vector-sample-types')).slice(0, 60));
    return out;
  }, API);
  for (const l of rb) console.log('[seed-domain] READBACK ' + l);

  const totals = rb[0] || '';
  expect(totals, 'ENVIRONMENTAL must end up non-zero').not.toContain('ENVIRONMENTAL=0');
  expect(totals, 'VECTOR must end up non-zero').not.toContain('VECTOR=0');
});
