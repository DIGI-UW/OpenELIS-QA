// Definitive capture: type a valid query into Move Sample → New location and screenshot + dump DOM.
//   BASE=https://testing.openelis-global.org npx playwright test --project=docs tests/docs/storage-picker.docs.spec.ts
import { test } from '@playwright/test';
import { go, shot, settle, dismissModals } from './capture';
import fs from 'fs';

test('move sample — location search visible-state capture', async ({ page }, info) => {
  info.annotations.push({ type: 'capability', description: 'handoff-storage-picker' });
  test.setTimeout(150000);

  await go(page, '/Storage/sample-items');
  const ov = page.locator('table tbody tr .cds--overflow-menu, table tbody tr button[aria-haspopup]').first();
  await ov.click({ timeout: 5000 }).catch(() => {});
  await settle(page, 500);
  await page.getByRole('menuitem', { name: /manage location/i })
    .or(page.locator('.cds--overflow-menu-options button', { hasText: /manage location/i })).first()
    .click({ timeout: 5000 }).catch(() => {});
  await settle(page, 800);

  const search = page.getByPlaceholder(/type 2\+|search for a storage|search/i).or(page.getByRole('combobox')).first();
  await search.click().catch(() => {});
  await search.type('Freezer', { delay: 90 }).catch(() => {});   // valid: the one location is "Hema Lab > Freezer 1 > Shelf 2"
  await page.waitForTimeout(2500);
  await dismissModals(page);
  await shot(page, info, 'Typed Freezer — search state');   // unconditional: shows whether results render at all

  // Dump the DOM around the search field so we can see how (or whether) results render.
  const dump: any = await page.evaluate(() => {
    const inp = document.querySelector('input[placeholder*="search" i], input[type="search"], [role="combobox"] input') as HTMLElement | null;
    const container = inp?.closest('div,section,form') as HTMLElement | null;
    const region = container?.parentElement as HTMLElement | null;
    const anyMenu = document.querySelector('.cds--list-box__menu, ul[role="listbox"], [class*="result" i], [class*="menu" i][role]');
    return {
      inputValue: (inp as HTMLInputElement | null)?.value ?? null,
      regionHTML: region ? region.innerHTML.slice(0, 1200) : null,
      menuPresent: !!anyMenu,
      menuHTML: anyMenu ? (anyMenu as HTMLElement).outerHTML.slice(0, 800) : null,
      bodyTextHasFreezer: /Freezer|Hema|Shelf/.test(document.body.innerText),
    };
  }).catch(e => ({ error: String(e) }));
  fs.mkdirSync('docs-media/_explore', { recursive: true });
  fs.writeFileSync('docs-media/_explore/storage-search-dom.json', JSON.stringify(dump, null, 2));
});
