/**
 * helpers/catalogUi.ts
 *
 * Small, shared UI drivers for Test Catalog editor specs. Written for
 * test-catalog-section-depth.spec.ts; test-catalog-silent-actions.spec.ts predates it and
 * keeps its own copies.
 *
 * The one idea worth reusing: record every notification as it MOUNTS, with its kind, so a
 * case can compare what the user was told with what the server stored. Toasts auto-dismiss
 * and several editor actions reload the section, so reading the DOM afterwards misses them.
 */
import { expect, type Page } from '@playwright/test';
import { apiGet, apiWrite } from './silentSave';
import { performUiLogin, saveAuthState } from '../tests/helpers/session';

export type Toast = { kind: 'success' | 'error' | 'warning' | 'info' | 'unknown'; text: string };

/** Start (or reset) the notification recorder for this page. */
export async function watchToasts(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as any;
    w.__qaToasts = [];
    if (w.__qaToastObs) return;
    const SEL = '.cds--toast-notification, .cds--actionable-notification, .cds--inline-notification';
    w.__qaToastObs = new MutationObserver((ms) => {
      for (const m of ms) for (const n of Array.from(m.addedNodes)) {
        if (!(n instanceof HTMLElement)) continue;
        const el = n.matches(SEL) ? n : (n.querySelector(SEL) as HTMLElement | null);
        if (!el) continue;
        const c = el.className;
        const kind = /--success/.test(c) ? 'success' : /--error/.test(c) ? 'error'
          : /--warning/.test(c) ? 'warning' : /--info/.test(c) ? 'info' : 'unknown';
        w.__qaToasts.push({ kind, text: (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 200) });
      }
    });
    w.__qaToastObs.observe(document.body, { childList: true, subtree: true });
  });
}

export const toasts = (page: Page): Promise<Toast[]> => page.evaluate(() => (window as any).__qaToasts ?? []);
export const successToasts = async (page: Page) => (await toasts(page)).filter((t) => t.kind === 'success');

/**
 * Navigate and wait until the SPA has a session (CSRF token present).
 *
 * If the page lands on the login form instead, the session was ended under us. On testing this
 * happens when another Playwright run logs in as the same admin (seen 2026-09-23: six cases in
 * one run became login-page timeouts). Re-login once through the harness's single login path,
 * refresh the shared storage state, and retry, so a concurrent run cannot pass for a product bug.
 */
export async function open(page: Page, path: string): Promise<void> {
  const hasCsrf = () => page.waitForFunction(() => !!localStorage.getItem('CSRF'), null, { timeout: 15_000 })
    .then(() => true, () => false);
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  if (await hasCsrf()) return;
  const onLogin = await page.getByRole('heading', { name: /^login$/i }).isVisible().catch(() => false);
  if (!onLogin) {
    await page.waitForFunction(() => !!localStorage.getItem('CSRF'), null, { timeout: 30_000 });
    return;
  }
  console.log(`[session-guard] catalogUi.open: signed out on ${path}; re-login`);
  await performUiLogin(page);
  await saveAuthState(page);
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!localStorage.getItem('CSRF'), null, { timeout: 30_000 });
}

/** The response to the next matching request the UI fires. Arm it BEFORE the click. */
export function nextResponse(page: Page, method: string, re: RegExp, timeout = 30_000) {
  return page.waitForResponse(
    (r) => r.request().method() === method && re.test(new URL(r.url()).pathname), { timeout });
}

/**
 * Pick an option from a Carbon ComboBox by exact text. Opens the menu with the chevron
 * ("Open") when there is one, because on some editor comboboxes typing filters to nothing
 * (see TC-SD-12) and clicking the input does not always open the menu.
 */
export async function pickComboOption(page: Page, inputId: string, optionText: string): Promise<void> {
  const input = page.locator(`#${inputId}`);
  await input.scrollIntoViewIfNeeded();
  const wrapper = page.locator('.cds--combo-box, .cds--list-box__wrapper').filter({ has: input }).first();
  const chevron = wrapper.getByRole('button', { name: /^open$/i });
  if (await chevron.count()) await chevron.first().click(); else await input.click();
  await page.getByRole('option', { name: optionText, exact: true }).first().click();
}

/** Fill a Carbon text/number input by id and blur it so React commits the value. */
export async function fillById(page: Page, id: string, value: string): Promise<void> {
  const el = page.locator(`#${id}`);
  await el.scrollIntoViewIfNeeded();
  await el.fill(value);
  await el.press('Tab');
}

// ---------------------------------------------------------------------------------------------
// REST seeding (setup is not the thing under test)
// ---------------------------------------------------------------------------------------------
const TC = '/rest/test-catalog';

/** Create a CLINICAL test on the given sample type, give it a numeric PRIMARY, optionally activate. */
export async function seedNumericTest(page: Page, opts: {
  name: string; code: string; description?: string; sampleTypeId?: string; labUnitId?: string; activate?: boolean;
}): Promise<{ id: string; componentId: string }> {
  const created = await apiWrite<any>(page, 'POST', `${TC}/tests`, {
    name: opts.name, reportingName: opts.name, code: opts.code, domain: 'CLINICAL',
    labUnitId: opts.labUnitId ?? '56', sampleTypeIds: [opts.sampleTypeId ?? '2'],
    description: opts.description ?? `${opts.name} ${opts.code}`,
  });
  expect(created.status, `seed test ${opts.code}: ${created.text.slice(0, 160)}`).toBe(201);
  const id = String(created.json?.testId ?? created.json?.id);
  const sr = await apiGet<any>(page, `${TC}/tests/${id}/sample-results`);
  const pid = sr.json?.components?.[0]?.id;
  const put = await apiWrite(page, 'PUT', `${TC}/tests/${id}/sample-results`, {
    testId: id, components: [{ id: pid, code: 'PRIMARY', label: opts.name, resultType: 'N', isPrimary: true,
      displayOrder: 1, showOnReport: true, significantDigits: 1, allowMultipleReadings: false, options: [], interpretations: [] }],
  });
  expect(put.status, `seed numeric component on ${id}`).toBe(200);
  const sr2 = await apiGet<any>(page, `${TC}/tests/${id}/sample-results`);
  const componentId = String(sr2.json?.components?.[0]?.id ?? '');
  if (opts.activate) {
    const act = await apiWrite(page, 'POST', `${TC}/tests/${id}/activate`, { gapsAcknowledged: 'qa' });
    expect(act.status, `activate ${id}: ${act.text.slice(0, 160)}`).toBe(200);
  }
  return { id, componentId };
}

export async function rangesOf(page: Page, testId: string): Promise<any[]> {
  const r = await apiGet<any>(page, `${TC}/tests/${testId}/ranges`);
  expect(r.status, `read ranges of ${testId}`).toBe(200);
  return r.json?.ranges ?? [];
}

export async function storageOf(page: Page, testId: string): Promise<any> {
  const r = await apiGet<any>(page, `${TC}/tests/${testId}/storage`);
  expect(r.status, `read storage of ${testId}`).toBe(200);
  return r.json;
}
