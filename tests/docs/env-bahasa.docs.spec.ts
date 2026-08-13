// Environmental workflow captured in the Indonesia (Bahasa) locale: harvest labels + screenshots + video.
import { test } from '@playwright/test';
import { go, shot, settle, saveWalkthrough, DEFAULT_PII } from './capture';

async function setBahasa(page: any) {
  await go(page, '/');
  await page.selectOption('#selector', { label: 'Indonesia' }).catch(() => {});
  await page.waitForTimeout(2500);
}
async function dump(page: any, label: string) {
  const t = await page.evaluate(() => ({
    heads: [...document.querySelectorAll('h1,h2,h3')].map(e => (e.textContent || '').trim()).filter(Boolean).slice(0, 8),
    labels: [...document.querySelectorAll('label')].map(l => (l.textContent || '').trim()).filter(x => x && !/Select Locale|Version/.test(x)).slice(0, 30),
    btns: [...document.querySelectorAll('button')].map(b => (b.textContent || '').trim()).filter(b => b && !/Video|Release Notes|Reload|Subscribe|Mark all|Show read/.test(b)).slice(0, 20),
  }));
  console.log('DUMP', label, JSON.stringify(t));
}
async function pickUnitWithRows(page: any) {
  if (!(await page.locator('#unitType').count())) return;
  const opts = (await page.locator('#unitType option').allTextContents()).map((s: string) => s.trim()).filter(Boolean);
  for (const u of opts) {
    await page.selectOption('#unitType', { label: u }).catch(() => {});
    await page.waitForTimeout(1800);
    if (await page.locator('table tbody tr').count() > 0) { console.log('UNIT_WITH_ROWS', u); return u; }
  }
}

test('env bahasa capture', async ({ page }, info) => {
  test.setTimeout(150000);
  info.annotations.push({ type: 'capability', description: 'env-bahasa' });
  await setBahasa(page);
  await go(page, '/order/environmental/enter'); await settle(page);
  await dump(page, 'EnterOrder');
  await shot(page, info, 'Enter Order', { fullPage: true, maskPii: DEFAULT_PII });
  await go(page, '/LogbookResults?type='); await settle(page);
  await pickUnitWithRows(page);
  await dump(page, 'ResultsByUnit');
  await shot(page, info, 'Results by Unit', { maskPii: DEFAULT_PII });
  await go(page, '/ResultValidation?type=&test='); await settle(page);
  await pickUnitWithRows(page);
  await dump(page, 'Validation');
  await shot(page, info, 'Validation', { maskPii: DEFAULT_PII });
  await saveWalkthrough(page, info);
});
