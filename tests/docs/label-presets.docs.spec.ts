// Docs-capture flow for capability `label-presets` — Label Presets.
//   BASE=https://testing.openelis-global.org npx playwright test --project=docs tests/docs/label-presets.docs.spec.ts
import { test } from '@playwright/test';
import { go, shot, saveWalkthrough, DEFAULT_PII } from './capture';

test('User manual — Label Presets walkthrough', async ({ page }, info) => {
  info.annotations.push({ type: 'capability', description: 'label-presets' });

  await page.goto('/');
  await page.waitForLoadState('networkidle').catch(() => {});
  await shot(page, info, 'Home dashboard');

  if (await go(page, '/MasterListsPage/labelPresets')) await shot(page, info, "Label Presets list");

  await saveWalkthrough(page, info);
});
