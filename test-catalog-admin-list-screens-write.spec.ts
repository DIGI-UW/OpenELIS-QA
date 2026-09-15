/**
 * OpenELIS Global — Sample Type Editor and Panel Editor: WRITE paths.
 *
 * Third layer for these two screens. `test-catalog-sample-type-management.spec.ts` and
 * `test-catalog-panel-contract.spec.ts` cover the API contracts;
 * `test-catalog-admin-list-screens.spec.ts` covers the rendered lists; this file drives the
 * real Add forms and asserts what lands. Lab Units already has this layer
 * (`test-catalog-lab-unit-management-write.spec.ts`) — this brings the other two to parity.
 *
 * THIS FILE CREATES RECORDS. Everything it makes is named `QA_AUTO …` with a timestamp, and
 * both products are created INACTIVE by the application itself (see STW-3 / PW-2), so nothing
 * reaches an order form. Per the LIMS no-hard-delete rule nothing is deleted.
 *
 * ── Create mechanics, captured live on develop 5fe0ecb (2026-09-11) ───────────────────
 *
 * Sample type — ONE call, from a modal on the list screen:
 *   POST /rest/SampleTypeCreate
 *     {formName:'sampleTypeCreateForm', sampleTypeEnglishName, sampleTypeFrenchName,
 *      domain, active:false}                                            -> 200
 *   then the UI navigates to /MasterListsPage/SampleTypeEditor/{id}/basic-info
 *
 * Panel — TWO calls, from a full page at /MasterListsPage/TestCatalogEditor/panel/new/basic-info:
 *   POST /rest/test-catalog/panels            {name, active:false}      -> 201 {id}
 *   PUT  /rest/test-catalog/panels/{id}/basic-info
 *     {name, description, domain, active}                               -> 200
 *
 * A note on the gates, because they differ and that is worth knowing:
 *   Sample type — "Create Sample Type" is DISABLED until the required fields are filled.
 *   Panel       — "Save" is ENABLED on a completely empty form.
 */
import { test, expect, Page } from '@playwright/test';

const STAMP = `${Date.now()}`.slice(-6);
/**
 * The first TEN characters must be unique per run.
 *
 * `abbreviation` is derived server-side as `name.slice(0, 10)`. A fixed prefix like
 * "QA_AUTO STYPE <stamp>" gives every run the same abbreviation "QA_AUTO ST", and the second
 * create then fails with an unhandled HTTP 500 (see STW-6). Putting the stamp first avoids it.
 */
const STYPE_NAME = `QA${STAMP}-STYPE`;
const PANEL_NAME = `QA${STAMP}-PANEL`;

async function api(page: Page, path: string) {
  return page.evaluate(async (p) => {
    const r = await fetch('/api/OpenELIS-Global/rest' + p, {
      headers: { Accept: 'application/json' }, credentials: 'include' });
    let body: any = null; try { body = await r.json(); } catch {}
    return { status: r.status, body };
  }, path);
}
const isDisabled = (page: Page, label: RegExp) => page.evaluate((src) => {
  const re = new RegExp(src.source, src.flags);
  const b = [...document.querySelectorAll('button')].find(x => re.test((x.innerText || '').trim())) as any;
  return b ? !!b.disabled : null;
}, { source: label.source, flags: label.flags });

test.describe.configure({ mode: 'serial' });

test.describe('Sample Type Editor — create', () => {
  test('STW-1: "Create Sample Type" is disabled until the required fields are filled', async ({ page }) => {
    await page.goto('/MasterListsPage/SampleTypeEditor', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);
    await page.getByRole('button', { name: /add sample type/i }).click({ timeout: 10000 });
    await page.waitForTimeout(2500);

    expect(await isDisabled(page, /^create sample type$/i),
      'an empty Add form must not offer a live Create button').toBe(true);

    await page.locator('#st-name').fill(STYPE_NAME);
    await page.locator('#st-domain').selectOption({ label: 'Clinical' });
    await page.locator('#st-description').fill(`QA description ${STAMP}`);
    await page.waitForTimeout(600);
    expect(await isDisabled(page, /^create sample type$/i),
      'Create is still disabled after every required field was filled').toBe(false);
  });

  test('STW-2: creating through the UI round-trips to GET /sample-types', async ({ page }) => {
    const posts: string[] = [];
    const createStatus: number[] = [];
    page.on('request', r => { if (r.method() === 'POST' && /SampleTypeCreate/.test(r.url())) posts.push(r.postData() || ''); });
    page.on('response', r => { if (r.request().method() === 'POST' && /SampleTypeCreate/.test(r.url())) createStatus.push(r.status()); });

    await page.goto('/MasterListsPage/SampleTypeEditor', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);
    await page.getByRole('button', { name: /add sample type/i }).click({ timeout: 10000 });
    await page.waitForTimeout(2500);
    await page.locator('#st-name').fill(STYPE_NAME);
    await page.locator('#st-domain').selectOption({ label: 'Clinical' });
    await page.locator('#st-description').fill(`QA description ${STAMP}`);
    await page.getByRole('button', { name: /^create sample type$/i }).click({ timeout: 10000 });
    await page.waitForTimeout(6000);

    expect(posts.length, 'the UI never posted to SampleTypeCreate').toBeGreaterThan(0);
    console.log('STW-2 payload=' + posts[0].slice(0, 300));
    console.log('STW-2 postStatus=' + JSON.stringify(createStatus) + ' urlAfter=' + new URL(page.url()).pathname);

    const list = await api(page, '/sample-types');
    const rows = list.body?.data || list.body || [];
    console.log(`STW-2 listStatus=${list.status} total=${rows.length} qaNames=` +
      JSON.stringify(rows.filter((s: any) => /QA_AUTO/.test(s.name || '')).map((s: any) => s.name).slice(-6)));
    console.log('STW-2 lastFive=' + JSON.stringify(rows.slice(-5).map((s: any) => s.name)));
    const mine = rows.find((s: any) => s.name === STYPE_NAME);
    expect(mine, `"${STYPE_NAME}" is absent from GET /sample-types after a successful create`).toBeTruthy();
    expect(mine.domain, 'the domain chosen on the form round-trips').toBe('CLINICAL');
    expect(mine.abbreviation,
      'abbreviation is derived server-side as name.slice(0,10)').toBe(STYPE_NAME.slice(0, 10));
    console.log('STW-2 created=' + JSON.stringify(mine));
  });

  test('STW-3: a newly created sample type is INACTIVE (contract fact, not asserted as a defect)', async ({ page }) => {
    await page.goto('/MasterListsPage/SampleTypeEditor', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);
    const list = await api(page, '/sample-types');
    const rows = list.body?.data || list.body || [];
    const mine = rows.find((s: any) => s.name === STYPE_NAME);
    expect(mine, 'STW-2 must run first (serial mode)').toBeTruthy();
    expect(mine.isActive,
      'a created sample type is expected to start inactive; if this flips, the create contract changed').toBe(false);
  });

  test('STW-4: [SPEC-DIVERGENCE — OGC-1156] the Description typed on the form is persisted', async ({ page }) => {
    // The form marks Description REQUIRED and will not enable Create without it, yet the
    // backend stores description = name. Marked failing so the suite is green while the defect
    // is open and turns RED the moment it is fixed. Do NOT assert the buggy behaviour.
    test.fail();
    await page.goto('/MasterListsPage/SampleTypeEditor', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);
    const list = await api(page, '/sample-types');
    const rows = list.body?.data || list.body || [];
    const mine = rows.find((s: any) => s.name === STYPE_NAME);
    expect(mine, 'STW-2 must run first (serial mode)').toBeTruthy();
    console.log(`STW-4 storedDescription=${JSON.stringify(mine.description)} typed="QA description ${STAMP}"`);
    expect(mine.description, 'the typed description was discarded and replaced with the name')
      .toBe(`QA description ${STAMP}`);
  });

  test('STW-6: [SPEC-DIVERGENCE — OGC-1157] an abbreviation collision is refused with a validation error, not a 500', async ({ page }) => {
    // `abbreviation` is derived as name.slice(0,10) and is unique in the database. Two DISTINCT
    // names sharing their first ten characters therefore collide on a field the user never sees
    // and cannot edit. The product answers that collision with an unhandled HTTP 500 from
    // POST /rest/SampleTypeCreate — no field error, no message, and the modal simply stays open.
    //
    // Observed live on develop 5fe0ecb: creating "QA_AUTO STYPE <a>" succeeds, then
    // "QA_AUTO STYPE <b>" returns 500 because both derive "QA_AUTO ST".
    //
    // Marked failing: a 4xx with a readable message is the expected behaviour. This turns RED
    // when OGC-1157 is fixed.
    test.fail();
    const statuses: number[] = [];
    page.on('response', r => {
      if (r.request().method() === 'POST' && /SampleTypeCreate/.test(r.url())) statuses.push(r.status());
    });

    const collide = `${STYPE_NAME.slice(0, 10)}ZZ-COLLIDE`;
    await page.goto('/MasterListsPage/SampleTypeEditor', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);
    await page.getByRole('button', { name: /add sample type/i }).click({ timeout: 10000 });
    await page.waitForTimeout(2500);
    await page.locator('#st-name').fill(collide);
    await page.locator('#st-domain').selectOption({ label: 'Clinical' });
    await page.locator('#st-description').fill('collision probe');
    await page.getByRole('button', { name: /^create sample type$/i }).click({ timeout: 10000 });
    await page.waitForTimeout(5000);

    console.log(`STW-6 name="${collide}" sharesAbbrevWith="${STYPE_NAME}" statuses=${JSON.stringify(statuses)}`);
    expect(statuses.length, 'the collision attempt never reached the server').toBeGreaterThan(0);
    expect(statuses[0],
      `an abbreviation collision answered ${statuses[0]}; a validation error (4xx) is expected`)
      .toBeGreaterThanOrEqual(400);
    expect(statuses[0], 'a collision must not surface as a server error').toBeLessThan(500);
  });

  test('STW-5: the created sample type is findable through the list search', async ({ page }) => {
    await page.goto('/MasterListsPage/SampleTypeEditor', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);
    const box = page.getByPlaceholder(/search sample types/i).first();
    await box.click(); await box.fill('');
    await box.type(STYPE_NAME, { delay: 25 });
    await page.waitForTimeout(2200);
    const names = await page.$$eval('table tbody tr', (trs: any[]) =>
      trs.map(tr => ((tr.querySelectorAll('td')[0] as any)?.innerText || '').split('\n')[0].trim()));
    console.log('STW-5 rows=' + JSON.stringify(names));
    expect(names.some(n => n === STYPE_NAME),
      'a sample type created moments ago cannot be found by its exact name').toBe(true);
  });
});

test.describe('Panel Editor — create', () => {
  test('PW-1: Save issues the documented two-call create and reports success', async ({ page }) => {
    const calls: string[] = [];
    page.on('response', async r => {
      const m = r.request().method();
      if ((m === 'POST' || m === 'PUT') && /test-catalog\/panels/.test(r.url())) {
        calls.push(`${m} ${r.status()} ${r.url().replace(/^https?:\/\/[^/]+\/api\/OpenELIS-Global\/rest/, '')}`);
      }
    });

    await page.goto('/MasterListsPage/TestCatalogList?entity=panels', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);
    await page.getByRole('button', { name: /add panel/i }).click({ timeout: 10000 });
    await page.waitForTimeout(3500);
    expect(new URL(page.url()).pathname,
      'Add Panel should open the panel editor, not a modal').toContain('/TestCatalogEditor/panel/new');

    await page.locator('#panel-name').fill(PANEL_NAME);
    await page.locator('#panel-domain-clinical').check({ timeout: 6000 });
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: /^save$/i }).first().click({ timeout: 10000 });
    await page.waitForTimeout(6000);

    console.log('PW-1 calls=' + JSON.stringify(calls));
    expect(calls.some(c => c.startsWith('POST 201')), `no 201 from POST panels; saw ${JSON.stringify(calls)}`).toBe(true);
    expect(calls.some(c => c.startsWith('PUT 200')), `no 200 from PUT basic-info; saw ${JSON.stringify(calls)}`).toBe(true);
  });

  test('PW-2: the created panel round-trips by id, inactive and with no derived sample types', async ({ page }) => {
    await page.goto('/MasterListsPage/TestCatalogList?entity=panels', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);
    const id = new URL(page.url()).pathname; // not used; find by name through the editor route below
    const found = await page.evaluate(async (name) => {
      // The BARE list endpoint returns active panels only (see PW-3), so walk ids around the top
      // of the range rather than searching it. The SCREEN does show this panel; see PW-3.
      for (let i = 60; i >= 1; i--) {
        const r = await fetch('/api/OpenELIS-Global/rest/test-catalog/panels/' + i, { credentials: 'include' });
        if (!r.ok) continue;
        const b = await r.json().catch(() => null);
        if (b && b.name === name) return b;
      }
      return null;
    }, PANEL_NAME);

    expect(found, `"${PANEL_NAME}" could not be fetched by id after a 201 create`).toBeTruthy();
    console.log('PW-2 panel=' + JSON.stringify(found));
    expect(found.domain, 'the domain radio round-trips').toBe('CLINICAL');
    expect(found.active, 'a created panel is expected to start inactive').toBe(false);
    expect(found.testCount, 'a brand-new panel has no member tests').toBe(0);
    expect(found.sampleTypes, 'a panel with no member tests derives no sample types').toEqual([]);
  });

  test('PW-3: [CONTRACT FACT] the panel list screen shows the panel you just created, because it asks for inactive rows', async ({ page }) => {
    // OGC-1206, RETRACTED. An earlier version of this case asserted that a newly created panel
    // is INVISIBLE on the screen that created it, and was marked test.fail() as a defect. That
    // was wrong, and it was wrong because it was derived from an endpoint the screen does not call.
    //
    // The two calls differ by one parameter:
    //   GET /rest/test-catalog/panels                      -> active panels only
    //   GET /rest/test-catalog/panels?includeInactive=true -> what the SCREEN loads
    //
    // The screen uses the second, renders the inactive rows, and its Status filter partitions
    // them (see TC-PANEL-07). Both endpoint behaviours are correct; neither is a defect. This
    // case pins that contrast down so nobody re-derives the retracted conclusion from the bare
    // endpoint a third time.
    await page.goto('/MasterListsPage/TestCatalogList?entity=panels', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);

    const bare = await api(page, '/test-catalog/panels');
    const withInactive = await api(page, '/test-catalog/panels?includeInactive=true');
    const bareRows = bare.body || [];
    const allRows = withInactive.body || [];
    console.log(`PW-3 bare=${bareRows.length} includeInactive=${allRows.length} ` +
      `bareFlags=${JSON.stringify([...new Set(bareRows.map((p: any) => p.active))])}`);

    // The endpoint the screen actually calls must return the panel this suite just created.
    expect(allRows.some((p: any) => p.name === PANEL_NAME),
      `"${PANEL_NAME}" was created successfully but ?includeInactive=true does not return it`).toBe(true);

    // ...and the bare endpoint must not, which is what makes the parameter meaningful. If this
    // ever stops holding, the two calls have converged and the note above is stale.
    expect(bareRows.every((p: any) => p.active === true),
      'the bare endpoint returned an inactive panel; it no longer filters by active').toBe(true);
    expect(allRows.length,
      'includeInactive=true returned no more rows than the bare call, so it is doing nothing')
      .toBeGreaterThan(bareRows.length);

    // And the row has to be on the SCREEN, not merely in a JSON payload. This is the assertion
    // the retracted version never made.
    const onScreen = await page.$$eval('table tbody tr', (trs: any[], name: string) =>
      trs.some(tr => ((tr as HTMLElement).innerText || '').includes(name)), PANEL_NAME);
    expect(onScreen,
      `"${PANEL_NAME}" is returned by the endpoint the screen calls but is not rendered in the table`).toBe(true);
  });
});
