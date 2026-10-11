/**
 * helpers/catalogChaos.ts
 *
 * Shared drivers for the Test Catalog chaos suites (test-catalog-chaos-*.spec.ts, 2026-10-08).
 * test-catalog-chaos.spec.ts (2026-10-02) keeps its own copies of faultOnce/FAULTS.
 *
 * The ideas worth reusing:
 *   - faultOnce: break exactly one request of one method on one path, then let traffic through,
 *     so a "retry" in the same test really reaches the server.
 *   - FAULTS: the five ways a save can fail that a user can actually meet. "a login page with a
 *     200" is what a proxy or an expired session can hand back; the status-only fetch helpers in
 *     Utils.ts read it as success, which is why it is in the list.
 *   - asRole: a second browser context signed in as a seeded non-admin user (roles.setup.ts).
 */
import { expect, test, type Browser, type Page, type Route } from '@playwright/test';
import * as fs from 'fs';
import { apiGet, apiWrite, type ApiResult } from './silentSave';
import { open, seedNumericTest, toasts } from './catalogUi';

export const TC = '/rest/test-catalog';
export const RUN = `${Date.now()}`.slice(-5);

/** Open the app once, so relative REST calls have an origin and a CSRF token. */
export async function ensureOpen(page: Page) {
  if (page.url() === 'about:blank') await open(page, '/');
}

let seq = 0;
const activated: string[] = [];
/** A fresh inactive CLINICAL numeric test (Serum, Biochemistry). Names carry the run stamp. */
export async function seedTest(page: Page, label: string, opts: { sampleTypeId?: string; labUnitId?: string; activate?: boolean } = {}) {
  seq++;
  await open(page, '/');
  const t = await seedNumericTest(page, {
    name: `QA CX ${label} ${RUN}`, code: `QCX${seq}${RUN}`, description: `QA CX ${label} ${RUN}`,
    sampleTypeId: opts.sampleTypeId, labUnitId: opts.labUnitId, activate: opts.activate,
  });
  if (opts.activate) activated.push(t.id);
  return t;
}

/** LIMS rule: deactivate, never delete. Switch off every test this worker activated. Call from afterAll. */
export async function retireSeeded(browser: Browser) {
  if (!activated.length) return;
  const ctx = await browser.newContext({ storageState: '.auth/user.json', ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  await open(page, '/');
  for (const id of activated.splice(0)) {
    const b = await apiGet<any>(page, `${TC}/tests/${id}/basic-info`);
    if (b.json?.active) await apiWrite(page, 'PUT', `${TC}/tests/${id}/basic-info`, { ...b.json, active: false, orderable: false });
  }
  await ctx.close();
}

/** Dictionary ids for two plain answers, found by name on this instance. */
export async function dictIds(page: Page): Promise<{ pos: string; neg: string }> {
  const find = async (q: string, want: RegExp) => {
    const r = await apiGet<any[]>(page, `${TC}/dictionary?search=${encodeURIComponent(q)}`);
    const hit = (r.json ?? []).find((d: any) => want.test(String(d.name)));
    expect(hit, `dictionary entry for ${want}`).toBeTruthy();
    return String(hit.id);
  };
  return { pos: await find('Positive', /^Positive$/), neg: await find('Negative', /^Negative$/) };
}

export const sampleResultsOf = async (page: Page, id: string) => {
  const r = await apiGet<any>(page, `${TC}/tests/${id}/sample-results`);
  expect(r.status, `read sample-results of ${id}`).toBe(200);
  return r.json;
};

/** One component in the shape the editor PUTs. */
export function component(over: Record<string, unknown>) {
  return {
    code: 'PRIMARY', label: 'QA', resultType: 'N', isPrimary: true, displayOrder: 1, showOnReport: true,
    significantDigits: 1, allowMultipleReadings: false, options: [], interpretations: [], ...over,
  };
}

export const putSampleResults = (page: Page, id: string, components: unknown[]) =>
  apiWrite<any>(page, 'PUT', `${TC}/tests/${id}/sample-results`, { testId: id, components });

/** Turn a seeded numeric test into a coded (D) test with Positive/Negative options. */
export async function makeCoded(page: Page, id: string) {
  const { pos, neg } = await dictIds(page);
  const sr = await sampleResultsOf(page, id);
  const c = sr.components[0];
  const w = await putSampleResults(page, id, [component({
    id: c.id, label: c.label, resultType: 'D',
    options: [{ value: pos, sortOrder: 1, normal: false, qualifiable: false }, { value: neg, sortOrder: 2, normal: true, qualifiable: false }],
  })]);
  expect(w.status, `make ${id} coded: ${w.text.slice(0, 160)}`).toBe(200);
  return { pos, neg, componentId: String(c.id) };
}

export const errorToasts = async (page: Page) => (await toasts(page)).filter((t) => t.kind === 'error');

/** Fail only the next matching request of `method`, then let traffic through again. */
export async function faultOnce(page: Page, method: string, re: RegExp, fault: (route: Route) => Promise<void>) {
  let fired = false;
  await page.route((u) => re.test(u.pathname), async (route) => {
    if (fired || route.request().method() !== method) return route.continue();
    fired = true;
    await fault(route);
  });
  return () => fired;
}

/** Fail every matching request of `method` until the returned function is called. */
export async function faultAlways(page: Page, method: string, re: RegExp, fault: (route: Route) => Promise<void>) {
  const handler = async (route: Route) => (route.request().method() === method ? fault(route) : route.continue());
  const matcher = (u: URL) => re.test(u.pathname);
  await page.route(matcher, handler);
  return () => page.unroute(matcher, handler);
}

const LOGIN_HTML = '<!doctype html><html><body><h1>Login</h1><form><input name="loginName"></form></body></html>';
export const FAULTS: Record<string, (route: Route) => Promise<void>> = {
  '500 JSON': (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"status":500,"error":"Internal Server Error"}' }),
  '500 HTML': (r) => r.fulfill({ status: 500, contentType: 'text/html', body: '<html><body><h1>HTTP Status 500</h1></body></html>' }),
  'dropped connection': (r) => r.abort('connectionreset'),
  'login page with a 200': (r) => r.fulfill({ status: 200, contentType: 'text/html', body: LOGIN_HTML }),
  '422 empty body': (r) => r.fulfill({ status: 422, body: '' }),
};

/** A page signed in as a seeded role user (roles.setup.ts must have run against this BASE). */
export async function asRole(browser: Browser, key: 'receptionist' | 'labtech' | 'validator') {
  const state = `.auth/role-${key}.json`;
  test.skip(!fs.existsSync(state), `${state} missing: run --project=setup-roles (rbac.config.ts) against this BASE first`);
  const ctx = await browser.newContext({ storageState: state, ignoreHTTPSErrors: true });
  const p = await ctx.newPage();
  await open(p, '/');
  return p;
}

/** A second admin page on the same browser (separate context, same stored session). */
export async function secondAdmin(browser: Browser) {
  const ctx = await browser.newContext({ storageState: '.auth/user.json', ignoreHTTPSErrors: true });
  return ctx.newPage();
}

/** True when a write was accepted. 2xx only. */
export const accepted = (r: ApiResult) => r.status >= 200 && r.status < 300;

/** Note an observed contract on the test, so a report reader sees what the server did. */
export function observe(what: string, r: ApiResult | number) {
  const status = typeof r === 'number' ? r : r.status;
  const body = typeof r === 'number' ? '' : ` ${r.text.slice(0, 160)}`;
  test.info().annotations.push({ type: 'observed', description: `${what}: ${status}${body}` });
}

/** Wait for the section's Save, click it, return the response of the matching write. */
export async function clickSave(page: Page, method: string, re: RegExp, name: RegExp = /^save$/i) {
  const resp = page.waitForResponse((r) => r.request().method() === method && re.test(new URL(r.url()).pathname), { timeout: 30_000 });
  await page.getByRole('button', { name }).last().click();
  return resp;
}
