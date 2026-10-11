/**
 * test-catalog-chaos-links.spec.ts
 *
 * Test Catalog chaos, part 3 of 5: what a test is LINKED to, and how it is born and retired.
 * Methods (TC-CX-ME), Reagents (TC-CX-RE), Panels (TC-CX-PN), Display Order (TC-CX-DO),
 * creating a test (TC-CX-CR) and activation/deactivation (TC-CX-AV).
 *
 * Same five kinds of non-happy path as parts 1 and 2. Lifecycle cases read each step back on a
 * second surface where one exists: order entry's /rest/sample-type-tests, /rest/methods-for-test,
 * and the test-side /panels list.
 * Catalogue: test-catalog-chaos-full.md. Data: QA CX tests, QACX panels and methods.
 */
import { test, expect, type Page } from '@playwright/test';
import { apiGet, apiWrite } from './helpers/silentSave';
import { open, watchToasts, successToasts } from './helpers/catalogUi';
import { TC, RUN, seedTest, errorToasts, faultOnce, FAULTS, observe } from './helpers/catalogChaos';
import { retireSeeded } from './helpers/catalogChaos';

test.afterAll(async ({ browser }) => retireSeeded(browser));

// ---------------------------------------------------------------------------------------------
// Methods
// ---------------------------------------------------------------------------------------------
const ME = (id: string) => `/rest/test/${id}/methods`;
const today = new Date().toISOString().slice(0, 10);
let mseq = 0;
async function newMethod(page: Page, testId: string, isDefault = false) {
  mseq++;
  const code = `QX${RUN}${mseq}`.slice(0, 10);
  const w = await apiWrite<any>(page, 'POST', `${ME(testId)}/inline-create`, { nameEnglish: `QACX M${mseq} ${RUN}`.slice(0, 20), nameFrench: `QACX M${mseq} ${RUN}`.slice(0, 20), code, isDefault, effectiveDate: today });
  expect(w.status, `inline-create method: ${w.text.slice(0, 160)}`).toBe(201);
  return w.json;
}
const linksOf = async (page: Page, id: string) => (await apiGet<any[]>(page, ME(id))).json ?? [];

test.describe('Test Catalog chaos: Methods (TC-CX-ME)', () => {
  test('TC-CX-ME-01: a method name padded with spaces past the 20-character limit is a 4xx, not a 500', async ({ page }) => {
    test.fail(true, 'TRIPWIRE F19: a padded name passes the trimmed 20-character check, then overflows the column (500)');
    const t = await seedTest(page, 'ME1');
    const w = await apiWrite(page, 'POST', `${ME(t.id)}/inline-create`, { nameEnglish: `  ${'A'.repeat(20)}`, nameFrench: 'QACX fr', code: `QY${RUN}`, isDefault: false, effectiveDate: today });
    expect(w.status, w.text.slice(0, 160)).toBeLessThan(500);
    expect(w.status).toBeGreaterThanOrEqual(400);
  });

  test('TC-CX-ME-02: a duplicate method NAME with a new code is reported as a duplicate name, not a duplicate code', async ({ page }) => {

    test.fail(true, 'TRIPWIRE F14: a duplicate method name is answered "Method code already exists"');
    const t = await seedTest(page, 'ME2');
    const m = await newMethod(page, t.id);
    const w = await apiWrite(page, 'POST', `${ME(t.id)}/inline-create`, { nameEnglish: m.methodName, nameFrench: m.methodName, code: `QZ${RUN}`, isDefault: false, effectiveDate: today });
    expect(w.status, 'refused').toBe(409);
    expect(w.text, 'the message names the real problem').not.toMatch(/code already exists/i);
  });

  test('TC-CX-ME-03: setting a removed method as default (from an old page) does not clear the real default', async ({ page }) => {

    test.fail(true, 'TRIPWIRE F17: PATCH isDefault on a removed link clears the real default (methods-for-test has none)');
    const t = await seedTest(page, 'ME3');
    const m1 = await newMethod(page, t.id, true);
    const m2 = await newMethod(page, t.id, false);
    expect((await apiWrite(page, 'DELETE', `${ME(t.id)}/${m2.id}`)).status, 'B removes method 2').toBe(204);
    const w = await apiWrite(page, 'PATCH', `${ME(t.id)}/${m2.id}`, { isDefault: true }); // A clicks its radio
    observe('PATCH isDefault on the removed link', w);
    const forTest = (await apiGet<any>(page, `/rest/methods-for-test/${t.id}`)).json;
    test.info().annotations.push({ type: 'observed', description: `methods-for-test default: ${forTest?.defaultMethodId}` });
    expect(String(forTest?.defaultMethodId), 'method 1 is still the default').toBe(String(m1.methodId));
  });

  test('TC-CX-ME-04: removing a method link that fails on the server is reported, and the link stays listed', async ({ page }) => {
    test.fail(true, 'TRIPWIRE F15: a failed method unlink is silent (handleRemove ignores the status and just reloads)');
    const t = await seedTest(page, 'ME4');
    await newMethod(page, t.id, true);
    await open(page, `/MasterListsPage/TestCatalogEditor/${t.id}/methods`);
    const remove = page.getByTestId('methods-section').getByRole('button', { name: /^remove$/i }).first();
    await remove.waitFor({ state: 'visible', timeout: 60_000 });
    const fired = await faultOnce(page, 'DELETE', /\/rest\/test\/\d+\/methods\/[^/]+$/, FAULTS['500 JSON']);
    await remove.click();
    await expect.poll(fired).toBe(true);
    await expect(page.getByTestId('methods-section').locator('.cds--inline-notification--error'), 'the failure is shown').toBeVisible();
    expect(await linksOf(page, t.id), 'the link is still there').toHaveLength(1);
  });

  test('TC-CX-ME-05: lifecycle: link, make default, change the date, unlink, unlink again; methods-for-test follows', async ({ page }) => {
    const t = await seedTest(page, 'ME5');
    const m1 = await newMethod(page, t.id, true);
    const m2 = await newMethod(page, t.id, false);
    const forTest = async () => (await apiGet<any>(page, `/rest/methods-for-test/${t.id}`)).json;
    expect(String((await forTest()).defaultMethodId), 'applied: m1 default').toBe(String(m1.methodId));
    expect((await apiWrite(page, 'PATCH', `${ME(t.id)}/${m2.id}`, { isDefault: true })).status).toBe(200);
    expect(String((await forTest()).defaultMethodId), 'edited: m2 default').toBe(String(m2.methodId));
    expect((await apiWrite(page, 'PATCH', `${ME(t.id)}/${m1.id}`, { effectiveDate: '2026-01-01' })).status).toBe(200);
    expect((await linksOf(page, t.id)).find((l: any) => l.id === m1.id)?.effectiveDate, 'date changed').toMatch(/2026-01-01/);
    expect((await apiWrite(page, 'DELETE', `${ME(t.id)}/${m2.id}`)).status).toBe(204);
    expect((await linksOf(page, t.id)).map((l: any) => l.id), 'unlinked').toEqual([m1.id]);
    expect([204, 404], 'a second unlink is answered cleanly').toContain((await apiWrite(page, 'DELETE', `${ME(t.id)}/${m2.id}`)).status);
  });
});

// ---------------------------------------------------------------------------------------------
// Reagents
// ---------------------------------------------------------------------------------------------
const RE = (id: string) => `${TC}/${id}/reagents`;
async function reagents(page: Page, n = 2) {
  const r = await apiGet<any[]>(page, '/rest/inventory/items/type/REAGENT');
  const list = (r.json ?? []).filter((x: any) => x.isActive === 'Y' || x.isActive === true);
  expect(list.length, 'active reagents on this instance').toBeGreaterThanOrEqual(n);
  return list.slice(0, n);
}
const reagentLinks = async (page: Page, id: string) => (await apiGet<any[]>(page, RE(id))).json ?? [];

test.describe('Test Catalog chaos: Reagents (TC-CX-RE)', () => {
  test('TC-CX-RE-01: a reagent save that fails keeps the quantity the admin typed, so a retry can send it', async ({ page }) => {
    test.fail(true, 'TRIPWIRE F15: a failed reagent save rolls the row back to the server value; the typed quantity is lost');
    const t = await seedTest(page, 'RE1');
    const [r1] = await reagents(page, 1);
    expect((await apiWrite(page, 'POST', RE(t.id), { reagentId: r1.id, usageType: 'PRIMARY', quantityPerTest: 1, quantityUnit: 'mL' })).status).toBe(201);
    const [link] = await reagentLinks(page, t.id);
    await open(page, `/MasterListsPage/TestCatalogEditor/${t.id}/reagents`);
    const qty = page.locator(`#qty-${link.id}`);
    await qty.waitFor({ state: 'visible', timeout: 60_000 });
    await qty.fill('2.5');
    await qty.press('Tab');
    const fired = await faultOnce(page, 'PUT', /\/reagents\/\d+$/, FAULTS['500 JSON']);
    await page.getByTestId('reagents-save').click();
    await expect.poll(fired).toBe(true);
    await expect(page.getByTestId('reagents-section').locator('.cds--inline-notification--error').first(), 'the failure is shown').toBeVisible();
    await expect(page.locator(`#qty-${link.id}`), 'the typed quantity is still there').toHaveValue('2.5');
  });

  test('TC-CX-RE-02: impossible quantities and over-long units are 4xx, never 500', async ({ page }) => {

    test.fail(true, 'TRIPWIRE F19/F17: a negative quantity is stored; 10^10 and a 51-character unit answer 500');
    const t = await seedTest(page, 'RE2');
    const [r1, r2] = await reagents(page, 2);
    const cases: [string, unknown][] = [
      ['a negative quantity', { reagentId: r1.id, usageType: 'PRIMARY', quantityPerTest: -1, quantityUnit: 'mL' }],
      ['a quantity of 10^10 (column holds 9 digits)', { reagentId: r1.id, usageType: 'PRIMARY', quantityPerTest: 1e10, quantityUnit: 'mL' }],
      ['a 51-character unit', { reagentId: r2.id, usageType: 'PRIMARY', quantityPerTest: 1, quantityUnit: 'u'.repeat(51) }],
    ];
    for (const [what, body] of cases) {
      const w = await apiWrite(page, 'POST', RE(t.id), body);
      expect.soft(w.status, `${what}: ${w.text.slice(0, 120)}`).toBeGreaterThanOrEqual(400);
      expect.soft(w.status, `${what} is not a crash`).toBeLessThan(500);
      if (w.status < 300) await apiWrite(page, 'DELETE', `${RE(t.id)}/${(body as any).reagentId}`);
    }
  });

  test('TC-CX-RE-03: lifecycle: link a reagent, change quantity and unit, unlink; a second unlink is a 404', async ({ page }) => {
    const t = await seedTest(page, 'RE3');
    const [r1] = await reagents(page, 1);
    expect((await apiWrite(page, 'POST', RE(t.id), { reagentId: r1.id, usageType: 'PRIMARY', quantityPerTest: 1, quantityUnit: 'mL' })).status).toBe(201);
    expect((await apiWrite(page, 'POST', RE(t.id), { reagentId: r1.id, usageType: 'PRIMARY' })).status, 'a duplicate link is a 409').toBe(409);
    expect((await apiWrite(page, 'PUT', `${RE(t.id)}/${r1.id}`, { reagentId: r1.id, usageType: 'SECONDARY', quantityPerTest: 0.25, quantityUnit: 'uL' })).status).toBe(200);
    const [l] = await reagentLinks(page, t.id);
    expect([l.usageType, Number(l.quantityPerTest), l.quantityUnit], 'edited').toEqual(['SECONDARY', 0.25, 'uL']);
    expect((await apiWrite(page, 'DELETE', `${RE(t.id)}/${r1.id}`)).status).toBe(204);
    expect(await reagentLinks(page, t.id), 'unlinked').toHaveLength(0);
    expect((await apiWrite(page, 'DELETE', `${RE(t.id)}/${r1.id}`)).status, 'again: 404').toBe(404);
  });

  test('TC-CX-RE-04: linking two reagents where one link fails: the list shows the one that worked and a retry finishes the job', async ({ page }) => {

    test.fail(true, 'TRIPWIRE F15: the retry re-posts every selected reagent; the one already linked answers 409 and the error never clears');
    const t = await seedTest(page, 'RE4');
    const [r1, r2] = await reagents(page, 2);
    await open(page, `/MasterListsPage/TestCatalogEditor/${t.id}/reagents`);
    await page.getByTestId('link-reagent-button').waitFor({ state: 'visible', timeout: 60_000 });
    await page.getByTestId('link-reagent-button').click();
    const dlg = page.getByRole('dialog').last();
    const ms = dlg.locator('#reagent-multiselect');
    await ms.click();
    for (const r of [r1, r2]) await page.getByRole('option', { name: new RegExp(r.name) }).first().click();
    await dlg.locator('.cds--modal-header').click();
    let posts = 0;
    const linkPath = (u: URL) => new RegExp(`${RE(t.id)}$`).test(u.pathname);
    await page.route(linkPath, async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      posts++;
      return posts === 2 ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"status":500}' }) : route.continue();
    });
    await dlg.getByRole('button', { name: /link selected/i }).click();
    await expect(dlg.locator('.cds--inline-notification--error').first(), 'the partial failure is shown').toBeVisible();
    expect(await reagentLinks(page, t.id), 'one link was made').toHaveLength(1);
    await page.unroute(linkPath);
    const retry = page.waitForResponse((r) => r.request().method() === 'POST' && new RegExp(`${RE(t.id)}$`).test(new URL(r.url()).pathname));
    await dlg.getByRole('button', { name: /link selected/i }).click();
    await retry;
    await page.waitForTimeout(1500);
    expect((await reagentLinks(page, t.id)).length, 'after the retry both are linked').toBe(2);
    await expect(dlg.locator('.cds--inline-notification--error'), 'and no error remains').toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------------------------
// Panels
// ---------------------------------------------------------------------------------------------
let pseq = 0;
async function newPanel(page: Page, testIds: string[], active = true) {
  pseq++;
  const name = `QACX${RUN}P${pseq}`; // under the 20-character rule
  const c = await apiWrite<any>(page, 'POST', `${TC}/panels`, { name, active: false, domain: 'CLINICAL' });
  expect([200, 201], `create panel: ${c.text.slice(0, 160)}`).toContain(c.status);
  const id = String(c.json.id);
  if (testIds.length) {
    const m = await apiWrite(page, 'PUT', `${TC}/panels/${id}/tests`, { tests: testIds.map((tid, i) => ({ testId: tid, position: i + 1 })) });
    expect(m.status, `members: ${m.text.slice(0, 160)}`).toBe(200);
  }
  const b = await apiWrite(page, 'PUT', `${TC}/panels/${id}/basic-info`, { description: `QA CX panel ${pseq} ${RUN}`, active });
  expect(b.status, `basic-info: ${b.text.slice(0, 160)}`).toBe(200);
  return { id, name };
}
const panelOf = async (page: Page, id: string) => (await apiGet<any>(page, `${TC}/panels/${id}`)).json;
const membersOf = async (page: Page, id: string): Promise<any[]> => (await apiGet<any>(page, `${TC}/panels/${id}/test-order`)).json?.tests ?? [];

test.describe('Test Catalog chaos: Panels (TC-CX-PN)', () => {
  test('TC-CX-PN-01: "creating" a panel with an existing panel\'s exact name does not deactivate or rewrite that panel', async ({ page }) => {
    test.fail(true, 'TRIPWIRE F1: POST /panels returns the existing panel for an exact name; the editor then PUTs active:false and description=name to it');
    const t = await seedTest(page, 'PN1', { activate: true });
    const p = await newPanel(page, [t.id], true);
    const before = await panelOf(page, p.id);
    await open(page, '/MasterListsPage/TestCatalogEditor/panel/new/basic-info');
    await page.locator('#panel-name').waitFor({ state: 'visible', timeout: 60_000 });
    await page.locator('#panel-name').fill(p.name);
    await page.getByRole('button', { name: /^save$/i }).last().click();
    await page.waitForTimeout(3000);
    const after = await panelOf(page, p.id);
    test.info().annotations.push({ type: 'observed', description: `before ${JSON.stringify({ a: before.active, d: before.description })} after ${JSON.stringify({ a: after.active, d: after.description })}; url ${page.url()}` });
    expect(after.active, 'the existing panel is still active').toBe(true);
    expect(after.description, 'and keeps its description').toBe(before.description);
  });

  test('TC-CX-PN-02: if the member list fails to load, saving one added test does not replace every existing member', async ({ page }) => {

    test.fail(true, 'TRIPWIRE F3: a failed member load shows an empty list with Save enabled; saving replaces every member with the one added');
    const [a, b, c] = [await seedTest(page, 'PN2a', { activate: true }), await seedTest(page, 'PN2b', { activate: true }), await seedTest(page, 'PN2c', { activate: true })];
    const p = await newPanel(page, [a.id, b.id], true);
    const failLoad = (u: URL) => new RegExp(`/panels/${p.id}/test-order$`).test(u.pathname);
    await page.route(failLoad, (r) =>
      r.request().method() === 'GET' ? r.fulfill({ status: 500, contentType: 'application/json', body: '{"status":500}' }) : r.continue());
    await open(page, `/MasterListsPage/TestCatalogEditor/panel/${p.id}/tests`);
    const add = page.locator('#panel-add-test');
    await page.waitForTimeout(4000);
    if (await add.isVisible() && await add.isEnabled()) {
      await add.fill(`QA CX PN2c ${RUN}`);
      await page.getByRole('option', { name: new RegExp(`QA CX PN2c ${RUN}`) }).first().click().catch(() => {});
      const save = page.getByRole('button', { name: /^save$/i }).last();
      if (await save.isEnabled()) await save.click();
      await page.waitForTimeout(2000);
    }
    await page.unroute(failLoad);
    const ids = (await membersOf(page, p.id)).map((m: any) => String(m.testId ?? m.id));
    test.info().annotations.push({ type: 'observed', description: `members after: ${ids}` });
    expect(ids, 'test A is still a member').toContain(a.id);
    expect(ids, 'test B is still a member').toContain(b.id);
    void c;
  });

  test('TC-CX-PN-03: removing the last test from an active panel does not leave an active empty panel', async ({ page }) => {

    test.fail(true, 'TRIPWIRE F16: removing the last test leaves an active panel with zero tests (200)');
    const t = await seedTest(page, 'PN3', { activate: true });
    const p = await newPanel(page, [t.id], true);
    const w = await apiWrite(page, 'PUT', `${TC}/panels/${p.id}/tests`, { tests: [] });
    observe('remove the last member of an active panel', w);
    const after = await panelOf(page, p.id);
    const n = (await membersOf(page, p.id)).length;
    expect(after.active && n === 0, `active=${after.active}, members=${n}`).toBe(false);
  });

  test('TC-CX-PN-04: bad panel bodies are 4xx, never 500, and the 20-character name rule holds on create', async ({ page }) => {

    test.fail(true, 'TRIPWIRE F19/F16: null lists, a non-numeric member id and an 81-character code answer 500; a 21-character name is created (201)');
    const t = await seedTest(page, 'PN4');
    const p = await newPanel(page, [], false);
    const cases: [string, string, string, unknown][] = [
      ['members null', 'PUT', `${TC}/panels/${p.id}/tests`, { tests: null }],
      ['a member id that is not a number', 'PUT', `${TC}/panels/${p.id}/tests`, { tests: [{ testId: 'abc', position: 1 }] }],
      ['test-side memberships null', 'PUT', `${TC}/tests/${t.id}/panels`, { memberships: null }],
      ['panel terminology null', 'PUT', `${TC}/panels/${p.id}/terminology`, { mappings: null }],
      ['an 81-character panel code', 'PUT', `${TC}/panels/${p.id}/terminology`, { mappings: [{ source: 'LOINC', code: '1'.repeat(81), relationship: 'SAME_AS' }] }],
      ['a 21-character panel name on create', 'POST', `${TC}/panels`, { name: `QACX${RUN}${'x'.repeat(12)}`, active: false, domain: 'CLINICAL' }],
    ];
    for (const [what, m, path, body] of cases) {
      const w = await apiWrite(page, m as any, path, body);
      expect.soft(w.status, `${what}: ${w.text.slice(0, 120)}`).toBeLessThan(500);
      if (what.includes('21-character')) expect.soft(w.status, 'a long name is refused on create, as on rename').toBe(422);
    }
  });

  test('TC-CX-PN-05: an inactive test cannot be added to a panel through the API', async ({ page }) => {

    test.fail(true, 'TRIPWIRE F16: an inactive test is added to a panel through the API (200)');
    const t = await seedTest(page, 'PN5'); // inactive
    const p = await newPanel(page, [], false);
    const w = await apiWrite(page, 'PUT', `${TC}/panels/${p.id}/tests`, { tests: [{ testId: t.id, position: 1 }] });
    observe('add an inactive test', w);
    expect(w.status, 'refused').toBe(422);
  });

  test('TC-CX-PN-06: a panel LOINC longer than the column is refused, and the old LOINC does not keep routing', async ({ page }) => {

    test.fail(true, 'TRIPWIRE F16: an 11-character LOINC is stored in the mapping but panel.loinc keeps the old code that routes e-orders');
    const t = await seedTest(page, 'PN6', { activate: true });
    const p = await newPanel(page, [t.id], true);
    expect((await apiWrite(page, 'PUT', `${TC}/panels/${p.id}/terminology`, { mappings: [{ source: 'LOINC', code: '12345-6', relationship: 'SAME_AS' }] })).status).toBe(200);
    const w = await apiWrite(page, 'PUT', `${TC}/panels/${p.id}/terminology`, { mappings: [{ source: 'LOINC', code: '12345678-90', relationship: 'SAME_AS' }] });
    observe('replace with an 11-character LOINC', w);
    const after = await panelOf(page, p.id);
    test.info().annotations.push({ type: 'observed', description: `panel.loinc after: ${after.loinc}` });
    expect(w.status >= 400 || after.loinc !== '12345-6', 'either refused, or the panel no longer routes on the old LOINC').toBe(true);
  });

  test('TC-CX-PN-07: two editors: a stale member list does not drop the test another admin just added', async ({ page }) => {

    test.fail(true, 'TRIPWIRE F11: no stale check; an old member list drops the test another editor added');
    const [a, b, c] = [await seedTest(page, 'PN7a', { activate: true }), await seedTest(page, 'PN7b', { activate: true }), await seedTest(page, 'PN7c', { activate: true })];
    const p = await newPanel(page, [a.id], true);
    const stale = await membersOf(page, p.id); // A loads [a]
    expect((await apiWrite(page, 'PUT', `${TC}/panels/${p.id}/tests`, { tests: [{ testId: a.id, position: 1 }, { testId: b.id, position: 2 }] })).status, 'B adds b').toBe(200);
    const w = await apiWrite(page, 'PUT', `${TC}/panels/${p.id}/tests`, { tests: [...stale.map((m: any, i: number) => ({ testId: String(m.testId ?? m.id), position: i + 1 })), { testId: c.id, position: 2 }] });
    observe('A saves its old list plus c', w);
    const ids = (await membersOf(page, p.id)).map((m: any) => String(m.testId ?? m.id));
    expect(w.status === 409 || ids.includes(b.id), `A refused as stale, or b kept (members ${ids})`).toBe(true);
  });

  test('TC-CX-PN-08: lifecycle: build a panel, reorder, remove a member, deactivate; order entry and the test side follow', async ({ page }) => {
    const [a, b] = [await seedTest(page, 'PN8a', { activate: true }), await seedTest(page, 'PN8b', { activate: true })];
    const p = await newPanel(page, [a.id, b.id], true);
    const oe = async () => ((await apiGet<any>(page, '/rest/sample-type-tests?sampleType=2')).json?.panels ?? []).find((x: any) => String(x.id) === p.id);
    expect((await oe())?.testIds, 'applied: order entry offers the panel').toBeTruthy();
    expect((await apiWrite(page, 'PUT', `${TC}/panels/${p.id}/tests`, { tests: [{ testId: b.id, position: 1 }, { testId: a.id, position: 2 }] })).status).toBe(200);
    expect((await membersOf(page, p.id)).map((m: any) => String(m.testId ?? m.id)), 'reordered').toEqual([b.id, a.id]);
    expect((await apiWrite(page, 'PUT', `${TC}/panels/${p.id}/tests`, { tests: [{ testId: b.id, position: 1 }] })).status).toBe(200);
    const side = (await apiGet<any>(page, `${TC}/tests/${a.id}/panels`)).json?.memberships ?? [];
    expect(side.map((m: any) => String(m.panelId)), 'test A no longer lists the panel').not.toContain(p.id);
    expect((await apiWrite(page, 'PUT', `${TC}/panels/${p.id}/basic-info`, { active: false })).status).toBe(200);
    expect(await oe(), 'deactivated: order entry no longer offers it').toBeFalsy();
  });
});

// ---------------------------------------------------------------------------------------------
// Display Order
// ---------------------------------------------------------------------------------------------
test.describe('Test Catalog chaos: Display Order (TC-CX-DO)', () => {
  test('TC-CX-DO-01: bad display-order bodies are 4xx, never 500', async ({ page }) => {
    test.fail(true, 'TRIPWIRE F19: items null answers 500');
    await open(page, '/');
    const nul = await apiWrite(page, 'PUT', `${TC}/sample-types/2/test-order`, { items: null });
    expect.soft(nul.status, `items null: ${nul.text.slice(0, 120)}`).toBeLessThan(500);
    const unknown = await apiWrite(page, 'PUT', `${TC}/sample-types/99999999/test-order`, { items: [] });
    expect.soft(unknown.status, 'unknown sample type').toBe(404);
  });

  test('TC-CX-DO-02: a move that fails on the server is reported and the order on screen goes back', async ({ page }) => {
    const t = await seedTest(page, 'DO2', { sampleTypeId: '98' });
    await open(page, `/MasterListsPage/TestCatalogEditor/${t.id}/display-order`);
    const rows = page.getByTestId('display-order-section').locator('[data-testid^="order-row-"]');
    await rows.first().waitFor({ state: 'visible', timeout: 60_000 });
    const before = await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
    await watchToasts(page);
    const fired = await faultOnce(page, 'PUT', /\/test-order$/, FAULTS['500 JSON']);
    const up = page.getByTestId(`move-up-${t.id}`);
    await (await up.isEnabled() ? up : page.getByTestId(`move-down-${t.id}`)).click();
    await expect.poll(fired).toBe(true);
    await expect.poll(async () => (await errorToasts(page)).length + await page.getByTestId('display-order-section').locator('.cds--inline-notification--error').count(), { message: 'the failure is shown' }).toBeGreaterThan(0);
    expect(await successToasts(page)).toHaveLength(0);
    await expect.poll(async () => rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-testid'))), { message: 'the list is back to the stored order' }).toEqual(before);
  });
});

// ---------------------------------------------------------------------------------------------
// Creating a test
// ---------------------------------------------------------------------------------------------
const createBody = (over: Record<string, unknown>) => ({ name: `QA CX CR ${RUN}`, reportingName: `QA CX CR ${RUN}`, code: `QCR${RUN}`,
  domain: 'CLINICAL', labUnitId: '56', sampleTypeIds: ['2'], description: `QA CX CR ${RUN}`, ...over });
const listByCode = async (page: Page, q: string) => ((await apiGet<any>(page, `${TC}/tests?status=all&pageSize=50&search=${encodeURIComponent(q)}`)).json?.rows ?? []);

test.describe('Test Catalog chaos: creating a test (TC-CX-CR)', () => {
  test('TC-CX-CR-01: a create with an unknown sample type, lab unit or copy source is a 4xx and creates nothing', async ({ page }) => {
    test.fail(true, 'TRIPWIRE F19: unknown or non-numeric sample type, unknown lab unit and a non-numeric copy source answer 500; the last one has already created the test');
    await open(page, '/');
    const cases: [string, Record<string, unknown>][] = [
      ['unknown sample type', { sampleTypeIds: ['99999999'] }],
      ['sample type that is not a number', { sampleTypeIds: ['abc'] }],
      ['unknown lab unit', { labUnitId: '99999999' }],
      ['copy source that is not a number', { copyFromId: 'x' }],
    ];
    let i = 0;
    for (const [what, over] of cases) {
      i++;
      const name = `QA CX CR1 ${i} ${RUN}`;
      const w = await apiWrite(page, 'POST', `${TC}/tests`, createBody({ name, reportingName: name, description: name, code: `QC1${i}${RUN}`, ...over }));
      expect.soft(w.status, `${what}: ${w.text.slice(0, 120)}`).toBeGreaterThanOrEqual(400);
      expect.soft(w.status, `${what} is not a crash`).toBeLessThan(500);
      expect.soft(await listByCode(page, name), `${what}: no test was created`).toHaveLength(0);
    }
  });

  test('TC-CX-CR-02: a code that differs only by spaces or case from an existing code is refused', async ({ page }) => {

    test.fail(true, 'TRIPWIRE F14: a code with surrounding spaces is a second test with the same code (201)');
    await open(page, '/');
    const code = `QCR2${RUN}`;
    expect((await apiWrite(page, 'POST', `${TC}/tests`, createBody({ code, name: `QA CX CR2 ${RUN}`, reportingName: `QA CX CR2 ${RUN}`, description: `QA CX CR2 ${RUN}` }))).status).toBe(201);
    const sp = await apiWrite(page, 'POST', `${TC}/tests`, createBody({ code: ` ${code} `, name: `QA CX CR2b ${RUN}`, reportingName: `QA CX CR2b ${RUN}`, description: `QA CX CR2b ${RUN}` }));
    expect.soft(sp.status, `code with spaces: ${sp.text.slice(0, 120)}`).toBe(409);
    const lc = await apiWrite(page, 'POST', `${TC}/tests`, createBody({ code: code.toLowerCase(), name: `QA CX CR2c ${RUN}`, reportingName: `QA CX CR2c ${RUN}`, description: `QA CX CR2c ${RUN}` }));
    expect.soft(lc.status, `code in lower case: ${lc.text.slice(0, 120)}`).toBe(409);
  });

  test('TC-CX-CR-03: a test name that differs only by case or spaces from an existing test is refused', async ({ page }) => {

    test.fail(true, 'TRIPWIRE F14/Q: a name with a leading space is a second test with the same name (201); upper case is refused');
    await open(page, '/');
    const name = `QA CX CR3 ${RUN}`;
    expect((await apiWrite(page, 'POST', `${TC}/tests`, createBody({ name, reportingName: name, description: name, code: `QC3${RUN}` }))).status).toBe(201);
    for (const [what, v] of [['upper case', name.toUpperCase()], ['a leading space', ` ${name}`]] as const) {
      const w = await apiWrite(page, 'POST', `${TC}/tests`, createBody({ name: v, reportingName: v, description: v, code: `QC3${what.length}${RUN}` }));
      expect.soft(w.status, `${what}: ${w.text.slice(0, 120)}`).toBe(409);
    }
  });

  test('TC-CX-CR-04: Basic Info cannot give a test another test\'s code', async ({ page }) => {

    test.fail(true, 'TRIPWIRE F14: Basic Info gives B the code of A (200); no uniqueness check on edit');
    const a = await seedTest(page, 'CR4a');
    const b = await seedTest(page, 'CR4b');
    const ba = (await apiGet<any>(page, `${TC}/tests/${a.id}/basic-info`)).json;
    const bb = (await apiGet<any>(page, `${TC}/tests/${b.id}/basic-info`)).json;
    const w = await apiWrite(page, 'PUT', `${TC}/tests/${b.id}/basic-info`, { ...bb, code: ba.code });
    observe("give B A's code", w);
    expect(w.status, 'refused').toBe(409);
  });

  test('TC-CX-CR-05: two creates with the same code at the same moment make one test, not two', async ({ page }) => {

    test.fail(true, 'TRIPWIRE F14: two creates with one code at the same moment both answer 201 (no unique index on local_code)');
    await open(page, '/');
    const code = `QCR5${RUN}`;
    const mk = (n: string) => apiWrite(page, 'POST', `${TC}/tests`, createBody({ code, name: `QA CX CR5${n} ${RUN}`, reportingName: `QA CX CR5${n} ${RUN}`, description: `QA CX CR5${n} ${RUN}` }));
    const [x, y] = await Promise.all([mk('a'), mk('b')]);
    observe('parallel creates', x.status * 1000 + y.status);
    expect([x.status, y.status].filter((s) => s === 201), `statuses ${x.status}/${y.status}`).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------------------------
// Activation / deactivation
// ---------------------------------------------------------------------------------------------
const orderable = async (page: Page, testId: string, sampleType = '2') =>
  ((await apiGet<any>(page, `/rest/sample-type-tests?sampleType=${sampleType}`)).json?.tests ?? []).some((x: any) => String(x.id) === testId);

test.describe('Test Catalog chaos: activation (TC-CX-AV)', () => {
  test('TC-CX-AV-01: a test with every sample type removed cannot be activated', async ({ page }) => {
    test.fail(true, 'TRIPWIRE F7: activation does not require a sample type; the test becomes active and orderable with none');
    const t = await seedTest(page, 'AV1');
    const b = (await apiGet<any>(page, `${TC}/tests/${t.id}/basic-info`)).json;
    const strip = await apiWrite(page, 'PUT', `${TC}/tests/${t.id}/basic-info`, { ...b, sampleTypeId: null, sampleTypeIds: [] });
    observe('remove every sample type while inactive', strip);
    const act = await apiWrite(page, 'POST', `${TC}/tests/${t.id}/activate`, { gapsAcknowledged: '{}' });
    observe('activate', act);
    const now = (await apiGet<any>(page, `${TC}/tests/${t.id}/basic-info`)).json;
    expect(now.active && (now.sampleTypeIds ?? []).length === 0, `active=${now.active}, sample types=${JSON.stringify(now.sampleTypeIds)}`).toBe(false);
  });

  test('TC-CX-AV-02: a malformed gaps acknowledgement is a 4xx, not a 500', async ({ page }) => {
    const t = await seedTest(page, 'AV2');
    const w = await apiWrite(page, 'POST', `${TC}/tests/${t.id}/activate`, { gapsAcknowledged: 'yes' });
    expect(w.status, w.text.slice(0, 160)).toBeLessThan(500);
  });

  test('TC-CX-AV-03: lifecycle: activate, deactivate, reactivate; order entry follows each step', async ({ page }) => {
    const t = await seedTest(page, 'AV3');
    expect((await apiWrite(page, 'PUT', `${TC}/tests/${t.id}/ranges`, { testId: t.id, ranges: [{ componentId: t.componentId, gender: '', minAge: 0, maxAge: null, lowNormal: 3, highNormal: 5, lowValid: 0, highValid: 50 }] })).status).toBe(200);
    const act = await apiWrite(page, 'POST', `${TC}/tests/${t.id}/activate`, { gapsAcknowledged: '{}' });
    expect(act.status, act.text.slice(0, 160)).toBe(200);
    expect(await orderable(page, t.id), 'activated: orderable').toBe(true);
    const b = (await apiGet<any>(page, `${TC}/tests/${t.id}/basic-info`)).json;
    expect((await apiWrite(page, 'PUT', `${TC}/tests/${t.id}/basic-info`, { ...b, active: false, orderable: false })).status).toBe(200);
    expect(await orderable(page, t.id), 'deactivated: not orderable').toBe(false);
    expect((await apiWrite(page, 'POST', `${TC}/tests/${t.id}/activate`, { gapsAcknowledged: '{}' })).status).toBe(200);
    expect(await orderable(page, t.id), 'reactivated: orderable again').toBe(true);
    const b2 = (await apiGet<any>(page, `${TC}/tests/${t.id}/basic-info`)).json;
    await apiWrite(page, 'PUT', `${TC}/tests/${t.id}/basic-info`, { ...b2, active: false, orderable: false });
  });

  test('TC-CX-AV-04: double-clicking the activation acknowledgement records one acknowledgement', async ({ page }) => {
    const t = await seedTest(page, 'AV4');
    await open(page, `/MasterListsPage/TestCatalogEditor/${t.id}/basic-info`);
    const toggle = page.locator('label[for="basic-info-active"]');
    await toggle.waitFor({ state: 'visible', timeout: 60_000 });
    let activations = 0;
    page.on('request', (r) => { if (r.method() === 'POST' && /\/activate$/.test(r.url())) activations++; });
    await toggle.click();
    const ack = page.getByRole('dialog').last().getByRole('button', { name: /confirm|activate|acknowledge/i }).last();
    if (await ack.isVisible()) await ack.dblclick();
    await page.waitForTimeout(3000);
    test.info().annotations.push({ type: 'observed', description: `activate POSTs: ${activations}` });
    expect(activations, 'at most one activation after the acknowledgement (plus the first, gap-reporting try)').toBeLessThanOrEqual(2);
    const b2 = (await apiGet<any>(page, `${TC}/tests/${t.id}/basic-info`)).json;
    if (b2.active) await apiWrite(page, 'PUT', `${TC}/tests/${t.id}/basic-info`, { ...b2, active: false, orderable: false });
  });
});
