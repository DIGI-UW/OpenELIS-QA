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
// one copy has NO tests (OGC-1063). Use a sample type known to carry tests: Groundwater or
// Surface Water (English-named tests: pH, Lead, TDS, Dissolved Oxygen, BOD, Mercury, Total
// Coliform, E. coli Presence). "Drinking Water" (one of two) has no tests — avoid it.

/** Set the per-sample-manifest Sample Type to an option that actually carries tests. */
export async function selectEnvSampleType(page: Page, optionRe: RegExp = /^\s*Groundwater\s*$/i): Promise<string | null> {
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
