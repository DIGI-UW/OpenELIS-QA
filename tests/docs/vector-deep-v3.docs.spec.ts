// Vector deep states v3 — expand the lot by clicking its Lot ID cell (confirmed in Chrome),
// then capture the inline Identify form and the Split modal + preview. No saves (no new data).
//   BASE=https://indonesiademo.openelis-global.org npx playwright test --project=docs tests/docs/vector-deep-v3.docs.spec.ts
import { test } from '@playwright/test';
import { go, shot, saveWalkthrough } from './capture';

test('User manual — Vector deep states v3', async ({ page }, info) => {
  info.annotations.push({ type: 'capability', description: 'vector-surveillance-interactive' });
  await go(page, '/vector/identification');

  // Expand the pool: click the Lot ID cell text (the row's click target).
  try {
    const lot = page.getByText(/DEV\d+-P01/).first();
    await lot.click({ timeout: 4000 }); await page.waitForTimeout(1500);
  } catch {}
  await shot(page, info, 'Expanded lot — Species Distribution and specimen table');

  // Open the inline Identify form on the first specimen; type a species for realism (no save).
  try {
    await page.getByRole('button', { name: /identif/i }).first().click({ timeout: 3000 });
    await page.waitForTimeout(900);
    const sp = page.getByPlaceholder(/genus or species/i).first();
    if (await sp.isVisible({ timeout: 1500 })) { await sp.fill('Aedes aegypti', { timeout: 1500 }); await page.waitForTimeout(500); }
  } catch {}
  await shot(page, info, 'Identify form — species, method, confidence, lifecycle');

  // Close the Identify form (Cancel) before opening Split.
  try { await page.getByRole('button', { name: /^cancel$/i }).first().click({ timeout: 2000 }); await page.waitForTimeout(600); } catch {}

  // Open the Split (deconvolution) modal, then preview the grouping (do not Save Pools).
  try {
    await page.getByRole('button', { name: /split/i }).first().click({ timeout: 3000 }); await page.waitForTimeout(1200);
  } catch {}
  await shot(page, info, 'Split into sub-pools — options');
  try {
    const pv = page.getByRole('button', { name: /preview/i }).first();
    if (await pv.isVisible({ timeout: 2000 })) { await pv.click({ timeout: 2000 }); await page.waitForTimeout(1200); }
  } catch {}
  await shot(page, info, 'Split — proposed grouping preview');

  // Show the deconvoluted sub-pools via the Deconvolution status filter.
  try {
    // close modal first
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);
    const status = page.getByLabel(/status/i).first();
    if (await status.isVisible({ timeout: 1500 })) { await status.selectOption('decon').catch(async () => { await status.click(); }); await page.waitForTimeout(1200); }
  } catch {}
  await shot(page, info, 'Sub-pools after deconvolution');
  await saveWalkthrough(page, info);
});
