/**
 * OGC-1200 Runs, slice 1 (PR #4939, develop 424e927f).
 *
 * Contract read from the diff, not the PR body:
 *  - each accepted analyzer message opens a run (result_run); staged values carry run_id;
 *  - LogbookResults marks a pending test (blank value) whose accession+test has a staged value in an
 *    open run with waitingRun {runId,label,source,openedAt}; the worklist shows "Waiting in RUN-x" with
 *    the source and time, and the row has no entry field;
 *  - a save of such a test is refused 409 naming the run (results-entry and LogbookResults paths);
 *  - the filter bar has a Runs chip "Runs: {open} open, {held} held" that lists the visible runs;
 *  - /Results?run=<id> shows Run settings, "{done} of {total} rows dispositioned", rows paged 25/50/100,
 *    View raw inline (a JSON document, not quoted text), and "Back to all results" restores the filters.
 *
 * Fixture on testing.openelis-global.org (QA analyser round, 27 Oct): order DEV01260000000001634 has
 * Creatinine, Amylase, Total cholesterol and HDL staged in RUN-16 (QA BX-3010 01 (Chem)); Triglicerides
 * on the same order has no staged value. Nothing here saves a result.
 */
import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';

const API = '/api/OpenELIS-Global/rest';
const ORDER = process.env.RUN_ORDER || 'DEV01260000000001634';
const RUN = Number(process.env.RUN_ID || 16);
const WAITING = ['Creatinine', 'Amylase', 'Total cholesterol', 'HDL cholesterol'];
const OUT = process.env.EVIDENCE_DIR || 'test-results/ogc-1200';
fs.mkdirSync(OUT, { recursive: true });

function note(id: string, v: unknown) {
  console.log(`[${id}] ${typeof v === 'string' ? v : JSON.stringify(v)}`);
}
async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
}
/** The Lab Unit picker is a searchable Carbon ComboBox (it was a select before v4). */
async function chooseLabUnit(page: Page, name: string) {
  const box = page.locator('#unifiedResultsLabUnit');
  await expect(box).toBeVisible({ timeout: 30_000 });
  await box.click();
  await box.fill(name);
  await page.getByRole('option', { name, exact: true }).click();
  await expect(box).toHaveValue(name);
}
async function api(page: Page, path: string) {
  const r = await page.request.get(`${API}${path}`);
  return { status: r.status(), json: r.status() === 200 ? await r.json() : null, text: await r.text() };
}

test.describe('OGC-1200 Runs slice 1', () => {
  test('TC-RUN-01: a pending test whose value waits in an open run shows "Waiting in RUN-x" and cannot be entered', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`/Results?accessionNumber=${ORDER}`);
    const rows = page.locator('table tbody tr');
    await expect(rows.filter({ hasText: 'Creatinine' }).first()).toBeVisible({ timeout: 30_000 });
    await shot(page, '01-worklist-waiting');
    for (const t of WAITING) {
      const row = rows.filter({ hasText: t }).first();
      await expect(row, `${t} names its run`).toContainText(`Waiting in RUN-${RUN}`);
      await expect(row.locator('input, textarea, select'), `${t} offers no entry field`).toHaveCount(0);
    }
    const tri = rows.filter({ hasText: 'Triglicerides' }).first();
    await expect(tri).not.toContainText('Waiting in');
    const tag = page.getByTestId(`waiting-run-${RUN}`).first();
    note('TC-RUN-01.tag', await tag.locator('..').innerText());
    note('TC-RUN-01.consoleErrors', errors.slice(0, 10));
  });

  test('TC-RUN-02: the Runs chip counts open and held runs and lists them', async ({ page }) => {
    await page.goto(`/Results?accessionNumber=${ORDER}`);
    const chip = page.getByTestId('runs-chip');
    await expect(chip).toBeVisible({ timeout: 30_000 });
    const list = await api(page, '/result-runs');
    note('TC-RUN-02.api', { open: list.json.open, held: list.json.held, n: list.json.runs.length });
    await expect(chip).toContainText(`Runs: ${list.json.open} open, ${list.json.held} held`);
    await chip.getByRole('button').first().click();
    await expect(page.getByTestId('runs-chip-list')).toBeVisible();
    await expect(page.getByTestId(`open-run-${RUN}`)).toBeVisible();
    note('TC-RUN-02.listedRuns', await page.getByTestId('runs-chip-list').locator('[data-testid^="open-run-"]').count());
    await shot(page, '02-runs-chip');
  });

  test('TC-RUN-03: the Waiting tag opens the run view with settings, progress, rows and the filters notice', async ({ page }) => {
    await page.goto(`/Results?accessionNumber=${ORDER}`);
    await page.getByTestId(`waiting-run-${RUN}`).first().click();
    await expect(page).toHaveURL(new RegExp(`[?&]run=${RUN}`));
    const settings = page.getByTestId('run-settings');
    await expect(settings).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('The run is the filter')).toBeVisible();
    const header = await api(page, `/result-runs/${RUN}`);
    note('TC-RUN-03.header', header.json);
    await expect(settings).toContainText('Analyzer message');
    await expect(settings).toContainText(header.json.analyzerName);
    await expect(settings).toContainText('Open');
    await expect(page.getByTestId('run-progress')).toHaveText(`${header.json.dispositioned} of ${header.json.total} rows dispositioned`);
    const rows = page.getByTestId('run-rows').locator('tbody tr');
    await expect(rows).toHaveCount(header.json.total);
    note('TC-RUN-03.settingsText', await settings.innerText());
    note('TC-RUN-03.rows', await rows.allInnerTexts());
    await shot(page, '03-run-view');
  });

  test('TC-RUN-04: View raw expands the accepted message inline as a JSON document', async ({ page }) => {
    await page.goto(`/Results?run=${RUN}`);
    await expect(page.getByTestId('run-settings')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'View raw' }).click();
    const raw = page.getByTestId('run-raw');
    await expect(raw).toBeVisible();
    const text = (await raw.innerText()).trim();
    expect(text.startsWith('{'), 'raw starts as a JSON object, not a quoted string').toBeTruthy();
    expect(() => JSON.parse(text)).not.toThrow();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const apiRaw = await api(page, `/result-runs/${RUN}/raw`);
    expect(typeof apiRaw.json, 'API answers an object').toBe('object');
    await shot(page, '04-view-raw');
    await page.getByRole('button', { name: 'Hide raw' }).click();
    await expect(raw).toBeHidden();
  });

  test('TC-RUN-05: Back to all results restores the worklist filters', async ({ page }) => {
    await page.goto(`/Results?accessionNumber=${ORDER}`);
    await page.getByTestId(`waiting-run-${RUN}`).first().click();
    await expect(page.getByTestId('run-settings')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Back to all results' }).or(page.getByRole('link', { name: 'Back to all results' })).first().click();
    await expect(page).toHaveURL(new RegExp(`accessionNumber=${ORDER}`));
    await expect(page.locator('table tbody tr').filter({ hasText: 'Creatinine' }).first()).toBeVisible({ timeout: 30_000 });
    note('TC-RUN-05.url', page.url());
  });

  test('TC-RUN-07: the Runs chip follows the selected lab unit and lists run identities (FR-D1)', async ({ page }) => {
    await page.goto('/Results');
    await chooseLabUnit(page, 'Biochemistry');
    const scoped = await api(page, '/result-runs?testSectionId=56');
    const all = await api(page, '/result-runs');
    note('TC-RUN-07.counts', { biochemistry: scoped.json.open, all: all.json.open });
    expect(scoped.json.open, 'the fixture lab unit has fewer runs than the whole instance').toBeLessThan(all.json.open);
    const chip = page.getByTestId('runs-chip');
    await expect(chip).toContainText(`Runs: ${scoped.json.open} open, ${scoped.json.held} held`);
    await chip.getByRole('button').first().click();
    const items = page.getByTestId('runs-chip-list').locator('[data-testid^="open-run-"]');
    await expect(items).toHaveCount(scoped.json.runs.length);
    // The test id sits on the run's link; the source, analyzer, time, progress and state follow it on the same line.
    const lines = (await page.getByTestId('runs-chip-list').innerText()).split('\n').map((l) => l.trim()).filter(Boolean);
    const first = lines.join(' ').split(/(?=RUN-\d+)/).find((l) => l.startsWith(`RUN-${RUN}`)) || '';
    note('TC-RUN-07.item', first);
    // FR-D1: id, source, method or analyzer, opened time, rows reviewed of total, state
    expect(first).toMatch(/RUN-\d+/);
    expect(first).toContain('Analyzer message');
    expect(first).toMatch(/\d+ of \d+ rows dispositioned/);
    expect(first).toContain('Open');
    await shot(page, '07-chip-biochemistry');
  });

  test('TC-RUN-08: saving a waiting test is refused 409 naming the run, on both save paths, and nothing is written', async ({ page }) => {
    await page.goto(`/Results?accessionNumber=${ORDER}`);
    await expect(page.getByTestId(`waiting-run-${RUN}`).first()).toBeVisible({ timeout: 30_000 });
    const lb = await api(page, `/LogbookResults?labNumber=${ORDER}&doRange=false&finished=false`);
    const item = lb.json.testResult.find((t: any) => String(t.testName).startsWith('Creatinine'));
    expect(item?.waitingRun?.label).toBe(`RUN-${RUN}`);
    const res = await page.evaluate(async ({ item, lbForm }) => {
      const csrf = localStorage.getItem('CSRF') || '';
      const headers = { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf };
      const single = { ...item, resultValue: '1.2', isModified: true };
      const a = await fetch(`/api/OpenELIS-Global/rest/results-entry/analysis/${item.analysisId}/result`, {
        method: 'POST', headers, body: JSON.stringify({ testResult: single }) });
      const form = { ...lbForm, testResult: [single] };
      const b = await fetch('/api/OpenELIS-Global/rest/LogbookResults', { method: 'POST', headers, body: JSON.stringify(form) });
      return { single: { status: a.status, body: await a.text() }, logbook: { status: b.status, body: await b.text() } };
    }, { item, lbForm: lb.json });
    note('TC-RUN-08.single', res.single);
    note('TC-RUN-08.logbook', res.logbook);
    expect(res.single.status).toBe(409);
    expect(res.single.body).toContain(`An analyzer value for this test is waiting in RUN-${RUN}`);
    expect(res.logbook.status).toBe(409);
    expect(res.logbook.body).toContain(`RUN-${RUN}`);
    const after = await api(page, `/LogbookResults?labNumber=${ORDER}&doRange=false&finished=false`);
    const again = after.json.testResult.find((t: any) => t.analysisId === item.analysisId);
    expect(again?.resultValue || '', 'no value was written').toBe('');
    expect(again?.waitingRun?.label).toBe(`RUN-${RUN}`);
  });

  test('TC-RUN-09: expanding a waiting row offers no way to enter or save its result', async ({ page }) => {
    await page.goto(`/Results?accessionNumber=${ORDER}`);
    const row = page.locator('table tbody tr').filter({ hasText: 'Creatinine' }).first();
    await expect(row).toContainText(`Waiting in RUN-${RUN}`, { timeout: 30_000 });
    await row.getByRole('button').first().click();
    await page.waitForTimeout(1500);
    await shot(page, '09-waiting-row-expanded');
    const expanded = row.locator('xpath=following-sibling::tr[1]');
    const text = (await expanded.innerText().catch(() => '')).slice(0, 600);
    note('TC-RUN-09.expanded', text);
    await expect(expanded.getByRole('button', { name: /^Save/ }), 'no Save in the expanded waiting row').toHaveCount(0);
    await expect(expanded.locator('input[type="text"], input[type="number"], textarea'), 'no entry field').toHaveCount(0);
  });

  test('TC-RUN-10: in French the run screens show readable text, never raw keys', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('locale', 'fr'));
    await page.goto(`/Results?accessionNumber=${ORDER}`);
    await expect(page.getByTestId(`waiting-run-${RUN}`).first()).toBeVisible({ timeout: 30_000 });
    const wl = await page.locator('main, body').first().innerText();
    await page.goto(`/Results?run=${RUN}`);
    await expect(page.getByTestId('run-settings')).toBeVisible({ timeout: 30_000 });
    const rv = await page.locator('main, body').first().innerText();
    await shot(page, '10-run-view-fr');
    const rawKeys = (wl + '\n' + rv).match(/\brun\.[a-zA-Z]+\.[a-zA-Z.]+\b/g) || [];
    note('TC-RUN-10.tag', (wl.match(/.*RUN-16.*/g) || []).slice(0, 2));
    note('TC-RUN-10.settingsHeading', (rv.match(/.*(Run settings|Paramètres).*/g) || []).slice(0, 2));
    note('TC-RUN-10.rawKeys', rawKeys);
    expect(rawKeys).toEqual([]);
    await page.evaluate(() => localStorage.setItem('locale', 'en'));
  });

  test('TC-RUN-11: the analyzer import page breadcrumb names the analyzer without translation errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`/Results?run=${RUN}`);
    await expect(page.getByTestId('run-settings')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('link', { name: 'Accept these results on the analyzer import page' }).click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    note('TC-RUN-11.url', page.url());
    const crumbs = await page.locator('nav[aria-label*="readcrumb"], .cds--breadcrumb').first().innerText().catch(() => '');
    note('TC-RUN-11.crumbs', crumbs);
    await shot(page, '11-import-page');
    const missing = errors.filter((e) => /MISSING_TRANSLATION/.test(e));
    note('TC-RUN-11.missingTranslation', missing.length);
    expect(missing).toEqual([]);
    expect(crumbs).toContain('QA BX-3010 01 (Chem)');
  });

  test('TC-RUN-12: ignoring a run\'s last value on the import page completes the run and drops it from the chip (FR-A3, FR-E5)', async ({ page }) => {
    // Changes data: removes one staged value. Opt-in with RUN_COMPLETE_ID=<a run holding one throwaway value>.
    const id = Number(process.env.RUN_COMPLETE_ID || 0);
    test.skip(!id, 'set RUN_COMPLETE_ID to a run whose only value may be ignored');
    await page.goto('/Results');
    const before = await api(page, `/result-runs/${id}`);
    const rows = await api(page, `/result-runs/${id}/rows?page=1&pageSize=25`);
    const chipBefore = await api(page, '/result-runs');
    note('TC-RUN-12.before', { header: before.json, rows: rows.json?.rows, open: chipBefore.json.open });
    expect(before.json.state).toBe('OPEN');
    expect(rows.json.totalRows).toBe(1);
    const stagedId = rows.json.rows[0].id;
    await page.goto(`/AnalyzerResults?id=${before.json.analyzerId}`);
    const box = page.locator(`[id="resultList${stagedId}.isDeleted"]`);
    await expect(box).toBeAttached({ timeout: 30_000 });
    await page.locator(`label[for="resultList${stagedId}.isDeleted"]`).click();
    await expect(box).toBeChecked();
    await shot(page, '12-import-ignore-ticked');
    await page.getByRole('button', { name: 'Save' }).first().click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    const after = await api(page, `/result-runs/${id}`);
    const chipAfter = await api(page, '/result-runs');
    note('TC-RUN-12.after', { header: after.json, open: chipAfter.json.open });
    expect(after.json.state).toBe('COMPLETE');
    expect(after.json.dispositioned).toBe(after.json.total);
    expect(chipAfter.json.runs.map((r: any) => r.id)).not.toContain(id);
    await page.goto(`/Results?run=${id}`);
    await expect(page.getByTestId('run-settings')).toContainText('Complete', { timeout: 30_000 });
    await expect(page.getByTestId('run-progress')).toHaveText(`${after.json.total} of ${after.json.total} rows dispositioned`);
    await shot(page, '12-run-complete');
  });

  test('TC-RUN-06: an unknown run shows the not-found message, and the API answers 404', async ({ page }) => {
    await page.goto('/Results?run=999999');
    await expect(page.getByText('This run does not exist, or it holds no results you can see.')).toBeVisible({ timeout: 30_000 });
    expect((await api(page, '/result-runs/999999')).status).toBe(404);
    await shot(page, '06-unknown-run');
  });
});
