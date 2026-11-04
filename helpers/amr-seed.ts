/**
 * helpers/amr-seed.ts
 *
 * The QA_AUTO microbiology seed (4 Nov 2026, Casey: "always seed any needed data"). Finds each piece by
 * name and creates only what is missing, so it is safe to run on every spec start and on a fresh server.
 *
 *   fixtures/amr-qa/*.csv  -> organisms (E. coli, K. pneumoniae), 10 antimicrobials, the synthetic
 *                             breakpoint edition CLSI QA-AUTO-1104 (NOT for clinical use) and the panel
 *                             "QA_AUTO Gram negative rods (10)" (Meropenem SUPPRESS_UNLESS_RESISTANT).
 *   lab unit  "QA_AUTO Micro"
 *   test      "QA_AUTO Urine culture" (QAUCX, Urines, opens a case, CULTURE role)
 *   medium    "QA_AUTO MacConkey agar" (inventory item, microbiologyMedium, lots not tracked)
 *   program   "QA_AUTO Clinical bacteriology" (QA_BACT, shown on the case, Bacterial track); final release
 *             needs a programme shown on the case.
 *
 * driveCaseToReportable() works a case opened by order entry through inoculation, growth, an E. coli
 * identification and a 10-agent MIC AST to reviewed + reportable, then sets patient origin and programme.
 */
import { expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { apiGet, apiWrite } from './silentSave';

const API = '/api/OpenELIS-Global';
const MICRO = '/rest/microbiology';
export const AMR_SEED = {
  edition: { publisher: 'CLSI', version: 'QA-AUTO-1104' },
  panel: 'QA_AUTO Gram negative rods (10)',
  labUnit: 'QA_AUTO Micro',
  test: 'QA_AUTO Urine culture',
  testCode: 'QAUCX',
  sampleType: 'Urines',
  medium: 'QA_AUTO MacConkey agar',
  program: 'QA_AUTO Clinical bacteriology',
  programCode: 'QA_BACT',
};
/** MIC readings: AMP and AMC resistant, CIP and SXT resistant, the rest susceptible. MEM is susceptible on purpose. */
export const AMR_MIC: Record<string, number> = { AMP: 64, AMC: 16, CRO: 0.5, CAZ: 2, FEP: 1, CIP: 2, GEN: 1, AMK: 2, SXT: 8, MEM: 0.25 };
export const AMR_AGENTS = ['Ampicillin', 'Amoxicillin', 'Ceftriaxone', 'Ceftazidime', 'Cefepime', 'Ciprofloxacin', 'Gentamicin', 'Amikacin', 'Trimethoprim', 'Meropenem'];

const FIX = path.join(__dirname, '..', 'fixtures', 'amr-qa');
const CSV: [string, string][] = [
  ['microbiology-organisms', 'microbiology-organisms-qa.csv'],
  ['microbiology-antimicrobials', 'microbiology-antimicrobials-qa.csv'],
  ['microbiology-breakpoints', 'microbiology-breakpoints-qa.csv'],
  ['microbiology-ast-panels', 'microbiology-ast-panels-qa.csv'],
];

async function ok<T = any>(page: Page, method: 'GET' | 'POST' | 'PUT', p: string, body?: unknown): Promise<T> {
  const r = method === 'GET' ? await apiGet<T>(page, p) : await apiWrite<T>(page, method, p, body ?? {});
  expect(r.status, `${method} ${p}: ${r.text.slice(0, 300)}`).toBeLessThan(300);
  return r.json as T;
}
const rows = (x: any): any[] => (Array.isArray(x) ? x : x?.rows ?? x?.data ?? x?.items ?? []);

async function importCatalog(page: Page) {
  const token = await page.evaluate(() => localStorage.getItem('CSRF') ?? '');
  const multipart = new FormData();
  for (const [domain, file] of CSV) {
    multipart.append('files', new Blob([fs.readFileSync(path.join(FIX, file))], { type: 'text/csv' }), file);
    multipart.append('domains', domain);
  }
  const r = await page.request.post(`${API}/rest/configuration/import/apply`, { headers: { 'X-CSRF-Token': token }, multipart, timeout: 300_000 });
  expect(r.status(), `catalog import: ${(await r.text()).slice(0, 300)}`).toBeLessThan(300);
}

async function ensureEdition(page: Page): Promise<string> {
  const list = rows(await ok(page, 'GET', `${MICRO}/admin/breakpoints/standards`));
  const ed = list.find((s: any) => s.authority === AMR_SEED.edition.publisher && s.version === AMR_SEED.edition.version);
  expect(ed, `breakpoint edition ${AMR_SEED.edition.version} after import`).toBeTruthy();
  if (ed.lifecycleStatus !== 'ACTIVE') await ok(page, 'POST', `${MICRO}/admin/breakpoints/standards/${ed.id}/activate?effectiveDate=2026-01-01`);
  const def = await apiGet<any>(page, `${MICRO}/admin/breakpoints/default`);
  if (def.json?.standardId !== ed.id) await ok(page, 'PUT', `${MICRO}/admin/breakpoints/standards/${ed.id}/default`);
  return ed.id;
}

async function ensureLabUnit(page: Page): Promise<string> {
  const all = rows(await ok<any>(page, 'GET', '/rest/lab-units-management'));
  let unit = all.find((u: any) => u.name === AMR_SEED.labUnit);
  if (!unit) {
    const r = await ok<any>(page, 'POST', '/rest/lab-units-management', {
      names: { en: AMR_SEED.labUnit, fr: AMR_SEED.labUnit }, description: 'QA fixture: AMR V2 checks', domain: 'CLINICAL', isActive: true,
    });
    unit = r.data;
  }
  if (!unit.isActive) {
    const cur = (await ok<any>(page, 'GET', `/rest/lab-units-management/${unit.id}`)).data;
    await ok(page, 'PUT', `/rest/lab-units-management/${unit.id}`, { ...cur, isActive: true });
  }
  return String(unit.id);
}

async function ensureTest(page: Page, labUnitId: string, sampleTypeId: string): Promise<string> {
  const TC = '/rest/test-catalog';
  const found = rows(await ok(page, 'GET', `${TC}/tests?search=${encodeURIComponent(AMR_SEED.test)}&page=1&pageSize=50`))
    .find((t: any) => t.code === AMR_SEED.testCode);
  let id = found ? String(found.testId) : '';
  if (!id) {
    const r = await ok<any>(page, 'POST', `${TC}/tests`, { name: AMR_SEED.test, reportingName: AMR_SEED.test, code: AMR_SEED.testCode, domain: 'CLINICAL', labUnitId, sampleTypeId });
    id = String(r.testId);
  }
  const b = await ok<any>(page, 'GET', `${TC}/tests/${id}/basic-info`);
  if (!b.opensMicrobiologyCase || b.microbiologyCaseRole !== 'CULTURE' || !b.antimicrobialResistance) {
    await ok(page, 'PUT', `${TC}/tests/${id}/basic-info`, { ...b, antimicrobialResistance: true, opensMicrobiologyCase: true, microbiologyCaseRole: 'CULTURE' });
  }
  if (!b.active) await ok(page, 'POST', `${TC}/tests/${id}/activate`);
  return id;
}

async function ensureMedium(page: Page): Promise<number> {
  const items = rows(await ok(page, 'GET', '/rest/inventory/items/all'));
  const hit = items.find((i: any) => i.name === AMR_SEED.medium && i.isActive !== 'N');
  if (hit) return Number(hit.id);
  const r = await ok<any>(page, 'POST', '/rest/inventory/items', {
    name: AMR_SEED.medium, tags: ['Reagent'], units: 'plates', category: 'QA', lowStockThreshold: 5, stabilityAfterOpening: 30,
    storageRequirements: 'QA fixture', calibrationRequired: 'N', trackLots: 'N', isActive: 'Y', microbiologyMedium: true,
  });
  return Number(r.id);
}

async function ensureProgram(page: Page, labUnitId: string): Promise<string> {
  const list = rows(await ok(page, 'GET', '/rest/program-list'));
  const hit = list.find((p: any) => p.code === AMR_SEED.programCode);
  if (hit) return String(hit.id);
  const r = await ok<any>(page, 'POST', '/rest/program', {
    program: { code: AMR_SEED.programCode, programName: AMR_SEED.program }, domain: 'CLINICAL', active: true, showOnMicroCase: true,
    labUnitIds: [labUnitId], reportingTrackId: null,
  });
  // The Bacterial track is optional for release; set it when the instance offers one.
  const bact = (r.reportingTracks ?? []).find((t: any) => t.value === 'Bacterial');
  if (bact) await ok(page, 'POST', '/rest/program', { ...r, reportingTrackId: bact.id });
  return String(r.program.id);
}

export interface AmrSeed { editionId: string; labUnitId: string; testId: string; mediumId: number; programId: string }

/** Load or confirm the whole QA_AUTO microbiology seed. The page must already be on the app (CSRF in localStorage). */
export async function ensureAmrSeed(page: Page): Promise<AmrSeed> {
  const panels = rows(await ok(page, 'GET', `${MICRO}/reference/ast-panels`));
  if (!panels.some((p: any) => p.label === AMR_SEED.panel)) await importCatalog(page);
  const editionId = await ensureEdition(page);
  const labUnitId = await ensureLabUnit(page);
  const testId = await ensureTest(page, labUnitId, '1');
  const mediumId = await ensureMedium(page);
  const programId = await ensureProgram(page, labUnitId);
  return { editionId, labUnitId, testId, mediumId, programId };
}

/** Work a received culture case to a reviewed, reportable 10-agent AST, with origin and programme set for final release. */
export async function driveCaseToReportable(page: Page, caseId: string, sampleItemId: string, programId: string) {
  const C = `${MICRO}/cases/${caseId}`;
  const opts = await ok<any>(page, 'GET', `${C}/cultures/options`);
  const atmosphere = opts.atmospheres.find((a: any) => a.value === 'Aerobic');
  const medium = opts.media.find((m: any) => m.name === AMR_SEED.medium);
  expect(medium, 'the QA medium is offered on the case').toBeTruthy();
  // Inoculation must be at or after receipt and not in the future (server clock).
  const created = await ok<any[]>(page, 'POST', `${C}/cultures`, {
    sourceSampleItemId: sampleItemId, containerIdentifier: 'QA-MAC-1', mediumItemId: medium.id, notTracked: true,
    atmosphereId: atmosphere.id, duration: 24, durationUnit: 'HOURS', inoculatedAt: Date.now() - 1000,
  });
  const plate = created.find((r) => r.containerIdentifier === 'QA-MAC-1');
  await ok(page, 'POST', `${C}/cultures/${plate.id}/outcome`, { outcome: 'GROWTH' });
  const iso = await ok<any>(page, 'GET', `${C}/isolates/options`);
  const eco = iso.organisms.find((o: any) => o.value === 'Escherichia coli');
  const ws = await ok<any>(page, 'POST', `${C}/isolates`, { cultureId: plate.id, gramStain: 'Gram negative rods', colonyMorphology: 'Lactose fermenting colonies', significance: 'SIGNIFICANT' });
  const isolate = ws.isolates[0];
  await ok(page, 'POST', `${C}/isolates/${isolate.id}/identify`, {
    organismId: eco.id, identificationStatus: 'FINAL', identificationMethod: iso.methods[0].id, confidence: 99.5,
    identifiedAt: Date.now() - 1000, significance: 'SIGNIFICANT', version: isolate.version, reason: 'QA fixture',
  });
  const panel = rows(await ok(page, 'GET', `${MICRO}/reference/ast-panels`)).find((p: any) => p.label === AMR_SEED.panel);
  const def = await ok<any>(page, 'GET', `${MICRO}/admin/breakpoints/default`);
  const run = await ok<any>(page, 'POST', `${MICRO}/ast/runs`, { isolateId: isolate.id, panelId: panel.id, breakpointStandardId: def.standardId, technique: 'BROTH_MICRODILUTION' });
  for (const a of rows(await ok(page, 'GET', `${MICRO}/reference/antibiotics`))) {
    const code = String(a.whonetCode || a.code || '').toUpperCase();
    if (code in AMR_MIC) await ok(page, 'POST', `${MICRO}/ast/runs/${run.id}/readings`, { antibioticId: a.id, method: 'MIC', rawValue: AMR_MIC[code] });
  }
  await ok(page, 'POST', `${MICRO}/ast/runs/${run.id}/review`);
  await ok(page, 'POST', `${MICRO}/ast/runs/${run.id}/reportable`);
  await ok(page, 'PUT', `${C}/order-detail`, { patientOrigin: 'OUTPATIENT' });
  await ok(page, 'POST', `${C}/context`, { programId, culturePurpose: 'DIAGNOSTIC' });
  return { isolateId: isolate.id as string, runId: run.id as string };
}
