/**
 * test-catalog-chaos.spec.ts
 *
 * Non-happy-path ("chaos") cases for the Test Catalog editor: what the user sees and what the
 * server keeps when a save fails, races another editor, or is fed values it should refuse.
 * The happy paths live in test-catalog-mgmt*.spec.ts and test-catalog-section-depth.spec.ts.
 *
 * Every save-fault case asks the same four questions:
 *   1. Was the user told it failed (an error notification, and no success one)?
 *   2. Is what they typed still on screen?
 *   3. Is the server unchanged?
 *   4. Does a plain retry work once the fault clears?
 *
 * Faults are injected with page.route on the one request under test, so nothing on the server
 * is broken for anyone else. Written 2026-10-02 against local develop (images 2026-10-01).
 *
 * Tripwires (test.fail, flip when fixed). Each was confirmed through the API and the UI:
 *   CHAOS-BI-07  a description over 255 characters answers 500 (column is varchar 255), not a 400
 *   CHAOS-RG-01  the ranges API stores a normal range whose low is above its high
 *   CHAOS-RG-02  the ranges API stores a normal range wider than the valid range
 * Only the Add range dialog checks bound order today (CHAOS-RG-03 holds that guard).
 *
 * Settled while writing this (not a defect): a blank critical bound is stored as +Infinity in
 * result_limits.low_critical. That is the ResultLimit default meaning "unset"; every reader
 * checks Double.isFinite before comparing, and the API omits it. CHAOS-RG-06 pins the
 * API side of that contract.
 *
 * Data: QA-named tests "QA Chaos <case> <run>", created inactive, never activated.
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import { apiGet, apiWrite } from './helpers/silentSave';
import { open, watchToasts, toasts, successToasts, seedNumericTest, rangesOf, nextResponse } from './helpers/catalogUi';

const RUN = `${Date.now()}`.slice(-5);
const TC = '/rest/test-catalog';
const BASIC = /\/rest\/test-catalog\/tests\/\d+\/basic-info$/;
const RANGES = /\/rest\/test-catalog\/tests\/\d+\/ranges$/;

let seq = 0;
async function seed(page: Page, label: string) {
  seq++;
  await open(page, '/');
  return seedNumericTest(page, { name: `QA Chaos ${label} ${RUN}`, code: `QCH${seq}${RUN}`, description: `QA Chaos ${label} ${RUN}` });
}

const basicOf = async (page: Page, id: string) => (await apiGet<any>(page, `${TC}/tests/${id}/basic-info`)).json;
const errorToasts = async (page: Page) => (await toasts(page)).filter((t) => t.kind === 'error');

/** Fail only the next matching write, then let traffic through again. */
async function faultOnce(page: Page, method: string, re: RegExp, fault: (route: Route) => Promise<void>) {
  let fired = false;
  await page.route((u) => re.test(u.pathname), async (route) => {
    if (fired || route.request().method() !== method) return route.continue();
    fired = true;
    await fault(route);
  });
  return () => fired;
}

const FAULTS: Record<string, (route: Route) => Promise<void>> = {
  'a 500 with a JSON body': (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"status":500,"error":"Internal Server Error"}' }),
  'a 500 with an HTML error page': (r) => r.fulfill({ status: 500, contentType: 'text/html', body: '<html><body><h1>HTTP Status 500</h1></body></html>' }),
  'a dropped connection': (r) => r.abort('connectionreset'),
  'a login page in place of JSON (session ended at a proxy)': (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body><h1>Login</h1><form><input name="loginName"></form></body></html>' }),
};

test.describe('Test Catalog chaos: Basic Info save faults (TC-CHAOS-BI)', () => {
  // Each case seeds its own test, so one failure does not stop the rest.

  Object.entries(FAULTS).forEach(([what, fault], i) => {
    const n = i + 1; // per-case constant: descriptions must be unique across tests (test_desc_uk)
    const id = `CHAOS-BI-0${n}`;
    test(`${id}: a Basic Info save that meets ${what} says so, keeps the typing, changes nothing, and a retry saves`, async ({ page }) => {
      const t = await seed(page, `BI${n}`);
      const before = await basicOf(page, t.id);
      const typed = `QA Chaos BI${n} edited ${RUN}`;
      await open(page, `/MasterListsPage/TestCatalogEditor/${t.id}/basic-info`);
      const desc = page.locator('#basic-info-description');
      await desc.waitFor({ state: 'visible', timeout: 60_000 });
      await watchToasts(page);
      await desc.fill(typed);
      const fired = await faultOnce(page, 'PUT', BASIC, fault);
      const save = page.getByRole('button', { name: /^save$/i }).last();
      await save.click();
      await expect.poll(fired, { message: 'the fault was injected on the save' }).toBe(true);
      await expect.poll(async () => (await errorToasts(page)).length, { message: 'the user is told the save failed', timeout: 15_000 }).toBeGreaterThan(0);
      expect(await successToasts(page), 'no success notification after a failed save').toHaveLength(0);
      await expect(desc, 'what the user typed is still in the field').toHaveValue(typed);
      await expect(save, 'Save is usable again').toBeEnabled();
      expect((await basicOf(page, t.id)).description, 'the server kept the old description').toBe(before.description);

      await watchToasts(page);
      const resp = nextResponse(page, 'PUT', BASIC);
      await save.click();
      const retry = await resp;
      const sent = JSON.parse(retry.request().postData() ?? '{}');
      expect(retry.status(), `the retry reaches the server and saves (sent lastupdated ${sent.lastupdated}, server had ${before.lastupdated}): ${(await retry.text()).slice(0, 200)}`).toBe(200);
      await expect.poll(async () => (await successToasts(page)).length, { message: 'the retry is confirmed' }).toBeGreaterThan(0);
      expect((await basicOf(page, t.id)).description, 'the retry stored the edit').toBe(typed);
    });
  });

  test('CHAOS-BI-05: two editors on one test: the later Save is refused as stale, keeps its typing and does not overwrite', async ({ page, browser }) => {
    const t = await seed(page, 'BI5');
    const a = page;
    const b = await (await browser.newContext({ storageState: '.auth/user.json' })).newPage();
    for (const p of [a, b]) {
      await open(p, `/MasterListsPage/TestCatalogEditor/${t.id}/basic-info`);
      await p.locator('#basic-info-description').waitFor({ state: 'visible', timeout: 60_000 });
    }
    const fromB = `QA Chaos BI5 from B ${RUN}`;
    const fromA = `QA Chaos BI5 from A ${RUN}`;
    await b.locator('#basic-info-description').fill(fromB);
    const rb = nextResponse(b, 'PUT', BASIC);
    await b.getByRole('button', { name: /^save$/i }).last().click();
    expect((await rb).status(), 'B saves first').toBe(200);

    await a.locator('#basic-info-description').fill(fromA);
    const ra = nextResponse(a, 'PUT', BASIC);
    await a.getByRole('button', { name: /^save$/i }).last().click();
    expect((await ra).status(), 'A saved on an old copy: the server answers 409').toBe(409);
    await expect(a.getByTestId('basic-info-stale-save'), 'A is told someone else saved first').toBeVisible();
    await expect(a.getByTestId('basic-info-stale-save').getByRole('button', { name: /refresh/i }), 'with a way to reload').toBeVisible();
    await expect(a.locator('#basic-info-description'), 'A keeps what they typed').toHaveValue(fromA);
    await expect(a.getByRole('button', { name: /^save$/i }).last(), 'A cannot save over B until they reload').toBeDisabled();
    expect((await basicOf(a, t.id)).description, "B's save stands").toBe(fromB);
    await b.context().close();
  });

  test('CHAOS-BI-06: markup typed into the description is stored and shown as text, never run', async ({ page }) => {
    const t = await seed(page, 'BI6');
    const markup = `QA <b>bold</b><img src=x onerror="window.__qaXss=1"> ${RUN}`;
    let dialogs = 0;
    page.on('dialog', (d) => { dialogs++; void d.dismiss(); });
    await open(page, `/MasterListsPage/TestCatalogEditor/${t.id}/basic-info`);
    const desc = page.locator('#basic-info-description');
    await desc.waitFor({ state: 'visible', timeout: 60_000 });
    await desc.fill(markup);
    const resp = nextResponse(page, 'PUT', BASIC);
    await page.getByRole('button', { name: /^save$/i }).last().click();
    expect((await resp).status()).toBe(200);
    expect((await basicOf(page, t.id)).description, 'stored as typed').toBe(markup);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#basic-info-description'), 'shown back as plain text').toHaveValue(markup, { timeout: 60_000 });
    expect(await page.evaluate(() => (window as any).__qaXss ?? 0), 'the onerror handler never ran').toBe(0);
    expect(await page.locator('main img[src="x"]').count(), 'no <img> was injected into the page').toBe(0);
    expect(dialogs, 'no dialog was raised').toBe(0);
  });

  test('CHAOS-BI-07: TRIPWIRE - a description longer than the column is refused with a 400, not a 500', async ({ page }) => {
    test.fail(true, 'CHAOS-BI-07: a 300-character description answers 500 (test.description is varchar 255, no length check); flips when it answers 400');
    const t = await seed(page, 'BI7');
    const before = await basicOf(page, t.id);
    const w = await apiWrite<any>(page, 'PUT', `${TC}/tests/${t.id}/basic-info`, { ...before, description: `QA Chaos BI7 ${'x'.repeat(300)}` });
    expect((await basicOf(page, t.id)).description, 'nothing stored either way').toBe(before.description);
    expect(w.status, `long description: ${w.text.slice(0, 160)}`).toBe(400);
  });

  test('CHAOS-BI-08: a Save sent without lastupdated is not checked for staleness (recorded, not judged)', async ({ page }) => {
    // The UI always sends lastupdated, so this matters only for API clients. Kept as a record of the
    // contract so a change either way is noticed; Casey to rule whether it should be required.
    const t = await seed(page, 'BI8');
    const stale = await basicOf(page, t.id);
    expect((await apiWrite(page, 'PUT', `${TC}/tests/${t.id}/basic-info`, { ...stale, description: `QA Chaos BI8 first ${RUN}` })).status).toBe(200);
    const withOld = await apiWrite(page, 'PUT', `${TC}/tests/${t.id}/basic-info`, { ...stale, description: `QA Chaos BI8 old copy ${RUN}` });
    expect(withOld.status, 'an old lastupdated is refused').toBe(409);
    const without = await apiWrite(page, 'PUT', `${TC}/tests/${t.id}/basic-info`, { ...stale, lastupdated: undefined, description: `QA Chaos BI8 no stamp ${RUN}` });
    test.info().annotations.push({ type: 'contract', description: `PUT basic-info without lastupdated answered ${without.status}` });
    expect([200, 400, 409], 'answered cleanly').toContain(without.status);
  });
});

test.describe('Test Catalog chaos: Ranges (TC-CHAOS-RG)', () => {
  const base = (c: string) => ({ componentId: c, gender: '', minAge: 0, maxAge: null, lowValid: 0, highValid: 50 });

  test('CHAOS-RG-01: TRIPWIRE - the ranges API refuses a normal range whose low is above its high', async ({ page }) => {
    test.fail(true, 'CHAOS-RG-01: PUT ranges stores lowNormal 9 / highNormal 2 with a 200; only the dialog checks order. Flips when the server refuses it');
    const t = await seed(page, 'RG1');
    const w = await apiWrite(page, 'PUT', `${TC}/tests/${t.id}/ranges`, { testId: t.id, ranges: [{ ...base(t.componentId), lowNormal: 9, highNormal: 2 }] });
    expect(w.status, `inverted normal range: ${w.text.slice(0, 160)}`).toBe(400);
  });

  test('CHAOS-RG-02: TRIPWIRE - the ranges API refuses a normal range wider than the valid range', async ({ page }) => {
    test.fail(true, 'CHAOS-RG-02: PUT ranges stores normal 3-80 inside valid 0-50 with a 200. Flips when the server refuses it');
    const t = await seed(page, 'RG2');
    const w = await apiWrite(page, 'PUT', `${TC}/tests/${t.id}/ranges`, { testId: t.id, ranges: [{ ...base(t.componentId), lowNormal: 3, highNormal: 80 }] });
    expect(w.status, `normal outside valid: ${w.text.slice(0, 160)}`).toBe(400);
  });

  test('CHAOS-RG-03: the Add range dialog refuses bounds out of order and sends nothing', async ({ page }) => {
    const t = await seed(page, 'RG3');
    await open(page, `/MasterListsPage/TestCatalogEditor/${t.id}/ranges`);
    await page.getByTestId('add-range').click();
    const dlg = page.getByRole('dialog').last();
    await expect(dlg).toBeVisible();
    await dlg.locator('#range-lowNormal').fill('9');
    await dlg.locator('#range-highNormal').fill('2');
    let puts = 0;
    page.on('request', (r) => { if (r.method() === 'PUT' && RANGES.test(new URL(r.url()).pathname)) puts++; });
    await dlg.getByRole('button', { name: /^save$/i }).click();
    await expect(dlg, 'the dialog stays open').toBeVisible();
    await expect(dlg.locator('.cds--inline-notification--error, [role="alert"], [role="status"]').first(), 'an error explains the bounds').toBeVisible();
    await dlg.getByRole('button', { name: /^cancel$/i }).click();
    expect(puts, 'nothing was sent').toBe(0);
    expect(await rangesOf(page, t.id), 'no range stored').toHaveLength(0);
  });

  /** Add one Normal 3-5 range through the dialog; the section is then dirty but unsaved. */
  async function addRangeInDialog(page: Page, low = '3', high = '5') {
    await page.getByTestId('add-range').click();
    const dlg = page.getByRole('dialog').last();
    await expect(dlg).toBeVisible();
    await dlg.locator('#range-lowNormal').fill(low);
    await dlg.locator('#range-highNormal').fill(high);
    await dlg.getByRole('button', { name: /^save$/i }).click();
    await expect(dlg).toBeHidden();
    await expect(page.getByTestId('ranges-section').locator('tbody tr'), 'the range is in the working set').toHaveCount(1);
  }

  test('CHAOS-RG-04: double-clicking the section Save stores one range, not two', async ({ page }) => {
    const t = await seed(page, 'RG4');
    await open(page, `/MasterListsPage/TestCatalogEditor/${t.id}/ranges`);
    await page.getByTestId('add-range').waitFor({ state: 'visible', timeout: 60_000 });
    await addRangeInDialog(page);
    let puts = 0;
    page.on('request', (r) => { if (r.method() === 'PUT' && RANGES.test(new URL(r.url()).pathname)) puts++; });
    await page.getByRole('button', { name: /^save$/i }).last().dblclick();
    await expect.poll(async () => (await rangesOf(page, t.id)).length, { message: 'the range is stored' }).toBeGreaterThan(0);
    await page.waitForTimeout(1500);
    test.info().annotations.push({ type: 'observed', description: `PUTs sent on double-click: ${puts}` });
    expect(await rangesOf(page, t.id), 'exactly one range').toHaveLength(1);
  });

  test('CHAOS-RG-05: a ranges save that fails keeps the unsaved range on screen, says so, and a retry saves', async ({ page }) => {
    const t = await seed(page, 'RG5');
    await open(page, `/MasterListsPage/TestCatalogEditor/${t.id}/ranges`);
    await page.getByTestId('add-range').waitFor({ state: 'visible', timeout: 60_000 });
    await watchToasts(page);
    await addRangeInDialog(page);
    const fired = await faultOnce(page, 'PUT', RANGES, FAULTS['a 500 with a JSON body']);
    const save = page.getByRole('button', { name: /^save$/i }).last();
    await save.click();
    await expect.poll(fired).toBe(true);
    await expect.poll(async () => (await errorToasts(page)).length, { message: 'the user is told', timeout: 15_000 }).toBeGreaterThan(0);
    expect(await successToasts(page)).toHaveLength(0);
    await expect(page.getByTestId('ranges-section').locator('tbody tr'), 'the unsaved range is still listed').toHaveCount(1);
    expect(await rangesOf(page, t.id), 'nothing stored').toHaveLength(0);
    const resp = nextResponse(page, 'PUT', RANGES);
    await save.click();
    expect((await resp).status(), 'retry').toBe(200);
    expect(await rangesOf(page, t.id), 'the retry stored the range').toHaveLength(1);
  });

  test('CHAOS-RG-06: a range saved with blank critical bounds reads back with no critical bounds', async ({ page }) => {
    // Stored as +Infinity (the ResultLimit "unset" default); the API must keep hiding it.
    const t = await seed(page, 'RG6');
    await open(page, `/MasterListsPage/TestCatalogEditor/${t.id}/ranges`);
    await page.getByTestId('add-range').waitFor({ state: 'visible', timeout: 60_000 });
    await addRangeInDialog(page);
    const resp = nextResponse(page, 'PUT', RANGES);
    await page.getByRole('button', { name: /^save$/i }).last().click();
    expect((await resp).status()).toBe(200);
    const [r] = await rangesOf(page, t.id);
    expect(Number(r.lowNormal)).toBe(3);
    expect(r.lowCritical ?? null, 'no low critical').toBeNull();
    expect(r.highCritical ?? null, 'no high critical').toBeNull();
    const raw = (await apiGet(page, `${TC}/tests/${t.id}/ranges`)).text;
    expect(raw, 'no Infinity leaks into the JSON').not.toMatch(/Infinity/);
  });

  test('CHAOS-RG-07: a non-number in a bound is refused with a 400 and stores nothing', async ({ page }) => {
    const t = await seed(page, 'RG7');
    const w = await apiWrite(page, 'PUT', `${TC}/tests/${t.id}/ranges`, { testId: t.id, ranges: [{ ...base(t.componentId), lowNormal: 'abc', highNormal: 5 }] });
    expect(w.status, w.text.slice(0, 160)).toBe(400);
    expect(await rangesOf(page, t.id)).toHaveLength(0);
  });
});
