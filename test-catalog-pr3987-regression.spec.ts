/**
 * OpenELIS Global — PR #3987 REGRESSION GUARD (Test Catalog half)
 * Target: any instance carrying DIGI-UW/OpenELIS-Global-2#3987 (merged 2026-08-05)
 * Authored + verified live 2026-08-06 on testing.openelis-global.org v3.2.1.11
 *
 * WHAT THIS PINS — the Test Catalog / Results-Validation items of the 15-item PR:
 *
 *   item 1  Range-coverage gaps are judged against the group PLUS the component's
 *           shared ranges. A specimen-scoped range with no shared set backing it
 *           now REPORTS its tail gap instead of having it silently discarded
 *           (the deleted `stripGaps`).
 *   item 2  The "No LOINC" flag clears for an active LOINC mapping in ANY scope,
 *           not just the legacy `test.loinc` column.
 *   item 7  `/reflexrules` and `/test-calculations` accept `?id=`.
 *   item 8  The EDITOR envelope names every associated specimen; the LIST row
 *           keeps the "+n" abbreviation.
 *   item 15 `PUT .../basic-info` with `active:true` on an INACTIVE test answers
 *           409 instead of 200-and-silently-ignore.
 *   item 5  Results Entry and Validation render the SAME reference range for the
 *           same analysis (cross-screen equality — the patient-safety one).
 *
 * FIXTURE DISCIPLINE (§0.6, §10.5): every fixture is DISCOVERED on the live
 * instance, never hard-coded. Baked-in test ids drift between instances — the
 * ids in the PR description (322, 442) exist on some instances and not others.
 *
 * NON-DESTRUCTIVE: each write is captured, asserted, then REVERTED to the exact
 * baseline read beforehand. Per the LIMS rule the suite never hard-deletes.
 *
 * WHY page.evaluate FOR WRITES: OpenELIS requires `X-CSRF-Token` on writes and
 * the token lives in `localStorage.CSRF` once the SPA has loaded. The bare
 * `request` fixture carries cookies but no token and is rejected.
 *
 * Run: BASE=https://testing.openelis-global.org \
 *   npx playwright test --config=pr3987.config.ts --project=pr3987-catalog
 */

import { test, expect, Page } from '@playwright/test';
import {
  CoverageReport,
  RangesResponse,
  LoincIntegrity,
  TestListRow,
  EditorEnvelope,
  TerminologyMappingDto,
  toAgeAsNumber,
} from './helpers/apiShapes';

const API = '/api/OpenELIS-Global/rest';

type ApiResult<T = any> = { status: number; body: T };

/** window.fetch inside the loaded SPA so app cookies + the CSRF token are attached. */
async function api<T = any>(
  page: Page,
  path: string,
  method: 'GET' | 'POST' | 'PUT' = 'GET',
  payload?: unknown,
): Promise<ApiResult<T>> {
  return page.evaluate(
    async ({ path, method, payload, API }) => {
      const csrf = localStorage.getItem('CSRF') || '';
      const init: RequestInit = {
        method,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrf,
        },
        credentials: 'include',
      };
      if (method !== 'GET') init.body = JSON.stringify(payload ?? {});
      const r = await fetch(API + path, init);
      let body: any;
      try {
        body = await r.json();
      } catch {
        body = (await r.text().catch(() => '')).slice(0, 400);
      }
      return { status: r.status, body };
    },
    { path, method, payload, API },
  );
}

/** The SPA must be loaded for localStorage.CSRF to exist. */
test.beforeEach(async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect
    .poll(() => page.evaluate(() => !!localStorage.getItem('CSRF')), { timeout: 20_000 })
    .toBe(true);
});

// ---------------------------------------------------------------------------
// Build gate — refuse to report PASS against a pre-#3987 build.
//
// The cheapest unambiguous signature is item 7: pre-PR the controller had no
// `id` parameter at all, so an unknown id returned the WHOLE collection.
// Post-PR it returns an empty array. A spec that skipped this gate would
// report the other items as "passing" on a build that simply lacks the fix.
// ---------------------------------------------------------------------------
test('PR-3987 build gate — /reflexrules honours ?id= (unknown id ⇒ empty)', async ({ page }) => {
  const all = await api<any[]>(page, '/reflexrules');
  expect(all.status).toBe(200);
  expect(Array.isArray(all.body)).toBe(true);

  const unknown = await api<any[]>(page, '/reflexrules?id=999999');
  expect(unknown.status).toBe(200);
  expect(
    unknown.body,
    'unknown ?id= returned rows — this build predates #3987 item 7; every other ' +
      'assertion in this file would be meaningless. Deploy the merge first.',
  ).toHaveLength(0);

  // Blank is NOT a filter (the `id.isBlank()` branch).
  const blank = await api<any[]>(page, '/reflexrules?id=');
  expect(blank.body).toHaveLength(all.body.length);
});

test('item 7 — ?id= filters both list endpoints by the OWNING record id', async ({ page }) => {
  for (const endpoint of ['/reflexrules', '/test-calculations']) {
    const all = await api<any[]>(page, endpoint);
    expect(all.status, `${endpoint} must answer 200`).toBe(200);
    test.skip(all.body.length === 0, `${endpoint} has no records on this instance to filter`);

    const wanted = all.body[0];
    const one = await api<any[]>(page, `${endpoint}?id=${encodeURIComponent(String(wanted.id))}`);
    expect(one.status).toBe(200);
    expect(one.body, `${endpoint}?id=${wanted.id} must return exactly that record`).toHaveLength(1);
    expect(String(one.body[0].id)).toBe(String(wanted.id));

    // String-vs-Integer: the param is compared via `id.equals(String.valueOf(entityId))`,
    // so a zero-padded id must NOT match. This is the bug the PR caught mid-change.
    const padded = await api<any[]>(page, `${endpoint}?id=0${wanted.id}`);
    expect(padded.body, 'zero-padded id must not match (String comparison)').toHaveLength(0);

    const unknown = await api<any[]>(page, `${endpoint}?id=999999`);
    expect(unknown.body).toHaveLength(0);

    const blank = await api<any[]>(page, `${endpoint}?id=`);
    expect(blank.body, 'blank id is not a filter').toHaveLength(all.body.length);
  }
});

test('item 8 — editor names every specimen, list keeps the "+n" abbreviation', async ({ page }) => {
  // Discover a multi-specimen test by the abbreviation the LIST is supposed to keep.
  const list = await api<{ rows: TestListRow[] }>(page, '/test-catalog/tests?page=1&pageSize=400');
  expect(list.status).toBe(200);
  const abbreviated = (list.body.rows || []).filter((r) => /\+\d+\)/.test(r.name || ''));
  test.skip(
    abbreviated.length === 0,
    'no test on this instance is linked to 2+ sample types — item 8 needs one',
  );

  const row = abbreviated[0];
  // (a) the LIST keeps the abbreviation — this half must NOT have changed
  expect(row.name).toMatch(/\+\d+\)/);

  // (b) the EDITOR envelope spells out every specimen, comma-separated, no "+n"
  const editor = await api<EditorEnvelope>(page, `/test-catalog/tests/${row.testId}`);
  expect(editor.status).toBe(200);
  expect(editor.body.name).not.toMatch(/\+\d+\)/);
  expect(editor.body.name, 'editor name must list specimens in parens').toMatch(/\(.+\)$/);

  // The base name (before the paren) must be identical on both surfaces — the PR
  // changed only the suffix, not the resolved name.
  const base = (s: string) => s.replace(/\([^)]*\)$/, '');
  expect(base(editor.body.name)).toBe(base(row.name));

  // The editor must name at least as many specimens as the list abbreviates.
  const abbrevCount = 1 + Number(/\+(\d+)\)/.exec(row.name)![1]);
  const namedCount = /\(([^)]*)\)$/.exec(editor.body.name)![1].split(',').length;
  expect(namedCount, `editor should name all ${abbrevCount} specimens`).toBe(abbrevCount);
});

test('item 2 — "No LOINC" clears for an active LOINC mapping in ANY scope', async ({ page }) => {
  // Fixture: an ACTIVE + ORDERABLE test with a blank `test.loinc` column and no
  // mappings, so `noLoinc` starts true and every flip is attributable to us.
  const list = await api<{ rows: TestListRow[] }>(page, '/test-catalog/tests?page=1&pageSize=400');
  let target: { testId: string; sampleTypeId: string } | null = null;

  for (const row of (list.body.rows || []).filter((r) => r.active && !r.hasLoinc).slice(0, 40)) {
    const integrity = await api<LoincIntegrity>(
      page,
      `/test-catalog/tests/${row.testId}/loinc-integrity`,
    );
    const term = await api<{ mappings: TerminologyMappingDto[]; sampleTypes: any[] }>(
      page,
      `/test-catalog/tests/${row.testId}/terminology`,
    );
    if (
      integrity.body?.noLoinc === true &&
      (term.body?.mappings || []).length === 0 &&
      (term.body?.sampleTypes || []).length > 0
    ) {
      target = { testId: row.testId, sampleTypeId: term.body.sampleTypes[0].id };
      break;
    }
  }
  test.skip(!target, 'no active+orderable test with noLoinc=true and zero mappings to use');
  const { testId, sampleTypeId } = target!;

  const flags = async () => {
    const integrity = await api<LoincIntegrity>(
      page,
      `/test-catalog/tests/${testId}/loinc-integrity`,
    );
    const rows = await api<{ rows: TestListRow[] }>(
      page,
      '/test-catalog/tests?page=1&pageSize=400',
    );
    return {
      noLoinc: integrity.body.noLoinc,
      hasLoinc: (rows.body.rows || []).find((r) => r.testId === testId)?.hasLoinc,
    };
  };
  const setMappings = (mappings: TerminologyMappingDto[]) =>
    api(page, `/test-catalog/tests/${testId}/terminology`, 'PUT', { testId, mappings });

  try {
    expect(await flags()).toEqual({ noLoinc: true, hasLoinc: false });

    // (a) SNOMED-only must NOT clear it — the flag is LOINC-specific.
    expect((await setMappings([{ source: 'SNOMED', code: '119364003', relationship: 'SAME_AS' }])).status).toBe(200);
    expect(await flags(), 'a SNOMED mapping must not clear the LOINC flag').toEqual({
      noLoinc: true,
      hasLoinc: false,
    });

    // (b) whole-test LOINC (no componentId, no sampleTypeId) clears it.
    expect((await setMappings([{ source: 'LOINC', code: '99999-1', relationship: 'SAME_AS' }])).status).toBe(200);
    expect(await flags(), 'a whole-test LOINC mapping must clear the flag').toEqual({
      noLoinc: false,
      hasLoinc: true,
    });

    // (c) SPECIMEN-SCOPED LOINC clears it too — the crux of item 2. Pre-PR the
    //     predicate only read the legacy column, so a scoped mapping left the
    //     misleading "No LOINC" warning on a test that HAS a LOINC code.
    expect(
      (await setMappings([
        { source: 'LOINC', code: '99999-2', relationship: 'SAME_AS', sampleTypeId },
      ])).status,
    ).toBe(200);
    expect(await flags(), 'a specimen-scoped LOINC mapping must clear the flag').toEqual({
      noLoinc: false,
      hasLoinc: true,
    });
  } finally {
    await setMappings([]);
    expect(await flags(), 'cleanup must restore the baseline').toEqual({
      noLoinc: true,
      hasLoinc: false,
    });
  }
});

test('item 1 — coverage gaps judged against group + shared ranges', async ({ page }) => {
  // Fixture: a test with ZERO ranges, so coverage starts EMPTY and every gap /
  // overlap we assert is produced by the ranges we write.
  const list = await api<{ rows: TestListRow[] }>(page, '/test-catalog/tests?page=1&pageSize=400');
  let target: { testId: string; sampleTypeId: string } | null = null;

  for (const row of (list.body.rows || []).slice(0, 60)) {
    const r = await api<RangesResponse>(page, `/test-catalog/tests/${row.testId}/ranges`);
    if (
      r.status === 200 &&
      (r.body.ranges || []).length === 0 &&
      (r.body.sampleTypes || []).length > 0
    ) {
      target = { testId: row.testId, sampleTypeId: r.body.sampleTypes[0].id };
      break;
    }
  }
  test.skip(!target, 'no test with zero ranges available as a clean coverage fixture');
  const { testId, sampleTypeId } = target!;

  const setRanges = (ranges: unknown[]) =>
    api<RangesResponse>(page, `/test-catalog/tests/${testId}/ranges`, 'PUT', { ranges });
  const male = (r: ApiResult<RangesResponse>) => r.body.coverage.male;

  // An OPEN-ENDED range omits maxAge. A large finite bound like 999 is NOT
  // "no upper limit" — it leaves a legitimate [999, Infinity) tail gap, which
  // is the trap that makes a naive fixture look like a coverage bug.
  const openEndedShared = {
    componentId: null, sampleTypeId: null, gender: 'M',
    minAge: 0, maxAge: null, lowNormal: 10, highNormal: 90,
  };
  const specimenOverride = {
    componentId: null, sampleTypeId, gender: 'M',
    minAge: 0, maxAge: 30, lowNormal: 5, highNormal: 100,
  };

  try {
    // (a) specimen-scoped range, NO shared set backing it ⇒ the tail gap is REPORTED.
    //     Pre-PR `stripGaps` discarded every specimen-scoped gap wholesale, so this
    //     read "Fully Covered" while ages 30+ had no range at all.
    const a = await setRanges([specimenOverride]);
    expect(a.status).toBe(200);
    expect(male(a).status).toBe('GAP');
    expect(male(a).gaps).toHaveLength(1);
    expect(male(a).gaps[0].fromAge).toBe(30);
    // `toAge` serializes as the STRING "Infinity" — toBe(Infinity) would fail.
    expect(toAgeAsNumber(male(a).gaps[0])).toBe(Number.POSITIVE_INFINITY);

    // (b) a shared open-ended range BACKS the override ⇒ COMPLETE, and critically
    //     NO overlap is invented for the doubly-covered 0–30 window.
    const b = await setRanges([openEndedShared, specimenOverride]);
    expect(b.status).toBe(200);
    expect(male(b).status).toBe('COMPLETE');
    expect(male(b).gaps).toHaveLength(0);
    expect(male(b).overlaps, 'a shared range backing an override is not an overlap').toHaveLength(0);

    // (c) two overlapping ranges in the SAME specimen scope IS still an overlap.
    //     The widest must be open-ended: `statusFor` reports GAP over OVERLAP when
    //     both exist, so a finite tail would mask this assertion.
    const c = await setRanges([
      { ...specimenOverride, minAge: 0, maxAge: 20 },
      { ...specimenOverride, minAge: 10, maxAge: null },
    ]);
    expect(c.status).toBe(200);
    expect(male(c).status).toBe('OVERLAP');
    expect(male(c).gaps).toHaveLength(0);
    expect(male(c).overlaps).toHaveLength(1);
    expect(male(c).overlaps[0].fromAge).toBe(10);
    expect(toAgeAsNumber(male(c).overlaps[0])).toBe(20);
  } finally {
    const z = await setRanges([]);
    expect(z.body.ranges, 'cleanup must remove every range we added').toHaveLength(0);
    expect(z.body.coverage.male.status).toBe('EMPTY');
  }
});

test('item 15 — basic-info cannot activate an inactive test (409), already-active round-trips (200)', async ({
  page,
}) => {
  const list = await api<{ rows: TestListRow[] }>(
    page,
    '/test-catalog/tests?page=1&pageSize=400&status=all',
  );
  const rows = list.body.rows || [];

  // --- (A) INACTIVE test: active:true must be REFUSED with 409 and change nothing.
  // Prefer an inactive test that already has sample types, so the 422 validation
  // (empty sample-type set on an active-or-orderable test) cannot fire first and
  // mask the 409 we are actually testing.
  let inactive: any = null;
  for (const row of rows.filter((r) => !r.active).slice(0, 60)) {
    const bi = await api<any>(page, `/test-catalog/tests/${row.testId}/basic-info`);
    if (bi.status === 200 && (bi.body.sampleTypeIds || []).length > 0) {
      inactive = bi.body;
      break;
    }
  }
  test.skip(!inactive, 'no inactive test with sample types available');

  const put = (testId: string, body: unknown) =>
    api(page, `/test-catalog/tests/${testId}/basic-info`, 'PUT', body);
  const readActive = async (testId: string) =>
    (await api<any>(page, `/test-catalog/tests/${testId}/basic-info`)).body.active;

  const conflict = await put(inactive.testId, { ...inactive, active: true });
  expect(
    conflict.status,
    'activating via basic-info must be refused — the gated /activate endpoint owns this',
  ).toBe(409);
  expect(await readActive(inactive.testId), 'the 409 must not have flipped the flag').toBe(false);

  // active:false and an absent `active` are both unchanged 200s.
  expect((await put(inactive.testId, { ...inactive, active: false })).status).toBe(200);
  const withoutActive = { ...inactive };
  delete withoutActive.active;
  expect((await put(inactive.testId, withoutActive)).status).toBe(200);
  expect(await readActive(inactive.testId)).toBe(false);

  // --- (B) ALREADY-ACTIVE test: active:true is not a change, so the ordinary
  // form round-trip must still succeed AND persist its other edits.
  let active: any = null;
  for (const row of rows.filter((r) => r.active).slice(0, 60)) {
    const bi = await api<any>(page, `/test-catalog/tests/${row.testId}/basic-info`);
    if (bi.status === 200 && (bi.body.sampleTypeIds || []).length > 0) {
      active = bi.body;
      break;
    }
  }
  test.skip(!active, 'no active test with sample types available');

  const marker = `qa-pr3987-${Date.now()}`;
  try {
    const ok = await put(active.testId, { ...active, active: true, description: marker });
    expect(ok.status, 'active:true on an already-active test is not a change').toBe(200);
    const after = await api<any>(page, `/test-catalog/tests/${active.testId}/basic-info`);
    expect(after.body.active).toBe(true);
    expect(after.body.description, 'the round-trip must persist the edit').toBe(marker);
  } finally {
    await put(active.testId, { ...active, active: true, description: active.description });
    const restored = await api<any>(page, `/test-catalog/tests/${active.testId}/basic-info`);
    expect(restored.body.description).toBe(active.description);
  }
});

test('item 5 — Results Entry and Validation render the SAME reference range', async ({ page }) => {
  // Cross-screen equality. Pre-PR Validation always took the test-level limit and
  // never resolved the patient, so an age/sex-banded range disagreed with Results
  // Entry — two clinicians reading two different normals for one result.
  const sections = await api<Array<{ id: string; value?: string; name?: string }>>(
    page,
    '/user-test-sections/ALL',
  );
  expect(sections.status).toBe(200);

  let pair: { accession: string; unitType: string } | null = null;
  for (const s of (sections.body || []).slice(0, 12)) {
    const v = await api<{ resultList: any[] }>(
      page,
      `/AccessionValidation?unitType=${encodeURIComponent(s.id)}&doRange=true`,
    );
    const first = (v.body?.resultList || [])[0];
    if (first?.accessionNumber) {
      pair = { accession: first.accessionNumber, unitType: s.id };
      break;
    }
  }
  test.skip(!pair, 'no accession is awaiting validation — item 5 needs one on both screens');

  const results = await api<{ testResult: any[] }>(
    page,
    `/LogbookResults?labNumber=${pair!.accession}`,
  );
  const validation = await api<{ resultList: any[] }>(
    page,
    `/AccessionValidation?unitType=${encodeURIComponent(pair!.unitType)}&doRange=true`,
  );
  const resRows = results.body?.testResult || [];
  const valRows = (validation.body?.resultList || []).filter(
    (r) => r.accessionNumber === pair!.accession,
  );
  expect(valRows.length, 'validation must still list the accession').toBeGreaterThan(0);

  let compared = 0;
  for (const v of valRows) {
    const r = resRows.find((x: any) => String(x.analysisId) === String(v.analysisId));
    if (!r) continue;
    compared++;
    expect(
      v.normalRange,
      `analysis ${v.analysisId}: Validation range "${v.normalRange}" != Results range "${r.normalRange}"`,
    ).toBe(r.normalRange);
    // item 4 rides along: both screens name the analysis's OWN specimen, and
    // neither may fall back to the catalogue's "+n" multi-specimen summary.
    expect(v.testName).toBe(r.testName);
    expect(v.testName, 'no row may carry the "+n" abbreviation').not.toMatch(/\+\d+\)/);
  }
  expect(compared, 'no analysis appeared on both screens — nothing was actually compared').toBeGreaterThan(0);
});

test('item 5 (banded) — Validation resolves the patient and picks the SAME age/sex band', async ({
  page,
}) => {
  // The test above compares whatever fixture the instance happens to have. On a
  // single-component, unbanded range BOTH the fixed and the broken code return the
  // same string, so it cannot distinguish them. This test builds the fixture that
  // can: a sex- AND age-banded range, where the pre-fix behaviour (Validation took
  // the test-level limit and never resolved the patient, so no band could match)
  // lands on a visibly different band.
  //
  // Verified live 2026-08-06: patient male aged 36 ⇒ both screens read
  // "100.0 - 200.0" — not the child band, not the female band.
  const list = await api<{ rows: TestListRow[] }>(
    page,
    '/test-catalog/tests?page=1&pageSize=400&status=all',
  );

  // Find a numeric analysis awaiting result entry whose test we may safely re-range.
  // Restricted to QA-prefixed tests: banding a clinical test would change what real
  // results are flagged against.
  let fixture: { testId: string; accession: string; analysisIds: string[] } | null = null;
  for (const row of (list.body.rows || []).filter((r) => r.active && /QA_?AUTO/i.test(r.name || ''))) {
    const lb = await api<{ testResult: any[] }>(page, `/LogbookResults?testId=${row.testId}`);
    const numeric = (lb.body?.testResult || []).filter(
      (r: any) => (r.resultType || '').toUpperCase() === 'N' && r.accessionNumber,
    );
    if (numeric.length) {
      fixture = {
        testId: row.testId,
        accession: numeric[0].accessionNumber,
        analysisIds: numeric.map((r: any) => String(r.analysisId)),
      };
      break;
    }
  }
  test.skip(
    !fixture,
    'no numeric analysis on a QA-prefixed test is awaiting results — seed one (see ' +
      'fhir-specimen-terminology-pr3987.spec.ts for the order-seeding recipe)',
  );
  const { testId, accession } = fixture!;

  const baseline = await api<RangesResponse>(page, `/test-catalog/tests/${testId}/ranges`);
  const baselineRanges = baseline.body.ranges || [];

  // Bands share no digits, so ANY wrong selection is unambiguous in the assertion
  // message rather than an off-by-one to squint at.
  const CHILD_MALE = { gender: 'M', minAge: 0, maxAge: 18, lowNormal: 1, highNormal: 10 };
  const ADULT_MALE = { gender: 'M', minAge: 18, maxAge: null, lowNormal: 100, highNormal: 200 };
  const FEMALE = { gender: 'F', minAge: 0, maxAge: null, lowNormal: 500, highNormal: 600 };

  try {
    const written = await api<RangesResponse>(
      page,
      `/test-catalog/tests/${testId}/ranges`,
      'PUT',
      {
        ranges: [CHILD_MALE, ADULT_MALE, FEMALE].map((r) => ({
          componentId: null,
          sampleTypeId: null,
          ...r,
        })),
      },
    );
    expect(written.status).toBe(200);
    // Both sexes fully covered ⇒ any band miss is a selection bug, not a gap.
    expect(written.body.coverage.male.status).toBe('COMPLETE');
    expect(written.body.coverage.female.status).toBe('COMPLETE');

    const results = await api<{ testResult: any[] }>(
      page,
      `/LogbookResults?labNumber=${accession}`,
    );
    const resRows = (results.body?.testResult || []).filter((r: any) =>
      fixture!.analysisIds.includes(String(r.analysisId)),
    );
    expect(resRows.length, 'the seeded analyses must still be on Results Entry').toBeGreaterThan(0);

    // Results Entry has always resolved the patient — establish which band is right
    // from the screen that was never broken, then require Validation to agree.
    const expectedRange = resRows[0].normalRange;
    expect(
      expectedRange,
      'Results Entry returned no range — the banded fixture did not take',
    ).toBeTruthy();

    const validation = await api<{ resultList: any[] }>(
      page,
      `/AccessionValidation?accessionNumber=${accession}&doRange=true`,
    );
    const valRows = (validation.body?.resultList || []).filter((r: any) =>
      fixture!.analysisIds.includes(String(r.analysisId)),
    );
    test.skip(
      valRows.length === 0,
      `${accession} is not awaiting validation (results must be entered first) — ` +
        'the parity half of this test needs it on both screens',
    );

    for (const v of valRows) {
      const r = resRows.find((x: any) => String(x.analysisId) === String(v.analysisId));
      if (!r) continue;
      expect(
        v.normalRange,
        `analysis ${v.analysisId}: Validation shows "${v.normalRange}" but Results Entry ` +
          `shows "${r.normalRange}". Pre-#3987 Validation took the test-level limit and ` +
          `never resolved the patient, so no age/sex band could match.`,
      ).toBe(r.normalRange);
      // Name the specific wrong answers, so a failure reads as a diagnosis.
      expect(String(v.normalRange), 'picked the CHILD band — age not resolved').not.toMatch(/\b1(\.0)? - 10(\.0)?\b/);
      expect(String(v.normalRange), 'picked the FEMALE band — sex not resolved').not.toMatch(/\b500/);
      // Significant digits come from the row's own component; a mismatch here
      // (30.00 vs 30.0) is a FAIL, not cosmetic.
      expect(v.significantDigits ?? r.significantDigits).toBe(r.significantDigits);
    }
  } finally {
    // Restore the exact baseline. NOTE: if the baseline was empty and this test
    // seeded the bands, consider LEAVING them on a QA-prefixed test — a banded
    // fixture is what makes this assertion meaningful on the next run.
    await api(page, `/test-catalog/tests/${testId}/ranges`, 'PUT', { ranges: baselineRanges });
  }
});
