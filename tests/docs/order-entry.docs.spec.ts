// Docs-capture flow for capability `order-entry` — Order & sample entry.
//   BASE=https://testing.openelis-global.org npx playwright test --project=docs tests/docs/order-entry.docs.spec.ts
import { test } from '@playwright/test';
import { go, shot, saveWalkthrough, DEFAULT_PII } from './capture';

test('User manual — Order & sample entry walkthrough', async ({ page }, info) => {
  info.annotations.push({ type: 'capability', description: 'order-entry' });

  await page.goto('/');
  await page.waitForLoadState('networkidle').catch(() => {});
  await shot(page, info, 'Home dashboard');

  if (await go(page, '/SamplePatientEntry')) await shot(page, info, "Add order — patient & sample entry");
  if (await go(page, '/order')) await shot(page, info, "Order workflow dashboard");
  if (await go(page, '/order/enter')) await shot(page, info, "Order workflow — enter order");

  await saveWalkthrough(page, info);
});
