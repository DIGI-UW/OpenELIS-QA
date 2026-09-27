/**
 * tests/ui-text-sweep.spec.ts
 *
 * Visits every active page in /rest/menu and looks for text a user should never see:
 * "[object Object]", "NaN", a bare "undefined", unresolved i18n keys (a.b.c), and server
 * error banners. Written 2026-09-27 against testing 3.2.3.0 (uncovered-workflows-catalogue
 * TC-UIX-01). Read-only: it only loads pages.
 *
 * KNOWN lists what was already seen and filed, so the sweep fails only on something new.
 * Remove an entry when its defect is fixed.
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || process.env.BASE || 'https://testing.openelis-global.org';

// route -> hits already filed (release-qa-3.2.3 polish list / HARNESS-FINDINGS).
// "objectObject" on these pages is the hidden sort description of Carbon tables
// ("Click to sort rows by [object Object] header"), read out by screen readers.
const SORT_DESC = ['/SamplePatientEntry', '/SampleEdit?type=readonly', '/SampleEdit?type=readwrite',
  '/PatientManagement', '/PatientHistory', '/PatientMerge', '/AuditTrailReport?type=order',
  '/PathologyDashboard', '/genericProgram', '/NotebookDashboard', '/NoteBookDashboard',
  '/Report?type=patient&report=patientCILNSP_vreduit', '/Report?type=patient&report=patientEID1',
  '/Report?type=patient&report=patientVL1'];
const KNOWN: Record<string, string[]> = {
  '/GenericSample/Results': ['key:sample.label.generic'], // BUG-62
  ...Object.fromEntries(SORT_DESC.map((r) => [r, ['objectObject']])),
};
// Menu entries that open the legacy JSP UI, whose own navigation shows raw keys.
const LEGACY = /ByProject|StudyElectronicOrders|ResultValidationRetroC/;
const LEGACY_KNOWN = ['key:sidenav.label.environmental.compliance', 'key:label.select.last.first.name'];

type Hit = string;

test('TC-UIX-01: no page in the menu shows [object Object], NaN, undefined, raw i18n keys or a server error', async ({ page }) => {
  test.setTimeout(30 * 60_000);
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  const routes: string[] = await page.evaluate(async () => {
    const m = await (await fetch('/api/OpenELIS-Global/rest/menu')).json();
    const out = new Set<string>();
    const walk = (n: any) => (Array.isArray(n) ? n : [n]).forEach((x: any) => {
      const mm = x.menu || {};
      if (mm.isActive && typeof mm.actionURL === 'string' && mm.actionURL.startsWith('/')
        && !/ReportPrint|logout|\.pdf|^\/docs\//i.test(mm.actionURL)) out.add(mm.actionURL);
      (x.childMenus || []).forEach(walk);
    });
    walk(m);
    return [...out];
  });
  expect(routes.length, 'menu routes found').toBeGreaterThan(20);

  const found: Record<string, Hit[]> = {};
  for (const route of routes) {
    try {
      await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(800);
      const hits: Hit[] = await page.evaluate(() => {
        const main = document.querySelector('main') || document.body;
        const txt = (main as HTMLElement).innerText;
        const all = main.textContent || '';
        const h: string[] = [];
        if (/\[object Object\]/.test(all)) h.push('objectObject');
        if (/(^|\s)NaN(\s|$)/.test(txt)) h.push('NaN');
        if (/(^|\s)undefined(\s|$)/.test(txt)) h.push('undefined');
        const keys = new Set((txt.match(/\b[a-z][a-zA-Z]+(\.[a-z][a-zA-Z0-9]+){2,}\b/g) || [])
          .filter(k => !/openelis|www\.|\.org\b|\.com\b|\.gov\b|\.js\b|\.ts\b|e\.g\b|i\.e\b/.test(k)));
        keys.forEach(k => h.push('key:' + k));
        if (/Oops, Server error|Internal Server Error|Something went wrong/i.test(txt)) h.push('serverError');
        return h;
      });
      if (hits.length) found[route] = hits;
    } catch (e) {
      found[route] = ['loadFailed:' + String((e as Error).message).slice(0, 80)];
    }
  }

  test.info().attachments.push({ name: 'ui-text-sweep.json', contentType: 'application/json', body: Buffer.from(JSON.stringify(found, null, 2)) });
  const fresh = Object.entries(found)
    .map(([r, hs]) => [r, hs.filter(h => !(KNOWN[r] || []).includes(h) && !(LEGACY.test(r) && LEGACY_KNOWN.includes(h)))] as const)
    .filter(([, hs]) => hs.length);
  expect(fresh, `new UI text defects on ${fresh.length} page(s): ${JSON.stringify(fresh)}`).toEqual([]);
});
