import { test, expect, Page } from '@playwright/test';

/**
 * AMR V2 post-merge release check (OGC-1605, OGC-1606), testing.openelis-global.org after #4819.
 *
 * TC-AMR-R01: a urine culture ordered through ordinary order entry (legacy Add Order, Program chosen at
 * order entry) opens a case through the production routing path; the case is worked to a 10-agent AST
 * and released FINAL from the case Report tab with no database edits.
 *   OGC-1605: the projected summary for 10 agents is over 200 characters and used to fail REPORT_CONTENT_TOO_LONG.
 *   OGC-1606: cases opened by routing had no report mapping and failed REPORT_MAPPING_REQUIRED.
 *
 * Fixture on testing (built by others on 4 Nov 2026, read only here): test 448 "QA_AUTO Urine culture"
 * (Urines, lab unit 263 QA_AUTO Micro, opens a case, role CULTURE), Program 14 "QA_AUTO Clinical
 * bacteriology" (Show on Microbiology case), panel "QA_AUTO Gram negative rods (10)", organism
 * Escherichia coli, breakpoint standard CLSI QA-AUTO-1104 (active), medium 164 "QA_AUTO MacConkey agar".
 * Override with AMR_R_* env vars when rebuilt elsewhere.
 */
const R = '/api/OpenELIS-Global/rest';
const M = `${R}/microbiology`;
const FX = {
  testName: process.env.AMR_R_TEST ?? 'QA_AUTO Urine culture',
  program: process.env.AMR_R_PROGRAM ?? 'QA_AUTO Clinical bacteriology',
  panel: process.env.AMR_R_PANEL ?? 'QA_AUTO Gram negative rods (10)',
  organism: process.env.AMR_R_ORGANISM ?? 'Escherichia coli',
  standard: process.env.AMR_R_STANDARD ?? 'QA-AUTO-1104',
  method: process.env.AMR_R_METHOD ?? 'BIOCHEMICAL',
};

async function csrf(page: Page) {
  if (!/^https?:/.test(page.url())) await page.goto('/');
  await page.waitForFunction(() => !!localStorage.getItem('CSRF'), null, { timeout: 15000 });
  return (await page.evaluate(() => localStorage.getItem('CSRF'))) ?? '';
}
async function ok(label: string, r: any) {
  const t = await r.text();
  console.log(`[${label}] ${r.status()} ${t.slice(0, 400).replace(/\s+/g, ' ')}`);
  expect(r.status(), `${label}: ${t.slice(0, 300)}`).toBeLessThan(400);
  try { return JSON.parse(t); } catch { return t; }
}

async function placeCultureOrder(page: Page): Promise<string> {
  const stamp = Date.now().toString().slice(-8);
  await page.goto('/SamplePatientEntry', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /^New Patient$/i }).click();
  await page.waitForTimeout(800);
  await page.locator('#subjectNumber').fill(`QA-AUTO-UHID-${stamp}`);
  await page.locator('#nationalId').fill(`QA-AUTO-NID-${stamp}`);
  await page.locator('#lastName').fill('Qaamrrelease');
  await page.locator('#firstName').fill('Urine');
  await page.locator('#date-picker-default-id').last().fill('02/02/1985');
  await page.locator('label[for="radio-2"]').click().catch(async () => { await page.getByText(/^Female$/).first().click(); });
  await page.getByRole('button', { name: /^Next$/ }).click();
  await page.waitForTimeout(1200);
  await page.locator('#additionalQuestionsSelect').selectOption({ label: FX.program });
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /^Next$/ }).click();
  await page.waitForTimeout(1200);
  await page.locator('#sampleId_0').selectOption({ label: 'Urines' });
  await page.waitForTimeout(1500);
  await page.locator('label', { hasText: FX.testName }).first().click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /^Next$/ }).click();
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('a,button')].find((e) => /^\s*Generate\s*$/i.test((e as HTMLElement).textContent || ''));
    (el as HTMLElement | undefined)?.click();
  });
  let accession = '';
  for (let i = 0; i < 12 && !accession; i++) {
    accession = (await page.locator('#labNo').inputValue().catch(() => '')).trim();
    if (!accession) await page.waitForTimeout(500);
  }
  expect(accession).toMatch(/\w{6,}/);
  await page.locator('#requesterFirstName').fill('QA');
  await page.locator('#requesterLastName').fill('Tester');
  await page.locator('#siteName').fill('Mulago');
  await page.waitForTimeout(1400);
  await page.evaluate(() => {
    const opt = [...document.querySelectorAll('[role=option],li,[class*="menu"] *,[class*="suggest"] *')]
      .find((e) => (e as HTMLElement).children.length === 0 && /^\s*Mulago\s*$/i.test((e as HTMLElement).textContent || ''));
    (opt as HTMLElement | undefined)?.click();
  });
  await page.waitForTimeout(700);
  const save = page.waitForResponse((r) => /SamplePatientEntry/.test(r.url()) && r.request().method() === 'POST', { timeout: 60000 });
  await page.getByRole('button', { name: /^Submit$/ }).click();
  const sr = await save;
  console.log('[order save]', sr.status(), (await sr.text()).slice(0, 200));
  await page.waitForTimeout(2500);
  await page.screenshot({ path: '/home/claude/amrload/evidence/amr-r01-order-saved.png', fullPage: true });
  return accession;
}

async function workCaseToFinal(page: Page, accession: string, panelName: string, micFor: (code: string, i: number) => number, tag: string) {
  console.log('ACCESSION', accession);

  // Case opened by routing (production path).
  let rows: any[] = [];
  for (let i = 0; i < 10 && !rows.length; i++) {
    rows = (await (await page.request.get(`${M}/cases/by-accession?accessionNumber=${accession}`)).json())?.rows ?? [];
    if (!rows.length) await page.waitForTimeout(1500);
  }
  expect(rows, 'order opened one microbiology case').toHaveLength(1);
  const caseId = rows[0].id;
  console.log('CASE', caseId);
  const token = await csrf(page);
  const H = { 'X-CSRF-Token': token };
  const shell = await ok('shell', await page.request.get(`${M}/cases/${caseId}/shell`));
  console.log('PROGRAMS on case', JSON.stringify(shell.programs), 'required', JSON.stringify(shell.requiredClinicalFields));

  // Clinical context required before final.
  const origins = await ok('origins', await page.request.get(`${M}/reference/patient-origins`));
  const olist = origins.options ?? origins;
  const origin = olist.find((o: any) => o.code === 'INPATIENT') ?? olist[0];
  await ok('order-detail', await page.request.put(`${M}/cases/${caseId}/order-detail`, {
    headers: H, data: { culturePurpose: 'DIAGNOSTIC', patientOrigin: origin.code ?? origin.value ?? origin.id, clinicalHistory: 'QA_AUTO release check' },
  }));

  // Culture: inoculate and record growth.
  const sampleItemId = shell.samples[0].sampleItemId;
  const opts = await ok('culture options', await page.request.get(`${M}/cases/${caseId}/cultures/options`));
  const medium = opts.media[0];
  const created = await ok('inoculate', await page.request.post(`${M}/cases/${caseId}/cultures`, {
    headers: H,
    data: {
      sourceSampleItemId: sampleItemId, containerIdentifier: `QA-${tag}-PLATE`, mediumItemId: medium.id,
      lotId: null, notTracked: true, atmosphereId: opts.atmospheres.find((a: any) => a.value === 'Aerobic').id,
      duration: 24, durationUnit: 'HOURS', inoculatedAt: Date.now() - 2_000,
    },
  }));
  const plate = (Array.isArray(created) ? created : created.rows).find((r: any) => r.containerIdentifier === `QA-${tag}-PLATE`);
  await ok('growth', await page.request.post(`${M}/cases/${caseId}/cultures/${plate.id}/outcome`, { headers: H, data: { outcome: 'GROWTH' } }));

  // Isolate: pick and identify E. coli.
  const ws = await ok('pick isolate', await page.request.post(`${M}/cases/${caseId}/isolates`, {
    headers: H, data: { cultureId: plate.id, gramStain: 'Gram negative rods', colonyMorphology: 'QA R01 lactose fermenter', significance: 'SIGNIFICANT' },
  }));
  const iso = ws.isolates.find((i: any) => i.colonyMorphology === 'QA R01 lactose fermenter');
  const iopts = await ok('isolate options', await page.request.get(`${M}/cases/${caseId}/isolates/options`));
  const organism = iopts.organisms.find((o: any) => o.value === FX.organism);
  const method = iopts.methods.find((m: any) => m.value === FX.method);
  await ok('identify', await page.request.post(`${M}/cases/${caseId}/isolates/${iso.id}/identify`, {
    headers: H,
    data: { organismId: organism.id, identificationStatus: 'FINAL', identificationMethod: method.id, confidence: 99,
      identifiedAt: Date.now() - 30_000, significance: 'SIGNIFICANT', version: iso.version, reason: 'QA release check' },
  }));

  // AST: 10 agents on the Gram negative panel, reviewed and selected for report.
  const panels = await ok('panels', await page.request.get(`${M}/reference/ast-panels`));
  const panel = panels.find((p: any) => p.label === panelName);
  const stds = await ok('standards', await page.request.get(`${M}/reference/breakpoint-standards`));
  const std = stds.find((s: any) => s.label.includes(FX.standard));
  const abx = await ok('panel antibiotics', await page.request.get(`${M}/ast/panels/${panel.id}/antibiotics`));
  const agents = (Array.isArray(abx) ? abx : abx.rows ?? abx.antibiotics);
  console.log('AGENTS', agents.length);
  expect(agents.length).toBeGreaterThanOrEqual(10);
  let runs = await ok('runs', await page.request.get(`${M}/ast/runs?isolateId=${iso.id}`));
  let run = runs.find((r: any) => r.status === 'IN_PROGRESS');
  if (!run) run = await ok('start run', await page.request.post(`${M}/ast/runs`, {
    headers: H, data: { isolateId: iso.id, panelId: panel.id, breakpointStandardId: std.id, technique: 'BROTH_MICRODILUTION', panelAdjustmentReason: 'QA release check' },
  }));
  const have = new Set((run.readings ?? []).filter((r: any) => r.rawValue != null).map((r: any) => r.antibioticId));
  const ref = await ok('antibiotics', await page.request.get(`${M}/reference/antibiotics`));
  const codeOf = (id: string) => ref.find((x: any) => x.id === id)?.code ?? '';
  let k = 0;
  for (const a of agents) {
    const id = a.antibioticId ?? a.id;
    if (have.has(id)) continue;
    await ok(`reading ${a.whonetCode ?? a.code}`, await page.request.post(`${M}/ast/runs/${run.id}/readings`, {
      headers: H, data: { antibioticId: id, method: 'MIC', rawValue: micFor(codeOf(id), k++) },
    }));
  }
  await ok('review', await page.request.post(`${M}/ast/runs/${run.id}/review`, { headers: H, data: {} }));
  await ok('reportable', await page.request.post(`${M}/ast/runs/${run.id}/reportable`, { headers: H, data: {} }));
  const ready = await ok('readiness', await page.request.get(`${M}/cases/${caseId}/readiness`));
  console.log('READINESS', JSON.stringify(ready));

  // UI: release the final report from the case Report tab.
  await page.goto(`/Microbiology/cases/${caseId}?scope=REPORT`);
  const btn = page.getByRole('button', { name: 'Release final report' });
  await expect(btn).toBeVisible({ timeout: 30000 });
  await page.screenshot({ path: `/home/claude/amrload/evidence/amr-${tag}-before-release.png`, fullPage: true });
  await expect(btn).toBeEnabled({ timeout: 20000 });
  const rel = page.waitForResponse((r) => r.url().includes(`/cases/${caseId}/release/final`), { timeout: 60000 });
  await btn.click();
  const rr = await rel;
  console.log('[release/final]', rr.status(), (await rr.text()).slice(0, 600));
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `/home/claude/amrload/evidence/amr-${tag}-after-release.png`, fullPage: true });
  const main = (await page.locator('main').innerText()).replace(/\n+/g, ' | ');
  console.log('UI AFTER', main.slice(0, 2500));
  expect(main).not.toMatch(/REPORT_CONTENT_TOO_LONG|REPORT_MAPPING_REQUIRED/);
  expect(rr.status()).toBeLessThan(400);

  const after = await ok('shell after', await page.request.get(`${M}/cases/${caseId}/shell`));
  console.log('STAGE', after.stage, after.finalReleaseState);
  const report = await ok('report', await page.request.get(`${M}/cases/${caseId}/report`));
  const sus = report.isolates.flatMap((i: any) => i.susceptibilities);
  console.log('REPORT SUS', sus.length, JSON.stringify(sus.map((s: any) => [s.agent, s.value ?? s.rawValue, s.interpretation])));
  const versions = await ok('versions', await page.request.get(`${M}/cases/${caseId}/report/versions`));
  console.log('VERSIONS', JSON.stringify(versions).slice(0, 500));
  expect(after.stage).toBe('FINAL_RELEASED');
  return { caseId, sus, main };
}

test('TC-AMR-R01 culture ordered through order entry releases FINAL with a 10-agent panel (OGC-1605, OGC-1606)', async ({ page }) => {
  test.setTimeout(600_000);
  const accession = process.env.AMR_R_ACCESSION || (await placeCultureOrder(page));
  await page.waitForTimeout(5000);
  const mic = [32, 0.25, 16, 1, 0.5, 4, 2, 8, 64, 0.06];
  const { sus } = await workCaseToFinal(page, accession, FX.panel, (_c, i) => mic[i % mic.length], 'r01');
  expect(sus.length).toBeGreaterThanOrEqual(10);
});

test('TC-AMR-R02 an identification method the lab adds (and links to a test) is offered when identifying an isolate (OGC-1602)', async ({ page }) => {
  test.setTimeout(400_000);
  const extra = process.env.AMR_R_EXTRA_METHOD ?? 'QA_AUTO BD Phoenix';
  const accession = process.env.AMR_R02_ACCESSION || (await placeCultureOrder(page));
  await page.waitForTimeout(5000);
  const rows = (await (await page.request.get(`${M}/cases/by-accession?accessionNumber=${accession}`)).json())?.rows ?? [];
  const caseId = rows[0].id;
  const H = { 'X-CSRF-Token': await csrf(page) };
  const shell = await ok('shell', await page.request.get(`${M}/cases/${caseId}/shell`));
  let isoList = (await ok('isolates', await page.request.get(`${M}/cases/${caseId}/isolates`))).isolates ?? [];
  if (!isoList.length) {
    const opts = await ok('culture options', await page.request.get(`${M}/cases/${caseId}/cultures/options`));
    const created = await ok('inoculate', await page.request.post(`${M}/cases/${caseId}/cultures`, {
      headers: H,
      data: { sourceSampleItemId: shell.samples[0].sampleItemId, containerIdentifier: 'QA-R02-PLATE', mediumItemId: opts.media[0].id,
        lotId: null, notTracked: true, atmosphereId: opts.atmospheres[0].id, duration: 24, durationUnit: 'HOURS', inoculatedAt: Date.now() - 2_000 },
    }));
    const plate = (Array.isArray(created) ? created : created.rows).find((r: any) => r.containerIdentifier === 'QA-R02-PLATE');
    await ok('growth', await page.request.post(`${M}/cases/${caseId}/cultures/${plate.id}/outcome`, { headers: H, data: { outcome: 'GROWTH' } }));
    await ok('pick', await page.request.post(`${M}/cases/${caseId}/isolates`, {
      headers: H, data: { cultureId: plate.id, gramStain: 'Gram negative rods', colonyMorphology: 'QA R02 colonies', significance: 'SIGNIFICANT' },
    }));
  }
  console.log('R02 ACCESSION', accession, 'CASE', caseId);
  await page.goto(`/Microbiology/cases/${caseId}?scope=ISOLATES`);
  await page.waitForLoadState('networkidle');
  const identify = page.getByRole('button', { name: /Identify organism|Identify|Re-identify/ }).first();
  await expect(identify).toBeVisible({ timeout: 30000 });
  await identify.click();
  const select = page.locator('#isolate-identificationMethod, select[id*="identificationMethod"]').first();
  await expect(select).toBeVisible({ timeout: 15000 });
  const options = (await select.locator('option').allTextContents()).map((s) => s.trim()).filter(Boolean);
  console.log('UI METHODS', JSON.stringify(options));
  await page.screenshot({ path: '/home/claude/amrload/evidence/amr-r02-identify-methods.png', fullPage: true });
  expect(options).toContain(extra);
  expect(options.join('|')).not.toMatch(/MANUAL_BIOCHEMISTRY|VITEK_2/);
});

test('TC-AMR-R03 TRIPWIRE an agent set to "suppress unless resistant" is left off the released report when susceptible (OGC-1605 part 2)', async ({ page }) => {
  // FLIP-WHEN-FIXED. Observed 4 Nov 2026 on testing (develop f3047c5, #4819): Meropenem 0.06 S prints on the case
  // report, the report API and the patient PDF although the run's panel row is SUPPRESS_UNLESS_RESISTANT. No
  // report code reads reportBehavior. v3 #4823 (choose which antibiotics print) may supersede this; Casey's call.
  test.fail();
  test.setTimeout(600_000);
  const name = 'QA_AUTO GNR suppress (10)';
  await page.goto('/');
  const H = { 'X-CSRF-Token': await csrf(page) };
  const admin = await ok('admin panels', await page.request.get(`${M}/admin/reference/ast-panels?pageSize=50`));
  if (!admin.rows.some((p: any) => p.name === name && p.current)) {
    const base = admin.rows.find((p: any) => p.name === FX.panel && p.current);
    await ok('create suppress panel', await page.request.post(`${M}/admin/reference/ast-panels`, {
      headers: H,
      data: {
        name, susceptibilityProtocol: 'GENERAL', active: true, current: true,
        antibiotics: base.antibiotics.map((a: any) => ({
          antibioticId: a.antibioticId, displayOrder: a.displayOrder, tier: a.tier,
          reportBehavior: ['MEM', 'AMK'].includes(a.whonetCode) ? 'SUPPRESS_UNLESS_RESISTANT' : 'ALWAYS',
        })),
      },
    }));
  }
  const accession = process.env.AMR_R03_ACCESSION || (await placeCultureOrder(page));
  await page.waitForTimeout(5000);
  // Meropenem susceptible (should be suppressed), Amikacin resistant (should print).
  const mic: Record<string, number> = { MEM: 0.06, AMK: 64 };
  const { caseId, sus, main } = await workCaseToFinal(page, accession, name, (code, i) => mic[code] ?? [32, 0.25, 16, 1, 0.5, 4, 2, 8][i % 8], 'r03');
  const agents = sus.map((s: any) => s.agent);
  console.log('R03 REPORT AGENTS', JSON.stringify(agents));
  await page.goto(`/Microbiology/cases/${caseId}?scope=REPORT`);
  const report = page.locator('main');
  await expect(report).toContainText('Amikacin', { timeout: 20000 });
  await page.screenshot({ path: '/home/claude/amrload/evidence/amr-r03-report.png', fullPage: true });
  const pdf = await page.request.get(`/api/OpenELIS-Global/ReportPrint?report=patientCILNSP_vreduit&type=patient&accessionDirect=${accession}&highAccessionDirect=${accession}`);
  require('fs').writeFileSync(`/home/claude/amrload/evidence/amr-r03-${accession}.pdf`, await pdf.body());
  expect(agents).toContain('Amikacin');
  expect(agents).not.toContain('Meropenem');
  expect(main).toContain('Amikacin');
});
