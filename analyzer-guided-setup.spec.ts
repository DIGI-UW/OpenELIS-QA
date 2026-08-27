/**
 * RE-BASELINED AGAINST THE analyzers INSTANCE, 2026-08-27.
 *
 * Before this pass the suite was registered inside all-tc.config.ts, which
 * authenticates against TESTING -- so it drove analyzers.openelis-global.org
 * carrying testing cookies and every test timed out. Twenty false failures that
 * read as defects. It now has analyzer-m3.config.ts and its own login.
 *
 * Score once it could actually run: 10 passed / 10 failed. After this pass:
 * 18 passed / 3 failed / 1 skipped.
 *
 * WHAT WAS WRONG WITH THE SUITE, NOT THE PRODUCT
 *
 *   revision=1 is the PROFILE DEFAULT, not the site binding. Three tests read it
 *   and reported -Δ-E regressed / fingerprint missing / confirmation not pinned-
 *   when nothing had regressed: revision 1 answers 200 with 4 tests, 0 BOUND, no
 *   fingerprint and a stub confirmation, while the live binding at revision 4 has
 *   all four bound, a real fingerprint and a full confirmation. mappingPath now
 *   asks the analyzer which revision it is on.
 *
 *   TC-14 probed analyzerList[0] rather than an analyzer that has a connection.
 *
 * DELTAS FLIPPED -- these are FIXED and now guard the fix
 *   Δ-S  Add Analyzer opens a clean panel instead of carrying the previous one
 *        forward (it used to make Continue silently rename a real analyzer)
 *   Δ-K  a data-flow field now exists in the connection schema
 *   Δ-V  both lifecycle dialogs interpolate the analyzer name instead of
 *        rendering the literal {name}
 *   Δ-W  for the TEST picker only (TC-08): it narrows on input, for name and
 *        LOINC queries alike
 *
 * A FLIP I GOT WRONG, RECORDED SO NOBODY REPEATS IT
 *   I also flipped Δ-W for the TYPE picker (TC-03), reading the run failure as
 *   -the fix landed-. Probing the live control disproved it: the menu opens with
 *   7 options and typing GeneX leaves 7. It does NOT filter. Reverted. Two
 *   different pickers, two different behaviours -- fixing one did not fix the
 *   other, and a failing flip-when-fixed assertion is a question, not an answer.
 *
 * STILL OPEN -- do not report as defects without more work
 *   TC-03  the before/after option count is unstable inside a full run even after
 *          settling, though a standalone probe reads a stable 7 -> 7. Something
 *          earlier in the file perturbs the list; the QA-created GeneXpert
 *          profiles in it are a likely cause. Needs isolating.
 *   TC-05  cannot click the GeneXpert option in the create flow. The option is
 *          present in the DOM, so this is reachability, not absence.
 *   TC-14  the probe POST answers under 500 but connection.latestProbe stays
 *          null on an analyzer that HAS a connection block. This is the one that
 *          could be a real Δ-L regression. Not filed -- it needs the same
 *          treatment the revision bug got before anyone trusts it.
 */
/**
 * OpenELIS Global — Analyzer guided setup (Instrument → Verify → Connect) QA suite
 * Target: analyzers.openelis-global.org (v3.2.2.0, "M3") · spec baseline: analyzer-profile-mapping.md / OGC-1057
 *
 * RE-BASELINED 2026-08-25 and verified green against the live instance. The previous revision
 * graded v3.2.1.11 and asserted routes (/analyzers/{id}/mappings, /analyzers/{id}/edit,
 * /analyzers/{id}/review) and endpoints (setup-verification, test-mapping-options,
 * result-value-mappings) that 3.2.2.0 no longer serves — it failed on 404s, not on real deltas.
 * Eleven of its thirteen findings are fixed; the two survivors (Δ-K, Δ-R) are carried forward with
 * their original ids, joined by Δ-S, Δ-V and Δ-W. Δ-T, Δ-U and Δ-X were raised during the manual
 * run and WITHDRAWN here on evidence — see harness rule 1 for the one that mattered.
 * Companion doc: analyzer-guided-setup.md.
 *
 * Suites:
 *   TC-ANZ-M3-INSTRUMENT — inline sections, type picker, create/reset behavior
 *   TC-ANZ-M3-VERIFY     — catalog binding, confirmation lifecycle, QC independence
 *   TC-ANZ-M3-CONNECT    — the declarative connection field schema, probe, data flow
 *   TC-ANZ-M3-LIFECYCLE  — activation, deactivation, dialog copy
 *   TC-ANZ-M3-QC         — control-lot validation surfacing
 *
 * FLIP-WHEN-FIXED: assertions tagged Δ-x encode the *current, wrong* behavior. When the fix lands
 * they fail, and the failure IS the signal — flip the assertion to the spec, never relax it.
 * Untagged assertions guard the eleven fixes so they cannot silently regress.
 *
 * FIVE HARNESS RULES THIS FILE DEPENDS ON — every one of them cost a run, or a wrong finding:
 *  1. WRITES NEED CSRF. Every non-GET REST call must carry `X-CSRF-Token`, whose value lives in
 *     `localStorage.CSRF`; without it the server answers 403 with "CSRF token missing or invalid".
 *     THIS IS THE ONE THAT MATTERS MOST. A hand-rolled probe missing the header does not merely
 *     fail — it manufactures a finding. The 2026-08-25 manual run reported a blocker-severity
 *     "activate and deactivate both 500" defect (Δ-T) that did not exist; with the header, every
 *     lifecycle transition returns 200. See apiRaw().
 *  2. THE PICKERS ADVERTISE SEARCH AND DO NOT FILTER. Both are Carbon ComboBoxes pre-filled with
 *     the current selection ("Xpert MTB/RIF · 85362-2"). Typing JUMPS to a name-prefix match and
 *     HIGHLIGHTS it; the option count never changes (183 before, 183 after). Assert the
 *     highlighted option, NEVER the count — measuring the count is what produced two withdrawn
 *     "there is no search" findings. Clear the input first or the jump lands on the old value.
 *  3. THE MAPPING PAGE IS AN ACCORDION, NOT A TABLE. One collapsed row per analyzer code, toggled
 *     by a button labelled `{rawCode}Mapped` / `{rawCode}Do not receive`. Its picker is not
 *     visible, and cannot be clicked, until the row is expanded.
 *  4. THE IN-APP REVIEW WIDGET SWALLOWS CLICKS. `#oe-review-host` sits over the bottom-right and
 *     intercepts pointer events, so row overflow menus never open. hideReviewWidget() removes it.
 *  5. ROWS CARRY STABLE TEST IDS — `[data-testid="analyzer-row-overflow-{id}"]`. Use them instead
 *     of nth-child indexing, which reorders as analyzers change status.
 *
 * Grading: M3. Instrument, the mapping editor and the full analyzer lifecycle all round-trip
 * through a second surface. REPORTABLE is not evidenced only because result ingestion needs the
 * analyzer simulator, which this instance does not have.
 */

import { test, expect, Page } from '@playwright/test';

const BASE = process.env.BASE || 'https://analyzers.openelis-global.org';
const ADMIN = { user: process.env.OE_USER || 'admin', pass: process.env.OE_PASS || 'adminADMIN!' };
const API = '/api/OpenELIS-Global/rest';
const TIMEOUT = 15_000;

/** The profile this suite drives: qualitative, ships control recognition, ASTM. */
const PROFILE_ID = 'genexpert-astm';
const PROFILE_QUERY = 'genexpert';
const STAMP = new Date().toISOString().slice(5, 10).replace('-', '');
/**
 * ONE stable fixture, not a new analyzer every run.
 *
 * This was a per-run stamped name, so TC-ANZ-M3-05 minted a fresh analyzer on
 * every execution. There is NO delete path -- DELETE on an analyzer answers 405
 * -- so they accumulate forever: 11 by the end of 2026-08-27, every one stuck on
 * missing-required-values: port.
 *
 * That was not harmless clutter. It reordered the analyzer list and broke
 * TC-ANZ-M3-13, -14 and -15, which selected fixtures by index. Three tests
 * reported schema and probe regressions that did not exist.
 *
 * So: seed once, reuse thereafter.
 */
const ANALYZER_NAME = 'QA_AUTO_M3_FIXTURE';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

async function login(page: Page): Promise<void> {
  // all-tc.config.ts pre-authenticates via storageState; only fall into the form when genuinely
  // signed out. An expired session can bounce to /login behind a raw
  // `System Error: Unexpected token '<'` modal — dismiss it before filling the form.
  await page.goto(`${BASE}/analyzers`);
  await page.waitForLoadState('domcontentloaded');
  if (!/\/login/i.test(page.url())) return;
  await page.getByRole('button', { name: /^(OK|Close)$/i }).first().click().catch(() => {});
  await page.locator('input[type="text"], input[placeholder*="user" i]').first().fill(ADMIN.user);
  await page.locator('input[type="password"]').first().fill(ADMIN.pass);
  await page.locator('button:has-text("Login"), button[type="submit"]').first().click();
  await page.waitForURL('**/analyzers', { timeout: TIMEOUT }).catch(() => {});
}

/**
 * In-page fetch carrying the session cookie AND the CSRF token the app itself sends.
 * Returns status and body — several findings here live only in the status code, and the UI
 * misreports two of them (see Δ-T's "readiness could not be checked" banner over a 500).
 */
async function apiRaw(
  page: Page,
  path: string,
  init: { method?: string; body?: any } = {},
): Promise<{ status: number; body: any; text: string }> {
  return page.evaluate(
    async ({ u, m, b }) => {
      const headers: Record<string, string> = { Accept: 'application/json', 'Content-Type': 'application/json' };
      // HARNESS RULE 1 — without this every write is a 403 and proves nothing.
      const csrf = window.localStorage.getItem('CSRF');
      if (csrf) headers['X-CSRF-Token'] = csrf;
      const r = await fetch(u, {
        method: m || 'GET',
        credentials: 'include',
        headers,
        body: b === undefined ? undefined : JSON.stringify(b),
      });
      const text = await r.text();
      let body: any = null;
      try {
        body = JSON.parse(text);
      } catch {
        /* plain-string error bodies are common here — see Δ-R */
      }
      return { status: r.status, body, text: text.slice(0, 400) };
    },
    { u: `${API}${path}`, m: init.method, b: init.body },
  );
}

async function api<T = any>(page: Page, path: string): Promise<T> {
  return (await apiRaw(page, path)).body as T;
}

/** GET /analyzer/analyzers is WRAPPED — { analyzers: [...] }, not a bare array. Still true on 3.2.2.0. */
async function analyzerList(page: Page): Promise<any[]> {
  const res = await api<{ analyzers: any[] }>(page, '/analyzer/analyzers');
  return res?.analyzers ?? [];
}

async function detailOf(page: Page, id: string | number): Promise<any> {
  return api<any>(page, `/analyzer/analyzers/${id}`);
}

/** The declarative connection field schema: [{key, labelKey, inputKind, required, choices, visibleWhen}]. */
function connectionFields(detail: any): any[] {
  return detail?.connection?.fields ?? [];
}

/** HARNESS RULE 4 — the review widget host intercepts pointer events over the bottom-right. */
async function hideReviewWidget(page: Page) {
  await page.evaluate(() => {
    const h = document.getElementById('oe-review-host');
    if (h) (h as HTMLElement).style.display = 'none';
  });
}

/**
 * HARNESS RULE 2 — a Carbon ComboBox pre-filled with its current selection. Clear it, then type
 * with real keystrokes. The control JUMPS to a name-prefix match and highlights it; it does not
 * filter, so never assert on the option count.
 */
async function searchCombo(page: Page, selector: string, query: string) {
  const input = page.locator(selector);
  await input.click();
  await input.fill('');
  await page.waitForTimeout(300);
  await input.pressSequentially(query, { delay: 110 });
  await page.waitForTimeout(700);
}

/** HARNESS RULE 3 — expand the accordion row for an analyzer code before touching its picker. */
async function expandMappingRow(page: Page, rawCode: string) {
  await hideReviewWidget(page);
  const input = page.locator(`#analyzer-test-${rawCode}`);
  if (await input.isVisible().catch(() => false)) return;
  await page.getByRole('button', { name: new RegExp(`^${rawCode}`) }).first().click();
  await expect(input).toBeVisible({ timeout: TIMEOUT });
}

/** Carbon overflow-menu items are not always exposed as role=menuitem — match either shape. */
function menuItem(page: Page, name: RegExp) {
  return page.locator('[role="menuitem"], .cds--overflow-menu-options__btn').filter({ hasText: name }).first();
}

/** Open a row's overflow menu by its stable test id (HARNESS RULE 5), past the review widget. */
async function openRowMenu(page: Page, analyzerId: string | number) {
  await hideReviewWidget(page);
  // A confirmed lifecycle modal can stay mounted and keeps intercepting pointer events.
  const modal = page.locator('[data-testid="analyzer-lifecycle-modal"].is-visible');
  if (await modal.count()) {
    await page.keyboard.press('Escape');
    await expect(modal).toHaveCount(0, { timeout: TIMEOUT });
  }
  await page.locator(`[data-testid="analyzer-row-overflow-${analyzerId}"]`).click();
  await page.waitForTimeout(600);
}

/** Lifecycle transitions, driven through the REST surface the UI itself calls. */
async function transition(page: Page, id: string | number, verb: 'activate' | 'deactivate' | 'reactivate') {
  return apiRaw(page, `/analyzer/analyzers/${id}/${verb}`, { method: 'POST', body: {} });
}

/**
 * Drive the Instrument section from a CLEAN list page and return the new analyzer id.
 * Starting clean is deliberate — see Δ-S for what happens when a panel is already open.
 */
async function createAnalyzer(page: Page, name: string): Promise<string> {
  await page.goto(`${BASE}/analyzers`);
  await page.waitForLoadState('networkidle');
  await hideReviewWidget(page);
  await page.getByRole('button', { name: /Add Analyzer/i }).click();
  await expect(page).toHaveURL(/[?&]setup=instrument/, { timeout: TIMEOUT });

  await searchCombo(page, '#analyzer-setup-type', PROFILE_QUERY);
  // The menu populates asynchronously and the matching option can sit below the
  // fold, so waiting on visibility alone times out even though the option exists
  // -- the live list holds a Cepheid GeneXpert row plus several QA-created
  // GeneXpert profiles. Wait for the list to exist, scroll the match into view,
  // then click it.
  const options = page.locator('[role="option"]');
  await options.first().waitFor({ state: 'attached', timeout: 15000 });
  const match = options.filter({ hasText: /GeneXpert/i }).first();
  await match.scrollIntoViewIfNeeded({ timeout: 10000 });
  await match.click();
  await expect(page, 'picking a type should pin it on the URL').toHaveURL(new RegExp(`profile=${PROFILE_ID}`));
  await page.locator('#analyzer-setup-name').fill(name);

  // Lab units are required: with the field empty, Continue issues no request and the panel raises
  // "Select at least one lab unit". (Δ-X, "it fails silently", was withdrawn on that evidence.)
  await page.locator('#analyzer-setup-lab-units-input').click();
  await page.locator('[role="option"]').first().click();
  await page.keyboard.press('Escape');

  const [res] = await Promise.all([
    page.waitForResponse(
      (r) => /\/analyzer\/analyzers$/.test(r.url()) && r.request().method() === 'POST',
      { timeout: TIMEOUT },
    ),
    page.getByRole('button', { name: /Continue to Verify/i }).first().click(),
  ]);
  expect(res.status(), 'create must POST a NEW analyzer, not PUT an existing one').toBe(201);
  const created = await res.json();
  return String(created.id ?? created.analyzerId);
}

/** The first analyzer the server itself reports as ready to activate. */
async function readyAnalyzer(page: Page): Promise<{ id: string; name: string } | null> {
  for (const a of await analyzerList(page)) {
    const r = await api<any>(page, `/analyzer/analyzers/${a.id}/activation-readiness`);
    if (r?.ready && !r?.activated) return { id: String(a.id), name: a.name };
  }
  return null;
}

// ---------------------------------------------------------------------------
// TC-ANZ-M3-INSTRUMENT
// ---------------------------------------------------------------------------

test.describe('TC-ANZ-M3-INSTRUMENT — inline instrument-first setup (FR-B1, B2, B3)', () => {
  test('TC-ANZ-M3-01 Add Analyzer expands inline; the list stays visible [AC-1 · FUNCTION]', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE}/analyzers`);
    await page.getByRole('button', { name: /Add Analyzer/i }).click();

    // 3.2.2.0 drives the whole flow off one route with a ?setup= section — the old
    // /analyzers/{id}/mappings and /analyzers/{id}/edit full-page routes are gone (Δ-A fixed).
    await expect(page).toHaveURL(/\/analyzers\?[^#]*setup=instrument/, { timeout: TIMEOUT });
    await expect(page.locator('main table').first()).toBeVisible();
  });

  test('TC-ANZ-M3-02 the three FRS sections render; no undocumented fourth [AC-2 · RENDER]', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE}/analyzers?setup=instrument`);
    await expect(page.locator('#analyzer-setup-type')).toBeVisible({ timeout: TIMEOUT });
    for (const label of [/Analyzer type/i, /Analyzer name/i, /Lab units/i]) {
      await expect(page.getByText(label).first()).toBeVisible();
    }
    // Δ-B fixed: the undocumented fourth "Review" step is gone. Guard the regression.
    await expect(
      page.getByRole('button', { name: 'Review', exact: true }),
      'a fourth step reappeared — the FRS defines three',
    ).toHaveCount(0);
  });

  test('TC-ANZ-M3-03 Δ-W the type picker advertises search but does not filter [AC-3 · FUNCTION]', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE}/analyzers?setup=instrument`);
    const input = page.locator('#analyzer-setup-type');
    await expect(input).toHaveAttribute('placeholder', /Search analyzer types/i);

    const options = page.locator('[role="option"]');
    await input.click();
    // Let the menu finish populating. Counting immediately after the click reads
    // a half-rendered list and manufactures a difference.
    await options.first().waitFor({ state: 'visible', timeout: 10_000 });
    await page.waitForTimeout(600);
    const before = await options.count();
    expect(before, 'the picker should offer the shipped profiles').toBeGreaterThan(0);

    await searchCombo(page, '#analyzer-setup-type', 'GeneX');
    await page.waitForTimeout(600);
    const after = await options.count();
    console.log(`[Δ-W] type picker: ${before} options before "GeneX", ${after} after`);
    // Δ-W IS STILL OPEN FOR THIS PICKER. I flipped this on 2026-08-27 believing
    // the run failure meant the fix had landed, then probed the live control and
    // found it does NOT filter: the menu opens with 7 options and typing GeneX
    // leaves 7. The flip was wrong and is reverted here.
    //
    // The original failure was a COUNTING artefact, not a behaviour change. The
    // list is still populating when the first count is taken, so before and after
    // disagree for reasons that have nothing to do with filtering. Settle the
    // list before counting -- the same trap as W-2 in the results QA delta doc.
    //
    // Note the TEST picker in TC-ANZ-M3-08 DOES filter, and its assertion is
    // flipped. Two different controls, two different behaviours; do not assume
    // fixing one fixed the other.
    expect(
      after,
      'Δ-W fixed? the type picker now filters -- flip to expect(after).toBeLessThan(before)',
    ).toBe(before);

    // What DOES work is jump-to-match, so selection by keyboard is reachable.
    // Not toHaveCount(1). Now that the picker FILTERS, the narrowed list can hold
    // more than one GeneXpert profile (ASTM and HL7 modes both ship). What must
    // hold is that the match survives the narrowing so it stays selectable.
    await expect(options.filter({ hasText: /GeneXpert/i }).first()).toBeVisible();
    await expect(page, 'typing must not bounce out of the setup panel').toHaveURL(/setup=instrument/);
  });

  test('TC-ANZ-M3-04 "instrument not listed" reaches Create Profile [AC-4/FR-B3 · FUNCTION]', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE}/analyzers?setup=instrument`);

    // Δ-D fixed — the escape hatch exists and hands off to Analyzer Types with a returnTo.
    await page.getByText(/isn'?t listed|not listed|add a new (type|profile)/i).first().click();
    await expect(page).toHaveURL(/\/analyzers\/types(\?|$)/, { timeout: TIMEOUT });
    await page.getByRole('button', { name: /Create Profile/i }).first().click();
    await expect(page).toHaveURL(/action=create/, { timeout: TIMEOUT });

    // DESIGN QUESTION for the PO, not a failure: the modal collects only a name and then reports
    // the draft lives in Analyzer Bridge, so FR-B3's protocol and connection type are defined
    // outside OpenELIS. Logged so a change of scope shows up as a diff.
    const fields = await page.locator('[role="dialog"] input, [role="dialog"] select').count();
    console.log(`[FR-B3] Create Profile collects ${fields} field(s) — the draft completes in Analyzer Bridge`);
  });

  test('TC-ANZ-M3-05 create from a clean list POSTs a new analyzer and it round-trips [FR-B2 · ROUND-TRIP]', async ({ page }) => {
    await login(page);
    // Seed once. If the fixture is already here, exercise the round-trip against
    // it rather than minting another orphan we have no way to remove.
    const existing = (await analyzerList(page)).find((a) => a.name === ANALYZER_NAME);
    const id = existing ? String(existing.id) : await createAnalyzer(page, ANALYZER_NAME);
    console.log(
      (existing ? '[fixture] reusing analyzer ' : '[fixture] seeded analyzer ') +
        id + ' (' + ANALYZER_NAME + ') -- no delete path exists, so we never accumulate',
    );

    // Read back on the LIST endpoint — a different surface than the detail one the form wrote to.
    const row = (await analyzerList(page)).find((a) => String(a.id) === id);
    expect(row, `analyzer ${id} missing from the list endpoint`).toBeTruthy();
    expect(row.name).toBe(ANALYZER_NAME);
    // A freshly seeded analyzer is in SETUP. A reused one may have been walked
    // through activation by TC-ANZ-M3-16, so accept any lifecycle state rather
    // than forcing a fresh create just to keep one assertion literal.
    expect(['SETUP', 'ACTIVE', 'INACTIVE']).toContain(row.status);
    expect(row.profileId, 'the chosen profile did not persist').toBe(PROFILE_ID);
    console.log(`[data] leaving analyzer ${id} (${ANALYZER_NAME}) on the instance — test server, no cleanup`);
  });

  test('TC-ANZ-M3-06 Δ-S Add Analyzer with a panel open reuses the open analyzer [ROUND-TRIP]', async ({ page }) => {
    await login(page);
    const victim = (await analyzerList(page)).find((a) => a.status === 'SETUP');
    test.skip(!victim, 'no SETUP analyzer available to open');
    const originalName = victim.name;

    // Open an existing analyzer's setup, then click Add Analyzer WITHOUT leaving the panel.
    await page.goto(`${BASE}/analyzers?setup=instrument&analyzerId=${victim.id}`);
    await expect(page.locator('#analyzer-setup-name')).toHaveValue(originalName, { timeout: TIMEOUT });

    await page.getByRole('button', { name: /Add Analyzer/i }).click();
    await page.waitForTimeout(1000);
    // The URL sheds analyzerId — the panel looks fresh...
    await expect(page).not.toHaveURL(/analyzerId=/);
    // FLIPPED 2026-08-27. Δ-S is FIXED: the panel now opens clean instead of
    // carrying the previously-open analyzer forward. That mattered because
    // Continue would then PUT the previous analyzer and silently rename it.
    const carried = await page.locator('#analyzer-setup-name').inputValue();
    expect(
      carried,
      'Add Analyzer must open a CLEAN panel, not carry the previous analyzer forward',
    ).toBe('');

    // Kept deliberately un-clicked: while this was broken, Continue renamed a real
    console.log(`[Δ-S] Continue here issues PUT /analyzer/analyzers/${victim.id} — renames "${originalName}"`);
  });
});

// ---------------------------------------------------------------------------
// TC-ANZ-M3-VERIFY
// ---------------------------------------------------------------------------

test.describe('TC-ANZ-M3-VERIFY — catalog binding and confirmation (FR-B4, B5, C1–C3)', () => {
  // REVISION 1 IS THE PROFILE DEFAULT, NOT THE SITE BINDING.
  //
  // This used to default to revision=1, which answers 200 with the shipped
  // profile: 4 tests, 0 BOUND, no bindingFingerprint, and a stub confirmation.
  // The site binding on the analyzers instance is at revision 4 -- 4 tests, all
  // BOUND, a real fingerprint and a confirmation carrying confirmedBy and
  // confirmedAt. So three tests reported Δ-E regressed / fingerprint missing /
  // confirmation not pinned when nothing had regressed at all: they were reading
  // the wrong revision. Measured 2026-08-27.
  //
  // Ask the analyzer which revision it is actually on.
  const liveRevision = async (page: Page): Promise<number | string> => {
    const row = (await analyzerList(page)).find((a) => a.profileId === PROFILE_ID);
    return row?.profileRevision ?? 1;
  };

  const mappingPath = (revision: number | string) =>
    `/analyzer-types/${PROFILE_ID}/mapping?revision=${revision}`;

  test('TC-ANZ-M3-07 rows bind to real catalog tests, carry LOINC, and account for every code [AC-5/FR-C1 · CROSS-LINK]', async ({ page }) => {
    await login(page);
    const mapping = await api<any>(page, mappingPath(await liveRevision(page)));
    expect(Array.isArray(mapping.tests), 'mapping payload shape changed').toBe(true);

    // Δ-E fixed: a bound row carries a resolved catalog test object, not a test_name_hint string.
    const bound = mapping.tests.filter((t: any) => t.mappingState === 'BOUND');
    expect(bound.length, 'Δ-E regressed? no row resolves to a catalog test').toBeGreaterThan(0);
    for (const t of bound) {
      expect(t.testId, `${t.rawCode} is BOUND with no testId`).toBeTruthy();
      expect(t.selectedTest?.name, `${t.rawCode} has no resolved catalog test`).toBeTruthy();
    }
    expect(bound.some((t: any) => t.loinc), 'the LOINC column lost its data').toBe(true);

    // Δ-F fixed: every code has an explicit disposition. Nothing is silently dropped any more.
    const states = mapping.tests.map((t: any) => t.mappingState);
    console.log(`[Δ-F] ${mapping.tests.length} codes: ${JSON.stringify(states)}`);
    expect(
      states.every((s: string) => !!s),
      'Δ-F regressed? a code carries no mappingState — that is the silent-drop failure mode',
    ).toBe(true);

    // Δ-H fixed: control recognition is stated, so QC codes can be confirmed rather than guessed.
    expect(mapping.controlRecognition, 'Δ-H regressed? control recognition is gone').toBeTruthy();
  });

  test('TC-ANZ-M3-08 Δ-W the test picker offers the whole catalog but only jumps, never filters [FR-C2 · RENDER]', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE}/analyzers/types/${PROFILE_ID}/mapping?revision=${await liveRevision(page)}`);
    const mapping = await api<any>(page, mappingPath(await liveRevision(page)));
    const rawCode = mapping.tests[0].rawCode;
    await expandMappingRow(page, rawCode);

    const input = page.locator(`#analyzer-test-${rawCode}`);
    // Δ-P fixed: a per-row picker exists at all. Δ-E's second half: it is the WHOLE catalog, not
    // the fixed 13 legacy tests 3.2.1.11 offered, and not lab-unit scoped.
    await expect(input).toHaveAttribute('placeholder', /name, code, or LOINC/i);
    await input.click();
    await input.fill('');
    await page.waitForTimeout(700);
    const offered = await page.locator('[role="option"]').count();
    const catalog = await api<any[]>(page, '/displayList/ALL_TESTS');
    console.log(`[FR-C2] picker offers ${offered} of ${catalog.length} catalog tests`);
    expect(offered, 'the picker no longer offers the full catalog').toBeGreaterThanOrEqual(catalog.length);

    // FLIPPED 2026-08-27. Δ-W is FIXED here too: the test picker now narrows on
    // input instead of only jumping to a name-prefix match.
    await input.pressSequentially('Hemato', { delay: 110 });
    await page.waitForTimeout(800);
    expect(
      await page.locator('[role="option"]').count(),
      'the test picker must narrow the list as you type',
    ).toBeLessThan(offered);
    await expect(
      page.locator('[role="option"][aria-selected="true"], .cds--list-box__menu-item--highlighted').first(),
    ).toContainText(/Hemato/i);

    // LOINC jump works too, and must not regress — the placeholder promises it.
    await input.fill('');
    await page.waitForTimeout(400);
    await input.pressSequentially('85362', { delay: 110 });
    await page.waitForTimeout(800);
    const hit = await page
      .locator('[role="option"][aria-selected="true"], .cds--list-box__menu-item--highlighted')
      .allInnerTexts();
    console.log(`[FR-C2] LOINC "85362" highlights: ${JSON.stringify(hit)}`);
    expect(hit.join('|'), 'LOINC jump-to-match regressed').toMatch(/85362/);
    // FLIPPED 2026-08-27 alongside the name-query half above: a LOINC query
    // narrows the list as well, it does not merely highlight within the full one.
    expect(
      await page.locator('[role="option"]').count(),
      'a LOINC query must narrow the list, not just highlight inside the full one',
    ).toBeLessThan(offered);
  });

  test('TC-ANZ-M3-09 the mapping is a versioned, fingerprinted artefact [FR-C2 · ROUND-TRIP]', async ({ page }) => {
    await login(page);
    const mapping = await api<any>(page, mappingPath(await liveRevision(page)));

    // Δ-O fixed: bindings persist. The fingerprint is what makes a change detectable at all, and
    // it is the mechanism the confirmation staling in TC-ANZ-M3-10 depends on.
    expect(mapping.bindingFingerprint, 'no bindingFingerprint — staling cannot work').toMatch(/^sha256:/);
    expect(mapping.siteBindingId, 'no site binding — the change would edit the shipped profile').toBeTruthy();
    expect(mapping.profileRevision).toBeTruthy();

    // Result values round-trip too: the 3.2.1.11 blocker was an unbound qualitative value that
    // could not be saved at all.
    const withResults = mapping.tests.filter((t: any) => (t.results ?? []).length);
    expect(withResults.length, 'no result-value rows to grade').toBeGreaterThan(0);
    const boundValues = withResults.flatMap((t: any) => t.results).filter((r: any) => r.mappingState === 'BOUND');
    expect(boundValues.length, 'Δ-O regressed? no result value is bound').toBeGreaterThan(0);
    for (const r of boundValues) expect(r.resultOptionId, `${r.rawValue} BOUND with no option id`).toBeTruthy();
  });

  test('TC-ANZ-M3-10 the confirmation is pinned to the binding it signed [AC-6/FR-B4 · FUNCTION]', async ({ page }) => {
    await login(page);
    const mapping = await api<any>(page, mappingPath(await liveRevision(page)));

    // Δ-G fixed: confirmation is a real, recorded, staleable artefact — not an unreachable button.
    const c = mapping.confirmation;
    expect(c, 'confirmation object missing').toBeTruthy();
    expect(c.bindingFingerprint, 'confirmation is not pinned to a binding — it cannot go stale').toMatch(/^sha256:/);
    expect(c.recognitionFingerprint, 'confirmation is not pinned to control recognition').toMatch(/^sha256:/);

    const stale = c.state !== 'CURRENT' || c.bindingFingerprint !== mapping.bindingFingerprint;
    console.log(`[AC-6] confirmation state=${c.state} stale=${stale}`);
    if (stale) {
      // While stale, Continue must be blocked — that is the gate the FRS asks for.
      await page.goto(`${BASE}/analyzers/types/${PROFILE_ID}/mapping?revision=${await liveRevision(page)}`);
      await expect(page.getByRole('button', { name: /Confirm mappings/i }).first()).toBeVisible({ timeout: TIMEOUT });
    }
  });

  test('TC-ANZ-M3-11 a CURRENT confirmation records who signed it and when [AC-6 · PERSIST]', async ({ page }) => {
    await login(page);
    const c = (await api<any>(page, mappingPath(await liveRevision(page)))).confirmation;
    test.skip(c?.state !== 'CURRENT', 'mapping is not currently confirmed');

    expect(c.confirmedBy ?? c.signer, 'sign-off has no signer').toBeTruthy();
    expect(c.confirmedAt ?? c.timestamp, 'sign-off has no timestamp').toBeTruthy();
    console.log(`[AC-6] confirmed by ${c.confirmedByDisplayName ?? c.confirmedBy} at ${c.confirmedAt ?? c.timestamp}`);
  });

  test('TC-ANZ-M3-12 QC readiness does not gate activation [AC-9/FR-C3 · CROSS-LINK]', async ({ page }) => {
    await login(page);
    const seen: string[] = [];
    for (const a of (await analyzerList(page)).slice(0, 12)) {
      const r = await api<any>(page, `/analyzer/analyzers/${a.id}/activation-readiness`);
      for (const b of r?.blockers ?? []) seen.push(String(b));
    }
    console.log(`[AC-9] activation blockers in play: ${[...new Set(seen)].join(', ') || 'none'}`);

    // Δ-J / Δ-M fixed: NO_ACTIVE_CONTROL_LOT and NO_ACTIVE_QC_RULE are no longer activation gates.
    expect(
      seen.some((b) => /CONTROL_LOT|QC_RULE|controlLot|qcRule/i.test(b)),
      'QC coupling regressed — the FRS never asks for it and MC-4 puts it out of scope here',
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-ANZ-M3-CONNECT
// ---------------------------------------------------------------------------

test.describe('TC-ANZ-M3-CONNECT — connection settings and probe (FR-F1, F2, B6)', () => {
  test('TC-ANZ-M3-13 the connection schema declares role-conditional visibility [FR-F1 · RENDER]', async ({ page }) => {
    await login(page);
    const target = (await transportAnalyzer(page))!;
    test.skip(!target, 'no transport-based analyzer here; this instance schema is file-drop');
    const detail = await detailOf(page, target.id);
    const fields = connectionFields(detail);
    expect(fields.length, 'connection field schema missing from the analyzer detail').toBeGreaterThan(0);

    const byKey = Object.fromEntries(fields.map((f: any) => [f.key, f]));
    expect(byKey.transport?.choices?.map((c: any) => c.value)).toEqual(expect.arrayContaining(['RS-232', 'TCP/IP']));
    expect(byKey.connectionRole?.choices?.map((c: any) => c.value)).toEqual(expect.arrayContaining(['SERVER', 'CLIENT']));

    // The server, not the client, decides what a given role needs — host only when we DIAL OUT.
    expect(byKey.connectionRole?.visibleWhen).toMatchObject({ fieldKey: 'transport', operator: 'NOT_EQUALS', value: 'RS-232' });
    expect(byKey.host?.visibleWhen).toMatchObject({ fieldKey: 'connectionRole', operator: 'EQUALS', value: 'CLIENT' });
    console.log(`[FR-F1] connection fields: ${fields.map((f: any) => f.key).join(', ')}`);
  });

  test('TC-ANZ-M3-14 the connection probe is real and its outcome is recorded [AC-10/FR-B6 · FUNCTION]', async ({ page }) => {
    await login(page);
    const target = (await probeableAnalyzer(page))!;
    test.skip(!target, 'no analyzer on this instance is ready enough to probe');

    // Δ-L fixed: 3.2.1.11 issued NO request at all. A FAILED probe is a pass for this case — what
    // matters is that a request goes out and the outcome is persisted against a config revision.
    const res = await apiRaw(page, `/analyzer/analyzers/${target.id}/test`, { method: 'POST', body: {} });
    expect(res.status, `probe endpoint answered ${res.status} :: ${res.text}`).toBeLessThan(500);

    // THE PROBE IS ASYNCHRONOUS. The POST enqueues it and returns; latestProbe is
    // not written until the attempt completes. Reading straight after the POST
    // gets null, which this test reported as -Δ-L regressed?- for two runs while
    // the feature was working. Poll instead.
    let probe: any = null;
    for (let i = 0; i < 12 && !probe; i++) {
      probe = (await detailOf(page, target.id)).connection?.latestProbe;
      if (!probe) await page.waitForTimeout(2000);
    }
    expect(probe, 'Δ-L regressed? no probe result recorded within 24s of the request').toBeTruthy();
    expect(probe.status, 'probe recorded no outcome').toMatch(/SUCCE|FAIL|ERROR|TIMEOUT/i);
    expect(probe.configRevision, 'the probe is not pinned to the config it tested').toBeTruthy();
    console.log(`[FR-B6] latest probe: ${probe.status} @ configRevision ${probe.configRevision}`);
  });

  test('TC-ANZ-M3-15 Δ-K no Results-only / Two-way data-flow control exists [AC-10/FR-F2 · RENDER]', async ({ page }) => {
    await login(page);
    const target = (await transportAnalyzer(page))!;
    test.skip(!target, 'no transport-based analyzer here; this instance schema is file-drop');
    const keys = connectionFields(await detailOf(page, target.id)).map((f: any) => f.key);

    // What ships is who OPENS THE SOCKET (connectionRole) and over what TRANSPORT — not FR-F2's
    // WHAT FLOWS: results only, versus two-way order/query exchange. Asserted against the schema
    // rather than the DOM, because the schema is what the UI renders from.
    expect(keys).toEqual(expect.arrayContaining(['transport', 'connectionRole']));
    // FLIPPED 2026-08-27. Δ-K is FIXED: a data-flow field now exists in the
    // schema. What flows -- results only, versus two-way order/query exchange --
    // is a clinical distinction, so the control existing at all is the fix.
    expect(
      keys.filter((k: string) => /dataFlow|direction|oneWay|twoWay|results?Only|orders?/i.test(k)),
      'a data-flow control must exist: results-only and two-way are not interchangeable',
    ).not.toHaveLength(0);

    await page.goto(`${BASE}/analyzers?setup=connect&analyzerId=${target.id}`);
    await expect(
      page.getByText(/Results only|Two-way \(send orders/i),
      'Δ-K fixed in the UI? flip this too',
    ).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// TC-ANZ-M3-LIFECYCLE — the headline. Nothing downstream of ACTIVE is reachable.
// ---------------------------------------------------------------------------

test.describe('TC-ANZ-M3-LIFECYCLE — activate / deactivate / reactivate (FR-A3, AC-17)', () => {
  /**
   * WITHDRAWN: Δ-T ("activate and deactivate both 500") and Δ-U ("reactivate is untestable").
   * Both were raised in the 2026-08-25 manual run from hand-rolled POSTs that omitted the CSRF
   * header (harness rule 1). With the header every transition returns 200, on two analyzers, and
   * the UI drives them correctly. The cases below now GUARD the working lifecycle instead — they
   * are the regression net for the thing that was almost filed as a blocker.
   */

  test('TC-ANZ-M3-16 activation succeeds when readiness reports ready [AC-17 · FUNCTION]', async ({ page }) => {
    await login(page);
    const ready = await readyAnalyzer(page);
    test.skip(!ready, 'no analyzer currently reports ready:true');

    const readiness = await apiRaw(page, `/analyzer/analyzers/${ready!.id}/activation-readiness`);
    expect(readiness.body.ready, 'precondition').toBe(true);
    expect(readiness.body.blockers ?? []).toHaveLength(0);

    const res = await transition(page, ready!.id, 'activate');
    console.log(`[AC-17] analyzer ${ready!.id}: activate ${res.status} :: ${res.text}`);
    expect(res.status, 'readiness and the transition must agree — they did not on the first look').toBe(200);
    expect(res.body).toMatchObject({ status: 'ACTIVE', activated: true });
    expect((await detailOf(page, ready!.id)).status).toBe('ACTIVE');
  });

  test('TC-ANZ-M3-16b the not-ready path returns a named 422, not a 500 [FUNCTION]', async ({ page }) => {
    await login(page);
    let notReady: any = null;
    for (const a of await analyzerList(page)) {
      const r = await api<any>(page, `/analyzer/analyzers/${a.id}/activation-readiness`);
      if (r && r.ready === false) { notReady = a; break; }
    }
    test.skip(!notReady, 'every analyzer currently reports ready — nothing to grade here');

    const res = await transition(page, notReady.id, 'activate');
    expect(res.status, `not-ready activate answered ${res.status} :: ${res.text}`).toBe(422);
    expect(JSON.stringify(res.body ?? res.text)).toMatch(/analyzer\.(activation|connection)\./);
  });

  test('TC-ANZ-M3-17 deactivate → reactivate round-trips through the API [AC-17/FR-A3 · ROUND-TRIP]', async ({ page }) => {
    await login(page);
    const target = (await analyzerList(page)).find((a) => a.status === 'ACTIVE') ?? (await analyzerList(page))[0];
    const started = (await detailOf(page, target.id)).status;

    const off = await transition(page, target.id, 'deactivate');
    expect(off.status, `deactivate answered ${off.status} :: ${off.text}`).toBe(200);
    expect(off.body).toMatchObject({ status: 'INACTIVE', deactivated: true });
    expect((await detailOf(page, target.id)).status).toBe('INACTIVE');

    const on = await transition(page, target.id, 'reactivate');
    expect(on.status, `reactivate answered ${on.status} :: ${on.text}`).toBe(200);
    expect((await detailOf(page, target.id)).status).toBe('ACTIVE');
    console.log(`[AC-17] analyzer ${target.id}: ${started} → INACTIVE → ACTIVE`);
  });

  test('TC-ANZ-M3-17b the lifecycle is reachable from the UI, and Delete is not [AC-17/FR-A3 · FUNCTION]', async ({ page }) => {
    await login(page);
    const target = (await analyzerList(page)).find((a) => a.status === 'ACTIVE');
    test.skip(!target, 'no ACTIVE analyzer to deactivate through the UI');

    await page.goto(`${BASE}/analyzers`);
    await page.waitForLoadState('networkidle');
    await openRowMenu(page, target.id);
    const items = await page.locator('[role="menuitem"], .cds--overflow-menu-options__btn').allInnerTexts();
    console.log(`[AC-17] row menu (active): ${JSON.stringify(items)}`);

    // Δ-N fixed and must stay fixed: deactivate, never hard-delete (LIMS constitution).
    expect(items.join('|')).toMatch(/Deactivate/i);
    expect(items.join('|'), 'a hard Delete came back').not.toMatch(/Delete/i);

    const [res] = await Promise.all([
      page.waitForResponse((r) => /\/deactivate$/.test(r.url()), { timeout: TIMEOUT }),
      (async () => {
        await menuItem(page, /Deactivate/i).click();
        await page
          .locator('[role="dialog"]')
          .filter({ hasText: /Deactivate/i })
          .first()
          .getByRole('button', { name: /Deactivate analyzer/i })
          .click();
      })(),
    ]);
    expect(res.status(), 'the UI deactivate path must reach the server cleanly').toBe(200);

    // Reactivate is offered only once the analyzer is inactive.
    await page.reload();
    await page.waitForLoadState('networkidle');
    await openRowMenu(page, target.id);
    const inactiveItems = await page.locator('[role="menuitem"], .cds--overflow-menu-options__btn').allInnerTexts();
    expect(inactiveItems.join('|'), 'Δ-U regressed? reactivate is unreachable again').toMatch(/Reactivate/i);

    const [back] = await Promise.all([
      page.waitForResponse((r) => /\/reactivate$/.test(r.url()), { timeout: TIMEOUT }),
      (async () => {
        await menuItem(page, /Reactivate/i).click();
        await page
          .locator('[role="dialog"]')
          .filter({ hasText: /Reactivate/i })
          .first()
          .getByRole('button', { name: /Reactivate analyzer/i })
          .click();
      })(),
    ]);
    expect(back.status()).toBe(200);
    expect((await detailOf(page, target.id)).status, 'left the analyzer inactive').toBe('ACTIVE');
  });

  test('TC-ANZ-M3-18 Δ-V both lifecycle dialogs render the literal {name} placeholder [RENDER]', async ({ page }) => {
    await login(page);
    const target = (await analyzerList(page))[0];
    await page.goto(`${BASE}/analyzers?lifecycle=deactivate&lifecycleAnalyzerId=${target.id}`);

    // NOTE: a hidden "Still There?" session modal also matches [role="dialog"] — select by content.
    const dialog = page.locator('[role="dialog"]').filter({ hasText: /Deactivate/i }).first();
    await expect(dialog).toBeVisible({ timeout: TIMEOUT });

    // Same defect class as the old Delete-dialog placeholder bug (NOTE-22) — it moved with the
    // rename, and it is in BOTH dialogs:
    //   "Deactivate {name}? New runtime use will stop..."
    //   "Reactivate {name}? Its setup will be checked again before it can be used."
    // FLIPPED 2026-08-27. Δ-V is FIXED: both lifecycle dialogs now interpolate
    // the analyzer name instead of rendering the literal placeholder. A
    // technician confirming a deactivation can see WHICH instrument they are
    // about to stop.
    await expect(
      dialog,
      'the dialog must name the analyzer, not render the literal placeholder',
    ).toContainText(target.name);
    await expect(dialog, 'the {name} placeholder must not survive to the user').not.toContainText('{name}');

    await page.getByRole('button', { name: /Cancel deactivation/i }).click();
  });
});

// ---------------------------------------------------------------------------
// TC-ANZ-M3-QC
// ---------------------------------------------------------------------------

test.describe('TC-ANZ-M3-QC — control lots and QC surfacing', () => {
  test('TC-ANZ-M3-19 Δ-R control-lot validation is hidden behind a generic banner [FUNCTION]', async ({ page }) => {
    await login(page);

    // Reported 2026-08-12 and shipped again unchanged. Driven through the FORM, not a hand-rolled
    // body: a synthetic payload trips Spring's deserializer and returns a 400 for the wrong reason,
    // which proves nothing. The real server response, captured from the app's own request during
    // the manual run, is:
    //   POST /rest/qc/controlLot → 400 "Manufacturer fixed method requires both mean and standard
    //                                   deviation"
    // ...while the banner says only "Failed to save control lot", and Mean/SD sit behind
    // Statistics Configuration → Configure, unmarked as required.
    await page.goto(`${BASE}/analyzers/qc/control-lots/new`);
    await page.waitForLoadState('networkidle');
    await hideReviewWidget(page);
    await expect(page.getByText(/Control Lot/i).first()).toBeVisible({ timeout: TIMEOUT });

    await expect(
      page.locator('main label').filter({ hasText: /^\s*(Mean|Standard deviation|SD)\b/i }),
      'Δ-R fixed? flip to assert Mean and SD are visible on the form and marked required',
    ).toHaveCount(0);
    await expect(
      page.getByText(/Statistics Configuration/i).first(),
      'the fields the save requires are still parked behind this section',
    ).toBeVisible();
  });

});

/**
 * READINESS, not merely the presence of a connection block.
 *
 * Every analyzer here carries a connection object, so filtering on that alone
 * still picks one of the QA_AUTO rows TC-ANZ-M3-05 leaves behind, each blocked
 * on missing-required-values: port. Probing an unready analyzer records nothing,
 * which TC-ANZ-M3-14 then reported as Delta-L regressed.
 *
 * Delta-L IS FIXED. Measured 2026-08-27 by reading every analyzer: id 2 holds a
 * SUCCEEDED probe, ids 4 and 6 hold FAILED ones, each pinned to a
 * configRevision. A FAILED probe is a pass for that test -- what matters is that
 * the outcome is persisted at all.
 */
async function probeableAnalyzer(page: Page): Promise<any | null> {
  // Never select a QA-created row. Even now that seeding has stopped adding to
  // them, the ones already on the instance must not be chosen as a fixture.
  for (const a of (await analyzerList(page)).filter((x: any) => !/^QA_AUTO/.test(String(x.name)))) {
    const d = await detailOf(page, a.id);
    if (d && d.connection && d.connection.readiness && d.connection.readiness.ready === true) return a;
  }
  return null;
}

/**
 * An analyzer whose connection schema is TRANSPORT-based (serial / TCP).
 *
 * The schema is declarative PER PROFILE, so a FILE-protocol instrument
 * legitimately has dataFlow / directory / filePattern and no transport at all.
 * Asserting transport against analyzerList[0] fails whenever the first row is a
 * file-drop analyzer -- which it became once TC-ANZ-M3-05 started leaving
 * QA_AUTO rows behind. A fixture-ordering failure dressed as a schema
 * regression.
 */
async function transportAnalyzer(page: Page): Promise<any | null> {
  // Never select a QA-created row. Even now that seeding has stopped adding to
  // them, the ones already on the instance must not be chosen as a fixture.
  for (const a of (await analyzerList(page)).filter((x: any) => !/^QA_AUTO/.test(String(x.name)))) {
    const d = await detailOf(page, a.id);
    if (connectionFields(d).some((f: any) => f.key === 'transport')) return a;
  }
  return null;
}
