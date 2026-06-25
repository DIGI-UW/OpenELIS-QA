// Docs-capture flow for capability `barcode-labels` — Barcode label management.
//   BASE=https://testing.openelis-global.org npx playwright test --project=docs tests/docs/barcode-labels.docs.spec.ts
import { test } from '@playwright/test';
import { go, shot, saveWalkthrough, DEFAULT_PII } from './capture';

test('User manual — Barcode label management walkthrough', async ({ page }, info) => {
  info.annotations.push({ type: 'capability', description: 'barcode-labels' });

  await page.goto('/');
  await page.waitForLoadState('networkidle').catch(() => {});
  await shot(page, info, 'Home dashboard');

  if (await go(page, '/PrintBarcode')) await shot(page, info, "Print barcode labels");

  await saveWalkthrough(page, info);
});
