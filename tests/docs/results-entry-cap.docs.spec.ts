// Capture populated Results Entry (Hematology) on indonesiademo + grab a lab number for Order Search.
import { test } from '@playwright/test';
import { go, shot, DEFAULT_PII } from './capture';
import path from 'path';
import fs from 'fs';
const dir = 'docs-media/results-entry-live'; fs.mkdirSync(dir, { recursive: true });

test('results entry populated', async ({ page }, info) => {
  test.setTimeout(90000);
  info.annotations.push({ type: 'capability', description: 'results-entry-live' });
  await go(page, '/LogbookResults?type=');
  await page.selectOption('#unitType', { label: 'Hematology' }).catch(() => {});
  await page.waitForTimeout(4000);
  // viewport shot (top of the grid: unit selector + first result rows)
  await page.screenshot({ path: path.join(dir, '01-results-by-unit.png'), fullPage: false, animations: 'disabled' });
  // grab first visible lab/accession number for Order Search
  const labno = await page.evaluate(() => {
    const m = document.body.innerText.match(/\bDEV\d{10,}\b/);
    return m ? m[0] : '';
  });
  console.log('LABNO', labno);
  // Order search by accession
  if (labno) {
    await go(page, '/AccessionResults');
    const inp = page.getByPlaceholder(/accession/i).first();
    if (await inp.count()) {
      await inp.fill(labno);
      await page.getByRole('button', { name: /^\s*search\s*$/i }).first().click().catch(() => {});
      await page.waitForTimeout(3500);
      const inputs = await page.locator('main input').count();
      console.log('ORDER_SEARCH_INPUTS', inputs);
      await shot(page, info, 'Results by order', { maskPii: DEFAULT_PII });
    }
  }
});
