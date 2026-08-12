// Docs-capture flow for capability `home-hero` — Home.
//   BASE=https://testing.openelis-global.org npx playwright test --project=docs tests/docs/home-hero.docs.spec.ts
import { test } from '@playwright/test';
import { go, shot, saveWalkthrough, DEFAULT_PII } from './capture';

test('User manual — Home walkthrough', async ({ page }, info) => {
  info.annotations.push({ type: 'capability', description: 'home-hero' });

  await page.goto('/');
  await page.waitForLoadState('networkidle').catch(() => {});
  await shot(page, info, 'Home dashboard');



  await saveWalkthrough(page, info);
});
