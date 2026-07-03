// Demo-data seed capability (part 5b): 2 reflex rules. Idempotent by ruleName. Re-runnable & self-grounding.
//   BASE=https://indonesiademo.openelis-global.org npx playwright test --project=docs tests/docs/seed-reflex.docs.spec.ts
//   RUN THIS SPEC ON ITS OWN (one seeder per invocation). Run AFTER seed-calc.
//
// Grounded on OpenELIS-Global-2 (DIGI-UW) + verified live on indonesiademo:
//   Endpoint : POST /rest/reflexrule  (body = ReflexRule) ; readback GET /rest/reflexrules
//   Server AUTO-creates the Analyte + TestAnalyte on create (analyteId/testAnalyteId stay null).
//   Body     : { id:null, ruleName, overall:"ANY"|"ALL", toggled:true, active:true, analyteId:null,
//                conditions:[{ id:null, sampleId, testName, testId, relation:<NumericRelationOptions>, value, value2, testAnalyteId:null }],
//                actions:[{ id:null, sampleId, reflexTestName, reflexTestId, internalNote, externalNote, addNotification:"Y", testReflexId:null }] }
//   CONSTRAINTS (verified live): numeric trigger needs numeric value/value2; numeric trigger + DICTIONARY added
//     test 500s (use numeric added); one role per test across calc+reflex incl. inactive rows & base-dataset
//     linkages that the API can't see; trigger/added must belong to the rule's sample type.
//   STRATEGY: server-as-oracle trial-and-error over untainted same-sample numeric tests (failed creates roll back).
import { test, expect } from '@playwright/test';
const P = '/api/OpenELIS-Global';
const norm = (s: string) => String(s || '').trim().toLowerCase();

test('seed reflex rules', async ({ page }) => {
  test.setTimeout(240000);
  await page.goto('/'); await page.waitForTimeout(800);
  const getJson = async (path: string) => { const r: any = await page.request.get(`${P}${path}`); return r.ok() ? await r.json().catch(() => null) : null; };
  const postRule = async (rule: any) => page.evaluate(async ({ P, rule }: any) => {
    const csrf = localStorage.getItem('CSRF') || '';
    const r = await fetch(`${P}/rest/reflexrule`, { method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify(rule) });
    return { ok: r.ok, status: r.status };
  }, { P, rule });

  const calcs: any[] = (await getJson('/rest/test-calculations')) || [];
  const rules: any[] = (await getJson('/rest/reflexrules')) || [];
  const existingActiveNames = new Set(rules.filter((r: any) => r.active !== false).map((r: any) => norm(r.ruleName)));
  const taint = new Set<string>();
  for (const c of calcs) { if (c.testId != null) taint.add(String(c.testId)); for (const o of (c.operations || [])) if (o.type === 'TEST_RESULT' && o.value != null) taint.add(String(o.value)); }
  for (const r of rules) { for (const c of (r.conditions || [])) if (c.testId != null) taint.add(String(c.testId)); for (const a of (r.actions || [])) if (a.reflexTestId != null) taint.add(String(a.reflexTestId)); }

  const sampleTypes: any[] = (await getJson('/rest/displayList/SAMPLE_TYPE_ACTIVE')) || [];
  const pools: { st: any; tests: any[] }[] = [];
  for (const st of sampleTypes) {
    const beans: any[] = (await getJson(`/rest/test-display-beans?sampleType=${st.id}`)) || [];
    const f = beans.filter((b: any) => String(b.resultType) === 'N' && !taint.has(String(b.id)) && String(b.value).includes('(' + st.value + ')'));
    if (f.length >= 2) pools.push({ st, tests: f });
  }
  console.log('EXISTING_REFLEX_RULES', rules.length, 'active', existingActiveNames.size, 'POOLS', pools.map((p) => `${p.st.value}:${p.tests.length}`).join(' | '));

  const specs = [
    { ruleName: 'Demo Reflex Rule 1 (High)', relation: 'GREATER_THAN', value: '10', verb: 'elevated' },
    { ruleName: 'Demo Reflex Rule 2 (Low)', relation: 'LESS_THAN', value: '5', verb: 'low' },
  ];
  const toMake = specs.filter((s) => !existingActiveNames.has(norm(s.ruleName)));
  let created = 0, skipped = specs.length - toMake.length, failed = 0;
  const usedTests = new Set<string>();
  let attempts = 0; const MAX_ATTEMPTS = 30;

  for (const spec of toMake) {
    let done = false;
    for (const pool of pools) {
      const sid = String(pool.st.id);
      const avail = pool.tests.filter((t: any) => !usedTests.has(String(t.id)));
      for (let gi = 0; gi < avail.length && !done; gi++) {
        for (let ad = 0; ad < avail.length && !done; ad++) {
          if (ad === gi) continue;
          const trig = avail[gi], added = avail[ad];
          if (attempts++ >= MAX_ATTEMPTS) break;
          const rule = {
            id: null, ruleName: spec.ruleName, overall: 'ANY', toggled: true, active: true, analyteId: null,
            conditions: [{ id: null, sampleId: sid, testName: trig.value, testId: String(trig.id), relation: spec.relation, value: spec.value, value2: '0', testAnalyteId: null }],
            actions: [{ id: null, sampleId: sid, reflexTestName: added.value, reflexTestId: String(added.id), internalNote: `Auto-add ${added.value} when ${trig.value} is ${spec.verb} (seeded demo rule).`, externalNote: '', addNotification: 'Y', testReflexId: null }],
          };
          const res: any = await postRule(rule);
          await page.waitForTimeout(200);
          if (res.ok) { usedTests.add(String(trig.id)); usedTests.add(String(added.id)); created++; done = true; console.log('CREATED_REFLEX', spec.ruleName, `[${pool.st.value}] trigger ${trig.id} add ${added.id}`); }
        }
      }
      if (done) break;
    }
    if (!done) { failed++; console.log('FAIL_REFLEX', spec.ruleName, 'no working test combination found', 'attempts', attempts); }
  }

  const after: any[] = (await getJson('/rest/reflexrules')) || [];
  console.log('REFLEX_RULES_AFTER_ACTIVE', after.filter((r) => r.active !== false).length);
  console.log('REFLEX_SEED_SUMMARY', JSON.stringify({ created, skipped, failed, planned: specs.length }));
  expect(failed).toBe(0);
});
