// Docs-capture flow for capability `instrument-library` — Validated instrument library.
//   BASE=https://testing.openelis-global.org npx playwright test --project=docs tests/docs/instrument-library.docs.spec.ts
import { test } from '@playwright/test';
import { go, shot, saveWalkthrough, DEFAULT_PII } from './capture';

test('User manual — Validated instrument library walkthrough', async ({ page }, info) => {
  info.annotations.push({ type: 'capability', description: 'instrument-library' });

  await page.goto('/');
  await page.waitForLoadState('networkidle').catch(() => {});
  await shot(page, info, 'Home dashboard');

  if (await go(page, '/analyzers')) await shot(page, info, "Analyzers list");
  if (await go(page, '/analyzers/types')) await shot(page, info, "Analyzer types library");

  await saveWalkthrough(page, info);
});
