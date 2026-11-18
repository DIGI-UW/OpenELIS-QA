/**
 * OGC-1610 (#5058, develop 2411d711c): Ebola and Marburg PCR, a coded RESULT calculated from coded calls.
 *
 * Contract read from the diff:
 *  - Import Catalog takes a `calculated-values` file: name,testName,sampleType,componentCode,result,
 *    expression,note,isActive. `[CODE] == 'Answer'` compares a coded call with an answer, joined by && or ||.
 *    An unknown answer, an ordered comparison on an answer, an unknown component, `=` and arithmetic on an
 *    answer are refused per row. Loading the same file twice creates nothing new.
 *  - Saving the calls calculates RESULT on the server (TestCalculatedUtil): target Detected = Detected;
 *    target Not detected and IC Detected = Not detected; both Not detected = Invalid, retest. A blanked call
 *    leaves RESULT empty (no rule fires).
 *  - An answer marked Critical in the test catalog (Sample & Results, option "Critical") raises the
 *    critical-result acknowledgment when it is entered.
 *  - Component labels are translatable (Localization section, "Component: {label}").
 *
 * The site's Import Catalog cannot take dictionaries or test-results, so the answers are set through the
 * test catalog's Sample & Results endpoint, as the editor saves them.
 *
 * Data: two tests "QA EBOV Ebola PCR" and "QA EBOV Marburg PCR" (Molecular Biology, Plasma) and six rules
 * "QA EBOV ...", loaded once per server and reused; orders on the QA queue patient.
 */
import { test, expect, Page } from '@playwright/test';
import { api, ready } from '../helpers/ci-fixtures';
import { queueContext, order } from '../helpers/report-queue';

test.describe.configure({ mode: 'serial' });
test.setTimeout(240_000);

const EBOLA = 'QA EBOV Ebola PCR';
const MARBURG = 'QA EBOV Marburg PCR';
const ANSWERS = ['Detected', 'Not detected', 'Invalid, retest'];

const TESTS_CSV =
  'testName,testSection,sampleType,loinc,isActive,isOrderable,sortOrder,unitOfMeasure\n' +
  `${EBOLA},Molecular Biology,Plasma,86518-8,Y,Y,90,\n` +
  `${MARBURG},Molecular Biology,Plasma,86574-1,Y,Y,91,\n`;

const COMPONENTS_CSV =
  'testName,code,label,resultType,isPrimary,isRequired\n' +
  `${EBOLA},RESULT,Result,D,Y,Y\n${EBOLA},EBOV,Ebola,D,N,N\n${EBOLA},IC,Internal control,D,N,N\n` +
  `${MARBURG},RESULT,Result,D,Y,Y\n${MARBURG},MARV,Marburg,D,N,N\n${MARBURG},IC,Internal control,D,N,N\n`;

const rules = (test: string, call: string) =>
  `QA EBOV ${call} detected,${test},,RESULT,Detected,[${call}] == 'Detected',,Y\n` +
  `QA EBOV ${call} not detected,${test},,RESULT,Not detected,[${call}] == 'Not detected' && [IC] == 'Detected',,Y\n` +
  `QA EBOV ${call} invalid,${test},,RESULT,"Invalid, retest",[${call}] == 'Not detected' && [IC] == 'Not detected',,Y\n`;
const CALC_CSV = 'name,testName,sampleType,componentCode,result,expression,note,isActive\n' + rules(EBOLA, 'EBOV') + rules(MARBURG, 'MARV');

const REFUSED_CSV =
  'name,testName,sampleType,componentCode,result,expression,note,isActive\n' +
  `QA EBOV bad answer,${EBOLA},,RESULT,Detected,[EBOV] == 'Maybe',,Y\n` +
  `QA EBOV bad order,${EBOLA},,RESULT,Detected,[EBOV] >= 'Detected',,Y\n` +
  `QA EBOV bad component,${EBOLA},,RESULT,Detected,[MARV] == 'Detected',,Y\n` +
  `QA EBOV bad equals,${EBOLA},,RESULT,Detected,[EBOV] = 'Detected',,Y\n`;

type Plan = { files: Array<{ fileName?: string; name?: string; domain?: string; created?: number; updated?: number; skipped?: number; error?: string; skippedRows?: any[]; reasons?: any[] }> };

/** Stage files on Admin > Import Catalog (CSV) and press Preview then Apply, as an admin does. */
async function importThroughPage(page: Page, files: Record<string, string>): Promise<Plan> {
  await page.goto('/MasterListsPage/CatalogImport');
  const input = page.locator('main input[type=file]');
  await input.waitFor({ state: 'attached', timeout: 30_000 });
  await input.setInputFiles(Object.entries(files).map(([name, text]) => ({ name, mimeType: 'text/csv', buffer: Buffer.from(text, 'utf8') })));
  const staged = page.getByTestId('catalog-import-files');
  for (const name of Object.keys(files)) await expect(staged, `${name} is staged`).toContainText(name);
  const preview = page.waitForResponse((r) => r.url().includes('/rest/configuration/import/preview'));
  await page.locator('main').getByRole('button', { name: 'Preview' }).click();
  expect((await preview).status(), 'preview answers 200').toBe(200);
  await expect(page.getByTestId('catalog-import-plan')).toBeVisible();
  const apply = page.waitForResponse((r) => r.url().includes('/rest/configuration/import/apply'));
  await page.locator('main').getByRole('button', { name: 'Apply' }).click();
  const r = await apply;
  const body = await r.json().catch(() => null);
  expect(r.status(), `apply answers 200: ${JSON.stringify(body).slice(0, 300)}`).toBe(200);
  return body as Plan;
}

async function testId(page: Page, name: string): Promise<string | null> {
  const r = await api(page, 'GET', `/test-catalog/tests?search=${encodeURIComponent(name)}&page=1&pageSize=20`);
  const row = (r.body?.rows ?? []).find((t: any) => String(t.name).replace(/\s*\([^)]*\)\s*$/, '') === name);
  return row ? String(row.testId ?? row.id) : null;
}

async function sampleResults(page: Page, id: string): Promise<any> {
  const r = await api(page, 'GET', `/test-catalog/tests/${id}/sample-results`);
  expect(r.status, r.text).toBe(200);
  return r.body;
}

/** Give each coded component the three answers; the call's Detected is Critical (an Ebola or Marburg positive). */
async function ensureAnswers(page: Page, id: string, call: string): Promise<void> {
  const sr = await sampleResults(page, id);
  let changed = false;
  for (const c of sr.components) {
    if (c.resultType !== 'D') continue;
    const wanted = c.code === 'RESULT' ? ANSWERS : ANSWERS.slice(0, 2);
    const have = new Set((c.options ?? []).map((o: any) => String(o.valueName ?? o.value)));
    if (wanted.every((w) => have.has(w))) continue;
    c.options = wanted.map((w, i) => ({
      value: w, freeText: true, resultType: 'D', sortOrder: i + 1,
      normal: w === 'Not detected', critical: w === 'Detected' && c.code !== 'IC', qualifiable: false,
    }));
    changed = true;
  }
  if (!changed) return;
  const r = await api(page, 'PUT', `/test-catalog/tests/${id}/sample-results`, sr);
  expect(r.status, `sample-results save for ${call}: ${r.text}`).toBe(200);
}

async function ourRules(page: Page): Promise<any[]> {
  const r = await api(page, 'GET', '/test-calculations');
  expect(r.status).toBe(200);
  return (r.body as any[]).filter((x) => String(x.name).startsWith('QA EBOV '));
}

async function plasmaId(page: Page): Promise<string> {
  const st = (await api(page, 'GET', '/displayList/SAMPLE_TYPE_ACTIVE')).body ?? [];
  const p = st.find((s: any) => s.value === 'Plasma');
  expect(p, 'testing has a Plasma sample type').toBeTruthy();
  return String(p.id);
}

/** The row of one component on /Results?accessionNumber=. */
function componentRow(page: Page, test: string, component: string) {
  return page.getByRole('row').filter({ hasText: `${test}(Plasma) — ${component}` });
}

/** Pick an answer for one component on the Results page and press that row's Save (acknowledging a critical answer). */
async function enterCall(page: Page, labNo: string, test: string, component: string, answer: string): Promise<{ critical: boolean; body: any }> {
  await page.goto(`/Results?accessionNumber=${labNo}`, { waitUntil: 'domcontentloaded' });
  const row = componentRow(page, test, component);
  await expect(row).toBeVisible({ timeout: 30_000 });
  const edit = row.getByRole('button', { name: 'Edit' });
  if (await edit.isVisible().catch(() => false)) await edit.click();
  await row.locator('select').selectOption({ label: answer });
  // A new critical answer opens the dialog before any request; an edited one is refused first
  // (422 ACKNOWLEDGEMENT_REQUIRED) and then opens it. Either way the save that counts answers 200.
  const isSave = (r: any) => /\/rest\/results-entry\/analysis\/\d+\/result$/.test(r.url()) && r.request().method() === 'POST';
  const done = page.waitForResponse((r) => isSave(r) && r.status() !== 422, { timeout: 30_000 });
  await row.getByRole('button', { name: 'Save', exact: true }).click();
  const ack = page.getByRole('button', { name: 'Acknowledge and save' });
  await Promise.race([done.catch(() => null), ack.waitFor({ state: 'visible', timeout: 8000 }).catch(() => null)]);
  let critical = false;
  if (await ack.isVisible().catch(() => false)) {
    critical = true;
    await expect(page.getByRole('dialog').filter({ hasText: 'Critical result' }), 'the dialog names the call').toContainText(`${test}(Plasma) — ${component}: ${answer}`);
    await ack.click();
  }
  const r = await done;
  expect(r.status(), `${component} ${answer} saves on ${labNo}`).toBe(200);
  return { critical, body: await r.json().catch(() => null) };
}

/** What the Results page shows in each component's Result cell, read on a fresh load (a saved row shows its answer as text). */
async function shown(page: Page, labNo: string, test: string): Promise<Record<string, string>> {
  await page.goto(`/Results?accessionNumber=${labNo}`, { waitUntil: 'domcontentloaded' });
  await expect(componentRow(page, test, 'Result')).toBeVisible({ timeout: 30_000 });
  const out: Record<string, string> = {};
  for (const r of await page.getByRole('row').filter({ hasText: `${test}(Plasma) — ` }).all()) {
    const label = (await r.innerText()).match(/\(Plasma\) — ([^\t\n]+)/)?.[1]?.trim() ?? '?';
    const sel = r.locator('select');
    if (await sel.count()) {
      out[label] = await sel.evaluate((s: HTMLSelectElement) => (s.selectedIndex > 0 ? s.options[s.selectedIndex].text : ''));
    } else {
      // The Result cell of a saved component: cells are expand, patient, test, method, analyzer, sample, reference range, result.
      const cells = await r.getByRole('cell').allInnerTexts();
      out[label] = (cells[7] ?? '').trim();
    }
  }
  return out;
}

const state: { ebola?: string; marburg?: string; plasma?: string; lab?: string } = {};

test.describe('OGC-1610: coded calculated values (Ebola and Marburg PCR)', () => {
  test('TC-EBOV-01: Import Catalog loads the two tests and their call components; a second load creates nothing', async ({ page }) => {
    await ready(page);
    const files = { 'tests-qa-ebov.csv': TESTS_CSV, 'result-components-qa-ebov.csv': COMPONENTS_CSV };
    const first = await importThroughPage(page, files);
    console.log('first load', JSON.stringify(first.files));
    for (const f of first.files) expect(f.error, `${f.fileName ?? f.name}: ${f.error}`).toBeFalsy();
    state.ebola = (await testId(page, EBOLA)) ?? undefined;
    state.marburg = (await testId(page, MARBURG)) ?? undefined;
    expect(state.ebola, 'Ebola PCR exists').toBeTruthy();
    expect(state.marburg, 'Marburg PCR exists').toBeTruthy();
    for (const [id, call] of [[state.ebola!, 'EBOV'], [state.marburg!, 'MARV']]) {
      const comps = (await sampleResults(page, id)).components.map((c: any) => `${c.code}:${c.resultType}:${c.isPrimary ? 'P' : ''}${c.isRequired ? 'R' : ''}`).sort();
      expect(comps, `${call} components`).toEqual([`${call}:D:`, 'IC:D:', 'RESULT:D:PR'].sort());
    }
    const again = await importThroughPage(page, files);
    console.log('second load', JSON.stringify(again.files));
    for (const f of again.files) expect(f.created ?? 0, `${f.fileName ?? f.name} creates nothing on a second load`).toBe(0);
  });

  test('TC-EBOV-02: a calculated-values file loads coded rules that read each call and write an answer to RESULT', async ({ page }) => {
    await ready(page);
    state.ebola ??= (await testId(page, EBOLA)) ?? undefined;
    state.marburg ??= (await testId(page, MARBURG)) ?? undefined;
    await ensureAnswers(page, state.ebola!, 'EBOV');
    await ensureAnswers(page, state.marburg!, 'MARV');
    const plan = await importThroughPage(page, { 'calculated-values-qa-ebov.csv': CALC_CSV });
    console.log('rules load', JSON.stringify(plan.files));
    for (const f of plan.files) expect(f.error, String(f.error)).toBeFalsy();
    const mine = await ourRules(page);
    console.log(JSON.stringify(mine.map((r) => ({ name: r.name, active: r.active, testId: r.testId, componentId: r.componentId, result: r.result, ops: (r.operations ?? []).map((o: any) => `${o.type}:${o.value}`) })), null, 1));
    expect(mine.map((r) => r.name).sort()).toEqual(
      ['EBOV detected', 'EBOV not detected', 'EBOV invalid', 'MARV detected', 'MARV not detected', 'MARV invalid'].map((n) => `QA EBOV ${n}`).sort(),
    );
    const again = await importThroughPage(page, { 'calculated-values-qa-ebov.csv': CALC_CSV });
    for (const f of again.files) expect(f.created ?? 0, 'a second load creates no rule').toBe(0);
    expect((await ourRules(page)).length, 'still six rules').toBe(6);
  });

  test('TC-EBOV-03: refused rows (unknown answer, ordered comparison, unknown component, `=`) are skipped with a reason and create nothing', async ({ page }) => {
    await ready(page);
    const plan = await importThroughPage(page, { 'calculated-values-qa-ebov-bad.csv': REFUSED_CSV });
    console.log('refused load', JSON.stringify(plan.files, null, 1));
    const f = plan.files[0];
    expect(f.created ?? 0, 'no rule created').toBe(0);
    expect(f.skipped ?? 0, 'four rows skipped').toBe(4);
    expect((await ourRules(page)).filter((r) => /bad/.test(r.name)), 'no QA EBOV bad rule exists').toEqual([]);
  });
});

test.describe('OGC-1610: the calls calculate RESULT at result entry', () => {
  test.beforeEach(async ({ page }) => {
    await ready(page);
    state.ebola ??= (await testId(page, EBOLA)) ?? undefined;
    state.marburg ??= (await testId(page, MARBURG)) ?? undefined;
    test.skip(!state.ebola || !state.marburg || (await ourRules(page)).length < 6, 'needs TC-EBOV-01 and 02 (the tests and rules) on this server');
    state.plasma ??= await plasmaId(page);
  });

  test('TC-EBOV-04: Ebola Not detected with IC Detected gives Not detected; Marburg and IC both Not detected give Invalid, retest', async ({ page }) => {
    const seed = await queueContext(page);
    const { labNo } = await order(page, seed, [{ type: state.plasma!, tests: [state.ebola!, state.marburg!] }]);
    state.lab = labNo;
    await enterCall(page, labNo, EBOLA, 'Ebola', 'Not detected');
    const ic = await enterCall(page, labNo, EBOLA, 'Internal control', 'Detected');
    expect(ic.body?.calculated, 'saving the last call reports a calculation').toContain(labNo);
    await enterCall(page, labNo, MARBURG, 'Marburg', 'Not detected');
    await enterCall(page, labNo, MARBURG, 'Internal control', 'Not detected');
    expect(await shown(page, labNo, EBOLA)).toMatchObject({ Ebola: 'Not detected', 'Internal control': 'Detected', Result: 'Not detected' });
    expect(await shown(page, labNo, MARBURG)).toMatchObject({ Marburg: 'Not detected', 'Internal control': 'Not detected', Result: 'Invalid, retest' });
  });

  test('TC-EBOV-05: changing the Ebola call to Detected raises the critical acknowledgment and recalculates RESULT to Detected', async ({ page }) => {
    test.skip(!state.lab, 'needs TC-EBOV-04 in the same run');
    const r = await enterCall(page, state.lab!, EBOLA, 'Ebola', 'Detected');
    expect(r.critical, 'Detected asks for the critical acknowledgment before it saves').toBe(true);
    expect(await shown(page, state.lab!, EBOLA)).toMatchObject({ Ebola: 'Detected', Result: 'Detected' });
  });

  test('TC-EBOV-06: with the call missing RESULT stays empty and the test stays open; entering the call completes it', async ({ page }) => {
    const seed = await queueContext(page);
    const { labNo } = await order(page, seed, [{ type: state.plasma!, tests: [state.marburg!] }]);
    await enterCall(page, labNo, MARBURG, 'Internal control', 'Detected');
    const before = await shown(page, labNo, MARBURG);
    expect(before, 'no rule fires without the call').toMatchObject({ Marburg: '', Result: '' });
    await expect(componentRow(page, MARBURG, 'Result'), 'RESULT is still waiting').toContainText('Not started');
    await enterCall(page, labNo, MARBURG, 'Marburg', 'Not detected');
    expect(await shown(page, labNo, MARBURG)).toMatchObject({ Marburg: 'Not detected', Result: 'Not detected' });
  });

  test('TC-EBOV-07: blanking the outcome of a rule leaves RESULT empty rather than keeping the old answer', async ({ page }) => {
    const seed = await queueContext(page);
    const { labNo } = await order(page, seed, [{ type: state.plasma!, tests: [state.ebola!] }]);
    await enterCall(page, labNo, EBOLA, 'Ebola', 'Detected');
    expect((await shown(page, labNo, EBOLA)).Result, 'Detected alone gives Detected').toBe('Detected');
    // Not detected needs IC Detected; with no IC yet no rule matches, so the old Detected must go.
    await enterCall(page, labNo, EBOLA, 'Ebola', 'Not detected');
    expect((await shown(page, labNo, EBOLA)).Result, 'no stale Detected after the call changes').toBe('');
    await enterCall(page, labNo, EBOLA, 'Internal control', 'Detected');
    expect((await shown(page, labNo, EBOLA)).Result).toBe('Not detected');
  });

  test('TC-EBOV-09: RESULT, which a rule calculates, is not offered for entry by hand (R-36)', async ({ page }) => {
    // FLIP-WHEN-FIXED. R-36 (Casey, 18 Nov 2026, OGC-1610 open question 5): the calculated value stands; a
    // wrong RESULT is fixed by correcting a call. Observed 18 Nov 2026 on develop cd4bfc602: the Results page
    // offers RESULT as an editable dropdown (Detected / Not detected / Invalid, retest) next to the calls.
    test.fail();
    const seed = await queueContext(page);
    const { labNo } = await order(page, seed, [{ type: state.plasma!, tests: [state.ebola!] }]);
    await page.goto(`/Results?accessionNumber=${labNo}`, { waitUntil: 'domcontentloaded' });
    const row = componentRow(page, EBOLA, 'Result');
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(componentRow(page, EBOLA, 'Ebola').locator('select'), 'the call is entered by hand').toBeEnabled();
    const pick = row.locator('select');
    expect((await pick.count()) === 0 || (await pick.isDisabled()), 'RESULT has no enabled answer picker').toBe(true);
  });
});

test.describe('OGC-1610: Import Catalog and the sample type cache (lead, 18 Nov 2026)', () => {
  test('TC-EBOV-08: a test created by Import Catalog shows its sample type in the editor straight away', async ({ page }) => {
    // FLIP-WHEN-FIXED. Observed 18 Nov 2026 on develop cd4bfc602: a tests file creates the test and its
    // Plasma link (the order screen offers it under Plasma), but the editor's Basic Info shows no sample type
    // ("Select at least one sample type") and a calculated-values file refuses the test ("runs on 0 specimens")
    // until something clears TypeOfSampleService's test-to-type cache (any Basic Info save does). The import
    // path (CatalogImportServiceImpl, TestConfigurationHandler) never clears it.
    test.fail();
    await ready(page);
    const plasma = await plasmaId(page);
    expect((await api(page, 'GET', '/test-catalog/tests/3/basic-info')).status, 'builds the cache').toBe(200);
    const name = `QA EBOV Link ${Date.now().toString(36)}`;
    const plan = await importThroughPage(page, {
      'tests-qa-ebov-link.csv': 'testName,testSection,sampleType,loinc,isActive,isOrderable,sortOrder,unitOfMeasure\n' + `${name},Molecular Biology,Plasma,,N,N,99,\n`,
    });
    expect(plan.files[0].created, 'the test is created').toBe(1);
    const id = await testId(page, name);
    expect(id).toBeTruthy();
    await page.goto(`/MasterListsPage/TestCatalogEditor/${id}`);
    await expect(page.locator('main')).toContainText(name, { timeout: 30_000 });
    await expect(page.locator('main'), 'Basic Info has loaded').toContainText(/Total items selected:\s*\d/, { timeout: 30_000 });
    await expect(page.locator('main'), 'the editor shows the Plasma link').toContainText(/Total items selected:\s*1\b/, { timeout: 5_000 });
    expect((await api(page, 'GET', `/test-catalog/tests/${id}/basic-info`)).body?.sampleTypeIds, 'basic-info names Plasma').toEqual([plasma]);
  });
});
