/**
 * QA/QC Westgard rule-config — round-trip (mostly non-destructive)   [OGC-41 Westgard QC]
 *
 * Covers the rule-configuration write surface of the new QA→QC module (QCRestController), driven
 * against pngdemo (index-Np3i_e3L.js):
 *
 *   GET  /rest/qc/ruleConfig/summaries                          -> [{testId,instrumentId,testName,
 *                                                                   instrumentName,enabledRuleCount,
 *                                                                   totalRuleCount,rules[]}]
 *   POST /rest/qc/ruleConfig/defaults?testId=&instrumentId=      -> 201 defaults (409 if already set)
 *   GET  /rest/qc/ruleConfig?testId=&instrumentId=              -> [{id,ruleCode,enabled,severity,
 *                                                                   requiresCorrectiveAction,...}]
 *   PUT  /rest/qc/ruleConfig/{id}                              -> update {enabled|severity|requiresCorrectiveAction}
 *   POST /rest/qc/ruleConfig/validate?testId=&instrumentId=     -> 200 "valid" | 400 message
 *
 * Strategy: use a test+instrument combo that already has rules (from /summaries); if none exists,
 * self-configure one via POST /defaults (accepting 201 new OR 409 already). Assert the config-list
 * shape and the summaries roll-up consistency (totalRuleCount == #configs, enabledRuleCount <= total),
 * then exercise PUT by TOGGLING one rule's `enabled` and RESTORING it (non-destructive), and confirm
 * POST /validate responds. Skips where the QC module is absent; never fabricates.
 *
 * Run:  BASE=https://pngdemo.openelis-global.org npx playwright test --project=qc-rule-config
 */
import { test, expect, Page } from '@playwright/test';

const REST = '/api/OpenELIS-Global/rest';

async function getJson<T = any>(page: Page, path: string): Promise<{ status: number; body: T | null }> {
  return page.evaluate(async (p) => {
    try { const r = await fetch(p, { credentials: 'include', headers: { Accept: 'application/json' } }); let b: any = null; try { b = await r.json(); } catch {} return { status: r.status, body: b }; }
    catch { return { status: 0, body: null }; }
  }, path);
}
async function send(page: Page, method: 'POST' | 'PUT', path: string, body?: any): Promise<{ status: number; body: any }> {
  return page.evaluate(async ([m, p, b]) => {
    const csrf = localStorage.getItem('CSRF') || '';
    const init: RequestInit = { method: m as string, credentials: 'include', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-Token': csrf } };
    if (b !== undefined) init.body = JSON.stringify(b);
    try { const r = await fetch(p as string, init); let j: any = null; try { j = await r.json(); } catch {} return { status: r.status, body: j }; }
    catch (e) { return { status: 0, body: String(e) }; }
  }, [method, path, body] as any);
}

test.describe('QA/QC Westgard rule-config round-trip [pngdemo]', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => !!localStorage.getItem('CSRF'), null, { timeout: 15000 }).catch(() => {});
    const probe = await getJson(page, `${REST}/qc/ruleConfig/summaries`);
    test.skip(probe.status === 404 || probe.status === 0,
      `QA→QC module not present (GET /rest/qc/ruleConfig/summaries -> ${probe.status})`);
  });

  test('RC: config list + summaries consistency + toggle/restore a rule (non-destructive)', async ({ page }, info) => {
    test.setTimeout(120000);

    // 1. find a configured (test,instrument) combo — prefer an existing one from summaries.
    let summaries = ((await getJson(page, `${REST}/qc/ruleConfig/summaries`)).body as any[]) || [];
    let testId: string, instrumentId: string;
    if (summaries.length > 0) {
      testId = String(summaries[0].testId); instrumentId = String(summaries[0].instrumentId);
    } else {
      // self-configure a combo from a real analyzer + test
      const an = await getJson(page, `${REST}/analyzer/analyzers`);
      const analyzers = Array.isArray((an.body as any)?.analyzers) ? (an.body as any).analyzers : (Array.isArray(an.body) ? an.body as any[] : []);
      const tl = await getJson(page, `${REST}/displayList/ALL_TESTS`);
      const tests = Array.isArray(tl.body) ? tl.body as any[] : [];
      test.skip(analyzers.length === 0 || tests.length === 0, 'no analyzer/test to configure rules against');
      instrumentId = String(analyzers[0].id); testId = String(tests[0].id);
      const def = await send(page, 'POST', `${REST}/qc/ruleConfig/defaults?testId=${testId}&instrumentId=${instrumentId}`);
      expect([201, 409].includes(def.status), `POST defaults -> 201(new) or 409(exists), got ${def.status}`).toBeTruthy();
      summaries = ((await getJson(page, `${REST}/qc/ruleConfig/summaries`)).body as any[]) || [];
    }

    // 2. config list shape
    const cfg = await getJson(page, `${REST}/qc/ruleConfig?testId=${testId}&instrumentId=${instrumentId}`);
    expect(cfg.status, 'GET ruleConfig?testId&instrumentId -> 200').toBe(200);
    const configs = (cfg.body as any[]) || [];
    expect(configs.length, 'combo has rule configs').toBeGreaterThan(0);
    for (const k of ['id', 'ruleCode', 'enabled', 'severity']) {
      expect(k in configs[0], `rule config has "${k}"`).toBeTruthy();
    }

    // 3. summaries roll-up consistency for this combo
    const sum = summaries.find((s) => String(s.testId) === testId && String(s.instrumentId) === instrumentId);
    expect(sum, 'combo present in /ruleConfig/summaries').toBeTruthy();
    expect(Number(sum.totalRuleCount), 'summary totalRuleCount == #configs').toBe(configs.length);
    expect(Number(sum.enabledRuleCount), 'enabledRuleCount <= totalRuleCount').toBeLessThanOrEqual(Number(sum.totalRuleCount));

    // 4. PUT toggle one rule's enabled, verify, then RESTORE (non-destructive)
    const rule = configs[0];
    const original = !!rule.enabled;
    const flip = await send(page, 'PUT', `${REST}/qc/ruleConfig/${rule.id}`, { enabled: !original });
    expect(flip.status, 'PUT ruleConfig/{id} -> 200').toBe(200);
    const after = await getJson(page, `${REST}/qc/ruleConfig?testId=${testId}&instrumentId=${instrumentId}`);
    const flipped = ((after.body as any[]) || []).find((c) => c.id === rule.id);
    expect(!!flipped?.enabled, `rule ${rule.ruleCode} enabled flipped to ${!original}`).toBe(!original);
    // restore
    const restore = await send(page, 'PUT', `${REST}/qc/ruleConfig/${rule.id}`, { enabled: original });
    if (restore.status !== 200) info.annotations.push({ type: 'gap', description: `restore of rule ${rule.id} returned ${restore.status}` });
    const restored = ((await getJson(page, `${REST}/qc/ruleConfig?testId=${testId}&instrumentId=${instrumentId}`)).body as any[] || []).find((c) => c.id === rule.id);
    expect(!!restored?.enabled, 'rule enabled restored to original').toBe(original);

    // 5. validate endpoint responds meaningfully (200 valid, or 400 with a reason)
    const val = await send(page, 'POST', `${REST}/qc/ruleConfig/validate?testId=${testId}&instrumentId=${instrumentId}`);
    expect([200, 400].includes(val.status), `POST /ruleConfig/validate -> 200|400, got ${val.status}`).toBeTruthy();
  });
});
