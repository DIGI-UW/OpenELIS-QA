// Demo-data seed capability (part 1b): link tests to the seeded compliance standards.
//   BASE=https://indonesiademo.openelis-global.org npx playwright test --project=docs tests/docs/seed-compliance-tests.docs.spec.ts
//   RUN ON ITS OWN, after seed-compliance. Idempotent (skips tests already linked).
//
// Grounded live on indonesiademo (feature not in the indexed OpenELIS-Global-2 branch; payload reverse-engineered
// from the app bundle's buildThresholdPayload). Tests attach to a standard through: standard -> parameter group ->
// threshold (one test + limits). linkedTestCount counts thresholds.
//   Create group : POST /rest/compliance/standards/{id}/parameter-groups   { name, description, sortOrder }
//   Link test    : POST /rest/compliance/thresholds
//     { group:{id}, test:{id}, parameterCode, displayName, thresholdType, minValue, maxValue, units, notes, isMandatory }
//     thresholdType in { MAXIMUM(≤max), MINIMUM(≥min), RANGE(min–max), BORDERLINE, EXACT, DESCRIPTIVE, SELECT_MAP }
//   Readbacks    : GET /rest/compliance/standards/{id}/parameter-groups ; GET /rest/compliance/standards/{id}/linked-tests
import { test, expect } from '@playwright/test';
const P = '/api/OpenELIS-Global';

// Water-quality parameters to link, matched to catalog tests by name (English or Indonesian).
const PARAMS: { re: RegExp; type: string; min?: number; max?: number; units: string }[] = [
  { re: /^ph$|(^|\W)ph(\W|$)/i, type: 'RANGE', min: 6.5, max: 8.5, units: 'pH' },
  { re: /lead|timbal|\bpb\b/i, type: 'MAXIMUM', max: 0.01, units: 'mg/L' },
  { re: /mercury|merkuri|\bhg\b/i, type: 'MAXIMUM', max: 0.001, units: 'mg/L' },
  { re: /dissolved solids|tds|padatan terlarut/i, type: 'MAXIMUM', max: 500, units: 'mg/L' },
  { re: /turbidit|kekeruhan/i, type: 'MAXIMUM', max: 5, units: 'NTU' },
  { re: /colou?r|warna/i, type: 'MAXIMUM', max: 15, units: 'TCU' },
];

test('seed compliance standard tests', async ({ page }) => {
  test.setTimeout(240000);
  await page.goto('/'); await page.waitForTimeout(800);
  const getJson = async (path: string) => { const r: any = await page.request.get(`${P}${path}`); return r.ok() ? await r.json().catch(() => null) : null; };
  const post = async (path: string, body: any) => page.evaluate(async ({ P, path, body }: any) => {
    const csrf = localStorage.getItem('CSRF') || '';
    const r = await fetch(`${P}${path}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify(body) });
    return { ok: r.ok, status: r.status, json: await r.json().catch(() => null) };
  }, { P, path, body });

  // 1. Active standards.
  const standards: any[] = (await getJson('/rest/compliance/standards')) || [];
  const active = standards.filter((s) => s.status === 'ACTIVE');
  console.log('ACTIVE_STANDARDS', active.length);

  // 2. Build candidate test pool: scan env sample types, match tests to PARAMS by name.
  const entry: any = (await getJson('/rest/SamplePatientEntry')) || {};
  const sampleTypes: any[] = entry.sampleTypes || [];
  const pool: { id: string; name: string; spec: any }[] = [];
  const seenTest = new Set<string>();
  for (const st of sampleTypes) {
    const stt: any = await getJson(`/rest/sample-type-tests?sampleType=${st.id}`);
    for (const t of ((stt && stt.tests) || [])) {
      const spec = PARAMS.find((p) => p.re.test(String(t.name)));
      if (spec && !seenTest.has(String(t.id)) && !pool.some((x) => x.spec === spec)) {
        pool.push({ id: String(t.id), name: String(t.name), spec }); seenTest.add(String(t.id));
      }
    }
    if (pool.length >= PARAMS.length) break;
  }
  console.log('CANDIDATE_TESTS', pool.map((p) => `${p.id}:${p.name}`).join(' | '));
  expect(pool.length).toBeGreaterThan(0);

  let linked = 0, skipped = 0, failed = 0, groupsMade = 0;
  for (const std of active) {
    // 3a. Ensure a parameter group.
    let groups: any[] = (await getJson(`/rest/compliance/standards/${std.id}/parameter-groups`)) || [];
    if (!groups.length) {
      const g: any = await post(`/rest/compliance/standards/${std.id}/parameter-groups`, { name: 'Water Quality Parameters', description: 'Physical & chemical limits', sortOrder: 1 });
      if (g.ok && g.json) { groups = [g.json]; groupsMade++; }
      else { failed++; console.log('FAIL_GROUP', std.id, std.name, g.status); continue; }
    }
    const gid = String(groups[0].id);

    // 3b. Existing linked test ids (idempotency).
    const lt: any = await getJson(`/rest/compliance/standards/${std.id}/linked-tests`);
    const linkedIds = new Set(((lt && lt.linkedTests) || []).map((r: any) => String(r.testId)));

    // 3c. Link each candidate not already linked.
    for (const cand of pool) {
      if (linkedIds.has(cand.id)) { skipped++; continue; }
      const body = {
        group: { id: gid }, test: { id: cand.id }, parameterCode: cand.name, displayName: cand.name,
        thresholdType: cand.spec.type,
        minValue: cand.spec.min ?? null, maxValue: cand.spec.max ?? null,
        units: cand.spec.units, notes: null, isMandatory: false,
      };
      const r: any = await post('/rest/compliance/thresholds', body);
      if (r.ok) { linked++; } else { failed++; console.log('FAIL_THR', std.name, cand.name, r.status); }
      await page.waitForTimeout(120);
    }
  }

  // 4. Verify.
  const after: any[] = (await getJson('/rest/compliance/standards')) || [];
  for (const s of after.filter((x) => x.status === 'ACTIVE')) console.log('STD', s.name, 'groups', s.parameterGroupCount, 'linkedTests', s.linkedTestCount);
  console.log('COMPLIANCE_TESTS_SUMMARY', JSON.stringify({ linked, skipped, failed, groupsMade, standards: active.length }));
  expect(failed).toBe(0);
});
