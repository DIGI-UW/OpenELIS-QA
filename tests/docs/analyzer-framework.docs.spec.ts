// Docs-capture flow for capability `analyzer-framework` — Analyzer integration framework.
//   BASE=https://testing.openelis-global.org npx playwright test --project=docs tests/docs/analyzer-framework.docs.spec.ts
import { test } from '@playwright/test';
import { go, shot, saveWalkthrough, DEFAULT_PII } from './capture';

test('User manual — Analyzer integration framework walkthrough', async ({ page }, info) => {
  info.annotations.push({ type: 'capability', description: 'analyzer-framework' });

  await page.goto('/');
  await page.waitForLoadState('networkidle').catch(() => {});
  await shot(page, info, 'Home dashboard');

  if (await go(page, '/analyzers')) await shot(page, info, "Analyzers list");
  if (await go(page, '/analyzers/types')) await shot(page, info, "Analyzer types");
  if (await go(page, '/analyzers/errors')) await shot(page, info, "Analyzer error dashboard");

  await saveWalkthrough(page, info);
});
