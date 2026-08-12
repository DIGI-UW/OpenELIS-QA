// Populate the vector order entry form with demo data and capture it as two legible
// viewport sections (top: lab/site/requester/program; bottom: organism + tests). No save.
//   BASE=https://indonesiademo.openelis-global.org npx playwright test --project=docs tests/docs/vector-order-populated.docs.spec.ts
import { test } from '@playwright/test';
import { go, shot, saveWalkthrough } from './capture';

test('User manual — Vector order populated', async ({ page }, info) => {
  info.annotations.push({ type: 'capability', description: 'vector-order-populated' });
  await go(page, '/order/vector/enter');

  // Lab Number — generate one.
  try { await page.getByRole('link', { name: /generate lab number/i }).click({ timeout: 3000 }); await page.waitForTimeout(800); } catch {}

  // Sampling Site — type and pick MULAGO.
  try {
    const site = page.getByLabel(/site name/i).first();
    await site.click({ timeout: 2000 }); await site.fill('MULAGO', { timeout: 2000 }); await page.waitForTimeout(1000);
    const opt = page.getByText(/^MULAGO/).first();
    if (await opt.isVisible({ timeout: 1500 })) await opt.click({ timeout: 1500 });
  } catch {}

  // Requester — Marvel demo provider name.
  try { const pn = page.getByLabel(/provider name/i).first(); if (await pn.isVisible({ timeout: 1500 })) { await pn.fill('Tony Stark', { timeout: 1500 }); } } catch {}

  // Sample Type — Adult Mosquito (native select if possible, else open + click option).
  try {
    const st = page.getByLabel(/^sample type/i).first();
    await st.selectOption({ label: 'Adult Mosquito' }).catch(async () => {
      await st.click({ timeout: 2000 }); await page.waitForTimeout(500);
      const o = page.getByText(/^Adult Mosquito$/).first(); if (await o.isVisible({ timeout: 1500 })) await o.click({ timeout: 1500 });
    });
    await page.waitForTimeout(1200);
  } catch {}

  // Lifecycle Stage, Trap Type — pick the first real option; Quantity in Pool = 25.
  try { const ls = page.getByLabel(/lifecycle stage/i).first(); await ls.selectOption({ index: 1 }).catch(() => {}); } catch {}
  try { const tt = page.getByLabel(/trap type/i).first(); await tt.selectOption({ index: 1 }).catch(() => {}); } catch {}
  try { const q = page.getByLabel(/quantity in pool/i).first(); if (await q.isVisible({ timeout: 1500 })) await q.fill('25', { timeout: 1500 }); } catch {}
  await page.waitForTimeout(800);

  // Tick the first available test via DOM (never .click a Carbon checkbox — it hangs).
  try {
    await page.evaluate(() => {
      const cb = document.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
      if (cb && !cb.checked) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'checked')!.set!;
        setter.call(cb, true);
        cb.dispatchEvent(new Event('click', { bubbles: true }));
        cb.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await page.waitForTimeout(600);
  } catch {}

  // Top section (lab number, collection date, sampling site, requester, program).
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(400);
  await shot(page, info, 'Vector order entry populated — order and site details', { fullPage: false });

  // Bottom section (organism + tests).
  try { await page.getByText(/Animal\/Organism 1/i).first().scrollIntoViewIfNeeded({ timeout: 2000 }); await page.waitForTimeout(500); } catch {}
  await shot(page, info, 'Vector order entry populated — organism and tests', { fullPage: false });
  await saveWalkthrough(page, info);
});
