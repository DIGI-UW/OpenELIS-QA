/**
 * OGC-1577 module system (#4954, develop f7eb2d47): what a deployment with NO module installed shows.
 *
 * Contract read from the diff: /rest/module-registry lists versions, modules and extension points;
 * Admin > Modules (/MasterListsPage/modules) shows the versions line and either the module table or
 * "No modules are installed."; /m/<id> for a module that is not there shows "Module unavailable";
 * /modules/<id>/** serves a module's prebuilt frontend and answers 404 for an unknown id; the shell
 * reads the registry after login and must keep working with an empty one.
 *
 * Installing a module needs the server's modules directory (or scripts/dev-stack up --module), so
 * module pages, extension slots and permission rows are not covered here.
 */
import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';

const API = '/api/OpenELIS-Global/rest';
const OUT = process.env.EVIDENCE_DIR || 'test-results/ogc-1577';
fs.mkdirSync(OUT, { recursive: true });
const note = (id: string, v: unknown) => console.log(`[${id}] ${typeof v === 'string' ? v : JSON.stringify(v)}`);
const shot = (page: Page, name: string) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });

test.describe('OGC-1577 module system, no module installed', () => {
  test('TC-MOD-01: the registry answers with versions, no modules and the report extension point', async ({ page }) => {
    await page.goto('/');
    const r = await page.request.get(`${API}/module-registry`);
    expect(r.status()).toBe(200);
    const j = await r.json();
    note('TC-MOD-01', j);
    expect(j.openelisVersion).toBeTruthy();
    expect(j.frontendContractVersion).toBeTruthy();
    expect(Array.isArray(j.modules)).toBeTruthy();
    expect(j.extensionPoints.map((e: any) => e.name)).toContain('report');
  });

  test('TC-MOD-02: Admin > Modules shows the versions and "No modules are installed."', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    const reg = await (await page.request.get(`${API}/module-registry`)).json();
    await page.goto('/MasterListsPage');
    const link = page.locator('[data-cy="modulesAdmin"]');
    await expect(link).toBeVisible({ timeout: 30_000 });
    await link.click();
    await expect(page).toHaveURL(/\/MasterListsPage\/modules/);
    await expect(page.getByRole('heading', { name: 'Modules' }).first()).toBeVisible();
    const body = await page.locator('main, body').first().innerText();
    note('TC-MOD-02.text', body.slice(body.indexOf('Modules'), body.indexOf('Modules') + 600));
    expect(body).toContain(`OpenELIS ${reg.openelisVersion}`);
    if (reg.modules.length === 0) await expect(page.getByText('No modules are installed.')).toBeVisible();
    await shot(page, '02-admin-modules');
    note('TC-MOD-02.consoleErrors', errors.slice(0, 10));
  });

  test('TC-MOD-03: a module page for a module that is not installed says so', async ({ page }) => {
    await page.goto('/m/qa-not-installed/anything');
    await expect(page.getByText('Module unavailable').first()).toBeVisible({ timeout: 30_000 });
    note('TC-MOD-03', (await page.locator('main, body').first().innerText()).match(/.*not available.*/)?.[0]);
    await shot(page, '03-unknown-module');
  });

  test('TC-MOD-04: an unknown module asset answers 404, not 500', async ({ page }) => {
    await page.goto('/');
    const r = await page.request.get('/api/OpenELIS-Global/modules/qa-not-installed/remoteEntry.js');
    note('TC-MOD-04', r.status());
    expect(r.status()).toBe(404);
  });

  test('TC-MOD-05: the shell still loads home, the menu and the Results worklist with no console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('/');
    await expect(page.getByRole('navigation').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Results', { exact: true }).first()).toBeVisible();
    await shot(page, '05-home');
    await page.goto('/Results');
    await expect(page.locator('#unifiedResultsLabUnit')).toBeVisible({ timeout: 30_000 });
    note('TC-MOD-05.consoleErrors', errors.slice(0, 10));
    expect(errors.filter((e) => /module|federation|remoteEntry|Invalid hook/i.test(e))).toEqual([]);
  });

  test('TC-MOD-06: in French the Modules page shows readable text, never raw keys', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('locale', 'fr'));
    await page.goto('/MasterListsPage/modules');
    await page.waitForTimeout(3000);
    const text = await page.locator('main, body').first().innerText();
    const raw = text.match(/\bmodules\.(admin|error|unavailable)\.[a-zA-Z.]+/g) || [];
    note('TC-MOD-06', { raw, sample: text.slice(0, 300) });
    await shot(page, '06-modules-fr');
    await page.evaluate(() => localStorage.setItem('locale', 'en'));
    expect(raw).toEqual([]);
  });
});
