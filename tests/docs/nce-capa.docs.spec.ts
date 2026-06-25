// Docs-capture flow for capability `nce-capa` — Non-conforming events (NCE) & CAPA.
//   BASE=https://testing.openelis-global.org npx playwright test --project=docs tests/docs/nce-capa.docs.spec.ts
import { test } from '@playwright/test';
import { go, shot, saveWalkthrough, DEFAULT_PII } from './capture';

test('User manual — Non-conforming events (NCE) & CAPA walkthrough', async ({ page }, info) => {
  info.annotations.push({ type: 'capability', description: 'nce-capa' });

  await page.goto('/');
  await page.waitForLoadState('networkidle').catch(() => {});
  await shot(page, info, 'Home dashboard');

  if (await go(page, '/NceDashboard')) await shot(page, info, "All non-conforming events");
  if (await go(page, '/ReportNonConformingEvent')) await shot(page, info, "Report a non-conforming event");
  if (await go(page, '/NCECorrectiveAction')) await shot(page, info, "Corrective actions");

  await saveWalkthrough(page, info);
});
