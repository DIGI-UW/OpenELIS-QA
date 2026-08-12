import { test } from '@playwright/test';
import { go, shot, settle, DEFAULT_PII } from './capture';
import path from 'path'; import fs from 'fs';
const dir = 'docs-media/patient-mgmt'; fs.mkdirSync(dir, { recursive: true });
test('patient management', async ({ page }, info) => {
  info.annotations.push({ type: 'capability', description: 'patient-mgmt' });
  await go(page, '/PatientManagement'); await settle(page);
  const d = await page.evaluate(() => ({
    heads: [...document.querySelectorAll('h1,h2,h3')].map(e => (e.textContent || '').trim()).filter(Boolean).slice(0, 6),
    labels: [...document.querySelectorAll('label')].map(l => (l.textContent || '').trim()).filter(x => x && !/Locale|Versi/.test(x)).slice(0, 20),
    btns: [...document.querySelectorAll('button')].map(b => (b.textContent || '').trim()).filter(b => b && !/User Manual|Video|Release|Reload|Subscribe|Mark all|Show read/.test(b)).slice(0, 12),
  }));
  console.log('PM', JSON.stringify(d));
  await page.screenshot({ path: path.join(dir, '01-patient-management.png'), fullPage: true, animations: 'disabled' });
});
