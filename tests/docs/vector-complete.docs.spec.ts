// Capture the Complete confirmation for the order that was advanced to Complete (route-addressable).
//   BASE=https://indonesiademo.openelis-global.org npx playwright test --project=docs tests/docs/vector-complete.docs.spec.ts
import { test } from '@playwright/test';
import { go, shot, saveWalkthrough } from './capture';

test('User manual — Vector order Complete', async ({ page }, info) => {
  info.annotations.push({ type: 'capability', description: 'vector-order-complete' });
  if (await go(page, '/order/vector/complete?labNumber=DEV01260000000000026')) {
    await page.waitForTimeout(1200);
    await shot(page, info, 'Complete stage', { fullPage: false });
  }
  await saveWalkthrough(page, info);
});
