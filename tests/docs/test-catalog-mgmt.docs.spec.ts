// Docs-capture flow for capability `test-catalog-mgmt` — Test Catalog Management.
//   BASE=https://testing.openelis-global.org npx playwright test --project=docs tests/docs/test-catalog-mgmt.docs.spec.ts
import { test } from '@playwright/test';
import { go, shot, saveWalkthrough, DEFAULT_PII } from './capture';

test('User manual — Test Catalog Management walkthrough', async ({ page }, info) => {
  info.annotations.push({ type: 'capability', description: 'test-catalog-mgmt' });

  await page.goto('/');
  await page.waitForLoadState('networkidle').catch(() => {});
  await shot(page, info, 'Home dashboard');

  if (await go(page, '/admin/TestCatalogList?page=1&pageSize=25')) await shot(page, info, "Test Catalog list view");
  if (await go(page, '/MasterListsPage/TestCatalogEditor/5/basic-info')) await shot(page, info, "Editor Basic Info");
  if (await go(page, '/MasterListsPage/TestCatalogEditor/5/sample-results')) await shot(page, info, "Editor Sample and Results");
  if (await go(page, '/MasterListsPage/TestCatalogEditor/5/methods')) await shot(page, info, "Editor Methods");
  if (await go(page, '/MasterListsPage/TestCatalogEditor/5/ranges')) await shot(page, info, "Editor Ranges");
  if (await go(page, '/MasterListsPage/TestCatalogEditor/5/storage')) await shot(page, info, "Editor Sample Storage");
  if (await go(page, '/MasterListsPage/TestCatalogEditor/5/panels')) await shot(page, info, "Editor Panels");
  if (await go(page, '/MasterListsPage/TestCatalogEditor/5/labels')) await shot(page, info, "Editor Labels");
  if (await go(page, '/MasterListsPage/TestCatalogEditor/5/terminology')) await shot(page, info, "Editor Terminology");
  if (await go(page, '/MasterListsPage/TestCatalogEditor/5/reagents')) await shot(page, info, "Editor Reagents");
  if (await go(page, '/MasterListsPage/TestCatalogEditor/5/analyzers')) await shot(page, info, "Editor Analyzers");
  if (await go(page, '/MasterListsPage/TestCatalogEditor/5/alerts')) await shot(page, info, "Editor Alerts");
  if (await go(page, '/MasterListsPage/TestCatalogEditor/5/reflex-calc')) await shot(page, info, "Editor Reflex and Calc");
  if (await go(page, '/MasterListsPage/TestCatalogEditor/5/display-order')) await shot(page, info, "Editor Display Order");
  if (await go(page, '/MasterListsPage/TestCatalogEditor/5/localization')) await shot(page, info, "Editor Localization");

  await saveWalkthrough(page, info);
});
