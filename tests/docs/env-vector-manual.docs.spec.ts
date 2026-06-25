// Docs-capture flows for the Environmental & Vector Surveillance manual pages.
// Route-landing screenshots (one PNG per route) + a walkthrough video per capability.
//   BASE=https://indonesiademo.openelis-global.org npx playwright test --project=docs tests/docs/env-vector-manual.docs.spec.ts
import { test } from '@playwright/test';
import { go, shot, saveWalkthrough } from './capture';

test('User manual — Environmental Surveillance walkthrough', async ({ page }, info) => {
  info.annotations.push({ type: 'capability', description: 'environmental-surveillance' });
  await page.goto('/');
  await page.waitForLoadState('networkidle').catch(() => {});
  await shot(page, info, 'Home dashboard');
  if (await go(page, '/EnvironmentalDashboard')) await shot(page, info, 'Environmental dashboard');
  if (await go(page, '/order/environmental/enter')) await shot(page, info, 'Add environmental order — entry form');
  if (await go(page, '/order/environmental/label')) await shot(page, info, 'Environmental order — label and store');
  if (await go(page, '/order/environmental/qa')) await shot(page, info, 'Environmental order — QA review');
  if (await go(page, '/LogbookResults?type=')) await shot(page, info, 'Results by unit — compliance evaluation');
  if (await go(page, '/ResultValidation?type=&test=')) await shot(page, info, 'Validation — routine');
  await saveWalkthrough(page, info);
});

test('User manual — Vector Surveillance walkthrough', async ({ page }, info) => {
  info.annotations.push({ type: 'capability', description: 'vector-surveillance' });
  await page.goto('/');
  await page.waitForLoadState('networkidle').catch(() => {});
  await shot(page, info, 'Home dashboard');
  if (await go(page, '/order/vector/enter')) await shot(page, info, 'Add vector order — entry form');
  if (await go(page, '/order/vector/label')) await shot(page, info, 'Vector order — label and store');
  if (await go(page, '/order/vector/qa')) await shot(page, info, 'Vector order — QA review');
  if (await go(page, '/vector/identification')) await shot(page, info, 'Vector identification worklist');
  await saveWalkthrough(page, info);
});

test('User manual — Admin: Compliance Standards & Holding-Time walkthrough', async ({ page }, info) => {
  info.annotations.push({ type: 'capability', description: 'admin-compliance-standards' });
  await page.goto('/');
  await page.waitForLoadState('networkidle').catch(() => {});
  await shot(page, info, 'Home dashboard');
  if (await go(page, '/MasterListsPage/testManagementConfigMenu')) await shot(page, info, 'Test Management configuration menu');
  if (await go(page, '/MasterListsPage/TestModifyEntry')) await shot(page, info, 'Modify tests — holding time configuration');
  await saveWalkthrough(page, info);
});

test('User manual — Admin: Vector Surveillance Reference Data walkthrough', async ({ page }, info) => {
  info.annotations.push({ type: 'capability', description: 'admin-vector-reference-data' });
  await page.goto('/');
  await page.waitForLoadState('networkidle').catch(() => {});
  await shot(page, info, 'Home dashboard');
  if (await go(page, '/MasterListsPage/vectorSurveillanceSetup/species')) await shot(page, info, 'Species reference list');
  if (await go(page, '/MasterListsPage/vectorSurveillanceSetup/trap-types')) await shot(page, info, 'Trap Types reference list');
  if (await go(page, '/MasterListsPage/vectorSurveillanceSetup/sampling-sites')) await shot(page, info, 'Sampling Sites reference list');
  if (await go(page, '/MasterListsPage/SampleTypeManagement')) await shot(page, info, 'Manage Sample Types');
  await saveWalkthrough(page, info);
});
