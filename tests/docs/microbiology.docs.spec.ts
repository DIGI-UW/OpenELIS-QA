// Docs-capture flow for capability `microbiology` — Microbiology case workbench (AMR).
//   BASE=https://testing.openelis-global.org npx playwright test --project=docs tests/docs/microbiology.docs.spec.ts
import { test } from '@playwright/test';
import { go, shot, saveWalkthrough, DEFAULT_PII } from './capture';

test('User manual — Microbiology case workbench (AMR) walkthrough', async ({ page }, info) => {
  info.annotations.push({ type: 'capability', description: 'microbiology' });

  await page.goto('/');
  await page.waitForLoadState('networkidle').catch(() => {});
  await shot(page, info, 'Home dashboard');

  if (await go(page, '/Microbiology/worklist?workflow=BACTERIOLOGY&sort=newest')) await shot(page, info, "Microbiology worklist");
  if (await go(page, '/Microbiology/cases/d8d9e6b0-37a5-43b6-b7c1-18b087536d6d?section=info')) await shot(page, info, "Case overview");
  if (await go(page, '/Microbiology/cases/d8d9e6b0-37a5-43b6-b7c1-18b087536d6d?section=setup')) await shot(page, info, "Culture setup");
  if (await go(page, '/Microbiology/cases/d8d9e6b0-37a5-43b6-b7c1-18b087536d6d?section=timeline')) await shot(page, info, "Case timeline");
  if (await go(page, '/Microbiology/cases/d8d9e6b0-37a5-43b6-b7c1-18b087536d6d?section=isolates')) await shot(page, info, "Isolates");
  if (await go(page, '/Microbiology/cases/d8d9e6b0-37a5-43b6-b7c1-18b087536d6d?section=ast')) await shot(page, info, "Manual AST results");
  if (await go(page, '/Microbiology/cases/d8d9e6b0-37a5-43b6-b7c1-18b087536d6d?section=critical')) await shot(page, info, "Critical communication");
  if (await go(page, '/Microbiology/cases/d8d9e6b0-37a5-43b6-b7c1-18b087536d6d?section=reports')) await shot(page, info, "Report release");

  await saveWalkthrough(page, info);
});
