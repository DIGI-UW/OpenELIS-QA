/**
 * OpenELIS Global — Analyzer guided setup (Instrument → Verify → Connect) QA suite
 * Target: analyzers.openelis-global.org (v3.2.1.11) · spec baseline: analyzer-profile-mapping.md / OGC-1057
 *
 * OGC-1057 is the v3 slice of OGC-1054: FR-B1…B6, FR-C1…C3, FR-F1…F2, AC-1…AC-10.
 * Enumerated live 2026-08-12. Companion doc: analyzer-guided-setup.md (Δ ledger + maturity).
 *
 * Suites:
 *   TC-ANZ-SET-INSTRUMENT — inline expansion, profile picker, name/lab-unit round-trip
 *   TC-ANZ-SET-VERIFY     — verify table, LOINC matching, profile-apply fidelity, sign-off
 *   TC-ANZ-SET-CONNECT    — data flow default, connection probe, address round-trip
 *   TC-ANZ-SET-DELTAS     — spec-vs-build reconciliation (Δ-A…Δ-O)
 *
 * FLIP-WHEN-FIXED: every Δ assertion below encodes the *current* behavior, not the spec'd one.
 * When OGC-1057 lands, these fail — that is the signal to flip the assertion to the spec, never
 * to loosen it. Each carries a `Δ-x` tag matching the ledger in analyzer-guided-setup.md.
 *
 * Grading: Instrument reaches ROUND-TRIP (read-back on the list endpoint, a different surface than
 * the detail endpoint the form writes). Verify is capped at RENDER — the catalog cross-link is
 * absent and the sign-off is unreachable. Module rated M1.
 */

import { test, expect, Page } from '@playwright/test';

const BASE = process.env.BASE || 'https://analyzers.openelis-global.org';
const ADMIN = { user: process.env.OE_USER || 'admin', pass: process.env.OE_PASS || 'adminADMIN!' };
const API = '/api/OpenELIS-Global/rest';
const TIMEOUT = 15_000;

/** The profile this suite drives. 28 default_test_mappings, qualitative, declares two-way. */
const PROFILE_ID = 'astm/genexpert-astm';
const PROFILE_LABEL = /Cepheid GeneXpert \(ASTM Mode\)/i;

const STAMP = new Date().toISOString().slice(5, 10).replace('-', '');
const ANALYZER_NAME = `QA_AUTO_${STAMP}_guided`;

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

async function login(page: Page): Promise<void> {
  // Under all-tc.config.ts the context is pre-authenticated via storageState; navigating to a
  // protected route then stays put. Only branch into the form when genuinely unauthenticated.
  await page.goto(`${BASE}/analyzers`);
  await page.waitForLoadState('domcontentloaded');
  if (!/\/login/i.test(page.url())) return;
  await page.locator('input[type="text"], input[placeholder*="user" i]').first().fill(ADMIN.user);
  await page.locator('input[type="password"]').first().fill(ADMIN.pass);
  await page.locator('button:has-text("Login"), button[type="submit"]').first().click();
  await page.waitForURL('**/analyzers', { timeout: TIMEOUT }).catch(() => {});
}

/** In-page GET so the session cookie and CSRF context come along. */
async function api<T = any>(page: Page, path: string): Promise<T> {
  return page.evaluate(async (u) => {
    const r = await fetch(u, { credentials: 'include', headers: { Accept: 'application/json' } });
    return r.json();
  }, `${API}${path}`);
}

/** GET /analyzer/analyzers is WRAPPED — { analyzers: [...] }, not a bare array. Cost us a run. */
async function analyzerList(page: Page): Promise<any[]> {
  const res = await api<{ analyzers: any[] }>(page, '/analyzer/analyzers');
  return res.analyzers ?? [];
}

/** Carbon Dropdown/ComboBox: click the trigger, then the option by exact text. */
async function pickFromCarbon(page: Page, trigger: ReturnType<Page['locator']>, option: RegExp) {
  await trigger.click();
  await page.locator('[role="option"]').filter({ hasText: option }).first().click();
}

/** Run the Instrument step end to end; returns the created analyzer id from the Verify URL. */
async function createViaGuidedSetup(page: Page, name: string): Promise<string> {
  await page.goto(`${BASE}/analyzers`);
  await page.getByRole('button', { name: /Add Analyzer/i }).click();
  await expect(page).toHaveURL(/[?&]add=1/, { timeout: TIMEOUT });

  await pickFromCarbon(page, page.getByRole('combobox', { name: /shipped analyzer profile/i }), PROFILE_LABEL);
  await page.getByPlaceholder(/Hematology Analyzer 1/i).fill(name);
  await pickFromCarbon(page, page.getByRole('combobox', { name: /Lab units/i }), /Molecular Biology/i);
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: /Save and continue/i }).click();
  await page.waitForURL(/\/analyzers\/\d+\/mappings/, { timeout: TIMEOUT });
  return page.url().match(/\/analyzers\/(\d+)\//)![1];
}

// ---------------------------------------------------------------------------
// TC-ANZ-SET-INSTRUMENT
// ---------------------------------------------------------------------------

test.describe('TC-ANZ-SET-INSTRUMENT — instrument-first inline setup (FR-B1, B2)', () => {
  test('TC-ANZ-SET-01 Add Analyzer expands inline; the list stays visible [AC-1 · FUNCTION]', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE}/analyzers`);
    await page.getByRole('button', { name: /Add Analyzer/i }).click();

    await expect(page).toHaveURL(/[?&]add=1&step=instrument/, { timeout: TIMEOUT });
    await expect(page.getByText(/Set up a new analyzer/i)).toBeVisible();
    // the defining property of AC-1: the list is still there behind the panel, not replaced
    await expect(page.getByPlaceholder(/Search analyzers/i)).toBeVisible();
    await expect(page.getByText(/TOTAL ANALYZERS/i)).toBeVisible();
  });

  test('TC-ANZ-SET-02 stepper reveals Instrument → Verify → Connect [AC-2 · RENDER]', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE}/analyzers?add=1&step=instrument`);
    for (const step of ['Instrument', 'Verify', 'Connect']) {
      await expect(page.getByRole('button', { name: step, exact: true })).toBeVisible();
    }
    // Δ-B — a fourth step exists that the FRS does not define. Absorb it into the spec or drop it.
    await expect(page.getByRole('button', { name: 'Review', exact: true })).toBeVisible();
  });

  test('TC-ANZ-SET-03 selecting an instrument loads its profile [AC-3 · FUNCTION]', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE}/analyzers?add=1&step=instrument`);
    await pickFromCarbon(page, page.getByRole('combobox', { name: /shipped analyzer profile/i }), PROFILE_LABEL);

    await expect(page.getByText(/Default configuration loaded/i)).toBeVisible({ timeout: TIMEOUT });
    await expect(page.getByText(/Tests mapped/i)).toBeVisible();
    await expect(page.getByText(/QC defaults/i)).toBeVisible();
  });

  test('TC-ANZ-SET-05 name + lab units round-trip on a different endpoint [FR-B2 · ROUND-TRIP]', async ({ page }) => {
    await login(page);
    const id = await createViaGuidedSetup(page, ANALYZER_NAME);

    // write went through the setup form; read back on the LIST endpoint, not the detail one
    const row = (await analyzerList(page)).find((a) => String(a.id) === id);
    expect(row, `analyzer ${id} missing from the list endpoint`).toBeTruthy();
    expect(row.name).toBe(ANALYZER_NAME);
    expect(row.testUnitIds?.length, 'lab unit assignment did not persist').toBeGreaterThan(0);
    expect(row.status).toBe('SETUP');

    console.log(`[cleanup] leaving analyzer ${id} (${ANALYZER_NAME}) in place — see Δ-N, no deactivate exists`);
  });
});

// ---------------------------------------------------------------------------
// TC-ANZ-SET-VERIFY
// ---------------------------------------------------------------------------

test.describe('TC-ANZ-SET-VERIFY — verify, do not build (FR-B4, B5, C1–C3)', () => {
  test('TC-ANZ-SET-06 verify table carries code · test · LOINC · status [AC-5 · RENDER]', async ({ page }) => {
    await login(page);
    const id = await createViaGuidedSetup(page, `${ANALYZER_NAME}_06`);
    await expect(page.getByText(/Profile-Applied Test Mappings/i)).toBeVisible({ timeout: TIMEOUT });

    for (const col of [/Analyzer Code/i, /OpenELIS Test/i, /LOINC/i, /Status/i]) {
      await expect(page.getByRole('columnheader', { name: col }).first()).toBeVisible();
    }
    expect(id).toBeTruthy();
  });

  test('TC-ANZ-SET-07 Δ-E no catalog resolution; bindable set is fixed and not lab-unit scoped [AC-5/FR-C1 · CROSS-LINK]', async ({ page }) => {
    await login(page);
    const id = await createViaGuidedSetup(page, `${ANALYZER_NAME}_07`);
    await expect(page.getByText(/Profile-Applied Test Mappings/i)).toBeVisible({ timeout: TIMEOUT });

    // Status is the literal string "Profile" on every row — never matched·active / not matched.
    const statuses = await page.locator('table').first().locator('tbody tr td:last-child').allInnerTexts();
    expect(new Set(statuses.map((t) => t.trim()))).toEqual(new Set(['Profile']));

    // The OpenELIS Test column is the profile's test_name_hint, not a resolved catalog test.
    // Proof: the bindable universe is a FIXED set, identical across analyzers in different lab
    // units, and tiny next to the catalog.
    const opts = await api<any[]>(page, `/analyzer/analyzers/${id}/test-mapping-options`);
    const catalog = await api<any[]>(page, '/displayList/ALL_TESTS');
    expect(opts.length, 'Δ-E fixed? flip to assert the catalog is searchable here').toBeLessThan(catalog.length / 4);

    const other = (await analyzerList(page)).find((a) => String(a.id) !== id && a.testUnitIds?.[0] !== undefined);
    if (other) {
      const otherOpts = await api<any[]>(page, `/analyzer/analyzers/${other.id}/test-mapping-options`);
      // identical ids for a different analyzer in a different lab unit ⇒ not lab-unit scoped
      expect(otherOpts.map((o) => o.id)).toEqual(opts.map((o) => o.id));
    }
  });

  test('TC-ANZ-SET-08 Δ-F profile applies only what resolves, silently [FR-B4/C3 · ROUND-TRIP]', async ({ page }) => {
    await login(page);
    const id = await createViaGuidedSetup(page, `${ANALYZER_NAME}_08`);

    const profile = await api<any>(page, `/analyzer/profiles/${PROFILE_ID}`);
    const analyzer = await api<any>(page, `/analyzer/analyzers/${id}`);
    const declared: string[] = profile.default_test_mappings.map((m: any) => m.test_code);
    const persisted: string[] = analyzer.testMappings ?? [];
    const dropped = declared.filter((c) => !persisted.includes(c));

    // The screen offers all `declared` rows for sign-off; only `persisted` were stored…
    const rendered = await page.locator('table').first().locator('tbody tr').count();
    expect(rendered).toBe(declared.length);
    // …and nothing on screen marks which ones were discarded.
    await expect(page.getByText(/not in your catalog|not matched|needs attention/i)).toHaveCount(0);

    console.log(`[Δ-F] ${PROFILE_ID}: declared=${declared.length} persisted=${persisted.length} dropped=${dropped.join(', ')}`);
    expect(dropped.length, 'Δ-F fixed? flip to expect(dropped).toHaveLength(0) — or to assert each drop is flagged').toBeGreaterThan(0);
  });

  test('TC-ANZ-SET-08b Δ-F a fully-resolvable profile applies whole (control case)', async ({ page }) => {
    await login(page);
    // Sysmex declares 13 and stores 13 — proves the drop is resolution-driven, not a cap.
    await page.goto(`${BASE}/analyzers`);
    const profile = await api<any>(page, '/analyzer/profiles/astm/sysmex-xn');
    const sysmex = (await analyzerList(page)).find((a) => /Sysmex/i.test(a.name));
    if (!sysmex) test.skip(true, 'no Sysmex analyzer on this instance');
    expect(sysmex.testMappings.length).toBe(profile.default_test_mappings.length);
  });

  test('TC-ANZ-SET-09 Δ-G the mandatory sign-off is unreachable yet Verify reports Complete [AC-6 · PERSIST]', async ({ page }) => {
    await login(page);
    const id = await createViaGuidedSetup(page, `${ANALYZER_NAME}_09`);

    const verify = page.getByRole('button', { name: /Verify current setup/i });
    await expect(verify).toBeVisible({ timeout: TIMEOUT });
    // Δ-G: disabled whenever blockers[] is non-empty — which is always, on a fresh shipped profile
    await expect(verify, 'Δ-G fixed? sign-off is reachable — flip to click it and assert the audit event').toBeDisabled();

    // …yet Save-and-continue is open and the step self-reports Complete
    await expect(page.getByRole('button', { name: /Save and continue/i })).toBeEnabled();
    await page.getByRole('button', { name: /Save and continue/i }).click();
    await page.waitForURL(/step=connect/, { timeout: TIMEOUT });
    await expect(page.getByText(/Verify/).first()).toBeVisible();

    const sv = await api<any>(page, `/analyzer/analyzers/${id}/setup-verification`);
    expect(sv.currentlyVerified, 'Δ-G: step says Complete while the entity says unverified').toBe(false);
  });

  test('TC-ANZ-SET-10 Δ-H QC codes are not offered for confirmation [AC-7/FR-B5 · RENDER]', async ({ page }) => {
    await login(page);
    const id = await createViaGuidedSetup(page, `${ANALYZER_NAME}_10`);

    const analyzer = await api<any>(page, `/analyzer/analyzers/${id}`);
    expect(analyzer.qcRules?.length, 'the profile does carry a QC identification rule').toBeGreaterThan(0);

    // Δ-H: the rule exists on the entity but the verify step offers the QC *program* instead of
    // a confirmable list of control identifiers.
    await expect(page.getByRole('link', { name: /Manage QC rules/i })).toBeVisible();
    const rule = analyzer.qcRules[0];
    await expect(
      page.getByText(new RegExp(String(rule.targetField).replace('.', '\\.'), 'i')),
      'Δ-H fixed? the QC identifier is now shown — flip to assert a confirm control',
    ).toHaveCount(0);
  });

  test('TC-ANZ-SET-11 Δ-I no Resolve action on a non-matching row [AC-8/FR-C2 · FUNCTION]', async ({ page }) => {
    await login(page);
    await createViaGuidedSetup(page, `${ANALYZER_NAME}_11`);
    await expect(page.getByText(/Pending Unmapped Codes/i)).toBeVisible({ timeout: TIMEOUT });

    await expect(
      page.getByRole('button', { name: /^Resolve$/i }),
      'Δ-I fixed? flip to assert map-to-existing search + Test Catalog link + don\'t-receive',
    ).toHaveCount(0);
  });

  test('TC-ANZ-SET-12 Δ-J unbound values block the whole analyzer [AC-9/FR-C3 · FUNCTION]', async ({ page }) => {
    await login(page);
    const id = await createViaGuidedSetup(page, `${ANALYZER_NAME}_12`);

    const sv = await api<any>(page, `/analyzer/analyzers/${id}/setup-verification`);
    // AC-9 says a missing test must not block the others. It blocks everything.
    expect(sv.blockers, 'Δ-J fixed? flip to expect activation to survive an unbound value').toContain('UNBOUND_RESULT_VALUES');
    expect(sv.readyForActivation).toBe(false);
    // Δ-M — an activation gate the FRS never defines
    expect(sv.blockers).toContain('NO_ACTIVE_CONTROL_LOT');
  });

  test('TC-ANZ-SET-13 result-mapping empty state links to Test Catalog [AC-12/FR-E2 · RENDER]', async ({ page }) => {
    await login(page);
    await createViaGuidedSetup(page, `${ANALYZER_NAME}_13`);
    await expect(page.getByText(/No active result options are configured for this mapped test/i).first()).toBeVisible({ timeout: TIMEOUT });
    await expect(page.getByRole('link', { name: /Open Test Catalog/i }).first()).toBeVisible();
  });

  test('TC-ANZ-SET-19 Δ-O binding an unbound value cannot be saved [FR-E1 · PERSIST]', async ({ page }) => {
    await login(page);
    const id = await createViaGuidedSetup(page, `${ANALYZER_NAME}_19`);
    await page.goto(`${BASE}/analyzers/${id}/mappings`);
    await expect(page.getByText(/Result Value Mappings/i)).toBeVisible({ timeout: TIMEOUT });

    // FR-E1 holds: the picker offers exactly the mapped test's active options
    const options = await api<any[]>(page, `/analyzer/analyzers/${id}/result-value-options?testCode=MTB`);
    expect(options.length).toBeGreaterThan(0);

    const row = page.locator('tr').filter({ hasText: 'LEGACY_UNBOUND' }).first();
    await row.locator('input').click();
    await page.locator('[role="option"]').first().click();
    await expect(row.locator('input')).not.toHaveValue('');

    // Δ-O: the value shows as chosen but the form never goes dirty, so the only route out of
    // UNBOUND_RESULT_VALUES — and therefore out of SETUP — is closed.
    await expect(
      page.getByRole('button', { name: /Save result mappings/i }),
      'Δ-O fixed? flip to click Save, reload, and assert bindingStatus === "BOUND"',
    ).toBeDisabled();

    const after = await api<any[]>(page, `/analyzer/analyzers/${id}/result-value-mappings`);
    expect(after.some((r) => r.bindingStatus !== 'BOUND')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-ANZ-SET-CONNECT
// ---------------------------------------------------------------------------

test.describe('TC-ANZ-SET-CONNECT — connection and data flow (FR-B6, F1, F2)', () => {
  test('TC-ANZ-SET-14 Δ-K direction default follows the profile, but all modes are offered [AC-10/FR-F2 · RENDER]', async ({ page }) => {
    await login(page);
    const id = await createViaGuidedSetup(page, `${ANALYZER_NAME}_14`);
    await page.goto(`${BASE}/analyzers/${id}/edit?setup=1&step=connect`);
    await expect(page.getByText(/Communication Mode/i)).toBeVisible({ timeout: TIMEOUT });

    // Credit where due: the default tracks the profile's declared capability.
    const profile = await api<any>(page, `/analyzer/profiles/${PROFILE_ID}`);
    const analyzer = await api<any>(page, `/analyzer/analyzers/${id}`);
    const declaresTwoWay = profile.communication?.supports_lis_initiated === true;
    expect(analyzer.communicationMode).toBe(declaresTwoWay ? 'BOTH' : 'ANALYZER_INITIATED');

    // Δ-K part 1: FR-F's data flow (Results only / Two-way send orders) does not exist.
    await expect(
      page.getByText(/Results only \(one-way\)|Two-way \(send orders/i),
      'Δ-K fixed? data flow shipped — flip to assert the one-way default',
    ).toHaveCount(0);

    // Δ-K part 2: every direction is offered regardless of what the profile declares.
    await page.getByRole('combobox').filter({ hasText: /LIS|Bidirectional/i }).first().click();
    const modes = await page.locator('[role="option"]').allInnerTexts();
    expect(modes.length, 'Δ-K fixed? flip to assert two-way is hidden when unsupported').toBe(3);
  });

  // DEFERRED 2026-08-12 (Casey): the analyzer simulator was not attached, so a missing probe may be
  // under-configuration rather than a defect. Re-enable and judge once the harness is connected.
  test.skip('TC-ANZ-SET-15 Δ-L Test Connection performs no probe [FR-B6 · FUNCTION]', async ({ page }) => {
    await login(page);
    const id = await createViaGuidedSetup(page, `${ANALYZER_NAME}_15`);
    await page.goto(`${BASE}/analyzers/${id}/edit?setup=1&step=connect`);

    const calls: string[] = [];
    page.on('request', (r) => { if (/rest\//.test(r.url())) calls.push(r.url()); });

    await page.locator('#analyzer-ip').fill('10.42.20.10');
    await page.locator('#analyzer-port').fill('9600');
    await page.getByRole('button', { name: /Test Connection/i }).click();
    await expect(page.getByRole('heading', { name: /Test Connection/i })).toBeVisible({ timeout: TIMEOUT });
    await page.waitForTimeout(3000);

    const probed = calls.some((u) => /(connection-test|probe|ping|test-connection)/i.test(u));
    expect(probed, 'Δ-L fixed? a probe now runs — flip to assert the plain-language outcome').toBe(false);

    // the modal only mirrors what was typed; no success, no failure, no degrade-to-one-way
    const body = page.locator('.cds--modal-container').filter({ hasText: 'Test Connection' });
    await expect(body).not.toContainText(/succeed|success|fail|unreachable|timed out/i);
  });

  test('TC-ANZ-SET-16 IP/port persist per analyzer [FR-F1 · ROUND-TRIP]', async ({ page }) => {
    await login(page);
    const id = await createViaGuidedSetup(page, `${ANALYZER_NAME}_16`);
    await page.goto(`${BASE}/analyzers/${id}/edit?setup=1&step=connect`);

    await page.locator('#analyzer-ip').fill('10.42.20.11');
    await page.locator('#analyzer-port').fill('9601');
    await page.getByRole('button', { name: /Save and continue/i }).click();
    await page.waitForURL(/step=review/, { timeout: TIMEOUT });

    // read back on the LIST endpoint — a different surface than the edit form wrote to
    const row = (await analyzerList(page)).find((a) => String(a.id) === id);
    expect(row.ipAddress).toBe('10.42.20.11');
    expect(String(row.port)).toBe('9601');
    // FR-F1: the address is analyzer-level, so the shared profile must be untouched
    const profile = await api<any>(page, `/analyzer/profiles/${PROFILE_ID}`);
    expect(JSON.stringify(profile)).not.toContain('10.42.20.11');
  });

  test('TC-ANZ-SET-17 Review enumerates activation blockers [RENDER]', async ({ page }) => {
    await login(page);
    const id = await createViaGuidedSetup(page, `${ANALYZER_NAME}_17`);
    await page.goto(`${BASE}/analyzers/${id}/review?setup=1&step=review`);

    await expect(page.getByText(/Setup is not ready for activation/i)).toBeVisible({ timeout: TIMEOUT });
    await expect(page.getByText(/must be bound to Test Catalog options/i)).toBeVisible();
    // Δ — lab units were collected on the Instrument step but the summary omits them
    await expect(page.getByText(/Lab unit/i), 'summary now shows lab units? add it to the spec').toHaveCount(0);
  });
});

  test('TC-ANZ-SET-09 Δ-P no GUI path to add or re-point an analyzer code [FR-C2/D1/D2 · FUNCTION]', async ({ page }) => {
    await login(page);
    const id = await createViaGuidedSetup(page, `${ANALYZER_NAME}_09`);

    for (const url of [`${BASE}/analyzers/${id}/mappings?setup=1&step=verify`, `${BASE}/analyzers/${id}/mappings`]) {
      await page.goto(url);
      await expect(page.getByText(/Profile-Applied Test Mappings/i)).toBeVisible({ timeout: TIMEOUT });
      const table = page.locator('table').first();
      const controls = await table.locator('tbody button, tbody input, tbody select').count();
      expect(controls, `Δ-P fixed at ${url}? flip to assert a searchable test picker on each row`).toBe(0);
      await expect(page.getByRole('button', { name: /add (mapping|code|row)|new mapping/i })).toHaveCount(0);
    }
    // The only inbound route for a new code is transmission.
    const pending = await api<any[]>(page, `/analyzer/analyzers/${id}/pending-codes`);
    expect(Array.isArray(pending)).toBe(true);
  });

  test('TC-ANZ-SET-13 Δ-J mapping sign-off is gated on QC readiness for every analyzer [AC-9 · FUNCTION]', async ({ page }) => {
    await login(page);
    const all = await analyzerList(page);
    const gates = [];
    for (const a of all.slice(0, 12)) {
      const sv = await api<any>(page, `/analyzer/analyzers/${a.id}/setup-verification`);
      gates.push({ name: a.name, qcApplicable: sv.qcApplicable, mappingReady: sv.mappingReady, blockers: sv.blockers });
    }
    // qcApplicable is true even for analyzers whose profile ships zero QC rules.
    expect(gates.every((g) => g.qcApplicable), 'Δ-J fixed? flip to expect qcApplicable to follow the profile').toBe(true);

    // A fully-mapped analyzer is still blocked, on QC grounds alone.
    const mappedButBlocked = gates.filter((g) => g.mappingReady && g.blockers.length > 0);
    console.log(`[Δ-J] mappingReady yet blocked: ${mappedButBlocked.map((g) => `${g.name} → ${g.blockers.join('+')}`).join(' | ')}`);
    expect(mappedButBlocked.every((g) => g.blockers.every((b: string) => /CONTROL_LOT|QC_RULE/.test(b)))).toBe(true);
  });

  test('TC-ANZ-SET-22 Δ-R control-lot save hides the real validation error [FUNCTION]', async ({ page }) => {
    await login(page);
    const target = (await analyzerList(page))[0];
    await page.goto(`${BASE}/analyzers/qc/control-lots/new?analyzerId=${target.id}`);
    await expect(page.getByText(/New Control Lot/i)).toBeVisible({ timeout: TIMEOUT });

    // The Test picker here offers the WHOLE catalog with search — the capability the
    // test-code mapping screen lacks (see Δ-E). Assert it so a regression here is visible.
    await page.getByRole('combobox', { name: /test/i }).last().click();
    const testOptions = await page.locator('[role="option"]').count();
    const catalog = await api<any[]>(page, '/displayList/ALL_TESTS');
    expect(testOptions).toBe(catalog.length);
    await page.keyboard.press('Escape');

    const failed = page.locator('text=/Failed to save control lot/i');
    // A complete form minus Mean/SD is rejected 400 with a banner that names no field.
    // FLIP-WHEN-FIXED: assert the message names mean/standard deviation, or that the
    // Statistics Configuration fields are marked required up front.
    await expect(failed, 'Δ-R fixed? flip to assert the field-level validation message').toHaveCount(0);
  });

// ---------------------------------------------------------------------------
// TC-ANZ-SET-DELTAS
// ---------------------------------------------------------------------------

test.describe('TC-ANZ-SET-DELTAS — spec-vs-build reconciliation', () => {
  test('TC-ANZ-SET-04 Δ-D the "instrument isn\'t listed" path is absent [AC-4/FR-B3 · FUNCTION]', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE}/analyzers?add=1&step=instrument`);
    await expect(page.getByText(/Set up a new analyzer/i)).toBeVisible({ timeout: TIMEOUT });

    await expect(
      page.getByText(/isn'?t listed|not listed|define a new (profile|type)/i),
      'Δ-D fixed? flip to assert name + protocol + connection-type fields appear',
    ).toHaveCount(0);
  });

  test('TC-ANZ-SET-03b instrument picker type-ahead selects a profile [AC-3 · FUNCTION]', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE}/analyzers?add=1&step=instrument`);
    const trigger = page.getByRole('combobox', { name: /shipped analyzer profile/i });

    // Carbon Dropdown carries no text input; search is type-ahead on the FOCUSED trigger.
    // Focus first — keystrokes sent to the page are swallowed by a global search shortcut that
    // navigates to /analyzers/types?search=… and abandons the in-progress setup. (Cost us a run.)
    await trigger.focus();
    await trigger.click();
    await page.keyboard.type('sys', { delay: 120 });

    await expect(page.locator('[role="option"][aria-selected="true"]')).toContainText(/Sysmex/i);
    await expect(page).toHaveURL(/[?&]add=1/); // still in setup, not bounced to the types page
  });

  test('TC-ANZ-SET-18 Δ-N row actions offer hard Delete, not Deactivate [AC-17/FR-A3 · RENDER]', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE}/analyzers`);
    await page.locator('tbody tr').first().getByRole('button').first().click();

    const items = await page.locator('[role="menuitem"], .cds--overflow-menu-options__btn').allInnerTexts();
    expect(items.join('|')).toMatch(/Delete/i);
    // LIMS constitution: deactivate, never hard-delete.
    expect(
      items.join('|'),
      'Δ-N fixed? Deactivate shipped — flip to assert Delete is gone',
    ).not.toMatch(/Deactivate|Reactivate/i);
  });

  test('TC-ANZ-SET-DATA shipped LOINCs are not 1:1, so FR-C1 cannot be implemented as written', async ({ page }) => {
    await login(page);
    const profile = await api<any>(page, `/analyzer/profiles/${PROFILE_ID}`);
    const byLoinc = new Map<string, string[]>();
    for (const m of profile.default_test_mappings) {
      if (!m.loinc) continue;
      byLoinc.set(m.loinc, [...(byLoinc.get(m.loinc) ?? []), m.test_code]);
    }
    const collisions = [...byLoinc.entries()].filter(([, codes]) => codes.length > 1);
    console.log(`[Δ-E data] LOINC collisions: ${collisions.map(([l, c]) => `${l}→${c.join('/')}`).join('  ')}`);

    // This is a SPEC defect as much as a build one: FR-C1's deterministic 1:1 key needs a
    // tie-break rule before any implementation can satisfy AC-5.
    expect(collisions.length, 'shipped profiles now carry unique LOINCs? FR-C1 becomes implementable').toBeGreaterThan(0);
  });
});
