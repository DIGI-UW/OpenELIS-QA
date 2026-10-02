/**
 * tests/helpers/locations.ts
 *
 * Shared plumbing for the Locations & Organizations specs (OGC-1363, OpenELIS-Global-2 #4500):
 * the REST calls the page makes (run inside the page so the CSRF token and session match the
 * UI), an optional database read-back for local stacks, and QA-named fixture builders.
 *
 * Read references/playwright-notes/locations-organizations.md before changing anything here.
 */
import { expect, Page, Locator } from '@playwright/test';
import { execFileSync } from 'child_process';

export const API = '/api/OpenELIS-Global';
export const LOCATIONS = '/MasterListsPage/locations';
export const SEARCH_PLACEHOLDER = 'Search by name, code or any identifier';

const BASE = process.env.BASE ?? process.env.BASE_URL ?? '';
/**
 * Database read-back only on a local docker stack. LOC_DB names the database container; it
 * defaults to the oedevqa container when BASE is localhost:10443 and is off everywhere else
 * (testing.openelis-global.org has no DB access), so DB assertions there are skipped, not failed.
 */
export const DB_CONTAINER =
  process.env.LOC_DB ?? (/localhost:10443/.test(BASE) ? 'openelisglobal-database-dev' : '');

/** One SQL statement, unaligned, `|`-separated rows. Returns null when no DB is configured. */
export function db(sql: string): string | null {
  if (!DB_CONTAINER) return null;
  try {
    return dbRaw(sql);
  } catch (e) {
    return `DB-ERROR ${(e as Error).message.split('\n').slice(0, 3).join(' ')}`;
  }
}

function dbRaw(sql: string): string {
  return execFileSync(
    'docker',
    ['exec', '-i', DB_CONTAINER, 'psql', '-U', 'clinlims', '-d', 'clinlims', '-At', '-F', '|', '-c', sql],
    { encoding: 'utf8', env: { ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH}` } },
  ).trim();
}

/** Escape a value for a SQL string literal (fixtures only ever pass QA-generated text). */
export const lit = (v: string) => `'${v.replace(/'/g, "''")}'`;

export type ApiResult = { status: number; json: any; text: string };

/** A JSON call made from inside the page, the way locationsApi.js makes it. */
export async function api(page: Page, method: string, url: string, body?: unknown): Promise<ApiResult> {
  return page.evaluate(
    async ({ api, method, url, body }) => {
      const csrf = localStorage.getItem('CSRF') || '';
      const r = await fetch(api + url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf, Accept: 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await r.text();
      let json: any = null;
      try { json = JSON.parse(text); } catch { /* not JSON */ }
      return { status: r.status, json, text: text.slice(0, 6000) };
    },
    { api: API, method, url, body },
  );
}

/** POST /rest/locations/import/{preview|apply} with CSV files, as ImportExportView sends them. */
export async function importCall(
  page: Page,
  stage: 'preview' | 'apply',
  files: { name: string; content: string; area?: string; encoding?: 'latin1' }[],
  mode: 'merge' | 'replace' = 'merge',
  decisions?: Record<string, { choice: string; remember: boolean }>,
  renames?: Record<string, string>,
): Promise<ApiResult> {
  return page.evaluate(
    async ({ api, stage, files, mode, decisions, renames }) => {
      const csrf = localStorage.getItem('CSRF') || '';
      const form = new FormData();
      for (const f of files) {
        const bytes = f.encoding === 'latin1'
          ? new Uint8Array([...f.content].map((c) => c.charCodeAt(0) & 0xff))
          : new TextEncoder().encode(f.content);
        form.append('files', new Blob([bytes], { type: 'text/csv' }), f.name);
        form.append('areas', f.area ?? 'organizations');
      }
      form.append('mode', mode);
      if (decisions) form.append('decisions', JSON.stringify(decisions));
      if (renames) form.append('renames', JSON.stringify(renames));
      const r = await fetch(`${api}/rest/locations/import/${stage}`, {
        method: 'POST', credentials: 'include', headers: { 'X-CSRF-Token': csrf }, body: form,
      });
      const text = await r.text();
      let json: any = null;
      try { json = JSON.parse(text); } catch { /* not JSON */ }
      return { status: r.status, json, text: text.slice(0, 20000) };
    },
    { api: API, stage, files, mode, decisions, renames },
  );
}

export async function lists(page: Page) {
  const r = await api(page, 'GET', '/rest/locations/lists');
  expect(r.status, 'GET /rest/locations/lists').toBe(200);
  return r.json;
}

/** Type id by name, case- and space-insensitive ("referral lab" finds "referralLab"). */
export function typeId(l: any, name: string): string {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');
  const t = (l.facilityTypes || []).find((x: any) => norm(x.name) === norm(name));
  if (!t) throw new Error(`no organization type "${name}" in ${JSON.stringify((l.facilityTypes || []).map((x: any) => x.name))}`);
  return t.id;
}

export async function getDetail(page: Page, id: string) {
  const r = await api(page, 'GET', `/rest/locations/organizations/${id}`);
  expect(r.status, `GET organization ${id}: ${r.text.slice(0, 300)}`).toBe(200);
  return r.json;
}

export async function listOrgs(page: Page, params: Record<string, string>) {
  const q = new URLSearchParams(params).toString();
  const r = await api(page, 'GET', `/rest/locations/organizations?${q}`);
  expect(r.status, `list ${q}`).toBe(200);
  return r.json as { items: any[]; total: number };
}

/** Create through REST (fixtures only; the UI create path has its own case). Returns the id. */
export async function createOrg(page: Page, body: Record<string, unknown>): Promise<string> {
  const r = await api(page, 'POST', '/rest/locations/organizations', { kind: 'facility', identifiers: [], ...body });
  expect(r.status, `create ${JSON.stringify(body).slice(0, 200)}: ${r.text.slice(0, 400)}`).toBe(201);
  return r.json.detail.row.id;
}

export async function createArea(page: Page, name: string, code: string, parentId: string | null): Promise<string> {
  const r = await api(page, 'POST', '/rest/locations/areas', { name, code, parentId });
  expect(r.status, `create area ${name}: ${r.text.slice(0, 300)}`).toBe(201);
  return r.json.id;
}

export async function createWard(page: Page, orgId: string, body: Record<string, unknown>): Promise<string> {
  const r = await api(page, 'POST', `/rest/locations/organizations/${orgId}/wards`, body);
  expect(r.status, `create ward ${JSON.stringify(body)}: ${r.text.slice(0, 300)}`).toBe(201);
  return r.json.id;
}

export async function setActive(page: Page, ids: string[], active: boolean, includeChildren = false) {
  return api(page, 'POST', '/rest/locations/organizations/active', { ids, active, includeChildren });
}

/** Leave QA records the way the standing rules want them: deactivated, never deleted. */
export async function retire(page: Page, ids: string[]) {
  if (ids.length) await setActive(page, ids, false, true).catch(() => undefined);
}

/** Open the Organizations (or Sites) list on a search, wait for the table to settle. */
export async function openList(page: Page, view: '' | 'sites' = '', query: Record<string, string> = {}) {
  const qs = new URLSearchParams(query).toString();
  await page.goto(`${LOCATIONS}${view ? `/${view}` : ''}${qs ? `?${qs}` : ''}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId(view === 'sites' ? 'locations-sites' : 'locations-organizations')).toBeVisible({ timeout: 60_000 });
  await page.waitForLoadState('networkidle').catch(() => undefined);
}

export const rows = (page: Page) => page.locator('[data-testid^="locations-row-"]');

/** Search the list and wait for exactly `count` rows. */
export async function search(page: Page, text: string, count?: number) {
  // The box is debounced (300 ms) and the list has no stale-response guard: wait for the answer to THIS query, so a
  // row expanded before the search (after Add, say) has collapsed and an older answer cannot land afterwards.
  const answered = page.waitForResponse((r) => {
    const u = new URL(r.url());
    return u.pathname.endsWith('/rest/locations/organizations') && (u.searchParams.get('q') ?? '') === text.trim();
  }, { timeout: 15_000 }).catch(() => undefined);
  await page.getByPlaceholder(SEARCH_PLACEHOLDER).fill(text);
  await answered;
  if (count !== undefined) await expect(rows(page)).toHaveCount(count, { timeout: 15_000 });
}

/** Open a record's inline form with its Edit button (never by clicking the row: AC25). */
export async function openEdit(page: Page, id: string): Promise<Locator> {
  const form = page.getByTestId(`locations-form-${id}`);
  // After Add, or a ward/name search, the row is already expanded and its button reads "Close":
  // clicking it again would collapse the form.
  if (!(await form.isVisible().catch(() => false))) await page.getByTestId(`locations-edit-${id}`).click();
  await expect(form.locator(`#name-${id}`)).toBeVisible({ timeout: 15_000 });
  // The form loads its detail after it mounts; a value typed before that is overwritten.
  await expect(form.locator(`#name-${id}`)).not.toHaveValue('', { timeout: 15_000 });
  return form;
}

/** Pick option(s) in a Carbon FilterableMultiSelect by visible text. */
export async function pickTypes(page: Page, form: Locator, id: string, names: string[]) {
  for (const n of names) {
    await form.locator(`#types-${id}`).click();
    await page.getByRole('listbox').getByRole('option', { name: new RegExp(`^${n}$`, 'i') }).first().click();
    await page.keyboard.press('Escape');
  }
}

/** Pick an area in the Location ComboBox (typeahead after 2 characters, 300 ms debounce). */
export async function pickLocation(page: Page, form: Locator, id: string, areaName: string) {
  const box = form.locator(`#location-${id}`);
  await box.click();
  await box.fill(areaName);
  const opt = page.getByRole('option', { name: new RegExp(areaName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first();
  await expect(opt).toBeVisible({ timeout: 15_000 });
  await opt.click();
}

/** The page notification (success, warning or error) that LocationsPage renders. */
export const notice = (page: Page) => page.locator('.locationsToast').first();

export const stamp = () => `${Date.now()}`.slice(-6);

/** True when any part of the element is inside the viewport (the user can see it without scrolling). */
export async function inView(l: Locator): Promise<boolean> {
  return l.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
  }).catch(() => false);
}
