import { test } from '@playwright/test';

// Revalidation for OGC-1120: GET /rest/sample-type-tests with NO param used to 500.
// Gate: fresh context (this run logs in from scratch) + 3x API repeat + a UI-context read.
test('OGC-1120 revalidate', async ({ page, request }) => {
  test.setTimeout(120000);
  const REST = '/api/OpenELIS-Global/rest';
  const noParam: number[] = [];
  const withParam: number[] = [];
  for (let i = 0; i < 3; i++) {
    noParam.push((await request.get(REST + '/sample-type-tests', { headers: { Accept: 'application/json' } })).status());
    withParam.push((await request.get(REST + '/sample-type-tests?sampleType=1', { headers: { Accept: 'application/json' } })).status());
  }
  console.log('OGC1120_NOPARAM', JSON.stringify(noParam));
  console.log('OGC1120_WITHPARAM', JSON.stringify(withParam));
  await page.goto('/MasterListsPage', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const inPage = await page.evaluate(async () => {
    const csrf = localStorage.getItem('CSRF') || '';
    const r = await fetch('/api/OpenELIS-Global/rest/sample-type-tests', { credentials: 'include', headers: { 'X-CSRF-Token': csrf, Accept: 'application/json' } });
    const t = await r.text();
    return { status: r.status, len: t.length, head: t.slice(0, 120) };
  });
  console.log('OGC1120_IN_PAGE', JSON.stringify(inPage));
});
