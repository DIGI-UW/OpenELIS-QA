/**
 * test-catalog-chaos-admin.spec.ts
 *
 * Test Catalog chaos, part 4 of 5: the catalog's administration screens around the editor.
 * Sample Types (TC-CX-STY), Lab Units (TC-CX-LU), Catalog CSV import (TC-CX-IM), and the
 * test list (TC-CX-LS).
 *
 * Same five kinds of non-happy path as parts 1 to 3. Sample types and lab units have no delete in
 * the product, so the QA rows this spec creates are left INACTIVE at the end (LIMS rule:
 * deactivate, never delete). Names: "QA CX ..." / "QACX...".
 * Catalogue: test-catalog-chaos-full.md.
 */
import { test, expect, type Page } from '@playwright/test';
import { apiGet, apiWrite } from './helpers/silentSave';
import { open, watchToasts } from './helpers/catalogUi';
import { TC, RUN, seedTest, observe, ensureOpen } from './helpers/catalogChaos';
import { retireSeeded } from './helpers/catalogChaos';

test.afterAll(async ({ browser }) => retireSeeded(browser));

// ---------------------------------------------------------------------------------------------
// Sample types
// ---------------------------------------------------------------------------------------------
let sseq = 0;
async function newSampleType(page: Page, opts: { active?: boolean; domain?: string } = {}) {
  await ensureOpen(page);
  sseq++;
  const name = `QACX ST${sseq} ${RUN}`;
  const w = await apiWrite<any>(page, 'POST', '/rest/SampleTypeCreate', {
    sampleTypeEnglishName: name, sampleTypeFrenchName: name, description: name, domain: opts.domain ?? 'CLINICAL', active: opts.active ?? true,
  });
  expect(w.status, `create sample type: ${w.text.slice(0, 160)}`).toBe(200);
  const all = (await apiGet<any>(page, '/rest/sample-types')).json?.data ?? [];
  const st = all.find((x: any) => x.name === name || x.description === name);
  expect(st, `the new sample type ${name} is listed`).toBeTruthy();
  return st as { id: string; name: string; description: string; sortOrder: number; isActive: boolean; domain: string };
}
const stOf = async (page: Page, id: string) => (await apiGet<any>(page, `/rest/sample-types/${id}`)).json?.data;
const putSt = (page: Page, id: string, over: Record<string, unknown>) => apiWrite<any>(page, 'PUT', `/rest/sample-types/${id}`, { id, ...over });
const retireSt = async (page: Page, id: string) => { await putSt(page, id, { isActive: false }); };

test.describe('Test Catalog chaos: Sample Types (TC-CX-STY)', () => {
  test('TC-CX-STY-01: names and descriptions longer than their columns are 4xx with a field, never 500', async ({ page }) => {
    test.fail(true, 'TRIPWIRE F19: name 49 and description 41 answer 500; the update 500 returns the Hibernate message');
    await open(page, '/');
    const long49 = `QACX ${RUN} ${'n'.repeat(49)}`.slice(0, 49);
    const c = await apiWrite(page, 'POST', '/rest/SampleTypeCreate', { sampleTypeEnglishName: long49, sampleTypeFrenchName: long49, description: `QACX d ${RUN}`, domain: 'CLINICAL', active: false });
    expect.soft(c.status, `49-character name on create: ${c.text.slice(0, 120)}`).toBeLessThan(500);
    const d41 = await apiWrite(page, 'POST', '/rest/SampleTypeCreate', { sampleTypeEnglishName: `QACX d41 ${RUN}`, sampleTypeFrenchName: `QACX d41 ${RUN}`, description: `QACX ${'d'.repeat(36)}`, domain: 'CLINICAL', active: false });
    expect.soft(d41.status, `41-character description on create: ${d41.text.slice(0, 120)}`).toBeLessThan(500);
    const st = await newSampleType(page, { active: false });
    const u = await putSt(page, st.id, { description: `QACX ${'u'.repeat(36)}` });
    expect.soft(u.status, `41-character description on update: ${u.text.slice(0, 160)}`).toBe(400);
    expect.soft(u.text, 'the answer does not leak the database message').not.toMatch(/value too long|varying|SQL/i);
  });

  test('TC-CX-STY-02: lifecycle: a Display Order move survives the next Basic Info save', async ({ page }) => {

    test.fail(true, 'TRIPWIRE F17: the editor re-sends the sortOrder it loaded, so Basic Info Save undoes a Display Order move');
    const a = await newSampleType(page);
    const b = await newSampleType(page);
    const loaded = await stOf(page, b.id); // the editor loads B
    const mv = await apiWrite<any>(page, 'PUT', `/rest/sample-types/${b.id}/display-order`, { position: 1 });
    expect(mv.status, mv.text.slice(0, 160)).toBe(200);
    const moved = (await stOf(page, b.id)).sortOrder;
    // What the editor sends on Basic Info Save: the sortOrder it loaded.
    expect((await putSt(page, b.id, { name: loaded.name, description: loaded.description, domain: loaded.domain, abbreviation: '', isActive: true, sortOrder: loaded.sortOrder })).status).toBe(200);
    const after = (await stOf(page, b.id)).sortOrder;
    test.info().annotations.push({ type: 'observed', description: `sortOrder loaded ${loaded.sortOrder}, after move ${moved}, after Basic Info save ${after}` });
    await retireSt(page, a.id); await retireSt(page, b.id);
    expect(after, 'the moved position is kept').toBe(moved);
  });

  test('TC-CX-STY-03: the domain rule holds from the sample type side: a vector test cannot be linked to a clinical sample type', async ({ page }) => {
    test.fail(true, 'TRIPWIRE F17: the Sample Type side links a VECTOR test to a CLINICAL sample type (200); the domain rule is only checked on test create');
    const st = await newSampleType(page);
    const vname = `QA CX STY3 vector ${RUN}`;
    const vc = await apiWrite<any>(page, 'POST', `${TC}/tests`, { name: vname, reportingName: vname, code: `QV3${RUN}`, domain: 'VECTOR',
      labUnitId: '169', sampleTypeIds: ['106'], description: vname });
    expect(vc.status, `seed a VECTOR test: ${vc.text.slice(0, 160)}`).toBe(201);
    const vec = { testId: String(vc.json?.testId ?? vc.json?.id) };
    const w = await apiWrite(page, 'PUT', `/rest/sample-types/${st.id}/tests/${vec.testId}`, {});
    observe('link a VECTOR test to a CLINICAL sample type', w);
    if (w.status < 300) await apiWrite(page, 'DELETE', `/rest/sample-types/${st.id}/tests/${vec.testId}`);
    const bad = await putSt(page, st.id, { domain: 'XYZ' });
    observe('set domain XYZ', bad);
    const dom = (await stOf(page, st.id)).domain;
    await retireSt(page, st.id);
    expect.soft(w.status, 'cross-domain link refused').toBe(422);
    expect.soft(bad.status >= 400 || dom === 'CLINICAL', `an unknown domain is refused (domain now ${dom})`).toBe(true);
  });

  test('TC-CX-STY-04: unlinking the only sample type of an active test is refused', async ({ page }) => {

    test.fail(true, 'TRIPWIRE F7: unlinking from the sample type side leaves an active test with no sample type (200)');
    const st = await newSampleType(page);
    const t = await seedTest(page, 'STY4', { sampleTypeId: st.id, activate: true });
    const w = await apiWrite(page, 'DELETE', `/rest/sample-types/${st.id}/tests/${t.id}`);
    observe('unlink the only sample type of an active test', w);
    const b = (await apiGet<any>(page, `${TC}/tests/${t.id}/basic-info`)).json;
    if ((b.sampleTypeIds ?? []).length === 0) await apiWrite(page, 'PUT', `/rest/sample-types/${st.id}/tests/${t.id}`, {});
    const b2 = (await apiGet<any>(page, `${TC}/tests/${t.id}/basic-info`)).json;
    await apiWrite(page, 'PUT', `${TC}/tests/${t.id}/basic-info`, { ...b2, active: false, orderable: false });
    await retireSt(page, st.id);
    expect((b.sampleTypeIds ?? []).length, 'the active test still has its sample type').toBeGreaterThan(0);
  });

  test('TC-CX-STY-05: two editors: saving a name from an old page does not switch back on a sample type another admin switched off', async ({ page }) => {

    test.fail(true, 'TRIPWIRE F11: no stale check; an old page switches a deactivated sample type back on');
    const st = await newSampleType(page);
    const loaded = await stOf(page, st.id); // A
    expect((await putSt(page, st.id, { isActive: false })).status, 'B deactivates').toBe(200);
    const w = await putSt(page, st.id, { name: `${loaded.name} A`, description: loaded.description, domain: loaded.domain, abbreviation: '', isActive: loaded.isActive, sortOrder: loaded.sortOrder });
    observe('A saves its old copy', w);
    const now = await stOf(page, st.id);
    await retireSt(page, st.id);
    expect(w.status === 409 || now.isActive === false, `A refused as stale, or it stays inactive (isActive=${now.isActive})`).toBe(true);
  });

  test('TC-CX-STY-06: lifecycle: create, rename, deactivate, reactivate; order entry\'s sample type list follows', async ({ page }) => {
    const st = await newSampleType(page);
    const offered = async () => JSON.stringify((await apiGet<any>(page, '/rest/user-sample-types')).json ?? '').includes(`"${st.id}"`);
    const renamed = `QACX renamed ${RUN}`;
    expect((await putSt(page, st.id, { name: renamed })).status).toBe(200);
    expect((await stOf(page, st.id)).name, 'renamed').toBe(renamed);
    expect((await putSt(page, st.id, { isActive: false })).status).toBe(200);
    expect(await offered(), 'deactivated: not offered in order entry').toBe(false);
    expect((await putSt(page, st.id, { isActive: true })).status).toBe(200);
    expect((await stOf(page, st.id)).isActive, 'reactivated').toBe(true);
    await retireSt(page, st.id);
  });
});

// ---------------------------------------------------------------------------------------------
// Lab units
// ---------------------------------------------------------------------------------------------
const LU = '/rest/lab-units-management';
let lseq = 0;
async function newLabUnit(page: Page) {
  await ensureOpen(page);
  lseq++;
  const name = `QACX U${lseq}${RUN}`; // name column is 20 characters
  const w = await apiWrite<any>(page, 'POST', LU, { names: { en: name }, description: `QA CX unit ${RUN}`, domain: 'CLINICAL' });
  expect(w.status, `create lab unit: ${w.text.slice(0, 160)}`).toBe(201);
  const id = String(w.json?.data?.id);
  expect((await apiWrite(page, 'PUT', `${LU}/${id}`, { id, names: { en: name }, description: `QA CX unit ${RUN}`, domain: 'CLINICAL', isActive: true })).status, 'activate it').toBe(200);
  return { id, name };
}
const luOf = async (page: Page, id: string) => (await apiGet<any>(page, `${LU}/${id}`)).json?.data;
const deactivateKeep = (page: Page, id: string) => apiWrite<any>(page, 'POST', `${LU}/${id}/deactivate`, { option: 'keep', confirmation: 'DEACTIVATE' });

test.describe('Test Catalog chaos: Lab Units (TC-CX-LU)', () => {
  test('TC-CX-LU-01: saving Basic Info on a test whose lab unit was deactivated does not switch the unit back on', async ({ page }) => {
    test.fail(true, 'TRIPWIRE F6: Basic Info re-sends the old labUnitId and the server reactivates the inactive unit');
    const u = await newLabUnit(page);
    const t = await seedTest(page, 'LU1', { labUnitId: u.id });
    expect((await deactivateKeep(page, u.id)).status, 'deactivate the unit, keep its tests').toBe(200);
    expect((await luOf(page, u.id)).isActive, 'the unit is inactive').toBe(false);
    // The editor's Basic Info save: it loaded the old labUnitId and sends the whole form back.
    const b = (await apiGet<any>(page, `${TC}/tests/${t.id}/basic-info`)).json;
    const w = await apiWrite(page, 'PUT', `${TC}/tests/${t.id}/basic-info`, { ...b, description: `QA CX LU1 edited ${RUN}` });
    observe('Basic Info save on a test in the deactivated unit', w);
    const after = await luOf(page, u.id);
    if (after.isActive) await deactivateKeep(page, u.id);
    expect(after.isActive, 'the unit stays inactive').toBe(false);
  });

  test('TC-CX-LU-02: two editors: a description save from an old page does not switch back on a unit another admin deactivated', async ({ page }) => {

    test.fail(true, 'TRIPWIRE F11: no stale check; an old page re-sends isActive:true and undoes the guarded deactivation');
    const u = await newLabUnit(page);
    const loaded = await luOf(page, u.id); // A
    expect((await deactivateKeep(page, u.id)).status, 'B deactivates through the guarded dialog').toBe(200);
    const w = await apiWrite(page, 'PUT', `${LU}/${u.id}`, { id: u.id, names: loaded.names, description: `QA CX A ${RUN}`, domain: loaded.domain, isActive: loaded.isActive });
    observe('A saves its old copy', w);
    const now = await luOf(page, u.id);
    if (now.isActive) await deactivateKeep(page, u.id);
    expect(w.status === 409 || now.isActive === false, `A refused as stale, or it stays inactive (isActive=${now.isActive})`).toBe(true);
  });

  test('TC-CX-LU-03: a unit cannot be renamed to another unit\'s name', async ({ page }) => {

    test.fail(true, "TRIPWIRE F17: a unit can be renamed to another unit's name (200)");
    const a = await newLabUnit(page);
    const b = await newLabUnit(page);
    const w = await apiWrite(page, 'PUT', `${LU}/${b.id}`, { id: b.id, names: { en: a.name }, description: `QA CX unit ${RUN}`, domain: 'CLINICAL', isActive: true });
    observe("rename B to A's name", w);
    await deactivateKeep(page, a.id); await deactivateKeep(page, b.id);
    expect(w.status, 'refused').toBeGreaterThanOrEqual(400);
    expect(w.status).toBeLessThan(500);
  });

  test('TC-CX-LU-04: deactivating with "move tests to" an inactive unit is refused, not a silent reactivation', async ({ page }) => {

    test.fail(true, 'TRIPWIRE F6: "move tests to" an inactive unit is accepted and reactivates that unit');
    const src = await newLabUnit(page);
    const dst = await newLabUnit(page);
    await seedTest(page, 'LU4', { labUnitId: src.id });
    expect((await deactivateKeep(page, dst.id)).status).toBe(200);
    const w = await apiWrite(page, 'POST', `${LU}/${src.id}/deactivate`, { option: 'reassign', destinationLabUnitId: dst.id, confirmation: 'DEACTIVATE' });
    observe('reassign to an inactive unit', w);
    const d = await luOf(page, dst.id);
    if (d.isActive) await deactivateKeep(page, dst.id);
    if ((await luOf(page, src.id)).isActive) await deactivateKeep(page, src.id);
    expect(d.isActive, 'the destination stays inactive').toBe(false);
    expect(w.status, 'and the request is refused').toBe(422);
  });

  test('TC-CX-LU-05: a deactivation the server refuses shows an error in the dialog', async ({ page }) => {

    test.fail(true, 'TRIPWIRE F15: a refused deactivation shows nothing (confirmDeactivation handles success only)');
    const u = await newLabUnit(page);
    await open(page, `/MasterListsPage/LabUnitManagement/${u.id}/basic-info`);
    const toggle = page.locator('label[for="lu-active"]');
    await toggle.waitFor({ state: 'visible', timeout: 60_000 });
    await toggle.click();
    const dlg = page.getByRole('dialog').last();
    await dlg.locator('label[for="lu-deactivate-keep"]').click().catch(() => {});
    await dlg.locator('#lu-deactivate-confirm').fill('DEACTIVATE');
    const refuse = (url: URL) => new RegExp(`${LU}/${u.id}/deactivate$`).test(url.pathname);
    await page.route(refuse, (r) =>
      r.fulfill({ status: 422, contentType: 'application/json', body: '{"success":false,"message":"QA forced refusal"}' }));
    await watchToasts(page);
    const sent = page.waitForResponse((r) => /\/deactivate$/.test(new URL(r.url()).pathname), { timeout: 15_000 });
    await dlg.getByRole('button', { name: /deactivate/i }).last().click();
    expect((await sent).status(), 'the deactivation request was sent and refused').toBe(422);
    await page.waitForTimeout(1500);
    const shown = await page.locator('.cds--inline-notification--error, .cds--toast-notification--error').count();
    test.info().annotations.push({ type: 'observed', description: `error notifications visible: ${shown}` });
    await page.unroute(refuse);
    await deactivateKeep(page, u.id);
    expect(shown, 'the refusal is shown').toBeGreaterThan(0);
  });

  test('TC-CX-LU-06: lifecycle: create a unit, rename it, move a test in, deactivate, and the test list filter follows', async ({ page }) => {
    const u = await newLabUnit(page);
    const t = await seedTest(page, 'LU6');
    const renamed = `QACX R${RUN}`;
    expect((await apiWrite(page, 'PUT', `${LU}/${u.id}`, { id: u.id, names: { en: renamed }, description: `QA CX unit ${RUN}`, domain: 'CLINICAL', isActive: true })).status).toBe(200);
    expect((await luOf(page, u.id)).names?.en, 'renamed').toBe(renamed);
    expect((await apiWrite(page, 'POST', `${LU}/${u.id}/tests/assign`, { testIds: [t.id] })).status, 'assign').toBe(200);
    const inUnit = async () => ((await apiGet<any>(page, `${TC}/tests?labUnit=${u.id}&status=all&pageSize=50`)).json?.rows ?? []).map((r: any) => String(r.testId));
    expect(await inUnit(), 'the list filter shows the moved test').toContain(t.id);
    expect((await deactivateKeep(page, u.id)).status).toBe(200);
    expect((await luOf(page, u.id)).isActive, 'deactivated').toBe(false);
    const units = (await apiGet<any[]>(page, `${TC}/lab-units`)).json ?? [];
    expect(units.map((x: any) => String(x.id)), 'the editor no longer offers the inactive unit').not.toContain(u.id);
  });
});

// ---------------------------------------------------------------------------------------------
// Catalog CSV import
// ---------------------------------------------------------------------------------------------
type CsvFile = { name: string; domain: string; bytes: number[] };
const utf8 = (s: string) => Array.from(Buffer.from(s, 'utf8'));
const latin1 = (s: string) => Array.from(Buffer.from(s, 'latin1'));

async function importCall(page: Page, step: 'preview' | 'apply', files: CsvFile[]) {
  return page.evaluate(async ([s, fs]) => {
    const fd = new FormData();
    for (const f of fs as CsvFile[]) {
      fd.append('files', new Blob([new Uint8Array(f.bytes)], { type: 'text/csv' }), f.name);
      fd.append('domains', f.domain);
    }
    const r = await fetch(`/api/OpenELIS-Global/rest/configuration/import/${s}`, {
      method: 'POST', credentials: 'include', headers: { 'X-CSRF-Token': localStorage.getItem('CSRF') ?? '' }, body: fd,
    });
    const text = await r.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: r.status, json, text: text.slice(0, 2000) };
  }, [step, files] as const);
}
const HEAD = 'testName,testSection,sampleType,isActive,isOrderable,localCode,localization:en';
const row = (name: string, code: string) => `${name},Biochemistry,Serum,N,N,${code},${name}`;
const testsCsv = (rows: string[], prefix = '') => `${prefix}${HEAD}\n${rows.join('\n')}\n`;

test.describe('Test Catalog chaos: Catalog CSV import (TC-CX-IM)', () => {
  test('TC-CX-IM-01: a tests.csv saved by Excel as "CSV UTF-8" (with a byte-order mark) is read', async ({ page }) => {
    test.fail(true, 'TRIPWIRE F18: the tests loader does not strip a UTF-8 BOM, so the first header is not found');
    await open(page, '/');
    const name = `QA CX IM1 ${RUN}`;
    const r = await importCall(page, 'preview', [{ name: `tests-qa-im1-${RUN}.csv`, domain: 'tests', bytes: utf8(testsCsv([row(name, `QI1${RUN}`)], '﻿')) }]);
    const f = r.json?.files?.[0];
    test.info().annotations.push({ type: 'observed', description: `preview: ${JSON.stringify(f).slice(0, 240)}` });
    expect(f?.error ?? null, 'no file-level error').toBeNull();
    expect(f?.created, 'one test would be created').toBe(1);
  });

  test('TC-CX-IM-02: a Latin-1 (Windows) tests.csv keeps its accents', async ({ page }) => {

    test.fail(true, 'TRIPWIRE F18: the tests loader reads UTF-8 only; a Latin-1 "é" is stored as U+FFFD');
    await open(page, '/');
    const name = `QA CX IM2 Hématie ${RUN}`;
    const code = `QI2${RUN}`;
    const ap = await importCall(page, 'apply', [{ name: `tests-qa-im2-${RUN}.csv`, domain: 'tests', bytes: latin1(testsCsv([row(name, code)])) }]);
    expect(ap.status, ap.text.slice(0, 160)).toBe(200);
    const found = (await apiGet<any>(page, `${TC}/tests?status=all&pageSize=10&search=${encodeURIComponent(`IM2`)}`)).json?.rows ?? [];
    const names = found.map((x: any) => x.name).filter((n: string) => n.includes(RUN));
    test.info().annotations.push({ type: 'observed', description: `stored names: ${JSON.stringify(names)}` });
    expect(names.some((n: string) => n.includes('Hématie')), 'the accent survives').toBe(true);
  });

  test('TC-CX-IM-03: preview has no side effects: previewing twice does not double the unresolved-reference count', async ({ page }) => {

    test.fail(true, 'TRIPWIRE F18: each preview writes unresolved-reference rows; a second preview doubles the count');
    await open(page, '/');
    const bogus = `QACX NoSuchSection ${RUN}`;
    const csv = `${HEAD}\nQA CX IM3 ${RUN},${bogus},Serum,N,N,QI3${RUN},QA CX IM3 ${RUN}\n`;
    const count = async () => {
      const u = (await apiGet<any[]>(page, '/rest/configuration/unresolved')).json ?? [];
      const hit = u.find((x: any) => JSON.stringify(x).includes(bogus));
      return hit ? Number(hit.occurrences ?? 1) : 0;
    };
    await importCall(page, 'preview', [{ name: `tests-qa-im3-${RUN}.csv`, domain: 'tests', bytes: utf8(csv) }]);
    const once = await count();
    await importCall(page, 'preview', [{ name: `tests-qa-im3-${RUN}.csv`, domain: 'tests', bytes: utf8(csv) }]);
    const twice = await count();
    test.info().annotations.push({ type: 'observed', description: `unresolved occurrences after 1 preview: ${once}, after 2: ${twice}` });
    expect(twice, 'a second preview records nothing new').toBe(once);
  });

  test('TC-CX-IM-04: preview promises what apply does, even when one file lists the same test twice', async ({ page }) => {

    test.fail(true, 'TRIPWIRE F18: preview says 2 created, apply does 1 created + 1 updated for a repeated row');
    await open(page, '/');
    const name = `QA CX IM4 ${RUN}`;
    const f: CsvFile = { name: `tests-qa-im4-${RUN}.csv`, domain: 'tests', bytes: utf8(testsCsv([row(name, `QI4${RUN}`), row(name, `QI4${RUN}`)])) };
    const pv = (await importCall(page, 'preview', [f])).json?.files?.[0];
    const ap = (await importCall(page, 'apply', [f])).json?.files?.[0];
    const pick = (x: any) => ({ created: x?.created, updated: x?.updated, skipped: x?.skipped });
    test.info().annotations.push({ type: 'observed', description: `preview ${JSON.stringify(pick(pv))} apply ${JSON.stringify(pick(ap))}` });
    expect(pick(pv), 'preview and apply agree').toEqual(pick(ap));
  });

  test('TC-CX-IM-05: two files with the same name in one batch are refused, not silently merged', async ({ page }) => {

    test.fail(true, 'TRIPWIRE F18: two files with the same name are both loaded, the second over the first, with no warning');
    await open(page, '/');
    const n = `tests-qa-im5-${RUN}.csv`;
    const r = await importCall(page, 'preview', [
      { name: n, domain: 'tests', bytes: utf8(testsCsv([row(`QA CX IM5a ${RUN}`, `QI5a${RUN}`)])) },
      { name: n, domain: 'tests', bytes: utf8(testsCsv([row(`QA CX IM5b ${RUN}`, `QI5b${RUN}`)])) },
    ]);
    test.info().annotations.push({ type: 'observed', description: `status ${r.status}; files ${JSON.stringify(r.json?.files ?? r.text).slice(0, 300)}` });
    const flagged = r.status >= 400 || (r.json?.files ?? []).some((x: any) => x.error);
    expect(flagged, 'the duplicate file name is flagged').toBe(true);
  });

  test('TC-CX-IM-06: bad files are refused with a reason (empty, not CSV, header only, wrong header)', async ({ page }) => {
    await open(page, '/');
    const cases: [string, CsvFile][] = [
      ['an empty file', { name: `tests-qa-e-${RUN}.csv`, domain: 'tests', bytes: [] }],
      ['a .txt file', { name: `tests-qa-t-${RUN}.txt`, domain: 'tests', bytes: utf8(testsCsv([row('x', 'y')])) }],
      ['a semicolon-separated file', { name: `tests-qa-s-${RUN}.csv`, domain: 'tests', bytes: utf8('testName;testSection;sampleType\nQA;Biochemistry;Serum\n') }],
    ];
    for (const [what, f] of cases) {
      const r = await importCall(page, 'preview', [f]);
      const err = r.json?.files?.[0]?.error ?? (r.status >= 400 ? r.text : null);
      expect.soft(r.status, `${what}: no crash`).toBeLessThan(500);
      expect.soft(err, `${what}: a reason is given`).toBeTruthy();
    }
  });

  test('TC-CX-IM-07: after a preview, changing a file\'s type in the screen turns Apply off until a new preview', async ({ page }) => {

    test.fail(true, "TRIPWIRE F18: changing a file's type after preview leaves Apply on (setDomainOf keeps the plan)");
    await open(page, '/MasterListsPage/CatalogImport');
    const fname = `tests-qa-im7-${RUN}.csv`;
    await page.locator('input[type="file"]').first().setInputFiles({ name: fname, mimeType: 'text/csv', buffer: Buffer.from(testsCsv([row(`QA CX IM7 ${RUN}`, `QI7${RUN}`)])) });
    await expect(page.getByTestId('catalog-import-files')).toContainText(fname, { timeout: 20_000 });
    const pv = page.waitForResponse((r) => /\/import\/preview$/.test(r.url()));
    await page.getByRole('button', { name: /^preview$/i }).click();
    await pv;
    const apply = page.getByRole('button', { name: /^apply$/i });
    await expect(apply, 'Apply is on after a clean preview').toBeEnabled();
    await page.locator(`select[id="domain-${fname}"]`).selectOption('panels');
    await expect(apply, 'Apply is off once the file type changed').toBeDisabled();
  });
});

// ---------------------------------------------------------------------------------------------
// Test list
// ---------------------------------------------------------------------------------------------
test.describe('Test Catalog chaos: the test list (TC-CX-LS)', () => {
  test('TC-CX-LS-01: absurd paging and filters are answered cleanly (no 500)', async ({ page }) => {
    test.fail(true, 'TRIPWIRE F19: page overflow (1073741825) and sampleType=abc answer 500');
    await open(page, '/');
    for (const q of ['page=1073741825&pageSize=2', 'page=2147483647&pageSize=2147483647', 'page=-5&pageSize=0', 'page=abc',
      `search=${encodeURIComponent("%_'\"<>")}`, `search=${'x'.repeat(5000)}`, 'sampleType=abc', 'labUnit=abc', 'domain=clinical']) {
      const r = await apiGet(page, `${TC}/tests?${q}`);
      expect.soft(r.status, `${q.slice(0, 60)}: ${r.text.slice(0, 100)}`).toBeLessThan(500);
    }
  });

  test('TC-CX-LS-02: ids that are not numbers are 400 or 404 on every catalog admin path', async ({ page }) => {

    test.fail(true, 'TRIPWIRE F19: non-numeric ids outside /rest/test-catalog answer 500 (sample-types, lab-units-management, test methods, group summary)');
    await open(page, '/');
    for (const p of ['/rest/sample-types/abc', `${LU}/abc`, `${TC}/tests/abc/basic-info`, '/rest/test/abc/methods', '/rest/localizations/abc', `${TC}/group/summary?ids=1,abc`]) {
      const r = await apiGet(page, p);
      expect.soft([400, 404], `${p}: ${r.status} ${r.text.slice(0, 80)}`).toContain(r.status);
    }
  });
});
