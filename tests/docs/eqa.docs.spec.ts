// Docs-capture flow for capability `eqa` — EQA / proficiency testing.
//   BASE=https://testing.openelis-global.org npx playwright test --project=docs tests/docs/eqa.docs.spec.ts
import { test } from '@playwright/test';
import { go, shot, saveWalkthrough, DEFAULT_PII } from './capture';

test('User manual — EQA / proficiency testing walkthrough', async ({ page }, info) => {
  info.annotations.push({ type: 'capability', description: 'eqa' });

  await page.goto('/');
  await page.waitForLoadState('networkidle').catch(() => {});
  await shot(page, info, 'Home dashboard');

  if (await go(page, '/EQAManagement')) await shot(page, info, "EQA programs");
  if (await go(page, '/EQAParticipants')) await shot(page, info, "EQA participants");
  if (await go(page, '/EQAResults')) await shot(page, info, "EQA results & analysis");

  await saveWalkthrough(page, info);
});
