// Reusable helpers for driving OpenELIS order-entry wizards in the docs-capture harness.
// Encodes the patterns verified live (June 2026) so seeded order flows run headlessly:
//  - Lab Number must be a generated accession (typed values are rejected server-side).
//  - The Sampling Site is an autocomplete: type, then click the result's "Select".
//  - Carbon checkboxes do NOT update React state via a native-setter; click the VISIBLE LABEL
//    (clicking the hidden <input> hangs ~60s). Label click fires onChange correctly.
import { Page, expect } from '@playwright/test';

/** Click "Generate Lab Number" via an in-page DOM click (a Playwright role-click doesn't fire it). */
export async function generateLabNumber(page: Page): Promise<string> {
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => {
      const el = [...document.querySelectorAll('a,button,span,div')]
        .find(e => /^generate lab number$/i.test((e.textContent || '').trim()));
      if (el) (el as HTMLElement).click();
    });
    await page.waitForTimeout(1500);
    const v = await page.evaluate(() => {
      const i = document.querySelector('input[placeholder*="generate lab number" i]') as HTMLInputElement | null;
      return i ? i.value : '';
    });
    if (v) return v;
  }
  return '';
}

/** Type into the Sampling Site search and commit the first result via its "Select" button. */
export async function selectSite(page: Page, query = 'MUL'): Promise<boolean> {
  try {
    const site = page.getByPlaceholder(/site name or code/i).first();
    await site.click({ timeout: 2500 });
    await site.fill(query, { timeout: 2500 });
    await page.waitForTimeout(1300);
    const sel = page.locator('.search-results').getByRole('button', { name: /select/i }).first();
    if (await sel.isVisible({ timeout: 1500 })) { await sel.click({ timeout: 1500 }); }
    else {
      const t = page.locator('.search-results').getByText(/^Select$/).first();
      if (await t.isVisible({ timeout: 1000 })) await t.click({ timeout: 1000 });
    }
    await page.waitForTimeout(700);
    // confirm a "Selected" chip appeared
    return await page.getByText(/selected/i).first().isVisible({ timeout: 1500 }).catch(() => false);
  } catch { return false; }
}

/**
 * Sampling Site for Environmental/Vector orders. The field is a typeahead ("Search by site name
 * or code"); a match shows a result to Select, and if nothing matches it offers "+ Add new site".
 * Verified live on indonesiademo (v3.2.1.10): env/vector sites are often unseeded, so add-new is
 * the reliable path. Returns true when either an existing site is selected or a new one is staged.
 */
export async function selectOrAddSite(page: Page, query = 'QA_AUTO Site'): Promise<boolean> {
  // Sampling Site is a typeahead needing a few chars + time to resolve. Either an existing match
  // ("Select") or an "Add new site" affordance appears; confirm the resulting "Selected"/"New"
  // chip so a silent miss (which would gate Save & Next) is caught rather than passing quietly.
  let outcome = 'none';
  try {
    const site = page.getByPlaceholder(/site name or code/i).first();
    await site.click({ timeout: 3000 });
    await site.fill('', { timeout: 2000 }).catch(() => {});
    await site.type(query, { delay: 40 });           // per-char typing so the typeahead fires
    await page.waitForTimeout(1800);                 // allow the async site lookup to settle
    const sel = page.getByRole('button', { name: /^select$/i }).first();
    const add = page.getByRole('button', { name: /add new site/i }).first();
    if (await sel.isVisible({ timeout: 2000 }).catch(() => false)) {
      await sel.click({ timeout: 2000 }); outcome = 'selected-existing';
    } else if (await add.isVisible({ timeout: 2000 }).catch(() => false)) {
      await add.click({ timeout: 2000 }); outcome = 'added-new';
    }
    await page.waitForTimeout(800);
    const chip = await page.getByText(/^(selected|new)$/i).first().isVisible({ timeout: 2500 }).catch(() => false);
    console.log('SITE_RESULT=' + outcome + ' chip=' + chip);
    return chip;
  } catch (e) {
    console.log('SITE_RESULT=error ' + String(e).slice(0, 80));
    return false;
  }
}

/** Set the required Environmental "Collection Method" (Composite 24h / Grab Sample / etc.). */
export async function setCollectionMethod(page: Page, optionRe: RegExp = /composite 24h|grab sample|composite 8h/i): Promise<string | null> {
  return await setSelectByOption(page, optionRe);
}

/** Set a native <select> whose options include optionRe to that option (React-safe). */
export async function setSelectByOption(page: Page, optionRe: RegExp): Promise<string | null> {
  return await page.evaluate((src) => {
    const re = new RegExp(src, 'i');
    const sel = [...document.querySelectorAll('select')].find(s => [...s.options].some(o => re.test(o.textContent || '')));
    if (!sel) return null;
    const opt = [...sel.options].find(o => re.test(o.textContent || ''));
    if (!opt) return null;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!;
    setter.call(sel, opt.value);
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return opt.textContent!.trim();
  }, optionRe.source);
}

/** Tick a Carbon checkbox by clicking its VISIBLE LABEL text (updates React state; no hang). */
export async function checkByLabel(page: Page, labelRe: RegExp): Promise<boolean> {
  // Carbon renders <input class="cds--checkbox" id=x> + <label for=x>text</label>.
  const label = page.locator('label').filter({ hasText: labelRe }).first();
  try {
    if (await label.isVisible({ timeout: 1500 })) { await label.click({ timeout: 2000 }); await page.waitForTimeout(250); return true; }
  } catch {}
  // Fallback: getByText on the label text
  try {
    const t = page.getByText(labelRe).first();
    if (await t.isVisible({ timeout: 1000 })) { await t.click({ timeout: 1500 }); await page.waitForTimeout(250); return true; }
  } catch {}
  return false;
}

/** Tick every QA-checklist item by clicking each label, then return how many are checked. */
export async function completeQaChecklist(page: Page): Promise<void> {
  const items = [/sampling site information is correct/i, /sample types and tests are correct/i, /labels have been printed/i, /storage locations have been assigned/i];
  for (const re of items) await checkByLabel(page, re);
  await page.waitForTimeout(400);
}

/** Click a button by accessible name and wait. */
export async function clickButton(page: Page, nameRe: RegExp, waitMs = 1800): Promise<boolean> {
  try {
    const b = page.getByRole('button', { name: nameRe }).first();
    if (await b.isVisible({ timeout: 2500 })) { await b.click({ timeout: 2500 }); await page.waitForTimeout(waitMs); return true; }
  } catch {}
  return false;
}

// --- ENVIRONMENTAL-specific helpers ---
// Env order entry differs from Vector: Applicable Compliance Standards is a Carbon combobox,
// Tests & Panels is a per-row toggle button, and Sample Type options include DUPLICATES where
// one copy has NO tests (OGC-1063). Verified live (indonesiademo v3.2.1.10) the env Sample Type
// options are: Water, Hemodialysis Water, Sanitation Hygiene Water, Swimming Pool Water. "Water"
// carries English-named tests (pH, Lead, ...). Default to it; avoid any option that shows no tests.

/**
 * DEPRECATED for new specs: name-pinned and therefore instance-specific. It fails SOFT (the
 * option is simply never selected), which reads downstream as a wizard defect rather than a
 * data mismatch. Prefer selectSampleTypeAgnostic(). Kept for callers that target indonesiademo.
 * Set the per-sample-manifest Sample Type to an option that actually carries tests.
 */
export async function selectEnvSampleType(page: Page, optionRe: RegExp = /^\s*Water\s*$/i): Promise<string | null> {
  return await setSelectByOption(page, optionRe);
}

/**
 * DEPRECATED for new specs: prefer pickTestAgnostic(), which reads the real test names for the
 * chosen sample type from the API instead of assuming an English/Indonesian label.
 * Open the per-row "Tests & Panels" toggle, then tick a test by its label. Returns the test name.
 */
export async function pickEnvTest(page: Page, testRe: RegExp = /^pH$/): Promise<string> {
  await clickButton(page, /tests\s*&\s*panels/i, 900);
  // If a specific test regex isn't found, fall back to the first non-"lab performed sampling" test.
  const ok = await checkByLabel(page, testRe);
  if (ok) return testRe.source;
  const label: string = await page.evaluate(() => {
    const cbs = [...document.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[];
    for (const cb of cbs) { const id = cb.id; const lbl = (id && document.querySelector(`label[for="${id}"]`)) || cb.closest('label'); const t = (lbl?.textContent || '').trim(); if (t && !/lab performed sampling|skip/i.test(t)) return t; }
    return '';
  });
  if (label) { const esc = label.slice(0, 24).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); await checkByLabel(page, new RegExp(esc, 'i')); }
  return label;
}

// --- CLINICAL-specific helper ---
/** Create a New Patient inline on the clinical order form (self-contained demo patient). */
export async function newPatient(page: Page, opts: { last?: string; first?: string; dob?: string; gender?: RegExp; nationalId?: string } = {}): Promise<void> {
  const last = opts.last || 'Parker', first = opts.first || 'Peter', dob = opts.dob || '15/05/1990', gender = opts.gender || /^male$/i;
  const natId = opts.nationalId || ('NID-' + last.toUpperCase() + '-' + (dob.split('/').pop() || '1990'));
  await clickButton(page, /^new patient$/i, 800);
  // National ID is a REQUIRED patient identifier on clinical orders — without it the wizard
  // silently refuses to advance past Enter Order (no inline error). Fill it (and the optional
  // Unique Health ID) so seeded clinical orders can progress.
  for (const [re, val] of [[/nationality identifier/i, natId], [/unique health identifier/i, natId.replace('NID', 'UHID')], [/last name/i, last], [/first name/i, first]] as [RegExp, string][]) {
    try { const f = page.getByPlaceholder(re).first(); if (await f.isVisible({ timeout: 1500 })) await f.fill(val, { timeout: 1500 }); } catch {}
  }
  try { const d = page.getByPlaceholder(/dd\/mm\/yyyy/i).first(); if (await d.isVisible({ timeout: 1500 })) await d.fill(dob, { timeout: 1500 }); } catch {}
  // Gender radio — click its visible label.
  await checkByLabel(page, gender).catch(() => {});
}

/** Best-effort select of an Applicable Compliance Standard (Carbon combobox). Optional on save. */
export async function selectComplianceStandard(page: Page, optionRe: RegExp): Promise<boolean> {
  try {
    await page.evaluate(() => {
      const hdr = [...document.querySelectorAll('*')].find(e => /applicable compliance standards/i.test(e.textContent || '') && e.children.length < 8);
      const box = (hdr?.closest('div') || document).querySelector('[role="combobox"], .cds--list-box__field, .cds--combo-box input, input[placeholder*="standard" i]') as HTMLElement | null;
      if (box) box.click();
    });
    await page.waitForTimeout(700);
    const opt = page.locator('[role="option"]').filter({ hasText: optionRe }).first();
    if (await opt.isVisible({ timeout: 1500 })) { await opt.click({ timeout: 1500 }); await page.waitForTimeout(400); return true; }
  } catch {}
  return false;
}

/**
 * Attach a response listener that records every non-GET write to the app's REST layer.
 * Returns the live array (mutated as responses arrive). Gold-standard oracle: a driven click
 * "worked" only if it produced a persisted write — and logging every write URL reveals which
 * endpoint a given (possibly domain-split) wizard actually saves through.
 */
export type WriteRec = { url: string; method: string; status: number; body?: string };
export function trackWrites(page: Page): WriteRec[] {
  const writes: WriteRec[] = [];
  page.on('response', (r) => {
    const m = r.request().method();
    if (m !== 'GET' && m !== 'HEAD' && m !== 'OPTIONS' && /\/rest\//.test(r.url())) {
      const rec: WriteRec = { url: r.url().replace(/^https?:\/\/[^/]+/, ''), method: m, status: r.status() };
      // request payload is synchronous & reliable; grab it for save-ish endpoints to diagnose 4xx.
      const rq = r.request().postData();
      if (rq && /(SamplePatientEntry|sample-type-requests|sample-item)/i.test(rec.url)) rec.body = rq.replace(/\s+/g, ' ').slice(0, 1500);
      writes.push(rec);
    }
  });
  return writes;
}

/** Assert a driven Save actually persisted: at least one 2xx write to a save-ish endpoint. */
export function assertOrderPersisted(writes: WriteRec[], label = 'order'): void {
  const saveish = writes.filter(w =>
    /(SamplePatientEntry|sample-type-requests|sample-item|sampleItem|analysis|\border\b|patient)/i.test(w.url));
  const ok = saveish.some(w => w.status >= 200 && w.status < 300);
  expect(ok, label + ': a driven Save must produce a 2xx REST write (gold standard = clicks with an asserted effect). Writes seen: ' + JSON.stringify(writes)).toBeTruthy();
}

/**
 * Env & Vector orders REQUIRE at least one of Requesting Organization or Requestor
 * (backend: errors.requester.org.or.requestor.required — OGC-1074). Fill a Requestor so the
 * order can actually save; without this SamplePatientEntry 400s (and, alongside it, spurious
 * patientProperties.gender/nationalId messages appear that clear once the requester is present).
 */
export async function fillRequestor(page: Page, first = 'QA', last = 'Tester'): Promise<boolean> {
  const tryFill = async (re: RegExp, val: string) => {
    const byRole = page.getByRole('textbox', { name: re }).first();
    if (await byRole.isVisible({ timeout: 1500 }).catch(() => false)) { await byRole.fill(val); return true; }
    const byLabel = page.getByLabel(re).first();
    if (await byLabel.isVisible({ timeout: 800 }).catch(() => false)) { await byLabel.fill(val); return true; }
    return false;
  };
  const f = await tryFill(/^first name$/i, first);
  const l = await tryFill(/^last name$/i, last);
  console.log('REQUESTOR_FILLED first=' + f + ' last=' + l);
  await page.waitForTimeout(400);
  return f || l;
}

/**
 * MANDATORY for every order. The Requester (Site + Provider) is REQUIRED for the sample+tests to
 * persist. On the unified clinical wizard (testing v3.2.1.11+) omitting it does NOT error — the
 * Enter-Order Save returns 200 but SILENTLY DROPS the whole sample (order.samples: []), so the
 * order reaches Collect showing "No tests have been ordered" and is never resultable. That silent
 * drop caused a false-positive "multi-component is broken" bug report (see reference below); a real
 * COVID-19 PCR order placed WITH a Requester is fully resultable. So: ALWAYS call this before
 * Save & Next, and gate the run with assertSamplePersisted() afterwards.
 *
 * Flow (matches the live UI): Site Search -> type -> click the result's Select; Provider Search ->
 * type -> click the result's Select. Falls back to the free-text Requestor (env/vector, OGC-1074)
 * when the search UI isn't present. Site/Provider autocompletes require EXISTING records — free
 * text alone shows "No suggestions" and does NOT satisfy the requirement.
 */
export async function fillRequester(
  page: Page,
  opts: { site?: string; provider?: string; first?: string; last?: string } = {},
): Promise<boolean> {
  const site = opts.site ?? 'MUL';           // "Mulago" on testing; matches selectSite default
  const provider = opts.provider ?? 'Sarah'; // seeded provider on testing

  // Search a section, WAIT for the result row to render, click its Select, and VERIFY the pick
  // committed (a "Selected" chip appears / the row's Select flips to Selected). Headless Playwright
  // is faster than the live UI, so without waiting for results + confirming the commit, Save & Next
  // fires before React binds the requester and the sample is silently dropped. Retries once.
  const searchAndSelect = async (
    inputSel: string, which: 'first' | 'last', query: string,
  ): Promise<boolean> => {
    const input = page.locator(inputSel).first();
    if (!(await input.isVisible({ timeout: 1500 }).catch(() => false))) return false;
    for (let attempt = 0; attempt < 2; attempt++) {
      await input.click().catch(() => {});
      await input.fill('').catch(() => {});
      await input.fill(query).catch(() => {});
      const searchBtn = page.getByRole('button', { name: /^search$/i })[which]();
      await searchBtn.click({ timeout: 2500 }).catch(() => {});
      // WAIT for a matching result row to actually render (not a blind timeout).
      const row = page.getByRole('row', { name: new RegExp(query, 'i') }).first();
      const sel = row.getByRole('button', { name: /^select$/i }).first();
      const seen = await sel.isVisible({ timeout: 4000 }).catch(() => false);
      if (!seen) { await page.waitForTimeout(600); continue; }
      await sel.click().catch(() => {});
      // Confirm the selection committed: a "Selected" chip appears. Report HONESTLY — do not
      // pretend success if the chip never shows (a false "committed" is what let the empty-sample
      // slip through before). The real gate is assertSamplePersisted() downstream.
      const committed = await page.getByText(/^\s*selected\s*$/i).first().isVisible({ timeout: 3000 }).catch(() => false)
        || await row.getByText(/selected/i).first().isVisible({ timeout: 1500 }).catch(() => false);
      await page.waitForTimeout(700);
      if (committed) return true;
    }
    return false; // clicked but never confirmed — caller/assertSamplePersisted will surface the empty order
  };

  const siteOk = await searchAndSelect('#siteName, input[placeholder*="site name" i]', 'first', site);
  const provOk = await searchAndSelect('#providerName, input[placeholder*="provider name" i]', 'last', provider);

  // --- Fallback: free-text Requestor (env/vector allow it) ---
  if (!siteOk && !provOk) {
    const legacy = await fillRequestor(page, opts.first ?? 'QA', opts.last ?? 'Tester').catch(() => false);
    console.log('REQUESTER_FILLED via=freetext ok=' + legacy);
    await page.waitForTimeout(600);
    return legacy;
  }
  console.log('REQUESTER_FILLED site=' + siteOk + ' provider=' + provOk);
  // Let React fully commit the requester into form state before the caller clicks Save & Next.
  await page.waitForTimeout(1200);
  return siteOk && provOk;
}

/**
 * FALSE-POSITIVE GUARD. After placing + saving an order, confirm the SAMPLE actually persisted —
 * i.e. the order record carries the sample and its tests. A 200 from SamplePatientEntry is NOT
 * enough: without a Requester the save returns 200 with order.samples: [] and the order is silently
 * empty. This is the check that distinguishes an unresultable-order PRODUCT bug from an operator
 * error (missing Requester). Prefer this over assertOrderPersisted for order->result chains.
 */
export async function assertSamplePersisted(page: Page, labNumber: string, restBase?: string): Promise<void> {
  const base = restBase || (process.env.BASE || 'https://testing.openelis-global.org') + '/api/OpenELIS-Global/rest';
  const order = await page.request
    .get(`${base}/order/search?labNumber=${encodeURIComponent(labNumber)}`, { headers: { Accept: 'application/json' } })
    .then((r) => r.json()).catch(() => ({} as any));
  const samples: any[] = order.samples || [];
  const testCount = samples.reduce((n, s) => n + ((s.tests || []).length || 0), 0);
  console.log('SAMPLE_PERSISTED lab=' + labNumber + ' samples=' + samples.length + ' tests=' + testCount);
  expect(samples.length,
    `${labNumber}: order.samples is EMPTY after save — the sample was silently dropped. ` +
    `Almost always a MISSING REQUESTER (Site + Provider), NOT a product bug. Call fillRequester() before Save & Next. ` +
    `Do NOT file a bug on this without first confirming the Requester was set.`).toBeGreaterThan(0);
  expect(testCount, `${labNumber}: sample persisted but carries no tests`).toBeGreaterThan(0);
}


// =============================================================================
// LOCATION / LOCALE AGNOSTIC PICKERS
//
// The env + vector order specs were lifted from the indonesiademo branch, so they
// pinned option text that only exists on that instance: sample type "Water" and
// "adult mosquito", container "1L HDPE bottle", test "Identifikasi Spesies Nyamuk"
// (Indonesian). On any other instance those regexes match nothing — and the failure
// is SOFT: the option is never selected, the order saves nothing, and the spec then
// reports a product defect that is really a data mismatch. That is exactly how this
// run first misread env/vector order entry as broken.
//
// These helpers choose by STRUCTURE instead of by name: ask the instance which
// sample types its wizard offers, ask which of those actually carry orderable tests,
// then drive the <select> to one of those. A caller may still pass a `prefer` hint,
// but it degrades to "any workable option" rather than to nothing.
// =============================================================================

/** Domain-scoped sample types the NEW order wizards populate their dropdown from. */
export type OrderDomain = 'environmental' | 'vector';

export interface PickedSampleType {
  id: string;
  label: string;
  testCount: number;
  viaPreference: boolean;
}

/** How many orderable tests a sample type carries (0 = selecting it yields an unsavable order). */
export async function testCountForSampleType(page: Page, sampleTypeId: string | number): Promise<number> {
  return await page.evaluate(async (id) => {
    try {
      const r = await fetch('/api/OpenELIS-Global/rest/sample-type-tests?sampleType=' + id, { headers: { Accept: 'application/json' } });
      if (!r.ok) return 0;
      const j = await r.json();
      return ((j && j.tests) || []).length;
    } catch (e) { return 0; }
  }, String(sampleTypeId));
}

/** The sample types the given domain wizard offers, newest-API-first with a catalog fallback. */
export async function domainSampleTypes(page: Page, domain: OrderDomain): Promise<Array<{ id: string; label: string }>> {
  return await page.evaluate(async (d) => {
    const norm = (arr: any[]) => arr
      .map((x: any) => ({ id: String(x.id != null ? x.id : x.value), label: String(x.value != null && isNaN(Number(x.value)) ? x.value : (x.name || x.label || x.displayValue || '')).trim() }))
      .filter((x) => x.id && x.id !== 'undefined');
    const get = async (u: string) => {
      try {
        const r = await fetch('/api/OpenELIS-Global/rest' + u, { headers: { Accept: 'application/json' } });
        if (!r.ok) return null;
        return await r.json();
      } catch (e) { return null; }
    };
    const wizard = await get('/' + d + '-sample-types');
    if (Array.isArray(wizard) && wizard.length) return norm(wizard);
    const all = await get('/test-catalog/sample-types');
    if (Array.isArray(all)) return norm(all.filter((s: any) => String(s.domain || '').toUpperCase() === (d === 'vector' ? 'VECTOR' : 'ENVIRONMENTAL')));
    return [];
  }, domain);
}

/**
 * Select a sample type that ACTUALLY carries tests on this instance.
 * `prefer` is a hint only: it wins if it matches an option with tests, otherwise the
 * first option with tests is used. Returns null (never throws) when the instance has
 * no workable sample type for the domain — the caller can then report a data gap
 * rather than a broken wizard.
 */
export async function selectSampleTypeAgnostic(
  page: Page,
  domain: OrderDomain,
  opts: { prefer?: RegExp; selectId?: string } = {},
): Promise<PickedSampleType | null> {
  const offered = await domainSampleTypes(page, domain);
  const scored: Array<{ id: string; label: string; testCount: number }> = [];
  for (const st of offered) scored.push({ ...st, testCount: await testCountForSampleType(page, st.id) });
  const workable = scored.filter((s) => s.testCount > 0);
  console.log('[agnostic] ' + domain + ' sample types: ' + scored.map((s) => s.label + '(' + s.id + ')=' + s.testCount).join(', '));
  if (!workable.length) return null;

  const preferred = opts.prefer ? workable.find((s) => opts.prefer!.test(s.label)) : undefined;
  const chosen = preferred || workable[0];

  const applied = await page.evaluate((args) => {
    const wanted = args.id, label = args.label.toLowerCase();
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!;
    const selects = [...document.querySelectorAll('select')] as HTMLSelectElement[];
    const byId = args.selectId ? (document.querySelector('#' + args.selectId) as HTMLSelectElement | null) : null;
    const ordered = byId ? [byId, ...selects.filter((s) => s !== byId)] : selects;
    for (const sel of ordered) {
      const opt = [...sel.options].find((o) => String(o.value) === wanted)
        || [...sel.options].find((o) => (o.textContent || '').trim().toLowerCase() === label);
      if (!opt) continue;
      setter.call(sel, opt.value);
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      return (opt.textContent || '').trim();
    }
    return null;
  }, { id: chosen.id, label: chosen.label, selectId: opts.selectId || '' });

  if (!applied) {
    console.log('[agnostic] no <select> on the page offers sample type ' + chosen.id + ' (' + chosen.label + ')');
    return null;
  }
  await page.waitForTimeout(900);
  return { id: chosen.id, label: applied, testCount: chosen.testCount, viaPreference: !!preferred };
}

/**
 * Tick a test that the API says belongs to this sample type, by its real name on THIS
 * instance (so an Indonesian catalog and an English one both work). `prefer` is a hint.
 * Returns the label actually ticked, or '' if none could be.
 */
export async function pickTestAgnostic(page: Page, sampleTypeId: string | number, prefer?: RegExp): Promise<string> {
  await clickButton(page, /tests\s*&\s*panels/i, 900).catch(() => false);
  const names: string[] = await page.evaluate(async (id) => {
    try {
      const r = await fetch('/api/OpenELIS-Global/rest/sample-type-tests?sampleType=' + id, { headers: { Accept: 'application/json' } });
      if (!r.ok) return [];
      const j = await r.json();
      return ((j && j.tests) || []).map((t: any) => String(t.name || t.value || '').trim()).filter(Boolean);
    } catch (e) { return []; }
  }, String(sampleTypeId));
  if (!names.length) { console.log('[agnostic] sample type ' + sampleTypeId + ' reports no tests'); return ''; }

  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const order = prefer ? [...names.filter((n) => prefer.test(n)), ...names.filter((n) => !prefer.test(n))] : names;
  for (const n of order.slice(0, 12)) {
    const ok = await checkByLabel(page, new RegExp('^\\s*' + esc(n) + '\\s*$', 'i'));
    if (ok) { console.log('[agnostic] ticked test ' + n); return n; }
  }
  console.log('[agnostic] none of ' + order.length + ' API-listed tests had a clickable label');
  return '';
}

/**
 * Set a <select> to its first real option. Used for dictionary-backed fields (container,
 * collection method, trap type) whose vocabularies are instance-specific and sometimes
 * EMPTY — returns null instead of throwing so an unseeded optional dictionary does not
 * masquerade as a wizard defect.
 */
export async function setSelectFirstAvailable(page: Page, match: RegExp | string): Promise<string | null> {
  const res = await page.evaluate((args) => {
    const idRe = args.isId ? null : new RegExp(args.match, 'i');
    const selects = [...document.querySelectorAll('select')] as HTMLSelectElement[];
    const pool = args.isId
      ? [document.querySelector('#' + args.match) as HTMLSelectElement].filter(Boolean)
      : selects.filter((s) => idRe!.test(s.id) || idRe!.test(s.getAttribute('name') || '') || idRe!.test((s.closest('div')?.textContent || '').slice(0, 120)));
    for (const sel of pool) {
      const opt = [...sel.options].find((o) => {
        const t = (o.textContent || '').trim();
        return o.value && o.value !== '0' && t && !/^(select|choose|--|pilih)/i.test(t);
      });
      if (!opt) continue;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!;
      setter.call(sel, opt.value);
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      return (opt.textContent || '').trim();
    }
    return null;
  }, { match: typeof match === 'string' ? match : match.source, isId: typeof match === 'string' });
  await page.waitForTimeout(300);
  return res;
}

/**
 * Set every <select> still sitting on a placeholder to its first real option, skipping any
 * whose id matches `skip`. Locale-free way to satisfy the instance-specific required
 * dropdowns on the env/vector manifest rows (container, collection method, trap type,
 * preservation) without pinning vocabulary that differs per deployment. Returns what it set.
 */
export async function fillUnsetSelects(page: Page, skip: RegExp = /^sampleType/i): Promise<string[]> {
  const out: string[] = await page.evaluate((skipSrc) => {
    const skipRe = new RegExp(skipSrc, 'i');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!;
    const done: string[] = [];
    for (const sel of [...document.querySelectorAll('select')] as HTMLSelectElement[]) {
      if (sel.disabled || (sel.id && skipRe.test(sel.id))) continue;
      const cur = (sel.selectedOptions[0]?.textContent || '').trim();
      const placeholder = !sel.value || sel.value === '0' || /^(select|choose|--|pilih)/i.test(cur) || cur === '';
      if (!placeholder) continue;
      const opt = [...sel.options].find((o) => {
        const t = (o.textContent || '').trim();
        return o.value && o.value !== '0' && t && !/^(select|choose|--|pilih)/i.test(t);
      });
      if (!opt) continue;
      setter.call(sel, opt.value);
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      done.push((sel.id || sel.getAttribute('name') || 'select') + '=' + (opt.textContent || '').trim());
    }
    return done;
  }, skip.source);
  if (out.length) await page.waitForTimeout(400);
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════════
 * ORDER-FORM COMMIT RULES  (harness backlog #9)
 *
 * Lifted out of coded-result-chain.docs.spec.ts, where they were first worked
 * out against testing 3.2.2.0. They lived there because nothing else knew them,
 * so every new chain spec had to rediscover them. They live here now and that
 * spec imports them.
 *
 * THE THREE RULES, none of which are guessable from the DOM:
 *
 *   1. Save & Next carries `cds--btn--disabled` and fires NO request until the
 *      sampling site is COMMITTED via its result row's "Select", and at least one
 *      of Requesting Organization or Requestor is committed too. There is no
 *      inline error explaining why it is dead.
 *
 *   2. The commit affordance depends on whether the record already exists. First
 *      use offers `+ Add new organization "…"`; afterwards ONLY the row's
 *      "Select" works. Handle both, or the spec passes once and fails on every
 *      later run.
 *
 *   3. "N/M steps" is a completion counter, not a wizard position. Read the
 *      button's disabled state, never the step text.
 *
 * Note this is the `/SamplePatientEntry` **Save & Next** form (ids `labNumber`,
 * `siteName`, `providerName`, `sampleType-0`). OpenELIS also ships a second
 * clinical order form driven by Next/Submit (ids `labNo`, `sampleId_0`,
 * `requesterFirstName`, with a "Generate" anchor). These helpers are for the
 * first; do not mix the id sets.
 * ═════════════════════════════════════════════════════════════════════════════ */

/** Set a form control by id through React's native setter. Plain inputs and selects only. */
export async function setById(page: Page, id: string, value: string): Promise<boolean> {
  return await page.evaluate((args) => {
    const el = document.getElementById(args.id) as HTMLInputElement | HTMLSelectElement | null;
    if (!el) return false;
    const proto = el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, args.value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, { id, value });
}

/** Commit a typeahead result row: click the "Select" inside the row whose text matches. */
export async function commitRow(page: Page, re: RegExp): Promise<string | null> {
  return await page.evaluate((src) => {
    const rx = new RegExp(src);
    const t = (e: Element | null) => ((e && e.textContent) || '').trim();
    const rows = [...document.querySelectorAll('tr,li,div')]
      .filter((e) => rx.test(t(e)) && /select/i.test(t(e)) && t(e).length < 220)
      .sort((a, b) => t(a).length - t(b).length);
    for (const r of rows) {
      const b = [...r.querySelectorAll('button,a,span')].find((x) => /^select$/i.test(t(x)));
      if (b) { (b as HTMLElement).click(); return t(r).slice(0, 60); }
    }
    return null;
  }, re.source);
}

/** Click an "+ Add new …" affordance by text. Returns what it clicked, or null. */
export async function clickAddNew(page: Page, re: RegExp): Promise<string | null> {
  return await page.evaluate((src) => {
    const rx = new RegExp(src, 'i');
    const t = (e: Element | null) => ((e && e.textContent) || '').trim();
    const el = [...document.querySelectorAll('button,a,span,div')].find((e) => rx.test(t(e)) && e.children.length <= 1);
    if (el) { (el as HTMLElement).click(); return t(el).slice(0, 44); }
    return null;
  }, re.source);
}

/**
 * Click "Generate Lab Number" until the field actually carries one. The control
 * is an anchor, not a button, and the first click sometimes lands before the
 * handler is bound — hence the retry rather than a single click.
 */
export async function generateLabNumberOnForm(page: Page, attempts = 5): Promise<string> {
  let labNumber = '';
  for (let i = 0; i < attempts; i++) {
    await page.evaluate(() => {
      const el = [...document.querySelectorAll('a,button,span,div')]
        .find((e) => /^generate lab number$/i.test(((e.textContent) || '').trim()));
      if (el) (el as HTMLElement).click();
    });
    await page.waitForTimeout(1200);
    labNumber = await page.evaluate(() => (document.getElementById('labNumber') as HTMLInputElement | null)?.value || '');
    if (labNumber) break;
  }
  return labNumber;
}

/**
 * Rules 1 and 2: type the site and provider, then COMMIT them. Typing alone
 * leaves Save & Next dead. Returns what was committed so a caller can assert.
 */
export async function commitSiteAndRequester(
  page: Page,
  opts: { site?: string; provider?: string } = {},
): Promise<{ org: string | null; provider: string | null }> {
  const site = opts.site ?? 'QA_AUTO Requesting Org';
  const provider = opts.provider ?? 'Stark';
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  await setById(page, 'siteName', site);
  await setById(page, 'providerName', provider);
  await page.waitForTimeout(2200);

  const org = (await commitRow(page, new RegExp(esc(site))))
    || (await clickAddNew(page, /^\+?\s*Add new organization/));
  await page.waitForTimeout(1600);

  const prov = (await commitRow(page, new RegExp(esc(provider))))
    || (await clickAddNew(page, /^\+?\s*Add new provider/));
  await page.waitForTimeout(1600);

  return { org, provider: prov };
}

/** Choose the sample type on the order form by visible label. Returns the label chosen. */
export async function selectSampleTypeOnOrderForm(page: Page, prefer: RegExp): Promise<string | null> {
  const picked = await page.evaluate((src) => {
    const rx = new RegExp(src, 'i');
    const sel = document.getElementById('sampleType-0') as HTMLSelectElement | null;
    if (!sel) return null;
    const o = [...sel.options].find((x) => rx.test((x.textContent || '').trim()));
    if (!o) return null;
    Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!.call(sel, o.value);
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return (o.textContent || '').trim();
  }, prefer.source);
  await page.waitForTimeout(2200);
  return picked;
}

/** Open the "Tests & Panels" picker. Safe to call when it is already open. */
export async function openTestsAndPanels(page: Page): Promise<void> {
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')]
      .find((x) => /tests\s*&\s*panels|choose available/i.test(((x.textContent) || '').trim()));
    if (b) (b as HTMLElement).click();
  });
  await page.waitForTimeout(1800);
}

/**
 * Tick a test or panel by its exact visible label. Carbon hides the real input,
 * so the label is the only thing that responds — same family as rule 2.
 */
export async function tickByExactLabel(page: Page, label: string): Promise<boolean> {
  // VISIBLE labels only. The Tests and Panels accordion keeps a section per
  // sample type in the DOM, so a panel offered under more than one type has a
  // matching label in each -- including collapsed sections a user can never
  // click. Taking the first match therefore ticks an arbitrary section and the
  // resulting order is not what the operator would have produced. offsetParent
  // is null for anything inside a collapsed section, which is the cheap test.
  const ok = await page.evaluate((name) => {
    const all = [...document.querySelectorAll('label')].filter((x) => ((x.textContent) || '').trim() === name);
    const l = all.find((x) => (x as HTMLElement).offsetParent !== null) ?? all[0];
    if (l) { (l as HTMLElement).click(); return true; }
    return false;
  }, label);
  await page.waitForTimeout(1200);
  return ok;
}

/** Rule 3: the gate is the button's disabled state, never the "N/M steps" text. */
export async function saveAndNextEnabled(page: Page): Promise<boolean> {
  return await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')]
      .find((x) => /save\s*&\s*next/i.test(((x.textContent) || '').trim()));
    return b ? !(b as HTMLButtonElement).disabled : false;
  });
}

/** Walk the remaining steps by clicking whichever of Save & Next / Submit is enabled. */
export async function clickThroughSaveAndNext(page: Page, steps = 4, waitMs = 4200): Promise<void> {
  for (let i = 0; i < steps; i++) {
    await page.evaluate(() => {
      const t = (e: Element) => ((e.textContent) || '').trim();
      const b = [...document.querySelectorAll('button')]
        .find((x) => /save\s*&\s*next|save and next|^submit$/i.test(t(x)) && !(x as HTMLButtonElement).disabled);
      if (b) (b as HTMLElement).click();
    });
    await page.waitForTimeout(waitMs);
  }
}
