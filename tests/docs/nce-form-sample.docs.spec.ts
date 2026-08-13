// Report NCE form with Category = Sample selected → capture the real Subcategory (rejection) options.
import { test } from '@playwright/test';
import { go, shot, settle } from './capture';
import fs from 'fs';

test('Report NCE — Category=Sample subcategories', async ({ page }, info) => {
  info.annotations.push({ type: 'capability', description: 'nce-form' });
  test.setTimeout(150000);
  await go(page, '/ReportNonConformingEvent');
  await settle(page, 1200);

  // Category is the 2nd select on the page (1st is locale). Find the one whose options include "Sample".
  const sels = await page.$$('select');
  let subOpts: string[] = [];
  for (const s of sels) {
    const opts = await s.$$eval('option', os => os.map(o => o.textContent || ''));
    if (opts.some(o => /^\s*Sample\s*$/i.test(o))) {
      await s.selectOption({ label: 'Sample' });
      await page.waitForTimeout(1500);
      await settle(page, 600);
      break;
    }
  }
  // Now re-read all selects; the Subcategory select should be populated
  const after = await page.$$('select');
  for (const s of after) {
    const opts = await s.$$eval('option', os => os.map(o => (o.textContent || '').trim()).filter(Boolean));
    if (opts.length && !opts.includes('English') && !opts.some(o => /^(General|Order|Sample|Analysis|Post-Analytical)$/.test(o)) && !/^\d+$/.test(opts[0])) {
      // likely the subcategory list
      subOpts = opts;
    }
  }
  fs.mkdirSync('docs-media/_explore', { recursive: true });
  fs.writeFileSync('docs-media/_explore/nce-subcategories.json', JSON.stringify({ subOpts }, null, 2));
  await shot(page, info, 'Report NCE form — Category Sample (rejection subcategories)');
});
