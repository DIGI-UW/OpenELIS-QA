// Discover the Compliance Standards Administration route from the Test Management menu and capture it.
//   BASE=https://indonesiademo.openelis-global.org npx playwright test --project=docs tests/docs/compliance-list.docs.spec.ts
import { test } from '@playwright/test';
import { go, shot, saveWalkthrough } from './capture';
import fs from 'fs';

test('User manual — Compliance Standards list', async ({ page }, info) => {
  info.annotations.push({ type: 'capability', description: 'admin-compliance-list' });
  await go(page, '/MasterListsPage/testManagementConfigMenu');
  const href = await page.evaluate(() => {
    const a = [...document.querySelectorAll('a[href]')].find(x => /compliance standard/i.test(x.textContent || ''));
    return a ? a.getAttribute('href') : null;
  });
  fs.writeFileSync('docs-media/_explore/compliance-route.txt', href || 'NOT FOUND');
  if (href) { await go(page, href); await page.waitForTimeout(1200); await shot(page, info, 'Compliance Standards Administration list'); }
  else { await shot(page, info, 'Test Management menu'); }
  await saveWalkthrough(page, info);
});
