// Docs-capture flow for capability `results-entry` — Results entry.
//   BASE=https://testing.openelis-global.org npx playwright test --project=docs tests/docs/results-entry.docs.spec.ts
import { test } from '@playwright/test';
import { go, shot, saveWalkthrough, DEFAULT_PII } from './capture';

test('User manual — Results entry walkthrough', async ({ page }, info) => {
  info.annotations.push({ type: 'capability', description: 'results-entry' });
  const pii = ["td:has-text(\"0123456\")"];

  await page.goto('/');
  await page.waitForLoadState('networkidle').catch(() => {});
  await shot(page, info, 'Home dashboard');

  if (await go(page, '/GenericSample/Results')) await shot(page, info, "Enter results — search", { maskPii: [...DEFAULT_PII, ...pii] });
  if (await go(page, '/LogbookResults?type=')) await shot(page, info, "Results by unit", { maskPii: [...DEFAULT_PII, ...pii] });
  if (await go(page, '/PatientResults')) await shot(page, info, "Results by patient", { maskPii: [...DEFAULT_PII, ...pii] });
  if (await go(page, '/AccessionResults')) await shot(page, info, "Results by order", { maskPii: [...DEFAULT_PII, ...pii] });

  await saveWalkthrough(page, info);
});
