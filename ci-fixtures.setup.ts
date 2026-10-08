/**
 * ci-fixtures.setup.ts: the fixtures an empty stack lacks (helpers/ci-fixtures.ts).
 *
 *   npx playwright test -c regression-seed.config.ts --project=ci-fixtures
 *
 * The develop-stack workflow runs it in "Seed the stack" on every shard, because every shard
 * boots its own empty stack. Each fixture is its own setup case so one that cannot be made
 * (and says why) does not stop the others; all of them are find-or-create, so a second run is a
 * no-op. What was found or made is written to .auth/ci-fixtures.json for the record.
 *
 * Added 2026-10-08 for the seeding gaps in develop-stack run 128.
 */
import { test as setup, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import {
  ready, api, ensureDictionaryTests, ensureMultiComponentTest, ensureInactiveLabUnitWithTest, ensureLeakPanel,
  ensureRoom, ensureNotebookProject, ensureSamplingSite, ensureWard, ensureEqaSchemes, ensureEqaEnabled, NAMES,
} from './helpers/ci-fixtures';
import { ensureReferringClinic } from './helpers/data-factory';

const OUT = path.join(process.cwd(), '.auth', 'ci-fixtures.json');
const record = (key: string, value: unknown) => {
  let all: Record<string, unknown> = {};
  try { all = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch { /* first write */ }
  all[key] = value;
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(all, null, 1));
};

setup.describe.configure({ mode: 'default' });

setup.beforeEach(async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await ready(page);
});

setup('ci-fixture: dictionary tests (TC-SA-01, EQA scheme test)', async ({ page }) => {
  const log: string[] = [];
  const ids = await ensureDictionaryTests(page, log);
  console.log(`[ci-fixtures] dictionary tests ${JSON.stringify(ids)} ${log.join('; ')}`);
  record('dictionaryTests', ids);
});

setup('ci-fixture: three-component test (TC-MC-ROUTE)', async ({ page }) => {
  const log: string[] = [];
  const id = await ensureMultiComponentTest(page, log);
  const types = ((await api(page, 'GET', `/test-catalog/tests/${id}/sample-results`)).body?.components ?? []).map((c: any) => c.resultType).sort();
  expect(types, `${NAMES.multiComp} carries N, D and M components`).toEqual(['D', 'M', 'N']);
  console.log(`[ci-fixtures] multi-component test ${id} ${log.join('; ')}`);
  record('multiComponentTest', id);
});

setup('ci-fixture: inactive lab unit holding a test (G-2, G-4)', async ({ page }) => {
  const log: string[] = [];
  const id = await ensureInactiveLabUnitWithTest(page, log);
  console.log(`[ci-fixtures] inactive lab unit ${id} ${log.join('; ')}`);
  record('inactiveLabUnit', id);
});

setup('ci-fixture: panel across two sample types (TC-PANEL-LEAK)', async ({ page }) => {
  const log: string[] = [];
  const id = await ensureLeakPanel(page, log);
  const groups = ((await api(page, 'GET', '/PanelCreate')).body?.existingPanelList ?? []) as any[];
  const spans = groups.filter((g) => (g.panels ?? []).some((p: any) => p.panelName === NAMES.leakPanel)).length;
  expect(spans, `${NAMES.leakPanel} is offered under two sample types`).toBeGreaterThan(1);
  console.log(`[ci-fixtures] leak panel ${id} ${log.join('; ')}`);
  record('leakPanel', id);
});

setup('ci-fixture: storage room (TC-INVHP-02)', async ({ page }) => {
  const log: string[] = [];
  record('room', await ensureRoom(page, log));
  console.log(`[ci-fixtures] room ${log.join('; ')}`);
});

setup('ci-fixture: notebook project (TC-ELNW)', async ({ page }) => {
  const log: string[] = [];
  record('notebookProject', await ensureNotebookProject(page, log));
  console.log(`[ci-fixtures] notebook ${log.join('; ')}`);
});

setup('ci-fixture: sampling site (OGC1192-9, chain N, vector lane)', async ({ page }) => {
  const log: string[] = [];
  record('samplingSite', await ensureSamplingSite(page, log));
  console.log(`[ci-fixtures] sampling site ${log.join('; ')}`);
});

setup('ci-fixture: ward under the referring clinic (TC-OE-06)', async ({ page }) => {
  const log: string[] = [];
  const errors: string[] = [];
  const clinic = await ensureReferringClinic(page, errors);
  expect(clinic, errors.join(' | ')).toBeTruthy();
  record('ward', await ensureWard(page, clinic!, log));
  console.log(`[ci-fixtures] ward ${log.join('; ')}`);
});

setup('ci-fixture: eqaEnabled (chain F, EQA menus)', async ({ page }) => {
  const log: string[] = [];
  await ensureEqaEnabled(page, log);
  console.log(`[ci-fixtures] eqaEnabled ${log.join('; ') || 'already true'}`);
  record('eqaEnabled', true);
});

setup('ci-fixture: EQA scheme provided and enrolled (TC-EQAHP-00, TC-EQA-02/03, TC-BL-DEEP-02, TC-Q-DEEP-02)', async ({ page }) => {
  const log: string[] = [];
  const dict = await ensureDictionaryTests(page, log);
  const ids = await ensureEqaSchemes(page, dict.dictTest, log);
  const board = (await api(page, 'GET', '/eqa/provider/schemes')).body;
  expect((board?.schemes ?? []).some((s: any) => s.name === NAMES.eqaScheme), 'the scheme is listed as provided').toBe(true);
  console.log(`[ci-fixtures] EQA ${JSON.stringify(ids)} ${log.join('; ')}`);
  record('eqa', ids);
});
