import { test, expect, Page, Locator } from '@playwright/test';

/**
 * OGC-1515 part 2 (OpenELIS-Global-2 #4925): pre-print, dictionary, shipment, reference lab
 * results, e-signature log and the settings tables are searched by typing. Plus the fixes the PR
 * names: a pre-print test ticked before its panel is listed once and can be unticked; dictionary
 * Add stays off until a category and Is Active are chosen; the shipment dashboard keeps the
 * facility filter once a box state is chosen; the unassigned samples facility route exists; the
 * e-signature log searches on the server, so paging, counts and exports follow the search.
 *
 * Read-only: nothing is saved (dictionary Add is cancelled; pre-print stops before printing).
 * Companion to tests/ogc-1515-searchable-lists.spec.ts (part 1).
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

/** Narrow a type-to-search combobox by a query from one of its options, then pick that option. */
async function searchAndPick(page: Page, box: Locator, prefer?: (o: string) => boolean): Promise<string> {
  await expect(box).toBeVisible({ timeout: 60_000 });
  await box.click();
  let all: string[] = [];
  await expect.poll(async () => (all = await optionsOf(page, box)).length, { timeout: 30_000 }).toBeGreaterThanOrEqual(2);
  const target = (prefer && all.find(prefer)) ?? all[Math.floor(all.length / 2)];
  const word = fold(target).split(/[^a-z0-9]+/).find((w) => w.length >= 3) ?? fold(target);
  const query = word.slice(0, 4).toUpperCase();
  await box.fill(query);
  const narrowed = await optionsOf(page, box);
  expect(narrowed.length, `"${query}" offers at least ${target}`).toBeGreaterThanOrEqual(1);
  for (const o of narrowed) expect(fold(o), `"${o}" matches "${query}"`).toContain(fold(query));
  await box.fill('zzqxjw');
  expect(await optionsOf(page, box), 'a query nothing matches offers nothing').toEqual([]);
  await box.fill(query);
  await page.locator(`[id="${await box.getAttribute('aria-controls')}"]`).getByRole('option').filter({ hasText: target }).first().click();
  await expect(box).toHaveValue(target);
  return target;
}

const rows = (page: Page) => page.getByRole('main').locator('tbody tr');

test.describe('OGC-1515 part 2: searchable lists (#4925)', () => {
  test.beforeEach(async ({ page }) => {
    await open(page, '/Dashboard');
  });

  for (const [id, route] of [
    ['TC-1515-13a', '/MasterListsPage/SiteInformationMenu'],
    ['TC-1515-13b', '/MasterListsPage/ResultConfigurationMenu'],
    ['TC-1515-13c', '/MasterListsPage/SampleEntryConfigurationMenu'],
  ] as const) {
    test(`${id} Settings table ${route.split('/').pop()}: "Search settings" narrows the rows`, async ({ page }) => {
      await open(page, route);
      const search = page.getByRole('searchbox', { name: 'Search settings' });
      await expect(rows(page).nth(1), 'the settings table loads').toBeVisible({ timeout: 60_000 });
      // The first cell is the row checkbox; the setting's name is in the second.
      const first = (await rows(page).nth(1).locator('td').nth(1).innerText()).trim();
      const word = fold(first).split(/[^a-z0-9]+/).find((w) => w.length >= 4) ?? fold(first).slice(0, 4);
      await search.fill(word.toUpperCase());
      await page.waitForTimeout(600);
      const shown = await rows(page).allInnerTexts();
      expect(shown.length, `"${word}" leaves at least the row it came from`).toBeGreaterThanOrEqual(1);
      for (const r of shown) expect(fold(r), `row matches "${word}"`).toContain(fold(word));
      await search.fill('zzqxjw');
      await page.waitForTimeout(600);
      expect(await rows(page).filter({ hasText: /\S/ }).filter({ hasNotText: /zzqxjw|nothing matches|no data|no result/i }).count(), 'a query nothing matches leaves no settings').toBe(0);
    });
  }

  test('TC-1515-14 E-signature log: the search runs on the server; counts and the CSV export follow it', async ({ page }) => {
    // Use the date range the screen itself asks for.
    const firstLoad = page.waitForResponse((r) => r.url().includes('/rest/esig/log?'), { timeout: 60_000 });
    await open(page, '/qa/qms/e-signature-log');
    const q = new URL((await firstLoad).url()).searchParams;
    const range = `fromDate=${encodeURIComponent(q.get('fromDate') ?? '')}&toDate=${encodeURIComponent(q.get('toDate') ?? '')}`;
    const all = await page.request.get(`${API}/esig/log?${range}&page=0&pageSize=25`);
    expect(all.status(), await all.text()).toBe(200);
    const allBody = await all.json();
    const totalOf = (b: any) => Number(b?.totalElements ?? b?.total ?? b?.totalCount ?? b?.count ?? (Array.isArray(b?.content) ? b.content.length : NaN));
    const allTotal = totalOf(allBody);
    test.skip(!(allTotal > 0), 'no signatures on this instance');
    const none = await page.request.get(`${API}/esig/log?${range}&text=no-such-signer-1515&page=0&pageSize=25`);
    expect(none.status()).toBe(200);
    expect(totalOf(await none.json()), 'a search nothing matches counts 0 on the server').toBe(0);
    const csvAll = (await (await page.request.get(`${API}/esig/log/export?${range}`)).text()).trim().split('\n').length;
    const csvNone = (await (await page.request.get(`${API}/esig/log/export?${range}&text=no-such-signer-1515`)).text()).trim().split('\n').length;
    expect(csvNone, 'the export follows the search (header only)').toBeLessThan(csvAll);
    expect(csvNone, 'the export follows the search (header only)').toBeLessThanOrEqual(1);
    // The screen: the search box asks the server.
    await expect(page.getByRole('combobox', { name: 'User' })).toBeVisible({ timeout: 60_000 });
    const asked = page.waitForResponse((r) => r.url().includes('/rest/esig/log?') && r.url().includes('text=no-such-signer-1515'), { timeout: 60_000 });
    await page.getByRole('searchbox', { name: 'Search the log' }).fill('no-such-signer-1515');
    const resp = await asked;
    expect(new URL(resp.url()).searchParams.get('page'), 'a new search goes back to the first page').toBe('0');
    await expect(page.getByText('Nothing matches "no-such-signer-1515".')).toBeVisible({ timeout: 20_000 });
  });

  test('TC-1515-15 Dictionary Add: category is searchable; Add stays off until a category and Is Active are chosen', async ({ page }) => {
    await open(page, '/MasterListsPage/DictionaryMenu');
    await page.getByRole('main').getByRole('button', { name: 'Add', exact: true }).click();
    const modal = page.locator('.cds--modal.is-visible');
    await expect(modal).toBeVisible();
    const add = modal.getByRole('button', { name: 'Add', exact: true });
    // Fill everything except the category and Is Active first: Add must stay off.
    await modal.locator('#dictEntry').fill('QA_AUTO_1104 unsaved');
    await modal.getByLabel(/Local Abbreviation/).fill('QA1104');
    await expect(add, 'Add is off with no category and no Is Active (it was on before #4925)').toBeDisabled();
    await searchAndPick(page, modal.getByRole('combobox', { name: /Dictionary Category/ }));
    const isActive = modal.locator('#isActive');
    if (!/^(Y|N|Yes|No|Oui|Non)$/i.test((await isActive.innerText()).trim())) {
      await expect(add, 'Add is still off before Is Active is chosen').toBeDisabled();
      await isActive.click();
      await page.locator('.cds--list-box__menu-item:visible').first().click();
    }
    await expect(add, 'Add turns on with a category and Is Active').toBeEnabled();
    await modal.getByRole('button', { name: 'Cancel' }).click();
    await expect(modal).toBeHidden();
  });

  test('TC-1515-16 Pre-print: tests and panels are searchable; a test ticked before its panel is listed once and stays when the panel is unticked', async ({ page }) => {
    await open(page, '/PrintBarcode');
    const loaded = page.waitForResponse((r) => r.url().includes('/rest/sample-type-tests?sampleType='), { timeout: 60_000 });
    await searchAndPick(page, page.getByRole('combobox', { name: 'Sample Type' }), (o) => /^S[eé]rum$/i.test(o));
    const data = await (await loaded).json();
    const tests: { id: string; name: string }[] = data.tests ?? [];
    const panels: { id: string; name: string; testIds: string }[] = data.panels ?? [];
    const pair = panels.map((p) => ({ p, t: tests.find((t) => p.testIds.split(',').map((x) => x.trim()).includes(t.id)) })).find((x) => x.t);
    test.skip(!pair, 'no panel on this sample type has a test in its list');
    const { p, t } = pair!;
    await expect(page.getByRole('searchbox', { name: 'Search tests' })).toBeVisible();
    await expect(page.getByRole('searchbox', { name: 'Search panels' })).toBeVisible();
    // Find the test by typing, tick it, then tick its panel.
    await page.getByRole('searchbox', { name: 'Search tests' }).fill(t.name.slice(0, 4).toUpperCase());
    await page.locator(`label[for="test_${t.id}"]`).click();
    await page.getByRole('searchbox', { name: 'Search panels' }).fill(p.name.slice(0, 4));
    await page.locator(`label[for="panel_${p.id}"]`).click();
    const testTags = page.locator('[data-testid="preprint-tests-selected"]').getByText(t.name, { exact: true });
    await expect(testTags, `${t.name} is listed once after its panel ${p.name} is ticked`).toHaveCount(1);
    // Unticking the panel keeps the hand-ticked test; unticking the test removes it.
    await page.locator(`label[for="panel_${p.id}"]`).click();
    await expect(testTags, 'the hand-ticked test stays when its panel is unticked').toHaveCount(1);
    await page.locator(`label[for="test_${t.id}"]`).click();
    await expect(testTags, 'the test can be unticked').toHaveCount(0);
  });

  test('TC-1515-17 Shipment dashboard: facility filter is searchable and still applies once a box state is chosen', async ({ page }) => {
    const boxesResp = page.waitForResponse((r) => /\/rest\/[^?]*box/i.test(r.url()) && r.request().method() === 'GET' && r.status() === 200, { timeout: 60_000 });
    await open(page, '/SampleShipment/boxes');
    const boxes: any[] = await (await boxesResp).json().catch(() => []);
    const facilityBox = page.getByRole('combobox', { name: 'Filter by Facility' }).first();
    await expect(facilityBox).toBeVisible({ timeout: 60_000 });
    // Prefer a facility that has boxes, so the filter has something to show.
    const withBoxes = new Set((Array.isArray(boxes) ? boxes : []).map((b) => String(b.destinationFacilityName ?? b.destinationFacility ?? '')));
    const facility = await searchAndPick(page, facilityBox, (o) => withBoxes.has(o));
    await page.waitForTimeout(800);
    const before = await rows(page).count();
    await page.getByRole('main').getByRole('combobox', { name: 'Filter by State' }).click();
    const menu = page.locator('.cds--list-box__menu-item:visible');
    const states = (await menu.allInnerTexts()).map((s) => s.trim()).filter((s) => s && !/^all$/i.test(s));
    test.skip(states.length === 0, 'no box states to choose');
    await menu.filter({ hasText: states[0] }).first().click();
    await page.waitForTimeout(800);
    await expect(facilityBox, 'the facility choice stays').toHaveValue(facility);
    const after = await rows(page).allInnerTexts();
    expect(after.length, 'choosing a state can only narrow what the facility shows').toBeLessThanOrEqual(Math.max(before, 0) || after.length);
    const other = (Array.isArray(boxes) ? boxes : []).filter((b) => String(b.destinationFacilityName ?? '') && String(b.destinationFacilityName) !== facility).map((b) => String(b.boxNumber ?? b.boxLabel ?? b.name ?? '')).filter(Boolean);
    for (const label of other.slice(0, 20)) expect(after.join('\n'), `box ${label} of another facility is not shown`).not.toContain(label);
  });

  test('TC-1515-18 Reference lab results: the lab filter is searchable', async ({ page }) => {
    await open(page, '/SampleShipment/reference-lab-results');
    expect(await searchAndPick(page, page.getByRole('combobox', { name: 'Reference Lab' })), 'a lab was picked by typing').toBeTruthy();
  });

  test('TC-1515-19 Unassigned samples: the facility filter route exists (was 404)', async ({ page }) => {
    const labs: { id: string; value: string }[] = await (await page.request.get(`${API}/displayList/REFERRAL_ORGANIZATIONS`)).json();
    expect(labs.length, 'referral laboratories exist').toBeGreaterThan(0);
    const r = await page.request.get(`${API}/unassigned-sample/items/by-facility/${labs[0].id}`);
    expect(r.status(), 'the route answers 200').toBe(200);
    expect(Array.isArray(await r.json()), 'it returns a list').toBe(true);
  });
});
