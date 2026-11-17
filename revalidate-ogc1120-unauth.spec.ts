import { test, expect, request as pwRequest } from '@playwright/test';

// Does an UNAUTHENTICATED GET to the OGC-1120 endpoint return 200 (the login page) and thus
// make the guard read as -bug fixed- when it is really just logged out?
test('OGC-1120 unauth check', async ({ baseURL }) => {
  test.setTimeout(60000);
  const ctx = await pwRequest.newContext({ baseURL, ignoreHTTPSErrors: true });
  const r = await ctx.get('/api/OpenELIS-Global/rest/sample-type-tests', { headers: { Accept: 'application/json' } });
  const body = await r.text();
  console.log('UNAUTH_STATUS', r.status());
  console.log('UNAUTH_CTYPE', r.headers()['content-type']);
  console.log('UNAUTH_ISHTML', /<!DOCTYPE|<html/i.test(body));
  console.log('UNAUTH_HEAD', JSON.stringify(body.slice(0, 160)));
  // Was console lines only (2026-11-17): signed out, the endpoint must not hand back its data.
  expect(r.status() >= 400 || /<!DOCTYPE|<html/i.test(body), `signed out, sample-type-tests is refused (HTTP ${r.status()})`).toBe(true);
  await ctx.dispose();
});
