// Docs-capture flow for capability `electronic-lab-notebook` — Electronic lab notebook.
//   BASE=https://testing.openelis-global.org npx playwright test --project=docs tests/docs/electronic-lab-notebook.docs.spec.ts
import { test } from '@playwright/test';
import { go, shot, saveWalkthrough, DEFAULT_PII } from './capture';

test('User manual — Electronic lab notebook walkthrough', async ({ page }, info) => {
  info.annotations.push({ type: 'capability', description: 'electronic-lab-notebook' });

  await page.goto('/');
  await page.waitForLoadState('networkidle').catch(() => {});
  await shot(page, info, 'Home dashboard');

  if (await go(page, '/NotebookDashboard')) await shot(page, info, "Lab notebook dashboard");

  await saveWalkthrough(page, info);
});
