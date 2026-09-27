/**
 * tests/a11y-control-names.spec.ts
 *
 * TC-AXE-03 without a dependency: on every page in /rest/menu, every visible form control
 * (input, select, textarea) needs an accessible name from aria-label, aria-labelledby,
 * a non-empty <label for>, a wrapping <label>, or title. A placeholder alone does not count.
 * Written 2026-09-28 against testing 3.2.3.0. Read-only.
 *
 * KNOWN lists pages already found and filed; the test fails only on new ones.
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || process.env.BASE || 'https://testing.openelis-global.org';

// route -> number of unnamed controls accepted for now (filed in release-qa-3.2.3).
const KNOWN: Record<string, number> = {
  // R74 (2026-09-28): empty <label for> on these controls.
  '/order/environmental/enter': 4, '/order/environmental/label': 4, // collection date, per-sample type/container/collected
  '/order/vector/enter': 1, '/order/vector/label': 1,               // collection date
  '/WorkPlanByTest?type=test': 1, '/WorkPlanByPanel?type=panel': 1,
  '/WorkPlanByTestSection?type=': 1, '/WorkPlanByPriority?type=priority': 1, // the Workplan type select
  '/SampleShipment/reference-lab-results': 1,                         // date-range "to"
  '/ResultValidationByTestDate': 1,                                   // test date
  '/NceDashboard': 200,                                               // search box + one row-select checkbox per NCE row
};

test('TC-AXE-03: every visible form control on every menu page has an accessible name', async ({ page }) => {
  test.setTimeout(30 * 60_000);
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  const routes: string[] = await page.evaluate(async () => {
    const m = await (await fetch('/api/OpenELIS-Global/rest/menu')).json();
    const out = new Set<string>();
    const walk = (n: any) => (Array.isArray(n) ? n : [n]).forEach((x: any) => {
      const mm = x.menu || {};
      if (mm.isActive && typeof mm.actionURL === 'string' && mm.actionURL.startsWith('/')
        && !/ReportPrint|logout|\.pdf|^\/docs\/|ByProject|StudyElectronicOrders|ResultValidationRetroC/i.test(mm.actionURL)) out.add(mm.actionURL);
      (x.childMenus || []).forEach(walk);
    });
    walk(m);
    return [...out];
  });
  expect(routes.length, 'menu routes found').toBeGreaterThan(20);

  const found: Record<string, string[]> = {};
  for (const route of routes) {
    try {
      await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(800);
      const unnamed: string[] = await page.evaluate(() => {
        const t = (s: string | null) => (s || '').replace(/\s+/g, ' ').trim();
        const named = (el: Element) => {
          if (t(el.getAttribute('aria-label'))) return true;
          const lb = el.getAttribute('aria-labelledby');
          if (lb && t(lb.split(' ').map((i) => document.getElementById(i)?.textContent || '').join(' '))) return true;
          if (el.id) {
            const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
            if (l && t(l.textContent)) return true;
          }
          const w = el.closest('label');
          if (w && t(w.textContent)) return true;
          return !!t(el.getAttribute('title'));
        };
        const visible = (e: Element) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
        return [...document.querySelectorAll('main input:not([type=hidden]), main select, main textarea')]
          .filter((e) => visible(e) && !named(e))
          .map((e) => `${e.tagName.toLowerCase()}${(e as HTMLInputElement).type ? '[' + (e as HTMLInputElement).type + ']' : ''}#${e.id || '?'}`);
      });
      if (unnamed.length) found[route] = unnamed;
    } catch { /* load failures are TC-UIX-01's job */ }
  }
  test.info().attachments.push({ name: 'a11y-control-names.json', contentType: 'application/json', body: Buffer.from(JSON.stringify(found, null, 2)) });
  const fresh = Object.entries(found).filter(([r, u]) => u.length > (KNOWN[r] ?? 0));
  expect(fresh, `unnamed controls on ${fresh.length} page(s): ${JSON.stringify(fresh)}`).toEqual([]);
});
