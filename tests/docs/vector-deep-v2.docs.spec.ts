// Targeted retry: expand the vector lot via JS (custom control), then capture Identify + Split.
//   BASE=https://indonesiademo.openelis-global.org npx playwright test --project=docs tests/docs/vector-deep-v2.docs.spec.ts
import { test } from '@playwright/test';
import { go, shot, saveWalkthrough, dismissModals } from './capture';
import fs from 'fs';

test('User manual — Vector deep states v2', async ({ page }, info) => {
  info.annotations.push({ type: 'capability', description: 'vector-surveillance-interactive' });
  await go(page, '/vector/identification');

  // Diagnostic: dump the first data row's buttons so we know the expand control.
  const diag = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('tbody tr, [role="row"]')];
    const row = rows.find(r => /P01|DEV/.test(r.textContent || '')) || rows[0];
    if (!row) return { rows: rows.length, note: 'no row' };
    const btns = [...row.querySelectorAll('button, [role="button"], svg, [class*="expand"]')].slice(0, 8)
      .map(b => ({ tag: b.tagName, cls: (b.getAttribute('class') || '').slice(0, 60), aria: b.getAttribute('aria-label'), txt: (b.textContent || '').trim().slice(0, 20) }));
    return { rows: rows.length, btns };
  });
  fs.writeFileSync('docs-media/_explore/vector-row-diag.json', JSON.stringify(diag, null, 2));

  // Expand: click the first button/clickable in the lot row via JS (custom triangle toggle).
  await page.evaluate(() => {
    const rows = [...document.querySelectorAll('tbody tr, [role="row"]')];
    const row = rows.find(r => /P01|DEV/.test(r.textContent || '')) || rows[0];
    const clickable = row && (row.querySelector('button, [role="button"], [class*="expand"], svg') as HTMLElement);
    if (clickable) clickable.click(); else if (row) (row as HTMLElement).click();
  });
  await page.waitForTimeout(1500);
  await shot(page, info, 'Expanded lot — Species Distribution and specimen table');

  // Identify (now that specimen rows are visible).
  try {
    const id = page.getByRole('button', { name: /identif/i }).first();
    if (await id.isVisible({ timeout: 2500 })) { await id.click({ timeout: 2000 }); await page.waitForTimeout(1200); }
  } catch {}
  await shot(page, info, 'Identify form — species, method, confidence');
  await dismissModals(page);

  // Split + preview (do not save pools).
  try {
    const sp = page.getByRole('button', { name: /split/i }).first();
    if (await sp.isVisible({ timeout: 2500 })) { await sp.click({ timeout: 2000 }); await page.waitForTimeout(1200); }
  } catch {}
  await shot(page, info, 'Split into sub-pools — options');
  try {
    const pv = page.getByRole('button', { name: /preview/i }).first();
    if (await pv.isVisible({ timeout: 2000 })) { await pv.click({ timeout: 2000 }); await page.waitForTimeout(1200); }
  } catch {}
  await shot(page, info, 'Split — proposed grouping preview');
  await saveWalkthrough(page, info);
});
