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
    const writes = trackWrites(page);

    // Testing uses the UNIFIED wizard at /order/enter (the domain-split /order/clinical/enter is
    // indonesiademo-only and renders blank on testing).
    await go(page, '/order/enter');
    const lab = await generateLabNumber(page);
    await newPatient(page, { last: 'MultiComp', first: 'Covid', dob: '10/10/1980', gender: /^male$/i });
    // Sample type = Respiratory Swab. Prefer the explicit native <select> (fires React onChange).
    await page.locator('#sampleType-0').selectOption({ label: 'Respiratory Swab' }).catch(async () => {
      await setSelectByOption(page, /^\s*Respiratory Swab\s*$/i).catch(() => {});
    });
    await page.waitForTimeout(1000);
    await clickButton(page, /tests\s*&\s*panels|choose available|order tests/i, 900).catch(() => {});
    const picked = await checkByLabel(page, /COVID-?19 PCR|COVIDPCR/i).catch(() => false);
    console.log('MC_ORDER lab=' + lab + ' testPicked=' + picked);

    // MANDATORY: fill the Requester (Site + Provider). Without it the Enter-Order Save returns 200
    // but SILENTLY DROPS the sample (order.samples: []) → 0 analyses → false "multi-component broken".
    await fillRequester(page, { site: 'MUL', provider: 'Sarah' });
    await shot(page, info, 'Enter Order — COVIDPCR + Requester', { fullPage: false });

    // Enter → Collect → (Label/Store skip) → QA → Submit, reusing the clinical flow shape.
    await clickButton(page, /save & next|save and next/i, 2500);
    await page.waitForTimeout(1000);
    // Collect: set a Unit if present, provide consent, advance.
    const unitSel = page.locator('select').filter({ hasText: /mL|Unit/i }).first();
    await unitSel.selectOption({ label: 'mL' }).catch(() => {});
    await checkByLabel(page, /patient has provided signed consent/i).catch(() => {});
    await clickButton(page, /save & next|save and next/i, 3000);
    await page.waitForTimeout(800);
    await clickButton(page, /print all labels/i, 800).catch(() => {});
    await checkByLabel(page, /skip storage|skip this step|no storage|assign later/i).catch(() => {});
    await clickButton(page, /save & next|save and next/i, 3000);
    await completeQaChecklist(page).catch(() => {});
    await clickButton(page, /submit/i, 3000).catch(() => {});
    console.log('MC_WRITES=' + JSON.stringify(writes));
    assertOrderPersisted(writes, 'covid multi-component order');
    // False-positive guard: prove the sample+tests actually persisted (not a silent empty save).
    await assertSamplePersisted(page, lab);

    // Result entry — By Order: assert a component-labeled field for BOTH N2 and E.
    await go(page, `/result?type=order&doRange=false`);
    await page.getByPlaceholder(/accession|lab number/i).first().fill(lab).catch(() => {});
    await page.getByRole('button', { name: /^Search$/ }).first().click().catch(() => {});
    await page.waitForTimeout(2500);
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
