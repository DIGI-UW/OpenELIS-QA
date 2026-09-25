/**
 * OpenELIS Global - Test Catalog: SILENT ACTIONS.
 *
 * Every case here drives a real editor control through the UI and then asks the one question
 * the rest of the catalog suite never asked: DID THE THING THE TOAST CLAIMS ACTUALLY HAPPEN?
 *
 * Why this file exists (2026-09-23, testing 3.2.2.0, develop 95d6c64):
 * the product owner selected "Copy configuration from test" on DNA PCR (175), picked a source
 * with a select list, clicked the button, and nothing changed. The QA repo had no case for the
 * control at all; the only touch was a docs screenshot capture, outside CI, wrapped in try/catch.
 * A sweep of the editor for the same shape found more controls that report success while
 * doing nothing, or while doing something else. All five deltas were confirmed by a click-through in
 * Chrome and repeated 3x over the API before being encoded here. See
 * qa-report-testing-20260923-silent-actions.md for the ledger (Delta ids below).
 *
 * THE SHAPE, so the next author recognises it:
 *   - `postToOpenElisServerJsonResponse` never hands its callback a falsy value (on 4xx/5xx it
 *     passes `{...body, status}` or `{error, status}`), so every `if (res) { success }` shows
 *     success on a refusal.
 *   - Several endpoints return 200 while skipping the work (a "never clobber" rule, a
 *     create-if-not-exists, a bean-validation echo).
 *   - The UI then toasts success. A test that asserts the toast, or the 200, passes.
 *
 * CONTRACT for every case below: seed through REST (setup is not under test), act through the
 * UI (the control is under test), read back through REST (a different surface from the one that
 * wrote), and compare the toast with the state.
 *
 * FLIP-WHEN-FIXED: the `test.fail()` cases assert the SPEC. Playwright reports them as passing
 * while the product is wrong, and as "Expected to fail, but passed" on the day it is fixed. Then
 * rewrite them to the shipped contract. Each tripwire has an ordinary canary over the same path
 * (harness ref 12.31) so a broken selector cannot masquerade as a still-present defect.
 *
 * DATA: everything created is prefixed QA_SA / QASA and created inactive. Nothing is deleted
 * (LIMS rule). The one existing-record mutation (the duplicate-name panel) targets a panel this
 * file seeds, and afterAll restores it.
 */
import { test, expect, type Page } from '@playwright/test';
import { apiGet, apiWrite } from './helpers/silentSave';
import { createTestViaRest, setComponentViaRest } from './legacy-order-helper';

const RUN = `${Date.now()}`.slice(-6);

// ---------------------------------------------------------------------------------------------
// Toast capture. Toasts auto-dismiss and some actions reload the section, so polling the DOM
// after the fact misses them. Record every notification that mounts, with its kind.
// ---------------------------------------------------------------------------------------------
type Toast = { kind: 'success' | 'error' | 'warning' | 'info' | 'unknown'; text: string };

async function watchToasts(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as any;
    w.__qaToasts = [];
    if (w.__qaToastObs) return;
    const SEL = '.cds--toast-notification, .cds--actionable-notification, .cds--inline-notification';
    w.__qaToastObs = new MutationObserver((ms) => {
      for (const m of ms) for (const n of Array.from(m.addedNodes)) {
        if (!(n instanceof HTMLElement)) continue;
        const el = n.matches(SEL) ? n : (n.querySelector(SEL) as HTMLElement | null);
        if (!el) continue;
        const c = el.className;
        const kind = /--success/.test(c) ? 'success' : /--error/.test(c) ? 'error'
          : /--warning/.test(c) ? 'warning' : /--info/.test(c) ? 'info' : 'unknown';
        w.__qaToasts.push({ kind, text: (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 200) });
      }
    });
    w.__qaToastObs.observe(document.body, { childList: true, subtree: true });
  });
}
const toasts = (page: Page): Promise<Toast[]> => page.evaluate(() => (window as any).__qaToasts ?? []);

async function open(page: Page, path: string): Promise<void> {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!localStorage.getItem('CSRF'), null, { timeout: 30_000 });
}

/** Wait for the response to a matching request that the UI action triggers. */
function nextResponse(page: Page, method: string, re: RegExp) {
  return page.waitForResponse((r) => r.request().method() === method && re.test(new URL(r.url()).pathname),
    { timeout: 30_000 });
}

/** Carbon ComboBox without filtering: open it and click the exact option. */
async function pickFromCombo(page: Page, inputId: string, optionText: string): Promise<void> {
  const input = page.locator(`#${inputId}`);
  await input.scrollIntoViewIfNeeded();
  await input.click();
  await page.getByRole('option', { name: optionText, exact: true }).first().click();
}

// ---------------------------------------------------------------------------------------------
// Seed helpers (REST; setup is not the thing under test)
// ---------------------------------------------------------------------------------------------
type Opt = { value: string; valueName: string };

/**
 * Pick a real, ACTIVE catalog test to copy FROM (the Copy combobox lists only active tests, via
 * /rest/test-list) and a disjoint set of dictionary options for the seeded target. The source is
 * only read, never written. No baked fixtures: discovered per instance.
 */
async function discoverSourceAndTargetOptions(page: Page): Promise<{ srcId: string; srcLabel: string; tgt: Opt[] }> {
  const list = await apiGet<any[]>(page, '/rest/test-list');
  expect(list.ok && Array.isArray(list.json), 'GET /rest/test-list must return the catalog').toBe(true);
  let src: { id: string; label: string; names: Set<string> } | null = null;
  const pool = new Map<string, Opt>();
  for (const t of (list.json as any[]).slice(0, 80)) {
    const sr = await apiGet<any>(page, `/rest/test-catalog/tests/${t.id}/sample-results`);
    const comps: any[] = sr.json?.components ?? [];
    const primary = comps.find((c) => c.code === 'PRIMARY');
    const opts: any[] = primary?.options ?? [];
    if (!src && comps.length === 1 && primary?.resultType === 'D' && opts.length >= 2) {
      src = { id: String(t.id), label: String(t.value), names: new Set(opts.map((o) => o.valueName)) };
    }
    for (const c of comps) for (const o of c.options ?? []) {
      if (o.value && o.valueName && !pool.has(o.valueName)) pool.set(o.valueName, { value: String(o.value), valueName: o.valueName });
    }
    if (src && [...pool.values()].filter((o) => !src!.names.has(o.valueName)).length >= 2) break;
  }
  expect(src, 'need an active single-component dictionary test to copy from').toBeTruthy();
  const tgt = [...pool.values()].filter((o) => !src!.names.has(o.valueName)).slice(0, 2);
  expect(tgt.length, 'need 2 dictionary options the source does not carry, to make the copy a real difference').toBe(2);
  return { srcId: src!.id, srcLabel: src!.label, tgt };
}

async function seedDictionaryTest(page: Page, name: string, code: string, opts: Opt[]): Promise<string> {
  const id = await createTestViaRest(page, { name, code });
  await setComponentViaRest(page, id, {
    code: 'PRIMARY', label: name, resultType: 'D',
    options: opts.map((o, i) => ({ value: o.value, valueName: o.valueName, resultType: 'D', sortOrder: i + 1, normal: false })),
  });
  return id;
}

async function primaryOptionNames(page: Page, testId: string): Promise<string[]> {
  const sr = await apiGet<any>(page, `/rest/test-catalog/tests/${testId}/sample-results`);
  expect(sr.status, `read back sample-results for ${testId}`).toBe(200);
  const primary = (sr.json?.components ?? []).find((c: any) => c.code === 'PRIMARY');
  return (primary?.options ?? []).map((o: any) => o.valueName).sort();
}


// =============================================================================================
// Sample & Results: "Copy configuration from test"          Delta-SA1  (AC: OGC-967, OGC-930)
// =============================================================================================
test.describe('Sample & Results - Copy configuration from test', () => {
  let srcId = ''; let tgtId = ''; let srcLabel = ''; // source: a real active test, read only
  let srcOpts: string[] = []; let tgtOptsBefore: string[] = [];

  test.beforeAll(async ({ browser }) => {
    const page = await (await browser.newContext({ storageState: '.auth/user.json' })).newPage();
    await open(page, '/MasterListsPage/TestCatalogList');
    const found = await discoverSourceAndTargetOptions(page);
    srcId = found.srcId; srcLabel = found.srcLabel;
    tgtId = await seedDictionaryTest(page, `QA_SA TGT ${RUN}`, `QASAT${RUN}`, found.tgt);
    srcOpts = await primaryOptionNames(page, srcId);
    tgtOptsBefore = await primaryOptionNames(page, tgtId);
    await page.context().close();
  });

  test('TC-SA-01: canary - Copy stages nothing until confirmed: Cancel writes nothing', async ({ page }) => {
    // Rewritten 2026-09-25 for the shipped OGC-1234 contract: Copy opens a confirmation first and
    // nothing is written until Save. The old canary expected an immediate POST copy-from/{source}.
    expect(srcOpts.length, 'seeded source must carry options').toBeGreaterThan(0);
    expect(srcOpts, 'seeded source and target must differ, or the copy case below proves nothing').not.toEqual(tgtOptsBefore);
    const writes: string[] = [];
    page.on('request', (r) => {
      if (r.method() !== 'GET' && r.url().includes(`/tests/${tgtId}/`)) writes.push(`${r.method()} ${r.url()}`);
    });
    await open(page, `/MasterListsPage/TestCatalogEditor/${tgtId}/sample-results`);
    await page.locator('#copy-from-test').waitFor({ state: 'visible', timeout: 60_000 });
    await pickFromCombo(page, 'copy-from-test', srcLabel);
    await page.getByRole('button', { name: /^copy from test$/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog, 'Copy opens a confirmation before replacing anything').toBeVisible({ timeout: 10_000 });
    await dialog.getByRole('button', { name: /cancel/i }).first().click();
    await page.waitForTimeout(1500);
    expect(writes, 'cancelling the confirmation must write nothing').toEqual([]);
    expect(await primaryOptionNames(page, tgtId), 'the target is unchanged after Cancel').toEqual(tgtOptsBefore);
  });

  test('TC-SA-02: FIXED (OGC-1234) - Copy asks to confirm a destructive replace, then Save persists the source config', async ({ page }) => {
    // Delta-SA1. Contract (Casey, 2026-09-23): Copy REPLACES the target's configuration. Because
    // that is destructive, clicking Copy opens a confirmation modal warning that the change is
    // irreversible once saved. Confirming stages the source config in the editor; Save commits it.
    // Today: no modal, copyComponentsFromTest skips any configured component (every test has
    // PRIMARY), the target is unchanged, and the UI toasts "Configuration copied."
    // FIXED 2026-09-25 (OGC-1234, OpenELIS-Global-2 #4415): flipped on testing 3.2.3.0.
    await open(page, `/MasterListsPage/TestCatalogEditor/${tgtId}/sample-results`);
    await page.locator('#copy-from-test').waitFor({ state: 'visible', timeout: 60_000 });
    await pickFromCombo(page, 'copy-from-test', srcLabel);
    await page.getByRole('button', { name: /^copy from test$/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog, 'Copy must open a confirmation modal before replacing anything').toBeVisible({ timeout: 10_000 });
    await expect(dialog, 'the modal must warn that the replace is irreversible once saved').toContainText(/irreversible|cannot be undone|can't be undone/i);
    await dialog.getByRole('button', { name: /confirm|replace|copy|yes|continue/i }).first().click();
    await page.getByRole('button', { name: /^save$/i }).last().click();
    await page.waitForTimeout(2500);
    expect(await primaryOptionNames(page, tgtId),
      'after confirm + Save, the target PRIMARY carries the source options (OGC-967: "refreshes with the copied rows")').toEqual(srcOpts);
  });
});

// =============================================================================================
// Panel Editor: "Add Panel" with a name that already exists       Delta-SA2 (regression of OGC-1122 fix)
// =============================================================================================
test.describe('Panel Editor - New panel with an existing name', () => {
  const NAME = `QASA${RUN}`; // PANEL_NAME_MAX_LENGTH is 20
  // Panel descriptions must be unique across panels: a duplicate answers 500 (Delta-SA6).
  const DESC = `QA seeded ${RUN}`;
  let panelId = '';

  test.beforeAll(async ({ browser }) => {
    const page = await (await browser.newContext({ storageState: '.auth/user.json' })).newPage();
    await open(page, '/MasterListsPage/TestCatalogList?entity=panels');
    const created = await apiWrite<any>(page, 'POST', '/rest/test-catalog/panels', { name: NAME, active: false });
    expect(created.status, 'seed panel create (a new name answers 201)').toBe(201);
    panelId = String(created.json?.id ?? '');
    // Send the full basic-info body, as the editor does ({name, description, domain, active}).
    const list = await apiGet<any[]>(page, '/rest/test-list');
    let member = '';
    for (const t of ((list.json as any[]) ?? []).slice(0, 60)) {
      const bi = await apiGet<any>(page, `/rest/test-catalog/tests/${t.id}/basic-info`);
      if (String(bi.json?.domain ?? '').toUpperCase() === 'CLINICAL') { member = String(t.id); break; }
    }
    expect(member, 'need an active CLINICAL test to seed panel membership').not.toBe('');
    const add = await apiWrite(page, 'PUT', `/rest/test-catalog/panels/${panelId}/tests`,
      { tests: [{ testId: member, position: 1 }], autoActivate: true });
    expect(add.status, 'seed panel membership').toBe(200);
    const act = await apiWrite(page, 'PUT', `/rest/test-catalog/panels/${panelId}/basic-info`,
      { name: NAME, description: DESC, domain: 'CLINICAL', active: true });
    expect(act.status, 'seed panel active with a description').toBe(200);
    await page.context().close();
  });

  test.afterAll(async ({ browser }) => {
    if (!panelId) return;
    const page = await (await browser.newContext({ storageState: '.auth/user.json' })).newPage();
    await open(page, '/MasterListsPage/TestCatalogList?entity=panels');
    await apiWrite(page, 'PUT', `/rest/test-catalog/panels/${panelId}/basic-info`,
      { name: NAME, description: DESC, domain: 'CLINICAL', active: true });
    await page.context().close();
  });

  async function saveNewPanel(page: Page, name: string, description: string) {
    await open(page, '/MasterListsPage/TestCatalogEditor/panel/new/basic-info');
    await page.locator('#panel-name').waitFor({ state: 'visible', timeout: 60_000 });
    await watchToasts(page);
    await page.locator('#panel-name').fill(name);
    await page.locator('#panel-description').fill(description);
    const post = nextResponse(page, 'POST', /\/rest\/test-catalog\/panels$/);
    await page.getByRole('button', { name: /^save$/i }).click();
    const r = await post;
    const body = await r.json().catch(() => ({}));
    await page.waitForTimeout(2000);
    return { status: r.status(), returnedId: String(body?.id ?? ''), toasts: await toasts(page) };
  }

  test('TC-SA-10: canary - a NEW name creates a NEW panel', async ({ page }) => {
    const fresh = `QASN${RUN}`;
    const r = await saveNewPanel(page, fresh, `QA canary ${RUN}`);
    expect(r.status, 'a new name answers 201 Created').toBe(201);
    expect(r.returnedId, 'a new name must mint a new id, not reuse the seeded panel').not.toBe(panelId);
    const readBack = await apiGet<any>(page, `/rest/test-catalog/panels/${r.returnedId}`);
    expect(readBack.json?.name, 'the new panel reads back by id').toBe(fresh);
  });

  test('TC-SA-12: FLIP-WHEN-FIXED - POST /panels refuses an existing name with 409 (OGC-1122)', async ({ page }) => {
    // OGC-1122 was REJECTED 2026-09-24 for exactly this: its fix made POST /panels
    // create-if-not-exists, answering 200 with the EXISTING panel, which the New Panel form then
    // overwrites (TC-SA-11). Suggested contract on the ticket: 409 {error:"duplicate", panelId}.
    // Canary over the same endpoint: TC-SA-10 (a new name mints a new panel), which passes before
    // and after the fix. This case used to pin the 200 as a plain contract, which would have gone
    // red on the fix instead of flipping.
    test.fail(true, 'OGC-1122 (rejected): a duplicate name answers 200 with the existing panel; flips at 409');
    await open(page, '/MasterListsPage/TestCatalogList?entity=panels');
    const r = await apiWrite<any>(page, 'POST', '/rest/test-catalog/panels', { name: NAME, active: false });
    const p = await apiGet<any>(page, `/rest/test-catalog/panels/${panelId}`);
    expect(p.json?.active, 'a create call must never change the existing panel').toBe(true);
    expect(r.status, `a duplicate name must be refused, got ${r.status}: ${r.text.slice(0, 120)}`).toBe(409);
    expect(String(r.json?.panelId ?? ''), 'the refusal names the existing panel').toBe(panelId);
  });

  test('TC-SA-11: FLIP-WHEN-FIXED - "Add Panel" with an existing name must not alter the existing panel', async ({ page }) => {
    // Delta-SA2, tracked on OGC-1122 (rejected 2026-09-24). Today: POST /panels is
    // create-if-not-exists (the OGC-1122 fix) and returns the
    // EXISTING panel with 200; the New Panel form then PUTs {active:false, description} onto it.
    // A live panel is deactivated (drops out of order entry) and its description overwritten,
    // and the editor opens on it with no warning.
    // No "the create call resolved to the seeded panel" precondition any more: after the fix the
    // create is refused, so that precondition would keep this tripwire failing forever.
    test.fail(true, 'OGC-1122 / Delta-SA2: new-panel Save takes over a same-named panel; flips when the form refuses a duplicate');
    await saveNewPanel(page, NAME, `typed in New panel form ${RUN}`).catch(() => null);
    const p = await apiGet<any>(page, `/rest/test-catalog/panels/${panelId}`);
    expect(p.status, 'precondition: the seeded panel still reads back').toBe(200);
    expect({ active: p.json?.active, description: p.json?.description },
      'an admin creating a NEW panel must never deactivate or rewrite an existing one')
      .toEqual({ active: true, description: DESC });
  });
});

// =============================================================================================
// Methods: "+ Create New Method" with a code that already exists      Delta-SA3
// =============================================================================================
test.describe('Methods - inline create refused (409)', () => {
  const CODE = `QASA${RUN}`; // 3-10 uppercase alphanumeric
  let firstTest = ''; let secondTest = '';

  test.beforeAll(async ({ browser }) => {
    const page = await (await browser.newContext({ storageState: '.auth/user.json' })).newPage();
    firstTest = await createTestViaRest(page, { name: `QA_SA METH A ${RUN}`, code: `QASMA${RUN}` });
    secondTest = await createTestViaRest(page, { name: `QA_SA METH B ${RUN}`, code: `QASMB${RUN}` });
    await page.context().close();
  });

  async function inlineCreate(page: Page, testId: string, code: string) {
    await open(page, `/MasterListsPage/TestCatalogEditor/${testId}/methods`);
    await page.getByTestId('methods-section').waitFor({ state: 'visible', timeout: 60_000 });
    await watchToasts(page);
    await page.getByRole('button', { name: /create new method/i }).click();
    await page.locator('#inline-name-en').fill(`QA Method ${code}`);
    await page.locator('#inline-name-fr').fill(`QA Methode ${code}`);
    await page.locator('#inline-code').fill(code);
    const date = page.locator('#inline-effective-date');
    await date.fill('2026-09-23');
    await date.press('Enter');
    const resp = nextResponse(page, 'POST', /\/methods\/inline-create$/);
    await page.getByRole('button', { name: /create & link/i }).click();
    const r = await resp;
    await page.waitForTimeout(1500);
    const links = await apiGet<any[]>(page, `/rest/test/${testId}/methods`);
    return { status: r.status(), toasts: await toasts(page), links: (links.json as any[]) ?? [] };
  }

  test('TC-SA-20: canary - a new code creates and links the method', async ({ page }) => {
    const r = await inlineCreate(page, firstTest, CODE);
    expect(r.status, 'inline-create answered').toBeLessThan(300);
    expect(r.links.map((l) => l.methodCode), 'the new method is linked to the test').toContain(CODE);
  });

  test('TC-SA-22: contract - the server refuses a duplicate method code with 409 and links nothing', async ({ page }) => {
    // Proves TC-SA-21's precondition outside test.fail: the server side is correct today.
    await open(page, `/MasterListsPage/TestCatalogEditor/${secondTest}/methods`);
    const r = await apiWrite(page, 'POST', `/rest/test/${secondTest}/methods/inline-create`,
      { nameEnglish: 'QA dup', nameFrench: 'QA dup', code: CODE, isDefault: false, effectiveDate: '2026-09-23' });
    expect(r.status, 'duplicate code is a 409').toBe(409);
    const links = await apiGet<any[]>(page, `/rest/test/${secondTest}/methods`);
    expect((links.json as any[]) ?? [], 'nothing linked').toHaveLength(0);
  });

  test('TC-SA-21: FIXED (OGC-1234) - a refused create (409 duplicate code) must not toast success', async ({ page }) => {
    // Delta-SA3. Today: 409 "Method code already exists" -> the helper passes a truthy
    // {error,status} -> `if (res)` closes the form, clears it, and shows a green toast whose
    // text is the button label. Nothing is linked. Same pattern: Link Method, Copy methods.
    // FIXED 2026-09-25 (OGC-1234, OpenELIS-Global-2 #4415): flipped on testing 3.2.3.0.
    const r = await inlineCreate(page, secondTest, CODE);
    expect(r.status, 'precondition: the server refused the duplicate').toBe(409);
    expect(r.links, 'precondition: nothing was linked').toHaveLength(0);
    expect(r.toasts.filter((t) => t.kind === 'success'), 'a refused create must not show a success toast').toHaveLength(0);
  });
});

// =============================================================================================
// Sample Type Editor: create                                     Delta-SA4, Delta-SA5
// =============================================================================================
test.describe('Sample Type Editor - create', () => {
  async function createSampleType(page: Page, name: string, description: string) {
    await open(page, '/MasterListsPage/SampleTypeEditor');
    await page.getByRole('button', { name: /add sample type/i }).click({ timeout: 60_000 });
    await page.locator('#st-name').waitFor({ state: 'visible', timeout: 30_000 });
    await watchToasts(page);
    await page.locator('#st-name').fill(name);
    await page.locator('#st-description').fill(description);
    const resp = nextResponse(page, 'POST', /\/rest\/SampleTypeCreate$/);
    await page.getByRole('button', { name: /^create sample type$/i }).click();
    const r = await resp;
    await page.waitForTimeout(2500);
    const list = await apiGet<any>(page, '/rest/sample-types');
    const rows: any[] = list.json?.data ?? list.json ?? [];
    return { status: r.status(), toasts: await toasts(page), row: rows.find((x) => x.name === name) };
  }

  test('TC-SA-30: canary - a plain name creates the sample type', async ({ page }) => {
    const r = await createSampleType(page, `QASA${RUN}-ST`, `QA description ${RUN}`);
    expect(r.status, 'SampleTypeCreate answered').toBe(200);
    expect(r.row, 'the new sample type reads back from GET /sample-types').toBeTruthy();
  });

  test('TC-SA-31: FLIP-WHEN-FIXED - the required Description typed on create is stored', async ({ page }) => {
    // Delta-SA4. Today: SampleTypeManagement builds the create payload without `description`,
    // so the server falls back to the name. The field is marked required (*) and is discarded.
    test.fail(true, 'Delta-SA4: create payload omits description; flips when it is sent');
    const desc = `QA typed description ${RUN}`;
    const r = await createSampleType(page, `QASB${RUN}-ST`, desc);
    expect(r.row, 'precondition: the sample type was created').toBeTruthy();
    expect(r.row?.description, 'the Description the admin typed must be what is stored').toBe(desc);
  });

  test('TC-SA-33: contract - a name carrying HTML is not created', async ({ page }) => {
    // Proves TC-SA-32's precondition outside test.fail: refusing the name is correct.
    await open(page, '/MasterListsPage/SampleTypeEditor');
    const name = `QA<b>${RUN}</b>`;
    await apiWrite(page, 'POST', '/rest/SampleTypeCreate', {
      formName: 'sampleTypeCreateForm', sampleTypeEnglishName: name, sampleTypeFrenchName: name, domain: 'CLINICAL', active: false });
    const list = await apiGet<any>(page, '/rest/sample-types');
    const rows: any[] = list.json?.data ?? list.json ?? [];
    expect(rows.length, 'the sample-type list read back').toBeGreaterThan(0);
    expect(rows.find((x) => x.name === name), 'an HTML-bearing name must not be stored').toBeUndefined();
  });

  test('TC-SA-32: FIXED (OGC-1234) - a refused create (HTML in the name) must not report "saved successfully"', async ({ page }) => {
    // Delta-SA5. Today: bean validation (@SafeHtml NONE) refuses the name, the controller answers
    // HTTP 200 echoing the form, the UI finds no new row and still toasts success.
    // FIXED 2026-09-25 (OGC-1234, OpenELIS-Global-2 #4415): flipped on testing 3.2.3.0.
    const name = `QA<i>${RUN}</i>`;
    const r = await createSampleType(page, name, 'QA safe-html probe');
    expect(r.row, 'precondition: nothing was created').toBeFalsy();
    expect(r.toasts.filter((t) => t.kind === 'success' || /saved successfully/i.test(t.text)),
      'a create that created nothing must not say it saved').toHaveLength(0);
  });
});
