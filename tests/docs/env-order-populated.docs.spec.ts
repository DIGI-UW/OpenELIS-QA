// Populate the ENV order entry form with demo data and capture two legible viewport sections.
// Fill only (no save) — avoids the server-side save validation; we just need a populated screenshot.
//   BASE=https://indonesiademo.openelis-global.org npx playwright test --project=docs tests/docs/env-order-populated.docs.spec.ts
import { test } from '@playwright/test';
import { go, shot, saveWalkthrough } from './capture';

test('User manual — Env order populated', async ({ page }, info) => {
  test.setTimeout(120000);
  info.annotations.push({ type: 'capability', description: 'env-order-populated' });
  await go(page, '/order/environmental/enter');

  // Lab Number (any text is accepted).
  try { await page.evaluate(() => { const i = document.querySelector('input[placeholder*="generate lab number" i]') as HTMLInputElement|null; if (i) { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value')!.set!; s.call(i,'DEMO-ENV-0042'); i.dispatchEvent(new Event('input',{bubbles:true})); i.dispatchEvent(new Event('change',{bubbles:true})); } }); } catch {}

  // Sampling Site — type then click the result's Select.
  try {
    const site = page.getByPlaceholder(/site name or code/i).first();
    await site.click({ timeout: 2000 }); await site.fill('MUL', { timeout: 2000 }); await page.waitForTimeout(1300);
    const sel = page.locator('.search-results').getByRole('button', { name: /select/i }).first();
    if (await sel.isVisible({ timeout: 1500 })) await sel.click({ timeout: 1500 });
    else { const t = page.locator('.search-results').getByText(/^Select$/).first(); if (await t.isVisible({ timeout: 1000 })) await t.click(); }
    await page.waitForTimeout(700);
  } catch {}

  // Applicable Compliance Standard — tick the first standard checkbox via DOM if present.
  try {
    await page.evaluate(() => {
      const hdr = [...document.querySelectorAll('h2,h3,h4,div,span,label')].find(e => /applicable compliance standard/i.test(e.textContent || '') && (e.textContent || '').length < 60);
      const scope = hdr ? (hdr.closest('section,div') as HTMLElement) || document : document;
      const cb = scope.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
      if (cb && !cb.checked) { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'checked')!.set!; s.call(cb,true); cb.dispatchEvent(new Event('click',{bubbles:true})); cb.dispatchEvent(new Event('change',{bubbles:true})); }
    });
    await page.waitForTimeout(500);
  } catch {}

  // Per-Sample Manifest — set the first Sample Type select to a value.
  try {
    const st = page.getByLabel(/sample type/i).first();
    await st.selectOption({ index: 1 }).catch(async () => { await st.click({ timeout: 1500 }); });
    await page.waitForTimeout(800);
  } catch {}

  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(400);
  await shot(page, info, 'Env order entry populated — order, site, conditions', { fullPage: false });
  try { await page.getByText(/Per-Sample Manifest|Applicable Compliance/i).first().scrollIntoViewIfNeeded({ timeout: 2000 }); await page.waitForTimeout(500); } catch {}
  await shot(page, info, 'Env order entry populated — compliance standard and manifest', { fullPage: false });
  await saveWalkthrough(page, info);
});
