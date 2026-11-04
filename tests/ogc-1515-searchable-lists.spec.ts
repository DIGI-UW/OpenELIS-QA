import { test, expect, Page, Locator } from '@playwright/test';

/**
 * OGC-1515 part 1 (OpenELIS-Global-2 #4922): long site-data lists become type-to-search comboboxes.
 *
 * Guards for each screen #4922 converted: the combobox narrows to what is typed, ignoring case and
 * accents; a query nothing matches leaves no options; a pick shows in the box. Plus the fixes the PR
 * names: the by-test activity report prints (was 500 for every test); Referred Out asks for the lab
 * before printing; batch reassignment refuses a bad replacement list with 400 (was 200 and "saved").
 *
 * The H12 sweep (tests/ux-h12-search-not-select.spec.ts) proves the old selects are gone; this file
 * proves the replacements work. Read-only except the refused batch POST, which changes nothing.
 */

const API = '/api/OpenELIS-Global/rest';

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

async function open(page: Page, route: string) {
  await page.goto(route);
  await page.waitForLoadState('networkidle').catch(() => {});
}

async function options(page: Page, box: Locator): Promise<string[]> {
  const id = await box.getAttribute('aria-controls');
  if (!id) return [];
  const list = page.locator(`[id="${id}"]`);
  await page.waitForTimeout(300);
  return (await list.getByRole('option').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
}

/** Open, narrow by a query (upper-cased, accents stripped), check, then pick the first match. */
async function checkSearch(page: Page, box: Locator, minOptions = 2, prefer?: RegExp, pickAddsTag = false): Promise<string> {
  await expect(box, 'combobox is visible').toBeVisible({ timeout: 60_000 });
  await box.click();
  await expect(box).toHaveAttribute('aria-expanded', 'true');
  let all: string[] = [];
  await expect.poll(async () => (all = await options(page, box)).length, { timeout: 30_000 }).toBeGreaterThanOrEqual(minOptions);

  // Prefer an option with an accent, so the accent rule is exercised when the data allows.
  const accented = all.find((o) => o !== o.normalize('NFD').replace(/[̀-ͯ]/g, ''));
  const target = (prefer && all.find((o) => prefer.test(o))) ?? accented ?? all[Math.floor(all.length / 2)];
  const word = fold(target).split(/[^a-z0-9]+/).find((w) => w.length >= 4) ?? fold(target).slice(0, 4);
  const query = word.slice(0, 4).toUpperCase(); // different case, no accents

  await box.fill(query);
  await page.waitForTimeout(500);
  const narrowed = await options(page, box);
  expect(narrowed.length, `"${query}" matches at least the option it came from (${target})`).toBeGreaterThanOrEqual(1);
  expect(narrowed.length, `"${query}" narrows the list of ${all.length}`).toBeLessThanOrEqual(all.length);
  for (const o of narrowed) expect(fold(o), `option "${o}" contains "${query}" ignoring case and accents`).toContain(fold(query));
  expect(narrowed.map(fold), `the source option "${target}" is offered for "${query}"`).toContain(fold(target));

  await box.fill('zzqxjw');
  await page.waitForTimeout(400);
  expect(await options(page, box), 'a query nothing matches offers nothing').toEqual([]);

  await box.fill(query);
  await page.waitForTimeout(400);
  const id = await box.getAttribute('aria-controls');
  await page.locator(`[id="${id}"]`).getByRole('option').filter({ hasText: target }).first().click();
  if (pickAddsTag) {
    // Multi-pick: the choice becomes a tag, the box clears for the next pick, and the chosen
    // option leaves the list.
    await expect(page.locator('.cds--tag').filter({ hasText: target }).first(), 'the pick shows as a tag').toBeVisible();
    await expect(box, 'the box clears for the next pick').toHaveValue('');
    await box.click();
    await box.fill(query);
    await page.waitForTimeout(400);
    expect((await options(page, box)).map(fold), 'a chosen test is not offered twice').not.toContain(fold(target));
    await page.keyboard.press('Escape');
  } else {
    await expect(box, 'the pick shows in the box').toHaveValue(target);
  }
  return target;
}

async function menuRoute(page: Page, needle: string): Promise<string> {
  const r = await page.request.get(`${API}/menu`);
  const urls: string[] = [];
  const walk = (n: any) => (Array.isArray(n) ? n : [n]).forEach((x: any) => { if (x?.menu?.actionURL) urls.push(x.menu.actionURL); if (x?.childMenus) walk(x.childMenus); });
  walk(await r.json());
  const hit = urls.find((u) => u.includes(needle));
  expect(hit, `menu entry ${needle}`).toBeTruthy();
  return hit!;
}

/** Click the print button and read the PDF the new tab would open. */
async function printedPdf(page: Page, button: Locator) {
  const popup = page.context().waitForEvent('page', { timeout: 30_000 });
  await button.click();
  const tab = await popup;
  const url = tab.url();
  await tab.close().catch(() => {});
  const r = await page.request.get(url, { timeout: 120_000 });
  const body = await r.body();
  return { url, status: r.status(), type: r.headers()['content-type'] ?? '', head: body.subarray(0, 5).toString(), text: body.subarray(0, 400).toString() };
}

/** Fill the report's date range (site format dd/mm/yyyy). */
async function dateRange(page: Page) {
  const now = new Date();
  const dd = String(now.getUTCDate()).padStart(2, '0'), mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  for (const [name, v] of [['Start Date', `01/01/${now.getUTCFullYear()}`], ['End Date', `${dd}/${mm}/${now.getUTCFullYear()}`]]) {
    const box = page.getByRole('textbox', { name });
    await box.fill(v);
    await box.press('Tab');
  }
  await page.keyboard.press('Escape');
}

test.describe('OGC-1515 part 1: searchable lists (#4922)', () => {
  test.beforeEach(async ({ page }) => {
    await open(page, '/Dashboard');
  });

  for (const [id, route, name] of [
    ['TC-1515-01', '/WorkPlanByTest', 'Test Type'],
    ['TC-1515-02', '/WorkPlanByPanel', 'Panel Type'],
    ['TC-1515-03', '/WorkPlanByTestSection', 'Unit Type'],
  ] as const) {
    test(`${id} Workplan ${name}: type to search, pick, worklist loads`, async ({ page }) => {
      await open(page, route);
      const box = page.getByRole('combobox', { name });
      const listCall = page.waitForResponse((r) => /\/rest\/.*[Ww]ork[Pp]lan/i.test(r.url()) && r.request().method() === 'GET', { timeout: 60_000 }).catch(() => null);
      await checkSearch(page, box);
      const resp = await listCall;
      expect(resp, 'picking loads the worklist').not.toBeNull();
      expect(resp!.status(), 'worklist request answers 200').toBe(200);
    });
  }

  for (const [id, report, minOptions] of [
    ['TC-1515-04', 'activityReportByTest', 2],
    ['TC-1515-05', 'activityReportByPanel', 2],
    ['TC-1515-06', 'activityReportByTestSection', 2],
  ] as const) {
    test(`${id} Activity report ${report}: Search By is searchable and the report prints a PDF`, async ({ page }) => {
      await open(page, await menuRoute(page, `report=${report}`));
      await dateRange(page);
      await checkSearch(page, page.getByRole('combobox', { name: 'Search By' }), minOptions, /GPT|ALAT|Glucose|Bilan|Biochim/i);
      const button = page.getByRole('button', { name: 'Generate Printable Version' });
      await expect(button, 'Generate is enabled once dates and a choice are set').toBeEnabled();
      const pdf = await printedPdf(page, button);
      expect(pdf.status, `${pdf.url} answers 200 (by test answered 500 before #4922): ${pdf.text}`).toBe(200);
      expect(pdf.head, `the response is a PDF: ${pdf.text}`).toBe('%PDF-');
    });
  }

  test('TC-1515-07 Referred Out: lab is searchable; printing without a lab asks for it; with a lab prints', async ({ page }) => {
    await open(page, await menuRoute(page, 'report=referredOut'));
    await dateRange(page);
    const button = page.getByRole('button', { name: 'Generate Printable Version' });
    await button.click();
    await expect(page.getByText('Choose the referral center or laboratory to report on.'), 'asks for the lab first').toBeVisible();
    await checkSearch(page, page.getByRole('combobox', { name: 'Referral Center or Laboratory' }));
    const pdf = await printedPdf(page, button);
    expect(pdf.url, 'the print carries the chosen lab').toMatch(/locationCode=[^&]+/);
    expect(pdf.status, pdf.text).toBe(200);
    expect(pdf.head, `${pdf.url}: ${pdf.text}`).toBe('%PDF-');
  });

  test('TC-1515-08 Batch reassignment: sample type, current test and replacement are searchable; a new sample type clears the current test', async ({ page }) => {
    await open(page, '/MasterListsPage/batchTestReassignment');
    await checkSearch(page, page.getByRole('combobox', { name: 'Sample Type' }), 2, /^Serum$|^Sérum$/);
    const current = page.getByRole('combobox', { name: 'Current test' });
    const pickedTest = await checkSearch(page, current, 1, /GPT|ALAT|Glucose/i);
    const replace = page.getByRole('combobox', { name: 'Replace with' });
    await expect(replace, 'Replace with is off while "do not assign a new test" is ticked').toBeDisabled();
    await page.getByText('Cancel test for lab numbers selected, do not assign a new test').click();
    await expect(replace).toBeEnabled();
    await checkSearch(page, replace, 1, /GOT|ASAT|Creat/i, true);
    // Changing the sample type must not keep a current test from the old one.
    const sampleType = page.getByRole('combobox', { name: 'Sample Type' });
    const firstType = await sampleType.inputValue();
    await sampleType.click();
    await sampleType.fill('');
    const types = await options(page, sampleType);
    const other = types.find((t) => t !== firstType);
    test.skip(!other, 'only one sample type on this instance');
    await page.locator(`[id="${await sampleType.getAttribute('aria-controls')}"]`).getByRole('option', { name: other!, exact: true }).click();
    await page.waitForTimeout(1500);
    expect(await current.inputValue(), `current test "${pickedTest}" is cleared when the sample type changes`).toBe('');
  });

  test('TC-1515-12 Batch reassignment: "Include inactive tests" changes the current test list; replacements are active tests only', async ({ page }) => {
    await open(page, '/MasterListsPage/batchTestReassignment');
    const loaded = page.waitForResponse((r) => r.url().includes('/rest/AllTestsForSampleTypeProvider'), { timeout: 60_000 });
    await checkSearch(page, page.getByRole('combobox', { name: 'Sample Type' }), 2, /^Serum$|^Sérum$/);
    const tests: { id: string; name: string; isActive: string }[] = ((await (await loaded).json()).tests ?? []);
    const active = tests.filter((t) => t.isActive === 'Y').length;
    test.skip(active === tests.length, `every test for this sample type is active (${tests.length}); the toggle cannot show a difference here`);
    const current = page.getByRole('combobox', { name: 'Current test' });
    const count = async (box: Locator) => { await box.click(); await box.fill(''); const n = (await options(page, box)).length; await page.keyboard.press('Escape'); return n; };
    const include = page.getByRole('checkbox', { name: 'Include inactive tests' });
    if (!(await include.isChecked())) await page.getByText('Include inactive tests').click();
    expect(await count(current), `with inactive tests: all ${tests.length}`).toBe(tests.length);
    await page.getByText('Include inactive tests').click();
    await expect(include).not.toBeChecked();
    expect(await count(current), `without inactive tests: the ${active} active ones`).toBe(active);
    await page.getByText('Cancel test for lab numbers selected, do not assign a new test').click();
    expect(await count(page.getByRole('combobox', { name: 'Replace with' })), `replacements: the ${active} active tests only`).toBe(active);
  });

  test('TC-1515-09 Batch reassignment: a bad replacement list is refused with 400 naming the field, nothing saved', async ({ page }) => {
    const csrf = await page.evaluate(() => localStorage.getItem('CSRF') || '');
    // The lists the screen always sends; only "replace" varies. No lab numbers, so nothing could change.
    const lists = { current: 'QA none', sampleType: 'Serum', changeNotStarted: [], noChangeNotStarted: [], changeTechReject: [], noChangeTechReject: [], changeBioReject: [], noChangeBioReject: [], changeNotValidated: [], noChangeNotValidated: [] };
    for (const [label, replace] of [['a string, not a list (the old toggle bug)', ''], ['a list holding a non-id', ['not-an-id']]] as const) {
      const r = await page.request.post(`${API}/BatchTestReassignment`, { data: { jsonWad: JSON.stringify({ ...lists, replace }) }, headers: { 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' } });
      const body = await r.text();
      expect(r.status(), `replace as ${label} is refused with 400 (was 200 with the form before #4922): ${body.slice(0, 300)}`).toBe(400);
      expect(body, 'the refusal names the field').toMatch(/jsonWad|replace/);
    }
  });

  test('TC-1515-10 Alerts: Alert Type filter is searchable', async ({ page }) => {
    await open(page, '/Alerts');
    expect(await checkSearch(page, page.getByRole('combobox', { name: 'Alert Type' })), 'an alert type was picked by typing').toBeTruthy();
  });

  test('TC-1515-11 System audit trail: Entity Type and User filters are searchable', async ({ page }) => {
    await open(page, '/qa/qms/audit-trail?type=system');
    expect(await checkSearch(page, page.getByRole('combobox', { name: 'Entity Type' })), 'an entity type was picked by typing').toBeTruthy();
    expect(await checkSearch(page, page.getByRole('combobox', { name: 'User' })), 'a user was picked by typing').toBeTruthy();
  });
});
