// Docs-capture flow for capability `sample-storage-management` — Sample storage management.
//   BASE=https://testing.openelis-global.org npx playwright test --project=docs tests/docs/sample-storage-management.docs.spec.ts
import { test } from '@playwright/test';
import { go, shot, saveWalkthrough, DEFAULT_PII } from './capture';

test('User manual — Sample storage management walkthrough', async ({ page }, info) => {
  info.annotations.push({ type: 'capability', description: 'sample-storage-management' });

  await page.goto('/');
  await page.waitForLoadState('networkidle').catch(() => {});
  await shot(page, info, 'Home dashboard');

  if (await go(page, '/Storage/sample-items')) await shot(page, info, "Stored sample items");
  if (await go(page, '/Storage/rooms')) await shot(page, info, "Storage hierarchy — rooms");
  if (await go(page, '/FreezerMonitoring?tab=0')) await shot(page, info, "Freezer monitoring dashboard");

  await saveWalkthrough(page, info);
});
