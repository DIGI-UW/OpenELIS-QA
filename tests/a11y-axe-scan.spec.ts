/**
 * tests/a11y-axe-scan.spec.ts
 *
 * Automated WCAG 2.1 A/AA scan (axe-core) of the screens a lab uses most. Until now accessibility
 * coverage counted Tab stops and control names (accessibility.spec.ts, a11y-control-names.spec.ts);
 * this is the first rule-based pass.
 *
 * How it judges: every violation axe reports is written to the JSON attachment `axe-<page>.json`.
 * A page FAILS when it has a critical or serious violation whose rule is not in its entry in
 * tests/a11y-axe-baseline.json. The baseline records what develop has today (2 Oct 2026) so the
 * scan catches regressions without going red on known debt; shrink it as fixes land.
 * Regenerate it with A11Y_WRITE_BASELINE=1 (writes test-results/a11y-axe-baseline.json to copy over).
 *
 * Read-only: no records are created. The pathology case view uses the newest case on the instance.
 */
import { test, expect, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import * as fs from 'fs';
import * as path from 'path';
import { apiGet } from '../helpers/silentSave';

const BASE = process.env.BASE_URL || process.env.BASE || 'https://testing.openelis-global.org';
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const BASELINE_FILE = path.join(__dirname, 'a11y-axe-baseline.json');
const baseline: Record<string, string[]> = fs.existsSync(BASELINE_FILE) ? JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')) : {};
const WRITE = process.env.A11Y_WRITE_BASELINE === '1';
const written: Record<string, string[]> = {};

type Target = { key: string; name: string; route: string | ((page: Page) => Promise<string>); ready: RegExp };

const TARGETS: Target[] = [
  { key: 'home', name: 'Home dashboard', route: '/', ready: /Home|Dashboard/i },
  { key: 'add-order', name: 'Add Order (legacy wizard)', route: '/SamplePatientEntry', ready: /Patient Info/i },
  { key: 'enter-order', name: 'Enter Order (v4)', route: '/order/clinical/enter', ready: /Enter Order/i },
  { key: 'results', name: 'Results Entry', route: '/Results', ready: /Results/i },
  { key: 'validation', name: 'Validation', route: '/validation?type=routine', ready: /Validation/i },
  { key: 'patient', name: 'Patient Management', route: '/PatientManagement', ready: /Patient/i },
  { key: 'pathology-dashboard', name: 'Pathology dashboard', route: '/PathologyDashboard', ready: /Pathology/i },
  {
    key: 'pathology-case', name: 'Pathology case view',
    route: async (page) => {
      const r = await apiGet<any>(page, '/rest/pathology/dashboard?statuses=COMPLETED,UNDER_REVIEW,READY_PATHOLOGIST,STAINING,GROSSING&searchTerm=');
      const j = r.json ?? {};
      // Blank statuses returns nothing: the dashboard always sends a status list.
      const rows: any[] = Array.isArray(j) ? j : (j.items ?? []);
      const id = rows.map((x: any) => Number(x.pathologySampleId ?? x.id)).filter(Boolean).sort((a, b) => b - a)[0];
      return id ? `/PathologyCaseView/${id}` : '/PathologyDashboard';
    },
    ready: /Pathology/i,
  },
  { key: 'eqa-my-cycles', name: 'EQA My Cycles', route: '/qa/eqa/my-cycles', ready: /My EQA Cycles/i },
  { key: 'inventory', name: 'Inventory Management', route: '/inventory', ready: /Inventory/i },
  { key: 'storage', name: 'Storage Management', route: '/Storage', ready: /Storage/i },
  { key: 'locations', name: 'Locations & Organizations', route: '/MasterListsPage/locations', ready: /Organizations/i },
  { key: 'admin', name: 'Admin landing', route: '/MasterListsPage', ready: /Admin|Master/i },
  { key: 'alerts', name: 'Alerts', route: '/Alerts', ready: /Alert/i },
];

test.describe('Accessibility scan, WCAG 2.1 A/AA (TC-AXE)', () => {
  // Not serial: one page's violations must not stop the rest of the scan.
  test.setTimeout(120_000);

  for (const t of TARGETS) {
    test(`TC-AXE-${t.key}: ${t.name} has no new serious or critical WCAG violations`, async ({ page }, info) => {
      await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
      const route = typeof t.route === 'string' ? t.route : await t.route(page);
      await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('main').first()).toContainText(t.ready, { timeout: 45_000 });
      await page.waitForLoadState('networkidle').catch(() => undefined);
      await page.waitForTimeout(1500);
      const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      const violations = result.violations.map((v) => ({
        rule: v.id, impact: v.impact, help: v.help, url: v.helpUrl, count: v.nodes.length,
        targets: v.nodes.slice(0, 5).map((n) => n.target.join(' ')),
      }));
      await info.attach(`axe-${t.key}.json`, { body: JSON.stringify({ route, violations }, null, 1), contentType: 'application/json' });
      fs.mkdirSync('test-results/axe', { recursive: true });
      fs.writeFileSync(`test-results/axe/${t.key}.json`, JSON.stringify({ route, violations }, null, 1));
      const heavy = violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
      if (WRITE) {
        written[t.key] = [...new Set(heavy.map((v) => v.rule))].sort();
        fs.mkdirSync('test-results', { recursive: true });
        fs.writeFileSync('test-results/a11y-axe-baseline.json', JSON.stringify(written, null, 2) + '\n');
        return;
      }
      const known = new Set(baseline[t.key] ?? []);
      const fresh = heavy.filter((v) => !known.has(v.rule));
      expect(fresh, `${t.name} (${route}) new serious/critical violations:\n${fresh.map((v) => `  ${v.impact} ${v.rule} x${v.count}: ${v.help} [${v.targets.join(' | ')}]`).join('\n')}`).toEqual([]);
    });
  }
});
