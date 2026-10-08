/**
 * helpers/ci-fixtures.ts
 *
 * Fixtures that specs read but that an empty stack does not have. Written 2026-10-08 from the
 * develop-stack run 128 failures: on a fresh CI stack these specs failed only because the data
 * they look for was never there (EQA schemes, a storage room, a notebook project, a ward, a
 * sampling site, an inactive lab unit that holds a test, a single-component dictionary test,
 * a three-component test, a panel that spans two sample types).
 *
 * Every function is find-or-create by a fixed "QA CI ..." name, so running the seed twice, or on
 * an instance that already has the fixture, changes nothing. Nothing here depends on ids from a
 * particular instance: lab units, sample types and dictionary entries are looked up by name.
 *
 * Run through ci-fixtures.setup.ts (regression-seed.config.ts, project ci-fixtures), which the
 * develop-stack workflow calls in its "Seed the stack" step on every shard.
 */
import { expect, type Page } from '@playwright/test';

export const NAMES = {
  dictTest: 'QA CI Dict Result',
  dictOther: 'QA CI Dict Other',
  multiComp: 'QA CI MultiComp',
  inactiveUnit: 'QA CI Inactive LU',
  inactiveUnitTest: 'QA CI Inactive LU Test',
  leakPanel: 'QA CI Leak Panel',
  room: 'QA CI Room',
  notebook: 'QA CI Notebook Project',
  site: 'QA-CI Sampling Site',
  siteCode: 'QA-CI-SITE',
  ward: 'QA CI Ward',
  eqaScheme: 'QA-EQA CI Regional',
  eqaProvider: 'QA-EQA CI Provider',
} as const;

export type ApiResult = { status: number; body: any; text: string };

/** In-page fetch to /api/OpenELIS-Global/rest with the CSRF token. */
export async function api(page: Page, method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<ApiResult> {
  return page.evaluate(async ({ method, path, body, headers }) => {
    const init: RequestInit = {
      method,
      credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-Token': localStorage.getItem('CSRF') || '', ...headers },
    };
    if (body !== undefined) init.body = JSON.stringify(body);
    const r = await fetch('/api/OpenELIS-Global/rest' + path, init);
    const text = await r.text().catch(() => '');
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: r.status, body: json, text: text.slice(0, 400) };
  }, { method, path, body, headers });
}

/** A page on the app with the CSRF token in localStorage. */
export async function ready(page: Page): Promise<void> {
  if (!page.url().startsWith('http')) await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!localStorage.getItem('CSRF'), null, { timeout: 30_000 });
}

const list = (b: any): any[] => (Array.isArray(b) ? b : b?.data ?? b?.rows ?? b?.items ?? []);
const ok = (r: ApiResult) => r.status >= 200 && r.status < 300;

// ── catalog lookups ─────────────────────────────────────────────────────────

export async function labUnitId(page: Page, prefer = /^Biochemistry$/): Promise<string> {
  const units = list((await api(page, 'GET', '/test-catalog/lab-units')).body).filter((u) => u.isActive !== false);
  const u = units.find((x) => prefer.test(String(x.name))) ?? units[0];
  expect(u, 'the instance has an active lab unit').toBeTruthy();
  return String(u.id);
}

export async function sampleTypeId(page: Page, name = /^Serum$/): Promise<string> {
  const types = list((await api(page, 'GET', '/test-catalog/sample-types')).body);
  const t = types.find((x) => name.test(String(x.name)));
  expect(t, `the instance has a sample type matching ${name}`).toBeTruthy();
  return String(t.id);
}

/** Dictionary options for a D or M component, by entry name; falls back to any entries. */
export async function dictOptions(page: Page, wanted: string[], resultType: 'D' | 'M', avoid: string[] = []): Promise<any[]> {
  const out: any[] = [];
  const seen = new Set(avoid.map((a) => a.toLowerCase()));
  const take = (d: any) => {
    const name = String(d.name ?? d.value ?? '');
    if (!name || seen.has(name.toLowerCase())) return;
    seen.add(name.toLowerCase());
    out.push({ value: String(d.id), valueName: name, resultType, sortOrder: out.length + 1, normal: out.length === 1 });
  };
  for (const w of wanted) {
    const hits = list((await api(page, 'GET', `/test-catalog/dictionary?search=${encodeURIComponent(w)}`)).body);
    const exact = hits.find((h) => String(h.name).toLowerCase() === w.toLowerCase());
    if (exact) take(exact);
  }
  for (const probe of ['e', 'a', 'o']) {
    if (out.length >= 2) break;
    for (const h of list((await api(page, 'GET', `/test-catalog/dictionary?search=${probe}`)).body)) {
      if (out.length >= 2) break;
      take(h);
    }
  }
  expect(out.length, `two dictionary entries for a ${resultType} component`).toBeGreaterThanOrEqual(2);
  return out.slice(0, 3);
}

/** A catalog list name without its "(Serum)" sample type suffix. */
const bare = (n: unknown) => String(n ?? '').replace(/\s*\([^)]*\)\s*$/, '').trim();

export async function findTest(page: Page, name: string): Promise<{ id: string; active: boolean } | null> {
  const r = await api(page, 'GET', `/test-catalog/tests?search=${encodeURIComponent(name)}&page=1&pageSize=50`);
  const row = list(r.body).find((t) => bare(t.name) === name);
  if (!row) return null;
  const id = String(row.testId ?? row.id);
  const basic = (await api(page, 'GET', `/test-catalog/tests/${id}/basic-info`)).body;
  return { id, active: !!basic?.active };
}

type Component = { code: string; label: string; resultType: 'N' | 'D' | 'M' | 'A'; options?: any[] };

/**
 * A test with the given components (the first is primary), active and orderable. Find-or-create
 * by exact name; an existing test is only (re)activated, never edited.
 */
export async function ensureTest(
  page: Page,
  t: { name: string; code: string; labUnitId: string; sampleTypeId: string; components: Component[] },
  log: string[],
): Promise<string> {
  const found = await findTest(page, t.name);
  let id = found?.id ?? '';
  if (!id) {
    const c = await api(page, 'POST', '/test-catalog/tests', {
      name: t.name, reportingName: t.name, code: t.code, description: `${t.name} (CI fixture)`,
      domain: 'CLINICAL', labUnitId: t.labUnitId, sampleTypeId: t.sampleTypeId, sampleTypeIds: [t.sampleTypeId],
    });
    expect(c.status, `create test ${t.name}: ${c.text}`).toBe(201);
    id = String(c.body?.testId ?? c.body?.id ?? '');
    const sr = await api(page, 'GET', `/test-catalog/tests/${id}/sample-results`);
    const primaryId = sr.body?.components?.[0]?.id;
    const put = await api(page, 'PUT', `/test-catalog/tests/${id}/sample-results`, {
      testId: id,
      components: t.components.map((comp, i) => ({
        ...(i === 0 && primaryId ? { id: primaryId } : {}),
        code: i === 0 ? (sr.body?.components?.[0]?.code ?? comp.code) : comp.code,
        label: comp.label, displayOrder: i, resultType: comp.resultType,
        isPrimary: i === 0, showOnReport: true, allowMultipleReadings: false, significantDigits: comp.resultType === 'N' ? 1 : 0,
        interpretations: [], options: comp.options ?? [],
      })),
    });
    expect(put.status, `components of ${t.name}: ${put.text}`).toBe(200);
    if (t.components[0].resultType === 'N') {
      const comps = (await api(page, 'GET', `/test-catalog/tests/${id}/sample-results`)).body?.components ?? [];
      const primary = comps.find((x: any) => x.isPrimary) ?? comps[0];
      await api(page, 'PUT', `/test-catalog/tests/${id}/ranges`, {
        testId: id,
        ranges: [{ componentId: primary?.id, gender: ' ', minAge: 0, maxAge: null, lowNormal: 0, highNormal: 100 }],
      });
    }
    log.push(`created test ${t.name} id=${id}`);
  }
  if (!found?.active) {
    let a = await api(page, 'POST', `/test-catalog/tests/${id}/activate`, {});
    if (a.status === 409) a = await api(page, 'POST', `/test-catalog/tests/${id}/activate`, { gapsAcknowledged: 'CI fixture: one adult range is enough' });
    const basic = await api(page, 'GET', `/test-catalog/tests/${id}/basic-info`);
    expect(basic.body?.active, `${t.name} is active (activate ${a.status}: ${a.text})`).toBeTruthy();
  }
  return id;
}

// ── fixtures ────────────────────────────────────────────────────────────────

/** TC-SA-01 copy source and target pool; also the EQA scheme's test (TC-EQAHP-00 reads its options). */
export async function ensureDictionaryTests(page: Page, log: string[]): Promise<{ dictTest: string; dictOther: string }> {
  const unit = await labUnitId(page);
  const serum = await sampleTypeId(page);
  const main = await dictOptions(page, ['Positive', 'Negative'], 'D');
  const other = await dictOptions(page, ['Detected', 'Not detected', 'Reactive', 'Non-reactive'], 'D', main.map((o) => o.valueName));
  const dictTest = await ensureTest(page, { name: NAMES.dictTest, code: 'QACIDICT', labUnitId: unit, sampleTypeId: serum,
    components: [{ code: 'PRIMARY', label: 'Result', resultType: 'D', options: main }] }, log);
  const dictOther = await ensureTest(page, { name: NAMES.dictOther, code: 'QACIDOTH', labUnitId: unit, sampleTypeId: serum,
    components: [{ code: 'PRIMARY', label: 'Result', resultType: 'D', options: other }] }, log);
  return { dictTest, dictOther };
}

/** TC-MC-ROUTE: one numeric (primary), one dictionary and one multi-select component. */
export async function ensureMultiComponentTest(page: Page, log: string[]): Promise<string> {
  const unit = await labUnitId(page);
  const serum = await sampleTypeId(page);
  const d = await dictOptions(page, ['Positive', 'Negative'], 'D');
  const m = await dictOptions(page, ['Detected', 'Not detected'], 'M');
  return ensureTest(page, { name: NAMES.multiComp, code: 'QACIMC', labUnitId: unit, sampleTypeId: serum, components: [
    { code: 'RESULT_N', label: 'Value', resultType: 'N' },
    { code: 'RESULT_D', label: 'Interpretation', resultType: 'D', options: d },
    { code: 'RESULT_M', label: 'Organisms', resultType: 'M', options: m },
  ] }, log);
}

/**
 * G-2 / G-4 (OGC-189): an INACTIVE lab unit that still holds a test. A new unit is created
 * inactive; the test is created in it. G-4 will now report OGC-189 on CI as it does locally.
 */
export async function ensureInactiveLabUnitWithTest(page: Page, log: string[]): Promise<string> {
  const units = list((await api(page, 'GET', '/lab-units-management')).body);
  let unit = units.find((u) => String(u.name) === NAMES.inactiveUnit);
  if (!unit) {
    const c = await api(page, 'POST', '/lab-units-management', {
      names: { en: NAMES.inactiveUnit, fr: 'QA CI Unite inactive' }, domain: 'CLINICAL', description: 'QA CI fixture: inactive unit that holds a test', isActive: false,
    });
    expect(c.status, `create lab unit: ${c.text}`).toBeLessThan(300);
    unit = { id: String(c.body?.data?.id ?? c.body?.id ?? ''), isActive: false };
    log.push(`created lab unit ${NAMES.inactiveUnit} id=${unit.id}`);
  }
  const id = String(unit.id);
  const serum = await sampleTypeId(page);
  const found = await findTest(page, NAMES.inactiveUnitTest);
  if (!found) {
    // Made in an active unit, the way the editor does (its unit picker lists active units only),
    // then moved into the inactive one through Basic Info.
    const testId = await ensureTest(page, { name: NAMES.inactiveUnitTest, code: 'QACILUT', labUnitId: await labUnitId(page), sampleTypeId: serum,
      components: [{ code: 'PRIMARY', label: 'Result', resultType: 'N' }] }, log);
    const basic = (await api(page, 'GET', `/test-catalog/tests/${testId}/basic-info`)).body ?? {};
    const put = await api(page, 'PUT', `/test-catalog/tests/${testId}/basic-info`, { ...basic, labUnitId: id });
    expect(put.status, `move ${NAMES.inactiveUnitTest} into ${NAMES.inactiveUnit}: ${put.text}`).toBeLessThan(300);
  }
  // Re-assert inactive (an edit elsewhere may have switched it on).
  const now = list((await api(page, 'GET', '/lab-units-management')).body).find((u) => String(u.id) === id);
  if (now?.isActive) {
    await api(page, 'PUT', `/lab-units-management/${id}`, { names: now.names ?? { en: NAMES.inactiveUnit }, domain: now.domain ?? 'CLINICAL', description: now.description ?? '', isActive: false });
  }
  const check = list((await api(page, 'GET', '/lab-units-management')).body).find((u) => String(u.id) === id);
  expect(check?.isActive, 'the fixture unit is inactive').toBe(false);
  expect(Number(check?.testCount ?? 0), 'the inactive fixture unit holds a test').toBeGreaterThan(0);
  return id;
}

/** TC-PANEL-LEAK: a panel whose members sit on two sample types (Amylase on Serum + Actin Smooth Muscle). */
export async function ensureLeakPanel(page: Page, log: string[]): Promise<string> {
  const panels = list((await api(page, 'GET', '/test-catalog/panels?includeInactive=true')).body);
  const existing = panels.find((p) => String(p.name) === NAMES.leakPanel);
  if (existing) return String(existing.id);
  const byName = async (search: string, re: RegExp) =>
    list((await api(page, 'GET', `/test-catalog/tests?search=${encodeURIComponent(search)}&page=1&pageSize=50`)).body).find((t) => re.test(bare(t.name)));
  const amylase = await byName('Amylase', /^Amylase$/i);
  const actin = await byName('Actin Smooth Muscle', /^Actin Smooth Muscle$/i);
  expect(amylase && actin, 'the base catalog has Amylase and Actin Smooth Muscle').toBeTruthy();
  const c = await api(page, 'POST', '/test-catalog/panels', { name: NAMES.leakPanel, active: false });
  expect(c.status, `create panel: ${c.text}`).toBeLessThan(300);
  const id = String(c.body?.id ?? c.body?.panelId ?? '');
  const m = await api(page, 'PUT', `/test-catalog/panels/${id}/tests`, {
    tests: [{ testId: String(amylase.testId ?? amylase.id), position: 1 }, { testId: String(actin.testId ?? actin.id), position: 2 }], autoActivate: true,
  });
  expect(m.status, `panel members: ${m.text}`).toBeLessThan(300);
  const b = await api(page, 'PUT', `/test-catalog/panels/${id}/basic-info`, {
    name: NAMES.leakPanel, description: 'QA CI fixture: members on Serum and on IHC specimen', domain: 'CLINICAL', active: true,
  });
  log.push(`created panel ${NAMES.leakPanel} id=${id} (basic-info ${b.status})`);
  return id;
}

/** TC-INVHP-02: the storage location dialog needs at least one room. */
export async function ensureRoom(page: Page, log: string[]): Promise<string> {
  const rooms = list((await api(page, 'GET', '/storage/rooms')).body);
  const found = rooms.find((r) => String(r.name) === NAMES.room);
  if (found) return String(found.id);
  const c = await api(page, 'POST', '/storage/rooms', { name: NAMES.room, code: 'QACIRM', description: 'QA CI fixture', active: true });
  expect(c.status, `create room: ${c.text}`).toBeLessThan(300);
  log.push(`created room ${NAMES.room}`);
  return String(c.body?.id ?? '');
}

/** TC-ELNW-05: the Notebook dashboard lists templates ("projects"); make one. */
export async function ensureNotebookProject(page: Page, log: string[]): Promise<string> {
  const books = list((await api(page, 'GET', '/notebook/dashboard/notebooks')).body);
  const found = books.find((b) => String(b.title) === NAMES.notebook);
  if (found) return String(found.id);
  const types = list((await api(page, 'GET', '/displayList/NOTEBOOK_EXPT_TYPE')).body);
  const c = await api(page, 'POST', '/notebook/create', {
    title: NAMES.notebook, type: types[0] ? Number(types[0].id) : undefined,
    objective: 'QA CI objective', protocol: 'QA CI protocol', content: 'QA CI fixture project',
    status: 'DRAFT', isTemplate: true, tags: [], sampleIds: [], pages: [], files: [], comments: [], analyzerIds: [],
  });
  expect(c.status, `create notebook project: ${c.text}`).toBeLessThan(300);
  log.push(`created notebook project id=${c.body?.id}`);
  return String(c.body?.id ?? '');
}

/** OGC1192-9, chain N, the vector lane: an active sampling site with a QA- code. */
export async function ensureSamplingSite(page: Page, log: string[]): Promise<string> {
  const sites = list((await api(page, 'GET', '/admin/vector/sampling-sites')).body);
  const found = sites.find((s) => String(s.code) === NAMES.siteCode);
  if (found) {
    expect(found.active, 'the CI sampling site is active').toBeTruthy();
    return String(found.id);
  }
  const c = await api(page, 'POST', '/admin/vector/sampling-sites', {
    code: NAMES.siteCode, name: NAMES.site, type: 'Soil Sampling Site', active: true,
    gpsLatitude: -6.2, gpsLongitude: 106.8, contactName: 'QA CI',
  });
  expect(c.status, `create sampling site: ${c.text}`).toBeLessThan(300);
  log.push(`created sampling site ${NAMES.siteCode}`);
  return String(c.body?.id ?? '');
}

/**
 * TC-OE-06: a ward under the referring clinic, which /rest/departments-for-site then serves.
 * Made through the Locations & Organizations API (OGC-1363); the legacy Organization form POST
 * with a parent answers 500 on develop (2026-10-08).
 */
export async function ensureWard(page: Page, clinicId: string, log: string[]): Promise<string> {
  const wards = async () => list((await api(page, 'GET', `/departments-for-site?refferingSiteId=${clinicId}`)).body);
  const have = (await wards()).find((w) => String(w.value ?? w.name) === NAMES.ward);
  if (have) return String(have.id);
  const c = await api(page, 'POST', `/locations/organizations/${clinicId}/wards`, { name: NAMES.ward, serviceType: 'OUTPATIENT' });
  const after = (await wards()).find((w) => String(w.value ?? w.name) === NAMES.ward);
  expect(after, `ward under clinic ${clinicId} (POST wards ${c.status}: ${c.text})`).toBeTruthy();
  log.push(`created ward ${NAMES.ward} under clinic ${clinicId}`);
  return String(after.id);
}

/**
 * EQA: a scheme this lab provides (an active program with an active enrolment, which is what
 * /rest/eqa/provider/schemes lists), and the participant side (My EQA Schemes) carrying an
 * orderable dictionary test, for TC-EQAHP-00. Names start "QA-EQA" because TC-EQAHP-00 looks for that.
 */
export async function ensureEqaSchemes(page: Page, testId: string, log: string[]): Promise<{ programId: string; myProgramId: string }> {
  const programs = list((await api(page, 'GET', '/eqa/programs')).body);
  let program = programs.find((p) => String(p.name) === NAMES.eqaScheme);
  if (!program) {
    const c = await api(page, 'POST', '/eqa/programs', {
      name: NAMES.eqaScheme, description: 'QA CI fixture', schemeType: 'REGIONAL_PT', provider: NAMES.eqaProvider,
    });
    expect(c.status, `create EQA program: ${c.text}`).toBeLessThan(300);
    program = c.body;
    log.push(`created EQA program ${NAMES.eqaScheme} id=${program?.id}`);
  }
  const programId = String(program.id);
  const tests = list((await api(page, 'GET', `/eqa/programs/${programId}/tests`)).body);
  if (!tests.length) await api(page, 'PUT', `/eqa/programs/${programId}/tests`, { testIds: [Number(testId)] });
  const enrolled = list((await api(page, 'GET', `/eqa/programs/${programId}/enrollments`)).body);
  if (!enrolled.some((e) => String(e.status ?? 'Active') === 'Active')) {
    const eligible = list((await api(page, 'GET', `/eqa/eligible-organizations?programId=${programId}`)).body);
    expect(eligible.length, 'an organization can be enrolled in the EQA scheme').toBeGreaterThan(0);
    const e = await api(page, 'POST', `/eqa/programs/${programId}/enrollments`, { organizationIds: [String(eligible[0].id ?? eligible[0].organizationId)] });
    expect(e.status, `enrol in EQA scheme: ${e.text}`).toBeLessThan(300);
    log.push('enrolled an organization in the EQA scheme');
  }
  const mine = list((await api(page, 'GET', '/eqa/my-programs')).body);
  let my = mine.find((p) => String(p.programName) === NAMES.eqaScheme);
  if (!my) {
    const unit = String((await api(page, 'GET', `/test-catalog/tests/${testId}/basic-info`)).body?.labUnitId ?? '');
    const c = await api(page, 'POST', '/eqa/my-programs', {
      programName: NAMES.eqaScheme, provider: NAMES.eqaProvider, description: 'QA CI fixture', isActive: true,
      labUnitIds: unit ? [Number(unit)] : [], testIds: [Number(testId)], panelIds: [],
    });
    expect(c.status, `enrol this lab (My EQA Schemes): ${c.text}`).toBeLessThan(300);
    my = c.body;
    log.push(`created My EQA Schemes entry id=${my?.id}`);
  }
  return { programId, myProgramId: String(my.id) };
}

/** Chain F and the EQA sidebar: eqaEnabled = true (Admin > Order Entry Configuration). */
export async function ensureEqaEnabled(page: Page, log: string[]): Promise<void> {
  const read = async () => {
    const r = await api(page, 'GET', '/SampleEntryConfigMenu');
    const row = (r.body?.menuList ?? []).find((x: any) => x.name === 'eqaEnabled');
    return row ? String(row.value) : 'missing';
  };
  if ((await read()) === 'true') return;
  // There is no REST toggle; the save is POST /rest/SampleEntryConfig?ID=<row id> from this form
  // (same path as tests/eqa-prereq.spec.ts).
  await page.goto('/MasterListsPage/SampleEntryConfigurationMenu', { waitUntil: 'domcontentloaded' });
  const row = page.locator('tr').filter({ hasText: 'eqaEnabled' }).first();
  await expect(row, 'the eqaEnabled row is listed').toBeVisible({ timeout: 30_000 });
  // Two stages: select the row radio, then Modify (disabled until a row is selected) opens the
  // value form. The row radio is Carbon's visually hidden input: a forced pointer click on it is
  // sometimes lost ("Clicking the checkbox did not change its state", shard 3 of run 129; Modify
  // left disabled locally), so the click is dispatched on the element itself, which React's
  // onChange always sees. Retry the pair until Modify offers the value radios.
  const yes = page.locator('input[type=radio][value="true"]').first();
  const modify = page.getByRole('button', { name: /Modify/i }).first();
  await expect(async () => {
    await row.locator('input[type=radio]').first().evaluate((el) => (el as HTMLInputElement).click());
    await expect(modify).toBeEnabled({ timeout: 3_000 });
    await modify.click({ timeout: 5_000 });
    await expect(yes).toBeAttached({ timeout: 5_000 });
  }, 'Modify on the eqaEnabled row offers true').toPass({ timeout: 45_000 });
  await yes.check({ force: true });
  const save = page.waitForResponse((r) => r.url().includes('SampleEntryConfig') && r.request().method() === 'POST', { timeout: 20_000 });
  await page.getByRole('button', { name: /^Save$/i }).first().click();
  expect((await save).status(), 'eqaEnabled save').toBeLessThan(300);
  expect(await read(), 'eqaEnabled reads back true').toBe('true');
  log.push('eqaEnabled set to true');
}
