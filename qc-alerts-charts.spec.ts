/**
 * QA/QC alerts + violation counts + Levey-Jennings charts — contract   [OGC-41 Westgard QC]
 *
 * Rounds out the read surface of the new QA→QC module across three more controllers
 * (QCAlertRestController, QCViolationRestController, QCChartDataRestController), captured on pngdemo:
 *
 *   GET /rest/qc/alerts[?unreadOnly=true]          -> QCAlert[]
 *   GET /rest/qc/alerts/count/unread               -> number
 *   GET /rest/qc/violations/counts                 -> { totalCount, rejectionCount, warningCount }
 *   GET /rest/qc/violations?severity=WARNING       -> QCViolation[]   (filter)
 *   GET /rest/qc/charts/{controlLotId}[?startDate&endDate] -> { controlLotId, dataPoints[] }
 *   GET /rest/qc/charts/{controlLotId}/statistics  -> { mean, standardDeviation, plus1SD..minus3SD, ... } | 404
 *
 * Asserts response shapes + invariants that hold even with no QC results yet: violation counts
 * self-consistency (total == rejection + warning), and — when a control lot has computed statistics —
 * the SD reference lines are arithmetically consistent (plus1SD == mean+sd, minus3SD == mean-3sd).
 * QC results themselves are analyzer-ingested (no REST create), so charts/statistics GAP-and-continue
 * on empty data. Skips where the module is absent; never fabricates.
 *
 * Run:  BASE=https://pngdemo.openelis-global.org npx playwright test --project=qc-alerts-charts
 */
import { test, expect, Page } from '@playwright/test';

const REST = '/api/OpenELIS-Global/rest';
const EPS = 1e-6;

async function getJson<T = any>(page: Page, path: string): Promise<{ status: number; body: T | null }> {
  return page.evaluate(async (p) => {
    try { const r = await fetch(p, { credentials: 'include', headers: { Accept: 'application/json' } }); let b: any = null; try { b = await r.json(); } catch {} return { status: r.status, body: b }; }
    catch { return { status: 0, body: null }; }
  }, path);
}

test.describe('QA/QC alerts + violation counts + charts contract [pngdemo]', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    const probe = await getJson(page, `${REST}/qc/violations/counts`);
    test.skip(probe.status === 404 || probe.status === 0,
      `QA→QC module not present (GET /rest/qc/violations/counts -> ${probe.status})`);
  });

  test('AC-1: alerts feed + unread count', async ({ page }, info) => {
    const all = await getJson(page, `${REST}/qc/alerts`);
    const unread = await getJson(page, `${REST}/qc/alerts?unreadOnly=true`);
    expect(all.status, 'GET /rest/qc/alerts -> 200').toBe(200);
    expect(unread.status, 'GET /rest/qc/alerts?unreadOnly=true -> 200').toBe(200);
    expect(Array.isArray(all.body), 'alerts is an array').toBeTruthy();
    expect(Array.isArray(unread.body), 'unread alerts is an array').toBeTruthy();
    expect((unread.body as any[]).length, 'unread <= all alerts').toBeLessThanOrEqual((all.body as any[]).length);
    const cnt = await getJson(page, `${REST}/qc/alerts/count/unread`);
    expect(cnt.status, 'GET /rest/qc/alerts/count/unread -> 200').toBe(200);
    expect(Number(cnt.body), 'unread count is a non-negative number').toBeGreaterThanOrEqual(0);
    if ((all.body as any[]).length === 0) info.annotations.push({ type: 'gap', description: 'no QC alerts on this instance (reachable, empty)' });
  });

  test('AC-2: violation counts self-consistency + severity filter', async ({ page }) => {
    const counts = await getJson(page, `${REST}/qc/violations/counts`);
    expect(counts.status, 'GET /rest/qc/violations/counts -> 200').toBe(200);
    const c = (counts.body || {}) as Record<string, number>;
    for (const k of ['totalCount', 'rejectionCount', 'warningCount']) expect(k in c, `counts has ${k}`).toBeTruthy();
    expect(Number(c.totalCount), 'total == rejection + warning').toBe(Number(c.rejectionCount) + Number(c.warningCount));
    for (const sev of ['WARNING', 'REJECTION']) {
      const f = await getJson(page, `${REST}/qc/violations?severity=${sev}`);
      expect(f.status, `GET /rest/qc/violations?severity=${sev} -> 200`).toBe(200);
      expect(Array.isArray(f.body), `${sev} filter returns an array`).toBeTruthy();
    }
  });

  test('AC-3: Levey-Jennings chart data + SD-line statistics (per control lot)', async ({ page }, info) => {
    const lots = ((await getJson(page, `${REST}/qc/control-lots`)).body as any[]) || [];
    test.skip(lots.length === 0, 'no control lots to chart on this instance');
    const lotId = String(lots[0].id);

    const chart = await getJson(page, `${REST}/qc/charts/${lotId}`);
    expect(chart.status, 'GET /rest/qc/charts/{lotId} -> 200').toBe(200);
    expect(String((chart.body as any)?.controlLotId), 'chart echoes controlLotId').toBe(lotId);
    expect(Array.isArray((chart.body as any)?.dataPoints), 'dataPoints is an array').toBeTruthy();
    if (((chart.body as any)?.dataPoints || []).length === 0) info.annotations.push({ type: 'gap', description: `lot ${lotId} has no QC results yet (analyzer-ingested) — chart empty` });

    const stats = await getJson(page, `${REST}/qc/charts/${lotId}/statistics`);
    if (stats.status === 404) { info.annotations.push({ type: 'gap', description: `lot ${lotId} has no computed statistics yet (404)` }); return; }
    expect(stats.status, 'GET /rest/qc/charts/{lotId}/statistics -> 200 or 404').toBe(200);
    const s = (stats.body || {}) as Record<string, number>;
    const mean = Number(s.mean), sd = Number(s.standardDeviation);
    expect(Math.abs(Number(s.plus1SD) - (mean + sd)), 'plus1SD == mean + sd').toBeLessThan(EPS + Math.abs(mean + sd) * 1e-9);
    expect(Math.abs(Number(s.plus3SD) - (mean + 3 * sd)), 'plus3SD == mean + 3sd').toBeLessThan(EPS + Math.abs(mean + 3 * sd) * 1e-9);
    expect(Math.abs(Number(s.minus3SD) - (mean - 3 * sd)), 'minus3SD == mean - 3sd').toBeLessThan(EPS + Math.abs(mean - 3 * sd) * 1e-9);
  });
});
