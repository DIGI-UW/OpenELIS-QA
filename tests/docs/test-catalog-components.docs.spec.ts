// Docs-capture: multi-component tests, interpretations, copy-configuration.
// Non-destructive: stages UI state and screenshots it, never Saves.
import { test } from '@playwright/test';
import { go, shot, saveWalkthrough } from './capture';

test('User manual — Test Catalog result components walkthrough', async ({ page }, info) => {
  info.annotations.push({ type: 'capability', description: 'test-catalog-components' });
  const step = async (name, fn) => {
    try { await fn(); } catch (e) { console.log('STEP SKIPPED: ' + name + ' :: ' + String(e).slice(0, 200)); }
  };

  await go(page, '/MasterListsPage/TestCatalogEditor/5/sample-results');
  await page.waitForTimeout(2500);
  await shot(page, info, 'Single component with result entry preview');

  await step('advanced types', async () => {
    await page.getByRole('button', { name: /advanced \/ legacy types/i }).first().click();
    await page.waitForTimeout(900);
    await shot(page, info, 'All result types including advanced');
  });

  await step('interpretation', async () => {
    await page.getByRole('button', { name: /add interpretation/i }).first().click();
    await page.waitForTimeout(900);
    await shot(page, info, 'Adding an interpretation with severity');
  });

  // Second component — the key figure for documenting multi-component tests.
  await step('add component', async () => {
    await page.getByRole('button', { name: /^add component$/i }).first().click();
    await page.waitForTimeout(1800);
    await shot(page, info, 'A second result component added');
    await page.mouse.wheel(0, 1400);
    await page.waitForTimeout(700);
    await shot(page, info, 'Two components side by side');
  });

  await step('copy from test', async () => {
    await page.getByRole('button', { name: /copy from test/i }).first().click();
    await page.waitForTimeout(1400);
    await shot(page, info, 'Copy configuration from another test');
  });

  await saveWalkthrough(page, info);
});
