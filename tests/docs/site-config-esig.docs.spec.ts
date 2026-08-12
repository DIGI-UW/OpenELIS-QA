// Docs-capture for the "Site Information, Menu Configuration & Electronic Signatures" page refresh
// (testing.openelis-global.org). Route-based viewport shots written directly.
//   BASE=https://testing.openelis-global.org npx playwright test --project=docs tests/docs/site-config-esig.docs.spec.ts
import { test } from '@playwright/test';
import { go } from './capture';
import fs from 'fs';
import path from 'path';

const DIR = 'docs-media/site-config-esig';
fs.mkdirSync(DIR, { recursive: true });
async function shot(page: any, f: string) {
  await page.screenshot({ path: path.join(DIR, f), animations: 'disabled' });
}

test('Site Information property table', async ({ page }) => {
  await go(page, '/MasterListsPage/SiteInformationMenu');
  await page.getByRole('heading', { name: /site information/i }).first().waitFor({ timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(600);
  await shot(page, '01-site-information.png');
});

test('Global Menu Configuration tree', async ({ page }) => {
  await go(page, '/MasterListsPage/globalMenuManagement');
  await page.getByRole('heading', { name: /global menu management/i }).first().waitFor({ timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(600);
  await shot(page, '02-menu-configuration.png');
});

test('Result Validation (where e-signature applies)', async ({ page }) => {
  await go(page, '/ResultValidation?type=&test=');
  await page.waitForTimeout(1500);
  await shot(page, '03-result-validation.png');
});
