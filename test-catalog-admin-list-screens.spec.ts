/**
 * OpenELIS Global — Sample Type Editor and Panel Editor list screens.
 *
 * WHY THIS FILE EXISTS
 * Both routes were previously covered only by `tests/admin-route-census.spec.ts`, whose oracle is
 * deliberately shallow: it proves a route painted *something* and did not 500. It cannot tell a
 * working search from one that silently ignores its input, nor a filter that narrows from one
 * that returns the unfiltered list. Those are the failure modes that actually bite admins here.
 *
 * Lab Unit Management is NOT covered here. It already has five specs
 * (test-catalog-lab-unit-management{,-ui,-write,-visibility}.spec.ts and
 * test-catalog-orderability-semantics.spec.ts). Do not duplicate them.
 *
 * ROUTE NOTE, verified live on develop 5fe0ecb, 2026-09-11
 *   /MasterListsPage/SampleTypeEditor  -> "Sample Type Editor", a real list screen.
 *   /admin/SampleTypeManagement        -> "Manage Sample Types", a NAVIGATION HUB with zero
 *                                         tables (mainLen 146, 8 tile links).
 * `test-catalog-sample-type-management.spec.ts` visits the second one, but only to bootstrap a
 * CSRF token — it asserts purely against the REST API. It is not mis-pointed; it is not testing
 * a screen at all. Verified: all 7 of its cases pass against develop 5fe0ecb.
 *
 * COMPLEMENTARY COVERAGE
 * `test-catalog-sample-type-management.spec.ts` covers the sample-type API CONTRACT (create,
 * round-trip, duplicate handling) and never asserts on a screen. This file covers the rendered
 * list. Neither subsumes the other.
 *
 * SELECTOR NOTE
 * The Panel Editor search input carries a GENERATED Carbon id (`#search-input-22` on one load).
 * Never pin it. Both screens are addressed through their placeholder text instead.
 *
 * ORACLE DESIGN
 * Every filter case asserts BOTH directions: the matching row survives AND a known non-matching
 * row disappears. A filter that ignores its input passes a one-sided "row is still there" check,
 * which is precisely the soft-failure class this suite keeps rediscovering.
 *
 * These cases are READ-ONLY. Edit is opened and dismissed; nothing is saved.
 */
import { test, expect } from '@playwright/test';

const STYPE_ROUTE = '/MasterListsPage/SampleTypeEditor';
const PANEL_ROUTE = '/MasterListsPage/TestCatalogList?entity=panels';

type Row = string[];

/** Matches either screen's empty-state wording. See the trap note above before narrowing this. */
const EMPTY_STATE = /^\s*no\b.*\b(found|match|matches|matching)\b/i;

/**
 * Read data rows only.
 *
 * TWO TRAPS, both of which produced false failures on the first run of this file:
 *  1. Carbon renders the empty state as a REAL <tr> with one <td>. Counting it as data makes an
 *     empty result look like one surviving row, so a working filter reads as broken.
 *     The two screens word it DIFFERENTLY, which caught this file out twice:
 *       Sample Type Editor : "No sample types found matching your criteria"
 *       Panel Editor       : "No panels match the current filters."
 *     EMPTY_STATE below matches both. Widen it, do not add a second pattern.
 *  2. The Name cell stacks the name and its description in one <td>. Collapsing whitespace
 *     yields "Respiratory Swab Respiratory Swab", which matches no search term and no editor
 *     field. Cells are split on line breaks and the FIRST line is kept as the cell value.
 */
async function readRows(page: any): Promise<Row[]> {
  return page.$$eval('table tbody tr', (trs: any[]) =>
    trs
      .map(tr => [...tr.querySelectorAll('td')]
        .map((td: any) => ((td.innerText || '').split('\n')[0] || '').replace(/\s+/g, ' ').trim()))
      .filter(cells => !(cells.length <= 1 && /^\s*no\b.*\b(found|match|matches|matching)\b/i.test(cells[0] || ''))));
}

/** True when the table is showing Carbon's explicit empty state. */
async function hasEmptyState(page: any): Promise<boolean> {
  return page.$$eval('table tbody tr', (trs: any[]) =>
    trs.some(tr => /^\s*no\b.*\b(found|match|matches|matching)\b/i.test((tr as HTMLElement).innerText || '')));
}
async function readHeaders(page: any): Promise<string[]> {
  return page.$$eval('table th', (ths: any[]) =>
    ths.map(th => (th.innerText || '').replace(/\s+/g, ' ').trim()).filter(Boolean));
}
async function searchFor(page: any, placeholder: RegExp, term: string) {
  const box = page.getByPlaceholder(placeholder).first();
  await box.click();
  await box.fill('');
  await box.type(term, { delay: 30 });
  await page.waitForTimeout(1800);
}

test.describe('Sample Type Editor list', () => {
  test('TC-STYPE-01 — the list renders its documented columns and at least one row', async ({ page }) => {
    await page.goto(STYPE_ROUTE, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);
    const headers = await readHeaders(page);
    const rows = await readRows(page);
    console.log('TC-STYPE-01 headers=' + JSON.stringify(headers) + ' rows=' + rows.length);
    for (const col of ['Name', 'Sample Domain', 'Status', 'Tests', 'Actions']) {
      expect(headers, `column "${col}" missing; got ${JSON.stringify(headers)}`).toContain(col);
    }
    expect(rows.length, 'the sample type list rendered no rows').toBeGreaterThan(0);
  });

  test('TC-STYPE-02 — search narrows the list, and non-matching rows are removed', async ({ page }) => {
    await page.goto(STYPE_ROUTE, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);
    const before = await readRows(page);
    expect(before.length, 'no baseline rows to filter').toBeGreaterThan(1);
    const target = before[0][0];
    const other = before.find(r => r[0] && r[0] !== target)?.[0];
    expect(other, 'need two distinct sample type names to prove filtering').toBeTruthy();

    await searchFor(page, /search sample types/i, target);
    const after = await readRows(page);
    console.log(`TC-STYPE-02 term="${target}" before=${before.length} after=${after.length}`);
    const names = after.map(r => r[0]);
    expect(names.some(n => n.toLowerCase().includes(target.toLowerCase())),
      `the searched-for row "${target}" disappeared; got ${JSON.stringify(names)}`).toBe(true);
    expect(names.includes(other!),
      `search ignored its input: non-matching row "${other}" is still listed`).toBe(false);
  });

  test('TC-STYPE-03 — a search that matches nothing empties the table rather than showing everything', async ({ page }) => {
    await page.goto(STYPE_ROUTE, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);
    const before = await readRows(page);
    await searchFor(page, /search sample types/i, 'zzzz-no-such-sample-type-zzzz');
    const after = await readRows(page);
    const empty = await hasEmptyState(page);
    console.log(`TC-STYPE-03 before=${before.length} afterDataRows=${after.length} emptyState=${empty}`);
    expect(after.length,
      `a nonsense search left ${after.length} data row(s); the filter is not being applied`).toBe(0);
    expect(empty, 'the table emptied but showed no empty-state message').toBe(true);
  });

  test('TC-STYPE-04 — the domain filter narrows to the chosen domain only', async ({ page }) => {
    await page.goto(STYPE_ROUTE, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);
    const sel = page.locator('#domain-filter');
    const opts = await sel.locator('option').evaluateAll((os: any[]) =>
      os.map(o => ({ v: o.value, t: (o.text || '').trim() })).filter(o => o.v && o.v.trim()));
    console.log('TC-STYPE-04 domain options=' + JSON.stringify(opts));
    expect(opts.length, 'the domain filter offers no selectable option').toBeGreaterThan(0);

    const headers = await readHeaders(page);
    const domainIdx = headers.indexOf('Sample Domain');
    expect(domainIdx, 'no "Sample Domain" column to verify the filter against').toBeGreaterThanOrEqual(0);

    let checked = 0;
    for (const o of opts.slice(0, 3)) {
      await sel.selectOption(o.v);
      await page.waitForTimeout(1800);
      const rows = await readRows(page);
      if (rows.length === 0) { console.log(`TC-STYPE-04 domain=${o.t} -> 0 rows (skipped)`); continue; }
      const blank = rows.filter(r => !r[domainIdx]);
      expect(blank.length,
        `${blank.length} row(s) have an empty Sample Domain cell, so this comparison would pass vacuously`).toBe(0);
      const wrong = rows.filter(r => !new RegExp(o.t, 'i').test(r[domainIdx]));
      console.log(`TC-STYPE-04 domain=${o.t} rows=${rows.length} mismatched=${wrong.length}`);
      expect(wrong.map(r => r[domainIdx]),
        `domain filter "${o.t}" left rows of another domain in the table`).toEqual([]);
      checked++;
    }
    expect(checked, 'every domain option returned an empty list; the filter was never exercised').toBeGreaterThan(0);
  });

  test('TC-STYPE-05 — Edit opens an editor bound to the row that was clicked', async ({ page }) => {
    await page.goto(STYPE_ROUTE, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);
    const rows = await readRows(page);
    expect(rows.length, 'no rows to edit').toBeGreaterThan(0);
    const name = rows[0][0];

    await page.locator('table tbody tr').first().getByRole('button', { name: /^edit$/i }).click();
    await page.waitForTimeout(3000);

    const shown = await page.evaluate(() => {
      const vals = [...document.querySelectorAll('input,textarea')]
        .map((e: any) => (e.value || '').trim()).filter(Boolean);
      const body = (document.querySelector('main') || document.body).innerText;
      return { vals: vals.slice(0, 12), body: body.slice(0, 600) };
    });
    console.log(`TC-STYPE-05 clicked="${name}" values=${JSON.stringify(shown.vals)}`);
    const bound = shown.vals.some(v => v.toLowerCase() === name.toLowerCase())
      || new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(shown.body);
    expect(bound, `the editor does not show "${name}"; it may be bound to the wrong record`).toBe(true);
  });
});

test.describe('Panel Editor list', () => {
  test('TC-PANEL-01 — the list renders its documented columns and at least one row', async ({ page }) => {
    await page.goto(PANEL_ROUTE, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);
    const headers = await readHeaders(page);
    const rows = await readRows(page);
    console.log('TC-PANEL-01 headers=' + JSON.stringify(headers) + ' rows=' + rows.length);
    for (const col of ['Panel Name', 'LOINC', 'Tests', 'Domain', 'Sample Types (derived)', 'Status']) {
      expect(headers, `column "${col}" missing; got ${JSON.stringify(headers)}`).toContain(col);
    }
    expect(rows.length, 'the panel list rendered no rows').toBeGreaterThan(0);
  });

  test('TC-PANEL-02 — search by panel name narrows the list in both directions', async ({ page }) => {
    await page.goto(PANEL_ROUTE, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);
    const before = await readRows(page);
    expect(before.length, 'no baseline rows to filter').toBeGreaterThan(1);
    const target = before[0][0];
    const other = before.find(r => r[0] && r[0] !== target)?.[0];

    await searchFor(page, /search by name or loinc/i, target);
    const names = (await readRows(page)).map(r => r[0]);
    console.log(`TC-PANEL-02 term="${target}" -> ${JSON.stringify(names)}`);
    expect(names.some(n => n.toLowerCase().includes(target.toLowerCase())),
      `the searched-for panel "${target}" disappeared`).toBe(true);
    expect(names.includes(other!),
      `search ignored its input: non-matching panel "${other}" is still listed`).toBe(false);
  });

  test('TC-PANEL-03 — the search box honours its LOINC promise, not just the name', async ({ page }) => {
    await page.goto(PANEL_ROUTE, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);
    const headers = await readHeaders(page);
    const loincIdx = headers.indexOf('LOINC');
    const before = await readRows(page);
    const withLoinc = before.find(r => r[loincIdx] && /\d/.test(r[loincIdx]));
    test.skip(!withLoinc, 'no panel on this instance carries a LOINC code — data gap, not a defect');

    const code = withLoinc![loincIdx];
    await searchFor(page, /search by name or loinc/i, code);
    const rows = await readRows(page);
    console.log(`TC-PANEL-03 loinc="${code}" -> ${rows.length} row(s): ${JSON.stringify(rows.map(r => r[0]))}`);
    expect(rows.length,
      `searching the LOINC code "${code}" returned nothing; the placeholder promises LOINC search`).toBeGreaterThan(0);
    expect(rows.some(r => r[loincIdx] === code),
      `no returned row actually carries LOINC "${code}"`).toBe(true);
  });

  test('TC-PANEL-04 — a search that matches nothing empties the table', async ({ page }) => {
    await page.goto(PANEL_ROUTE, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);
    await searchFor(page, /search by name or loinc/i, 'zzzz-no-such-panel-zzzz');
    const after = await readRows(page);
    const empty = await hasEmptyState(page);
    console.log(`TC-PANEL-04 afterDataRows=${after.length} emptyState=${empty}`);
    expect(after.length,
      `a nonsense search left ${after.length} data row(s); the filter is not being applied`).toBe(0);
    expect(empty, 'the table emptied but showed no empty-state message').toBe(true);
  });

  test('TC-PANEL-05 — a panel with member tests derives at least one sample type', async ({ page }) => {
    await page.goto(PANEL_ROUTE, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);
    const headers = await readHeaders(page);
    const testsIdx = headers.indexOf('Tests');
    const derivedIdx = headers.indexOf('Sample Types (derived)');
    const rows = await readRows(page);

    const withTests = rows.filter(r => /^\d+$/.test(r[testsIdx] || '') && Number(r[testsIdx]) > 0);
    expect(withTests.length, 'no panel on this instance has any member tests').toBeGreaterThan(0);

    const blank = withTests.filter(r => !r[derivedIdx]);
    console.log(`TC-PANEL-05 panelsWithTests=${withTests.length} blankDerived=${blank.length}`);
    expect(blank.map(r => r[0]),
      'these panels have member tests but derive no sample type').toEqual([]);

    // Reported, not asserted: a panel spanning MORE THAN ONE sample type is the configuration
    // behind the OGC panel/sample-type leak (see tests/panel-sample-type-leak.spec.ts). Surfacing
    // it here makes the risky rows visible on every run without duplicating that spec's oracle.
    const multi = withTests.filter(r => /[,;]|\band\b/i.test(r[derivedIdx] || ''));
    console.log('TC-PANEL-05 MULTI-SAMPLE-TYPE PANELS = ' +
      JSON.stringify(multi.map(r => `${r[0]} -> ${r[derivedIdx]}`)));
  });

  test('TC-PANEL-06 — Edit opens an editor bound to the row that was clicked', async ({ page }) => {
    await page.goto(PANEL_ROUTE, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);
    const rows = await readRows(page);
    expect(rows.length, 'no rows to edit').toBeGreaterThan(0);
    const name = rows[0][0];

    await page.locator('table tbody tr').first().getByRole('button', { name: /^edit$/i }).click();
    await page.waitForTimeout(3000);

    const shown = await page.evaluate(() => {
      const vals = [...document.querySelectorAll('input,textarea')]
        .map((e: any) => (e.value || '').trim()).filter(Boolean);
      const body = (document.querySelector('main') || document.body).innerText;
      return { vals: vals.slice(0, 12), body: body.slice(0, 600) };
    });
    console.log(`TC-PANEL-06 clicked="${name}" values=${JSON.stringify(shown.vals)}`);
    const bound = shown.vals.some(v => v.toLowerCase() === name.toLowerCase())
      || new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(shown.body);
    expect(bound, `the editor does not show "${name}"; it may be bound to the wrong record`).toBe(true);
  });
});
