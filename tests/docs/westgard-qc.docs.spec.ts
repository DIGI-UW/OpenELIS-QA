// Docs-capture flow for capability `westgard-qc` — Westgard QC rules & dashboard.
//   BASE=https://testing.openelis-global.org npx playwright test --project=docs tests/docs/westgard-qc.docs.spec.ts
import { test } from '@playwright/test';
import { go, shot, saveWalkthrough, DEFAULT_PII } from './capture';

test('User manual — Westgard QC rules & dashboard walkthrough', async ({ page }, info) => {
  info.annotations.push({ type: 'capability', description: 'westgard-qc' });

  await page.goto('/');
  await page.waitForLoadState('networkidle').catch(() => {});
  await shot(page, info, 'Home dashboard');

  if (await go(page, '/analyzers/qc/db')) await shot(page, info, "QC dashboard");
  if (await go(page, '/analyzers/qc/rule-config')) await shot(page, info, "Westgard rule configuration");
  if (await go(page, '/analyzers/qc/control-lots')) await shot(page, info, "QC control lots");

  await saveWalkthrough(page, info);
});
