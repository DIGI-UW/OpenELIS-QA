// Docs-capture for the two Test Catalog manual corrections (modal states the route shots miss):
//  1. Basic Info → the "Change test domain?" confirmation dialog
//  2. Methods    → the "Link Method" modal with the REQUIRED Effective Date filled
// Interactive + does NOT persist (cancels out of both dialogs) per harness convention.
// shot() runs dismissModals() which would close our dialog, so we screenshot the viewport directly.
//   npx playwright test --project=docs tests/docs/test-catalog-modals.docs.spec.ts
import { test } from '@playwright/test';
import { go } from './capture';
import fs from 'fs';
import path from 'path';

const TID = process.env.OE_TESTID || '5';            // Amylase (Clinical) on testing
const DIR = 'docs-media/test-catalog-modals';
fs.mkdirSync(DIR, { recursive: true });
async function rawShot(page: any, file: string) {
  await page.screenshot({ path: path.join(DIR, file), animations: 'disabled' });
}

test('Test Catalog — Change test domain confirmation dialog', async ({ page }) => {
  await go(page, `/MasterListsPage/TestCatalogEditor/${TID}/basic-info`);
  await page.getByRole('heading', { name: /basic info/i }).first().waitFor({ timeout: 30000 }).catch(() => {});
  // Select a different Domain radio → opens the confirm dialog (do NOT confirm).
  await page.locator('label[for="domain-ENVIRONMENTAL"] .cds--radio-button__label-text')
    .click({ timeout: 8000 }).catch(() => {});
  await page.getByRole('dialog', { name: /change test domain/i }).waitFor({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(500);
  await rawShot(page, '01-change-domain-dialog.png');
  await page.getByRole('dialog').getByRole('button', { name: /cancel/i }).first().click().catch(() => {});
});

test('Test Catalog — Link Method modal with required Effective Date', async ({ page }) => {
  await go(page, `/MasterListsPage/TestCatalogEditor/${TID}/methods`);
  await page.getByRole('heading', { name: /methods/i }).first().waitFor({ timeout: 30000 }).catch(() => {});
  await page.getByRole('button', { name: /\+\s*Link Method/i }).first().click({ force: true }).catch(() => {});
  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ timeout: 8000 }).catch(() => {});
  // Pick a method so the modal is representative (trusted center-click for the Carbon ComboBox).
  const combo = dialog.getByRole('combobox').first();
  let b = await combo.boundingBox(); if (b) await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await page.waitForTimeout(400);
  const opt = page.getByRole('option').first();
  let ob = await opt.boundingBox(); if (ob) await page.mouse.click(ob.x + ob.width / 2, ob.y + ob.height / 2);
  await page.waitForTimeout(300);
  // Fill the REQUIRED Effective Date (the gotcha the manual now documents).
  const date = dialog.locator('input[placeholder*="YYYY" i], input[placeholder*="-MM-" i], input[placeholder*="mm/dd" i]').first();
  await date.fill('2026-06-29').catch(() => {});
  await page.waitForTimeout(400);
  await rawShot(page, '02-link-method-modal.png');
  await dialog.getByRole('button', { name: /cancel/i }).first().click().catch(() => {});
});
