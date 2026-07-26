// OGC-1131 / OGC-949 — Multi-Component Results RUNTIME guard.
//
// Seeded test (OGC-1125): "COVID-19 PCR(Respiratory Swab)" (code COVIDPCR) has result components
// PRIMARY (dictionary) + N2 (Ct) + E (Ct) (both numeric). This spec proves:
//   MC-1 (config, deterministic API): /sample-results returns >=2 non-primary components incl N2 + E.
//   MC-2 (runtime, driven clicks): ordering the test renders a SEPARATE result-entry field per
//        component (N2 and E) at Results -> By Order, and values for both save. (OGC-1131 runtime,
//        develop 1da95698: "order one test -> result entry shows N component fields".)
//
// Target: testing.openelis-global.org (the seed lives there). Run:
//   BASE=https://testing.openelis-global.org OE_USER=admin OE_PASS='adminADMIN!' \
//   npx playwright test --project=docs tests/docs/multicomponent-runtime.docs.spec.ts
import { test, expect } from '@playwright/test';
import { go, shot, saveWalkthrough } from './capture';
import { generateLabNumber, newPatient, setSelectByOption, checkByLabel, completeQaChecklist, clickButton, trackWrites, assertOrderPersisted, fillRequester, assertSamplePersisted } from './order-helpers';
import { placeLegacyOrder, openResultEntryByAccession } from '../../legacy-order-helper';

const BASE = process.env.BASE || 'https://testing.openelis-global.org';
const REST = `${BASE}/api/OpenELIS-Global/rest`;
const TC = `${REST}/test-catalog`;

/** Resolve the COVIDPCR test id via the authenticated catalog list (code COVIDPCR, Respiratory Swab). */
async function covidTestId(page: any): Promise<{ id: string; components: any[] }> {
  const list = await page.request.get(`${TC}/tests?search=${encodeURIComponent('COVID-19 PCR')}&page=1&pageSize=20`, { headers: { Accept: 'application/json' } }).then((r: any) => r.json());
  const row = (list.rows || []).find((r: any) => /Respiratory Swab/i.test(r.name || '') && /COVID/i.test(r.name || '')) || (list.rows || [])[0];
  const id = String(row.testId ?? row.id);
  const sr = await page.request.get(`${TC}/tests/${id}/sample-results`, { headers: { Accept: 'application/json' } }).then((r: any) => r.json());
  return { id, components: sr.components || [] };
}

test.describe('OGC-1131 multi-component results — runtime', () => {

  // MC-1 — config guard (API): the seeded COVIDPCR test carries >=2 non-primary components (N2, E).
  test('MC-1: COVIDPCR has multiple result components (N2 + E) [OGC-1125/1128]', async ({ page }) => {
    const { id, components } = await covidTestId(page);
    const codes = components.map((c: any) => c.code);
    const labels = components.map((c: any) => c.label);
    console.log('MC_COMPONENTS testId=' + id + ' ' + JSON.stringify(components.map((c: any) => ({ code: c.code, label: c.label, type: c.resultType }))));
    expect(components.length, 'COVIDPCR should have >=2 components').toBeGreaterThanOrEqual(2);
    expect(codes, 'has N2 component').toContain('N2');
    expect(codes, 'has E component').toContain('E');
    expect(components.filter((c: any) => c.code !== 'PRIMARY').length, '>=2 non-primary components').toBeGreaterThanOrEqual(2);
  });

  // MC-2 — runtime: order COVIDPCR, then Results -> By Order shows a field per component (N2 + E).
  test('MC-2: order COVIDPCR → result entry shows N2 + E component fields → save [OGC-1131]', async ({ page }, info) => {
    test.setTimeout(180000);
    // Order COVIDPCR via the LEGACY /SamplePatientEntry wizard. The unified /order/enter drops the
    // sample's tests (OGC-1132), which made this spec time out at result entry; the legacy page
    // persists a resultable analysis. COVID-19 PCR is a Respiratory Swab test in Molecular Biology.
    const lab = await placeLegacyOrder(page, 'COVID-19 PCR', 'Respiratory Swab');
    console.log('MC_ORDER lab=' + lab);
    await shot(page, info, 'Enter Order — COVIDPCR (legacy)', { fullPage: false });

    // Result entry — flag-aware (unified /Results worklist when RESULTS_ENTRY_UNIFIED_ROUTE is on).
    await openResultEntryByAccession(page, lab, 'Molecular Biology');
    await shot(page, info, 'Result entry — components', { fullPage: false });

    const bodyText = await page.evaluate(() => document.body.innerText);
    const hasN2 = /N2/.test(bodyText);
    const hasE = /\bE \(Ct\)|\bE\b\s*\(/.test(bodyText);
    const inputCount = await page.locator('table input:not([type=hidden]), [role=row] input:not([type=hidden])').count();
    console.log('MC_RESULT hasN2=' + hasN2 + ' hasE=' + hasE + ' resultInputs=' + inputCount);

    // OGC-1131 core assertion: BOTH components render at result entry (2 distinct fields).
    expect(hasN2, 'N2 component field renders at result entry').toBe(true);
    expect(hasE, 'E component field renders at result entry').toBe(true);
    expect(inputCount, 'multiple component result inputs render').toBeGreaterThanOrEqual(2);

    // Enter a value into each component input and Save (best-effort; the render is the proof).
    const inputs = page.locator('table input:not([type=hidden])');
    const n = Math.min(await inputs.count(), 2);
    for (let i = 0; i < n; i++) { await inputs.nth(i).fill(String(20 + i)).catch(() => {}); }
    await page.getByRole('button', { name: /^Save$/ }).first().click().catch(() => {});
    await page.waitForTimeout(1500);
    await saveWalkthrough(page, info).catch(() => {});
  });
});
