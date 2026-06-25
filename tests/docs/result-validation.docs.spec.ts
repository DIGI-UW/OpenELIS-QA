// Docs-capture flow for capability `result-validation` — Result validation.
//   BASE=https://testing.openelis-global.org npx playwright test --project=docs tests/docs/result-validation.docs.spec.ts
import { test } from '@playwright/test';
import { go, shot, saveWalkthrough, DEFAULT_PII } from './capture';

test('User manual — Result validation walkthrough', async ({ page }, info) => {
  info.annotations.push({ type: 'capability', description: 'result-validation' });

  await page.goto('/');
  await page.waitForLoadState('networkidle').catch(() => {});
  await shot(page, info, 'Home dashboard');

  if (await go(page, '/ResultValidation?type=&test=')) await shot(page, info, "Validation — routine");
  if (await go(page, '/AccessionValidation')) await shot(page, info, "Validation by order");
  if (await go(page, '/ResultValidationByTestDate')) await shot(page, info, "Validation by date");

  await saveWalkthrough(page, info);
});
