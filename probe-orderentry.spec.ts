import { test } from '@playwright/test';

// Is ORDER_ENTRY_CONFIG_ITEMS=0 real on 34.212.225.107, or an artefact?
// On testing.openelis-global.org the same page (v3.2.1.11) shows "1-15 of 15 items", verified by
// hand in Chrome. TC-CFG-03 logged 0 against 34.212.225.107. A regex non-match would give -1, not
// 0, so the page appears to have rendered a table that genuinely reported zero items.
const ADMIN = { user: process.env.OE_USER || 'admin', pass: process.env.OE_PASS || 'adminADMIN!' };
const BASE = process.env.BASE || 'https://34.212.225.107';

async function login(page: any) {
  await page.goto(`${BASE}/login`);
  const pass = page.locator('input[type="password"]').first();
  if (!(await pass.isVisible({ timeout: 5000 }).catch(() => false))) return;
  await page.locator('input[type="text"], input[placeholder*="user" i]').first().fill(ADMIN.user);
  await pass.fill(ADMIN.pass);
  await page.locator('button:has-text("Login"), button[type="submit"]').first().click();
  await page.waitForURL('**/MasterListsPage', { timeout: 15000 }).catch(() => {});
}

test('order entry config item count', async ({ page }) => {
  test.setTimeout(120000);
  await login(page);
  await page.goto(`${BASE}/MasterListsPage/SampleEntryConfigurationMenu`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);

  const d = await page.evaluate(() => {
    const b = document.body.innerText;
    const m = b.match(/(\d+)\s*-\s*(\d+)\s+of\s+(\d+)\s+items/i);
    const rows = [...document.querySelectorAll('table tbody tr')];
    return {
      url: location.href,
      heading: (document.querySelector('h1, h2') as any)?.innerText || '',
      paginationMatch: m ? m[0] : null,
      total: m ? Number(m[3]) : -1,
      domRows: rows.length,
      names: rows.map((r: any) => (r.querySelectorAll('td')[1] as any)?.innerText?.trim()).filter(Boolean),
      bodyLen: b.length,
      hasTable: !!document.querySelector('table'),
    };
  });
  console.log('OEC_PROBE', JSON.stringify(d));
});
