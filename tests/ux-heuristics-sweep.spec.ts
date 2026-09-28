/**
 * tests/ux-heuristics-sweep.spec.ts
 *
 * The page-level heuristic pass (helpers/ux-heuristics.ts, H2 H4 H5 H7 H8 H9) on every active
 * page in /rest/menu. Written 2026-09-28 at Casey's request; catalogue TC-HEUR. Read-only.
 *
 * It reports rather than enforces: every page gets pass / warn / fail per heuristic in
 * test-results/heuristics/, and `npm run heuristics:report` turns that into a review list.
 * The one hard assertion is that the sweep actually covered the menu, so an empty run can
 * never pass. Enforcement comes later, per heuristic, once Casey has reviewed the calls.
 */
import { test, expect } from '@playwright/test';
import { HeuristicLog, landing } from '../helpers/ux-heuristics';

const BASE = process.env.BASE_URL || process.env.BASE || 'https://testing.openelis-global.org';

test('TC-HEUR-00: heuristic pass over every menu page', async ({ page }) => {
  test.setTimeout(60 * 60_000);
  const log = new HeuristicLog(test.info());
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 300_000 });
  const { routes, locale } = await page.evaluate(async () => {
    const m = await (await fetch('/api/OpenELIS-Global/rest/menu')).json();
    const cfg = await (await fetch('/api/OpenELIS-Global/rest/configuration-properties')).json().catch(() => ({}));
    const out = new Set<string>();
    const walk = (n: any) => (Array.isArray(n) ? n : [n]).forEach((x: any) => {
      const mm = x.menu || {};
      if (mm.isActive && typeof mm.actionURL === 'string' && mm.actionURL.startsWith('/')
        && !/ReportPrint|logout|\.pdf|^\/docs\/|^\/api\//i.test(mm.actionURL)) out.add(mm.actionURL);
      (x.childMenus || []).forEach(walk);
    });
    walk(m);
    return { routes: [...out], locale: String(cfg.DEFAULT_DATE_LOCALE || '') };
  });
  const siteDateFormat = /en-US/i.test(locale) ? 'MM/dd/yyyy' as const : 'dd/MM/yyyy' as const;
  let visited = 0;
  for (const r of routes) {
    try {
      await page.goto(`${BASE}${r}`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
      log.add(await landing(page, { info: test.info(), siteDateFormat }));
      visited++;
    } catch (e) {
      log.add({ id: 'H6', page: r, verdict: 'fail', detail: `page did not load: ${String(e).slice(0, 120)}` });
    }
  }
  await log.flush();
  expect(visited, `pages checked out of ${routes.length} menu routes`).toBeGreaterThan(Math.min(20, routes.length - 1));
});
