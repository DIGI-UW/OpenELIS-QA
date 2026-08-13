// Docs-capture flow for capability `ihc-dashboard` — Immunohistochemistry dashboard.
//   BASE=https://testing.openelis-global.org npx playwright test --project=docs tests/docs/ihc-dashboard.docs.spec.ts
import { test } from '@playwright/test';
import { go, shot, saveWalkthrough, DEFAULT_PII } from './capture';

test('User manual — Immunohistochemistry dashboard walkthrough', async ({ page }, info) => {
  info.annotations.push({ type: 'capability', description: 'ihc-dashboard' });

  await page.goto('/');
  await page.waitForLoadState('networkidle').catch(() => {});
  await shot(page, info, 'Home dashboard');

  if (await go(page, '/ImmunohistochemistryDashboard')) await shot(page, info, "IHC dashboard");

  await saveWalkthrough(page, info);
});
