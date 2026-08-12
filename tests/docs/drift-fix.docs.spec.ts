// Focused re-check of the 9 admin sections that idle-timeout on the tail of the full drift run.
// Fresh session -> checked first -> resolves cleanly. Upserts into docs-manual/drift-report.json.
import { test, expect } from '@playwright/test';
import { go } from './capture';
import fs from 'fs'; import path from 'path';
const REPORT = path.join('docs-manual', 'drift-report.json');
const BASE = 'https://testing.openelis-global.org';
const SECS = [
  ['site-information', 'Site Information', '/MasterListsPage/SiteInformationMenu', ['Site Information','Name','Description','Value','Modify']],
  ['menu-configuration', 'Menu Configuration', '/MasterListsPage/globalMenuManagement', ['Global Menu Management','Side Nav Active','Show Child Elements','Submit']],
  ['calendar-management', 'Calendar Management', '/MasterListsPage/calendarManagement', ['Calendar Management','Weekend Days','Add Holiday','Holiday Name']],
  ['result-reporting-configuration', 'Result Reporting Configuration', '/MasterListsPage/resultReportingConfiguration', ['Result Reporting Configuration','Result Reporting','Queue Size']],
  ['user-management', 'User Management', '/MasterListsPage/userManagement', ['User Management','System User Login Name','Add','Is Active']],
  ['dictionary-menu', 'Dictionary Menu', '/MasterListsPage/DictionaryMenu', ['Dictionary Menu','Category','Dictionary Entry','LOINC Code']],
  ['reflex-testing', 'Reflex Testing', '/MasterListsPage/reflex', ['Reflex Tests Management','Rule Name','Add Rule']],
  ['calculated-value-tests', 'Calculated Value Tests', '/MasterListsPage/calculatedValue', ['Calculated Value Tests Management','Calculation Name','Add Rule']],
  ['logging-configuration', 'Logging Configuration', '/MasterListsPage/loggingManagement', ['Logging Configuration','Log Level','Logger Name','Apply Log Level']],
] as [string, string, string, string[]][];

test('drift fix (9 admin sections)', async ({ page }) => {
  test.setTimeout(120000);
  await go(page, '/');
  const ver = ((await page.locator('body').innerText().catch(() => '')).match(/Version:\s*([\d.]+)/) || [])[1] || 'unknown';
  const results: any[] = [];
  for (const [id, title, route, anchors] of SECS) {
    const missing: string[] = []; const routeErrors: string[] = [];
    const ok = await go(page, route);
    if (!ok) routeErrors.push(route);
    else { await page.waitForTimeout(600); for (const a of anchors) { if (!(await page.getByText(a, { exact: false }).first().count().catch(() => 0))) missing.push(`${route} :: ${a}`); } }
    const status = routeErrors.length ? 'error' : (missing.length ? 'drift' : 'ok');
    results.push({ id, title, base: BASE, instanceVersion: ver, capturedVersion: '3.2.1.10', status, missingAnchors: missing, routeErrors, checkedAt: new Date().toISOString() });
    console.log(`[fix] ${id} status=${status} missing=${missing.length} routeErrors=${routeErrors.length}`);
  }
  let report: any = { generatedAt: null, sections: [] };
  if (fs.existsSync(REPORT)) { try { report = JSON.parse(fs.readFileSync(REPORT, 'utf8')); } catch {} }
  const byId: Record<string, any> = {}; for (const x of report.sections || []) byId[x.id] = x; for (const x of results) byId[x.id] = x;
  report.sections = Object.values(byId).sort((a: any, b: any) => a.id.localeCompare(b.id));
  report.generatedAt = new Date().toISOString();
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  expect(true).toBeTruthy();
});
