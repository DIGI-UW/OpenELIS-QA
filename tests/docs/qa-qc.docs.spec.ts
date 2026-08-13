// Docs-capture flow for capability `qa-qc` — Quality Assurance and Statistical QC.
//   BASE=https://testing.openelis-global.org npx playwright test --project=docs tests/docs/qa-qc.docs.spec.ts
import { test } from '@playwright/test';
import { go, shot, saveWalkthrough, DEFAULT_PII } from './capture';

test('User manual — Quality Assurance and Statistical QC walkthrough', async ({ page }, info) => {
  info.annotations.push({ type: 'capability', description: 'qa-qc' });

  await page.goto('/');
  await page.waitForLoadState('networkidle').catch(() => {});
  await shot(page, info, 'Home dashboard');

  if (await go(page, '/qa/overview')) await shot(page, info, "QA Overview");
  if (await go(page, '/qa/qc/dashboard')) await shot(page, info, "QC Dashboard");
  if (await go(page, '/qa/qc/alerts')) await shot(page, info, "QC Alerts");
  if (await go(page, '/qa/qc/control-lots')) await shot(page, info, "QC Lot Management");
  if (await go(page, '/qa/qc/rule-config')) await shot(page, info, "Westgard rule configuration");
  if (await go(page, '/qa/qi/dashboard')) await shot(page, info, "QI Dashboard");
  if (await go(page, '/qa/qi/config')) await shot(page, info, "QI Configuration");

  await saveWalkthrough(page, info);
});
