// One-off website capture: Laporan Hasil compliance report AFTER clicking Search,
// so the results table is populated (the docs capture stopped at the empty filter form).
import { test } from '@playwright/test';
import { go, shot, saveWalkthrough } from './capture';

test('Website — Laporan Hasil populated after search', async ({ page }, info) => {
  test.setTimeout(120000);
  info.annotations.push({ type: 'capability', description: 'laporan-search' });

  await go(page, '/LaporanHasil');
  await page.waitForTimeout(1000);

  // Click the main "Search" button (not the top-nav search icon) by exact text match.
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(
      el => (el.textContent || '').trim().toLowerCase() === 'search'
    );
    if (b) (b as HTMLButtonElement).click();
  });
  await page.waitForTimeout(3500);

  await shot(page, info, 'Laporan Hasil — populated results');
  await saveWalkthrough(page, info);
});
