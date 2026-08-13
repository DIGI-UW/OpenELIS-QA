// Docs-capture flow for capability `cytology-dashboard` — Cytology dashboard.
//   BASE=https://testing.openelis-global.org npx playwright test --project=docs tests/docs/cytology-dashboard.docs.spec.ts
import { test } from '@playwright/test';
import { go, shot, saveWalkthrough, DEFAULT_PII } from './capture';

test('User manual — Cytology dashboard walkthrough', async ({ page }, info) => {
  info.annotations.push({ type: 'capability', description: 'cytology-dashboard' });

  await page.goto('/');
  await page.waitForLoadState('networkidle').catch(() => {});
  await shot(page, info, 'Home dashboard');

  if (await go(page, '/CytologyDashboard')) await shot(page, info, "Cytology dashboard");

  await saveWalkthrough(page, info);
});
