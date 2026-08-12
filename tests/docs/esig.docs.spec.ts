// Docs-capture for the Electronic Signatures workflow (testing.openelis-global.org).
// Requires electronicSignatureEnabled=true at run time. Captures the enable screen and the real
// certification dialog. Does NOT enter a password / complete the sign.
//   BASE=https://testing.openelis-global.org npx playwright test --project=docs tests/docs/esig.docs.spec.ts
import { test } from '@playwright/test';
import { go } from './capture';
import fs from 'fs';
import path from 'path';

const DIR = 'docs-media/esig';
fs.mkdirSync(DIR, { recursive: true });
const ACC = process.env.ESIG_ACC || 'DEV01260000000000001';
async function shot(page: any, f: string) {
  await page.screenshot({ path: path.join(DIR, f), animations: 'disabled' });
}

test('Enable electronic signatures (Site Information edit)', async ({ page }) => {
  await go(page, '/MasterListsPage/SiteInformationMenu');
  await page.getByRole('heading', { name: /site information/i }).first().waitFor({ timeout: 30000 }).catch(() => {});
  const row = page.getByRole('row', { name: /electronicSignatureEnabled/i }).first();
  await row.scrollIntoViewIfNeeded().catch(() => {});
  await row.locator('input[type=radio]').click({ force: true }).catch(() => {});
  await page.getByRole('button', { name: /^\s*modify\s*$/i }).first().click({ force: true }).catch(() => {});
  await page.getByText(/Edit Record/i).first().waitFor({ timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(700);
  await shot(page, '01-enable-esig.png');
});

test('Electronic signature certification dialog', async ({ page }) => {
  await go(page, `/result?type=order&doRange=false&accessionNumber=${ACC}`);
  await page.getByText(/CD4 percent/i).first().waitFor({ timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1000);
  // Enter a value in the CD4 percent result row so Save is active, then Save -> certify dialog.
  const row = page.getByRole('row', { name: /CD4 percent/i }).first();
  await row.locator('input').last().fill('45').catch(() => {});
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /^\s*save\s*$/i }).first().click({ force: true }).catch(() => {});
  await page.getByText(/Electronic Signature Certification/i).first().waitFor({ timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(700);
  await shot(page, '02-esig-certify-dialog.png');
  // do NOT enter a password; cancel
  await page.getByRole('button', { name: /^\s*cancel\s*$/i }).first().click({ force: true }).catch(() => {});
});
