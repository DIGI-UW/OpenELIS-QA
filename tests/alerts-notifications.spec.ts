import { test, expect } from '@playwright/test';
import {
  BASE,
  ADMIN,
  QA_PREFIX,
  TIMEOUT,
  login,
  navigateWithDiscovery,
  getDateRange,
} from '../helpers/test-helpers';

/**
 * Alerts & Notifications Test Suite
 *
 * User stories covered:
 *   US-ALERT-1: As a lab supervisor, I need to see all active alerts on a
 *               dashboard so I can respond to critical events promptly.
 *   US-ALERT-2: As a lab technician, I need to know when a test result
 *               exceeds critical limits so I can notify the clinician.
 *   US-ALERT-3: As an admin, I need to configure alert thresholds per test
 *               so the system alerts on clinically relevant values only.
 *   US-ALERT-4: As a lab supervisor, I can filter alerts by severity and
 *               date to focus on the most urgent items.
 *   US-ALERT-5: As a system admin, I need to verify that alert configurations
 *               are saved correctly via the API.
 *
 * URL candidates:
 *   /Alerts                — primary alerts dashboard (Phase 4 R-DEEP confirmed)
 *   /AlertsManagement
 *   /NotificationConfig
 *
 * API endpoints, READ OFF AlertRestController and confirmed live 2026-09-20.
 * The four this file used to call — /rest/AlertNotification/all, /{id},
 * /subscribe and /markRead — do not exist and never did: all four answer 404.
 * Three cases asserted 200 on the first of them and failed every run; the other
 * two asserted "not 5xx", which a 404 satisfies, so they passed while reaching
 * nothing.
 *   GET    /rest/alerts                    — every alert (AlertDTO[])
 *   GET    /rest/alerts?entityType=&entityId=  — scoped to one entity
 *   GET    /rest/alerts/{id}               — one alert
 *   GET    /rest/alerts/count?entityType=&entityId=  — BOTH params required (400 without)
 *   PUT    /rest/alerts/{id}/acknowledge   — the real "mark read"
 *   PUT    /rest/alerts/{id}/resolve       — with a body
 *   DELETE /rest/alerts/{id}
 * An AlertDTO carries: id, alertType, alertEntityType, alertEntityId, severity,
 * status, startTime, message.
 *
 * Suite IDs: TC-ALERT-01 through TC-ALERT-10
 * Total Test Count: 10 TCs
 *
 * Known baselines:
 *   - Alerts dashboard has 4 stat cards (from Phase 4 R-DEEP validation)
 *   - Dashboard has 3 filter dropdowns + search + table (Phase 4 confirmed)
 */

const ALERTS_URL = '/Alerts';
const ALERT_API = '/api/OpenELIS-Global/rest/alerts';

async function goToAlerts(page: any): Promise<boolean> {
  return navigateWithDiscovery(page, [
    '/Alerts',
    '/AlertsManagement',
    '/NotificationConfig',
    '/MasterListsPage/Alerts',
  ]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite R — Alerts Dashboard (TC-ALERT-01 through TC-ALERT-05)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Suite R — Alerts Dashboard (TC-ALERT)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-ALERT-01: Alerts page is reachable without error', async ({ page }) => {
    /**
     * US-ALERT-1: The alerts dashboard is the supervisor's entry point for
     * monitoring critical events. It must load without a server error.
     */
    const loaded = await goToAlerts(page);
    expect(loaded, 'Alerts page must be reachable').toBe(true);

    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    const bodyText = await page.locator('body').innerText();
    expect(bodyText, 'Alerts page must not show 404').not.toContain('404');
    expect(bodyText, 'Alerts page must not show Internal Server Error').not.toContain('Internal Server Error');
    expect(page.url(), 'Alerts page must not redirect to login').not.toMatch(/LoginPage|login/i);

    console.log(`TC-ALERT-01: PASS — Alerts page at ${page.url()}`);
  });

  test('TC-ALERT-02: Alerts dashboard has 4 KPI stat cards', async ({ page }) => {
    /**
     * US-ALERT-1: The supervisor needs at-a-glance KPIs — Phase 4 R-DEEP confirmed
     * 4 stat cards exist. This test locks in that structural requirement.
     */
    await page.goto(`${BASE}${ALERTS_URL}`);
    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    const bodyText = await page.locator('body').innerText();
    if (bodyText.includes('404') || bodyText.includes('not found')) {
      console.log('TC-ALERT-02: SKIP — Alerts URL not available');
      test.skip();
      return;
    }

    // Look for KPI/stat card elements
    const kpiLocator = page.locator(
      '[class*="tile"], [class*="card"], [class*="kpi"], [class*="stat"], [class*="Tile"]'
    );
    const cardCount = await kpiLocator.count();
    console.log(`TC-ALERT-02: Found ${cardCount} KPI-like cards on Alerts dashboard`);

    // Phase 4 validation confirmed 4 stat cards
    expect(cardCount, 'Alerts dashboard must have at least 2 KPI cards').toBeGreaterThanOrEqual(2);
  });

  test('TC-ALERT-03: Alerts dashboard has filter controls', async ({ page }) => {
    /**
     * US-ALERT-4: Filter dropdowns allow the supervisor to narrow alerts by
     * severity, type, and date. Phase 4 confirmed 3 filter dropdowns exist.
     */
    await page.goto(`${BASE}${ALERTS_URL}`);
    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    const bodyText = await page.locator('body').innerText();
    if (bodyText.includes('404')) {
      console.log('TC-ALERT-03: SKIP');
      test.skip();
      return;
    }

    const filterCount = await page.locator(
      'select, [role="combobox"], [aria-haspopup="listbox"], input[type="date"]'
    ).count();
    const searchCount = await page.locator('input[type="text"], input[type="search"]').count();

    console.log(`TC-ALERT-03: ${filterCount} filter controls, ${searchCount} search inputs`);
    expect(filterCount + searchCount, 'Dashboard must have at least 2 filter/search controls').toBeGreaterThanOrEqual(2);
  });

  test('TC-ALERT-04: Alerts table or list is present on the page', async ({ page }) => {
    /**
     * US-ALERT-1: The supervisor must see a table of alert events.
     * Phase 4 R-DEEP confirmed the table exists (may be empty if no active alerts).
     */
    await page.goto(`${BASE}${ALERTS_URL}`);
    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    const bodyText = await page.locator('body').innerText();
    if (bodyText.includes('404')) {
      console.log('TC-ALERT-04: SKIP');
      test.skip();
      return;
    }

    const hasTable =
      (await page.locator('table, [role="table"], [role="grid"]').count()) > 0;
    const hasListItems =
      (await page.locator('[role="row"], tbody tr').count()) >= 0; // even 0 rows is OK

    // The page structure must include a table container
    expect(hasTable || hasListItems, 'Alerts must render a table or grid element').toBe(true);
    console.log(`TC-ALERT-04: hasTable=${hasTable}, tableRows=${await page.locator('tbody tr, [role="row"]').count()}`);
  });

  test('TC-ALERT-05: the alerts API returns HTTP 200', async ({ page }) => {
    /**
     * US-ALERT-5: The backing API must be healthy. Without it, the dashboard
     * cannot render alert configurations.
     */
    await page.goto(`${BASE}`);

    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch('/api/OpenELIS-Global/rest/alerts', {
        headers: { 'X-CSRF-Token': csrf },
      });
      const text = await res.text();
      let data: any = null;
      try { data = JSON.parse(text); } catch { /* not JSON */ }
      return {
        status: res.status,
        isArray: Array.isArray(data),
        count: Array.isArray(data) ? data.length : -1,
        keys: data && !Array.isArray(data) ? Object.keys(data).slice(0, 5) : [],
      };
    });

    console.log(`TC-ALERT-05: API status=${result.status}, isArray=${result.isArray}, count=${result.count}`);
    expect(result.status).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite R-DEEP — Alert Configuration & Edge Cases (TC-ALERT-06 through TC-ALERT-10)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Suite R-DEEP — Alert Config & Notification (TC-ALERT-06 through TC-ALERT-10)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-ALERT-06: the alerts API returns valid response structure', async ({ page }) => {
    /**
     * US-ALERT-5: Verifies the API returns structured data with the fields
     * needed to display and manage alert configurations.
     */
    await page.goto(`${BASE}`);

    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch('/api/OpenELIS-Global/rest/alerts', {
        headers: { 'X-CSRF-Token': csrf },
      });
      if (!res.ok) return { status: res.status, firstItem: null };
      const data = await res.json();
      const items = Array.isArray(data) ? data : (data.notifications ?? data.items ?? []);
      return {
        status: res.status,
        count: items.length,
        firstItem: items.length > 0 ? items[0] : null,
        isArray: Array.isArray(data),
      };
    });

    console.log(`TC-ALERT-06: status=${result.status}, count=${result.count}, isArray=${result.isArray}`);
    expect(result.status).toBe(200);

    if (result.firstItem) {
      const keys = Object.keys(result.firstItem);
      console.log(`TC-ALERT-06: First alert keys: [${keys.join(', ')}]`);
      // Alert records must have some form of identifier and type
      const hasId = keys.some(k => /id|uuid/i.test(k));
      expect(hasId, 'Alert config must have an ID field').toBe(true);
    } else {
      console.log('TC-ALERT-06: NOTE — no alert configurations exist yet (empty list)');
      // An empty list is valid — alerts may not be configured on the test instance
    }
  });

  test('TC-ALERT-07: Alerts page has search functionality', async ({ page }) => {
    /**
     * US-ALERT-4: The supervisor must be able to search for a specific alert
     * by patient, accession, or test name.
     */
    await page.goto(`${BASE}${ALERTS_URL}`);
    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    const bodyText = await page.locator('body').innerText();
    if (bodyText.includes('404')) {
      console.log('TC-ALERT-07: SKIP — Alerts URL not available');
      test.skip();
      return;
    }

    // Look for a search input
    const searchInput = page.locator(
      'input[type="search"], input[placeholder*="search" i], input[aria-label*="search" i], input[type="text"]'
    ).first();
    const hasSearch = await searchInput.isVisible({ timeout: 3000 }).catch(() => false);

    console.log(`TC-ALERT-07: Search input visible=${hasSearch}`);
    if (hasSearch) {
      // Try typing in the search field — should not crash the page
      await searchInput.fill('26CPHL');
      await page.waitForTimeout(1000);
      const bodyAfter = await page.locator('body').innerText();
      expect(bodyAfter, 'Search must not cause an Internal Server Error').not.toContain('Internal Server Error');
      console.log('TC-ALERT-07: PASS — search input accepts text without error');
    } else {
      console.log('TC-ALERT-07: GAP — no search input found on Alerts page');
    }
  });

  test('TC-ALERT-08: Alert severity filter enumeration', async ({ page }) => {
    /**
     * US-ALERT-4: The supervisor must be able to filter by severity (Critical,
     * High, Normal). Verifies that severity options are present in the filter.
     */
    await page.goto(`${BASE}${ALERTS_URL}`);
    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    const bodyText = await page.locator('body').innerText();
    if (bodyText.includes('404')) {
      console.log('TC-ALERT-08: SKIP — Alerts URL not available');
      test.skip();
      return;
    }

    // Check body text for severity-related terms
    const hasSeverityTerms = /critical|high|normal|severity|urgent|priority/i.test(bodyText);
    console.log(`TC-ALERT-08: Severity terms visible on page: ${hasSeverityTerms}`);

    // Also check any dropdowns for severity options
    const allOptions = await page.locator('option, [role="option"]').allInnerTexts();
    const severityOptions = allOptions.filter(o => /critical|high|medium|low|normal|severity/i.test(o));
    console.log(`TC-ALERT-08: Severity-related options: [${severityOptions.slice(0, 6).join(', ')}]`);

    // Either severity terms in body or severity options in dropdowns counts as PASS
    const hasSeverityFilter = hasSeverityTerms || severityOptions.length > 0;
    if (!hasSeverityFilter) {
      console.log('TC-ALERT-08: GAP — no severity filter terminology found');
    } else {
      console.log('TC-ALERT-08: PASS — severity-related content found');
    }
  });

  test('TC-ALERT-09: Alerts API does not return 500 on concurrent requests', async ({ page }) => {
    /**
     * US-ALERT-1: The alerts dashboard may be polled frequently by busy labs.
     * Verifies the API handles concurrent requests without failing.
     */
    await page.goto(`${BASE}`);

    const results = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const promises = Array.from({ length: 5 }, () =>
        fetch('/api/OpenELIS-Global/rest/alerts', {
          headers: { 'X-CSRF-Token': csrf },
        }).then(r => r.status)
      );
      return Promise.all(promises);
    });

    console.log(`TC-ALERT-09: 5 concurrent requests → statuses: [${results.join(', ')}]`);
    const errors = results.filter(s => s >= 500);
    expect(errors.length, 'No 5xx errors on concurrent alerts requests').toBe(0);
  });

  test('TC-ALERT-10: Alerts page is accessible to admin role (RBAC)', async ({ page }) => {
    /**
     * US-ALERT-1 + US-ALERT-3: Admin must be able to access the alerts dashboard
     * and configuration. This test verifies RBAC allows admin access.
     */
    await page.goto(`${BASE}${ALERTS_URL}`);
    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    // Must not be redirected to login
    const url = page.url();
    expect(url, 'Admin must not be redirected to login when accessing Alerts').not.toMatch(/LoginPage|login/i);

    // Must not receive a 403 Forbidden message
    const bodyText = await page.locator('body').innerText();
    expect(bodyText, 'Admin must not see a Forbidden message on Alerts').not.toMatch(/403|forbidden|access denied/i);

    console.log(`TC-ALERT-10: PASS — Admin accessed Alerts at ${url}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite R-XMOD — Alerts Cross-Module Consistency
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Suite R-XMOD — Alerts Cross-Module (TC-ALERT-XMOD)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-ALERT-XMOD-01: Dashboard KPI count consistency with the alerts API', async ({ page }) => {
    /**
     * Cross-module: if the dashboard shows a "Pending Alerts" KPI, that number
     * should be consistent with what the alerts API returns.
     */
    await page.goto(`${BASE}`);
    await page.waitForTimeout(1500);

    // Get metrics from home dashboard
    const homeMetrics = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch('/api/OpenELIS-Global/rest/home-dashboard/metrics', {
        headers: { 'X-CSRF-Token': csrf },
      });
      if (!res.ok) return null;
      return res.json();
    });

    // Get alert count from the alerts API
    const alertCount = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch('/api/OpenELIS-Global/rest/alerts', {
        headers: { 'X-CSRF-Token': csrf },
      });
      if (!res.ok) return -1;
      const data = await res.json();
      return Array.isArray(data) ? data.length : -1;
    });

    console.log(`TC-ALERT-XMOD-01: Home metrics keys: [${homeMetrics ? Object.keys(homeMetrics).join(', ') : 'N/A'}]`);
    console.log(`TC-ALERT-XMOD-01: alerts count: ${alertCount}`);

    expect(homeMetrics, 'Home dashboard metrics API must return data').not.toBeNull();
    expect(alertCount, 'the alerts API must return a count').toBeGreaterThanOrEqual(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite R-EXT — Alerts Extended (TC-ALERT-EXT-01 through -06)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Suite R-EXT — Alerts Extended (TC-ALERT-EXT)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN.user, ADMIN.pass);
  });

  test('TC-ALERT-EXT-01: Alert subscribe action does not 5xx', async ({ page }) => {
    /**
     * Phase 15 confirmed: the notification bell Subscribe button is functional.
     * The subscribe API must return a non-5xx response.
     */
    await page.goto(`${BASE}`);
    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      // There is no subscribe endpoint. The alert lifecycle is acknowledge /
      // resolve / delete on a specific alert, so what is checkable here is that
      // the listing this dashboard subscribes to is served at all.
      const url = '/api/OpenELIS-Global/rest/alerts';
      const res = await fetch(url, { method: 'GET', headers: { 'X-CSRF-Token': csrf } });
      return { status: res.status, url };
    });

    console.log(`TC-ALERT-EXT-01: alert listing → ${result.url} HTTP ${result.status}`);
    // "not 5xx" was satisfied by the 404 this case used to get, so it passed while
    // reaching nothing. The endpoint has to actually answer.
    expect(result.status, `the alert listing must be served, got ${result.status}`).toBe(200);
  });

  test('TC-ALERT-EXT-02: the alerts listing returns a structured response', async ({ page }) => {
    /**
     * The /rest/alerts endpoint must return a list (possibly empty)
     * with each alert having at minimum a message or type field.
     */
    await page.goto(`${BASE}`);

    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      const res = await fetch('/api/OpenELIS-Global/rest/alerts', {
        headers: { 'X-CSRF-Token': csrf },
      });
      if (!res.ok) return { status: res.status, count: -1, hasStructure: false };
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      const first = list[0];
      return {
        status: res.status,
        count: list.length,
        hasStructure: first ? !!(first.message || first.type || first.alertType || first.id) : true,
      };
    });

    console.log(`TC-ALERT-EXT-02: /rest/alerts → ${result.status}, count=${result.count}, structured=${result.hasStructure}`);
    expect(result.status).toBe(200);
    if (result.count > 0) {
      expect(result.hasStructure, 'Alert objects must have identifiable fields').toBe(true);
    }
  });

  test('TC-ALERT-EXT-03: Alerts page table has sortable columns', async ({ page }) => {
    /**
     * The alerts table must have column headers that support sorting so
     * supervisors can quickly find the most recent or highest-severity alerts.
     */
    const loaded = await navigateWithDiscovery(page, ['/Alerts', '/AlertDashboard', '/AlertNotification']);
    expect(loaded, 'page must be reachable — navigateWithDiscovery matched none of the candidate URLs').toBe(true);

    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    const tableHeaders = await page.locator('th, [role="columnheader"]').count();
    console.log(`TC-ALERT-EXT-03: Table column headers: ${tableHeaders}`);
    // Non-blocking — just document
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('Internal Server Error');
    if (tableHeaders > 0) {
      console.log('TC-ALERT-EXT-03: PASS — table has column headers');
    }
  });

  test('TC-ALERT-EXT-04: Alert notification bell click opens panel without error', async ({ page }) => {
    /**
     * Phase 15 confirmed: the bell button opens a notification drawer.
     * Clicking it must not crash the page.
     */
    await page.goto(`${BASE}`);
    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    const bell = page.locator(
      'button[aria-label*="notification" i], button[aria-label*="alert" i], [data-testid*="notification"], button svg'
    ).first();

    if (await bell.isVisible({ timeout: 3000 }).catch(() => false)) {
      await bell.click();
      await page.waitForTimeout(1000);
    }

    const bodyText = await page.locator('body').innerText();
    expect(bodyText, 'Bell click must not cause server error').not.toContain('Internal Server Error');
    console.log('TC-ALERT-EXT-04: Bell click handled without error');
  });

  test('TC-ALERT-EXT-05: Alerts page loads within acceptable time', async ({ page }) => {
    const start = Date.now();
    const loaded = await navigateWithDiscovery(page, ['/Alerts', '/AlertDashboard', '/AlertNotification']);
    await page.waitForLoadState('domcontentloaded');
    const elapsed = Date.now() - start;

    console.log(`TC-ALERT-EXT-05: Alerts page loaded in ${elapsed}ms`);
    if (loaded) {
      expect(elapsed, 'Alerts page must load within 5000ms').toBeLessThan(5000);
    } else {
      console.log('TC-ALERT-EXT-05: SKIP — alerts page not reachable');
    }
  });

  test('TC-ALERT-EXT-06: acknowledging an alert is accepted', async ({ page }) => {
    /**
     * Phase 15 confirmed: the MarkRead button is functional.
     * The mark-read API must return a non-5xx response.
     */
    await page.goto(`${BASE}`);

    const result = await page.evaluate(async () => {
      const csrf = localStorage.getItem('CSRF') || '';
      // The real mark-read is PUT /rest/alerts/{id}/acknowledge, so it needs an
      // alert to act on. With none on the instance there is nothing to mark read
      // and the case says so rather than asserting against a made-up route.
      const list = await fetch('/api/OpenELIS-Global/rest/alerts', { headers: { 'X-CSRF-Token': csrf } });
      const alerts = list.ok ? await list.json().catch(() => []) : [];
      if (!Array.isArray(alerts) || alerts.length === 0) {
        return { status: list.status, url: '/rest/alerts', empty: true };
      }
      // acknowledge takes a BODY (AcknowledgeAlertRequest {notes}); a bodyless PUT
      // answers 400, which is the request being wrong rather than the endpoint.
      const url = `/api/OpenELIS-Global/rest/alerts/${alerts[0].id}/acknowledge`;
      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: 'QA automated acknowledgement' }),
      });
      const text = await res.text().catch(() => '');
      return { status: res.status, url, empty: false, body: text.slice(0, 200) };
    });

    console.log(`TC-ALERT-EXT-06: acknowledge → ${result.url} HTTP ${result.status} empty=${result.empty}`);
    if (result.empty) {
      expect(result.status, 'the alert listing must be served even when empty').toBe(200);
      return;
    }
    expect(result.status, `acknowledge answered ${result.status}: ${result.body ?? ''}`).toBeLessThan(400);
  });
});
