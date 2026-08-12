// Docs-capture flow for capability `audit-trail` — System-level audit trail.
//   BASE=https://testing.openelis-global.org npx playwright test --project=docs tests/docs/audit-trail.docs.spec.ts
import { test } from '@playwright/test';
import { go, shot, saveWalkthrough, DEFAULT_PII } from './capture';

test('User manual — System-level audit trail walkthrough', async ({ page }, info) => {
  info.annotations.push({ type: 'capability', description: 'audit-trail' });

  await page.goto('/');
  await page.waitForLoadState('networkidle').catch(() => {});
  await shot(page, info, 'Home dashboard');

  if (await go(page, '/AuditTrailReport?type=system')) await shot(page, info, "System events audit trail");
  if (await go(page, '/AuditTrailReport?type=order')) await shot(page, info, "Order events audit trail");

  await saveWalkthrough(page, info);
});
