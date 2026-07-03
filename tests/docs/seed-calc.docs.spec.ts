// Demo-data seed capability (part 5a): 2 calculated values. Idempotent by name. Re-runnable & self-grounding.
//   BASE=https://indonesiademo.openelis-global.org npx playwright test --project=docs tests/docs/seed-calc.docs.spec.ts
//   RUN THIS SPEC ON ITS OWN (one seeder per `npx playwright test` invocation).
//
// Grounded on OpenELIS-Global-2 (DIGI-UW) + verified live on indonesiademo (older 3.2.1.x build):
//   Endpoint  : POST /rest/test-calculation   (body = Calculation) ; readback GET /rest/test-calculations
//   Lookups   : GET /rest/displayList/SAMPLE_TYPE_ACTIVE ; GET /rest/test-display-beans?sampleType=<id>
//   Body      : { name, sampleId, testId, result, note, toggled:true, active:true,
//                 operations:[{ id:null, order:<n>, type:"TEST_RESULT"|"MATH_FUNCTION"|"INTEGER", value, sampleId }] }
//   CONSTRAINTS (verified live):
//     * A test may hold only ONE role across the whole calc+reflex system, and DEACTIVATED rows still occupy
//       it (no API delete). Additionally, tests that already carry base-dataset test-analyte/reflex linkages
//       are unusable — and those are NOT visible via the REST API. So we can't perfectly predict a valid test.
//     * Operand/target tests must belong to the calc's own sample type (the bean list can leak tests that are
//       orderable on other sample types).
//   STRATEGY: use the server as the oracle. Build a pool of candidate untainted, same-sample numeric tests and
//   TRY create combinations until the POST succeeds. A failed create rolls back (service save is @Transactional),
//   so trial-and-error leaves no partial rows (only sequence gaps).
import { test, expect } from '@playwright/test';
const P = '/api/OpenELIS-Global';

const norm = (s: string) => String(s || '').trim().toLowerCase();
const CALC_EXCLUDE = /viral load|hiv|hepatitis|covid|dengue|pcr|resistance/i;

test('seed calculated values', async ({ page }) => {
  test.setTimeout(240000);
  await page.goto('/'); await page.waitForTimeout(800);
  const getJson = async (path: string) => { const r: any = await page.request.get(`${P}${path}`); return r.ok() ? await r.json().catch(() => null) : null; };
  const postCalc = async (calc: any) => page.evaluate(async ({ P, calc }: any) => {
    const csrf = localStorage.getItem('CSRF') || '';
    const r = await fetch(`${P}/rest/test-calculation`, { method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify(calc) });
    return { ok: r.ok, status: r.status };
  }, { P, calc });

  // Idempotency (skip only ACTIVE dupes) + global taint from calc + reflex (best-effort; API can't see base linkages).
  const calcs: any[] = (await getJson('/rest/test-calculations')) || [];
  const rules: any[] = (await getJson('/rest/reflexrules')) || [];
  const existingActiveNames = new Set(calcs.filter((c: any) => c.active !== false).map((c: any) => norm(c.name)));
  const taint = new Set<string>();
  for (const c of calcs) { if (c.testId != null) taint.add(String(c.testId)); for (const o of (c.operations || [])) if (o.type === 'TEST_RESULT' && o.value != null) taint.add(String(o.value)); }
  for (const r of rules) { for (const c of (r.conditions || [])) if (c.testId != null) taint.add(String(c.testId)); for (const a of (r.actions || [])) if (a.reflexTestId != null) taint.add(String(a.reflexTestId)); }

  // Candidate pool: untainted numeric tests grouped by sample type, matching their own parenthetical.
  const sampleTypes: any[] = (await getJson('/rest/displayList/SAMPLE_TYPE_ACTIVE')) || [];
  const pools: { st: any; tests: any[] }[] = [];
  for (const st of sampleTypes) {
    const beans: any[] = (await getJson(`/rest/test-display-beans?sampleType=${st.id}`)) || [];
    const f = beans.filter((b: any) => String(b.resultType) === 'N' && !CALC_EXCLUDE.test(String(b.value))
      && !taint.has(String(b.id)) && String(b.value).includes('(' + st.value + ')'));
    if (f.length >= 3) pools.push({ st, tests: f });
  }
  console.log('EXISTING_CALCS', calcs.length, 'active', existingActiveNames.size, 'POOLS', pools.map((p) => `${p.st.value}:${p.tests.length}`).join(' | '));

  const targetNames = ['Demo Calculated Value 1 (Sum)', 'Demo Calculated Value 2 (Scaled)'];
  const toMake = targetNames.filter((n) => !existingActiveNames.has(norm(n)));
  let created = 0, skipped = targetNames.length - toMake.length, failed = 0;
  const usedTests = new Set<string>();
  let attempts = 0; const MAX_ATTEMPTS = 30;

  for (const name of toMake) {
    let done = false;
    for (const pool of pools) {
      const sid = String(pool.st.id);
      const avail = pool.tests.filter((t: any) => !usedTests.has(String(t.id)));
      // sum needs 3 distinct (a,b -> target); scaled needs 2 (a -> target).
      for (let ti = 0; ti < avail.length && !done; ti++) {
        for (let ai = 0; ai < avail.length && !done; ai++) {
          if (ai === ti) continue;
          const target = avail[ti], a = avail[ai];
          const isSum = /Sum/.test(name);
          const bIdx = avail.findIndex((_, i) => i !== ti && i !== ai);
          if (isSum && bIdx < 0) continue;
          const b = isSum ? avail[bIdx] : null;
          const ops = isSum
            ? [{ id: null, order: 0, type: 'TEST_RESULT', value: String(a.id), sampleId: sid },
               { id: null, order: 1, type: 'MATH_FUNCTION', value: '+', sampleId: null },
               { id: null, order: 2, type: 'TEST_RESULT', value: String(b!.id), sampleId: sid }]
            : [{ id: null, order: 0, type: 'TEST_RESULT', value: String(a.id), sampleId: sid },
               { id: null, order: 1, type: 'MATH_FUNCTION', value: '*', sampleId: null },
               { id: null, order: 2, type: 'INTEGER', value: '2', sampleId: null }];
          const note = isSum ? `Seeded demo calculated value: ${target.value} = ${a.value} + ${b!.value}.`
                             : `Seeded demo calculated value: ${target.value} = ${a.value} x 2.`;
          if (attempts++ >= MAX_ATTEMPTS) break;
          const res: any = await postCalc({ name, sampleId: sid, testId: String(target.id), result: null, note, toggled: true, active: true, operations: ops });
          await page.waitForTimeout(150);
          if (res.ok) {
            usedTests.add(String(target.id)); usedTests.add(String(a.id)); if (b) usedTests.add(String(b.id));
            created++; done = true; console.log('CREATED_CALC', name, `[${pool.st.value}] target ${target.id}`);
          }
        }
      }
      if (done) break;
    }
    if (!done) { failed++; console.log('FAIL_CALC', name, 'no working test combination found', 'attempts', attempts); }
  }

  const after: any[] = (await getJson('/rest/test-calculations')) || [];
  console.log('CALCS_AFTER_ACTIVE', after.filter((c) => c.active !== false).length);
  console.log('CALC_SEED_SUMMARY', JSON.stringify({ created, skipped, failed, planned: targetNames.length }));
  expect(failed).toBe(0);
});
