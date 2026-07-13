/**
 * OpenELIS Global — Test Catalog editor: SECTION ROUND-TRIP suite (A–G).
 * Target: testing.openelis-global.org (v3.2.1.10). Authored 2026-07-08.
 *
 * Codifies the manual Chrome runs (2026-07-06→08) into deterministic, re-runnable specs.
 * Strategy: drive the real editor UI with Playwright (its fill()/selectOption()/check() fire
 * React's onChange reliably), then VERIFY through a *different* surface — the REST read-back
 * endpoint — so each write TC carries round-trip evidence (grading: PERSIST / ROUND-TRIP).
 *
 * Save model (verified): each section has its own inline/section Save; the TOP toolbar Save is a
 * no-op for Basic Info (OGC-1114). Methods/Labels/Alerts persist from their add-dialog; Panels &
 * Ranges & Sample-Results stage in the accordion/table and commit on the section Save button.
 *
 * Endpoints (verified this session):
 *   GET  /rest/test-catalog/tests?search=&page=&pageSize=      -> { total, rows:[{id,name,...}] }
 *   POST /rest/test-catalog/tests                              (create; new tests are Inactive)
 *   GET/PUT /rest/test-catalog/tests/{id}/basic-info           -> { testId,name,code,description,domain,active,orderable }
 *   GET  /rest/test-catalog/tests/{id}/sample-results          -> { components:[{id,label,code,resultType,displayOrder,options}] }
 *   GET  /rest/test-catalog/tests/{id}/ranges                  -> { ranges:[{id,componentId,minAge,lowNormal,highNormal,lowCritical,highCritical,lowValid,highValid}], coverage }
 *   GET  /rest/test-catalog/tests/{id}/panels                  -> { memberships:[{panelId,panelName,position}] }
 *   GET  /rest/test-catalog/tests/{id}/terminology             -> { mappings:[{id,source,code}] }
 *   POST /rest/test-catalog/tests/{id}/activate                (200);  POST .../deactivate -> 404;  DELETE .../activate -> 405  (OGC-1115)
 *   GET  /rest/test-list                                       -> [{id,value}]                (orderable list; OGC-1116)
 *   GET  /rest/sample-type-tests?sampleType={id}               -> { panels:[{testIds}] };  no param -> HTTP 500 (OGC-1120)
 *   -- Methods/Labels/Alerts read from THREE OTHER namespaces (discovered 2026-07-08 via perf-timing capture):
 *   GET  /rest/test/{id}/methods                               -> [{methodId,methodName,isDefault,effectiveDate}]
 *   GET  /rest/api/tests/{id}/labelConfig                      -> { allowOrderEntryOverride, links:[...presets] }
 *   GET  /rest/test-catalog/{id}/alerts                        -> [{name,enabled,triggerType,notifyEmail,...}]  (NB: no /tests/ segment)
 */

import { test, expect, Page, APIRequestContext } from '@playwright/test';

const BASE = process.env.BASE || 'https://testing.openelis-global.org';
const REST = `${BASE}/api/OpenELIS-Global/rest`;
const TC = `${REST}/test-catalog`;
const ADMIN = { user: process.env.OE_USER || 'admin', pass: process.env.OE_PASS || 'adminADMIN!' };
const STAMP = `QA_AUTO_${new Date().toISOString().slice(5, 10).replace('-', '')}`;
const SERUM = process.env.SERUM_ID || '2';           // Serum sample type
const BIOCHEM = 'Biochemistry';                       // lab unit

// ---------- helpers ----------
async function login(page: Page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  // With a preloaded storageState (guards.config.ts) we're already authenticated, so /login
  // redirects away and no username field appears — skip fast instead of hanging on fill().
  const userField = page.locator('input[name="loginName"], #loginName, input[placeholder*="ser" i]').first();
  if (!(await userField.isVisible({ timeout: 4000 }).catch(() => false))) return;
  // Short timeouts + catches: the testing login page intermittently hangs ("Loginloading"); never
  // let that stall a test for 150s — storageState already authenticates us.
  await userField.fill(ADMIN.user, { timeout: 8000 }).catch(() => {});
  await page.fill('input[type="password"], #password', ADMIN.pass, { timeout: 8000 }).catch(() => {});
  await page.getByRole('button', { name: /login|sign in|submit/i }).first()
    .click({ timeout: 8000 }).catch(() => page.keyboard.press('Enter').catch(() => {}));
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
}
const getJson = (rq: APIRequestContext, url: string) =>
  rq.get(url, { headers: { Accept: 'application/json' } }).then((r) => r.json());

/** Authenticated write from the PAGE context: sends the session cookie AND the X-CSRF-Token that
 *  OpenELIS keeps in localStorage['CSRF']. The bare `request` fixture has neither the token nor
 *  localStorage, so its POST/DELETE 403 regardless of whether the endpoint exists — masking the
 *  real verdict (e.g. OGC-1115 deactivate). Returns the HTTP status. */
async function apiWrite(page: Page, method: 'POST' | 'DELETE' | 'PUT', url: string): Promise<number> {
  if (!page.url().startsWith(BASE)) await nav(page, `${BASE}/`);
  return page.evaluate(async ({ m, u }) => {
    const csrf = localStorage.getItem('CSRF') || '';
    const res = await fetch(u, { method: m, headers: { Accept: 'application/json', 'X-CSRF-Token': csrf }, credentials: 'include' });
    return res.status;
  }, { m: method, u: url });
}

/** SPA-safe navigation: a client-side redirect during goto can throw net::ERR_ABORTED even though
 *  the page loads fine — tolerate it and retry, so a transient abort isn't read as a failure. */
async function nav(page: Page, url: string) {
  for (let i = 0; i < 3; i++) {
    try { await page.goto(url, { waitUntil: 'domcontentloaded' }); return; }
    catch (e) { if (!/ERR_ABORTED|interrupted|frame was detached|navigation/i.test(String(e))) throw e; await page.waitForTimeout(1200); }
  }
  await page.goto(url, { waitUntil: 'commit' }).catch(() => {});
  await page.waitForTimeout(800);
}

/** Look up a just-created test's id by its unique name via the authenticated REST list. */
async function findTestIdByName(page: Page, name: string): Promise<string | null> {
  const d = await getJson(page.request, `${TC}/tests?search=${encodeURIComponent(name)}&page=1&pageSize=10`).catch(() => null);
  const row = d && Array.isArray(d.rows) ? d.rows.find((r: any) => r.name === name) : null;
  return row ? String(row.id) : null;
}

/** Create a test through the New-test form; returns its id. New tests are created Inactive.
 *  The testing instance drops sessions mid-run (form bounces to /login; create Save silently doesn't
 *  persist). So retry the WHOLE create up to 3× — re-login + reload the form + re-fill + re-Save —
 *  and after each attempt check whether the test now exists by name. Fails loudly only if all fail. */
async function createTest(page: Page, name: string, code: string, sampleType = 'Serum'): Promise<string> {
  const url = `${BASE}/MasterListsPage/TestCatalogEditor/new/basic-info`;
  const nameField = () => page.getByLabel('Test name', { exact: false }).first();
  for (let attempt = 1; attempt <= 3; attempt++) {
    // Maybe a prior attempt already created it (Save fired but redirect/lookup raced).
    const pre = await findTestIdByName(page, name); if (pre) return pre;
    await nav(page, url);
    if (!(await nameField().isVisible({ timeout: 8000 }).catch(() => false))) { await login(page); await nav(page, url); }
    if (!(await nameField().isVisible({ timeout: 12000 }).catch(() => false))) continue; // form never loaded → retry
    await nameField().fill(name).catch(() => {});
    await page.getByLabel('Reporting name', { exact: false }).first().fill(name).catch(() => {});
    const codeField = page.getByLabel('Test code', { exact: false }).first();
    await codeField.click().catch(() => {}); await codeField.fill(code).catch(() => {});   // overwrite auto-fill
    await pickCombo(page, 'Lab Unit', BIOCHEM).catch(() => {});
    await pickCombo(page, 'Sample type', sampleType).catch(() => {});
    await page.getByRole('button', { name: /^Save$/ }).last().click().catch(() => {});
    // Resolve id (redirect target is inconsistent: /{id}/basic-info or /). Poll by URL then by name.
    for (let i = 0; i < 8; i++) {
      const m = page.url().match(/TestCatalogEditor\/(\d+)\//); if (m) return m[1];
      const id = await findTestIdByName(page, name); if (id) return id;
      await page.waitForTimeout(1200);
    }
    // not persisted this attempt → loop and retry the whole create
  }
  throw new Error(`createTest: could not create "${name}" after 3 attempts (instance session instability)`);
}
async function pickCombo(page: Page, label: string, optionText: string) {
  // Carbon/downshift combobox (v3.2.1.11 editor): a role=combobox input (Lab Unit / Sample type /
  // Add to panel) or a toggle-button (Add Label Type). The reliable pattern (verified by hand):
  // OPEN it, then do a REAL click on the option ROW — NOT combo.fill(), which types into the box
  // without committing a selection and leaves the required field empty (Save then silently fails to
  // create → looked like a "hang"). Playwright auto-scrolls the option into view within the listbox.
  const combo = page.getByLabel(label, { exact: false }).first();
  await combo.scrollIntoViewIfNeeded().catch(() => {});
  await combo.click();
  await page.waitForTimeout(500);

  const clickIfVisible = async (loc: any) => {
    const el = loc.first();
    if (await el.isVisible({ timeout: 1500 }).catch(() => false)) { await el.click(); return true; }
    return false;
  };
  let picked =
    (await clickIfVisible(page.getByRole('option', { name: optionText, exact: true }))) ||
    (await clickIfVisible(page.getByRole('option', { name: optionText, exact: false }))) ||
    (await clickIfVisible(page.locator('[role="listbox"] [role="option"], [role="listbox"] li').filter({ hasText: optionText })));
  if (!picked) {
    // Long list: type a few chars to filter, then click the option (still a real option-row click).
    await combo.pressSequentially(optionText.slice(0, 8), { delay: 25 }).catch(() => {});
    await page.waitForTimeout(600);
    picked = await clickIfVisible(page.getByRole('option', { name: optionText, exact: false }));
  }
  await page.waitForTimeout(400);

  // Verify the selection actually committed (a combobox left empty makes Save silently no-op).
  const committed = await combo.inputValue().then((v: string) => !!v && new RegExp(optionText.slice(0, 6), 'i').test(v)).catch(() => false);
  if (!picked && !committed) throw new Error(`pickCombo("${label}") could not select "${optionText}"`);
}
async function gotoSection(page: Page, id: string, section: string) {
  await nav(page, `${BASE}/MasterListsPage/TestCatalogEditor/${id}/${section}`);
  await page.waitForTimeout(800);
}
/** Click the bottom section Save (not the top toolbar Save). */
async function sectionSave(page: Page) {
  const saves = page.getByRole('button', { name: /^Save$/ });
  await saves.last().click();
  await page.waitForTimeout(1500);
}

test.describe('Test Catalog editor — section round-trips (A–G)', () => {
  test.beforeEach(async ({ page }) => login(page));

  // ---------- A. list & create ----------
  test('TCA-03: duplicate code is rejected with a field error, no create', async ({ page, request }) => {
    const before = await getJson(request, `${TC}/tests?search=&page=1&pageSize=1`).then((d) => d.total);
    await nav(page, `${BASE}/MasterListsPage/TestCatalogEditor/new/basic-info`);
    await page.getByLabel('Test name', { exact: false }).first().fill(`${STAMP} DupCode`);
    await page.getByLabel('Reporting name', { exact: false }).first().fill(`${STAMP} DupCode`);
    const codeField = page.getByLabel('Test code', { exact: false }).first();
    await codeField.click(); await codeField.fill('Amylase-Serum');          // existing code
    await pickCombo(page, 'Lab Unit', BIOCHEM);
    await pickCombo(page, 'Sample type', 'Serum');
    await page.getByRole('button', { name: /^Save$/ }).last().click();
    await expect(page.getByText(/a test with this code already exists/i)).toBeVisible();
    await expect(page).toHaveURL(/\/new\/basic-info/);                       // no redirect => no create
    const after = await getJson(request, `${TC}/tests?search=&page=1&pageSize=1`).then((d) => d.total);
    expect(after, 'total unchanged — nothing created').toBe(before);
  });

  // ---------- C. Sample & Results: multi-component accordion + reorder ----------
  test('TCC-10: two components render as accordion, persist, and reorder round-trips', async ({ page, request }) => {
    const id = await createTest(page, `${STAMP} MultiComp`, `${STAMP}_MC`);
    await gotoSection(page, id, 'sample-results');

    // component 1
    await page.getByRole('button', { name: /add component/i }).first().click();
    await page.getByLabel('Component code', { exact: false }).first().fill('COMPA');
    await page.getByLabel('Component label', { exact: false }).first().fill('Component A');
    // component 2
    await page.getByRole('button', { name: /add component/i }).first().click();
    const codes = page.getByLabel('Component code', { exact: false });
    const labels = page.getByLabel('Component label', { exact: false });
    await codes.last().fill('COMPB'); await labels.last().fill('Component B');
    await sectionSave(page);

    let sr = await getJson(request, `${TC}/tests/${id}/sample-results`);
    expect(sr.components.map((c: any) => c.label).sort()).toEqual(['Component A', 'Component B']);
    const firstLabelBefore = sr.components.sort((a: any, b: any) => a.displayOrder - b.displayOrder)[0].label;

    // reorder: move the first component's down-arrow, save, expect order swapped
    await gotoSection(page, id, 'sample-results');
    await page.locator('button:has(svg)').filter({ hasText: '' }).nth(1).click().catch(() => {}); // down arrow (icon button)
    await sectionSave(page);
    sr = await getJson(request, `${TC}/tests/${id}/sample-results`);
    const firstLabelAfter = sr.components.sort((a: any, b: any) => a.displayOrder - b.displayOrder)[0].label;
    expect(firstLabelAfter, 'top component changed after reorder').not.toBe(firstLabelBefore);
  });

  // ---------- C. Sample & Results: dictionary result type + select-list options ----------
  test('TCC-D: dictionary result type with select-list options round-trips (value/sort/normal)', async ({ page, request }) => {
    const id = await createTest(page, `${STAMP} SelectList`, `${STAMP}_SEL`);
    await gotoSection(page, id, 'sample-results');
    await page.getByRole('button', { name: /add component/i }).first().click();
    await page.getByLabel('Component code', { exact: false }).first().fill('RESULT');
    await page.getByLabel('Component label', { exact: false }).first().fill('Interpretation');
    // guided result-type chooser (FR-28): click the "Single-select list (dictionary)" card
    await page.getByText(/Single-select list \(dictionary\)/i).click();
    // add two options via the dictionary typeahead
    const opt = page.getByPlaceholder(/search dictionary values/i);
    await opt.click(); await opt.fill('Positive');
    await page.getByRole('option', { name: /^Positive/i }).first().click();
    await opt.click(); await opt.fill('Negative');
    await page.getByRole('option', { name: /^Negative/i }).first().click();
    // mark the 2nd option (Negative) as Normal
    await page.locator('input[type=checkbox]:visible').nth(1).check({ force: true });
    await sectionSave(page);

    const sr = await getJson(request, `${TC}/tests/${id}/sample-results`);
    const comp = sr.components[0];
    expect(comp.resultType, 'dictionary result type').toBe('D');
    const opts = comp.options || [];
    expect(opts.length, 'two select-list options').toBe(2);
    expect(opts.every((o: any) => o.value && o.valueName), 'options carry dictionary value + name').toBeTruthy();
    expect(opts.map((o: any) => o.sortOrder).sort(), 'sort order persisted').toEqual([1, 2]);
    expect(opts.some((o: any) => o.normal === true), 'a Normal option persisted').toBeTruthy();
  });

  // ---------- C. Advanced result types: Multi-select options no-op guard (OGC-1123) ----------
  // The advanced/legacy chooser offers Multi-select (M), Cascading (C), Titer (T), Alpha (A).
  // Type selection round-trips (verified M and A persist). BUT for Multi-select, the select-list
  // options editor is a no-op — choosing a dictionary value adds no row (OGC-1123). Dictionary (D)
  // options DO persist (see TCC-D). This guard PASSES while the bug is present; flip when fixed.
  test('TCC-M: multi-select type persists but select-list options do NOT (FIXME OGC-1123)', async ({ page, request }) => {
    const id = await createTest(page, `${STAMP} MultiSel`, `${STAMP}_MSL`);
    await gotoSection(page, id, 'sample-results');
    await page.getByRole('button', { name: /add component/i }).first().click();
    await page.getByLabel('Component code', { exact: false }).first().fill('MS');
    await page.getByLabel('Component label', { exact: false }).first().fill('Organisms');
    await page.getByRole('button', { name: /advanced \/ legacy types/i }).click();
    await page.getByText(/^Multi-select list/).click();
    // attempt to add an option via the dictionary typeahead
    const opt = page.getByPlaceholder(/search dictionary values/i);
    await opt.click(); await opt.fill('Detected');
    await page.getByRole('option', { name: /^Detected/i }).first().click().catch(() => {});
    await sectionSave(page);

    const comp = (await getJson(request, `${TC}/tests/${id}/sample-results`)).components[0];
    console.log('TCCM_READBACK=' + JSON.stringify({ testId: id, resultType: comp.resultType, options: (comp.options || []).map((o: any) => o.valueName || o.value) }));
    expect(comp.resultType, 'multi-select type persists').toBe('M');
    // FIXME(OGC-1123): options do not persist for multi-select — stays empty. When fixed, this
    // becomes .toBeGreaterThan(0) and the assertion flips.
    expect((comp.options || []).length, 'multi-select options do not persist (bug present)').toBe(0);
  });

  // ---------- D. Ranges: Normal + Critical + VALID (new) + component association ----------
  test('TCD: Normal/Critical/Valid range round-trips with component association (FR-19)', async ({ page, request }) => {
    const id = await createTest(page, `${STAMP} Ranges`, `${STAMP}_RG`);
    // give it one component so range→component has a target
    await gotoSection(page, id, 'sample-results');
    await page.getByRole('button', { name: /add component/i }).first().click();
    await page.getByLabel('Component code', { exact: false }).first().fill('COMPX');
    await page.getByLabel('Component label', { exact: false }).first().fill('Component X');
    await sectionSave(page);
    const comp = (await getJson(request, `${TC}/tests/${id}/sample-results`)).components[0];

    await gotoSection(page, id, 'ranges');
    await page.getByText(/add range/i).first().click();
    // dialog: Result component select, then Normal/Critical/Valid low/high
    await page.locator('#range-component').selectOption({ label: 'Component X' }).catch(() => {});
    await page.getByLabel('Normal low', { exact: false }).fill('10');
    await page.getByLabel('Normal high', { exact: false }).fill('90');
    await page.getByLabel('Critical low', { exact: false }).fill('2');
    await page.getByLabel('Critical high', { exact: false }).fill('150');
    await page.getByLabel('Valid low', { exact: false }).fill('1');       // NEW in this version
    await page.getByLabel('Valid high', { exact: false }).fill('200');
    await page.getByRole('button', { name: /^Save$/ }).last().click();    // dialog Save
    await sectionSave(page);

    const { ranges } = await getJson(request, `${TC}/tests/${id}/ranges`);
    expect(ranges.length).toBeGreaterThan(0);
    const r = ranges[0];
    expect(r.lowNormal).toBe(10); expect(r.highNormal).toBe(90);
    expect(r.lowCritical).toBe(2); expect(r.highCritical).toBe(150);
    expect(r.lowValid, 'Valid range persisted (new in v3.2.1.10 redeploy)').toBe(1);
    expect(r.highValid).toBe(200);
    expect(r.componentId, 'range bound to the chosen component (FR-19)').toBe(comp.id);
  });

  // ---------- F. Panels: add/remove round-trip + create-new guard ----------
  test('TCF-02: add-to-existing-panel and remove-membership round-trip', async ({ page, request }) => {
    const id = await createTest(page, `${STAMP} Panels`, `${STAMP}_PN`);
    await gotoSection(page, id, 'panels');
    // add to an existing panel via the "Add to panel" combobox
    await pickCombo(page, 'Add to panel', 'Bilan Biochimique');
    await sectionSave(page);
    let panels = await getJson(request, `${TC}/tests/${id}/panels`);
    expect(panels.memberships.map((m: any) => m.panelName)).toContain('Bilan Biochimique');

    // remove membership (trash icon), save
    await page.getByRole('button', { name: /remove|delete/i }).last().click().catch(() => {});
    await sectionSave(page);
    panels = await getJson(request, `${TC}/tests/${id}/panels`);
    expect(panels.memberships.length, 'membership removed').toBe(0);
  });

  test('TCF-02b: inline "Create new panel" is a no-op (FIXME OGC-1122)', async ({ page, request }) => {
    const id = await createTest(page, `${STAMP} PanelNew`, `${STAMP}_PNW`);
    await gotoSection(page, id, 'panels');
    await page.getByLabel('Create new panel', { exact: false }).fill(`${STAMP} NewPanel`);
    await page.getByRole('button', { name: /create new panel/i }).click();
    await sectionSave(page);
    const panels = await getJson(request, `${TC}/tests/${id}/panels`);
    // FIXME(OGC-1122): create-new-panel currently does nothing — memberships stays empty.
    // When fixed, this becomes .toBe(1) and the assertion flips — update the test.
    expect(panels.memberships.length, 'create-new-panel no-op (bug present)').toBe(0);
  });

  // ---------- F. Methods / Labels / Alerts persist (API read-back) ----------
  // These three sections read from THREE different namespaces (verified 2026-07-08):
  //   Methods -> GET /rest/test/{id}/methods            (array of {methodId,methodName,isDefault,effectiveDate})
  //   Labels  -> GET /rest/api/tests/{id}/labelConfig   ({allowOrderEntryOverride, links:[...presets]})
  //   Alerts  -> GET /rest/test-catalog/{id}/alerts     (array of {name,enabled,triggerType,notifyEmail,...})  -- note: NO /tests/ segment
  test('TCF-03 Methods: Link Method persists', async ({ page, request }) => {
    const id = await createTest(page, `${STAMP} Methods`, `${STAMP}_MET`);
    await gotoSection(page, id, 'methods');
    await page.getByRole('button', { name: /link method/i }).first().click();
    await page.locator('#link-method-select').first().click();   // label matches 2 elements; target the combobox by id
    await page.getByRole('option', { name: /^EIA$/i }).first().click();
    await page.getByLabel('Effective Date', { exact: false }).fill('2026-07-08');
    await page.getByRole('button', { name: /link method/i }).last().click();
    await page.waitForTimeout(1200);
    const methods = await getJson(request, `${REST}/test/${id}/methods`);
    expect(Array.isArray(methods)).toBeTruthy();
    expect(methods.some((m: any) => /EIA/i.test(m.methodName || '')), 'EIA method linked').toBeTruthy();
  });

  test('TCF-04 Labels: preset + override toggle persist', async ({ page, request }) => {
    const id = await createTest(page, `${STAMP} Labels`, `${STAMP}_LAB`);
    await gotoSection(page, id, 'labels');
    await pickCombo(page, 'Add Label Type', 'Specimen Label');
    await page.waitForTimeout(1200);
    const cfg = await getJson(request, `${REST}/api/tests/${id}/labelConfig`);
    const links = cfg.links || [];
    expect(JSON.stringify(links)).toMatch(/Specimen/i);          // preset present
    expect(cfg.allowOrderEntryOverride).toBe(true);              // override default on
  });

  test('TCF-05 Alerts: rule with Critical trigger persists', async ({ page, request }) => {
    const id = await createTest(page, `${STAMP} Alerts`, `${STAMP}_ALR`);
    await gotoSection(page, id, 'alerts');
    await page.getByRole('button', { name: /add rule/i }).click();
    await page.getByLabel('Rule Name', { exact: false }).fill(`${STAMP} CritAlert`);
    await page.getByRole('radio', { name: /^Critical$/ }).check();
    await page.getByRole('checkbox', { name: /Email/i }).check();
    await page.getByRole('button', { name: /^Save$/ }).last().click();
    await page.waitForTimeout(1200);
    const alerts = await getJson(request, `${TC}/${id}/alerts`);   // NB: /test-catalog/{id}/alerts (no /tests/)
    const rule = (alerts || []).find((a: any) => a.name === `${STAMP} CritAlert`);
    expect(rule, 'alert rule persisted').toBeTruthy();
    expect(rule.triggerType, 'Critical trigger').toMatch(/critical/i);
    expect(rule.notifyEmail, 'Email channel').toBe(true);
  });

  // ---------- G / bug guards (API — deterministic) ----------
  test('OGC-1116: created + activated test becomes orderable in /rest/test-list', async ({ page, request }) => {
    const id = await createTest(page, `${STAMP} Orderable`, `${STAMP}_ORD`);
    const actStatus = await apiWrite(page, 'POST', `${TC}/tests/${id}/activate`);  // CSRF-authenticated
    console.log('OGC1116_ACTIVATE_STATUS=' + actStatus);
    await page.waitForTimeout(1500); // allow index refresh (orderability was reindex-dependent)
    const list = await getJson(request, `${REST}/test-list`);
    const present = (list || []).some((t: any) => String(t.id) === id);
    // NOTE: was BLOCKER-3 (absent); now surfaces post-index. If this flakes, the index lag is real.
    expect(present, 'activated test present in orderable list').toBe(true);
  });

  test('OGC-1115: deactivate remains non-functional (FIXME when fixed)', async ({ page }) => {
    // CSRF-authenticated writes (the bare request fixture 403s without the token → false 404/403).
    const deact = await apiWrite(page, 'POST', `${TC}/tests/380/deactivate`);
    const del = await apiWrite(page, 'DELETE', `${TC}/tests/380/activate`);
    console.log('OGC1115_STATUS deact=' + deact + ' del=' + del);
    // Flip-when-fixed: while the bug is present the deactivate path does NOT succeed (4xx: 404 no
    // route / 405 wrong verb / 403 rejected). When a working deactivate ships it returns 2xx and
    // this assertion flips → close OGC-1115.
    expect(deact, 'deactivate should not succeed while bug present').toBeGreaterThanOrEqual(400);
    expect(del, 'DELETE-activate should not succeed while bug present').toBeGreaterThanOrEqual(400);
  });

  test('OGC-1120: sample-type-tests 500 without param, 200 with param (robustness guard)', async ({ request }) => {
    const noParam = await request.get(`${REST}/sample-type-tests`, { headers: { Accept: 'application/json' } });
    const withParam = await request.get(`${REST}/sample-type-tests?sampleType=${SERUM}`, { headers: { Accept: 'application/json' } });
    expect(noParam.status(), 'param-less currently 500 (bug present)').toBe(500);
    expect(withParam.status()).toBe(200);
  });

  test('OGC-1114: top-toolbar Save does not persist Basic Info edits (FIXME when fixed)', async ({ page, request }) => {
    const id = await createTest(page, `${STAMP} TopSave`, `${STAMP}_TS`);
    const before = (await getJson(request, `${TC}/tests/${id}/basic-info`)).description || '';
    await gotoSection(page, id, 'basic-info');
    const desc = page.getByLabel('Description', { exact: false }).first();
    await desc.click(); await desc.fill('EDITED-via-top-save');
    await page.getByRole('button', { name: /^Save$/ }).first().click();   // TOP toolbar Save
    await page.waitForTimeout(1500);
    const after = (await getJson(request, `${TC}/tests/${id}/basic-info`)).description || '';
    expect(after, 'top Save persists nothing (bug present)').toBe(before);
  });
});
