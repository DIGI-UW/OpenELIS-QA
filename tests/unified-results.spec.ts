/**
 * Unified Results worklist (/Results) -- OGC-1020 R1.
 *
 * WHY THIS FILE EXISTS
 * The Results area was rewritten. Six tests in results-entry.spec.ts drove the
 * OLD five-item Results submenu -- By Patient, By Order, By Range of Order
 * Numbers, Order Programs, and a From/To accession page. With site information
 * flag resultsEntryUnifiedRoute = true those menu items are HIDDEN and every
 * legacy results route 302s to /Results, so those six were asserting against
 * screens that no longer exist as separate screens. They are retired; this is
 * their replacement.
 *
 * EVERY SELECTOR AND BEHAVIOUR BELOW WAS READ OFF THE LIVE PAGE on 2026-08-26
 * (testing 3.2.2.0), not taken from the FRS. That matters, because the build
 * has moved past the spec in two ways worth knowing:
 *
 *   - The FRS and the v4 mockup describe a general search box placeholdered
 *     -Search or scan barcode - lab number, subject ID, test name...- plus
 *     Date From / Date To and a Load Results button. The live page has a
 *     single search input labelled AND placeholdered -Search by lab number-,
 *     one -Test date- picker, and no Load Results button: it loads on change.
 *   - The FRS says no element ids. The live build has stable ones:
 *     unifiedResultsSearch, unifiedResultsLabUnit, unifiedResultsDate.
 *     Prefer those over Carbon class names, which churn between releases.
 *
 * There is no DOMAIN filter control. Domain is derived from the Lab Unit
 * (FR-M1) and all 10 units on this instance report CLINICAL, so FR-M2/M3/M4
 * (Environmental / Vector rendering) are NOT testable here -- deferred D-1 in
 * qa-spec-delta-OGC-1020-R1-20260813.md. Do not report them as FAIL.
 *
 * The deeper behaviour -- edit-state machine, precision guard, stale-save,
 * chip refresh, e-signature meaning, multi-component -- is already covered by
 * results-r1-spec-delta.spec.ts and results-page-deep-delta.spec.ts. This file
 * deliberately stops at the worklist surface so the two do not overlap.
 *
 *   npx playwright test --config=all-tc.config.ts --project=unified-results
 */

import { test, expect, Page } from '@playwright/test';

const API = '/api/OpenELIS-Global/rest';

const SEARCH = '#unifiedResultsSearch';
const LAB_UNIT = '#unifiedResultsLabUnit';
const TEST_DATE = '#unifiedResultsDate';
const ROWS = 'table tbody tr';

/** The 11 columns the live build renders, in order. Index 0 is the expand toggle. */
const COLUMNS = [
  '',
  'Sample / Patient',
  'Test',
  'Method',
  'Analyzer',
  'Sample',
  'Reference Range',
  'Result',
  'Status',
  'Flag',
  'Actions',
];

/**
 * Every test here is meaningless on a legacy instance, where /Results just
 * redirects to /result. Skip loudly rather than fail obscurely.
 */
async function requireUnifiedRoute(page: Page): Promise<void> {
  const res = await page.request.get(API + '/configuration-properties');
  expect(res.status(), 'configuration-properties must answer 200').toBe(200);
  const cfg = (await res.json()) as Record<string, string>;
  test.skip(
    String(cfg.RESULTS_ENTRY_UNIFIED_ROUTE) !== 'true',
    'resultsEntryUnifiedRoute is off -- this instance still serves the legacy results pages',
  );
}

/** Find a lab number that actually has rows, so the search test is not fixture-bound. */
async function anAccessionWithResults(page: Page): Promise<string | null> {
  const units = await page.request
    .get(API + '/user-test-sections/RESULTS')
    .then((r) => (r.status() === 200 ? r.json() : []))
    .catch(() => []);
  for (const u of (Array.isArray(units) ? units : []).slice(0, 12)) {
    const id = String((u as any).id ?? '');
    if (!id) continue;
    const r = await page.request.get(
      API + '/LogbookResults?testSectionId=' + id + '&doRange=false&finished=false',
    );
    if (r.status() !== 200) continue;
    const body: any = await r.json().catch(() => ({}));
    const hit = ((body.testResult ?? []) as Array<any>).find((x) => x.accessionNumber);
    if (hit) return String(hit.accessionNumber);
  }
  return null;
}

test.describe('unified Results worklist', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/Results');
    await requireUnifiedRoute(page);
    await page.waitForTimeout(4000);
  });

  test('UR-01: the toolbar offers search by lab number, Lab Unit and Test date', async ({ page }) => {
    await expect(page.locator(SEARCH), 'the lab-number search input').toBeVisible();
    await expect(page.locator(LAB_UNIT), 'the Lab Unit picker').toBeVisible();
    await expect(page.locator(TEST_DATE), 'the Test date picker').toBeVisible();

    // The label and the placeholder say the same thing on this build. Assert the
    // placeholder: it is what an operator reads before they type.
    await expect(page.locator(SEARCH)).toHaveAttribute('placeholder', /search by lab number/i);

    const units = await page.locator(LAB_UNIT + ' option').allTextContents();
    expect(
      units.filter((u) => u.trim()).length,
      'the Lab Unit picker must offer the instance lab units',
    ).toBeGreaterThan(1);
  });

  test('UR-02: the worklist renders all 11 columns in order', async ({ page }) => {
    const headers = await page.locator('table thead th').allTextContents();
    expect(headers.map((h) => h.trim())).toEqual(COLUMNS);
  });

  test('UR-03: nothing loads until a lab number or a Lab Unit is supplied', async ({ page }) => {
    // The worklist is Lab-Unit-driven (FR-M1). An unfiltered /Results must not
    // dump every pending analysis in the lab.
    expect(await page.locator(ROWS).count(), 'a bare /Results must start empty').toBe(0);
  });

  test('UR-04: a lab number typed into search and submitted loads that order', async ({ page }) => {
    const acc = await anAccessionWithResults(page);
    test.skip(!acc, 'no resulted work on this instance to search for');

    await page.locator(SEARCH).fill(acc as string);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(6000);

    expect(await page.locator(ROWS).count(), 'the searched order must return rows').toBeGreaterThan(0);

    // Deep-linkable: the search writes itself into the URL so the view is shareable.
    expect(new URL(page.url()).searchParams.get('accessionNumber')).toBe(acc);

    const first = (await page.locator(ROWS).first().textContent()) ?? '';
    expect(first, 'the row must belong to the searched order').toContain(acc as string);
  });

  test('UR-05: choosing a Lab Unit loads its worklist and reconciles the status chips', async ({ page }) => {
    const value = await page.locator(LAB_UNIT + ' option').nth(1).getAttribute('value');
    expect(value, 'the Lab Unit picker must carry option values').toBeTruthy();

    await page.locator(LAB_UNIT).selectOption(value as string);
    await page.waitForTimeout(8000);

    expect(await page.locator(ROWS).count(), 'the chosen unit must load its worklist').toBeGreaterThan(0);
    expect(new URL(page.url()).searchParams.get('testSectionId')).toBe(value);

    // Chips read -All (100)-, -Not started (95)-, -Accepted by technician (5)-.
    // The non-All counts must sum to All, or a technician is looking at a
    // worklist that hides work from them.
    //
    // Read the chips AFTER the rows have settled. W-2 in the QA delta doc was
    // withdrawn precisely because a read taken ~2.5s after navigation caught a
    // mid-render state and produced a false 24 + 2 != 29.
    const chips = (await page.locator('.cds--tag, .cds--content-switcher-btn').allTextContents())
      .map((c) => c.trim())
      .filter((c) => /[(][0-9]+[)]/.test(c));
    test.skip(chips.length < 2, 'this unit renders no status chips to reconcile');

    const countOf = (chip: string): number => Number((chip.match(/[(]([0-9]+)[)]/) ?? [])[1] ?? 0);
    const all = chips.find((c) => /^all /i.test(c));
    expect(all, 'there must be an All chip').toBeTruthy();

    const parts = chips.filter((c) => c !== all).reduce((n, c) => n + countOf(c), 0);
    expect(parts, 'the status chips must sum to All: ' + chips.join(' | ')).toBe(countOf(all as string));
  });
});
