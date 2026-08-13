// Interactive (scripted) docs-capture for the Env/Vector manual — the deeper states the
// route-landing pass can't reach: expanded lot, Identify form, Split preview, computed field
// indices, PASS/FAIL result rows. Opens forms WITHOUT saving (no duplicate records created).
//   BASE=https://indonesiademo.openelis-global.org npx playwright test --project=docs tests/docs/env-vector-interactive.docs.spec.ts
import { test } from '@playwright/test';
import { go, shot, saveWalkthrough, dismissModals } from './capture';

// --- Vector: expanded lot, Identify form, Split preview, deconvoluted sub-pools ---
test('User manual — Vector Surveillance (interactive)', async ({ page }, info) => {
  info.annotations.push({ type: 'capability', description: 'vector-surveillance-interactive' });
  await go(page, '/vector/identification');
  await shot(page, info, 'Worklist — pending lots');

  // Expand the first lot row to reveal the specimen table.
  const expanders = [
    page.locator('.cds--table-expand__button').first(),
    page.locator('button[aria-label*="xpand" i]').first(),
    page.getByRole('button', { name: /expand|details|▶/ }).first(),
    page.locator('table button').first(),
  ];
  for (const ex of expanders) {
    try { if (await ex.isVisible({ timeout: 1500 })) { await ex.click({ timeout: 2000 }); await page.waitForTimeout(1200); break; } } catch {}
  }
  await shot(page, info, 'Expanded lot — Species Distribution and specimen table');

  // Open the Identify form on a specimen row (do not save).
  try {
    const identify = page.getByRole('button', { name: /identif/i }).first();
    if (await identify.isVisible({ timeout: 2000 })) { await identify.click({ timeout: 2000 }); await page.waitForTimeout(1000); }
  } catch {}
  await shot(page, info, 'Identify form — species, method, confidence');
  await dismissModals(page);

  // Open the Split (deconvolution) modal and preview (do not save pools).
  try {
    const split = page.getByRole('button', { name: /split/i }).first();
    if (await split.isVisible({ timeout: 2000 })) { await split.click({ timeout: 2000 }); await page.waitForTimeout(1000); }
  } catch {}
  await shot(page, info, 'Split into sub-pools — options');
  try {
    const preview = page.getByRole('button', { name: /preview/i }).first();
    if (await preview.isVisible({ timeout: 2000 })) { await preview.click({ timeout: 2000 }); await page.waitForTimeout(1000); }
  } catch {}
  await shot(page, info, 'Split — proposed grouping preview');
  await dismissModals(page);

  // Show existing deconvoluted sub-pools via the Deconvolution status filter, if present.
  try {
    const filter = page.locator('select, [role="combobox"]').first();
    if (await filter.isVisible({ timeout: 1500 })) { await filter.click({ timeout: 1500 }); await page.waitForTimeout(400);
      const opt = page.getByText(/deconvolution|decon/i).first();
      if (await opt.isVisible({ timeout: 1000 })) { await opt.click({ timeout: 1000 }); await page.waitForTimeout(1000); } }
  } catch {}
  await shot(page, info, 'Sub-pools after deconvolution');
  await saveWalkthrough(page, info);
});

// --- Vector: field-survey computed indices (fill, do not save) ---
test('User manual — Vector Field Survey indices (interactive)', async ({ page }, info) => {
  info.annotations.push({ type: 'capability', description: 'vector-field-survey-interactive' });
  await go(page, '/order/vector/enter');
  await shot(page, info, 'Vector order — entry form');

  // Select the Vector Field Survey program to reveal the survey block.
  try {
    const prog = page.getByLabel(/program/i).first();
    if (await prog.isVisible({ timeout: 2000 })) {
      await prog.click({ timeout: 2000 }); await page.waitForTimeout(400);
      const opt = page.getByText(/vector field survey/i).first();
      if (await opt.isVisible({ timeout: 1500 })) { await opt.click({ timeout: 1500 }); await page.waitForTimeout(1000); }
    }
  } catch {}
  await shot(page, info, 'Vector Field Survey block revealed');

  // Fill the larval (Mode C) inputs so indices compute live (no save).
  const fills: [RegExp, string][] = [
    [/houses?\s*examined/i, '10'], [/houses?\s*positive/i, '4'],
    [/containers?\s*examined/i, '20'], [/containers?\s*positive/i, '5'],
    [/pupae/i, '50'], [/population/i, '200'],
  ];
  for (const [re, val] of fills) {
    try { const f = page.getByLabel(re).first(); if (await f.isVisible({ timeout: 800 })) { await f.fill(val, { timeout: 1500 }); await page.waitForTimeout(200); } } catch {}
  }
  await page.waitForTimeout(800);
  await shot(page, info, 'Computed indices — HI CI BI ABJ PPI and Kemenkes flag');
  await saveWalkthrough(page, info);
});

// --- Environmental: PASS / FAIL compliance rows on existing validated orders ---
test('User manual — Environmental compliance rows (interactive)', async ({ page }, info) => {
  info.annotations.push({ type: 'capability', description: 'environmental-compliance-interactive' });
  // By-order results; search the known PASS order, then the FAIL order.
  for (const [acc, label] of [['DEV01260000000000012', 'PASS row — Status Per Regulation'], ['DEV01260000000000024', 'FAIL row — Status Per Regulation']] as [string, string][]) {
    await go(page, '/AccessionResults');
    try {
      const box = page.getByRole('textbox').first();
      if (await box.isVisible({ timeout: 2000 })) { await box.fill(acc, { timeout: 2000 }); await page.waitForTimeout(300);
        const search = page.getByRole('button', { name: /search|submit|go/i }).first();
        if (await search.isVisible({ timeout: 1500 })) { await search.click({ timeout: 1500 }); await page.waitForTimeout(1500); } }
    } catch {}
    await shot(page, info, label);
  }
  await saveWalkthrough(page, info);
});
