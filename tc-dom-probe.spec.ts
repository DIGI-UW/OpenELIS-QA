import { test } from '@playwright/test';
const BASE = process.env.BASE || 'https://testing.openelis-global.org';
const PROBE_ID = process.env.PROBE_ID || '383';

async function dump(page: any) {
  return page.evaluate(() => {
    const q = (s: string) => [...document.querySelectorAll(s)];
    const t = (el: any) => (el.textContent || '').trim();
    const lbl = (el: any) => (el.labels && el.labels[0] ? el.labels[0].textContent : (el.getAttribute('aria-label') || '')).trim().slice(0, 45);
    return {
      inputs: q('input,textarea').map((el: any) => ({ id: el.id, ph: el.placeholder, label: lbl(el), type: el.type })).slice(0, 30),
      selects: q('select').map((el: any) => ({ id: el.id, label: lbl(el), opts: [...el.options].slice(0, 3).map(t) })),
      comboboxes: q('[role=combobox]').map((el: any) => ({ id: el.id, label: lbl(el), ph: el.placeholder })),
      buttons: [...new Set(q('button').map(t).filter(Boolean))].slice(0, 30),
      headings: q('h1,h2,h3,label').map(t).filter(Boolean).slice(0, 25),
    };
  });
}

test('tc-dom-probe', async ({ page }) => {
  test.setTimeout(120000);
  const secs = [`new/basic-info`, `${PROBE_ID}/sample-results`, `${PROBE_ID}/ranges`, `${PROBE_ID}/panels`, `${PROBE_ID}/methods`, `${PROBE_ID}/labels`];
  for (const s of secs) {
    await page.goto(`${BASE}/MasterListsPage/TestCatalogEditor/${s}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(2500);
    console.log('PROBE ' + s + ' ' + JSON.stringify(await dump(page)));
  }
});
