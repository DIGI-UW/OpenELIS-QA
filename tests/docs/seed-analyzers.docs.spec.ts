// Demo-data seed capability: analyzers.
// Idempotent: skips names that already exist. Re-runnable after a reset.
//   BASE=https://indonesiademo.openelis-global.org npx playwright test --project=docs tests/docs/seed-analyzers.docs.spec.ts
//
// Endpoint mechanics (learned via probe, 2026-07-05):
//   Plugin types: ASTM=1, HL7=2, FILE=3 (GET /rest/analyzer-types?active=true)
//   Categories seen: MOLECULAR, HEMATOLOGY, CHEMISTRY, COAGULATION, IMMUNOLOGY
//   POST /rest/analyzer/analyzers → 201 with body { name, analyzerType, pluginTypeId, ... }
//   PUT /rest/analyzer/analyzers/{id} → 200 with the full analyzer body; use to transition status
//   DELETE returns 405 — records cannot be removed, only marked INACTIVE

import { test, expect } from '@playwright/test';
const P = '/api/OpenELIS-Global';

type Seed = {
  name: string;
  analyzerType: string;       // MOLECULAR | HEMATOLOGY | CHEMISTRY | COAGULATION | IMMUNOLOGY
  pluginTypeId: '1' | '2' | '3';   // 1=ASTM 2=HL7 3=FILE
  protocolVersion?: string;    // e.g. 'ASTM_LIS2_A2', 'HL7_V2_5'
  communicationMode?: string;  // e.g. 'ANALYZER_INITIATED' | 'BOTH' | 'LIS_INITIATED'
  identifierPattern?: string;
  status?: 'SETUP' | 'ACTIVE' | 'INACTIVE';
  testMappings?: string[];
};

const SEEDS: Seed[] = [
  // ASTM (pluginTypeId=1) — 6 items covering CHEMISTRY / HEMATOLOGY / COAGULATION / MOLECULAR
  { name: 'Mindray BA-88A', analyzerType: 'CHEMISTRY', pluginTypeId: '1', protocolVersion: 'ASTM_LIS2_A2', communicationMode: 'BOTH', identifierPattern: 'BA88A|MINDRAY-BA', status: 'ACTIVE', testMappings: ['ALT', 'AST', 'GLU', 'CREA', 'BUN', 'CHOL', 'HDL', 'LDL', 'TG'] },
  { name: 'Sysmex XN Series', analyzerType: 'HEMATOLOGY', pluginTypeId: '1', protocolVersion: 'ASTM_LIS2_A2', communicationMode: 'BOTH', identifierPattern: 'SYSMEX|XN', status: 'ACTIVE', testMappings: ['WBC', 'RBC', 'HGB', 'HCT', 'PLT', 'MCV', 'MCH', 'MCHC'] },
  { name: 'Horiba ABX Pentra 60 C+', analyzerType: 'HEMATOLOGY', pluginTypeId: '1', protocolVersion: 'ASTM_LIS2_A2', communicationMode: 'ANALYZER_INITIATED', identifierPattern: 'HORIBA|PENTRA', status: 'ACTIVE', testMappings: ['WBC', 'RBC', 'HGB', 'HCT', 'PLT'] },
  { name: 'Stago STart 4', analyzerType: 'COAGULATION', pluginTypeId: '1', protocolVersion: 'ASTM_LIS2_A2', communicationMode: 'ANALYZER_INITIATED', identifierPattern: 'STAGO|START4', status: 'SETUP', testMappings: ['PT', 'aPTT', 'INR', 'Fibrinogen', 'DDimer'] },
  { name: 'Bruker MALDI Biotyper', analyzerType: 'MOLECULAR', pluginTypeId: '1', protocolVersion: 'ASTM_LIS2_A2', communicationMode: 'BOTH', identifierPattern: 'MALDI|BIOTYPER', status: 'ACTIVE', testMappings: ['ORG_ID', 'ORG_ID_CONF'] },

  // HL7 (pluginTypeId=2) — 4 items
  { name: 'Mindray BS-200', analyzerType: 'CHEMISTRY', pluginTypeId: '2', protocolVersion: 'HL7_V2_5', communicationMode: 'ANALYZER_INITIATED', identifierPattern: 'BS200|MINDRAY-BS', status: 'ACTIVE', testMappings: ['ALT', 'AST', 'GLU', 'CREA', 'BUN', 'CHOL'] },
  { name: 'Mindray BC-5380', analyzerType: 'HEMATOLOGY', pluginTypeId: '2', protocolVersion: 'HL7_V2_5', communicationMode: 'ANALYZER_INITIATED', identifierPattern: 'BC5380|MINDRAY-BC', status: 'ACTIVE', testMappings: ['WBC', 'RBC', 'HGB', 'HCT', 'PLT', 'NEUT', 'LYMPH', 'MONO', 'EOS', 'BASO'] },
  { name: 'Abbott Architect', analyzerType: 'IMMUNOLOGY', pluginTypeId: '2', protocolVersion: 'HL7_V2_5', communicationMode: 'BOTH', identifierPattern: 'ARCHITECT|ABBOTT', status: 'SETUP', testMappings: ['HIV', 'HBsAg', 'HCV', 'Syphilis', 'TSH'] },

  // FILE (pluginTypeId=3) — 6 items
  { name: 'Thermo QuantStudio QS5/QS7', analyzerType: 'MOLECULAR', pluginTypeId: '3', identifierPattern: 'QUANTSTUDIO|QS5|QS7', status: 'ACTIVE', testMappings: ['HIV-VL', 'HCV-VL', 'HBV-VL', 'CT/NG', 'MTB-PCR'] },
  { name: 'Bruker FluoroCycler XT', analyzerType: 'MOLECULAR', pluginTypeId: '3', identifierPattern: 'FLUOROCYCLER|FCXT', status: 'ACTIVE', testMappings: ['MTBDR', 'MPox', 'HIV-VL', 'HCV-VL'] },
  { name: 'Thermo Multiskan FC', analyzerType: 'IMMUNOLOGY', pluginTypeId: '3', identifierPattern: 'MULTISKAN|SKANIT', status: 'ACTIVE', testMappings: ['HIV-EIA', 'HBsAg-EIA', 'HCV-EIA', 'Syphilis-EIA'] },
  { name: 'Tecan Infinite F50', analyzerType: 'IMMUNOLOGY', pluginTypeId: '3', identifierPattern: 'INFINITEF50|MAGELLAN', status: 'ACTIVE', testMappings: ['HIV-EIA', 'HBsAg-EIA', 'HCV-EIA'] },
  { name: 'Wondfo Finecare FS-205', analyzerType: 'IMMUNOLOGY', pluginTypeId: '3', identifierPattern: 'WONDFO|FINECARE', status: 'SETUP', testMappings: ['TSH', 'bHCG', 'CRP', 'PCT', 'cTnI'] },
  { name: 'DNA Technology DT-Prime', analyzerType: 'MOLECULAR', pluginTypeId: '3', identifierPattern: 'DTPRIME|DNA-TECH', status: 'SETUP', testMappings: ['SARSCoV2', 'MTB', 'HPV', 'CT'] },
];

test('seed analyzers', async ({ page }) => {
  test.setTimeout(300000);
  await page.goto('/');
  await page.waitForLoadState('networkidle').catch(() => {});

  // Fetch existing analyzers for idempotency check
  const raw = await (await page.request.get(P + '/rest/analyzer/analyzers')).text();
  let parsed: any = null; try { parsed = JSON.parse(raw); } catch (e) {}
  const existing: any[] = Array.isArray(parsed) ? parsed : (parsed?.analyzers || parsed?.data?.content || parsed?.data || []);
  const existingByName = new Map<string, any>();
  for (const a of existing) existingByName.set(String(a.name || '').toLowerCase(), a);
  console.log('EXISTING_COUNT', existing.length, 'NAMES', Array.from(existingByName.keys()));

  let created = 0, updated = 0, skipped = 0, failed = 0;

  for (const seed of SEEDS) {
    const key = seed.name.toLowerCase();
    if (existingByName.has(key)) {
      const cur = existingByName.get(key);
      // Ensure status matches if we care
      if (seed.status && cur.status !== seed.status) {
        const putBody = { ...cur, status: seed.status };
        const r = await page.evaluate(async ({ id, body }) => {
          const csrf = localStorage.getItem('CSRF') || '';
          const r = await fetch('/api/OpenELIS-Global/rest/analyzer/analyzers/' + id, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify(body) });
          return { status: r.status, text: (await r.text().catch(() => '')).slice(0, 200) };
        }, { id: cur.id, body: putBody });
        if (r.status >= 200 && r.status < 300) { updated++; console.log('UPDATED_STATUS', seed.name, seed.status); }
        else { failed++; console.log('UPDATE_FAIL', seed.name, r.status, r.text); }
      } else {
        skipped++; console.log('SKIP_EXISTS', seed.name, 'status=' + cur.status);
      }
      continue;
    }

    // Create (POST creates in SETUP by default)
    const postRes: any = await page.evaluate(async ({ body }) => {
      const csrf = localStorage.getItem('CSRF') || '';
      const r = await fetch('/api/OpenELIS-Global/rest/analyzer/analyzers', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify(body) });
      const t = await r.text().catch(() => '');
      return { status: r.status, ok: r.ok, text: t.slice(0, 500) };
    }, { body: seed });
    if (!postRes.ok) { failed++; console.log('POST_FAIL', seed.name, postRes.status, postRes.text.replace(/\s+/g, ' ')); continue; }
    let createdObj: any = null; try { createdObj = JSON.parse(postRes.text); } catch (e) {}
    const newId = createdObj?.id;
    console.log('CREATED', seed.name, 'id=' + newId, 'status=' + (createdObj?.status || '?'));
    created++;

    // Transition to ACTIVE if requested
    if (newId && seed.status && seed.status !== createdObj.status) {
      const putBody = { ...createdObj, status: seed.status };
      const r = await page.evaluate(async ({ id, body }) => {
        const csrf = localStorage.getItem('CSRF') || '';
        const r = await fetch('/api/OpenELIS-Global/rest/analyzer/analyzers/' + id, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify(body) });
        return { status: r.status, text: (await r.text().catch(() => '')).slice(0, 200) };
      }, { id: newId, body: putBody });
      if (r.status >= 200 && r.status < 300) { console.log('  TRANSITIONED', newId, '→', seed.status); }
      else { console.log('  TRANSITION_FAIL', newId, r.status, r.text.replace(/\s+/g, ' ')); }
    }
    await page.waitForTimeout(150);
  }

  console.log('ANALYZER_SEED_SUMMARY', JSON.stringify({ created, updated, skipped, failed, planned: SEEDS.length }));
  expect(failed, 'no analyzer creation failures').toBe(0);
});
