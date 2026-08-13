// Vector workflow + Laporan Hasil in Bahasa: harvest labels + screenshots + video.
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
    labels: [...document.querySelectorAll('label')].map(l => (l.textContent || '').trim()).filter(x => x && !/Select Locale|Pilih Lokal|Versi/.test(x)).slice(0, 30),
    btns: [...document.querySelectorAll('button')].map(b => (b.textContent || '').trim()).filter(b => b && !/Video|Catatan rilis|Panduan|Reload|Subscribe|Mark all|Show read|Berlangganan/.test(b)).slice(0, 18),
    ths: [...document.querySelectorAll('th')].map(x => (x.textContent || '').trim()).filter(Boolean).slice(0, 12),
  }));
  console.log('DUMP', label, JSON.stringify(t));
}

test('vector + laporan bahasa', async ({ page }, info) => {
  test.setTimeout(150000);
  info.annotations.push({ type: 'capability', description: 'vector-bahasa' });
  await setBahasa(page);
  await go(page, '/order/vector/enter'); await settle(page);
  await dump(page, 'VectorEnterOrder');
  await shot(page, info, 'Vector Enter Order', { fullPage: true, maskPii: DEFAULT_PII });
  await go(page, '/vector/identification'); await settle(page);
  await dump(page, 'VectorIdentification');
  await shot(page, info, 'Vector Identification', { maskPii: DEFAULT_PII });
  await go(page, '/LaporanHasil'); await settle(page);
  await dump(page, 'LaporanHasil');
  await shot(page, info, 'Laporan Hasil', { maskPii: DEFAULT_PII });
  await saveWalkthrough(page, info);
});
