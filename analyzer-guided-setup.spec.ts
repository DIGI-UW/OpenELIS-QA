/**
 * OpenELIS Global — Analyzer guided setup (Instrument → Verify → Connect) QA suite
 * Target: analyzers.openelis-global.org (v3.2.2.0, "M3") · spec baseline: analyzer-profile-mapping.md / OGC-1057
 *
 * RE-BASELINED 2026-08-25 and verified green against the live instance. The previous revision
 * graded v3.2.1.11 and asserted routes (/analyzers/{id}/mappings, /analyzers/{id}/edit,
 * /analyzers/{id}/review) and endpoints (setup-verification, test-mapping-options,
 * result-value-mappings) that 3.2.2.0 no longer serves — it failed on 404s, not on real deltas.
 *
 * UPDATED 2026-08-27 after a third retest on a fresh seed. Four things were fixed and their
 * flip-when-fixed assertions have been FLIPPED to guard the fix — Δ-K (a dataFlow field now
 * ships), Δ-V (the lifecycle dialogs interpolate the name), Δ-W for the ANALYZER-TYPE picker
 * (it filters), and Δ-S's data-integrity half. Four new findings were added as TC-ANZ-M3-20…23:
 * Δ-AA (Duplicate Profile discards every mapping decision and drops the UNRESOLVED value),
 * Δ-AB (the catalog reports COMPLETE while results are held, and never updates), Δ-AC (an
 * undeclared analyzer code has no resolution path), Δ-AD (a confirmed mapping change is not
 * audited). Δ-R is unchanged for the third round running and its case has been rewritten to
 * assert what actually happens now — Save issues no request at all.
 *
 * SEED DRIFT — READ THIS BEFORE DEBUGGING A 400. The shipped profiles are re-published between
 * seeds: genexpert-astm was revision 1 on 2026-08-25 and is revision 4 on 2026-08-27, and
 * /analyzer-types/{id}/mapping REQUIRES an exact ?revision=. Nothing here hardcodes a revision any
 * more; profileRevision() reads it from the catalog. The seed also now creates site-derived
 * duplicates of its own, so the type picker's option count is not a fixed number either.
 *
 * Companion doc: analyzer-guided-setup.md.
 *
 * Suites:
 *   TC-ANZ-M3-INSTRUMENT — inline sections, type picker, create/reset behavior
 *   TC-ANZ-M3-VERIFY     — catalog binding, confirmation lifecycle, QC independence
 *   TC-ANZ-M3-CONNECT    — the declarative connection field schema, probe, data flow
 *   TC-ANZ-M3-LIFECYCLE  — activation, deactivation, dialog copy
 *   TC-ANZ-M3-QC         — control-lot save
 *   TC-ANZ-M3-CATALOG    — duplicate/fork fidelity, catalog completeness, held-result routing, audit
 *
 * FLIP-WHEN-FIXED: assertions tagged Δ-x encode the *current, wrong* behavior. When the fix lands
 * they fail, and the failure IS the signal — flip the assertion to the spec, never relax it.
 * Untagged assertions guard the fixes so they cannot silently regress.
 *
 * SEVEN HARNESS RULES THIS FILE DEPENDS ON — every one of them cost a run, or a wrong finding:
 *  1. WRITES NEED CSRF. Every non-GET REST call must carry `X-CSRF-Token`, whose value lives in
 *     `localStorage.CSRF`; without it the server answers 403 with "CSRF token missing or invalid".
 *     THIS IS THE ONE THAT MATTERS MOST. A hand-rolled probe missing the header does not merely
 *     fail — it manufactures a finding. The 2026-08-25 manual run reported a blocker-severity
 *     "activate and deactivate both 500" defect (Δ-T) that did not exist; with the header, every
 *     lifecycle transition returns 200. See apiRaw().
 *  2. THE ANALYZER-TYPE PICKER NOW FILTERS; THE MAPPING TEST PICKER WAS NOT RE-TESTED. As of
 *     2026-08-27 typing "Fluo" into #analyzer-setup-type narrows the list. The per-row test picker
 *     on the mapping page still has the old jump-don't-filter assertion because focus could not be
 *     driven into it cleanly on the retest — it is FLAGGED, not verified. Both controls are Carbon
 *     ComboBoxes pre-filled with the current selection, so clear the input before typing or the
 *     jump lands on the old value.
 *  3. THE MAPPING PAGE IS AN ACCORDION, NOT A TABLE. One collapsed row per analyzer code, toggled
 *     by a button labelled `{rawCode}Mapped` / `{rawCode}Do not receive`. Its picker is not
 *     visible, and cannot be clicked, until the row is expanded.
 *  4. THE IN-APP REVIEW WIDGET SWALLOWS CLICKS. `#oe-review-host` sits over the bottom-right and
 *     intercepts pointer events, so row overflow menus never open. hideReviewWidget() removes it.
 *  5. ROWS CARRY STABLE TEST IDS — `[data-testid="analyzer-row-overflow-{id}"]`. Use them instead
 *     of nth-child indexing, which reorders as analyzers change status.
 *  6. NEVER HARDCODE A PROFILE REVISION. See SEED DRIFT above. Use profileRevision().
 *  7. THE HELD-RESULTS BANNER STEALS FOCUS ON MOUNT. It is only present when an analyzer is
 *     actually holding results, so it comes and goes with the seed — which makes it look like
 *     flake. It is a Carbon ActionableNotification with hideCloseButton; Escape dismisses it.
 *     dismissHeldResultsBanner() does that, and openCombo() waits for a listbox to really mount
 *     rather than counting options the instant after a click. Skipping either produces a combobox
 *     that opens but never takes the query, or an option count of 0 — both of which read as app
 *     defects and are not.
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
const ANALYZER_NAME = `QA_AUTO_${STAMP}_m3`;
/**
 * Analyzer names may repeat; PROFILE displayNames may not — the server answers
 * `400 "displayName already exists"`. STAMP is date-only, so a second run on the same day collided
 * and failed TC-ANZ-M3-20 as if Duplicate were broken. Anything that names a PROFILE uses this.
 */
const RUN = `${STAMP}_${Date.now().toString(36).slice(-5)}`;

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

/** The whole Analyzer Types catalog: { schemaVersion, catalogFingerprint, summary, types[] }. */
async function typeCatalog(page: Page): Promise<any> {
  return api<any>(page, '/analyzer-types');
}

/**
 * HARNESS RULE 6 — the shipped revision moves between seeds (1 on 2026-08-25, 4 on 2026-08-27) and
 * /mapping REQUIRES an exact ?revision=. Read it, never assume it.
 */
async function profileRevision(page: Page, profileId: string = PROFILE_ID): Promise<number> {
  const t = (await typeCatalog(page))?.types?.find((x: any) => x.profileId === profileId);
  expect(t, `profile ${profileId} is not in the catalog — did the seed change?`).toBeTruthy();
  return t.revision;
}

async function mappingOf(page: Page, profileId: string = PROFILE_ID, revision?: number): Promise<any> {
  const rev = revision ?? (await profileRevision(page, profileId));
  return api<any>(page, `/analyzer-types/${profileId}/mapping?revision=${rev}`);
}

/** Count result values by mappingState across every test row — the number Δ-AB disagrees with. */
function resultStateCounts(mapping: any): Record<string, number> {
  const c: Record<string, number> = {};
  for (const t of mapping.tests ?? []) for (const r of t.results ?? []) c[r.mappingState] = (c[r.mappingState] ?? 0) + 1;
  return c;
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
 * HARNESS RULE 7 — the held-results banner steals focus on mount, and it is only present when an
 * analyzer is actually holding results, so it comes and goes with the seed.
 *
 * It is a Carbon ActionableNotification rendered with `hideCloseButton`, and `hasFocus` puts focus
 * on its action button when it mounts. For a window after each render, clicks and focus() calls on
 * other controls get pulled back to it — which shows up here as a combobox that opens but never
 * receives the typed query, or an option list that reads 0 immediately after a click. Escape
 * dismisses it. Call this after any navigation that lands on /analyzers before touching the form.
 *
 * This is also a real (minor) product finding — see the report. Documented here because a run that
 * does not do this is nondeterministic in a way that looks like an app defect.
 */
async function dismissHeldResultsBanner(page: Page) {
  const banner = page.locator('.cds--actionable-notification');
  if (await banner.count()) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }
}

/**
 * Open a Carbon ComboBox and wait for its listbox to actually mount before counting anything.
 *
 * A single click is not reliable here. On a direct `?setup=instrument` load the control can be
 * present but not yet listening, and the banner (rule 7) can pull focus back mid-click — either
 * way the click toggles nothing and `[role="option"]` stays empty. ArrowDown opens a Carbon
 * ComboBox from the keyboard and is the dependable fallback. Escalate rather than assume.
 */
async function openCombo(page: Page, selector: string) {
  const input = page.locator(selector);
  const options = page.locator('[role="option"]');
  await expect(input, `${selector} never rendered`).toBeVisible({ timeout: TIMEOUT });

  for (const attempt of ['click', 'arrow', 'click'] as const) {
    if (await options.count()) return input;
    if (attempt === 'click') await input.click().catch(() => {});
    else await input.press('ArrowDown').catch(() => {});
    await page.waitForTimeout(600);
  }
  await expect(
    options.first(),
    'the combobox listbox never opened after click → ArrowDown → click. Banner focus-steal ' +
      '(harness rule 7), or the control is not hydrated yet.',
  ).toBeVisible({ timeout: TIMEOUT });
  return input;
}

/**
 * HARNESS RULE 2 — a Carbon ComboBox pre-filled with its current selection.
 *
 * DO NOT use `fill('')` here. That was fine while the control did not filter: the menu stayed
 * fully populated, so a stale/closed listbox was invisible to the caller. Now that the
 * analyzer-type picker DOES filter (Δ-W fixed 2026-08-27), `fill('')` fires Carbon's clear, which
 * CLOSES the listbox — the subsequent keystrokes then filter a menu that is not mounted, and
 * `[role="option"]` counts 0. That is what made TC-ANZ-M3-03 and -05 fail on the first run of this
 * revision, and it was the harness, not the app.
 *
 * Select-all-then-type replaces the pre-filled value in place and leaves the menu open.
 */
async function searchCombo(page: Page, selector: string, query: string) {
  await dismissHeldResultsBanner(page);
  const input = await openCombo(page, selector);
  await input.press('ControlOrMeta+a');
  await input.pressSequentially(query, { delay: 90 });
  await expect(input, 'the combobox did not take the typed query — check focus').toHaveValue(
    new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
    { timeout: TIMEOUT },
  );
  await page.waitForTimeout(500);
  // Carbon closes the listbox on some paths; reopen WITHOUT clearing the query.
  if ((await page.locator('[role="option"]').count()) === 0) {
    await input.press('ArrowDown');
    await page.waitForTimeout(400);
  }
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
  await dismissHeldResultsBanner(page);
  await page.getByRole('button', { name: /Add Analyzer/i }).click();
  await expect(page).toHaveURL(/[?&]setup=instrument/, { timeout: TIMEOUT });

  await searchCombo(page, '#analyzer-setup-type', PROFILE_QUERY);
  await page.locator('[role="option"]').filter({ hasText: /GeneXpert/i }).first().click();
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

/**
 * READINESS, not merely the presence of a connection block.
 *
 * Every analyzer here carries a connection object, so filtering on that alone still picks one of
 * the QA_AUTO rows TC-ANZ-M3-05 leaves behind, each blocked on missing-required-values: port.
 * Probing an unready analyzer records nothing, which TC-ANZ-M3-14 then reported as Δ-L regressed.
 *
 * Δ-L IS FIXED. Measured 2026-08-27 by reading every analyzer: one holds a SUCCEEDED probe, others
 * hold FAILED ones, each pinned to a configRevision. A FAILED probe is a pass for that test — what
 * matters is that the outcome is persisted at all.
 *
 * (From the parallel re-baseline, aac6442. Kept verbatim in intent — it is a better fixture rule
 * than "has a connection block", which was this file's earlier attempt at the same fix.)
 */
async function probeableAnalyzer(page: Page): Promise<any | null> {
  for (const a of await analyzerList(page)) {
    const d = await detailOf(page, a.id);
    if (d?.connection?.readiness?.ready === true) return a;
  }
  return null;
}

/**
 * An analyzer whose connection schema is TRANSPORT-based (serial / TCP).
 *
 * The schema is declarative PER PROFILE, so a FILE-protocol instrument legitimately has
 * dataFlow / directory / filePattern and no transport at all. Asserting transport against
 * analyzerList[0] fails whenever the first row is a file-drop analyzer — which it became once
 * TC-ANZ-M3-05 started leaving QA_AUTO rows behind. A fixture-ordering failure dressed as a schema
 * regression. (Also from aac6442.)
 */
async function transportAnalyzer(page: Page): Promise<any | null> {
  for (const a of await analyzerList(page)) {
    const d = await detailOf(page, a.id);
    if (connectionFields(d).some((f: any) => f.key === 'transport')) return a;
  }
  return null;
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

  test('TC-ANZ-M3-03 the type picker filters as it searches [AC-3 · FUNCTION]', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE}/analyzers?setup=instrument`);
    await page.waitForLoadState('networkidle');
    await hideReviewWidget(page);
    await dismissHeldResultsBanner(page);
    const input = page.locator('#analyzer-setup-type');
    await expect(input).toHaveAttribute('placeholder', /Search analyzer types/i);

    const options = page.locator('[role="option"]');
    await openCombo(page, '#analyzer-setup-type');
    const before = await options.count();
    expect(before, 'the picker should offer the shipped profiles').toBeGreaterThan(1);

    // Δ-W FIXED 2026-08-27 for this control — it used to hold its option count for any query and
    // merely jump-and-highlight. This assertion is now a GUARD, not a flip-when-fixed. Do not
    // relax it; if it fails, shouldFilterItem was dropped from the Carbon ComboBox again.
    // "Fluo" is deliberately narrow: the seed creates site-derived GeneXpert duplicates of its
    // own, so any GeneXpert-shaped query matches a drifting number of rows.
    await searchCombo(page, '#analyzer-setup-type', 'Fluo');
    const after = await options.count();
    const shown = await options.allInnerTexts();
    console.log(`[Δ-W] type picker: ${before} → ${after} for "Fluo" :: ${JSON.stringify(shown)}`);
    expect(after, 'the type picker must narrow — Δ-W was fixed on 2026-08-27').toBeLessThan(before);
    expect(after, 'narrowed to nothing — the listbox probably closed, see searchCombo').toBeGreaterThan(0);
    expect(
      shown.every((t) => /Fluo/i.test(t)),
      `a non-matching option survived the filter: ${JSON.stringify(shown)}`,
    ).toBe(true);

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

    // Δ-Y: the modal still collects only a name. The 2026-08-27 build finally SAYS so — "the draft
    // is saved in Analyzer Bridge. It must be completed and validated before it can be published"
    // — which is a real improvement over failing silently, but the draft is still uncompletable
    // from this UI.
    //
    // The DOM field count is deliberately logged, not asserted: the Carbon modal's inputs are not
    // reliably inside a [role="dialog"] subtree at the moment this runs, and an earlier revision of
    // this case failed on 0-vs-1 for that reason alone — a harness artefact dressed as a finding.
    // Δ-Y is graded on the SERVER contract instead, which is unambiguous.
    const fields = await page.locator('[role="dialog"] input, [role="dialog"] select').count();
    console.log(`[Δ-Y] Create Profile modal exposes ${fields} field(s) to this selector`);

    const draft = await apiRaw(page, '/analyzer-types/drafts', {
      method: 'POST',
      body: { displayName: `QA_AUTO_${RUN} create probe` },
    });
    test.skip(draft.status >= 400 || !draft.body?.draftId, `draft endpoint answered ${draft.status}`);
    const pub = await apiRaw(page, `/analyzer-types/drafts/${draft.body.draftId}/publish`, {
      method: 'POST',
      body: {},
    });
    console.log(`[Δ-Y] publish → ${pub.status} :: ${pub.text}`);
    expect(
      pub.status,
      'Δ-Y fixed? a name-only draft now publishes — flip to assert the profile lands in the ' +
        'catalog and that the modal captures protocol and connection type (FR-B3)',
    ).toBe(400);
    expect(
      String(pub.body?.error ?? pub.text),
      'the 400 should still name what a publishable profile needs — that is the useful half',
    ).toMatch(/connectionFields|protocol|capabilities/);
  });

  test('TC-ANZ-M3-05 create from a clean list POSTs a new analyzer and it round-trips [FR-B2 · ROUND-TRIP]', async ({ page }) => {
    await login(page);
    const id = await createAnalyzer(page, ANALYZER_NAME);

    // Read back on the LIST endpoint — a different surface than the detail one the form wrote to.
    const row = (await analyzerList(page)).find((a) => String(a.id) === id);
    expect(row, `analyzer ${id} missing from the list endpoint`).toBeTruthy();
    expect(row.name).toBe(ANALYZER_NAME);
    expect(row.status).toBe('SETUP');
    expect(row.profileId, 'the chosen profile did not persist').toBe(PROFILE_ID);
    console.log(`[data] leaving analyzer ${id} (${ANALYZER_NAME}) on the instance — test server, no cleanup`);
  });

  test('TC-ANZ-M3-06 Δ-S the setup panel resets, and never lies about which analyzer it holds [ROUND-TRIP]', async ({ page }) => {
    await login(page);
    const victim = (await analyzerList(page)).find((a) => a.status === 'SETUP');
    test.skip(!victim, 'no SETUP analyzer available to open');
    const originalName = victim.name;

    // --- Half one: the data-integrity defect. FIXED 2026-08-27, now a guard. ---
    // The old defect was NOT "the panel keeps values". It was that clicking Add Analyzer SHED
    // analyzerId from the URL while KEEPING the previous analyzer's values, so the panel looked
    // like a new analyzer while still being the old one — and Continue would PUT the old analyzer
    // and silently rename it.
    await page.goto(`${BASE}/analyzers?setup=instrument&analyzerId=${victim.id}`);
    await expect(page.locator('#analyzer-setup-name')).toHaveValue(originalName, { timeout: TIMEOUT });

    await hideReviewWidget(page);
    await page.getByRole('button', { name: /Add Analyzer/i }).click();
    await page.waitForTimeout(1200);

    const stillHoldsId = /analyzerId=/.test(page.url());
    const carried = await page.locator('#analyzer-setup-name').inputValue();
    // The URL and the fields must AGREE. Either both are cleared, or both still point at the open
    // analyzer. What must never come back is "no analyzerId, but the old analyzer's data".
    expect(
      stillHoldsId || carried === '',
      `Δ-S regressed: the panel shed analyzerId while still holding "${carried}" — Continue from ` +
        'here would PUT the previous analyzer and silently rename it',
    ).toBe(true);

    // --- Half two: Δ-S′, the UX residue. FLIP-WHEN-FIXED. ---
    // With a panel already open, Add Analyzer currently does nothing at all: no reset, no new
    // panel, no message. Safe, but the user gets no hint that the panel must be closed first.
    if (stillHoldsId) {
      expect(
        carried,
        "Δ-S′ fixed? Add Analyzer now resets an open panel — flip to expect an EMPTY name field " +
          'and drop this branch',
      ).toBe(originalName);
      console.log(`[Δ-S′] Add Analyzer is inert while a panel is open (analyzer ${victim.id} still loaded)`);
    }

    // --- Half three: the path that DOES reset, guarded so it cannot regress. ---
    // Close the panel and reopen. NOTE: do NOT reach for a bare [aria-label="Close"] here — it
    // matches controls outside the panel (the review widget, notifications) and on the 2026-08-27
    // run clicking the first match tore down the browser context. Scope it to the setup panel, and
    // fall back to leaving the page, which closes the panel just as definitively.
    const closed = await page
      .locator('[data-testid="analyzer-setup-panel"] [aria-label="Close"], .cds--tile [aria-label="Close"]')
      .first()
      .click({ timeout: 3000 })
      .then(() => true)
      .catch(() => false);
    if (!closed) await page.goto(`${BASE}/analyzers`);
    await page.waitForLoadState('networkidle');
    await hideReviewWidget(page);
    await dismissHeldResultsBanner(page);
    await page.getByRole('button', { name: /Add Analyzer/i }).click();
    await expect(page).toHaveURL(/setup=instrument/, { timeout: TIMEOUT });
    await expect(
      page.locator('#analyzer-setup-name'),
      'closing and reopening the panel must give a clean step 1',
    ).toHaveValue('');
    await expect(page.locator('#analyzer-setup-type')).toHaveValue('');
  });
});

// ---------------------------------------------------------------------------
// TC-ANZ-M3-VERIFY
// ---------------------------------------------------------------------------

test.describe('TC-ANZ-M3-VERIFY — catalog binding and confirmation (FR-B4, B5, C1–C3)', () => {
  test('TC-ANZ-M3-07 rows bind to real catalog tests, carry LOINC, and account for every code [AC-5/FR-C1 · CROSS-LINK]', async ({ page }) => {
    await login(page);
    const mapping = await mappingOf(page);
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

  test('TC-ANZ-M3-08 Δ-W the test picker offers the whole catalog; filter behaviour NOT re-tested [FR-C2 · RENDER]', async ({ page }) => {
    await login(page);
    const rev = await profileRevision(page);
    await page.goto(`${BASE}/analyzers/types/${PROFILE_ID}/mapping?revision=${rev}`);
    const mapping = await mappingOf(page, PROFILE_ID, rev);
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

    // Δ-W FIXED 2026-08-27 for THIS control too. The manual retest could not drive focus into it
    // and left the old jump-don't-filter assertion in place, flagged; the automated run then found
    // 183 → 1 on "Hemato". Both pickers filter. Now a guard.
    await input.press('ControlOrMeta+a');
    await input.pressSequentially('Hemato', { delay: 90 });
    await page.waitForTimeout(800);
    const narrowed = await page.locator('[role="option"]').count();
    console.log(`[Δ-W] test picker: ${offered} → ${narrowed} for "Hemato"`);
    expect(narrowed, 'the test picker must narrow — Δ-W was fixed for it on 2026-08-27').toBeLessThan(offered);
    expect(narrowed, 'narrowed to nothing — the listbox probably closed, see searchCombo').toBeGreaterThan(0);
    await expect(page.locator('[role="option"]').first()).toContainText(/Hemato/i);

    // LOINC search works too, and must not regress — the placeholder promises name, code OR LOINC.
    await input.press('ControlOrMeta+a');
    await input.pressSequentially('85362', { delay: 90 });
    await page.waitForTimeout(800);
    const byLoinc = await page.locator('[role="option"]').allInnerTexts();
    console.log(`[FR-C2] LOINC "85362" → ${JSON.stringify(byLoinc)}`);
    expect(byLoinc.join('|'), 'LOINC search regressed').toMatch(/85362/);
  });

  test('TC-ANZ-M3-09 the mapping is a versioned, fingerprinted artefact [FR-C2 · ROUND-TRIP]', async ({ page }) => {
    await login(page);
    const mapping = await mappingOf(page);

    // Δ-O fixed: bindings persist. The fingerprint is what makes a change detectable at all, and
    // it is the mechanism the confirmation staling in TC-ANZ-M3-10 depends on.
    expect(mapping.bindingFingerprint, 'no bindingFingerprint — staling cannot work').toMatch(/^sha256:/);
    expect(mapping.siteBindingId, 'no site binding — the change would edit the shipped profile').toBeTruthy();
    expect(mapping.siteBindingRevision, 'the site binding is not versioned — Δ-AD has nothing to read').toBeTruthy();
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
    const mapping = await mappingOf(page);

    // Δ-G fixed: confirmation is a real, recorded, staleable artefact — not an unreachable button.
    const c = mapping.confirmation;
    expect(c, 'confirmation object missing').toBeTruthy();
    expect(c.bindingFingerprint, 'confirmation is not pinned to a binding — it cannot go stale').toMatch(/^sha256:/);
    expect(c.recognitionFingerprint, 'confirmation is not pinned to control recognition').toMatch(/^sha256:/);

    const stale = c.state !== 'CURRENT' || c.bindingFingerprint !== mapping.bindingFingerprint;
    console.log(`[AC-6] confirmation state=${c.state} stale=${stale}`);
    if (stale) {
      // While stale, Continue must be blocked — that is the gate the FRS asks for.
      await page.goto(`${BASE}/analyzers/types/${PROFILE_ID}/mapping?revision=${mapping.profileRevision}`);
      await expect(page.getByRole('button', { name: /Confirm mappings/i }).first()).toBeVisible({ timeout: TIMEOUT });
    }
  });

  test('TC-ANZ-M3-11 a CURRENT confirmation records who signed it and when [AC-6 · PERSIST]', async ({ page }) => {
    await login(page);
    const c = (await mappingOf(page)).confirmation;
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
    const target = await transportAnalyzer(page);
    test.skip(!target, 'no transport-based analyzer here; this instance schema is file-drop');
    const detail = await detailOf(page, target!.id);
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
    // Pick a READY analyzer, not list[0] and not merely one with a connection block — see
    // probeableAnalyzer(). Probing an unready analyzer records nothing and reads as Δ-L regressed.
    const target = await probeableAnalyzer(page);
    test.skip(!target, 'no analyzer on this instance is ready enough to probe');

    // Δ-L fixed: 3.2.1.11 issued NO request at all. A FAILED probe is a pass for this case — what
    // matters is that a request goes out and the outcome is persisted against a config revision.
    //
    // ENDPOINT RENAMED. This is `/test-connection`, not `/test`. The old path now 404s, and the
    // assertion here used to be `toBeLessThan(500)` — which a 404 satisfies, so the case passed
    // for a build or more without ever reaching the probe. Assert 2xx explicitly: a loose bound on
    // a status code is how a moved endpoint hides.
    const res = await apiRaw(page, `/analyzer/analyzers/${target.id}/test-connection`, { method: 'POST', body: {} });
    expect(res.status, `probe endpoint answered ${res.status} :: ${res.text}`).toBeGreaterThanOrEqual(200);
    expect(res.status, `probe endpoint answered ${res.status} :: ${res.text}`).toBeLessThan(300);

    // The probe is ASYNCHRONOUS: the POST returns before Analyzer Bridge has reported back, so
    // reading latestProbe immediately can legitimately return null on a freshly seeded analyzer
    // that has never been probed. Poll rather than assume — reading it once produced a spurious
    // "Δ-L regressed" on the 2026-08-27 run.
    let probe: any = null;
    for (let i = 0; i < 10 && !probe; i += 1) {
      probe = (await detailOf(page, target.id)).connection?.latestProbe;
      if (!probe) await page.waitForTimeout(1500);
    }
    expect(probe, 'Δ-L regressed? no probe result recorded within 15s of POST /test').toBeTruthy();
    expect(probe.status, 'probe recorded no outcome').toMatch(/SUCCE|FAIL|ERROR|TIMEOUT/i);
    expect(probe.configRevision, 'the probe is not pinned to the config it tested').toBeTruthy();
    console.log(`[FR-B6] latest probe: ${probe.status} @ configRevision ${probe.configRevision}`);
  });

  test('TC-ANZ-M3-15 a data-flow control ships and follows what the profile declares [AC-10/FR-F2 · RENDER]', async ({ page }) => {
    await login(page);

    // Δ-K FIXED 2026-08-27. This used to assert the ABSENCE of any dataFlow field; it is now a
    // guard on the fix. The control appears in the DOM at step 3 as #analyzer-connection-dataFlow.
    const anyAnalyzer = (await analyzerList(page))[0];
    await page.goto(`${BASE}/analyzers?setup=connect&analyzerId=${anyAnalyzer.id}`);
    await hideReviewWidget(page);
    const dataFlow = page.locator('#analyzer-connection-dataFlow');
    await expect(dataFlow, 'Δ-K regressed? the data-flow control is gone again').toBeVisible({ timeout: TIMEOUT });

    const options = await dataFlow.locator('option').allInnerTexts();
    const values = await dataFlow.locator('option').evaluateAll((els) => els.map((e) => (e as HTMLOptionElement).value));
    console.log(`[Δ-K] dataFlow offers ${JSON.stringify(values)} (${JSON.stringify(options)})`);
    expect(values.length, 'the data-flow control offers nothing').toBeGreaterThan(0);
    expect(values, 'RESULTS_ONLY must always be offered — it is FR-F2s one-way case').toContain('RESULTS_ONLY');

    // The field FOLLOWS the profile rather than offering a free choice, and both halves of AC-10
    // are now evidenced: a FILE drop-folder analyzer cannot send orders and offers RESULTS_ONLY
    // alone (verified manually on Bruker FluoroCycler XT), while an ASTM profile declaring
    // communicationMode BOTH offers RESULTS_ONLY and TWO_WAY (verified by this case on Cepheid
    // GeneXpert). Grade whichever shape this analyzer has.
    const detail = await detailOf(page, anyAnalyzer.id);
    const isFile = /FILE/i.test(detail?.connection?.transport ?? '') ||
      connectionFields(detail).some((f: any) => /directory|filePattern/i.test(f.key));
    if (isFile) {
      expect(values, 'a file-drop analyzer must not offer two-way data flow').toEqual(['RESULTS_ONLY']);
    } else {
      expect(
        values,
        'an over-the-wire profile should offer the two-way case FR-F2 asks for',
      ).toContain('TWO_WAY');
    }
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

    // Re-read readiness IMMEDIATELY before the call. The instance reseeds every 20–40 minutes and
    // reassigns analyzer ids, so a readiness reading taken at the top of the suite can describe a
    // row that no longer exists by the time this runs. Skip on drift rather than fail on it.
    const readiness = await apiRaw(page, `/analyzer/analyzers/${ready!.id}/activation-readiness`);
    test.skip(
      readiness.status !== 200 || !readiness.body?.ready || readiness.body?.activated,
      `analyzer ${ready!.id} is no longer ready-and-inactive (${readiness.text}) — seed drift, not a defect`,
    );
    expect(readiness.body.blockers ?? []).toHaveLength(0);

    const res = await transition(page, ready!.id, 'activate');
    console.log(`[AC-17] analyzer ${ready!.id}: activate ${res.status} :: ${res.text}`);
    // If this ever fails with a 500, DO NOT file it before running the bug-revalidation protocol.
    // "activate returns 500 while readiness says ready" was raised at blocker severity on
    // 2026-08-25 (Δ-T), withdrawn on evidence, and then seen ONCE more on 2026-08-27 under a full
    // suite run — with CSRF present, on an analyzer that was ACTIVE moments later, and it did not
    // reproduce on demand. A targeted probe (deactivate → readiness → activate) returns 200 every
    // time, including on an INACTIVE analyzer, which was the leading hypothesis and is disproved.
    // Treat a 500 here as intermittent until two independent methods agree.
    expect(
      res.status,
      `activate answered ${res.status} while readiness said ready :: ${res.text}\n` +
        'This is the Δ-T shape. Run the revalidation protocol before filing — it has been wrong once.',
    ).toBe(200);
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

  test('TC-ANZ-M3-18 both lifecycle dialogs name the analyzer [RENDER]', async ({ page }) => {
    await login(page);
    const target = (await analyzerList(page))[0];
    await page.goto(`${BASE}/analyzers?lifecycle=deactivate&lifecycleAnalyzerId=${target.id}`);

    // NOTE: a hidden "Still There?" session modal also matches [role="dialog"] — select by content.
    const dialog = page.locator('[role="dialog"]').filter({ hasText: /Deactivate/i }).first();
    await expect(dialog).toBeVisible({ timeout: TIMEOUT });

    // Δ-V FIXED 2026-08-26 — this used to assert the literal "{name}" placeholder, the same defect
    // class as the old Delete-dialog bug (NOTE-22) that moved with the rename. Now a guard.
    await expect(dialog, 'Δ-V regressed? the {name} placeholder is back').not.toContainText('{name}');
    await expect(dialog, 'the dialog must name the analyzer it is about to deactivate').toContainText(target.name);

    await page.getByRole('button', { name: /Cancel deactivation/i }).click();
  });
});

// ---------------------------------------------------------------------------
// TC-ANZ-M3-QC
// ---------------------------------------------------------------------------

test.describe('TC-ANZ-M3-QC — control lots', () => {
  test('TC-ANZ-M3-19 Δ-R the New Control Lot form cannot be saved at all [FUNCTION]', async ({ page }) => {
    await login(page);

    // Reported 2026-08-12, shipped again 2026-08-25, shipped again 2026-08-27. The FRAMING changed
    // between rounds and the case is written to the current behaviour: round 1 found hidden
    // validation (the form POSTed and the 400 was swallowed by a generic banner); on 3.2.2.0 the
    // form issues NO REQUEST AT ALL, so there is nothing for the UI to surface. Save is
    // type="submit", enabled, inside a real <form> with a React onSubmit — the handler is wired
    // and bails before issuing anything.
    await page.goto(`${BASE}/analyzers/qc/control-lots/new`);
    await page.waitForLoadState('networkidle');
    await hideReviewWidget(page);
    await expect(page.getByText(/Control Lot/i).first()).toBeVisible({ timeout: TIMEOUT });

    // The endpoint half, which is why this is not a client-side validation problem.
    const list = await apiRaw(page, '/qc/control-lots');
    expect(list.status, 'the READ path should work — it is only the write that is missing').toBe(200);
    const create = await apiRaw(page, '/qc/control-lots', { method: 'POST', body: { lotNumber: 'QA_PROBE' } });
    console.log(`[Δ-R] POST /qc/control-lots → ${create.status} :: ${create.text}`);
    expect(
      create.status,
      'Δ-R fixed? a create handler now exists at /qc/control-lots — flip this case to drive the ' +
        'form end to end and assert the lot round-trips through GET',
    ).toBe(405);

    // The UI half: fill what the form asks for, then prove the click produces no traffic at all.
    await page.locator('#lotNumber, input[name="lotNumber"]').first().fill(`QA_AUTO_${STAMP}`).catch(() => {});
    let requests = 0;
    const count = () => { requests += 1; };
    page.on('request', count);
    await page.getByRole('button', { name: /^Save$/i }).first().click().catch(() => {});
    await page.waitForTimeout(2500);
    page.off('request', count);
    console.log(`[Δ-R] Save produced ${requests} network request(s)`);
    expect(
      requests,
      'Δ-R fixed? Save now issues a request — flip to assert the response and the round-trip',
    ).toBe(0);
  });

  test('TC-ANZ-M3-19b the control-lot Test picker is not scoped to the chosen analyzer [CROSS-LINK]', async ({ page }) => {
    await login(page);
    // Found alongside Δ-R on 2026-08-27. With an analyzer chosen, the Test dropdown still offers
    // the WHOLE catalog rather than the tests that analyzer's profile maps, so a lot can be bound
    // to a test the instrument never reports — and no Westgard rule would ever evaluate it.
    await page.goto(`${BASE}/analyzers/qc/control-lots/new`);
    await page.waitForLoadState('networkidle');
    await hideReviewWidget(page);

    const catalog = await api<any[]>(page, '/displayList/ALL_TESTS');
    const mapping = await mappingOf(page);
    const mapped = mapping.tests.filter((t: any) => t.testId).length;

    // Scope every selector to <main>. A bare [id*="test" i] matches page chrome as well as the
    // form, and on the 2026-08-27 run clicking the first match tore down the browser context.
    const form = page.locator('main');
    await form.getByRole('combobox', { name: /analyzer/i }).first().click({ timeout: 5000 }).catch(() => {});
    await page.locator('[role="option"]').filter({ hasText: /GeneXpert/i }).first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(600);
    await form.getByRole('combobox', { name: /^test$/i }).first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(900);
    const offered = await page.locator('[role="option"]').count();
    test.skip(offered === 0, 'could not open the Test picker — nothing to grade rather than a guess');

    console.log(`[Δ-R2] Test picker offers ${offered}; GeneXpert maps ${mapped} of ${catalog.length}`);
    expect(
      offered,
      'scoping fixed? the Test picker now narrows to the analyzer profile — flip to expect it to ' +
        'offer only the mapped tests',
    ).toBeGreaterThan(mapped);
  });
});

// ---------------------------------------------------------------------------
// TC-ANZ-M3-CATALOG — new 2026-08-27. The paths a lab uses to REPAIR a mapping problem.
// ---------------------------------------------------------------------------

test.describe('TC-ANZ-M3-CATALOG — fork fidelity, completeness reporting, held-result routing, audit', () => {
  test('TC-ANZ-M3-20 Δ-AA Duplicate forks the shipped profile, not the site binding [FR-H · ROUND-TRIP]', async ({ page }) => {
    await login(page);
    const rev = await profileRevision(page);
    const source = await mappingOf(page, PROFILE_ID, rev);

    const srcTests = source.tests.length;
    const srcBoundTests = source.tests.filter((t: any) => t.mappingState === 'BOUND').length;
    const srcCounts = resultStateCounts(source);
    const srcValues = Object.values(srcCounts).reduce((a: number, b: number) => a + b, 0);
    test.skip(srcBoundTests === 0, 'the source profile has no bindings to lose — nothing to grade');

    // Fork it through the REST surface the modal drives.
    // CONTRACT NOTE: the source revision goes in the BODY as `sourceRevision`, NOT as ?revision=.
    // With it in the query string the server answers 400 "Source revision must be at least 1", and
    // an earlier revision of this case silently test.skip()'d on that — the most important new
    // case in the suite quietly not running. Assert the duplicate succeeded instead of skipping.
    const dup = await apiRaw(page, `/analyzer-types/${PROFILE_ID}/duplicate`, {
      method: 'POST',
      body: { displayName: `QA_AUTO_${RUN} fork fidelity`, sourceRevision: rev },
    });
    expect(dup.status, `duplicate answered ${dup.status} :: ${dup.text}`).toBe(201);
    const draftId = dup.body?.draftId;
    expect(draftId, 'duplicate returned no draftId').toBeTruthy();

    const pub = await apiRaw(page, `/analyzer-types/drafts/${draftId}/publish`, { method: 'POST', body: {} });
    expect(pub.status, `publish answered ${pub.status} :: ${pub.text}`).toBe(201);
    // The published id lives at profile.profileMeta.id — not at a top-level profileId.
    const copyId = pub.body?.profile?.profileMeta?.id;
    expect(copyId, `publish returned no profile id :: ${pub.text}`).toBeTruthy();
    console.log(`[Δ-AA] forked ${PROFILE_ID} rev ${rev} → ${copyId} (left on the instance, test server)`);

    const copy = await mappingOf(page, copyId);
    const copyCounts = resultStateCounts(copy);
    const copyValues = Object.values(copyCounts).reduce((a: number, b: number) => a + b, 0);
    const copyBoundTests = copy.tests.filter((t: any) => t.mappingState === 'BOUND').length;
    console.log(`[Δ-AA] source: ${srcBoundTests}/${srcTests} tests BOUND, values ${JSON.stringify(srcCounts)}`);
    console.log(`[Δ-AA] copy:   ${copyBoundTests}/${copy.tests.length} tests BOUND, values ${JSON.stringify(copyCounts)}`);

    // Half one — the decisions. The modal says the new profile "starts from" the source.
    expect(
      copyBoundTests,
      'Δ-AA fixed? the fork now carries its source bindings — flip to expect copyBoundTests to ' +
        'equal srcBoundTests, and the same for BOUND/EXCLUDED result counts',
    ).toBe(0);

    // Half two — SITE-ADDED values are dropped from the copy entirely.
    //
    // This was first described as "the fork drops UNRESOLVED values". That was the symptom, not
    // the mechanism. `REVIEW REQUIRED` on MTB-RIF is a value the instance LEARNED from traffic
    // (`observed: true`), not one the shipped profile declares. Once it was mapped and confirmed
    // it became BOUND in the source — and it is STILL absent from a fresh fork. So the rule is not
    // about mappingState at all:
    //
    //   Duplicate forks the SHIPPED PROFILE, not the SITE BINDING.
    //
    // That one sentence explains both halves — no bindings carried (they live on the site binding)
    // and observed values lost (they were added to the site binding). Assert it directly.
    const observed = source.tests.flatMap((t: any) =>
      (t.results ?? []).filter((r: any) => r.observed).map((r: any) => `${t.rawCode}/${r.rawValue}`),
    );
    const copyValueKeys = copy.tests.flatMap((t: any) => (t.results ?? []).map((r: any) => `${t.rawCode}/${r.rawValue}`));
    console.log(`[Δ-AA] source values ${srcValues} → copy ${copyValues}; observed-in-source: ${JSON.stringify(observed)}`);
    for (const k of observed) {
      expect(
        copyValueKeys,
        `Δ-AA fixed? the site-added value "${k}" survived the fork — flip this loop, and check ` +
          'whether the bindings came with it',
      ).not.toContain(k);
    }
    if (observed.length) {
      expect(copyValues, 'the copy should be short by exactly the site-added values').toBe(srcValues - observed.length);
    }
  });

  test('TC-ANZ-M3-21 Δ-AB the catalog reports COMPLETE while a value is UNRESOLVED, and does not follow a confirmed change [CROSS-LINK]', async ({ page }) => {
    await login(page);
    const rev = await profileRevision(page);
    const mapping = await mappingOf(page, PROFILE_ID, rev);
    const counts = resultStateCounts(mapping);
    const total = Object.values(counts).reduce((a: number, b: number) => a + b, 0);

    const summary = (await typeCatalog(page)).types.find((t: any) => t.profileId === PROFILE_ID).resultMappings;
    console.log(`[Δ-AB] mapping ${JSON.stringify(counts)} total=${total} · catalog ${JSON.stringify(summary)}`);

    // The finding is that these two surfaces DISAGREE — and the disagreement is not a fixed
    // arithmetic rule, so do not encode one. It was first read as "the denominator excludes
    // UNRESOLVED" (10/16 against 10 BOUND + 6 EXCLUDED + 1 UNRESOLVED). After a confirmed change
    // bound that value, the mapping went to 11 BOUND + 6 EXCLUDED = 17 and the catalog **still**
    // reported {mapped 10, excluded 6, total 16, COMPLETE} — the same pre-change numbers, on a
    // cache-busted read. So the catalog is STALE, and the denominator quirk was only the shape it
    // happened to have at the time.
    //
    // Assert the disagreement itself. That survives whichever way the numbers drift, and it flips
    // the moment the catalog starts tracking the site binding.
    const agrees = summary.mapped === (counts.BOUND ?? 0) &&
      summary.excluded === (counts.EXCLUDED ?? 0) &&
      summary.total === total;
    expect(
      agrees,
      `Δ-AB fixed? the catalog now agrees with the mapping — flip to assert equality and a ` +
        `non-COMPLETE state while anything is UNRESOLVED. mapping=${JSON.stringify(counts)} ` +
        `total=${total} catalog=${JSON.stringify(summary)}`,
    ).toBe(false);

    // The second half: a profile with an unresolved value still reads COMPLETE, and the attention
    // KPI does not flag it. Only gradeable while the seed actually has an unresolved value.
    if (counts.UNRESOLVED) {
      expect(
        summary.state,
        'Δ-AB fixed? the catalog no longer calls a profile with unresolved values COMPLETE',
      ).toBe('COMPLETE');
      const attention = (await typeCatalog(page)).summary.needsAttention;
      console.log(`[Δ-AB] needsAttention=${attention} while ${PROFILE_ID} has ${counts.UNRESOLVED} unresolved value(s)`);
    } else {
      console.log('[Δ-AB] no UNRESOLVED value in this seed — graded on the staleness half only');
    }
  });

  test('TC-ANZ-M3-22 Δ-AC an undeclared analyzer code has no resolution path [FUNCTION]', async ({ page }) => {
    await login(page);
    const withHeld = (await analyzerList(page)).find((a) => (a.heldResultCount ?? 0) > 0);
    test.skip(!withHeld, 'no analyzer currently holds results — the seed has not sent unmapped traffic');

    const results = await api<any>(page, `/AnalyzerResults?id=${withHeld.id}`);
    const rows = results?.resultList ?? [];
    const unknownTest = rows.filter((r: any) => r.importIssueReason === 'unknown_analyzer_test');
    const unknownValue = rows.filter((r: any) => r.importIssueReason === 'unknown_analyzer_result_value');
    console.log(`[Δ-AC] held rows — unknown_analyzer_test: ${unknownTest.length}, unknown_analyzer_result_value: ${unknownValue.length}`);
    test.skip(unknownTest.length === 0, 'no undeclared-code row in this seed');

    // The server knows exactly which failure mode it is. The UI branches for only one of them.
    const code = unknownTest[0].rawTestCode;
    const mapping = await mappingOf(page);
    const declared = mapping.tests.map((t: any) => t.rawCode);
    expect(
      declared,
      `Δ-AC fixed? "${code}" now appears in the mapping payload — flip to assert it can be mapped ` +
        'or excluded like any declared code',
    ).not.toContain(code);

    await page.goto(`${BASE}/AnalyzerResults?id=${withHeld.id}`);
    await page.waitForLoadState('networkidle');
    await hideReviewWidget(page);
    const body = await page.locator('body').innerText();
    const declaredRow = unknownValue[0];
    if (declaredRow) {
      expect(body, 'the declared-code row should still offer its deep link').toContain('Review Analyzer Type mapping');
    }
    // Count the links: one per resolvable row, none for the undeclared one.
    const links = await page.getByRole('link', { name: /Review Analyzer Type mapping/i }).count();
    expect(
      links,
      `Δ-AC fixed? ${links} resolution link(s) for ${unknownTest.length + unknownValue.length} held ` +
        'row(s) — flip to expect one per held row',
    ).toBe(unknownValue.length);

    // And there is no add-code control on the mapping page to reach it another way.
    await page.goto(`${BASE}/analyzers/types/${PROFILE_ID}/mapping?revision=${mapping.profileRevision}`);
    await page.waitForLoadState('networkidle');
    await expect(
      page.getByRole('button', { name: /add (analyzer )?code|new code|declare code/i }),
      'Δ-AC fixed? an add-code control appeared — flip to drive it',
    ).toHaveCount(0);
  });

  test('TC-ANZ-M3-23 Δ-AD View history lists shipped revisions, never the site-binding change [PERSIST]', async ({ page }) => {
    await login(page);
    const mapping = await mappingOf(page);
    const siteRev = Number(mapping.siteBindingRevision);
    test.skip(!siteRev || siteRev < 2, 'the site binding has never been changed on this seed');

    await page.goto(`${BASE}/analyzers/types?action=history&profile=${PROFILE_ID}`);
    await page.waitForLoadState('networkidle');
    await hideReviewWidget(page);
    const dialog = page.locator('[role="dialog"]').filter({ hasText: /history/i }).first();
    await expect(dialog).toBeVisible({ timeout: TIMEOUT });
    const text = await dialog.innerText();
    const rows = text.split('\n').filter((l) => /Revision\s+\d+/i.test(l));
    console.log(`[Δ-AD] siteBindingRevision=${siteRev}, history rows=${rows.length}: ${JSON.stringify(rows)}`);

    // Every row is a SHIPPED profile revision by "distribution" — the lab's own confirmed changes,
    // which the server versions as siteBindingRevision, appear nowhere.
    expect(
      rows.every((r) => /shipped/i.test(r)),
      'Δ-AD fixed? a non-shipped row appeared — flip to assert the site-binding change is listed ' +
        'with its actor and timestamp',
    ).toBe(true);
    expect(
      text,
      'Δ-AD fixed? the dialog now names a human actor — flip this too',
    ).not.toMatch(/Open ELIS|admin/i);
  });
});
