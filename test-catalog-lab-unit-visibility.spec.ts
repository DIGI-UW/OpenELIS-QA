/**
 * OpenELIS Global — lab unit visibility: choosers vs viewers, and the grandfathered-select
 * data-loss guard. (OGC-189 deactivation cascade.)
 *
 * THE DESIGN THIS PROTECTS (Casey, 2026-09-02)
 * --------------------------------------------
 * Deactivating a lab unit should declutter without stranding anything. The rule agreed is that
 * list visibility follows the CONTROL'S PURPOSE, not the unit's status:
 *
 *   CHOOSER controls — "pick a lab unit for this": a test's Basic Info lab unit, reassign
 *     destinations, order routing. These should filter on isActive. Inactive units vanish.
 *     This is where the decluttering comes from.
 *
 *   VIEWER controls — "filter what I'm looking at": the Results worklist, Workplan, by-unit
 *     reports, patient history. These should show `isActive OR hasContent`, so an inactive unit
 *     stays reachable for exactly as long as it still holds tests or in-flight analyses, then
 *     drops out on its own. That is what stops work being orphaned.
 *
 * Nothing is ever orphaned in the DATA sense — every test has exactly one lab unit and every
 * analysis records its unit. "Orphaned" here means unreachable through the UI, which makes this
 * a picker-population problem rather than a data-model one.
 *
 * WHAT IS TRUE TODAY (measured 2026-09-02, testing.openelis-global.org v3.2.2.0)
 * -----------------------------------------------------------------------------
 * The filtering is applied to exactly the wrong half — inverted from the design above:
 *
 *   CHOOSER  GET /rest/test-catalog/lab-units  -> 35 entries, 20 of them INACTIVE units.
 *                                                 No filtering at all.
 *   VIEWER   #unifiedResultsLabUnit on /Results -> 13 options for 34 units: the 12 ACTIVE ones
 *                                                 plus a blank. All 22 inactive units hidden.
 *
 * So today a user can assign a test INTO a switched-off unit from the test editor, but cannot
 * see that unit's work on the results worklist. Both halves need to move, in opposite
 * directions, and G-1/G-2 below flip when they do.
 *
 * G-3 IS THE ONE THAT PREVENTS DATA LOSS
 * --------------------------------------
 * When the chooser starts filtering out inactive units, a test already assigned to an inactive
 * unit will render with a blank selection — and the next save writes that blank back, silently
 * destroying the assignment. The fix is the grandfathered-select pattern: the current value
 * stays present and displayed even when it is no longer offered as a NEW choice.
 *
 * This is not hypothetical. The identical shape shipped in Modify Order and is filed as
 * OGC-1191: the Lab Number input is bound to a property that renders empty, and Submit writes
 * the emptiness back. Same cause, same class of loss. G-3 is the regression that catches it
 * here before it ships.
 *
 * Run:
 *   BASE=https://testing.openelis-global.org \
 *   LU_WRITE=1 npx playwright test --config=all-tc.config.ts --project=test-catalog \
 *     test-catalog-lab-unit-visibility.spec.ts
 */

import { test, expect, Page } from '@playwright/test';

const BASE = process.env.BASE || 'https://testing.openelis-global.org';
const LIST_ROUTE = '/MasterListsPage/LabUnitManagement';
const CATALOG_ROUTE = '/MasterListsPage/TestCatalogList';

const FIXTURE_NAME = 'QA_AUTO_LU_FIX';
const PROBE_TEST = 'QA_AUTO_0713 Orderable';

/** G-3 deactivates a unit and saves a real test; opt in explicitly. */
const RUN_WRITE = process.env.LU_WRITE === '1';

type Unit = { id: string; name: string; isActive: boolean; testCount: number };

async function api(page: Page, path: string) {
  return page.evaluate(async (path) => {
    const csrf = localStorage.getItem('CSRF') || '';
    const r = await fetch('/api/OpenELIS-Global/rest' + path, {
      headers: { Accept: 'application/json', 'X-CSRF-Token': csrf },
      credentials: 'include',
    });
    const text = await r.text();
    // A lapsed session answers 200 with the login PAGE. Never parse that as data.
    if (text.trimStart().startsWith('<')) return { status: r.status, body: null, lapsed: true };
    let body: any = null;
    try { body = JSON.parse(text); } catch { /* leave null */ }
    return { status: r.status, body, lapsed: false };
  }, path);
}

async function labUnits(page: Page): Promise<Unit[]> {
  const r = await api(page, '/lab-units-management');
  expect(r.lapsed, 'harness session is still authenticated').toBe(false);
  return (r.body?.data as Unit[]) || [];
}

async function goAdmin(page: Page): Promise<void> {
  await page.goto(`${BASE}${LIST_ROUTE}`);
  await page.waitForFunction(() => !!localStorage.getItem('CSRF'), null, { timeout: 15000 });
}

/** A lab unit "holds content" if anything would be stranded by hiding it. */
function holdsContent(u: Unit): boolean {
  return (u.testCount ?? 0) > 0;
}

test.describe('Lab unit visibility — choosers vs viewers (OGC-189)', () => {
  test('G-1: [FLIP-WHEN-FIXED] the CHOOSER that picks a test’s lab unit does not filter out inactive units', async ({ page }) => {
    await goAdmin(page);
    const units = await labUnits(page);
    const inactiveNames = new Set(units.filter((u) => !u.isActive).map((u) => u.name));
    expect(inactiveNames.size, 'the instance has inactive units to reason about').toBeGreaterThan(0);

    const r = await api(page, '/test-catalog/lab-units');
    const offered = (Array.isArray(r.body) ? r.body : r.body?.data || [])
      .map((x: any) => String(x.name ?? x.value ?? x.label ?? ''))
      .filter(Boolean);
    expect(offered.length, 'the chooser returns lab units').toBeGreaterThan(0);

    const inactiveOffered = offered.filter((n: string) => inactiveNames.has(n));

    // WHEN FIXED: expect(inactiveOffered).toEqual([]) — a switched-off unit must not be
    // selectable as a NEW home for a test. Note this deliberately contradicts today's
    // Reassign-destination behaviour, which Casey ruled acceptable on 2026-09-01; the two need
    // to be reconciled as one decision rather than drifting apart.
    expect(
      inactiveOffered.length,
      'DEFECT-BY-DESIGN today: the test editor will happily assign a test into a deactivated ' +
        'lab unit, because the chooser applies no status filter',
    ).toBeGreaterThan(0);
  });

  test('G-2: [FLIP-WHEN-FIXED] the filtering is inverted — the VIEWER hides inactive units while the CHOOSER offers them', async ({ page }) => {
    // One test for the inversion itself, because the two halves only make sense together.
    await goAdmin(page);
    const units = await labUnits(page);
    const inactiveNames = new Set(units.filter((u) => !u.isActive).map((u) => u.name));

    const chooser = await api(page, '/test-catalog/lab-units');
    const chooserNames = (Array.isArray(chooser.body) ? chooser.body : chooser.body?.data || [])
      .map((x: any) => String(x.name ?? x.value ?? x.label ?? ''))
      .filter(Boolean);
    const chooserOffersInactive = chooserNames.some((n: string) => inactiveNames.has(n));

    await page.goto(`${BASE}/Results`);
    await page.waitForFunction(() => !!localStorage.getItem('CSRF'), null, { timeout: 15000 });
    const filter = page.locator('#unifiedResultsLabUnit');
    test.skip((await filter.count()) === 0, 'unified results route is off on this instance');
    const viewerNames = await filter
      .locator('option')
      .evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).text.trim()).filter(Boolean));
    const viewerOffersInactive = viewerNames.some((n) => inactiveNames.has(n));

    // WHEN FIXED: chooserOffersInactive === false and viewerOffersInactive === true.
    expect(
      { chooserOffersInactive, viewerOffersInactive },
      'today the status filter is applied to the worklist (which strands work) and not to the ' +
        'editor (which lets work be routed somewhere switched off) — precisely backwards',
    ).toEqual({ chooserOffersInactive: true, viewerOffersInactive: false });
  });

  test('G-3: [GUARDRAIL — DATA LOSS] a test assigned to an INACTIVE lab unit keeps its assignment across a UI save', async ({ page }) => {
    test.skip(!RUN_WRITE, 'deactivates a unit and saves a real test; run with LU_WRITE=1');

    await goAdmin(page);
    const units = await labUnits(page);
    const fixture = units.find((u) => u.name === FIXTURE_NAME);
    expect(fixture, `the stable fixture ${FIXTURE_NAME} exists — see the write spec's ensureFixture`).toBeTruthy();

    // Find the probe test and remember where it lives so it can be sent home.
    let probeId = '';
    let originalUnit = '';
    for (const u of units) {
      if (!u.testCount) continue;
      const r = await api(page, `/lab-units-management/${u.id}/tests`);
      const hit = ((r.body as any[]) || []).find((t) => String(t.name || '').startsWith(PROBE_TEST));
      if (hit) { probeId = String(hit.id); originalUnit = u.name; break; }
    }
    test.skip(!probeId, `this instance has no ${PROBE_TEST} test to move`);

    try {
      // --- park the probe in the fixture, then switch the fixture off ---
      await page.goto(`${BASE}${LIST_ROUTE}/${fixture!.id}/assigned-tests`);
      await page.getByRole('button', { name: 'Assign tests' }).click();
      await page.getByPlaceholder('Search tests...').fill(PROBE_TEST);
      await expect.poll(async () => page.locator('input[type="checkbox"]').count(), { timeout: 10000 }).toBeLessThan(5);
      await page.locator('input[type="checkbox"]').first().check();
      await page.getByRole('button', { name: /^Assign 1 test$/ }).click();
      await expect
        .poll(async () => (await api(page, `/lab-units-management/${fixture!.id}/tests`)).body?.length, { timeout: 25000 })
        .toBe(1);

      await page.goto(`${BASE}${LIST_ROUTE}/${fixture!.id}/basic-info`);
      if ((await api(page, `/lab-units-management/${fixture!.id}`)).body?.data?.isActive) {
        await page.getByText(/^(Active|Inactive)$/).first().click();
        await page.getByRole('button', { name: 'Save', exact: true }).click();
      }
      await expect
        .poll(async () => (await api(page, `/lab-units-management/${fixture!.id}`)).body?.data?.isActive, { timeout: 20000 })
        .toBe(false);

      // --- the assignment must survive being read back ---
      const before = await api(page, `/test-catalog/tests/${probeId}/basic-info`);
      expect(
        String(before.body?.labUnitId),
        'the test still records its lab unit even though that unit is now inactive',
      ).toBe(String(fixture!.id));

      // --- open the test editor the way a user does, and save without touching anything ---
      await page.goto(`${BASE}${CATALOG_ROUTE}`);
      await page.waitForFunction(() => !!localStorage.getItem('CSRF'), null, { timeout: 15000 });
      const search = page.locator('input[type="text"]').first();
      await search.fill(PROBE_TEST);
      await page.waitForTimeout(1500);
      await page.getByText(PROBE_TEST, { exact: false }).first().click();
      await page.waitForTimeout(2500);

      // The unit must be VISIBLE as the current value. When the chooser starts filtering
      // inactive units out, this is the assertion that catches a blank render.
      await expect(
        page.getByText(FIXTURE_NAME, { exact: false }).first(),
        'the editor displays the inactive lab unit as the current assignment rather than blank',
      ).toBeVisible({ timeout: 15000 });

      const save = page.getByRole('button', { name: 'Save', exact: true }).first();
      if (await save.count()) {
        await save.click();
        await page.waitForTimeout(3000);
      }

      // --- the real guard: a no-op save must not null the assignment ---
      const after = await api(page, `/test-catalog/tests/${probeId}/basic-info`);
      expect(
        String(after.body?.labUnitId),
        'DATA LOSS: a save from the test editor emptied the lab unit assignment because the ' +
          'inactive unit was not offered in the chooser (the OGC-1191 failure shape)',
      ).toBe(String(fixture!.id));
    } finally {
      // --- restore, whatever happened above ---
      await page.goto(`${BASE}${LIST_ROUTE}/${fixture!.id}/basic-info`);
      if (!(await api(page, `/lab-units-management/${fixture!.id}`)).body?.data?.isActive) {
        await page.getByText(/^(Active|Inactive)$/).first().click();
        await page.getByRole('button', { name: 'Save', exact: true }).click();
        await page.waitForTimeout(2500);
      }
      const held = (await api(page, `/lab-units-management/${fixture!.id}/tests`)).body as any[];
      if (originalUnit && held?.length) {
        await page.goto(`${BASE}${LIST_ROUTE}/${fixture!.id}/assigned-tests`);
        await page.locator('table thead input[type="checkbox"]').first().check();
        await page.getByRole('button', { name: /^Reassign selected \(\d+\)/ }).click();
        await page.locator('select').last().selectOption({ label: originalUnit });
        await page.getByRole('button', { name: /^Reassign \d+ tests?$/ }).click();
        await page.waitForTimeout(3000);
      }
    }
  });

  test('G-4: [GUARDRAIL] no lab unit holding content is hidden from every viewer at once', async ({ page }) => {
    // The self-cleaning property the design relies on: a unit may leave the viewers only once
    // it holds nothing. Read-only, and it passes today because all 22 inactive units are empty.
    await goAdmin(page);
    const units = await labUnits(page);
    const strandable = units.filter((u) => !u.isActive && holdsContent(u));

    await page.goto(`${BASE}/Results`);
    await page.waitForFunction(() => !!localStorage.getItem('CSRF'), null, { timeout: 15000 });
    const filter = page.locator('#unifiedResultsLabUnit');
    test.skip((await filter.count()) === 0, 'unified results route is off on this instance');
    const offered = await filter
      .locator('option')
      .evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).text.trim()).filter(Boolean));

    const stranded = strandable.filter((u) => !offered.includes(u.name));
    expect(
      stranded.map((u) => `${u.name} (${u.testCount} tests)`),
      'an inactive lab unit that still holds tests must remain selectable on the results ' +
        'worklist, or the work inside it cannot be completed',
    ).toEqual([]);
  });
});
