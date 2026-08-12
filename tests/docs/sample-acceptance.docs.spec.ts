// Docs-capture for the Sample Acceptance Checklist manual (OGC-580) on indonesiademo (demo-silnas).
// Config screens are route-based; the QA-Review intake-acceptance shot resumes an in-progress order
// by its lab number. Screenshots written directly (no dismissModals — we want the live panels shown).
//   BASE=https://indonesiademo.openelis-global.org npx playwright test --project=docs tests/docs/sample-acceptance.docs.spec.ts
import { test } from '@playwright/test';
import { go } from './capture';
import fs from 'fs';
import path from 'path';

const LAB = process.env.SAC_LAB || 'DEV01260000000000074';
const DIR = 'docs-media/sample-acceptance-checklist';
fs.mkdirSync(DIR, { recursive: true });
async function shot(page: any, f: string, full = true) {
  await page.screenshot({ path: path.join(DIR, f), fullPage: full, animations: 'disabled' });
}

test('SAC config — All domains', async ({ page }) => {
  await go(page, '/MasterListsPage/SampleAcceptanceChecklist/all');
  await page.getByText(/Lab-wide items/i).first().waitFor({ timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(600);
  await shot(page, '01-config-all-domains.png');
});

test('SAC config — Clinical enforcement', async ({ page }) => {
  await go(page, '/MasterListsPage/SampleAcceptanceChecklist/clinical');
  await page.getByText(/Checklist enforcement/i).first().waitFor({ timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(600);
  await shot(page, '02-config-clinical-enforcement.png');
});

test('SAC QA Review — intake acceptance', async ({ page }) => {
  await go(page, '/order/clinical/qa');
  const search = page.getByPlaceholder(/scan barcode or enter lab number/i).first();
  if (await search.count()) {
    await search.fill(LAB);
    await search.press('Enter');
    await page.waitForTimeout(3000);
  }
  await page.getByText(/Intake Acceptance/i).first().waitFor({ timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(600);
  await shot(page, '03-qa-review-intake-acceptance.png');
  // Show the gate releasing: mark the first item Pass, capture the enabled Accept state.
  const pass = page.getByText(/^Pass$/).first();
  if (await pass.count()) {
    await pass.click({ force: true }).catch(() => {});
    await page.waitForTimeout(800);
    await shot(page, '04-qa-accept-enabled.png');
  }
});
