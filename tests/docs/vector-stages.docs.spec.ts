// Drive a seeded vector order through every wizard stage, capturing each (viewport shots).
//   BASE=https://indonesiademo.openelis-global.org npx playwright test --project=docs tests/docs/vector-stages.docs.spec.ts
import { test } from '@playwright/test';
import { go, shot, saveWalkthrough } from './capture';
import { selectSampleTypeAgnostic } from './order-helpers';

test('User manual — Vector order stages', async ({ page }, info) => {
  test.setTimeout(120000);
  info.annotations.push({ type: 'capability', description: 'vector-order-stages' });
  await go(page, '/order/vector/enter');

  // Lab Number MUST be a real generated accession (typed values are rejected server-side).
  // Fire the "Generate Lab Number" control via an in-page DOM click (reliably triggers the handler).
  try {
    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => {
        const el = [...document.querySelectorAll('a,button,span,div')].find(e => /^generate lab number$/i.test((e.textContent || '').trim()));
        if (el) (el as HTMLElement).click();
      });
      await page.waitForTimeout(2000);
      const v = await page.evaluate(() => { const i = document.querySelector('input[placeholder*="generate lab number" i]') as HTMLInputElement | null; return i ? i.value : ''; });
      if (v) break;
    }
  } catch {}
  try {
    const site = page.getByPlaceholder(/site name or code/i).first();
    await site.click({ timeout: 2000 }); await site.fill('MUL', { timeout: 2000 }); await page.waitForTimeout(1300);
    const sel = page.locator('.search-results').getByRole('button', { name: /select/i }).first();
    if (await sel.isVisible({ timeout: 1500 })) await sel.click({ timeout: 1500 });
    else { const t = page.locator('.search-results').getByText(/^Select$/).first(); if (await t.isVisible({ timeout: 1000 })) await t.click({ timeout: 1000 }); }
    await page.waitForTimeout(800);
  } catch {}
  try { const pn = page.getByLabel(/provider name/i).first(); if (await pn.isVisible({ timeout: 1200 })) await pn.fill('Tony Stark'); } catch {}
  // Instance-agnostic sample type ("Adult Mosquito" only exists on indonesiademo).
  try { await selectSampleTypeAgnostic(page, 'vector', { prefer: /adult\s*mosquito/i }); await page.waitForTimeout(1000); } catch {}
  try { await page.getByLabel(/lifecycle stage/i).first().selectOption({ index: 1 }).catch(() => {}); } catch {}
  try { await page.getByLabel(/trap type/i).first().selectOption({ index: 1 }).catch(() => {}); } catch {}
  try {
    await page.evaluate(() => {
      const labels = [...document.querySelectorAll('label')];
      let inp: HTMLInputElement | null = null;
      const q = labels.find(l => /quantity in pool/i.test(l.textContent || ''));
      if (q) { const id = q.getAttribute('for'); if (id) inp = document.getElementById(id) as HTMLInputElement; if (!inp) inp = (q.parentElement?.querySelector('input') as HTMLInputElement) || null; }
      if (!inp) inp = document.querySelector('input[type="number"]');
      if (inp) { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!; s.call(inp, '25'); inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true })); }
    });
  } catch {}
  try { await page.evaluate(() => { const cb = document.querySelector('input[type="checkbox"]') as HTMLInputElement|null; if (cb && !cb.checked) { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'checked')!.set!; s.call(cb,true); cb.dispatchEvent(new Event('click',{bubbles:true})); cb.dispatchEvent(new Event('change',{bubbles:true})); } }); } catch {}
  await page.waitForTimeout(700);

  async function clickByName(re: RegExp) {
    try { const b = page.getByRole('button', { name: re }).first(); if (await b.isVisible({ timeout: 2500 })) { await b.click({ timeout: 2500 }); await page.waitForTimeout(1800); return true; } } catch {}
    return false;
  }

  // Save & Next -> Label & Store
  await clickByName(/save & next|save and next/i);
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(400);
  await shot(page, info, 'Label & Store stage', { fullPage: false });
  // print labels + advance
  await clickByName(/print all labels|print labels/i);
  // Tick "skip storage" so the storage gate (and QA checklist) is satisfied.
  await page.evaluate(() => {
    const cands = [...document.querySelectorAll('label,span,div,p')].filter(e => /skip storage|skip & continue|no storage|skip this step|skip/i.test((e.textContent || '').trim()) && (e.textContent || '').trim().length < 40);
    let cb: HTMLInputElement | null = null;
    for (const el of cands) { cb = (el.querySelector('input[type="checkbox"]') as HTMLInputElement) || null; const f = el.getAttribute('for'); if (!cb && f) cb = document.getElementById(f) as HTMLInputElement; if (!cb) cb = (el.closest('div')?.querySelector('input[type="checkbox"]') as HTMLInputElement) || null; if (cb) break; }
    if (!cb) { const hdr = [...document.querySelectorAll('*')].find(e => /assign storage location/i.test(e.textContent || '') && e.children.length < 6); cb = (hdr?.closest('div')?.querySelector('input[type="checkbox"]') as HTMLInputElement) || null; }
    if (cb && !cb.checked) { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'checked')!.set!; s.call(cb, true); cb.dispatchEvent(new Event('click', { bubbles: true })); cb.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  await page.waitForTimeout(700);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await page.waitForTimeout(400);
  await shot(page, info, 'Label & Store stage — labels and storage', { fullPage: false });
  await clickByName(/save & next|save and next/i);

  // QA Review
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(400);
  await shot(page, info, 'QA Review stage', { fullPage: false });
  // Tick all QA checklist boxes (DOM — never .click a Carbon checkbox), then Submit -> Complete.
  await page.evaluate(() => {
    document.querySelectorAll('input[type="checkbox"]').forEach((cb: any) => {
      if (!cb.checked) { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'checked')!.set!; s.call(cb, true); cb.dispatchEvent(new Event('click', { bubbles: true })); cb.dispatchEvent(new Event('change', { bubbles: true })); }
    });
  });
  await page.waitForTimeout(800);
  await shot(page, info, 'QA Review stage — checklist complete', { fullPage: false });
  await clickByName(/^submit$/i);
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(800);
  await shot(page, info, 'Complete stage', { fullPage: false });
  await saveWalkthrough(page, info);
});
