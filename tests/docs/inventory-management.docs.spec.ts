// Docs-capture flow for capability `inventory-management` — Built-in reagent & lot inventory (OGC-64).
//   BASE=https://indonesiademo.openelis-global.org npx playwright test --project=docs tests/docs/inventory-management.docs.spec.ts
import { test } from '@playwright/test';
import { go, shot, saveWalkthrough, DEFAULT_PII } from './capture';

test('Website — Inventory management walkthrough', async ({ page }, info) => {
  info.annotations.push({ type: 'capability', description: 'inventory-management' });
  await page.goto('/');
  await page.waitForLoadState('networkidle').catch(() => {});
  // Force English locale for marketing shots (defends against Bahasa flip from prior env-bahasa runs)
  await page.selectOption('#selector', { label: 'English' }).catch(() => {});
  await page.waitForTimeout(1500);
  await shot(page, info, 'Home dashboard');
  if (await go(page, '/inventory')) await shot(page, info, 'Inventory dashboard');
  await saveWalkthrough(page, info);
});
