// Docs UI-drift check. For each manual section whose `base` matches the current BASE, visit its
// routes and assert the documented UI anchors still exist. Missing anchors => the manual section
// may be stale (the UI changed). Merges results into docs-manual/drift-report.json so running the
// check once per instance accumulates one report. Run:
//   BASE=https://testing.openelis-global.org      npx playwright test --project=docs drift.check
//   BASE=https://indonesiademo.openelis-global.org npx playwright test --project=docs drift.check
import { test, expect } from '@playwright/test';
import { go } from './capture';
import fs from 'fs';
import path from 'path';

const BASE = process.env.BASE || 'https://testing.openelis-global.org';
const host = (u: string) => { try { return new URL(u).host; } catch { return u; } };
const CONTRACTS = path.join('docs-manual', 'contracts.json');
const REPORT = path.join('docs-manual', 'drift-report.json');

test('docs UI-drift check', async ({ page }, info) => {
  const { sections } = JSON.parse(fs.readFileSync(CONTRACTS, 'utf8'));
  const mine = sections.filter((s: any) => host(s.base) === host(BASE));
  test.skip(mine.length === 0, `no manual sections for ${host(BASE)}`);

  // instance version from the header ("Version: 3.2.1.10")
  await go(page, '/');
  const bodyText = await page.locator('body').innerText().catch(() => '');
  const ver = (bodyText.match(/Version:\s*([\d.]+)/) || [])[1] || 'unknown';

  const results: any[] = [];
  for (const s of mine) {
    const missing: string[] = [];
    const routeErrors: string[] = [];
    for (const r of s.routes) {
      const ok = await go(page, r.path);
      if (!ok) { routeErrors.push(r.path); continue; }
      await page.waitForTimeout(700);
      for (const a of r.anchors) {
        const found = await page.getByText(a, { exact: false }).first().count().catch(() => 0);
        if (!found) missing.push(`${r.path} :: ${a}`);
      }
    }
    const versionDrift = s.capturedVersion && ver !== 'unknown' && ver !== s.capturedVersion;
    const status = routeErrors.length ? 'error' : (missing.length ? 'drift' : (versionDrift ? 'review' : 'ok'));
    results.push({
      id: s.id, title: s.title, base: s.base, instanceVersion: ver,
      capturedVersion: s.capturedVersion, manualDoc: s.manualDoc,
      status, missingAnchors: missing, routeErrors,
      checkedAt: new Date().toISOString(),
    });
    console.log(`[drift] ${s.id} status=${status} missing=${missing.length} routeErrors=${routeErrors.length} ver=${ver}`);
  }

  // merge into the report (upsert by id)
  let report: any = { generatedAt: null, sections: [] };
  if (fs.existsSync(REPORT)) { try { report = JSON.parse(fs.readFileSync(REPORT, 'utf8')); } catch {} }
  const byId: Record<string, any> = {};
  for (const x of report.sections || []) byId[x.id] = x;
  for (const x of results) byId[x.id] = x;
  report.sections = Object.values(byId).sort((a: any, b: any) => a.id.localeCompare(b.id));
  report.generatedAt = new Date().toISOString();
  fs.mkdirSync('docs-manual', { recursive: true });
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));

  // Don't fail the run on drift — this is a reporting check. (Flip to expect() if you want CI to fail.)
  expect(true).toBeTruthy();
});
