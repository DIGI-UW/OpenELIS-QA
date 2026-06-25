// Docs-capture flow for capability `patient-order-enhancements` — Patient & order enhancements.
//   BASE=https://testing.openelis-global.org npx playwright test --project=docs tests/docs/patient-order-enhancements.docs.spec.ts
import { test } from '@playwright/test';
import { go, shot, saveWalkthrough, DEFAULT_PII } from './capture';

test('User manual — Patient & order enhancements walkthrough', async ({ page }, info) => {
  info.annotations.push({ type: 'capability', description: 'patient-order-enhancements' });

  await page.goto('/');
  await page.waitForLoadState('networkidle').catch(() => {});
  await shot(page, info, 'Home dashboard');

  if (await go(page, '/PatientManagement')) await shot(page, info, "Add / edit patient");
  if (await go(page, '/PatientHistory')) await shot(page, info, "Patient history");

  await saveWalkthrough(page, info);
});
