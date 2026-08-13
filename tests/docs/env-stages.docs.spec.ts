// Drive a seeded ENVIRONMENTAL order through its wizard stages and capture each (viewport shots).
// Lab Number must be a generated accession (typed values are rejected server-side).
//   BASE=https://indonesiademo.openelis-global.org npx playwright test --project=docs tests/docs/env-stages.docs.spec.ts
import { test } from '@playwright/test';
import { go, shot, saveWalkthrough } from './capture';

test('User manual — Env order stages', async ({ page }, info) => {
  test.setTimeout(120000);
  info.annotations.push({ type: 'capability', description: 'env-order-stages' });
  await go(page, '/order/environmental/enter');

  // Generate Lab Number via in-page DOM click; verify it populated.
  try {
    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => { const el = [...document.querySelectorAll('a,button,span,div')].find(e => /^generate lab number$/i.test((e.textContent || '').trim())); if (el) (el as HTMLElement).click(); });
      await page.waitForTimeout(2000);
      const v = await page.evaluate(() => { const i = document.querySelector('input[placeholder*="generate lab number" i]') as HTMLInputElement | null; return i ? i.value : ''; });
      if (v) break;
    }
  } catch {}

  // Sampling Site — type then click the result's Select.
  try {
    const site = page.getByPlaceholder(/site name or code/i).first();
    await site.click({ timeout: 2000 }); await site.fill('MUL', { timeout: 2000 }); await page.waitForTimeout(1300);
    const sel = page.locator('.search-results').getByRole('button', { name: /select/i }).first();
    if (await sel.isVisible({ timeout: 1500 })) await sel.click({ timeout: 1500 });
    else { const t = page.locator('.search-results').getByText(/^Select$/).first(); if (await t.isVisible({ timeout: 1000 })) await t.click(); }
    await page.waitForTimeout(700);
  } catch {}

  // Applicable Compliance Standard — tick the first standard checkbox via DOM.
  try {
    await page.evaluate(() => {
      const hdr = [...document.querySelectorAll('h2,h3,h4,div,span,label')].find(e => /applicable compliance standard/i.test(e.textContent || '') && (e.textContent || '').length < 60);
      const scope = hdr ? ((hdr.closest('section,div') as HTMLElement) || document) : document;
      const cb = scope.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
      if (cb && !cb.checked) { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'checked')!.set!; s.call(cb, true); cb.dispatchEvent(new Event('click', { bubbles: true })); cb.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    await page.waitForTimeout(500);
  } catch {}

  // Per-Sample Manifest — set the Sample Type select to an env type that has tests.
  try {
    await page.evaluate(() => {
      const sel = [...document.querySelectorAll('select')].find(s => [...s.options].some(o => /drinking water|groundwater|water/i.test(o.textContent || '')));
      if (sel) { const o = [...sel.options].find(o => /drinking water/i.test(o.textContent || '')) || [...sel.options].find(o => /groundwater/i.test(o.textContent || '')) || sel.options[1]; const s = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!; s.call(sel, o.value); sel.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    await page.waitForTimeout(1200);
  } catch {}

  // Tick the first available test checkbox via DOM (after sample type chosen).
  try {
    await page.evaluate(() => {
      const cbs = [...document.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[];
      const cb = cbs[cbs.length - 1]; // tests render below; last checkbox is most likely a test row
      if (cb && !cb.checked) { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'checked')!.set!; s.call(cb, true); cb.dispatchEvent(new Event('click', { bubbles: true })); cb.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    await page.waitForTimeout(700);
  } catch {}

  async function clickByName(re: RegExp) {
    try { const b = page.getByRole('button', { name: re }).first(); if (await b.isVisible({ timeout: 2500 })) { await b.click({ timeout: 2500 }); await page.waitForTimeout(2000); return true; } } catch {}
    return false;
  }

  // Save & Next -> next stage
  await clickByName(/save & next|save and next/i);
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(500);
  await shot(page, info, 'Env order stage 2', { fullPage: false });
  await clickByName(/print all labels|print labels/i);
  await clickByName(/save & next|save and next/i);
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(500);
  await shot(page, info, 'Env order stage 3', { fullPage: false });
  // tick any QA checklist + submit
  await page.evaluate(() => { document.querySelectorAll('input[type="checkbox"]').forEach((cb: any) => { if (!cb.checked) { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'checked')!.set!; s.call(cb, true); cb.dispatchEvent(new Event('click', { bubbles: true })); cb.dispatchEvent(new Event('change', { bubbles: true })); } }); });
  await page.waitForTimeout(700);
  await clickByName(/save & next|save and next/i);
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(500);
  await shot(page, info, 'Env order stage 4', { fullPage: false });
  await saveWalkthrough(page, info);
});
