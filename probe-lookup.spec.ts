import { test } from '@playwright/test';
const BASE = process.env.BASE || 'https://34.212.225.107';
test('lookup shape', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto(BASE + '/MasterListsPage', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  const d = await page.evaluate(async () => {
    const csrf = localStorage.getItem('CSRF') || '';
    const r = await fetch('/api/OpenELIS-Global/rest/test-catalog/tests?search=' + encodeURIComponent('QA_AUTO_0813 TopSave') + '&page=1&pageSize=10', { credentials: 'include', headers: { 'X-CSRF-Token': csrf } });
    const j = await r.json();
    return { total: j.total, rows: (j.rows || []).map((x: any) => ({ testId: x.testId, id: x.id, name: x.name })) };
  });
  console.log('LOOKUP', JSON.stringify(d));
});
