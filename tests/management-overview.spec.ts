/**
 * tests/management-overview.spec.ts
 *
 * Reports > Management Overview (/dashboards/management): OpenELIS-Global-2 #4692
 * (OGC-897 v3 foundation: page shell, permission gate, KPI strip), merged to develop
 * 2026-10-26 (5afe5e70). Catalogue: management-overview-test-cases.md.
 *
 * Endpoints: GET /rest/dashboards/management/summary?scope= and /kpis?scope=,
 * gated by hasAuthority('dashboards.view.management') or GLOBAL_ADMIN. Scopes:
 * 7d, 30d, 90d, quarter, ytd, year (default 30d). The grant goes to Global
 * Administrator and every role holding qa.eqa.provider (liquibase/dashboards/001).
 *
 * Kind: Guard passes today and protects it. Tripwire asserts the intended behaviour
 * and carries test.fail() while develop differs.
 *
 * Written 2026-10-26 against local develop 31cc26c6 (oedevqa). Updated 2026-10-31 for #4838
 * (last N days covers N days; subtitle counts samples received), the features key
 * ast renamed microbiology, and TC-MGMT-24 measured once every section has loaded.
 */
import { test, expect, Page } from '@playwright/test';
import { API, j, queueContext, order, SERUM, TEST_IDS } from '../helpers/report-queue';
import { QUEUE_USERS, pageAs } from '../helpers/report-queue-ui';
import { dbSql } from '../helpers/inventory-fixtures';

test.setTimeout(180_000);

const MGMT = `${API}/dashboards/management`;
const SCOPES = ['7d', '30d', '90d', 'quarter', 'ytd', 'year'] as const;
const TILES = ['samples', 'medianTat', 'onTime', 'rejection', 'qcPass'] as const;

async function adminReady(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => !!localStorage.getItem('CSRF'), null, { timeout: 30_000 });
}

/** Inclusive day count of a scope, as ScopeRange.of computes it on the server's date. */
function scopeDays(scope: string, today: Date): number {
  const d0 = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  let from: Date;
  switch (scope) {
    case '7d': from = new Date(d0.getTime() - 6 * 864e5); break;
    case '30d': from = new Date(d0.getTime() - 29 * 864e5); break;
    case '90d': from = new Date(d0.getTime() - 89 * 864e5); break;
    case 'quarter': from = new Date(Date.UTC(d0.getUTCFullYear(), Math.floor(d0.getUTCMonth() / 3) * 3, 1)); break;
    case 'ytd': from = new Date(Date.UTC(d0.getUTCFullYear(), 0, 1)); break;
    default: from = new Date(Date.UTC(d0.getUTCFullYear() - 1, d0.getUTCMonth(), d0.getUTCDate()));
  }
  return Math.round((d0.getTime() - from.getTime()) / 864e5) + 1;
}

test.describe('Management Overview: API', () => {
  test.beforeEach(async ({ page }) => { await adminReady(page); });

  test('TC-MGMT-01 every scope answers summary and kpis 200 with the five tiles (guard)', async ({ page }) => {
    for (const s of SCOPES) {
      const sum = await j(page, `${MGMT}/summary?scope=${s}`);
      expect(sum.status, `summary ${s}`).toBe(200);
      expect(typeof sum.body.samplesReceived, `summary ${s} samplesReceived`).toBe('number');
      expect(Object.keys(sum.body.features ?? {}).sort()).toEqual(['analyzers', 'eqa', 'inventory', 'microbiology', 'qc']);
      const k = await j(page, `${MGMT}/kpis?scope=${s}`);
      expect(k.status, `kpis ${s}`).toBe(200);
      for (const t of TILES) {
        expect(k.body[t], `kpis ${s} has ${t}`).toBeTruthy();
        expect(Array.isArray(k.body[t].spark), `${s} ${t} sparkline`).toBe(true);
      }
    }
  });

  test('TC-MGMT-02 the default scope is 30 days, an unknown scope is 400 (guard)', async ({ page }) => {
    const dflt = await j(page, `${MGMT}/summary`);
    const thirty = await j(page, `${MGMT}/summary?scope=30d`);
    expect(dflt.status).toBe(200);
    expect(dflt.body.samplesReceived).toBe(thirty.body.samplesReceived);
    for (const bad of ['14d', 'YEAR', '7d;drop']) {
      expect((await j(page, `${MGMT}/kpis?scope=${encodeURIComponent(bad)}`)).status, `kpis scope "${bad}"`).toBe(400);
    }
  });

  test('TC-MGMT-03 the subtitle count and the Total samples tile agree, and match the database (guard)', async ({ page }) => {
    for (const s of ['7d', '90d', 'year']) {
      const sum = (await j(page, `${MGMT}/summary?scope=${s}`)).body;
      const k = (await j(page, `${MGMT}/kpis?scope=${s}`)).body;
      expect(Number(k.samples.value), `${s}: tile vs subtitle`).toBe(sum.samplesReceived);
      const spark = (k.samples.spark as Array<number | null>).reduce<number>((a, b) => a + Number(b ?? 0), 0);
      expect(spark, `${s}: sparkline sums to the total`).toBe(sum.samplesReceived);
    }
    const days = scopeDays('7d', new Date());
    const db = dbSql(`SELECT count(*) FROM clinlims.sample WHERE received_date >= current_date - ${days - 1} AND received_date < current_date + 1`);
    test.skip(db === null, 'no database on this stack');
    expect(Number(db), '7d total = samples received from today-7 to today').toBe((await j(page, `${MGMT}/summary?scope=7d`)).body.samplesReceived);
  });

  test('TC-MGMT-04 sparklines have one point per day up to 92 days, weekly beyond (guard)', async ({ page }) => {
    const today = new Date();
    for (const s of ['7d', '30d', '90d']) {
      const k = (await j(page, `${MGMT}/kpis?scope=${s}`)).body;
      expect(k.samples.spark.length, `${s} daily points`).toBe(scopeDays(s, today));
    }
    const y = (await j(page, `${MGMT}/kpis?scope=year`)).body;
    expect(y.samples.spark.length, 'year: weekly points').toBeGreaterThanOrEqual(52);
    expect(y.samples.spark.length, 'year: weekly points').toBeLessThanOrEqual(54);
  });

  test('TC-MGMT-05 a new order received today raises Total samples for 7 days by one (guard)', async ({ page }) => {
    const before = (await j(page, `${MGMT}/kpis?scope=7d`)).body.samples.value;
    const seed = await queueContext(page);
    await order(page, seed, [{ type: SERUM, tests: [TEST_IDS.GPT] }]);
    const after = (await j(page, `${MGMT}/kpis?scope=7d`)).body.samples.value;
    expect(Number(after)).toBe(Number(before) + 1);
  });

  test('TC-MGMT-06 percent tiles stay within 0 to 100 and carry their thresholds (guard)', async ({ page }) => {
    const k = (await j(page, `${MGMT}/kpis?scope=year`)).body;
    for (const t of ['onTime', 'rejection', 'qcPass']) {
      const v = k[t].value;
      if (v === null) continue; // no denominator in the window is allowed; a value outside 0..100 is not
      const n = Number(v);
      expect(Math.min(Math.max(n, 0), 100), `${t} = ${v} is a percentage`).toBe(n);
    }
    expect(k.onTime.thresholds).toMatchObject({ target: 90, action: 80, direction: 'HIGHER_BETTER' });
    expect(k.qcPass.thresholds).toMatchObject({ target: 95, action: 85, direction: 'HIGHER_BETTER' });
    expect(k.onTime.value, 'a year of testing data gives an on-time percentage').not.toBeNull();
    const tat = Number(k.medianTat.value);
    expect(Math.max(tat, 0), `median TAT ${k.medianTat.value} is not negative`).toBe(tat);
  });

  test('TC-MGMT-07 the grant is registered and given to Global Administrator and the EQA provider roles (guard)', async () => {
    const roles = dbSql(`SELECT string_agg(r.name, '|' ORDER BY r.name) FROM clinlims.system_role_module rm JOIN clinlims.system_role r ON r.id = rm.system_role_id JOIN clinlims.system_module m ON m.id = rm.system_module_id WHERE m.name = 'dashboards.view.management'`);
    test.skip(roles === null, 'no database on this stack');
    expect(roles!.split('|')).toContain('Global Administrator');
    const eqa = dbSql(`SELECT count(DISTINCT rm.system_role_id) FROM clinlims.system_role_module rm JOIN clinlims.system_module m ON m.id = rm.system_module_id WHERE m.name = 'qa.eqa.provider' AND rm.system_role_id NOT IN (SELECT rm2.system_role_id FROM clinlims.system_role_module rm2 JOIN clinlims.system_module m2 ON m2.id = rm2.system_module_id WHERE m2.name = 'dashboards.view.management')`);
    expect(Number(eqa), 'every qa.eqa.provider role also holds the dashboard grant').toBe(0);
  });
});

test.describe('Management Overview: access', () => {
  test('TC-MGMT-10 a Reports user without the grant gets 403 on both endpoints (guard)', async ({ page, browser }) => {
    await adminReady(page);
    const other = await pageAs(browser, page, QUEUE_USERS.heme);
    await other.goto('/');
    await other.waitForFunction(() => !!localStorage.getItem('CSRF'), null, { timeout: 30_000 });
    expect((await j(other, `${MGMT}/summary?scope=30d`)).status).toBe(403);
    expect((await j(other, `${MGMT}/kpis?scope=30d`)).status).toBe(403);
    await other.context().close();
  });

  test('TC-MGMT-11 a Reports user without the grant does not get the page (guard)', async ({ page, browser }) => {
    await adminReady(page);
    const other = await pageAs(browser, page, QUEUE_USERS.heme);
    await other.goto('/dashboards/management');
    await other.waitForTimeout(4000);
    await expect(other.getByTestId('mgmt-kpis')).toHaveCount(0);
    await other.context().close();
  });

  test('TC-MGMT-12 the side nav hides Management Overview from a user without the grant (FRS OGC-897)', async ({ page, browser }) => {
    // FRS: "SideNav item hidden for users without the grant".
    await adminReady(page);
    const other = await pageAs(browser, page, QUEUE_USERS.heme);
    await other.goto('/');
    await other.waitForTimeout(3000);
    const menu = await j(other, `${API}/menu`);
    const flat = JSON.stringify(menu.body ?? '');
    expect(flat.includes('menu_reports_management_overview'), 'the menu served to this user names the entry').toBe(false);
    await other.context().close();
  });
});

test.describe('Management Overview: screen', () => {
  test.beforeEach(async ({ page }) => { await adminReady(page); });

  test('TC-MGMT-20 Reports lists Management Overview first; the page shows heading, subtitle and five tiles (guard)', async ({ page }) => {
    const menu = await j(page, `${API}/menu`);
    const flat = JSON.stringify(menu.body ?? '');
    expect(flat).toContain('menu_reports_management_overview');
    await page.goto('/dashboards/management');
    await expect(page.getByRole('heading', { name: 'Management Overview' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('mgmt-subtitle')).toContainText(/samples received/);
    for (const t of TILES) await expect(page.getByTestId(`mgmt-kpi-${t}`)).toBeVisible({ timeout: 30_000 });
  });

  test('TC-MGMT-21 the chosen scope is remembered after a reload and drives the requests (guard)', async ({ page }) => {
    await page.goto('/dashboards/management');
    await expect(page.getByTestId('mgmt-kpis')).toBeVisible({ timeout: 30_000 });
    const req = page.waitForRequest((r) => /\/dashboards\/management\/kpis\?scope=90d/.test(r.url()));
    await page.getByRole('tab', { name: 'Last 90 days' }).click();
    await req;
    await page.reload();
    const again = page.waitForRequest((r) => /\/dashboards\/management\/kpis\?scope=90d/.test(r.url()), { timeout: 30_000 });
    await again;
    await expect(page.getByRole('tab', { name: 'Last 90 days' })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('tab', { name: 'Last 30 days' }).click();
  });

  test('TC-MGMT-22 Refresh reloads the data and then waits out its cooldown (guard)', async ({ page }) => {
    await page.goto('/dashboards/management');
    await expect(page.getByTestId('mgmt-kpis')).toBeVisible({ timeout: 30_000 });
    const btn = page.getByTestId('mgmt-refresh');
    const reload = page.waitForRequest((r) => /\/dashboards\/management\/(summary|kpis)/.test(r.url()));
    await btn.click();
    await reload;
    await expect(btn).toBeDisabled();
    await expect(btn).toBeEnabled({ timeout: 20_000 });
  });

  test('TC-MGMT-23 a failed KPI request shows an error, not five empty tiles (guard)', async ({ page }) => {
    await page.route('**/dashboards/management/kpis*', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{}' }));
    await page.goto('/dashboards/management');
    await expect(page.getByRole('heading', { name: 'Management Overview' })).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(3000);
    await expect(page.getByTestId('mgmt-kpis')).toHaveCount(0);
  });

  test('TC-MGMT-24 a phone-width viewport has no horizontal page scroll (guard)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/dashboards/management');
    await expect(page.getByTestId('mgmt-kpis')).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState('networkidle').catch(() => {});
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over).toBeLessThanOrEqual(1);
  });
});
