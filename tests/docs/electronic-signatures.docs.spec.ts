// Docs-capture flow for capability `electronic-signatures` — Electronic signatures.
//   BASE=https://testing.openelis-global.org npx playwright test --project=docs tests/docs/electronic-signatures.docs.spec.ts
import { test } from '@playwright/test';
import { go, shot, saveWalkthrough, DEFAULT_PII } from './capture';

test('User manual — Electronic signatures walkthrough', async ({ page }, info) => {
  info.annotations.push({ type: 'capability', description: 'electronic-signatures' });

  await page.goto('/');
  await page.waitForLoadState('networkidle').catch(() => {});
  await shot(page, info, 'Home dashboard');

  if (await go(page, '/ResultValidation?type=&test=')) await shot(page, info, "Sign-off during validation");
  if (await go(page, '/AccessionValidation')) await shot(page, info, "Validation by order (sign-off)");

  await saveWalkthrough(page, info);
});
