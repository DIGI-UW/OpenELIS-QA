/**
 * OpenELIS Global - Test Catalog: SECTION DEPTH.
 *
 * Second pass after test-catalog-silent-actions.spec.ts. That file covered five controls; this
 * one covers the sections the 2026-09-23 audit found with no real coverage (QC Targets, Import
 * Catalog CSV, Result Interpretations, Panel member tests, Reagents, Analyzers, Reflex & Calc,
 * Localization, Display Order, the "Edit related tests" group editor, Methods "Copy from Test").
 *
 * Contract for every write case: seed through REST (setup is not under test), act through the
 * UI (the control is under test), read back through REST, and where a second surface exists
 * (results entry, order entry, the test-side view of a panel) read back there too.
 *
 * Defects confirmed in the UI on testing 3.2.2.0 (develop 95d6c64) on 2026-09-23 are encoded as
 * FLIP-WHEN-FIXED tripwires (`test.fail()` asserting the expected behaviour), each paired with a
 * canary over the same path. Ids SD-G1.. match qa-report-testing-20260923-section-depth.md.
 *
 * Not encoded, waiting on a product ruling: Terminology Save deletes a mapping whose code was
 * cleared in place (references/open-questions.md row 6). Group Storage is encoded against the
 * pattern the Ranges tab already uses (a "differs" warning); if Casey rules otherwise, flip it.
 *
 * DATA: every record is QA-prefixed with a per-run stamp. Nothing is deleted (LIMS rule).
 */
import { test, expect, type Page } from '@playwright/test';
import { apiGet, apiWrite } from './helpers/silentSave';
import {
  watchToasts, toasts, successToasts, open, nextResponse, pickComboOption, fillById,
  seedNumericTest, rangesOf, storageOf,
} from './helpers/catalogUi';

const RUN = `${Date.now()}`.slice(-5);
const TC = '/rest/test-catalog';
const SERUM = '2';
const PLASMA = '3';

async function ctxPage(browser: import('@playwright/test').Browser): Promise<Page> {
  const page = await (await browser.newContext({ storageState: '.auth/user.json' })).newPage();
  await open(page, '/MasterListsPage/TestCatalogList');
  return page;
}

// =============================================================================================
// "Edit related tests" group editor: Ranges and Storage                 SD-G1, SD-G2
// =============================================================================================
test.describe('Group editor - Ranges and Storage', () => {
  let A = ''; let B = ''; let cA = ''; let cB = ''; // A = Serum test with a Serum-scoped range; B = Plasma sibling

  test.beforeAll(async ({ browser }) => {
    const page = await ctxPage(browser);
    const name = `QA Grp ${RUN}`; // siblings share the display name; sample type differs
    const a = await seedNumericTest(page, { name, code: `QGA${RUN}`, description: `QA Grp Serum ${RUN}`, sampleTypeId: SERUM, activate: true });
    const b = await seedNumericTest(page, { name, code: `QGB${RUN}`, description: `QA Grp Plasma ${RUN}`, sampleTypeId: PLASMA, activate: true });
    A = a.id; B = b.id; cA = a.componentId; cB = b.componentId;
    await page.context().close();
  });

  async function seedDivergence(page: Page) {
    const ra = await apiWrite(page, 'PUT', `${TC}/tests/${A}/ranges`, { testId: A, ranges: [
      { componentId: cA, gender: '', minAge: 0, maxAge: null, lowNormal: 3.5, highNormal: 5.5, lowValid: 0, highValid: 50, sampleTypeId: SERUM }] });
    expect(ra.status, 'seed Serum-scoped range on A').toBe(200);
    const rb = await apiWrite(page, 'PUT', `${TC}/tests/${B}/ranges`, { testId: B, ranges: [
      { componentId: cB, gender: '', minAge: 0, maxAge: null, lowNormal: 3.5, highNormal: 5.5, lowValid: 0, highValid: 50 }] });
    expect(rb.status, 'seed the same range, unscoped, on B (the group editor loads B first)').toBe(200);
    const sa = await storageOf(page, A);
    const sb = await storageOf(page, B);
    expect((await apiWrite(page, 'PUT', `${TC}/tests/${A}/storage`, { ...sa, storageCondition: 'FROZEN', protectFromLight: true })).status, 'seed A storage').toBe(200);
    expect((await apiWrite(page, 'PUT', `${TC}/tests/${B}/storage`, { ...sb, storageCondition: 'REFRIGERATED', protectFromLight: false })).status, 'seed B storage').toBe(200);
  }

  test('TC-SD-01: canary - the sibling pair is found and "Set all to these values" writes both tests', async ({ page }) => {
    await open(page, `/MasterListsPage/TestCatalogEditor/${A}/basic-info`);
    await seedDivergence(page);
    const sib = await apiGet<any[]>(page, `${TC}/tests/${A}/siblings`);
    expect(((sib.json as any[]) ?? []).map((s) => String(s.testId)).sort(), 'A and B are siblings').toEqual([A, B].sort());
    await open(page, `/MasterListsPage/TestCatalogEditor/group/${B},${A}/ranges`);
    const save = page.getByRole('button', { name: /set all to these values/i });
    await save.waitFor({ state: 'visible', timeout: 60_000 });
    await watchToasts(page);
    const resp = nextResponse(page, 'PUT', /\/group\/ranges$/);
    await save.click();
    expect((await resp).status(), 'group ranges save answered').toBe(200);
    for (const id of [A, B]) {
      const r = await rangesOf(page, id);
      expect(r.map((x) => [x.lowNormal, x.highNormal]), `test ${id} carries the shared range`).toEqual([[3.5, 5.5]]);
    }
  });

  test('TC-SD-02: FLIP-WHEN-FIXED - group Ranges save keeps each test\'s specimen scope', async ({ page }) => {
    // SD-G1. CombinedTestEditor builds the save payload without sampleTypeId (and RangeModal
    // gets no sample types), so a Serum-scoped range on A becomes a range for every specimen.
    test.fail(true, 'SD-G1: group ranges save drops sampleTypeId; flips when scope is preserved or editable');
    await open(page, `/MasterListsPage/TestCatalogEditor/${A}/basic-info`);
    await seedDivergence(page);
    expect((await rangesOf(page, A)).map((x) => x.sampleTypeId ?? null), 'precondition: A range is Serum-scoped').toEqual([SERUM]);
    await open(page, `/MasterListsPage/TestCatalogEditor/group/${B},${A}/ranges`);
    const save = page.getByRole('button', { name: /set all to these values/i });
    await save.waitFor({ state: 'visible', timeout: 60_000 });
    const resp = nextResponse(page, 'PUT', /\/group\/ranges$/);
    await save.click();
    expect((await resp).status(), 'precondition: save answered 200').toBe(200);
    expect((await rangesOf(page, A)).map((x) => x.sampleTypeId ?? null),
      'a group save must not silently widen a Serum-only range to every specimen').toEqual([SERUM]);
  });

  async function openStorageTab(page: Page) {
    await open(page, `/MasterListsPage/TestCatalogEditor/group/${B},${A}/ranges`);
    await page.getByRole('button', { name: /set all to these values/i }).waitFor({ state: 'visible', timeout: 60_000 });
    await page.getByRole('tab', { name: /sample storage/i }).click();
    await page.locator('#storage-condition').waitFor({ state: 'visible', timeout: 20_000 });
  }

  test('TC-SD-03: canary - group Storage tab loads and Save writes every test', async ({ page }) => {
    await open(page, `/MasterListsPage/TestCatalogEditor/${A}/basic-info`);
    await seedDivergence(page);
    await openStorageTab(page);
    await watchToasts(page);
    const resp = nextResponse(page, 'PUT', /\/group\/storage$/);
    await page.getByRole('button', { name: /^save$/i }).last().click();
    expect((await resp).status(), 'group storage save answered').toBe(200);
    const a = await storageOf(page, A); const b = await storageOf(page, B);
    expect(a.storageCondition, 'both tests now share one storage condition').toBe(b.storageCondition);
    expect((await successToasts(page)).length, 'the UI confirmed the save').toBeGreaterThan(0);
  });

  test('TC-SD-04: FLIP-WHEN-FIXED - group Storage warns when the tests differ, as group Ranges does', async ({ page }) => {
    // SD-G2. The tab loads ONLY the first test's storage and shows no warning; an untouched Save
    // then overwrites the other test (A: Frozen + protect from light became Refrigerated, 2026-09-23).
    test.fail(true, 'SD-G2: group storage has no "differs" warning; flips when it gets one');
    await open(page, `/MasterListsPage/TestCatalogEditor/${A}/basic-info`);
    await seedDivergence(page);
    expect((await storageOf(page, A)).storageCondition, 'precondition: A differs from B').not.toBe((await storageOf(page, B)).storageCondition);
    await openStorageTab(page);
    await expect(page.locator('.cds--inline-notification, [data-testid*=differ]').filter({ hasText: /differ/i }),
      'the storage tab must say the selected tests differ before a Save overwrites them').toBeVisible({ timeout: 5_000 });
  });
});

// =============================================================================================
// Methods: "Copy from Test"                                              SD-M1, SD-M2
// =============================================================================================
test.describe('Methods - Copy from Test', () => {
  let target = ''; let emptySrc = ''; let emptySrcLabel = ''; let fullSrc = ''; let fullSrcLabel = ''; let methodName = '';

  test.beforeAll(async ({ browser }) => {
    const page = await ctxPage(browser);
    target = (await seedNumericTest(page, { name: `QA MT ${RUN}`, code: `QMT${RUN}` })).id;
    emptySrc = (await seedNumericTest(page, { name: `QA ME ${RUN}`, code: `QME${RUN}`, activate: true })).id;
    fullSrc = (await seedNumericTest(page, { name: `QA MF ${RUN}`, code: `QMF${RUN}`, activate: true })).id;
    const methods = await apiGet<any[]>(page, '/rest/displayList/METHODS');
    const m = ((methods.json as any[]) ?? [])[0];
    expect(m, 'need at least one method in the master list').toBeTruthy();
    methodName = m.value;
    const link = await apiWrite(page, 'POST', `/rest/test/${fullSrc}/methods`, { methodId: String(m.id), isDefault: true, effectiveDate: '2026-01-01' });
    expect(link.status, 'seed a method link on the full source').toBeLessThan(300);
    const list = await apiGet<any[]>(page, '/rest/test-list');
    const label = (id: string) => ((list.json as any[]) ?? []).find((t) => String(t.id) === id)?.value ?? '';
    emptySrcLabel = label(emptySrc); fullSrcLabel = label(fullSrc);
    expect(emptySrcLabel && fullSrcLabel, 'both sources are listed in the Copy picker (active)').toBeTruthy();
    await page.context().close();
  });

  async function copyFrom(page: Page, label: string) {
    await open(page, `/MasterListsPage/TestCatalogEditor/${target}/methods`);
    await page.getByTestId('methods-section').waitFor({ state: 'visible', timeout: 60_000 });
    await watchToasts(page);
    await pickComboOption(page, 'copy-from-test', label);
    const resp = nextResponse(page, 'POST', /\/methods\/copyFrom\//);
    await page.getByRole('button', { name: /^copy from test$/i }).click();
    const status = (await resp).status();
    await page.waitForTimeout(1500);
    const links = await apiGet<any[]>(page, `/rest/test/${target}/methods`);
    return { status, toasts: await toasts(page), links: (links.json as any[]) ?? [] };
  }

  test('TC-SD-10: canary - copying from a test with a method links that method', async ({ page }) => {
    const r = await copyFrom(page, fullSrcLabel);
    expect(r.status, 'copy answered').toBe(200);
    expect(r.links.map((l) => l.methodName), 'the source method is now linked to the target').toContain(methodName);
  });

  test('TC-SD-11: FLIP-WHEN-FIXED - copying from a test with no methods must not show a success toast', async ({ page }) => {
    // SD-M1. handleCopyFromTest ignores its response and always toasts success, titled with the
    // button label "Copy from Test". Confirmed 2026-09-23: nothing copied, green toast.
    test.fail(true, 'SD-M1: Methods copy always toasts success; flips when it reports what was copied');
    await open(page, `/MasterListsPage/TestCatalogEditor/${target}/methods`);  // a relative fetch fails on about:blank
    const before = (await apiGet<any[]>(page, `/rest/test/${target}/methods`)).json as any[];
    expect(Array.isArray(before), 'precondition: the methods read-back works').toBe(true);
    const r = await copyFrom(page, emptySrcLabel);
    expect(r.links.length, 'precondition: nothing was added').toBe((before ?? []).length);
    expect(r.toasts.filter((t) => t.kind === 'success'), 'a copy that copied nothing must not report success').toHaveLength(0);
  });

  test('TC-SD-12: FLIP-WHEN-FIXED - typing in the Copy methods picker narrows the list to matching tests', async ({ page }) => {
    // SD-M2. The Copy pickers (Methods and Sample & Results) set no shouldFilterItem, so typing
    // leaves all ~180 tests in the menu and the admin must scroll to find the source.
    // Re-checked 2026-09-23: "QA Sib" typed, 179 options listed. (A first reading of "0 options"
    // was a tool artefact and is withdrawn.)
    test.fail(true, 'SD-M2: Copy picker typeahead does not filter; flips when it does');
    await open(page, `/MasterListsPage/TestCatalogEditor/${target}/methods`);
    await page.getByTestId('methods-section').waitFor({ state: 'visible', timeout: 60_000 });
    const input = page.locator('#copy-from-test');
    await input.scrollIntoViewIfNeeded();
    await input.click();
    await input.pressSequentially(`QA MF ${RUN}`, { delay: 30 });
    await expect(page.getByRole('option', { name: fullSrcLabel, exact: true }), 'precondition: the source is offered').toBeVisible({ timeout: 5_000 });
    const names = await page.getByRole('option').allInnerTexts();
    expect(names.filter((n) => !n.toLowerCase().includes(`qa mf ${RUN}`)),
      'every option left after typing must match what was typed').toEqual([]);
  });
});

// =============================================================================================
// Localization                                                          SD-L1
// =============================================================================================
test.describe('Localization', () => {
  let T = ''; let other = '';
  const NEW = `QA Loc ${RUN} renamed`;

  test.beforeAll(async ({ browser }) => {
    const page = await ctxPage(browser);
    T = (await seedNumericTest(page, { name: `QA Loc ${RUN}`, code: `QLO${RUN}`, activate: true })).id;
    other = (await seedNumericTest(page, { name: `QA LocO ${RUN}`, code: `QLX${RUN}` })).id;
    await page.context().close();
  });

  test('TC-SD-20: canary - saving the English test name persists and shows in Basic Info', async ({ page }) => {
    await open(page, `/MasterListsPage/TestCatalogEditor/${T}/localization`);
    await page.locator('#localization-input-name').waitFor({ state: 'visible', timeout: 60_000 });
    await watchToasts(page);
    await page.locator('#localization-locale').selectOption('en');
    await fillById(page, 'localization-input-name', NEW);
    const resp = nextResponse(page, 'PUT', /\/rest\/localizations\/\d+\/translations$/);
    await page.getByRole('button', { name: /^save$/i }).last().click();
    expect((await resp).ok(), 'translation save answered 2xx').toBe(true);
    // Poll: in the harness the first basic-info GET right after the save has answered 500 twice
    // (2026-09-23), which the same flow in Chrome never reproduced. Record it, do not fail on it.
    const statuses: number[] = [];
    await expect.poll(async () => {
      const bi = await apiGet<any>(page, `${TC}/tests/${T}/basic-info`);
      statuses.push(bi.status);
      return bi.json?.name;
    }, { message: 'Basic Info reads the new name', timeout: 20_000, intervals: [500, 1_000, 2_000] }).toBe(NEW);
    if (statuses.some((st) => st !== 200)) test.info().annotations.push({ type: 'transient', description: `basic-info statuses after save: ${statuses.join(',')}` });
    expect((await successToasts(page)).length, 'the UI confirmed the save').toBeGreaterThan(0);
  });

  test('TC-SD-21: FLIP-WHEN-FIXED - a renamed test shows its new name in the test pickers', async ({ page }) => {
    // SD-L1. The Localization save never refreshes the cached test-name list behind
    // /rest/test-list, which feeds the Copy pickers, Results search, Reports-by-date and
    // notification config. Basic Info save does refresh it. Confirmed 2026-09-23 in the Copy picker.
    test.fail(true, 'SD-L1: Localization save leaves /rest/test-list stale; flips when it refreshes names');
    await open(page, `/MasterListsPage/TestCatalogEditor/${other}/sample-results`);
    await expect.poll(async () => (await apiGet<any>(page, `${TC}/tests/${T}/basic-info`)).json?.name,
      { message: 'precondition: TC-SD-20 renamed the test', timeout: 20_000 }).toBe(NEW);
    await page.locator('#copy-from-test').waitFor({ state: 'visible', timeout: 60_000 });
    const input = page.locator('#copy-from-test');
    await input.scrollIntoViewIfNeeded();
    const wrapper = page.locator('.cds--combo-box, .cds--list-box__wrapper').filter({ has: input }).first();
    await wrapper.getByRole('button', { name: /^open$/i }).first().click();
    const names = await page.getByRole('option').allInnerTexts();
    expect(names.some((n) => n.startsWith(NEW)), `the picker must list "${NEW}"`).toBe(true);
  });
});

// =============================================================================================
// Display Order                                                          SD-D1, SD-D2
// =============================================================================================
test.describe('Display Order', () => {
  let T = '';

  test.beforeAll(async ({ browser }) => {
    const page = await ctxPage(browser);
    T = (await seedNumericTest(page, { name: `QA Ord ${RUN}`, code: `QOR${RUN}`, activate: true })).id;
    await page.context().close();
  });

  const savedOrder = async (page: Page): Promise<string[]> => ((await apiGet<any>(page, `${TC}/sample-types/${SERUM}/test-order`)).json?.tests ?? [])
    .slice().sort((a: any, b: any) => a.displayOrder - b.displayOrder).map((t: any) => String(t.testId));
  const orderEntryOrder = async (page: Page): Promise<string[]> => ((await apiGet<any>(page, `/rest/sample-type-tests?sampleType=${SERUM}`)).json?.tests ?? [])
    .map((t: any) => String(t.id));

  async function moveUp(page: Page) {
    await open(page, `/MasterListsPage/TestCatalogEditor/${T}/display-order`);
    await page.getByTestId('display-order-section').waitFor({ state: 'visible', timeout: 60_000 });
    await page.locator('#display-order-sample-type').selectOption(SERUM);
    await page.getByTestId(`order-row-${T}`).waitFor({ state: 'visible', timeout: 20_000 });
    await watchToasts(page);
    const resp = nextResponse(page, 'PUT', new RegExp(`/sample-types/${SERUM}/test-order$`));
    await page.getByTestId(`move-up-${T}`).click();
    return (await resp).status();
  }

  test('TC-SD-30: canary - moving a test up saves its new position', async ({ page }) => {
    await open(page, `/MasterListsPage/TestCatalogEditor/${T}/basic-info`);
    const before = await savedOrder(page);
    const status = await moveUp(page);
    expect(status, 'display order save answered').toBe(200);
    const after = await savedOrder(page);
    expect(after.indexOf(T), 'the test moved one place up').toBe(before.indexOf(T) - 1);
    expect((await successToasts(page)).some((t) => /display order saved/i.test(t.text)), 'toast confirms').toBe(true);
  });

  test('TC-SD-31: FLIP-WHEN-FIXED - order entry lists a sample type\'s tests in the configured display order', async ({ page }) => {
    // SD-D1. Order entry sorts by test.sortOrder, not sampletype_test.display_order, so the
    // Display Order section has no visible effect. Confirmed 2026-09-23 in the order entry screen
    // (a test saved at position 26 of 41 still listed first).
    test.fail(true, 'SD-D1: order entry ignores Display Order; flips when it honours it');
    await open(page, `/MasterListsPage/TestCatalogEditor/${T}/basic-info`);
    const configured = await savedOrder(page);
    const shown = (await orderEntryOrder(page)).filter((id) => configured.includes(id));
    expect(shown.length, 'precondition: order entry lists the configured tests').toBeGreaterThan(1);
    expect(shown, 'order entry must follow the Display Order configured for Serum')
      .toEqual(configured.filter((id) => shown.includes(id)));
  });

  test('TC-SD-32: FLIP-WHEN-FIXED - Display Order opens on the edited test\'s own sample type', async ({ page }) => {
    // SD-D2. The section ignores testId and opens on the first sample type in the list (Fluid on
    // testing), so the admin does not see the test they came from.
    test.fail(true, 'SD-D2: Display Order ignores the current test; flips when it preselects its sample type');
    await open(page, `/MasterListsPage/TestCatalogEditor/${T}/display-order`);
    await page.getByTestId('display-order-section').waitFor({ state: 'visible', timeout: 60_000 });
    await expect(page.locator('#display-order-sample-type'), 'preselect the test\'s sample type (Serum)').toHaveValue(SERUM);
  });
});

// =============================================================================================
// QC Targets (coverage)
// =============================================================================================
test.describe('QC Targets', () => {
  let T = '';

  test.beforeAll(async ({ browser }) => {
    const page = await ctxPage(browser);
    T = (await seedNumericTest(page, { name: `QA QC ${RUN}`, code: `QQC${RUN}` })).id;
    await page.context().close();
  });

  async function openQc(page: Page) {
    await open(page, `/MasterListsPage/TestCatalogEditor/${T}/qc-targets`);
    await page.getByTestId('qc-targets-section').waitFor({ state: 'visible', timeout: 60_000 });
    await watchToasts(page);
  }

  test('TC-SD-40: a LOW target saved in the UI reads back, and resolves as the effective target', async ({ page }) => {
    await openQc(page);
    await page.getByTestId('qc-target-add-LOW').click();
    await fillById(page, 'qc-target-LOW-expected', '5');
    await fillById(page, 'qc-target-LOW-uncertainty', '0.5');
    await page.getByTestId('qc-target-done-LOW').click();
    const resp = nextResponse(page, 'PUT', new RegExp(`/tests/${T}/qc-targets$`));
    await page.getByTestId('qc-targets-save').click();
    expect((await resp).status(), 'qc targets save answered').toBe(200);
    const got = await apiGet<any>(page, `${TC}/tests/${T}/qc-targets`);
    const low = (got.json?.targets ?? []).filter((t: any) => t.controlLevel === 'LOW' && t.active);
    expect(low.map((t: any) => [Number(t.expectedValue), Number(t.uncertainty)]), 'one active LOW target, 5 +/- 0.5').toEqual([[5, 0.5]]);
    const eff = await apiGet<any>(page, `${TC}/tests/${T}/qc-targets/effective?controlLevel=LOW&qcControlLotId=`);
    expect(eff.json?.source, 'with no lot override the level target is effective').toBe('LEVEL');
    expect((await successToasts(page)).some((t) => /qc targets saved/i.test(t.text)), 'toast confirms').toBe(true);
  });

  test('TC-SD-41: an active target with no values is refused in the UI and nothing is written', async ({ page }) => {
    await openQc(page);
    await page.getByTestId('qc-target-add-NORMAL').click();
    await page.getByTestId('qc-target-done-NORMAL').click();
    let put = 0;
    page.on('request', (r) => { if (r.method() === 'PUT' && /\/qc-targets$/.test(r.url())) put++; });
    await page.getByTestId('qc-targets-save').click();
    await expect(page.getByText(/every active target needs an expected value/i).first(), 'the rule is explained').toBeVisible({ timeout: 10_000 });
    const got = await apiGet<any>(page, `${TC}/tests/${T}/qc-targets`);
    expect((got.json?.targets ?? []).filter((t: any) => t.controlLevel === 'NORMAL'), 'no NORMAL target was stored').toHaveLength(0);
    expect(put, 'the blank target never reached the server').toBe(0);
  });

  test('TC-SD-42: a negative uncertainty is refused with its own message', async ({ page }) => {
    await openQc(page);
    await page.getByTestId('qc-target-add-HIGH').click();
    await fillById(page, 'qc-target-HIGH-expected', '12');
    await fillById(page, 'qc-target-HIGH-uncertainty', '-1');
    await page.getByTestId('qc-target-done-HIGH').click();
    await page.getByTestId('qc-targets-save').click();
    await expect(page.getByText(/uncertainty must be a non-negative number/i).first()).toBeVisible({ timeout: 10_000 });
    const got = await apiGet<any>(page, `${TC}/tests/${T}/qc-targets`);
    expect((got.json?.targets ?? []).filter((t: any) => t.controlLevel === 'HIGH'), 'no HIGH target was stored').toHaveLength(0);
  });
});

// =============================================================================================
// Result Interpretations (coverage, with a results-entry read-back)
// =============================================================================================
test.describe('Sample & Results - Interpretations', () => {
  let T = '';

  test.beforeAll(async ({ browser }) => {
    const page = await ctxPage(browser);
    T = (await seedNumericTest(page, { name: `QA Int ${RUN}`, code: `QIN${RUN}` })).id;
    await page.context().close();
  });

  test('TC-SD-50: an interpretation added in the editor reads back and reaches results entry', async ({ page }) => {
    await open(page, `/MasterListsPage/TestCatalogEditor/${T}/sample-results`);
    const add = page.getByRole('button', { name: /^add interpretation$/i });
    await add.waitFor({ state: 'visible', timeout: 60_000 });
    await add.click();
    await fillById(page, 'int-match-0-0', '>10');
    await fillById(page, 'int-text-0-0', `QA high ${RUN}`);
    await page.locator('#int-sev-0-0').selectOption('CRITICAL');
    await watchToasts(page);
    const resp = nextResponse(page, 'PUT', new RegExp(`/tests/${T}/sample-results$`));
    await page.getByRole('button', { name: /^save$/i }).last().click();
    expect((await resp).status(), 'sample & results save answered').toBe(200);
    const sr = await apiGet<any>(page, `${TC}/tests/${T}/sample-results`);
    const ints = sr.json?.components?.[0]?.interpretations ?? [];
    expect(ints.map((i: any) => [i.valueMatch, i.text, i.severity]), 'stored on the component').toEqual([['>10', `QA high ${RUN}`, 'CRITICAL']]);
    const re = await apiGet<any[]>(page, `/rest/results-entry/test/${T}/interpretations`);
    expect(((re.json as any[]) ?? []).map((i) => [i.valueMatch, i.severity]), 'results entry sees the rule').toEqual([['>10', 'CRITICAL']]);
  });
});

// =============================================================================================
// Panel Editor > Tests (coverage, with the test-side read-back)
// =============================================================================================
test.describe('Panel Editor - member tests', () => {
  let P = ''; const tests: { id: string; name: string; code: string }[] = [];

  test.beforeAll(async ({ browser }) => {
    const page = await ctxPage(browser);
    for (const k of ['A', 'B']) {
      const name = `QA PM${k} ${RUN}`; const code = `QP${k}${RUN}`;
      tests.push({ id: (await seedNumericTest(page, { name, code, activate: true })).id, name, code });
    }
    const p = await apiWrite<any>(page, 'POST', `${TC}/panels`, { name: `QASP${RUN}`, active: false, domain: 'CLINICAL' });
    expect(p.status, 'seed panel').toBe(201);
    P = String(p.json?.id);
    await page.context().close();
  });

  const order = async (page: Page) => (((await apiGet<any>(page, `${TC}/panels/${P}/test-order`)).json?.tests) ?? []).map((t: any) => String(t.testId));
  const memberOf = async (page: Page, testId: string) =>
    (((await apiGet<any>(page, `${TC}/tests/${testId}/panels`)).json?.memberships) ?? []).some((m: any) => String(m.panelId) === P);

  async function openTests(page: Page) {
    await open(page, `/MasterListsPage/TestCatalogEditor/panel/${P}/tests`);
    await page.locator('#panel-add-test').waitFor({ state: 'visible', timeout: 60_000 });
    await watchToasts(page);
  }
  async function add(page: Page, t: { name: string; code: string }) {
    const input = page.locator('#panel-add-test');
    await input.click();
    await input.pressSequentially(t.name, { delay: 20 });
    // Items read "name(SampleType) — code".
    await page.getByRole('option', { name: new RegExp(`^${t.name}.* — ${t.code}$`) }).first().click();
  }
  async function save(page: Page) {
    const resp = nextResponse(page, 'PUT', new RegExp(`/panels/${P}/tests$`));
    await page.getByRole('button', { name: /^save$/i }).last().click();
    return (await resp).status();
  }

  test('TC-SD-60: adding two tests in the UI persists them and each test sees the panel', async ({ page }) => {
    await openTests(page);
    await add(page, tests[0]); await add(page, tests[1]);
    expect(await save(page), 'panel tests save answered').toBe(200);
    expect(await order(page), 'both tests, in the order added').toEqual([tests[0].id, tests[1].id]);
    expect(await memberOf(page, tests[0].id) && await memberOf(page, tests[1].id), 'test-side memberships include the panel').toBe(true);
  });

  test('TC-SD-61: moving a test up reorders it', async ({ page }) => {
    await openTests(page);
    await page.getByTestId(`panel-test-up-${tests[1].id}`).click();
    expect(await save(page)).toBe(200);
    expect(await order(page), 'B now comes first').toEqual([tests[1].id, tests[0].id]);
  });

  test('TC-SD-62: removing a test drops the membership on both sides', async ({ page }) => {
    await openTests(page);
    await page.getByTestId(`panel-test-remove-${tests[0].id}`).click();
    expect(await save(page)).toBe(200);
    expect(await order(page), 'only B remains').toEqual([tests[1].id]);
    expect(await memberOf(page, tests[0].id), 'A no longer lists the panel').toBe(false);
  });
});

// =============================================================================================
// Reagents (coverage, with the results-entry read-back)
// =============================================================================================
test.describe('Reagents', () => {
  let T = ''; let reagentId = ''; const reagentName = `QA Reagent ${RUN}`;

  test.beforeAll(async ({ browser }) => {
    const page = await ctxPage(browser);
    T = (await seedNumericTest(page, { name: `QA Rg ${RUN}`, code: `QRG${RUN}` })).id;
    const inv = await apiWrite<any>(page, 'POST', '/rest/inventory/items', { name: reagentName, itemType: 'REAGENT', units: 'mL', lowStockThreshold: 5 });
    expect(inv.status, `seed reagent: ${inv.text.slice(0, 160)}`).toBeLessThan(300);
    reagentId = String(inv.json?.id);
    await page.context().close();
  });

  const links = async (page: Page) => ((await apiGet<any[]>(page, `${TC}/${T}/reagents`)).json as any[]) ?? [];

  test('TC-SD-70: linking a reagent in the modal persists it and results entry sees it', async ({ page }) => {
    await open(page, `/MasterListsPage/TestCatalogEditor/${T}/reagents`);
    await page.getByTestId('link-reagent-button').click({ timeout: 60_000 });
    // #reagent-multiselect is the wrapper; the typeable input is #reagent-multiselect-input.
    // Do not press Escape afterwards: it clears the selection and leaves "Link Selected" disabled.
    const ms = page.locator('#reagent-multiselect-input');
    await ms.click();
    await ms.pressSequentially(reagentName, { delay: 20 });
    await page.getByRole('option', { name: reagentName, exact: true }).first().click();
    await expect(page.getByRole('button', { name: /^link selected$/i }), 'selecting the reagent enables Link Selected').toBeEnabled();
    const resp = nextResponse(page, 'POST', new RegExp(`/${T}/reagents$`));
    await page.getByRole('button', { name: /^link selected$/i }).click();
    expect((await resp).status(), 'link answered 201').toBe(201);
    expect((await links(page)).map((l) => String(l.reagentId)), 'linked').toContain(reagentId);
    await expect(page.locator('[data-testid^="reagent-row-"]').filter({ hasText: reagentName }), 'row rendered').toBeVisible({ timeout: 10_000 });
    const re = await apiGet<any>(page, `/rest/results-entry/test/${T}/reagents`);
    expect(JSON.stringify(re.json ?? ''), 'results entry lists the reagent').toContain(reagentName);
  });

  test('TC-SD-71: editing quantity per test persists', async ({ page }) => {
    await open(page, `/MasterListsPage/TestCatalogEditor/${T}/reagents`);
    const link = (await links(page)).find((l) => String(l.reagentId) === reagentId);
    expect(link, 'precondition: TC-SD-70 linked it').toBeTruthy();
    await fillById(page, `qty-${link.id}`, '2');
    const resp = nextResponse(page, 'PUT', new RegExp(`/reagents/${reagentId}$`));
    await page.getByTestId('reagents-save').click();
    expect((await resp).ok(), 'edit answered 2xx').toBe(true);
    const after = (await links(page)).find((l) => String(l.reagentId) === reagentId);
    expect(Number(after?.quantityPerTest), 'quantity stored').toBe(2);
  });

  test('TC-SD-72: unlinking after confirmation removes it', async ({ page }) => {
    await open(page, `/MasterListsPage/TestCatalogEditor/${T}/reagents`);
    const link = (await links(page)).find((l) => String(l.reagentId) === reagentId);
    expect(link, 'precondition: linked').toBeTruthy();
    await page.getByTestId(`unlink-${link.id}`).click({ timeout: 60_000 });
    const resp = nextResponse(page, 'DELETE', new RegExp(`/reagents/${reagentId}$`));
    // The confirm button's accessible name is "danger Unlink" (Carbon danger kind).
    await page.getByRole('dialog', { name: /unlink reagent/i }).getByRole('button', { name: /unlink$/i }).click();
    expect((await resp).status(), 'unlink answered 204').toBe(204);
    expect((await links(page)).map((l) => String(l.reagentId)), 'gone').not.toContain(reagentId);
  });
});

// =============================================================================================
// Read-only sections: Analyzers, Reflex & Calc
// =============================================================================================
test.describe('Read-only sections', () => {
  async function findTest(page: Page, has: (id: string) => Promise<boolean>): Promise<string> {
    const list = ((await apiGet<any[]>(page, '/rest/test-list')).json as any[]) ?? [];
    for (const t of list) if (await has(String(t.id))) return String(t.id);
    return '';
  }

  test('TC-SD-80: Analyzers shows exactly what the analyzer mapping endpoint returns (rows, or the empty state)', async ({ page }) => {
    // testing had no BOUND analyzer mapping on 2026-09-23, so the populated case is a declared
    // data gap there; this case still proves the section renders the endpoint faithfully either way.
    await open(page, '/MasterListsPage/TestCatalogList');
    const list = ((await apiGet<any[]>(page, '/rest/test-list')).json as any[]) ?? [];
    let id = ''; let want: string[] = [];
    for (const t of list) {
      const a = (((await apiGet<any>(page, `${TC}/tests/${t.id}/analyzers`)).json?.analyzers) ?? []).map((x: any) => String(x.analyzerId));
      if (!id || a.length) { id = String(t.id); want = a.sort(); }
      if (a.length) break;
    }
    expect(id, 'need at least one test').not.toBe('');
    await open(page, `/MasterListsPage/TestCatalogEditor/${id}/analyzers`);
    if (want.length) {
      await page.locator('[data-testid^="analyzer-row-"]').first().waitFor({ state: 'visible', timeout: 60_000 });
    } else {
      await expect(page.getByText(/no analyzers are mapped to this test yet/i), 'empty state shown when nothing is bound').toBeVisible({ timeout: 60_000 });
    }
    const shown = (await page.locator('[data-testid^="analyzer-row-"]').evaluateAll((els) =>
      els.map((e) => (e.getAttribute('data-testid') || '').replace('analyzer-row-', '')))).sort();
    expect(shown, `section rows match the endpoint for test ${id}`).toEqual(want);
  });

  test('TC-SD-81: Reflex & Calc lists the rules for the test and links each to its editor', async ({ page }) => {
    await open(page, '/MasterListsPage/TestCatalogList');
    const id = await findTest(page, async (tid) => {
      const j = (await apiGet<any>(page, `${TC}/${tid}/reflex-calc`)).json ?? {};
      return (j.reflexRules?.length ?? 0) + (j.calculatedBy?.length ?? 0) + (j.feedsInto?.length ?? 0) > 0;
    });
    expect(id, 'need a test with a reflex rule or calculation on this instance').not.toBe('');
    const j = (await apiGet<any>(page, `${TC}/${id}/reflex-calc`)).json ?? {};
    await open(page, `/MasterListsPage/TestCatalogEditor/${id}/reflex-calc`);
    await page.getByTestId('reflex-calc-section').waitFor({ state: 'visible', timeout: 60_000 });
    const count = async (p: string) => page.locator(`[data-testid^="${p}"]`).count();
    expect([await count('reflex-row-'), await count('calcby-row-'), await count('feeds-row-')],
      'one row per rule and calculation the endpoint returns')
      .toEqual([j.reflexRules?.length ?? 0, j.calculatedBy?.length ?? 0, j.feedsInto?.length ?? 0]);
    const reflexWithRule = (j.reflexRules ?? []).find((r: any) => r.ruleId);
    if (reflexWithRule) {
      await expect(page.getByTestId(`reflex-row-${reflexWithRule.id}`).locator('a').first(), 'links to the rule editor')
        .toHaveAttribute('href', new RegExp(`/MasterListsPage/reflex\\?id=${reflexWithRule.ruleId}`));
    }
  });
});

// =============================================================================================
// Import Catalog (CSV)
// =============================================================================================
test.describe('Import Catalog (CSV)', () => {
  const NAME = `QA Import ${RUN}`;
  const CODE = `QAI${RUN}`; // localCode <= 10
  const csv = () => Buffer.from(
    'testName,testSection,sampleType,isActive,isOrderable,localCode,localization:en,localization:fr\n' +
    `${NAME},Biochemistry,Serum,N,N,${CODE},${NAME},${NAME}\n`);

  async function run(page: Page, button: 'Preview' | 'Apply') {
    const resp = nextResponse(page, 'POST', new RegExp(`/rest/configuration/import/${button.toLowerCase()}$`), 60_000);
    await page.getByRole('button', { name: new RegExp(`^${button}$`, 'i') }).click();
    const r = await resp;
    return { status: r.status(), plan: await r.json().catch(() => null) };
  }
  async function stage(page: Page) {
    await open(page, '/MasterListsPage/CatalogImport');
    await page.locator('input[type="file"]').first().setInputFiles({ name: `tests-qa-${RUN}.csv`, mimeType: 'text/csv', buffer: csv() });
    await expect(page.getByTestId('catalog-import-files'), 'file staged').toContainText(`tests-qa-${RUN}.csv`, { timeout: 20_000 });
    await watchToasts(page);
  }

  test('TC-SD-90: a one-row tests CSV previews one create, applies it, and the test exists', async ({ page }) => {
    await stage(page);
    const pv = await run(page, 'Preview');
    expect(pv.status, 'preview answered').toBe(200);
    expect(pv.plan?.files?.[0]?.created, 'preview promises one create').toBe(1);
    const ap = await run(page, 'Apply');
    expect(ap.status, 'apply answered').toBe(200);
    expect(ap.plan?.files?.[0]?.error ?? null, 'apply reports no file error').toBeNull();
    expect(ap.plan?.files?.[0]?.created, 'apply created what preview promised (OGC-1228)').toBe(1);
    const found = await apiGet<any>(page, `${TC}/tests?search=${encodeURIComponent(NAME)}&status=all`);
    expect(JSON.stringify(found.json ?? ''), 'the imported test is in the catalog').toContain(NAME);
  });

  test('TC-SD-91: importing the same row again previews an update, not a second create', async ({ page }) => {
    await stage(page);
    const pv = await run(page, 'Preview');
    expect([pv.plan?.files?.[0]?.created, pv.plan?.files?.[0]?.updated], 'identity by localCode: 0 created, 1 updated').toEqual([0, 1]);
  });
});
