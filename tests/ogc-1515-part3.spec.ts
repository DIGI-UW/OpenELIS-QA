import { test, expect, Page, Locator } from '@playwright/test';

/**
 * OGC-1515 parts 3 and 4 (OpenELIS-Global-2 #4929, #4931): the remaining site-data lists are
 * searched by typing, ignoring case and accents.
 *
 * Part 3 (#4929): Lab Unit on Results and Validation, the NCE reporting unit, the TAT report's
 * sample type and ordering site, the study export's study, the generic sample type and unit of
 * measure, Batch Order Entry's sample type. Plus: the study export lists only the studies it can
 * write (with Routine HIV Testing) and every study and date type exports; an empty trends export
 * answers 200.
 * Part 4 (#4931): order entry v4 Sampling Performed At, the EQA participants scheme, the new
 * cycle dialog's scheme (Escape ends a search before it closes the dialog).
 *
 * Read-only: nothing is saved. Companions: tests/ogc-1515-searchable-lists.spec.ts (part 1) and
 * tests/ogc-1515-part2.spec.ts (part 2).
 */

const API = '/api/OpenELIS-Global/rest';
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

async function open(page: Page, route: string) {
  await page.goto(route);
  await page.waitForLoadState('networkidle').catch(() => {});
}

async function optionsOf(page: Page, box: Locator): Promise<string[]> {
  const id = await box.getAttribute('aria-controls');
  if (!id) return [];
  await page.waitForTimeout(300);
  return (await page.locator(`[id="${id}"]`).getByRole('option').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
}

/**
 * The box is a type-to-search list: typing part of an option (in upper case) narrows the list to
 * matching options only, a query nothing matches offers nothing, and the option can be picked.
 * Returns the picked label.
 */
async function searchAndPick(page: Page, box: Locator, prefer?: (o: string) => boolean, pick = true): Promise<string> {
  await expect(box).toBeVisible({ timeout: 60_000 });
  await expect(box, 'the list is a combobox that takes typing').toHaveAttribute('role', 'combobox');
  if ((await box.getAttribute('aria-expanded')) !== 'true') await box.click();
  let all: string[] = [];
  await expect.poll(async () => (all = await optionsOf(page, box)).length, { timeout: 30_000 }).toBeGreaterThanOrEqual(2);
  const target = (prefer && all.find(prefer)) ?? all[Math.floor(all.length / 2)];
  const word = fold(target).split(/[^a-z0-9]+/).find((w) => w.length >= 3) ?? fold(target);
  const query = word.slice(0, 4).toUpperCase();
  await box.fill(query);
  const narrowed = await optionsOf(page, box);
  expect(narrowed.length, `"${query}" offers at least ${target}`).toBeGreaterThanOrEqual(1);
  expect(narrowed.length, `"${query}" narrows the ${all.length} options`).toBeLessThanOrEqual(all.length);
  for (const o of narrowed) expect(fold(o), `"${o}" matches "${query}"`).toContain(fold(query));
  await box.fill('zzqxjw');
  expect(await optionsOf(page, box), 'a query nothing matches offers nothing').toEqual([]);
  await box.fill(query);
  if (!pick) return target;
  await page.locator(`[id="${await box.getAttribute('aria-controls')}"]`).getByRole('option', { name: target, exact: true }).first().click();
  await expect(box).toHaveValue(target);
  return target;
}

test.describe('OGC-1515 part 3: searchable lists (#4929)', () => {
  test.beforeEach(async ({ page }) => {
    await open(page, '/Dashboard');
  });

  test('TC-1515-20a Results: Lab Unit is searchable', async ({ page }) => {
    await open(page, '/Results');
    expect(await searchAndPick(page, page.getByRole('main').getByRole('combobox', { name: 'Lab Unit' }).first()), 'the list was searched and a choice offered').toBeTruthy();
  });

  test('TC-1515-20b Validation: Lab Unit is searchable', async ({ page }) => {
    await open(page, '/ResultValidation');
    expect(await searchAndPick(page, page.getByRole('main').getByRole('combobox', { name: 'Lab Unit' }).first()), 'the list was searched and a choice offered').toBeTruthy();
  });

  test('TC-1515-21 Report NCE: reporting unit is searchable', async ({ page }) => {
    await open(page, '/ReportNonConformingEvent');
    const box = page.locator('input#reporting-unit');
    test.skip(!(await box.isVisible({ timeout: 30_000 }).catch(() => false)), 'the reporting unit shows only after a sample is chosen; covered by the dev spec non-conforming-event.spec.ts');
    expect(await searchAndPick(page, box, undefined, false), 'the list was searched and a choice offered').toBeTruthy();
  });

  test('TC-1515-22 TAT report: sample type and ordering site are searchable', async ({ page }) => {
    await open(page, '/TATReport');
    expect(await searchAndPick(page, page.locator('input#tat-sample-type')), 'the list was searched and a choice offered').toBeTruthy();
    expect(await searchAndPick(page, page.locator('input#tat-ordering-site')), 'the list was searched and a choice offered').toBeTruthy();
  });

  test('TC-1515-23 Study export: the study is searchable and lists only exportable studies', async ({ page }) => {
    const listed = page.waitForResponse((r) => r.url().includes('/rest/studyprojects'), { timeout: 60_000 });
    await open(page, '/StudyReport?type=patient&report=CIStudyExport');
    const studies = (await (await listed).json()) as { id: string; value: string }[];
    expect(studies.map((s) => s.value), 'Routine HIV Testing is offered (it was missing)').toContain('Routine HIV Testing');
    expect(studies.map((s) => s.value), '"Testing" is not offered (it answered an internal error)').not.toContain('Testing');
    expect(await searchAndPick(page, page.locator('input#studyType'), (o) => o === 'Routine HIV Testing'), 'the list was searched and a choice offered').toBeTruthy();
  });

  test('TC-1515-24 Study export: every offered study exports with each date type; an empty trends export answers 200', async ({ page }) => {
    const studies = (await (await page.request.get(`${API}/studyprojects`)).json()) as { id: string; value: string }[];
    expect(studies.length).toBeGreaterThanOrEqual(1);
    for (const s of studies) {
      for (const dt of ['ORDER_DATE', 'RESULT_DATE', 'PRINT_DATE']) {
        const r = await page.request.get(
          `/api/OpenELIS-Global/ReportPrint?report=CIStudyExport&type=patient&upperDateRange=04/11/2026&lowerDateRange=01/01/2026&projectCode=${s.id}&dateType=${dt}`,
          { timeout: 120_000 },
        );
        expect(r.status(), `${s.value} by ${dt}`).toBe(200);
        expect(r.headers()['content-type'] ?? '', `${s.value} by ${dt} is a CSV, not an error page`).toContain('text/plain');
        expect((await r.text()).split('\n')[0], `${s.value} by ${dt} has a header row`).toContain('Lab No');
      }
    }
    const trends = (await (await page.request.get(`${API}/trendsprojects`)).json()) as { id: string }[];
    test.skip(trends.length === 0, 'no trends projects on this instance');
    const empty = await page.request.get(
      `/api/OpenELIS-Global/ReportPrint?report=Trends&type=patient&upperDateRange=02/01/2026&lowerDateRange=01/01/2026&vlStudyType=${encodeURIComponent(trends[0].id)}`,
    );
    expect(empty.status(), 'a trends export with no matching sample answers 200 (it answered 500)').toBe(200);
  });

  test('TC-1515-25 Generic sample: sample type and unit of measure are searchable', async ({ page }) => {
    await open(page, '/GenericSample/Order');
    expect(await searchAndPick(page, page.locator('input#sampleType')), 'the list was searched and a choice offered').toBeTruthy();
    expect(await searchAndPick(page, page.locator('input#sampleUnitOfMeasure')), 'the list was searched and a choice offered').toBeTruthy();
  });

  test('TC-1515-26 Batch Order Entry: sample type is searchable', async ({ page }) => {
    await open(page, '/SampleBatchEntrySetup');
    // The sample type appears once a form is chosen.
    await page.locator('main select').first().selectOption({ label: 'Routine' });
    expect(await searchAndPick(page, page.locator('input#selectSampleType'), (o) => /^S[eé]rum$/i.test(o)), 'the list was searched and a choice offered').toBeTruthy();
    await expect(page.getByPlaceholder(/Search tests/i), 'the tests list is searchable once a type is chosen').toBeVisible();
  });
});

test.describe('OGC-1515 part 4: searchable lists (#4931)', () => {
  test.beforeEach(async ({ page }) => {
    await open(page, '/Dashboard');
  });

  test('TC-1515-27 EQA participants: the scheme is searchable', async ({ page }) => {
    await open(page, '/qa/eqa/participants');
    const box = page.locator('input#program-selector');
    test.skip(!(await box.isVisible({ timeout: 30_000 }).catch(() => false)), 'no EQA scheme selector (EQA off on this instance)');
    expect(await searchAndPick(page, box, undefined, false), 'the list was searched and a choice offered').toBeTruthy();
  });

  test('TC-1515-28 New EQA cycle: the scheme is searchable; Escape ends the search before it closes the dialog', async ({ page }) => {
    await open(page, '/qa/eqa/my-cycles');
    const newBtn = page.getByRole('main').getByRole('button', { name: /new cycle/i }).first();
    test.skip(!(await newBtn.isVisible({ timeout: 30_000 }).catch(() => false)), 'no New cycle action on this instance');
    await newBtn.click();
    const modal = page.locator('.cds--modal.is-visible');
    await expect(modal).toBeVisible();
    const box = modal.getByRole('combobox', { name: /Scheme/ });
    await box.click();
    const all = await optionsOf(page, box);
    test.skip(all.length < 2, 'fewer than two EQA schemes; nothing to search');
    expect(await searchAndPick(page, box, undefined, false), 'the list was searched and a choice offered').toBeTruthy();
    await page.keyboard.press('Escape');
    await expect(modal, 'the first Escape ends the search, the dialog stays open').toBeVisible();
    await page.keyboard.press('Escape');
    await expect(modal, 'a second Escape closes the dialog').toBeHidden();
  });
});
