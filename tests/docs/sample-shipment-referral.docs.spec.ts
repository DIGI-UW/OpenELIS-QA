// Docs-capture flow for capability `sample-shipment-referral` — Sample shipment & referral.
//   BASE=https://testing.openelis-global.org npx playwright test --project=docs tests/docs/sample-shipment-referral.docs.spec.ts
import { test } from '@playwright/test';
import { go, shot, saveWalkthrough, DEFAULT_PII } from './capture';

test('User manual — Sample shipment & referral walkthrough', async ({ page }, info) => {
  info.annotations.push({ type: 'capability', description: 'sample-shipment-referral' });

  await page.goto('/');
  await page.waitForLoadState('networkidle').catch(() => {});
  await shot(page, info, 'Home dashboard');

  if (await go(page, '/SampleShipment')) await shot(page, info, "Sample shipment");
  if (await go(page, '/ReferredOutTests')) await shot(page, info, "Referred-out tests");

  await saveWalkthrough(page, info);
});
