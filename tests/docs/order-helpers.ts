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

/** Set the per-sample-manifest Sample Type to an option that actually carries tests. */
export async function selectEnvSampleType(page: Page, optionRe: RegExp = /^\s*Water\s*$/i): Promise<string | null> {
  return await setSelectByOption(page, optionRe);
}

/** Open the per-row "Tests & Panels" toggle, then tick a test by its label. Returns the test name. */
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
export type WriteRec = { url: string; method: string; status: number };
export function trackWrites(page: Page): WriteRec[] {
  const writes: WriteRec[] = [];
  page.on('response', (r) => {
    const m = r.request().method();
    if (m !== 'GET' && m !== 'HEAD' && m !== 'OPTIONS' && /\/rest\//.test(r.url())) {
      writes.push({ url: r.url().replace(/^https?:\/\/[^/]+/, ''), method: m, status: r.status() });
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
