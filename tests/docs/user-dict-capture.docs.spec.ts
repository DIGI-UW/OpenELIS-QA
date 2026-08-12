// Capture the User Management and Dictionary add forms (raw, no dismissModals).
import { test } from '@playwright/test';
import { go } from './capture';
import path from 'path';
import fs from 'fs';

const dir = 'docs-media/user-dict';
fs.mkdirSync(dir, { recursive: true });

test('user + dict add forms', async ({ page }, info) => {
  test.setTimeout(90000);
  await go(page, '/MasterListsPage/userManagement');
  await page.getByRole('button', { name: 'Add', exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(1600);
  console.log('USER_HEADS', JSON.stringify((await page.locator('h1,h2,h3').allTextContents()).map(s => s.trim()).filter(Boolean).slice(0, 8)));
  console.log('USER_LABELS', JSON.stringify((await page.locator('label').allTextContents()).map(s => s.trim()).filter(x => x && !/Locale|Versi/.test(x)).slice(0, 24)));
  await page.screenshot({ path: path.join(dir, 'user-add.png'), fullPage: true, animations: 'disabled' });

  await go(page, '/MasterListsPage/DictionaryMenu');
  await page.getByRole('button', { name: 'Add', exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(1600);
  console.log('DICT_HEADS', JSON.stringify((await page.locator('h1,h2,h3').allTextContents()).map(s => s.trim()).filter(Boolean).slice(0, 8)));
  console.log('DICT_LABELS', JSON.stringify((await page.locator('label').allTextContents()).map(s => s.trim()).filter(x => x && !/Locale|Versi/.test(x)).slice(0, 20)));
  await page.screenshot({ path: path.join(dir, 'dict-add.png'), fullPage: false, animations: 'disabled' });
});
