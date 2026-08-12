// Capture the Provider add form with a RAW screenshot (no dismissModals, which was closing it).
import { test } from '@playwright/test';
import { go } from './capture';
import path from 'path';

test('provider add form raw', async ({ page }, info) => {
  await go(page, '/MasterListsPage/providerMenu');
  await page.getByRole('button', { name: 'Add', exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(1500);
  const dir = 'docs-media/provider-mgmt';
  await page.screenshot({ path: path.join(dir, '02-add-provider-form.png'), fullPage: true, animations: 'disabled' });
  // report what's on screen now
  const heads = await page.locator('h1,h2,h3').allTextContents();
  console.log('HEADINGS', JSON.stringify(heads.map(s => s.trim()).filter(Boolean)));
});
