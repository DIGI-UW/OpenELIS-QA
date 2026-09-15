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
 * `test-catalog-sample-type-management.spec.ts` drives the second one. That is a different
 * screen from this one; if that spec was meant to exercise the list, it is pointed at a hub.
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

/**
 * Read one cell as the LIST of lines it contains.
 *
 * TRAP 4. Some cells stack Carbon <Tag> elements, one per line: the Panel Editor's
 * "Sample Types (derived)" column renders five tags for Bilan Biochimique. `readRows` keeps
 * only the first line, which is right for the Name cell (name over description) and WRONG
 * here — it makes a five-sample-type panel look like a one-sample-type panel. An earlier
 * version of TC-PANEL-05 used the first line and therefore could never detect a
 * multi-sample-type panel: it reported none while three existed.
 */
async function readCellLines(page: any, colIndex: number): Promise<string[][]> {
  return page.$$eval('table tbody tr', (trs: any[], i: number) =>
    trs
      .filter(tr => !(tr.querySelectorAll('td').length <= 1))
      .map(tr => {
        const td = tr.querySelectorAll('td')[i] as HTMLElement | undefined;
        return ((td?.innerText || '').split('\n').map(s => s.trim())
          .filter(Boolean).filter(s => s !== '\u2014' && s !== '-'));
      }), colIndex);
}

/** Carbon paginator caption, e.g. "1-20 of 90 items" -> 90. */
async function totalItems(page: any): Promise<number | null> {
  const txt = await page.locator('.cds--pagination').first().innerText().catch(() => '');
  const m = /of\s+(\d+)\s+items/i.exec(txt || '');
  return m ? Number(m[1]) : null;
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
    const unfilteredTotal = await totalItems(page);
    expect(unfilteredTotal, 'no paginator total on the unfiltered list').not.toBeNull();
    console.log(`TC-STYPE-04 unfilteredTotal=${unfilteredTotal}`);

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
      const total = await totalItems(page);
      console.log(`TC-STYPE-04 domain=${o.t} rows=${rows.length} totalItems=${total} mismatched=${wrong.length}`);
      // The list PAGINATES (90 items over 5 pages). Checking only the 20 visible rows cannot
      // distinguish a real filter from an unfiltered list that happens to be sorted by domain,
      // so the paginator's own total has to move too.
      expect(total, 'the paginator reports no total, so the filter cannot be verified beyond page 1').not.toBeNull();
      expect(total!, `selecting "${o.t}" did not reduce the total below the unfiltered ${unfilteredTotal}`)
        .toBeLessThan(unfilteredTotal!);
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

    // A panel spanning MORE THAN ONE sample type is the configuration behind the
    // panel/sample-type leak (tests/panel-sample-type-leak.spec.ts). Surface the risky rows on
    // every run, without duplicating that spec's oracle.
    //
    // This MUST read every line of the cell. The column stacks one Carbon <Tag> per sample type,
    // so a first-line-only read reports zero multi-type panels while several exist — which is
    // exactly what the first version of this case did.
    const derivedLines = await readCellLines(page, derivedIdx);
    const multi = rows
      .map((r, i) => ({ name: r[0], types: derivedLines[i] || [] }))
      .filter(x => x.types.length > 1);
    console.log('TC-PANEL-05 MULTI-SAMPLE-TYPE PANELS = ' +
      JSON.stringify(multi.map(x => `${x.name} -> ${x.types.join(', ')}`)));

    // Guard the detector itself: derivedLines must line up with the rows it is reported against.
    expect(derivedLines.length,
      'the derived-column reader returned a different row count than the table; the report above is unreliable')
      .toBe(rows.length);
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

/**
 * Panel Editor — the two dropdown filters.
 *
 * WHY THESE ARE SEPARATE FROM THE CASES ABOVE
 * The search box and the two dropdowns are different controls with different failure modes, and
 * the dropdowns were the last uncovered surface on this screen. Both are Carbon <Dropdown>s, NOT
 * native <select>s — `selectOption` does nothing on them. The Sample Type Editor's domain filter
 * IS a native select (`#domain-filter`), which is why TC-STYPE-04 looks nothing like TC-PANEL-08.
 *
 * SELECTOR NOTE, verified live on develop 5fe0ecb, 2026-09-11
 *   Wrapper ids are STABLE : #panel-filter-domain, #panel-filter-status
 *   Toggle button ids are GENERATED by downshift (`downshift-0-toggle-button`) and change between
 *   loads. Address the field through the wrapper: `#panel-filter-domain .cds--list-box__field`.
 *   Menu items are `.cds--list-box__menu-item` inside the same wrapper.
 *
 * CONTRACT FACT, verified live on develop 5fe0ecb, 2026-09-11
 *   The screen loads `GET /rest/test-catalog/panels?includeInactive=true` -> 26 (24 active + 2
 *   inactive). The SAME endpoint without the parameter returns 24, active only. Both are correct;
 *   the parameter is the difference. Do not re-derive "inactive panels are hidden" from the bare
 *   endpoint — the screen does not call it that way. See OGC-1206.
 */
test.describe('Panel Editor filters', () => {
  const DOMAIN_FILTER = '#panel-filter-domain';
  const STATUS_FILTER = '#panel-filter-status';

  /** Open a Carbon Dropdown and read the options it offers. */
  async function menuItems(page: any, wrapper: string): Promise<string[]> {
    await page.locator(`${wrapper} .cds--list-box__field`).click({ timeout: 10_000 });
    await page.waitForTimeout(700);
    const items = await page.$$eval(`${wrapper} .cds--list-box__menu-item`, (els: any[]) =>
      els.map(e => (e.innerText || '').replace(/\s+/g, ' ').trim()).filter(Boolean));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    return items;
  }

  /** Pick one option out of a Carbon Dropdown by its visible label. */
  async function choose(page: any, wrapper: string, label: string) {
    await page.locator(`${wrapper} .cds--list-box__field`).click({ timeout: 10_000 });
    await page.waitForTimeout(600);
    await page.locator(`${wrapper} .cds--list-box__menu-item`, { hasText: label }).first()
      .click({ timeout: 10_000 });
    await page.waitForTimeout(1600);
  }

  test('TC-PANEL-07 — the status filter partitions the list, and the two halves add back up', async ({ page }) => {
    await page.goto(PANEL_ROUTE, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);
    const headers = await readHeaders(page);
    const statusIdx = headers.indexOf('Status');
    expect(statusIdx, 'no Status column to verify the status filter against').toBeGreaterThanOrEqual(0);

    const options = await menuItems(page, STATUS_FILTER);
    console.log('TC-PANEL-07 status options=' + JSON.stringify(options));
    for (const want of ['All statuses', 'Active', 'Inactive']) {
      expect(options, `status filter is missing the "${want}" option`).toContain(want);
    }

    await choose(page, STATUS_FILTER, 'All statuses');
    const all = await readRows(page);
    await choose(page, STATUS_FILTER, 'Active');
    const active = await readRows(page);
    await choose(page, STATUS_FILTER, 'Inactive');
    const inactive = await readRows(page);
    console.log(`TC-PANEL-07 all=${all.length} active=${active.length} inactive=${inactive.length}`);

    // A dropdown that is wired to nothing returns the same list three times. The partition
    // identity below is what that failure cannot fake.
    expect(active.length, 'no active panels at all; the fixture data cannot exercise this filter').toBeGreaterThan(0);
    expect(active.every(r => /^active$/i.test(r[statusIdx])),
      `"Active" returned rows whose Status is not Active: ${JSON.stringify(active.map(r => r[statusIdx]))}`).toBe(true);
    expect(inactive.every(r => /^inactive$/i.test(r[statusIdx])),
      `"Inactive" returned rows whose Status is not Inactive: ${JSON.stringify(inactive.map(r => r[statusIdx]))}`).toBe(true);
    expect(active.length + inactive.length,
      `Active (${active.length}) + Inactive (${inactive.length}) does not equal All (${all.length}); ` +
      'either the filter drops rows or the list is showing something neither half claims').toBe(all.length);

    // Both directions, on names, so a filter that ignores its input cannot pass.
    const activeNames = new Set(active.map(r => r[0]));
    const leaked = inactive.filter(r => activeNames.has(r[0])).map(r => r[0]);
    expect(leaked, 'these panels are returned by BOTH halves of the status filter').toEqual([]);
  });

  test('TC-PANEL-08 — the domain filter is wired to the table, both when it matches and when it does not', async ({ page }) => {
    await page.goto(PANEL_ROUTE, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);
    const headers = await readHeaders(page);
    const domainIdx = headers.indexOf('Domain');
    expect(domainIdx, 'no Domain column to verify the domain filter against').toBeGreaterThanOrEqual(0);

    const options = await menuItems(page, DOMAIN_FILTER);
    console.log('TC-PANEL-08 domain options=' + JSON.stringify(options));
    for (const want of ['All domains', 'Clinical', 'Environmental', 'Vector']) {
      expect(options, `domain filter is missing the "${want}" option`).toContain(want);
    }

    await choose(page, DOMAIN_FILTER, 'All domains');
    const all = await readRows(page);
    expect(all.length, 'no baseline rows to filter').toBeGreaterThan(0);

    let matched = 0;
    let emptied = 0;
    for (const opt of options.filter(o => o !== 'All domains')) {
      await choose(page, DOMAIN_FILTER, opt);
      const rows = await readRows(page);
      const empty = await hasEmptyState(page);
      console.log(`TC-PANEL-08 domain="${opt}" rows=${rows.length} emptyState=${empty}`);
      if (rows.length > 0) {
        // Every returned row must actually be of the chosen domain.
        const wrong = rows.filter(r => !new RegExp(`^${opt}$`, 'i').test(r[domainIdx]));
        expect(wrong.map(r => `${r[0]} (${r[domainIdx]})`),
          `domain filter "${opt}" left rows of another domain in the table`).toEqual([]);
        matched++;
      } else {
        // Zero rows is only acceptable as an EXPLICIT empty state. A blank table with no message
        // is the screen failing to render, not the filter matching nothing.
        expect(empty,
          `domain "${opt}" produced an empty table with no empty-state message`).toBe(true);
        emptied++;
      }
    }
    // Both arms have to be exercised for this case to mean anything: at least one option that
    // returns rows (proves the filter does not blank everything) and the option set as a whole
    // has to have been walked (proves the control responds at all).
    expect(matched, 'no domain option returned any row; the filter blanks the table whatever you pick')
      .toBeGreaterThan(0);
    expect(matched + emptied, 'no domain option was exercised').toBe(options.length - 1);
  });

  test('TC-PANEL-09 — a panel is filed under the domain of the sample types its tests use', async ({ page }) => {
    // [FLIP-WHEN-FIXED] OGC-1209.
    // CURRENT BEHAVIOUR on develop 5fe0ecb: every panel carries domain CLINICAL, including the
    // twenty-one whose only member sample type is a VECTOR one (Mosquito, Fly, Flea, Rodent).
    // The Panel Editor's Domain dropdown therefore offers Environmental and Vector options that
    // can never match anything.
    //
    // This is marked test.fail() ON PURPOSE: the assertion states the SPEC, not the bug. The
    // suite stays green while OGC-1209 is open and turns RED the moment the domain is derived
    // (or set) correctly — at which point delete the test.fail() line, not the assertion.
    test.fail();

    await page.goto(PANEL_ROUTE, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);

    const report = await page.evaluate(async () => {
      const base = '/api/OpenELIS-Global/rest';
      const types = await (await fetch(`${base}/test-catalog/sample-types`, { credentials: 'include' })).json();
      const domainOf: Record<string, string> = {};
      for (const t of types) domainOf[t.name] = t.domain;
      const panels = await (await fetch(`${base}/test-catalog/panels?includeInactive=true`, { credentials: 'include' })).json();
      const withTypes = panels.filter((p: any) => (p.sampleTypes || []).length > 0);
      const mismatched = withTypes
        .map((p: any) => ({
          name: p.name,
          panelDomain: p.domain,
          memberDomains: [...new Set(p.sampleTypes.map((s: string) => domainOf[s]).filter(Boolean))],
        }))
        .filter((p: any) => p.memberDomains.length > 0 && !p.memberDomains.includes(p.panelDomain));
      return {
        panelCount: panels.length,
        withTypes: withTypes.length,
        mismatched,
        typeDomains: types.reduce((a: any, t: any) => (a[t.domain] = (a[t.domain] || 0) + 1, a), {}),
      };
    });

    console.log('TC-PANEL-09 sampleTypeDomains=' + JSON.stringify(report.typeDomains));
    console.log(`TC-PANEL-09 panels=${report.panelCount} withSampleTypes=${report.withTypes} mismatched=${report.mismatched.length}`);
    console.log('TC-PANEL-09 ' + JSON.stringify(report.mismatched.slice(0, 8), null, 1));

    // Guard the oracle: if no panel has any member sample type, the check below would pass
    // vacuously and this case would silently stop testing anything.
    expect(report.withTypes, 'no panel has any member sample type; this case would pass vacuously')
      .toBeGreaterThan(0);

    expect(report.mismatched.map((m: any) => `${m.name}: panel=${m.panelDomain} members=${m.memberDomains.join('/')}`),
      'these panels are filed under a domain none of their member sample types belong to').toEqual([]);
  });
});
