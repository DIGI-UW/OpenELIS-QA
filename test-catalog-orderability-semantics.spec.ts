/**
 * OpenELIS Global — orderability semantics: `active` vs `orderable`, and the completion guardrail.
 *
 * WHAT THE TWO FLAGS MEAN (product definition, Casey 2026-09-02)
 * -------------------------------------------------------------
 *   active     — whether the test can be ordered AT ALL, including as a reflex.
 *   orderable  — whether it shows up in the manual order-entry test list.
 *
 * So `active: true, orderable: false` is a real and intentional category, not a misconfiguration:
 * antibiotic susceptibility tests ordered as a reflex, confirmation tests, CT values arriving from
 * an analyzer. They must never appear in the manual picker, and must still be creatable by the
 * reflex / analyzer routes.
 *
 * And the invariant that overrides both:
 *   "ALL tests should be able to be completed, and the historical data viewed, regardless of
 *    these settings."
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * This behaviour works correctly today — measured 2026-09-02 on testing.openelis-global.org
 * (v3.2.2.0). It is pinned here because it is about to come under pressure: OGC-189's
 * deactivation cascade will make lab unit status feed into orderability (see
 * test-catalog-lab-unit-management-write.spec.ts, LU-W-10/11/12), and the obvious implementation
 * of that — filtering analyses by lab unit status — breaks the completion invariant. These are
 * the tests that should fail if that happens.
 *
 * LIVE EVIDENCE BEHIND THE ASSERTIONS
 * -----------------------------------
 *   - `Genie III` (ids 44/45/46) and `Stat-Pak` (ids 53/54/55), Serology-Immunology, HIV
 *     confirmation tests: active=true, orderable=false. All six absent from the manual picker
 *     across all three of their sample types.
 *   - The manual picker's own source is GET /rest/sample-type-tests?sampleType=<id>, whose
 *     `tests` array is what the order wizard's Available Tests table renders.
 *   - The unified /Results Lab Unit filter offers 13 options for 34 lab units — exactly the 12
 *     active ones plus a blank. It excludes all 22 inactive units. See TO-5: that is harmless
 *     only for as long as no inactive unit holds tests.
 *   - Dry run 2026-09-02 over a 124-test sample: 6 reflex-only, 107 ordinary, 0 leaks,
 *     0 missing, both reflex targets active. All five below pass today.
 *
 * Run:
 *   BASE=https://testing.openelis-global.org \
 *   npx playwright test --config=all-tc.config.ts --project=test-catalog \
 *     test-catalog-orderability-semantics.spec.ts
 */

import { test, expect, Page } from '@playwright/test';

const BASE = process.env.BASE || 'https://testing.openelis-global.org';

/** How many tests to inspect per lab unit. The catalog is large; this keeps the suite bounded. */
const PER_UNIT_SAMPLE = 20;

type Basic = {
  testId: string;
  name: string;
  labUnitId: string;
  active: boolean;
  orderable: boolean;
  sampleTypeIds: string[];
};

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

async function labUnits(page: Page): Promise<{ id: string; name: string; isActive: boolean; testCount: number }[]> {
  const r = await api(page, '/lab-units-management');
  expect(r.lapsed, 'harness session is still authenticated').toBe(false);
  return (r.body?.data as any[]) || [];
}

/** The test ids the MANUAL order-entry picker will offer for a sample type. */
async function manualPicker(page: Page, sampleTypeId: string): Promise<Set<string>> {
  const r = await api(page, `/sample-type-tests?sampleType=${sampleTypeId}`);
  return new Set(((r.body?.tests as any[]) || []).map((t) => String(t.id)));
}

async function basicInfo(page: Page, testId: string): Promise<Basic | null> {
  const r = await api(page, `/test-catalog/tests/${testId}/basic-info`);
  const b = r.body;
  if (!b?.testId) return null;
  return {
    testId: String(b.testId),
    name: String(b.name ?? ''),
    labUnitId: String(b.labUnitId ?? ''),
    active: b.active === true,
    orderable: b.orderable === true,
    // Tests with no sample type mapping cannot appear in any sample-type-scoped list at all —
    // they are excluded for a reason unrelated to these two flags, so they are filtered out
    // wherever this spec reasons about picker membership. (BA#, EO#, LY#, MO#, NE# are these.)
    sampleTypeIds: ((b.sampleTypeIds as any[]) || [b.sampleTypeId]).filter(Boolean).map(String),
  };
}

/** Walks a bounded sample of the catalog once and caches it for the whole file. */
let catalogCache: Basic[] | null = null;
async function catalogSample(page: Page): Promise<Basic[]> {
  if (catalogCache) return catalogCache;
  const out: Basic[] = [];
  for (const u of await labUnits(page)) {
    if (!u.testCount) continue;
    const r = await api(page, `/lab-units-management/${u.id}/tests`);
    for (const t of ((r.body as any[]) || []).slice(0, PER_UNIT_SAMPLE)) {
      const b = await basicInfo(page, String(t.id));
      if (b) out.push(b);
    }
  }
  catalogCache = out;
  return out;
}

test.beforeEach(async ({ page }) => {
  await page.goto(`${BASE}/MasterListsPage/LabUnitManagement`);
  await page.waitForFunction(() => !!localStorage.getItem('CSRF'), null, { timeout: 15000 });
});

test.describe('Orderability semantics — active vs orderable', () => {
  test('TO-1: the "active but not orderable" category exists in the catalog (precondition — keeps TO-2 non-vacuous)', async ({ page }) => {
    const catalog = await catalogSample(page);
    expect(catalog.length, 'the catalog sample is non-empty').toBeGreaterThan(20);

    const reflexOnly = catalog.filter((t) => t.active && !t.orderable);
    expect(
      reflexOnly.length,
      'reflex-only / confirmation / analyzer-driven tests are representable and present — ' +
        'if this hits zero, TO-2 below proves nothing and the fixtures need revisiting',
    ).toBeGreaterThan(0);

    // The two flags must be independently settable, or the model has collapsed into one.
    const bothTrue = catalog.filter((t) => t.active && t.orderable).length;
    expect(bothTrue, 'ordinary orderable tests also exist').toBeGreaterThan(0);
  });

  test('TO-2: a test with orderable=false never appears in the manual order-entry picker, for any of its sample types', async ({ page }) => {
    const catalog = await catalogSample(page);
    const reflexOnly = catalog.filter((t) => t.active && !t.orderable && t.sampleTypeIds.length > 0);
    test.skip(reflexOnly.length === 0, 'no sample-typed reflex-only tests in this catalog sample');

    const leaks: string[] = [];
    for (const t of reflexOnly) {
      for (const st of t.sampleTypeIds) {
        if ((await manualPicker(page, st)).has(t.testId)) {
          leaks.push(`${t.name} (id ${t.testId}) leaked into sample type ${st}`);
        }
      }
    }

    expect(
      leaks,
      'a not-orderable test in the manual picker would let a clinician hand-order a reflex-only, ' +
        'confirmation, or analyzer-derived test directly',
    ).toEqual([]);
  });

  test('TO-3: [positive control] orderable=true, active=true tests DO appear in the picker for their sample type', async ({ page }) => {
    // Without this, TO-2 would pass just as happily against an endpoint that returned nothing.
    const catalog = await catalogSample(page);
    const ordinary = catalog.filter((t) => t.active && t.orderable && t.sampleTypeIds.length > 0);
    test.skip(ordinary.length === 0, 'no sample-typed orderable tests in this catalog sample');

    const missing: string[] = [];
    for (const t of ordinary) {
      let found = false;
      for (const st of t.sampleTypeIds) {
        if ((await manualPicker(page, st)).has(t.testId)) { found = true; break; }
      }
      if (!found) missing.push(`${t.name} (id ${t.testId}, sample types ${t.sampleTypeIds.join(',')})`);
    }

    expect(
      missing,
      'every active + orderable test with a sample type must be offerable somewhere — ' +
        'the picker is genuinely populated, so TO-2 is a real exclusion and not an empty set',
    ).toEqual([]);
  });

  test('TO-4: no reflex rule targets a test that cannot be created (target must be active)', async ({ page }) => {
    // A reflex pointing at an inactive test is a rule that silently never completes. `orderable`
    // is deliberately NOT checked here: reflex targets are exactly the tests expected to be
    // active-but-not-orderable.
    const r = await api(page, '/reflexrules');
    const rules = (r.body as any[]) || [];
    test.skip(rules.length === 0, 'this instance has no reflex rules configured');

    const targets = new Set<string>();
    for (const rule of rules) {
      for (const a of (rule.actions as any[]) || []) {
        const id = a.reflexTestId ?? a.addedTestId ?? a.addedTest;
        if (id) targets.add(String(id));
      }
    }
    expect(targets.size, 'the configured rules name at least one reflex target').toBeGreaterThan(0);

    const dead: string[] = [];
    for (const id of targets) {
      const b = await basicInfo(page, id);
      if (b && !b.active) dead.push(`${b.name} (id ${id})`);
    }
    expect(
      dead,
      'a reflex whose target test is inactive fires into nothing, with no user present to notice',
    ).toEqual([]);
  });

  test('TO-5: [GUARDRAIL] work in a lab unit stays reachable for completion — the Results Lab Unit filter must not hide a unit that holds tests', async ({ page }) => {
    // Casey's invariant: "ALL tests should be able to be completed, and the historical data
    // viewed, regardless of these settings."
    //
    // Measured 2026-09-02: the unified /Results Lab Unit filter offers 13 options for 34 lab
    // units — the 12 ACTIVE ones plus a blank. All 22 inactive units are hidden. That is
    // harmless today only because every inactive unit happens to hold zero tests, so there is
    // no in-flight work behind the hidden entries.
    //
    // This test asserts the INVARIANT rather than the current option list: either no inactive
    // unit holds tests, or the filter offers inactive units too. OGC-189's deactivation cascade
    // is what will break it — deactivate a populated unit and its pending analyses become
    // unreachable from the worklist that exists to finish them. When that happens, this fails.
    await page.goto(`${BASE}/Results`);
    await page.waitForFunction(() => !!localStorage.getItem('CSRF'), null, { timeout: 15000 });

    const filter = page.locator('#unifiedResultsLabUnit');
    // Wait for the control before deciding to skip. waitForFunction(CSRF) resolves before React
    // has finished rendering, so an immediate count() made this GUARDRAIL skip ITSELF on some
    // runs — and a skipped test reads as green, so the guardrail silently was not checked.
    // Observed 2026-09-02: TO-5 skipped on every run until this was fixed; G-2/G-4 skipped
    // intermittently. Only skip when the route is genuinely off.
    await filter.waitFor({ state: 'attached', timeout: 15000 }).catch(() => {});
    test.skip((await filter.count()) === 0, 'unified results route is off on this instance');

    const offered = await filter.locator('option').evaluateAll((os) =>
      os.map((o) => (o as HTMLOptionElement).text.trim()).filter(Boolean),
    );
    const units = await labUnits(page);
    const inactiveWithTests = units.filter((u) => !u.isActive && u.testCount > 0);
    const inactiveOffered = units.filter((u) => !u.isActive && offered.includes(u.name));

    if (inactiveWithTests.length === 0) {
      // Today's state. Recorded explicitly so the test documents WHY it is passing.
      expect(
        inactiveWithTests.map((u) => u.name),
        'no inactive lab unit holds tests, so hiding inactive units from the filter strands nothing',
      ).toEqual([]);
      return;
    }

    expect(
      inactiveOffered.length,
      `GUARDRAIL BREACH: ${inactiveWithTests.map((u) => `${u.name} (${u.testCount} tests)`).join(', ')} ` +
        'are inactive but still hold tests, and the Results Lab Unit filter does not offer them — ' +
        'any in-flight analysis in those units cannot be reached from the worklist meant to complete it',
    ).toBeGreaterThan(0);
  });
});
