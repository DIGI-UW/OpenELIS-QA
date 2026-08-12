// Docs-capture flow for capability `pathology-dashboard` — Pathology dashboard.
//   BASE=https://testing.openelis-global.org npx playwright test --project=docs tests/docs/pathology-dashboard.docs.spec.ts
import { test } from '@playwright/test';
import { go, shot, saveWalkthrough, DEFAULT_PII } from './capture';

test('User manual — Pathology dashboard walkthrough', async ({ page }, info) => {
  info.annotations.push({ type: 'capability', description: 'pathology-dashboard' });

  await page.goto('/');
  await page.waitForLoadState('networkidle').catch(() => {});
  await shot(page, info, 'Home dashboard');

  if (await go(page, '/PathologyDashboard')) await shot(page, info, "Pathology dashboard");

  await saveWalkthrough(page, info);
});
