import { test, expect, Page } from '@playwright/test';

/**
 * UX heuristic H12: search, not manual select.
 *
 * Casey's rule (19 Oct 2026): "there should always be a search option rather than a manual select."
 * Working reading: any list whose contents come from site data (tests, panels, sample types, labs,
 * facilities, providers, units, dictionary categories) gets type-to-filter, whatever its length;
 * short fixed enums can stay plain dropdowns. Time pickers (hour, minute) are ignored.
 *
 * Tickets: OGC-1514 (Modify Order add-test list, Mozzy), OGC-1515 (app-wide sweep, 12 screens).
 * Source sweep: claude/qa-session-2026-10-19-search-not-select.md (testing.openelis-global.org).
 *
 * GUARD tests hold screens that already do it right. TRIPWIRE tests assert the rule and FAIL until
 * the screen gets a search; flip each to a guard when it passes 3 of 3.
 *
 * Run: BASE=https://testing.openelis-global.org npx playwright test --config=ux-h12.config.ts
 * Threshold: H12_MIN (default 10) items before a list without search is reported.
 *
 * STATUS (4 Nov 2026): every row is a guard. OGC-1515 part 1 (#4922, testing a1e0fcf9) flipped
 * rows 2, 3, 5, 9, 10 and 11; part 2 (#4925, testing 0dca62f6, deployed 3 Nov 23:52 UTC) flipped
 * rows 4, 6, 7, 8 and 12 (2 of 2 runs each). Companions: tests/ogc-1515-searchable-lists.spec.ts
 * and tests/ogc-1515-part2.spec.ts prove the new search boxes work.
 */

const MIN = Number(process.env.H12_MIN ?? '10');
const API = '/api/OpenELIS-Global/rest';

type Finding = { kind: string; label: string; size: number | string };

/** Runs in the page: every list of MIN+ items in <main> that has no search or filter box. */
async function probe(page: Page, min = MIN): Promise<Finding[]> {
  return page.evaluate(async (min) => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const labelOf = (el: Element): string => {
      const id = (el as HTMLElement).id;
      const l = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
      const w = el.closest('.cds--form-item,.cds--dropdown__wrapper,.cds--list-box__wrapper,.cds--select');
      const wl = w?.querySelector('label');
      return ((l as HTMLElement)?.innerText || el.getAttribute('aria-label') || (wl as HTMLElement)?.innerText || (el as HTMLSelectElement).name || id || '').trim().slice(0, 60);
    };
    const isTime = (s: string) => /\b(time|hour|minute|hh|mm)\b/i.test(s) || /_minute|_hour/i.test(s);
    const SEARCH_SEL = 'input[type=search], .cds--search input, input[placeholder*="earch" i], input[placeholder*="ilter" i], .cds--combo-box input';
    const FIXED_ENUM = /^(filter by state|state|status|priority|action|subject type|severity)\b/i;
    const hasSearch = (root: Element | null) => !!root?.querySelector(SEARCH_SEL);
    const out: { kind: string; label: string; size: number | string }[] = [];
    const main = document.querySelector('main') ?? document.body;

    // 1. Native selects.
    main.querySelectorAll('select').forEach((s) => {
      if (s.closest('.cds--pagination')) return; // page pickers are not data lists
      const label = labelOf(s);
      const n = (s as HTMLSelectElement).options.length;
      if (n >= min && !isTime(label) && !isTime(s.id)) out.push({ kind: 'native select', label, size: n });
    });

    // 2. Carbon Dropdown / MultiSelect that are not filterable (opened to count, then closed).
    for (const d of Array.from(main.querySelectorAll('.cds--dropdown:not(.cds--combo-box), .cds--multi-select:not(.cds--multi-select--filterable)'))) {
      const btn = d.querySelector('button, [role=combobox]') as HTMLElement | null;
      if (!btn || (btn as HTMLButtonElement).disabled) continue;
      btn.click(); await sleep(300);
      const n = d.querySelectorAll('.cds--list-box__menu-item').length;
      btn.click(); await sleep(100);
      // Short fixed enums may stay plain dropdowns (H12 rule); these labels are fixed lists, not site data.
      if (n >= min && !FIXED_ENUM.test(labelOf(d))) out.push({ kind: d.classList.contains('cds--multi-select') ? 'Carbon MultiSelect' : 'Carbon Dropdown', label: labelOf(d), size: n });
    }

    // 3. Checkbox lists: a container holding MIN+ checkboxes with no search box near it.
    const seen = new Set<Element>();
    main.querySelectorAll('input[type=checkbox]').forEach((cb) => {
      let box: Element | null = cb.parentElement;
      for (let i = 0; i < 6 && box; i++) {
        if (box.querySelectorAll('input[type=checkbox]').length >= min) break;
        box = box.parentElement;
      }
      if (!box || seen.has(box) || box.tagName === 'TABLE' || box.closest('table')) return;
      seen.add(box);
      if (!hasSearch(box) && !hasSearch(box.parentElement)) {
        const h = box.previousElementSibling as HTMLElement | null;
        out.push({ kind: 'checkbox list', label: (h?.innerText || '').trim().slice(0, 60), size: box.querySelectorAll('input[type=checkbox]').length });
      }
    });

    // 4. Paged or long tables with no search over them.
    main.querySelectorAll('table').forEach((t) => {
      const wrap = t.closest('.cds--data-table-container') ?? t.parentElement?.parentElement ?? t;
      const total = Number((((wrap.parentElement ?? wrap) as HTMLElement).innerText.match(/of (\d+) items/) || [])[1] ?? t.querySelectorAll('tbody tr').length);
      // A search box anywhere above the table in <main> counts (the dictionary and settings tables put it there).
      const searchAbove = Array.from(main.querySelectorAll(SEARCH_SEL)).some((inp) => !!(inp.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING));
      if (total >= min && !hasSearch(wrap) && !hasSearch(wrap.parentElement) && !searchAbove) {
        const heads = Array.from(t.querySelectorAll('th')).map((x) => (x as HTMLElement).innerText.trim()).filter(Boolean).slice(0, 3).join(' / ');
        out.push({ kind: 'table', label: heads, size: total });
      }
    });
    return out;
  }, min);
}

async function open(page: Page, route: string) {
  await page.goto(route);
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1500);
}

/** Route of a menu entry whose actionURL contains `needle` (report pages carry query strings). */
async function menuRoute(page: Page, needle: string): Promise<string> {
  const r = await page.request.get(`${API}/menu`);
  const urls: string[] = [];
  const walk = (n: any) => (Array.isArray(n) ? n : [n]).forEach((x: any) => { if (x?.menu?.actionURL) urls.push(x.menu.actionURL); if (x?.childMenus) walk(x.childMenus); });
  walk(await r.json());
  const hit = urls.find((u) => u.includes(needle));
  expect(hit, `menu entry containing ${needle}`).toBeTruthy();
  return hit!;
}

/** Choose an option in a type-to-search combobox (OGC-1515 SearchableSelect). */
async function pickCombo(page: Page, name: string, optionText: string) {
  const box = page.getByRole('combobox', { name });
  await box.click();
  await box.fill(optionText.slice(0, 3));
  await page.locator(`[id="${await box.getAttribute('aria-controls')}"]`).getByRole('option', { name: optionText, exact: true }).first().click();
  await page.waitForTimeout(1500);
}

async function pickNative(page: Page, optionText: string) {
  const sel = page.locator('main select').filter({ has: page.locator(`option`, { hasText: new RegExp(`^${optionText}$`) }) }).first();
  await sel.selectOption({ label: optionText });
  await page.waitForTimeout(1500);
}

const report = (f: Finding[]) => JSON.stringify(f, null, 1);

test.describe('H12 search, not manual select', () => {
  // ---------- guards: screens that already do it right ----------

  test('TC-H12-G01 GUARD Batch Order Entry: tests and panels have a search box', async ({ page }) => {
    await open(page, '/SampleBatchEntrySetup');
    await page.locator('main select').first().selectOption({ label: 'Routine' });
    await page.waitForTimeout(1500);
    await pickNative(page, 'Serum');
    await expect(page.getByPlaceholder(/Search tests/i)).toBeVisible();
    await expect(page.getByPlaceholder(/Search panels/i)).toBeVisible();
  });

  test('TC-H12-G02 GUARD Modify Order, new sample: test and panel search present', async ({ page }) => {
    const acc = await anyOpenAccession(page);
    await open(page, `/ModifyOrder?accessionNumber=${acc}`);
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.locator('#tests_search_0')).toBeAttached();
    await expect(page.locator('#panels_search_0')).toBeAttached();
  });

  // ---------- tripwires ----------

  test('TC-H12-01 GUARD OGC-1514 Modify Order: adding a test to the existing sample has a search', async ({ page }) => {
    // GUARD since 2026-10-20 (OGC-1514, OpenELIS-Global-2 #4769; passes on develop images 2026-10-20 12:11 UTC).
    // Was a tripwire: Available Tests was a paged checkbox table (5 per page, no search, not alphabetical).
    const acc = await anyOpenAccession(page);
    await open(page, `/ModifyOrder?accessionNumber=${acc}`);
    await page.getByRole('button', { name: 'Next' }).click();
    await page.waitForTimeout(2000);
    const search = page.locator('input[id^="existing_tests_search_"]').first();
    await expect(search, 'test search over the existing sample').toBeVisible();
    await expect(page.locator('input[id^="existing_panels_search_"]').first(), 'panel search over the existing sample').toBeVisible();
    // The full list under the search is alphabetical (it was in catalogue order before #4769).
    const names = (await page.locator('label[for^="existing_test_"] .cds--checkbox-label-text').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
    expect(names.length, 'the existing sample offers tests').toBeGreaterThan(1);
    const sorted = [...names].sort((x, y) => x.localeCompare(y));
    expect(names, 'available tests are in alphabetical order').toEqual(sorted);
  });

  // guard: true = fixed and held. false = a tripwire (test.fail) until its fix is on testing.
  const SWEEP: { id: string; route: string | (() => Promise<string>) | null; menuNeedle?: string; prep?: (p: Page) => Promise<void>; ticket: string; guard: boolean }[] = [
    { id: 'TC-H12-02', route: '/WorkPlanByTest', ticket: 'OGC-1515 row 2 (Test, 170)', guard: true },
    { id: 'TC-H12-03', route: null, menuNeedle: 'report=activityReportByTest', ticket: 'OGC-1515 row 3 (Search By, 170)', guard: true },
    { id: 'TC-H12-04', route: '/PrintBarcode', prep: (p) => pickCombo(p, 'Sample Type', 'Serum'), ticket: 'OGC-1515 row 4 (tests 25 for Serum)', guard: true },
    { id: 'TC-H12-05', route: '/MasterListsPage/batchTestReassignment', prep: (p) => pickCombo(p, 'Sample Type', 'Serum'), ticket: 'OGC-1515 row 5 (Sample Type 19, Test 26)', guard: true },
    { id: 'TC-H12-06', route: '/MasterListsPage/DictionaryMenu', prep: async (p) => { await p.getByRole('button', { name: 'Add', exact: true }).click(); await p.waitForTimeout(800); }, ticket: 'OGC-1515 row 6 (Dictionary Category, 111)', guard: true },
    { id: 'TC-H12-07', route: '/SampleShipment', ticket: 'OGC-1515 row 7 (Filter by Facility, 45)', guard: true },
    { id: 'TC-H12-08', route: '/SampleShipment/reference-lab-results', ticket: 'OGC-1515 row 8 (Reference Lab, 45)', guard: true },
    { id: 'TC-H12-09', route: null, menuNeedle: 'report=referredOut', ticket: 'OGC-1515 row 9 (Referral Center or Laboratory, 45)', guard: true },
    { id: 'TC-H12-11a', route: '/Alerts', ticket: 'OGC-1515 row 11 (Alert Type, 19)', guard: true },
    { id: 'TC-H12-11b', route: '/qa/qms/audit-trail', ticket: 'OGC-1515 row 11 (Entity Type, 20)', guard: true },
    { id: 'TC-H12-12a', route: '/MasterListsPage/SiteInformationMenu', ticket: 'OGC-1515 row 12 (36 settings)', guard: true },
    { id: 'TC-H12-12b', route: '/MasterListsPage/ResultConfigurationMenu', ticket: 'OGC-1515 row 12 (27 settings)', guard: true },
    { id: 'TC-H12-12c', route: '/MasterListsPage/SampleEntryConfigurationMenu', ticket: 'OGC-1515 row 12 (24 settings)', guard: true },
    { id: 'TC-H12-12d', route: '/qa/qms/e-signature-log', ticket: 'OGC-1515 row 12 (40 log rows)', guard: true },
  ];

  for (const s of SWEEP) {
    test(`${s.id} ${s.guard ? 'GUARD' : 'TRIPWIRE'} ${s.ticket}: no data-driven list without search`, async ({ page }) => {
      // Tripwire: fails today (part 2 not on testing); flip guard to true when it passes 2 of 2.
      test.fail(!s.guard, `${s.id}: waiting for OGC-1515 part 2 (#4925) on testing`);
      const route = s.route ?? (await (async () => { await open(page, '/Dashboard'); return menuRoute(page, s.menuNeedle!); })());
      await open(page, route as string);
      if (s.prep) await s.prep(page);
      const f = await probe(page);
      expect(f, `lists of ${MIN}+ items with no search on ${route}:\n${report(f)}`).toEqual([]);
    });
  }

  test('TC-H12-10 GUARD OGC-1515 row 10 Modify Order Add Sample: unit of measure is searchable', async ({ page }) => {
    const acc = await anyOpenAccession(page);
    await open(page, `/ModifyOrder?accessionNumber=${acc}`);
    await page.getByRole('button', { name: 'Next' }).click();
    await page.waitForTimeout(2000);
    const f = (await probe(page)).filter((x) => /unit of measure/i.test(x.label));
    expect(f, report(f)).toEqual([]);
  });
});

/** An order still in progress, so Modify Order opens with an existing sample (no data is changed). */
async function anyOpenAccession(page: Page): Promise<string> {
  if (process.env.H12_ACCESSION) return process.env.H12_ACCESSION;
  await page.goto('/Dashboard');
  const r = await page.request.get(`${API}/home-dashboard/ORDERS_IN_PROGRESS`);
  const j = await r.json();
  const acc = j?.displayItems?.[0]?.labNumber;
  expect(acc, 'an order in progress on this instance').toBeTruthy();
  return acc;
}
