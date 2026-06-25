// Docs-capture flow for capability `organizations-management` — Organizations management.
//   BASE=https://testing.openelis-global.org npx playwright test --project=docs tests/docs/organizations-management.docs.spec.ts
import { test } from '@playwright/test';
import { go, shot, saveWalkthrough, DEFAULT_PII } from './capture';

test('User manual — Organizations management walkthrough', async ({ page }, info) => {
  info.annotations.push({ type: 'capability', description: 'organizations-management' });

  await page.goto('/');
  await page.waitForLoadState('networkidle').catch(() => {});
  await shot(page, info, 'Home dashboard');

  if (await go(page, '/MasterListsPage')) await shot(page, info, "Administration — master lists");

  await saveWalkthrough(page, info);
});
