// Docs-capture flow for capability `analyzer-file-import` — Analyzer file import.
//   BASE=https://testing.openelis-global.org npx playwright test --project=docs tests/docs/analyzer-file-import.docs.spec.ts
import { test } from '@playwright/test';
import { go, shot, saveWalkthrough, DEFAULT_PII } from './capture';

test('User manual — Analyzer file import walkthrough', async ({ page }, info) => {
  info.annotations.push({ type: 'capability', description: 'analyzer-file-import' });

  await page.goto('/');
  await page.waitForLoadState('networkidle').catch(() => {});
  await shot(page, info, 'Home dashboard');

  if (await go(page, '/analyzers')) await shot(page, info, "Analyzers list");
  if (await go(page, '/GenericSample/Import')) await shot(page, info, "Import samples / results");

  await saveWalkthrough(page, info);
});
