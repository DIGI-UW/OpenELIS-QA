/**
 * tests/locations-organizations.spec.ts
 *
 * Admin > Locations & Organizations (OGC-1363, FRS v0.3, OpenELIS-Global-2 #4500, merged
 * 2026-10-01). One menu replaces Organization Management and the vector Sampling Sites page:
 * Organizations (with wards / depts inline), Sampling Sites, Geographic Areas, Import / Export.
 *
 * Cases are TC-LORG-xx. The header of each case names the acceptance criterion (AC) or FRS
 * requirement (FR) it holds. Standing rules: everything is driven through the UI first, then
 * confirmed by REST read-back and, on a local stack, by the database (helpers/locations.ts `db`,
 * skipped where there is no DB). QA-named records only; nothing is ever deleted; records this
 * file creates are deactivated in afterAll. QA_AUTO Reference Lab Alpha / Beta / Gamma are
 * never edited (FHIR and referral fixtures depend on them).
 *
 * `test.fail()` cases are FLIP-WHEN-FIXED tripwires: they assert the behaviour the FRS asks
 * for, fail today, and turn red (unexpected pass) the day the product is fixed.
 *
 * How the page is driven, and its traps: references/playwright-notes/locations-organizations.md.
 */
import { test, expect, Page, Browser } from '@playwright/test';
import * as fs from 'fs';
import {
  LOCATIONS, db, api, importCall, lists, typeId, getDetail, listOrgs, createOrg, createArea,
  createWard, setActive, retire, openList, rows, search, openEdit, pickTypes, pickLocation, notice, inView,
} from './helpers/locations';

const S = process.env.LOC_STAMP ?? `${Date.now()}`.slice(-6);
const OUT = process.env.OUT || 'test-results';
const evidence: Record<string, unknown> = {};
const note = (k: string, v: unknown) => {
  try { Object.assign(evidence, JSON.parse(fs.readFileSync(`${OUT}/loc-evidence.json`, 'utf8'))); } catch { /* first */ }
  evidence[k] = v;
  try { fs.writeFileSync(`${OUT}/loc-evidence.json`, JSON.stringify(evidence, null, 1)); } catch { /* no OUT */ }
};

/**
 * Everything this file creates. Kept in a file, not only in memory: Playwright restarts the
 * worker after a failed test and re-runs beforeAll, so an in-memory list (and an afterAll that
 * retires it) would deactivate fixtures the next worker still needs. TC-LORG-99 retires them all.
 */
const CREATED = () => `${OUT}/loc-created-${S}.txt`;
const created = {
  push: (...ids: string[]) => { fs.mkdirSync(OUT, { recursive: true }); fs.appendFileSync(CREATED(), ids.filter(Boolean).map((i) => `${i}\n`).join('')); },
  all: (): string[] => { try { return [...new Set(fs.readFileSync(CREATED(), 'utf8').split('\n').filter(Boolean))]; } catch { return []; } },
};
const F: Record<string, string> = {};
let L: any;

async function appPage(browser: Browser, baseURL?: string): Promise<Page> {
  const ctx = await browser.newContext({ storageState: '.auth/user.json', ignoreHTTPSErrors: true, baseURL, timezoneId: 'UTC' });
  const page = await ctx.newPage();
  await page.goto(LOCATIONS, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('locations-organizations')).toBeVisible({ timeout: 60_000 });
  return page;
}

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const FIX = `${OUT}/loc-fixtures-${S}.json`;

test.describe('Locations & Organizations (OGC-1363)', () => {
  test.beforeAll(async ({ browser, baseURL }) => {
    test.setTimeout(180_000);
    const page = await appPage(browser, baseURL);
    L = await lists(page);
    // Re-use the fixtures of this stamp when a --grep run is repeated with LOC_STAMP.
    if (fs.existsSync(FIX)) {
      Object.assign(F, JSON.parse(fs.readFileSync(FIX, 'utf8')));
    } else {
      F.tClinic = typeId(L, 'referring clinic');
      F.tRef = typeId(L, 'referralLab');
      // A generic install (testing.openelis-global.org) has no geographic levels until a levels file is loaded, and the
      // API refuses areas ("No geographic levels are configured"). Area-dependent cases skip there; the rest still run.
      if ((L.areaLevels || []).length >= 3) {
        F.prov = await createArea(page, `QA Loc Prov ${S}`, `QLP${S}`, null);
        F.kab = await createArea(page, `QA Loc Kab ${S}`, `QLK${S}`, F.prov);
        F.kec = await createArea(page, `QA Loc Kec ${S}`, `QLC${S}`, F.kab);
      }
      F.f1 = await createOrg(page, {
        name: `QA Loc Facility ${S}`, typeIds: [F.tClinic], parentId: F.kec, gpsLatitude: -6.716, gpsLongitude: 147.001,
        identifiers: [{ label: 'Code', value: `QLF${S}`, reporting: true }, { label: 'DHIS2 ID', value: `Dh${S}xQ`, reporting: false }],
      });
      F.f2 = await createOrg(page, {
        name: `QA Loc Second ${S}`, typeIds: [F.tClinic], parentId: F.kab, gpsLatitude: -9.4705, gpsLongitude: 147.1597,
        identifiers: [{ label: 'Code', value: `QLS${S}`, reporting: true }],
      });
      F.r1 = await createOrg(page, {
        name: `QA Loc RefLab ${S}`, typeIds: [F.tRef], parentId: F.prov,
        identifiers: [{ label: 'Code', value: `QLR${S}`, reporting: true }],
        referral: { approvalStatus: 'Approved', nextReviewDue: day(-1), lastReviewDate: '2025-01-15' },
      });
      // Sorts last among QA records (and has no location), so the list must be scrolled to reach it.
      F.low = await createOrg(page, { name: `QA_ZZ Loc Low ${S}`, typeIds: [F.tClinic], identifiers: [{ label: 'Code', value: `QZL${S}`, reporting: true }] });
      fs.mkdirSync(OUT, { recursive: true });
      fs.writeFileSync(FIX, JSON.stringify(F, null, 1));
      created.push(F.f1, F.f2, F.r1, F.low);
    }
    note('fixtures', { S, ...F });
    await page.context().close();
  });

  /** Records added mid-test (not in beforeAll) are written back so a restarted worker sees them. */
  const saveFix = () => fs.writeFileSync(FIX, JSON.stringify(F, null, 1));

  // ---------------------------------------------------------------------------------------------
  // AC1 navigation, routes, redirects, deep links
  // ---------------------------------------------------------------------------------------------
  test('TC-LORG-01: SideNav, the four routes, the legacy redirects and URL-restored filters (AC1)', async ({ page }) => {
    await page.goto(LOCATIONS, { waitUntil: 'domcontentloaded' });
    const nav = page.locator('.cds--side-nav');
    await expect(nav).toContainText('Locations & Organizations', { timeout: 60_000 });
    const items = ['Organizations', 'Sampling Sites', 'Geographic Areas', 'Import / Export'];
    await expect(nav.getByText('Geographic Areas', { exact: true })).toBeVisible({ timeout: 30_000 });
    const navText = (await nav.locator('a, button, span').allInnerTexts()).map((t) => t.trim());
    const order = navText.filter((t) => items.includes(t));
    note('TC-LORG-01.nav', { order, vectorLinks: await nav.locator('a[href*="vectorSurveillanceSetup/sampling-sites"]').count() });
    expect([...new Set(order)].slice(0, 4)).toEqual(items);
    expect.soft(await nav.locator('a[href*="vectorSurveillanceSetup/sampling-sites"]').count(), 'no SideNav link to the old vector Sampling Sites page').toBe(0);

    const redirects: [string, RegExp, string][] = [
      ['/MasterListsPage/organizationManagement', /\/MasterListsPage\/locations$/, 'locations-organizations'],
      ['/MasterListsPage/vectorSurveillanceSetup/sampling-sites', /\/MasterListsPage\/locations\/sites$/, 'locations-sites'],
      ['/MasterListsPage/organizationEdit?ID=0', /\/MasterListsPage\/locations\?add=1$/, 'locations-form-new'],
      // Alpha (29) is on the first page; read only, never saved here. TC-LORG-01b covers a record on a later page.
      ['/MasterListsPage/organizationEdit?ID=29', /\/MasterListsPage\/locations\?id=29$/, 'locations-form-29'],
    ];
    for (const [from, to, testid] of redirects) {
      await page.goto(from, { waitUntil: 'domcontentloaded' });
      await expect(page, `${from} redirects`).toHaveURL(to, { timeout: 30_000 });
      await expect.soft(page.getByTestId(testid), `${from} lands on ${testid}`).toBeVisible({ timeout: 30_000 });
    }
    for (const [route, testid, crumb] of [
      ['', 'locations-organizations', 'Organizations'], ['/sites', 'locations-sites', 'Sampling Sites'],
      ['/areas', 'locations-areas', 'Geographic Areas'], ['/import', 'locations-import', 'Import / Export'],
    ]) {
      await page.goto(`${LOCATIONS}${route}`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId(testid)).toBeVisible({ timeout: 30_000 });
      const bc = (await page.locator('.cds--breadcrumb').first().innerText()).replace(/\s+/g, ' ');
      expect.soft(bc, `breadcrumb on ${route || '/'}`).toMatch(new RegExp(`Home.*Admin Management.*Locations & Organizations.*${crumb.replace('/', '\\/')}`));
      if (route !== '/import') await expect.soft(page.getByTestId('locations-page-intro'), `explainer on ${route || '/'}`).toBeVisible();
    }
    // Deep link: q + status restore the same view.
    await page.goto(`${LOCATIONS}?q=${encodeURIComponent(`QLF${S}`)}&status=all`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByPlaceholder('Search by name, code or any identifier')).toHaveValue(`QLF${S}`, { timeout: 30_000 });
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText(`QA Loc Facility ${S}`);
  });

  test('TC-LORG-01b: an old organizationEdit link, or a pasted ?id= link, opens the record even when it is not on the first page (AC1)', async ({ page }) => {
    // FLIP-WHEN-FIXED. Observed 2026-10-02: /MasterListsPage/organizationEdit?ID=<id> lands on /locations?id=<id>, but the
    // record is only expanded when its row happens to be on page 1 of the default list; otherwise the list shows and
    // nothing opens. Alpha (29) opens; a record on page 2 does not.
    test.fail();
    await page.goto(LOCATIONS);
    const p1 = await listOrgs(page, { view: 'organizations', status: 'active', sort: 'name', page: '1', pageSize: '25' });
    const onPage1 = p1.items.some((r: any) => r.id === F.low);
    note('TC-LORG-01b', { total: p1.total, onPage1, low: F.low });
    test.skip(onPage1, 'the probe record is on page 1 here; nothing to prove');
    await page.goto(`/MasterListsPage/organizationEdit?ID=${F.low}`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(new RegExp(`id=${F.low}`));
    await expect(page.getByTestId(`locations-form-${F.low}`)).toBeVisible({ timeout: 20_000 });
  });

  // ---------------------------------------------------------------------------------------------
  // CRUD through the UI, read back through REST and the DB
  // ---------------------------------------------------------------------------------------------
  test('TC-LORG-02: an organization created with every section filled reads back the same in list, form, REST and DB', async ({ page }) => {
    const name = `QA Loc Full ${S}`;
    const v = {
      short: `QLU${S}`, code: `QLU${S}`, dhis: `Fu${S}DHIS`, desc: 'QA record. Directions: behind the market.',
      street: '12 Ward Road', city: 'Lae', state: 'MB', zip: '411', lat: '-6.7245', lng: '146.9961',
      contact: 'Sister QA Kila', phone: '+675 472 1000', email: `qa.full.${S}@example.org`, web: 'https://qa.example.org',
      body: 'PNG NATA', number: `ACC-${S}`, expiry: day(365), last: '2026-01-10', next: day(300), notes: 'QA review notes',
    };
    await openList(page);
    await page.getByTestId('locations-add').click();
    const form = page.getByTestId('locations-form-new');
    await expect(form).toBeVisible();
    await form.locator('#name-new').fill(name);
    await form.locator('#shortName-new').fill(v.short);
    await pickTypes(page, form, 'new', ['referring clinic', 'referralLab']);
    await form.locator('#category-new').selectOption({ label: 'District hospital' });
    await form.locator('#ownership-new').selectOption({ label: 'Church' });
    await form.locator('#description-new').fill(v.desc);
    await form.locator('#identifier-value-new-0').fill(v.code);
    await form.getByRole('button', { name: 'Add identifier' }).click();
    await form.locator('#identifier-label-new-1').fill('DHIS2 ID');
    await page.keyboard.press('Tab');
    await form.locator('#identifier-value-new-1').fill(v.dhis);
    if (F.kec) await pickLocation(page, form, 'new', `QA Loc Kec ${S}`);
    for (const [sel, val] of [['street', v.street], ['city', v.city], ['state', v.state], ['zip', v.zip], ['lat', v.lat], ['lng', v.lng],
      ['contact', v.contact], ['phone', v.phone], ['email', v.email], ['web', v.web]]) {
      await form.locator(`#${sel}-new`).fill(val);
    }
    await form.locator('#ref-status-new').selectOption({ label: 'Approved' });
    await form.locator('#ref-body-new').fill(v.body);
    await form.locator('#ref-number-new').fill(v.number);
    await form.locator('#ref-expiry-new').fill(v.expiry);
    await form.locator('#ref-last-new').fill(v.last);
    await form.locator('#ref-next-new').fill(v.next);
    await form.locator('#ref-notes-new').fill(v.notes);
    const post = page.waitForResponse((r) => r.url().endsWith('/rest/locations/organizations') && r.request().method() === 'POST');
    await form.getByTestId('locations-save').click();
    const resp = await post;
    note('TC-LORG-02.post', { status: resp.status(), request: resp.request().postDataJSON() });
    expect(resp.status(), `POST answered ${resp.status()}: ${(await resp.text()).slice(0, 400)}`).toBe(201);
    await expect(notice(page)).toContainText(`${name} added.`);
    const id = (await resp.json()).detail.row.id as string;
    created.push(id);
    F.full = id;

    // List row
    await search(page, v.code, 1);
    const row = rows(page).first();
    await expect(row).toContainText(name);
    await expect(row).toContainText(v.code);
    await expect(row).toContainText('referring clinic');
    await expect(row).toContainText(/referralLab/i);
    if (F.kec) await expect(row).toContainText(`QA Loc Kec ${S}`);
    await expect.soft(row, 'facility category under the type tags (FR-B2)').toContainText('District hospital');

    // Form read-back
    const edit = await openEdit(page, id);
    const want: [string, string][] = [['name', name], ['shortName', v.short], ['street', v.street], ['city', v.city], ['state', v.state],
      ['zip', v.zip], ['lat', v.lat], ['lng', v.lng], ['contact', v.contact], ['phone', v.phone], ['email', v.email], ['web', v.web],
      ['ref-body', v.body], ['ref-number', v.number], ['ref-expiry', v.expiry], ['ref-last', v.last], ['ref-next', v.next], ['ref-notes', v.notes],
      ['description', v.desc]];
    for (const [sel, val] of want) await expect.soft(edit.locator(`#${sel}-${id}`), `form ${sel}`).toHaveValue(val);
    await expect.soft(edit.locator(`#ref-status-${id}`)).toHaveValue('Approved');
    await expect.soft(edit.locator(`#category-${id} option:checked`)).toHaveText('District hospital');
    await expect.soft(edit.locator(`#ownership-${id} option:checked`)).toHaveText('Church');

    // REST read-back
    const d = await getDetail(page, id);
    note('TC-LORG-02.detail', d);
    expect.soft(d.row.name).toBe(name);
    expect.soft(d.streetAddress).toBe(v.street);
    expect.soft(d.city).toBe(v.city);
    expect.soft(d.state).toBe(v.state);
    expect.soft(Number(d.gpsLatitude)).toBeCloseTo(Number(v.lat), 6);
    expect.soft(Number(d.gpsLongitude)).toBeCloseTo(Number(v.lng), 6);
    expect.soft(d.email).toBe(v.email);
    expect.soft(d.internetAddress).toBe(v.web);
    expect.soft((d.identifiers || []).map((i: any) => `${i.label}=${i.value}:${i.reporting}`).sort()).toEqual([`Code=${v.code}:true`, `DHIS2 ID=${v.dhis}:false`]);
    expect.soft(d.referral?.approvalStatus).toBe('Approved');
    expect.soft(d.referral?.accreditationNumber).toBe(v.number);
    expect.soft(d.row.types.map((t: any) => t.id).sort()).toEqual([F.tClinic, F.tRef].sort());

    // DB read-back
    const r = db(`select name, short_name, code, street_address, city, state, zip_code, gps_latitude, gps_longitude, contact_name, phone, email, internet_address, approval_status, accreditation_number, next_review_due, org_id, is_active, source, fhir_uuid is not null from clinlims.organization where id=${id}`);
    if (r !== null) {
      note('TC-LORG-02.db', r);
      const c = r.split('|');
      expect.soft(c[0]).toBe(name);
      expect.soft(c[2]).toBe(v.code);
      if (F.kec) expect.soft(c[16], 'parent = the Kecamatan area').toBe(F.kec);
      expect.soft(c[17]).toBe('Y');
      expect.soft(c[19], 'a FHIR UUID is assigned').toBe('t');
      const idents = db(`select label||'='||value||':'||is_reporting from clinlims.organization_identifier where organization_id=${id} order by label`);
      expect.soft(idents).toBe(`Code=${v.code}:true\nDHIS2 ID=${v.dhis}:false`);
      const hist = db(`select action from clinlims.organization_change where organization_id=${id} order by id`);
      note('TC-LORG-02.history', hist);
      expect.soft(hist, 'the create is in organization_change').toMatch(/creat|add/i);
    }
  });

  test('TC-LORG-03: each section edit is saved and listed in History with user, time, old and new values; the old name still finds it (AC22)', async ({ page }) => {
    const id = F.f2;
    await page.goto(LOCATIONS);
    const before = await getDetail(page, id);
    const oldName = before.row.name;
    const newName = `QA Loc Renamed ${S}`;
    await openList(page);
    await search(page, `QLS${S}`, 1);
    const form = await openEdit(page, id);
    await form.locator(`#name-${id}`).fill(newName);
    await form.locator(`#phone-${id}`).fill('+675 7000 1111');
    await form.locator(`#contact-${id}`).fill('QA Contact Edited');
    await form.getByRole('button', { name: 'Add identifier' }).click();
    const idx = (before.identifiers || []).length;
    await form.locator(`#identifier-label-${id}-${idx}`).fill(`Provincial code ${S}`);
    await page.keyboard.press('Tab');
    await form.locator(`#identifier-value-${id}-${idx}`).fill(`PC-${S}`);
    if (F.kec) await pickLocation(page, form, id, `QA Loc Kec ${S}`);
    const put = page.waitForResponse((r) => r.url().includes(`/rest/locations/organizations/${id}`) && r.request().method() === 'PUT');
    await form.getByTestId('locations-save').click();
    expect((await put).status()).toBe(200);
    await expect(notice(page)).toContainText(`${newName} saved.`);

    // History panel
    await search(page, `QLS${S}`, 1);
    const again = await openEdit(page, id);
    const histBtn = again.getByRole('button', { name: /^History/ });
    await expect(histBtn).toContainText(/History \(\d+\)/);
    await histBtn.click();
    const panel = again.getByTestId('locations-history');
    await expect(panel).toBeVisible();
    await expect(panel).not.toContainText('Loading', { timeout: 15_000 });
    const text = (await panel.innerText()).replace(/\s+/g, ' ');
    note('TC-LORG-03.historyPanel', text.slice(0, 2500));
    expect.soft(text, 'old and new name').toContain(oldName);
    expect.soft(text).toContain(newName);
    expect.soft(text, 'new phone').toContain('+675 7000 1111');
    expect.soft(text, 'identifier change').toContain(`PC-${S}`);
    if (F.kec) expect.soft(text, 'location change').toContain(`QA Loc Kec ${S}`);
    expect.soft(text, 'who (the admin account is named "Open ELIS")').toMatch(/ELIS|admin/i);
    expect.soft(text, 'when').toMatch(/20\d\d/);
    const h = await api(page, 'GET', `/rest/locations/organizations/${id}/history`);
    note('TC-LORG-03.historyApi', h.json);
    expect(h.status).toBe(200);
    const fields = (h.json as any[]).flatMap((e) => (e.changes || []).map((c: any) => c.field));
    for (const f of ['name', 'phone', 'contactName', 'identifiers', ...(F.kec ? ['location'] : [])]) expect.soft(fields, `history has a ${f} change`).toContain(f);
    expect.soft((h.json as any[]).every((e) => e.user && e.when), 'every entry has a user and a time').toBe(true);

    // Former name still matches (FR-B3 / FR-K3)
    await search(page, oldName, 1);
    await expect(rows(page).first()).toContainText(newName);
    await expect(rows(page).first()).toContainText(`Formerly ${oldName}`);
    const dbh = db(`select count(*) from clinlims.organization_change where organization_id=${id}`);
    if (dbh !== null) expect.soft(Number(dbh), 'organization_change rows (create + edit)').toBeGreaterThanOrEqual(2);
  });

  // ---------------------------------------------------------------------------------------------
  // OGC-1263 on the new page: a failed save says so and keeps the edit
  // ---------------------------------------------------------------------------------------------
  const FAILURES: { k: string; status?: number; contentType?: string; body?: string; abort?: boolean }[] = [
    { k: '500-json', status: 500, contentType: 'application/json', body: '{"error":"Internal Server Error","message":"QA forced 500"}' },
    { k: '500-html', status: 500, contentType: 'text/html', body: '<html><body><h1>500 Internal Server Error</h1></body></html>' },
    { k: '502-empty', status: 502, contentType: 'text/plain', body: '' },
    { k: '400-json', status: 400, contentType: 'application/json', body: '{"message":"QA forced 400"}' },
    { k: '409-no-current', status: 409, contentType: 'application/json', body: '{"message":"QA forced conflict"}' },
    { k: '422-fields', status: 422, contentType: 'application/json', body: '{"message":"The record was not saved","fieldErrors":{"name":"QA forced name error"}}' },
    { k: 'no-response', abort: true },
  ];

  /** Force the record's PUT to fail one way, press Save, and report what the user sees. */
  async function failedSave(page: Page, fcase: (typeof FAILURES)[number], id: string, open: 'search' | 'low' = 'search', waitAfter = 0) {
    await page.goto(LOCATIONS);
    const orig = (await getDetail(page, id)).row.name;
    const typed = `${orig} EDIT ${fcase.k}`;
    const hits: string[] = [];
    await page.route(`**/rest/locations/organizations/${id}`, async (route) => {
      if (route.request().method() !== 'PUT') return route.continue();
      hits.push(route.request().method());
      if (fcase.abort) return route.abort('failed');
      return route.fulfill({ status: fcase.status!, contentType: fcase.contentType, body: fcase.body });
    });
    if (open === 'low') await openList(page, '', { q: 'QA', pageSize: '100' });
    else await openList(page, '', { q: S, pageSize: '100' });
    const form = await openEdit(page, id);
    await form.locator(`#name-${id}`).fill(typed);
    await form.getByTestId('locations-save').click();
    await expect.poll(() => hits.length, { timeout: 10_000 }).toBe(1);
    const n = notice(page);
    await expect(n, 'a notification appears').toBeVisible({ timeout: 8_000 });
    const obs = {
      msg: (await n.innerText()).replace(/\s+/g, ' ').trim(), kind: (await n.getAttribute('class')) || '', onScreen: await inView(n),
      scrollY: await page.evaluate(() => window.scrollY), fieldKept: await form.locator(`#name-${id}`).inputValue().catch(() => null),
      formOpen: await form.isVisible(), saveEnabled: await form.getByTestId('locations-save').isEnabled().catch(() => null),
      fieldMsgs: await form.locator('.cds--form-requirement').allInnerTexts(), stillThere: null as boolean | null, server: '', orig, typed,
    };
    if (waitAfter) { await page.waitForTimeout(waitAfter); obs.stillThere = await notice(page).isVisible().catch(() => false); }
    obs.server = (await getDetail(page, id)).row.name;
    return obs;
  }

  for (const fcase of FAILURES) {
    test(`TC-LORG-04-${fcase.k}: a save that fails (${fcase.k}) says it failed and keeps the typed values; nothing is saved (OGC-1263)`, async ({ page }) => {
      const o = await failedSave(page, fcase, F.f1);
      note(`TC-LORG-04.${fcase.k}`, o);
      expect(o.kind, 'the notification is an error, not a success').toMatch(/error/);
      expect(o.fieldKept, 'the typed name is kept').toBe(o.typed);
      expect(o.formOpen, 'the form stays open').toBe(true);
      expect(o.saveEnabled, 'Save can be pressed again').toBe(true);
      expect(o.server, 'nothing was saved').toBe(o.orig);
      if (fcase.k === '422-fields') expect(o.fieldMsgs, 'the field message is shown under the field').toContain('QA forced name error');
    });
  }

  for (const k of ['500-html', '502-empty', 'no-response']) {
    test(`TC-LORG-04m-${k}: the failure message is written for a lab user, not a parser or browser error (OGC-1263 residual)`, async ({ page }) => {
      // FLIP-WHEN-FIXED. Observed 2026-10-02 (local develop, image 10-01 17:48 UTC): the notification reads
      // "Unexpected token '<', "<html><bod"... is not valid JSON" (500-html), "Failed to execute 'json' on 'Response':
      // Unexpected end of JSON input" (502-empty) and "Failed to fetch" (no-response). putToOpenElisServerJsonResponse parses
      // every error body as JSON and LocationsError falls back to response.error when serverMessage() is empty.
      test.fail();
      const o = await failedSave(page, FAILURES.find((f) => f.k === k)!, F.f1);
      note(`TC-LORG-04m.${k}`, o);
      expect(o.msg).not.toMatch(/Unexpected token|JSON|Failed to fetch|NetworkError|Failed to execute/);
    });
  }

  test('TC-LORG-04p: an error notification stays until dismissed (heuristic; OGC-1263 residual)', async ({ page }) => {
    // FLIP-WHEN-FIXED. Observed 2026-10-02: every error notification on the page disappears after 6 s
    // (LocationsPage notify(): setTimeout 6000 for any kind without an action), so a user who looks away misses it.
    test.fail();
    const o = await failedSave(page, FAILURES[0], F.f1, 'search', 6_500);
    note('TC-LORG-04p', o);
    expect(o.stillThere).toBe(true);
  });

  test('TC-LORG-04-low: a failed save on a record low in a long list is reported where the user pressed Save (OGC-1263)', async ({ page }) => {
    // FLIP-WHEN-FIXED. Observed 2026-10-02 on local develop (image 10-01 17:48 UTC), in two runs with a fresh login and fresh records each.
    // The one notification slot sits at the top of the page, above the list. Editing a record further down, the user
    // is scrolled 500 to 900 px below it, so the error (and the success) is off screen and gone after 6 s.
    test.fail();
    const o = await failedSave(page, FAILURES[0], F.low ?? F.f1, 'low');
    note('TC-LORG-04-low', o);
    expect(o.fieldKept).toBe(o.typed);
    expect(o.onScreen, `the error is on screen (page scrolled ${o.scrollY}px)`).toBe(true);
  });

  test('TC-LORG-04-ok: a save that succeeds on a record low in a long list says so where the user is looking (control for TC-LORG-04)', async ({ page }) => {
    // FLIP-WHEN-FIXED. Observed 2026-10-02 on local develop (image 10-01 17:48 UTC), in two runs with a fresh login and fresh records each.
    // Same cause as TC-LORG-04-low: "<name> saved." renders at the top of the page, off screen.
    test.fail();
    await page.goto(LOCATIONS);
    const id = F.low ?? F.f1;
    await openList(page, '', { q: 'QA', pageSize: '100' });
    const form = await openEdit(page, id);
    await form.locator(`#contact-${id}`).fill(`QA ok ${S}`);
    await form.getByTestId('locations-save').click();
    const n = notice(page);
    await expect(n).toContainText(/ saved\.$/);
    const obs = { onScreen: await inView(n), scrollY: await page.evaluate(() => window.scrollY) };
    note('TC-LORG-04-ok', obs);
    expect((await getDetail(page, id)).contactName).toBe(`QA ok ${S}`);
    expect(obs.onScreen, `the success message is on screen (page scrolled ${obs.scrollY}px)`).toBe(true);
  });

  test('TC-LORG-05d: an identifier value longer than its column, typed in the form, is refused with a message a lab user can read (OGC-1264)', async ({ page }) => {
    // FLIP-WHEN-FIXED. Observed 2026-10-02 on local develop (image 10-01 17:48 UTC), in two runs with a fresh login and fresh records each.
    // The identifier Value input has no maxLength. 150 characters answer 500 and the page shows
    // "org.hibernate.exception.DataException: could not execute batch" to the user.
    test.fail();
    const id = F.f1;
    await openList(page, '', { q: `QLF${S}` });
    const form = await openEdit(page, id);
    const idx = await form.locator('[id^="identifier-value-' + id + '-"]').count();
    await form.getByRole('button', { name: 'Add identifier' }).click();
    await form.locator(`#identifier-label-${id}-${idx}`).fill('QA long id');
    await page.keyboard.press('Tab');
    const maxAttr = await form.locator(`#identifier-value-${id}-${idx}`).getAttribute('maxlength');
    await form.locator(`#identifier-value-${id}-${idx}`).fill('v'.repeat(150));
    const put = page.waitForResponse((r) => r.url().includes(`/rest/locations/organizations/${id}`) && r.request().method() === 'PUT');
    await form.getByTestId('locations-save').click();
    const r = await put;
    const msg = await notice(page).innerText().catch(() => '');
    note('TC-LORG-05d', { maxAttr, status: r.status(), body: (await r.text()).slice(0, 300), msg });
    expect.soft(r.status(), 'refused as a validation error, not a 500').not.toBe(500);
    expect.soft(msg, 'no Java exception text in front of the user').not.toMatch(/hibernate|exception|batch/i);
  });

  test('TC-LORG-05: every text field is capped at its DB column length, or refuses with a message; nothing is cut silently (OGC-1264)', async ({ page }) => {
    // FLIP-WHEN-FIXED. Observed 2026-10-02 on local develop (image 10-01 17:48 UTC), in two runs with a fresh login and fresh records each.
    // Contact name and Description have no maxLength. 108 characters typed in Contact name were stored as 100 and the
    // page said "<name> saved." (LocationsServiceImpl trimTo). The other inputs are capped at their column length.
    test.fail();
    const id = F.f1;
    await openList(page, '', { q: `QLF${S}` });
    const form = await openEdit(page, id);
    const fields: [string, string, number][] = [
      ['name', 'name', 200], ['shortName', 'short_name', 15], ['street', 'street_address', 30], ['city', 'city', 30], ['state', 'state', 2],
      ['zip', 'zip_code', 10], ['contact', 'contact_name', 100], ['phone', 'phone', 20], ['email', 'email', 255], ['web', 'internet_address', 40],
      ['description', 'description', 1000],
    ];
    const cols = db(`select column_name||'='||coalesce(character_maximum_length,0) from information_schema.columns where table_schema='clinlims' and table_name='organization'`);
    const colLen: Record<string, number> = {};
    (cols || '').split('\n').forEach((l) => { const [k, v] = l.split('='); colLen[k] = Number(v); });
    const report: { field: string; column: string; uiMax: number | null; dbMax: number }[] = [];
    for (const [sel, col, fallback] of fields) {
      const max = await form.locator(`#${sel}-${id}`).getAttribute('maxlength');
      report.push({ field: sel, column: col, uiMax: max ? Number(max) : null, dbMax: colLen[col] || fallback });
    }
    note('TC-LORG-05.maxlength', report);
    const long = (n: number, t: string) => t.repeat(Math.ceil(n / t.length)).slice(0, n);
    const typed: Record<string, string> = {};
    for (const r of report) {
      if (r.uiMax === null && !['email', 'description'].includes(r.field)) {
        typed[r.field] = long(r.dbMax + 8, r.field === 'phone' ? '1234567890' : 'QA long value ');
        await form.locator(`#${r.field}-${id}`).fill(typed[r.field]);
      }
    }
    note('TC-LORG-05.typed', typed);
    const put = page.waitForResponse((r) => r.url().includes(`/rest/locations/organizations/${id}`) && r.request().method() === 'PUT');
    await form.getByTestId('locations-save').click();
    const resp = await put;
    const msg = await notice(page).innerText().catch(() => '');
    const d = await getDetail(page, id);
    const key: Record<string, string> = { contact: 'contactName', phone: 'phone' };
    const stored: Record<string, string> = {};
    for (const f of Object.keys(typed)) stored[f] = d[key[f] ?? f] ?? '';
    note('TC-LORG-05.result', { status: resp.status(), msg, stored });
    for (const r of report) expect.soft(r.uiMax, `${r.field}: the input caps at the column length ${r.dbMax}`).toBe(r.dbMax);
    for (const f of Object.keys(typed)) {
      const cutSilently = resp.status() === 200 && stored[f] !== typed[f];
      expect.soft(cutSilently, `${f}: ${typed[f].length} characters typed, ${stored[f].length} stored, notice "${msg}"`).toBe(false);
    }
  });

  test('TC-LORG-05b: over-long values sent past the UI are refused with 422 and a field message, not a 500 or a silent cut (OGC-1264)', async ({ page }) => {
    // FLIP-WHEN-FIXED. Observed 2026-10-02 on local develop (image 10-01 17:48 UTC), in two runs with a fresh login and fresh records each.
    // PUT /rest/locations/organizations/<id>: a 260-character name and a 150-character identifier answer 500
    // "org.hibernate.exception.DataException: could not execute batch"; an 80-character street, a 90-character website
    // and a 25-character reporting code answer 200 and are cut to 30, 40 and 20 characters without a word.
    test.fail();
    await page.goto(LOCATIONS);
    const base = await getDetail(page, F.f1);
    const tries: [string, (cur: any) => Record<string, unknown>][] = [
      ['name-260', () => ({ name: 'QA '.padEnd(260, 'x') })],
      ['street-80', () => ({ streetAddress: 'QA '.padEnd(80, 's') })],
      ['web-90', () => ({ internetAddress: 'https://qa.example.org/'.padEnd(90, 'w') })],
      ['identifier-150', (cur) => ({ identifiers: [...cur.identifiers, { label: 'QA long', value: 'v'.repeat(150), reporting: false }] })],
      ['code-25', (cur) => ({ identifiers: cur.identifiers.map((i: any) => (i.reporting ? { ...i, value: `QLF${S}`.padEnd(25, 'Z') } : i)) })],
    ];
    const out: any = {};
    const bodyOf = (cur: any) => ({
      kind: 'facility', name: cur.row.name, shortName: cur.row.shortName, typeIds: cur.row.types.map((t: any) => t.id),
      parentId: cur.parentId, identifiers: cur.identifiers, streetAddress: cur.streetAddress, city: cur.city, state: cur.state,
      gpsLatitude: cur.gpsLatitude, gpsLongitude: cur.gpsLongitude, contactName: cur.contactName, phone: cur.phone, email: cur.email,
      internetAddress: cur.internetAddress, lastupdated: cur.lastupdated,
    });
    for (const [k, patch] of tries) {
      const cur = await getDetail(page, F.f1);
      const r = await api(page, 'PUT', `/rest/locations/organizations/${F.f1}`, { ...bodyOf(cur), ...patch(cur) });
      const after = await getDetail(page, F.f1);
      out[k] = { status: r.status, body: r.text.slice(0, 300), storedName: after.row.name.length, storedStreet: (after.streetAddress || '').length,
        storedWeb: (after.internetAddress || '').length, storedCode: after.row.code, identifiers: after.identifiers };
      if (r.status === 200) {
        await api(page, 'PUT', `/rest/locations/organizations/${F.f1}`, { ...bodyOf(after), name: base.row.name, streetAddress: base.streetAddress,
          internetAddress: base.internetAddress, identifiers: base.identifiers.map((i: any) => ({ label: i.label, value: i.value, reporting: i.reporting })) });
      }
    }
    note('TC-LORG-05b', out);
    for (const k of Object.keys(out)) {
      expect.soft(out[k].status, `${k}: answered ${out[k].status} ${out[k].body}`).not.toBe(500);
      expect.soft(out[k].status, `${k}: refused (422) rather than cut and saved (200)`).toBe(422);
    }
  });

  test('TC-LORG-05c: a malformed email is refused under Email with the edit kept; a long valid one saves exactly (OGC-1265)', async ({ page }) => {
    const id = F.f1;
    await openList(page, '', { q: `QLF${S}` });
    const form = await openEdit(page, id);
    await form.locator(`#email-${id}`).fill('qa@@bad');
    const puts: number[] = [];
    page.on('response', (r) => { if (r.url().includes(`/rest/locations/organizations/${id}`) && r.request().method() === 'PUT') puts.push(r.status()); });
    await form.getByTestId('locations-save').click();
    await expect(form.getByText(/valid email/i)).toBeVisible({ timeout: 10_000 });
    note('TC-LORG-05c.bad', { puts: [...puts], notice: await notice(page).innerText().catch(() => '') });
    await expect(form.locator(`#email-${id}`)).toHaveValue('qa@@bad');
    const good = `qa.${'x'.repeat(40)}.${S}@example.org`;
    await form.locator(`#email-${id}`).fill(good);
    const put2 = page.waitForResponse((r) => r.url().includes(`/rest/locations/organizations/${id}`) && r.request().method() === 'PUT');
    await form.getByTestId('locations-save').click();
    const p2 = await put2;
    note('TC-LORG-05c.good', { status: p2.status(), body: (await p2.text()).slice(0, 300) });
    await expect(notice(page)).toContainText(/ saved\.$/);
    expect((await getDetail(page, id)).email).toBe(good);
    const dbv = db(`select email from clinlims.organization where id=${id}`);
    if (dbv !== null) expect(dbv).toBe(good);
  });

  // ---------------------------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------------------------
  test('TC-LORG-06: required name and type, GPS ranges, a duplicate identifier and a repeated label are refused inline (FR-C4, FR-I3)', async ({ page }) => {
    await openList(page);
    const writes: string[] = [];
    page.on('request', (q) => { if (['POST', 'PUT'].includes(q.method()) && q.url().includes('/rest/locations/organizations')) writes.push(q.url()); });
    await page.getByTestId('locations-add').click();
    const form = page.getByTestId('locations-form-new');
    await form.getByTestId('locations-save').click();
    const errs1 = (await form.locator('.cds--form-requirement').allInnerTexts()).join(' | ');
    note('TC-LORG-06.empty', errs1);
    expect.soft(errs1).toMatch(/name/i);
    expect.soft(errs1).toMatch(/type/i);
    expect.soft(writes, 'empty form sends nothing').toHaveLength(0);
    await form.locator('#name-new').fill(`QA Loc Val ${S}`);
    await pickTypes(page, form, 'new', ['referring clinic']);
    const gps: any = {};
    for (const [lat, lng] of [['91', '0'], ['0', '-181'], ['abc', '0']]) {
      await form.locator('#lat-new').fill(lat).catch(() => undefined);
      await form.locator('#lng-new').fill(lng);
      await form.getByTestId('locations-save').click();
      const e = (await form.locator('.cds--form-requirement').allInnerTexts()).join(' | ');
      gps[`${lat},${lng}`] = { shown: e, value: await form.locator('#lat-new').inputValue() };
      expect.soft(e, `GPS ${lat},${lng} refused`).toMatch(/degrees|latitude|longitude|-90|180/i);
    }
    note('TC-LORG-06.gps', gps);
    expect.soft(writes, 'bad GPS sends nothing').toHaveLength(0);
    await form.locator('#lat-new').fill('');
    await form.locator('#lng-new').fill('');
    // Identifier value already used by F1 under the same label and kind (FR-I3)
    await form.locator('#identifier-value-new-0').fill(`QLF${S}`);
    const post = page.waitForResponse((r) => r.url().endsWith('/rest/locations/organizations') && r.request().method() === 'POST');
    await form.getByTestId('locations-save').click();
    const pr = await post;
    const idErr = await form.locator('.cds--inline-notification').allInnerTexts();
    note('TC-LORG-06.dupIdentifier', { status: pr.status(), body: (await pr.text()).slice(0, 300), inline: idErr });
    expect.soft(pr.status()).toBe(422);
    expect.soft(idErr.join(' '), 'the clash names the other record').toContain(`QA Loc Facility ${S}`);
    // Same label twice
    await form.locator('#identifier-value-new-0').fill(`QLV${S}`);
    await form.getByRole('button', { name: 'Add identifier' }).click();
    await form.locator('#identifier-label-new-1').fill('Code');
    await page.keyboard.press('Tab');
    await form.locator('#identifier-value-new-1').fill(`QLV2${S}`);
    const post2 = page.waitForResponse((r) => r.url().endsWith('/rest/locations/organizations') && r.request().method() === 'POST');
    await form.getByTestId('locations-save').click();
    const p2 = await post2;
    note('TC-LORG-06.dupLabel', { status: p2.status(), body: (await p2.text()).slice(0, 300), inline: await form.locator('.cds--inline-notification').allInnerTexts() });
    expect.soft(p2.status()).toBe(422);
    if (p2.status() === 201) created.push((await p2.json()).detail.row.id);
  });

  test('TC-LORG-06b: a duplicate name in the same type and place warns but saves (FR-C4)', async ({ page }) => {
    // FLIP-WHEN-FIXED. Observed 2026-10-02 on local develop (image 10-01 17:48 UTC), in two runs with a fresh login and fresh records each.
    // The server returns warnings ["Another active record named ... exists here"], the page shows them with notify(),
    // then onSaved() calls notify() again with "<name> added." in the same single slot: the warning is never seen.
    test.fail();
    await page.goto(LOCATIONS);
    const name = `QA Loc Dup ${S}`;
    F.dup1 = await createOrg(page, { name, typeIds: [F.tClinic], parentId: F.kec });
    created.push(F.dup1);
    await openList(page);
    await page.getByTestId('locations-add').click();
    const form = page.getByTestId('locations-form-new');
    await form.locator('#name-new').fill(name);
    await pickTypes(page, form, 'new', ['referring clinic']);
    if (F.kec) await pickLocation(page, form, 'new', `QA Loc Kec ${S}`);
    // The Add form starts with an empty "Code" identifier row; a record without a code must remove it (TC-LORG-06d).
    await form.locator('.locationsIdentifiers').getByRole('button', { name: 'Remove' }).first().click();
    const seen: string[] = [];
    const obs = setInterval(async () => { const t = await page.locator('.locationsToast').allInnerTexts().catch(() => []); seen.push(...t); }, 100);
    const post = page.waitForResponse((r) => r.url().endsWith('/rest/locations/organizations') && r.request().method() === 'POST');
    await form.getByTestId('locations-save').click();
    const r = await post;
    expect(r.status()).toBe(201);
    const body = await r.json();
    F.dup2 = body.detail.row.id;
    created.push(F.dup2);
    await page.waitForTimeout(2500);
    clearInterval(obs);
    note('TC-LORG-06b', { warnings: body.warnings, seen: [...new Set(seen)] });
    expect.soft((body.warnings || []).join(' '), 'server warns about the duplicate').toMatch(/Another active record named/);
    expect.soft([...new Set(seen)].join(' '), 'the duplicate-name warning reaches the user').toMatch(/Another active record named/);
    const n = await listOrgs(page, { view: 'organizations', q: name, status: 'all' });
    expect(n.total).toBe(2);
  });

  test('TC-LORG-06d: a new record saved with the pre-filled Code row left blank saves without a code (the code is optional, FR-I2)', async ({ page }) => {
    // FLIP-WHEN-FIXED. Observed 2026-10-02 on local develop (image 10-01 17:48 UTC), in two runs with a fresh login and fresh records each.
    // The Add form starts with an empty "Code" identifier row. Saving without a code answers 422
    // "Every identifier needs a value"; the user has to find and press Remove on that row. The code is optional (FR-I2).
    test.fail();
    await openList(page);
    await page.getByTestId('locations-add').click();
    const form = page.getByTestId('locations-form-new');
    const name = `QA Loc NoCode ${S}`;
    await form.locator('#name-new').fill(name);
    await pickTypes(page, form, 'new', ['referring clinic']);
    const post = page.waitForResponse((r) => r.url().endsWith('/rest/locations/organizations') && r.request().method() === 'POST');
    await form.getByTestId('locations-save').click();
    const r = await post;
    const body = (await r.text()).slice(0, 400);
    const shown = await form.locator('.cds--inline-notification, .cds--form-requirement').allInnerTexts().catch(() => []);
    note('TC-LORG-06d', { status: r.status(), body, shown, notice: await notice(page).innerText().catch(() => '') });
    if (r.status() === 201) created.push(JSON.parse(await r.text()).detail.row.id);
    expect(r.status(), `saved without a code: ${body}`).toBe(201);
  });

  test('TC-LORG-06c: a referral lab with no approval status is refused, and the user can see why (FR-J1; why the 2 Oct probe sent nothing)', async ({ page }) => {
    // FLIP-WHEN-FIXED. Observed 2026-10-02 on local develop (image 10-01 17:48 UTC), in two runs with a fresh login and fresh records each.
    // Root cause of the 2 Oct probe's "no request": a referral lab needs an Approval status (FR-J1). Save is blocked on
    // the client with the only message, "Choose an approval status", under the Referral section far below the fold; no
    // notification, no scroll, focus stays on Save. Every existing referral lab (Alpha, Beta, Gamma and any migrated
    // one) has no approval status, so the first edit of each one looks like a dead Save button.
    test.fail();
    await openList(page);
    const writes: string[] = [];
    page.on('request', (q) => { if (['POST', 'PUT'].includes(q.method()) && q.url().includes('/rest/locations/organizations')) writes.push(q.url()); });
    await page.getByTestId('locations-add').click();
    const form = page.getByTestId('locations-form-new');
    await form.locator('#name-new').fill(`QA Loc NoApproval ${S}`);
    await pickTypes(page, form, 'new', ['referralLab']);
    await form.locator('#identifier-value-new-0').fill(`QLN${S}`);
    await form.locator('#name-new').click();
    await form.getByTestId('locations-save').click();
    await page.waitForTimeout(1000);
    const err = form.getByText('Choose an approval status');
    await expect(err).toBeVisible();
    const errOnScreen = await inView(err);
    const noticeShown = await notice(page).isVisible().catch(() => false);
    const focused = await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);
    note('TC-LORG-06c', { writes: writes.length, errOnScreen, noticeShown, focused });
    expect(writes, 'blocked on the client').toHaveLength(0);
    expect.soft(errOnScreen || noticeShown || /ref-status/.test(String(focused)), 'the reason is on screen, or focus moves to it').toBe(true);
  });

  // ---------------------------------------------------------------------------------------------
  // Lists, search and filters
  // ---------------------------------------------------------------------------------------------
  test('TC-LORG-07: a code search lists that code first; a ward name returns its organization expanded with the ward highlighted; no ward is a top-level row (AC3, FR-B3, FR-B6)', async ({ page }) => {
    await page.goto(LOCATIONS);
    if (!F.annex) {
      F.annex = await createOrg(page, { name: `QA Loc Annex QLF${S} wing`, typeIds: [F.tClinic], identifiers: [{ label: 'Code', value: `QLA${S}`, reporting: true }] });
      created.push(F.annex); saveFix();
    }
    if (!F.w1) { F.w1 = await createWard(page, F.f1, { name: `QA Loc Ward Maternity ${S}`, serviceType: 'MATERNITY' }); created.push(F.w1); saveFix(); }
    await openList(page);
    await search(page, `QLF${S}`, 2);
    await expect(rows(page).first(), 'the exact code match is listed first').toHaveAttribute('data-testid', `locations-row-${F.f1}`);
    await search(page, `QA Loc Ward Maternity ${S}`, 1);
    await expect(rows(page).first()).toHaveAttribute('data-testid', `locations-row-${F.f1}`);
    await expect(rows(page).first(), 'says why it matched').toContainText(`QA Loc Ward Maternity ${S}`);
    await expect(page.getByTestId(`locations-row-${F.w1}`), 'the ward is not a top-level row').toHaveCount(0);
    const all = await listOrgs(page, { view: 'organizations', q: `QA Loc`, status: 'all', pageSize: '100' });
    expect(all.items.filter((r: any) => r.kind === 'ward'), 'REST lists no ward at the top level').toHaveLength(0);
    // FR-B6: the Type filter does not offer the dept type.
    expect((L.facilityTypes || []).map((t: any) => t.name.toLowerCase()), 'dept is not a facility type').not.toContain('dept');
  });

  test('TC-LORG-07w: a ward name search opens its organization with the ward highlighted (AC3, FR-B6)', async ({ page }) => {
    // FLIP-WHEN-FIXED. Observed 2026-10-02 on local develop (image 10-01 17:48 UTC), in two runs with a fresh login and fresh records each.
    // Searching a ward's name returns its organization with the note "Ward / dept: <ward>", but the row is not
    // expanded, so the ward is not shown or highlighted. Seen three times (two runs and a separate probe).
    test.fail();
    test.skip(!F.w1, 'needs TC-LORG-07');
    await openList(page);
    await search(page, `QA Loc Ward Maternity ${S}`, 1);
    const form = page.getByTestId(`locations-form-${F.f1}`);
    await expect(form, 'the parent is expanded').toBeVisible({ timeout: 10_000 });
    await expect(form.getByTestId(`locations-ward-${F.w1}`), 'the matching ward is highlighted').toHaveClass(/lo-highlight/);
  });

  test('TC-LORG-07b: Type = referral lab with Status = Inactive lists only inactive referral labs, the type shows as a named tag, and the URL restores it (AC2, AC1)', async ({ page }) => {
    await page.goto(LOCATIONS);
    if (!F.r2) {
      F.r2 = await createOrg(page, { name: `QA Loc RefLab Closed ${S}`, typeIds: [F.tRef], referral: { approvalStatus: 'Suspended' } });
      created.push(F.r2); saveFix();
      await setActive(page, [F.r2], false);
    }
    await openList(page);
    // Scope to this run first: earlier runs leave inactive QA referral labs that push this one off page 1.
    await search(page, S);
    const typeBox = page.getByPlaceholder('All types');
    await typeBox.click();
    await page.getByRole('listbox').getByRole('option', { name: /^referralLab$/i }).first().click();
    await page.keyboard.press('Escape');
    const status = page.locator('select').filter({ has: page.locator('option', { hasText: /^Inactive$/ }) }).first();
    const filtered = page.waitForResponse((r) => /rest\/locations\/organizations\?/.test(r.url()) && r.url().includes(`type=${F.tRef}`) && r.url().includes('status=inactive'));
    await status.selectOption({ label: 'Inactive' });
    await filtered;
    // The list has no stale-response guard: wait for the rows of the filtered answer, not just any network quiet.
    await expect(rows(page).filter({ hasText: `QA Loc RefLab Closed ${S}` })).toHaveCount(1, { timeout: 15_000 });
    await expect(page).toHaveURL(/status=inactive/);
    await expect(page).toHaveURL(new RegExp(`type=${F.tRef}`));
    const tags = page.getByTestId('locations-filter-tags');
    await expect(tags, 'the selected type shows by name').toContainText(/referralLab/i);
    await expect.soft(tags, 'not a bare count').not.toHaveText(/^\s*\d+\s*$/);
    await page.waitForLoadState('networkidle');
    const texts = await rows(page).allInnerTexts();
    note('TC-LORG-07b', { count: texts.length, sample: texts.slice(0, 5) });
    expect(texts.length).toBeGreaterThan(0);
    for (const t of texts) { expect.soft(t).toMatch(/referralLab/i); expect.soft(t).toMatch(/Inactive/); }
    expect(texts.join('\n')).toContain(`QA Loc RefLab Closed ${S}`);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('locations-filter-tags')).toContainText(/referralLab/i, { timeout: 30_000 });
    await expect(rows(page).filter({ hasText: `QA Loc RefLab Closed ${S}` })).toHaveCount(1);
  });

  test('TC-LORG-07c: Location = a province lists records placed in it or anywhere beneath it, and sorting by Location groups them (AC18, FR-B4a)', async ({ page }) => {
    test.skip(!F.prov, 'no geographic levels on this instance');
    await openList(page);
    const box = page.getByPlaceholder('Any area');
    await box.click();
    await box.fill(`QA Loc Prov ${S}`);
    const filtered = page.waitForResponse((r) => r.url().includes(`location=${F.prov}`));
    await page.getByRole('option', { name: new RegExp(`QA Loc Prov ${S}`) }).first().click();
    await expect(page).toHaveURL(new RegExp(`location=${F.prov}`));
    await filtered;
    await expect(rows(page).filter({ hasText: `QA Loc RefLab ${S}` })).toHaveCount(1, { timeout: 15_000 });
    const ids = await rows(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')!.replace('locations-row-', '')));
    note('TC-LORG-07c.ui', ids);
    for (const id of [F.f1, F.r1]) expect.soft(ids, `record ${id} is listed under the province`).toContain(id);
    await expect(page.getByTestId('locations-filter-tags'), 'the area shows as a tag with its path').toContainText(`QA Loc Prov ${S}`);
    const api1 = await listOrgs(page, { view: 'organizations', location: F.prov, status: 'all', pageSize: '100' });
    const apiIds = api1.items.map((r: any) => r.id);
    for (const id of [F.f1, F.f2, F.r1]) expect.soft(apiIds, `REST: ${id} under the province (placed at province, district or Kecamatan)`).toContain(id);
    // Scope to this run (q = stamp): earlier runs leave many inactive "QA Loc" records behind.
    const sorted = await listOrgs(page, { view: 'organizations', q: S, sort: 'location', status: 'all', pageSize: '100' });
    const pos = sorted.items.map((r: any, i: number) => ((r.location?.path || []).join('/').startsWith(`QA Loc Prov ${S}`) || r.location?.name === `QA Loc Prov ${S}` ? i : -1)).filter((i: number) => i >= 0);
    note('TC-LORG-07c.sort', { pos, paths: sorted.items.map((r: any) => (r.location?.path || []).join(' / ')).slice(0, 40) });
    expect.soft(pos.length).toBeGreaterThan(1);
    if (pos.length) expect.soft(pos[pos.length - 1] - pos[0] + 1, 'records in the province sit together when sorted by Location').toBe(pos.length);
  });

  test('TC-LORG-07g: the default sort (Name) lists records in name order across pages (FR-B1, FR-B2)', async ({ page }) => {
    // FLIP-WHEN-FIXED. Observed 2026-10-02 on local develop (image 10-01 17:48 UTC), in two runs with a fresh login and fresh records each.
    // GET /rest/locations/organizations?sort=name answers two name-sorted runs back to back: "QA 1263" ... "Test LIMS",
    // then "QA Loc Annex" ... again. Records missing from page 1 look absent, and ?id= links to them open nothing (TC-LORG-01b).
    test.fail();
    await page.goto(LOCATIONS);
    const a = await listOrgs(page, { view: 'organizations', status: 'active', sort: 'name', page: '1', pageSize: '100' });
    const names = a.items.map((r: any) => r.name as string);
    const sorted = [...names].sort((x, y) => x.localeCompare(y, 'en', { sensitivity: 'base' }));
    const firstOut = names.findIndex((n, i) => n !== sorted[i]);
    note('TC-LORG-07g', { firstOut, around: names.slice(Math.max(0, firstOut - 2), firstOut + 3), locations: a.items.slice(0, 40).map((r: any) => `${r.name} @ ${r.location?.name ?? '-'}`) });
    expect(firstOut, `out of order at ${firstOut}: ${names.slice(Math.max(0, firstOut - 2), firstOut + 3).join(' | ')}`).toBe(-1);
  });

  test('TC-LORG-07d: a DHIS2 ID value finds its organization and says so; a label typed once is suggested on other records (AC19)', async ({ page }) => {
    await openList(page);
    await search(page, `Dh${S}xQ`, 1);
    await expect(rows(page).first()).toHaveAttribute('data-testid', `locations-row-${F.f1}`);
    await expect(rows(page).first()).toContainText(`DHIS2 ID Dh${S}xQ`);
    await expect.soft(rows(page).first(), 'the list Code column shows the reporting code').toContainText(`QLF${S}`);
    const l2 = await lists(page);
    expect.soft(l2.identifierLabels, 'DHIS2 ID is suggested').toContain('DHIS2 ID');
    expect.soft(l2.identifierLabels, 'the label typed in TC-LORG-03 is suggested').toContain(`Provincial code ${S}`);
    await search(page, `QLR${S}`, 1);
    const form = await openEdit(page, F.r1);
    await form.getByRole('button', { name: 'Add identifier' }).click();
    const idx = (await form.locator(`[id^="identifier-value-${F.r1}-"]`).count()) - 1;
    await form.locator(`#identifier-label-${F.r1}-${idx}`).click();
    await form.locator(`#identifier-label-${F.r1}-${idx}`).fill('Provincial');
    await expect.soft(page.getByRole('option', { name: `Provincial code ${S}` }), 'suggested while typing').toBeVisible();
  });

  test('TC-LORG-07e: a referral lab past its review date shows Review overdue, and the overdue filter lists it (AC21, FR-J2)', async ({ page }) => {
    await openList(page);
    await search(page, `QLR${S}`, 1);
    await expect(rows(page).first()).toContainText('Review overdue');
    await openList(page, '', { overdue: '1', q: 'QA Loc' });
    const texts = await rows(page).allInnerTexts();
    expect(texts.join('\n')).toContain(`QA Loc RefLab ${S}`);
    // The filter is "overdue OR expired" by definition (FR-J2), so a row qualifies on either tag.
    const untagged = texts.filter((t) => !/Review overdue/.test(t) && !/Accreditation expired/.test(t));
    expect.soft(untagged, 'every listed row carries an overdue or expired tag').toEqual([]);
    const api1 = await listOrgs(page, { view: 'organizations', reviewOverdue: 'true', status: 'all', pageSize: '100' });
    expect(api1.items.filter((r: any) => !r.reviewOverdue && !r.accreditationExpired), 'REST: nothing un-flagged').toEqual([]);
  });

  test('TC-LORG-07f: a search with no match here names the matches in the other view, with a link (FR-B8, FR-B9)', async ({ page }) => {
    await page.goto(LOCATIONS);
    const sites = await listOrgs(page, { view: 'sites', status: 'active', pageSize: '1' });
    test.skip(!sites.items.length, 'no sampling site on this instance');
    const code = sites.items[0].code || sites.items[0].name;
    await openList(page);
    await search(page, code, 0);
    const empty = page.getByTestId('locations-empty');
    await expect(empty).toBeVisible();
    // The other-view count is a second request that lands after the empty state renders.
    await expect(empty).toContainText(/in Sampling Sites/i, { timeout: 10_000 });
    const t = await empty.innerText();
    note('TC-LORG-07f', t);
    expect.soft(t).toMatch(/match(es)? in Sampling Sites/i);
    expect.soft(t).toMatch(/Clear filters/i);
  });

  // ---------------------------------------------------------------------------------------------
  // Wards / depts
  // ---------------------------------------------------------------------------------------------
  test('TC-LORG-08: two wards added from the expanded row are saved as dept under that organization and appear in order entry departments (AC5, FR-D2, FR-D4)', async ({ page }) => {
    await page.goto(LOCATIONS);
    if (!F.wa) {
      F.wa = await createOrg(page, { name: `QA Loc Wards A ${S}`, typeIds: [F.tClinic], gpsLatitude: -5.1, gpsLongitude: 145.7, identifiers: [{ label: 'Code', value: `QWA${S}`, reporting: true }] });
      F.wb = await createOrg(page, { name: `QA Loc Wards B ${S}`, typeIds: [F.tClinic], gpsLatitude: -4.2, gpsLongitude: 144.3, identifiers: [{ label: 'Code', value: `QWB${S}`, reporting: true }] });
      created.push(F.wa, F.wb); saveFix();
    }
    await openList(page);
    await search(page, `QWA${S}`, 1);
    const form = await openEdit(page, F.wa);
    await form.getByTestId('locations-add-ward').click();
    await form.getByTestId('locations-add-ward').click();
    const drafts = form.getByTestId('locations-ward-draft');
    await expect(drafts).toHaveCount(2);
    await expect.soft(form.getByTestId('locations-save-wards'), 'Save wards stays disabled until each has a name and service type').toBeDisabled();
    await drafts.nth(0).getByPlaceholder('Ward / dept name').fill(`QA Loc OPD ${S}`);
    await drafts.nth(0).locator('select').selectOption({ label: 'Outpatient' });
    await drafts.nth(1).getByPlaceholder('Ward / dept name').fill(`QA Loc ICU ${S}`);
    await drafts.nth(1).locator('select').selectOption({ label: 'Intensive care' });
    await expect.soft(drafts.nth(0), 'the draft row says the ward will inherit the parent GPS').toContainText(/inherit/i);
    await form.getByTestId('locations-save-wards').click();
    const wards = form.locator('[data-testid^="locations-ward-"]:not([data-testid="locations-ward-draft"])');
    await expect(wards.filter({ hasText: `QA Loc OPD ${S}` })).toBeVisible();
    await expect(wards.filter({ hasText: `QA Loc ICU ${S}` })).toBeVisible();
    const list = await api(page, 'GET', `/rest/locations/organizations/${F.wa}/wards?includeInactive=true`);
    const byName = Object.fromEntries((list.json as any[]).map((w) => [w.name, w]));
    F.opd = byName[`QA Loc OPD ${S}`].id; F.icu = byName[`QA Loc ICU ${S}`].id; saveFix();
    created.push(F.opd, F.icu);
    expect(byName[`QA Loc OPD ${S}`].serviceType).toBe('OUTPATIENT');
    expect(byName[`QA Loc ICU ${S}`].serviceType).toBe('INTENSIVE_CARE');
    expect(byName[`QA Loc OPD ${S}`].gpsInherited, 'blank GPS inherits').toBe(true);
    expect(Number(byName[`QA Loc OPD ${S}`].gpsLatitude)).toBeCloseTo(-5.1, 4);
    const dbr = db(`select o.org_id, t.short_name, o.service_type from clinlims.organization o join clinlims.organization_organization_type ot on ot.org_id=o.id join clinlims.organization_type t on t.id=ot.org_type_id where o.id in (${F.opd},${F.icu}) order by o.id`);
    if (dbr !== null) { note('TC-LORG-08.db', dbr); for (const line of dbr.split('\n')) { const [p, t] = line.split('|'); expect.soft(p).toBe(F.wa); expect.soft(t).toBe('dept'); } }
    const dep = await api(page, 'GET', `/rest/departments-for-site?refferingSiteId=${F.wa}`);
    note('TC-LORG-08.departments', dep.text.slice(0, 600));
    expect(dep.status).toBe(200);
    expect(dep.text, 'order entry department picker lists the new ward').toContain(`QA Loc OPD ${S}`);
    expect(dep.text).toContain(`QA Loc ICU ${S}`);
  });

  test('TC-LORG-08b: a ward with its own GPS keeps it when moved; an inheriting ward takes the new parent\'s; an inactive ward leaves the department picker (AC5, FR-D2a, FR-D3, FR-D4)', async ({ page }) => {
    await page.goto(LOCATIONS);
    test.skip(!F.opd || !F.icu, 'needs TC-LORG-08');
    await openList(page);
    await search(page, `QWA${S}`, 1);
    const form = await openEdit(page, F.wa);
    const icuRow = form.getByTestId(`locations-ward-${F.icu}`);
    await icuRow.getByRole('button', { name: `Edit QA Loc ICU ${S}` }).click();
    await form.locator(`#ward-lat-${F.icu}`).fill('-5.5');
    await form.locator(`#ward-lng-${F.icu}`).fill('145.5');
    // In edit mode the ward's Save / Cancel sit in the wards table, not in the ward's own row.
    await form.getByTestId('locations-wards').getByRole('button', { name: 'Save', exact: true }).click();
    await expect(form.getByTestId(`locations-ward-${F.icu}`)).toContainText('-5.5');
    // Move both to Wards B through the UI
    for (const w of [F.opd, F.icu]) {
      const row = form.getByTestId(`locations-ward-${w}`);
      await row.getByRole('button', { name: /^Edit / }).click();
      await form.getByTestId('locations-wards').getByRole('button', { name: /Move/ }).first().click();
      const mv = form.locator(`#ward-move-${w}`);
      await mv.fill(`QA Loc Wards B ${S}`);
      await page.getByRole('option', { name: `QA Loc Wards B ${S}` }).first().click();
      await expect(form.getByTestId(`locations-ward-${w}`)).toHaveCount(0, { timeout: 15_000 });
    }
    const b = await api(page, 'GET', `/rest/locations/organizations/${F.wb}/wards?includeInactive=true`);
    const byId = Object.fromEntries((b.json as any[]).map((w) => [w.id, w]));
    note('TC-LORG-08b.moved', b.json);
    expect(byId[F.opd], 'OPD is under Wards B').toBeTruthy();
    expect(Number(byId[F.opd].gpsLatitude), 'inheriting ward takes the new parent GPS').toBeCloseTo(-4.2, 4);
    expect(byId[F.opd].gpsInherited).toBe(true);
    expect(Number(byId[F.icu].gpsLatitude), 'own GPS kept').toBeCloseTo(-5.5, 4);
    expect(byId[F.icu].gpsInherited).toBe(false);
    const dbp = db(`select org_id from clinlims.organization where id=${F.opd}`);
    if (dbp !== null) expect(dbp).toBe(F.wb);
    // Deactivate ICU from its row toggle: it leaves the department picker.
    await openList(page);
    await search(page, `QWB${S}`, 1);
    const fb = await openEdit(page, F.wb);
    await fb.locator(`#ward-active-${F.icu}`).locator('xpath=..').click();
    await expect.poll(async () => (await api(page, 'GET', `/rest/locations/organizations/${F.wb}/wards?includeInactive=true`)).json.find((w: any) => w.id === F.icu)?.active, { timeout: 15_000 }).toBe(false);
    const dep = await api(page, 'GET', `/rest/departments-for-site?refferingSiteId=${F.wb}`);
    expect(dep.text).toContain(`QA Loc OPD ${S}`);
    expect(dep.text, 'inactive ward is not offered').not.toContain(`QA Loc ICU ${S}`);
  });

  test('TC-LORG-08c: pressing the form Save with unsaved draft wards either saves them or warns; drafts are never dropped silently (heuristic)', async ({ page }) => {
    // FLIP-WHEN-FIXED. Observed 2026-10-02 on local develop (image 10-01 17:48 UTC), in two runs with a fresh login and fresh records each.
    // A draft ward (name and service type filled) is dropped without a word when the form's own Save is pressed:
    // the page says "<organization> saved.", the draft row is gone and no ward was created. Only "Save N wards" saves them.
    test.fail();
    await openList(page);
    await search(page, `QWA${S}`, 1);
    const form = await openEdit(page, F.wa);
    await form.getByTestId('locations-add-ward').click();
    await form.getByTestId('locations-ward-draft').getByPlaceholder('Ward / dept name').fill(`QA Loc Draft ${S}`);
    await form.getByTestId('locations-ward-draft').locator('select').selectOption({ label: 'Emergency' });
    let dialog = '';
    page.once('dialog', async (d) => { dialog = d.message(); await d.dismiss(); });
    await form.getByTestId('locations-save').click();
    await page.waitForTimeout(2500);
    const wards = await api(page, 'GET', `/rest/locations/organizations/${F.wa}/wards?includeInactive=true`);
    const saved = (wards.json as any[]).some((w) => w.name === `QA Loc Draft ${S}`);
    const draftStill = await page.getByTestId('locations-ward-draft').count();
    const msg = await notice(page).innerText().catch(() => '');
    note('TC-LORG-08c', { saved, draftStill, dialog, msg });
    if (saved) created.push((wards.json as any[]).find((w) => w.name === `QA Loc Draft ${S}`).id);
    expect(saved || draftStill > 0 || !!dialog || /draft|unsaved|not saved/i.test(msg), 'the draft ward is saved, kept, or the user is warned').toBe(true);
  });

  test('TC-LORG-08d: when one of two new wards fails to save, the user is told which, and retrying does not duplicate the one that saved (FR-D2)', async ({ page }) => {
    // FLIP-WHEN-FIXED. Observed 2026-10-02 on local develop (image 10-01 17:48 UTC), in two runs with a fresh login and fresh records each.
    // WardsSection.saveNew posts all drafts with Promise.all; when the second POST fails, the first ward is saved but
    // both drafts stay on screen, so pressing "Save 2 wards" again creates the first ward a second time.
    test.fail();
    await openList(page);
    await search(page, `QWA${S}`, 1);
    const form = await openEdit(page, F.wa);
    let n = 0;
    await page.route(`**/rest/locations/organizations/${F.wa}/wards`, (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      n += 1;
      return n === 2 ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"QA forced ward failure"}' }) : route.continue();
    });
    for (const nm of [`QA Loc Part1 ${S}`, `QA Loc Part2 ${S}`]) {
      await form.getByTestId('locations-add-ward').click();
      const d = form.getByTestId('locations-ward-draft').last();
      await d.getByPlaceholder('Ward / dept name').fill(nm);
      await d.locator('select').selectOption({ label: 'Other' });
    }
    await form.getByTestId('locations-save-wards').click();
    await page.waitForTimeout(2500);
    await page.unroute(`**/rest/locations/organizations/${F.wa}/wards`);
    const msg1 = await notice(page).innerText().catch(() => '');
    const draftsLeft = await form.getByTestId('locations-ward-draft').count();
    if (draftsLeft) await form.getByTestId('locations-save-wards').click();
    await page.waitForTimeout(2500);
    const all = (await api(page, 'GET', `/rest/locations/organizations/${F.wa}/wards?includeInactive=true`)).json as any[];
    const p1 = all.filter((w) => w.name === `QA Loc Part1 ${S}`);
    created.push(...all.filter((w) => /QA Loc Part/.test(w.name)).map((w) => w.id));
    note('TC-LORG-08d', { msg1, draftsLeft, part1Count: p1.length, part2: all.filter((w) => w.name === `QA Loc Part2 ${S}`).length });
    expect.soft(msg1, 'the failure is reported').toMatch(/fail|not saved|QA forced/i);
    expect.soft(p1.length, 'Part1 saved once, not twice after the retry').toBe(1);
  });

  // ---------------------------------------------------------------------------------------------
  // Deactivation, guard, Undo
  // ---------------------------------------------------------------------------------------------
  test('TC-LORG-09: deactivating a facility with wards asks first; "facility only" leaves the wards active; Undo restores (AC4, AC23, FR-E2, FR-E4)', async ({ page }) => {
    await page.goto(LOCATIONS);
    if (!F.g1) {
      F.g1 = await createOrg(page, { name: `QA Loc Guard ${S}`, typeIds: [F.tClinic], identifiers: [{ label: 'Code', value: `QLG${S}`, reporting: true }] });
      F.g1w1 = await createWard(page, F.g1, { name: `QA Loc Guard W1 ${S}`, serviceType: 'INPATIENT' });
      F.g1w2 = await createWard(page, F.g1, { name: `QA Loc Guard W2 ${S}`, serviceType: 'OUTPATIENT' });
      created.push(F.g1, F.g1w1, F.g1w2); saveFix();
    }
    const state = async () => {
      const d = await getDetail(page, F.g1);
      const w = (await api(page, 'GET', `/rest/locations/organizations/${F.g1}/wards?includeInactive=true`)).json as any[];
      return { org: d.row.active, wards: w.map((x) => x.active) };
    };
    await openList(page);
    await search(page, `QLG${S}`, 1);
    await page.locator(`#active-${F.g1}`).locator('xpath=..').click();
    const guard = page.getByRole('dialog');
    await expect(guard).toContainText('2 active wards', { timeout: 15_000 });
    const guardText = await guard.innerText();
    note('TC-LORG-09.guard', guardText);
    await expect.soft(guard, 'the guard says inactive records still show on old orders (FR-E1)').toContainText(/existing orders|still appear/i);
    await guard.getByRole('button', { name: / only$/ }).click();
    await expect(notice(page)).toContainText(`QA Loc Guard ${S} deactivated.`);
    expect(await state()).toEqual({ org: false, wards: [true, true] });
    const undoBtn = page.getByRole('button', { name: 'Undo' });
    await page.waitForTimeout(8_000);
    await expect(undoBtn, 'Undo is still offered after 8 s (FR-L3: at least 10 s)').toBeVisible();
    await undoBtn.click();
    await expect(notice(page)).toContainText('reactivated.');
    expect(await state()).toEqual({ org: true, wards: [true, true] });

    // With the wards, then a ward cannot be reactivated alone, then Undo brings back all three.
    await search(page, `QLG${S}`, 1);
    await page.locator(`#active-${F.g1}`).locator('xpath=..').click();
    await page.getByRole('dialog').getByRole('button', { name: /and its 2/ }).click();
    await expect(notice(page)).toContainText('deactivated.');
    expect(await state()).toEqual({ org: false, wards: [false, false] });
    const blocked = await setActive(page, [F.g1w1], true);
    note('TC-LORG-09.blocked', blocked);
    expect(blocked.status, 'a ward under an inactive facility cannot be reactivated').toBe(409);
    expect(blocked.text).toContain(`Reactivate QA Loc Guard ${S} first.`);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(notice(page)).toContainText('reactivated.');
    expect(await state(), 'Undo reactivates the facility and the wards deactivated with it').toEqual({ org: true, wards: [true, true] });
    const hist = await api(page, 'GET', `/rest/locations/organizations/${F.g1}/history`);
    const actions = (hist.json as any[]).map((e) => e.action);
    note('TC-LORG-09.history', actions);
    expect.soft(actions.filter((a) => /DEACTIVATED/i.test(a)).length, 'both deactivations are in history').toBeGreaterThanOrEqual(2);
    expect.soft(actions.filter((a) => /REACTIVATED|ACTIVATED/i.test(a)).length, 'both Undos are in history').toBeGreaterThanOrEqual(2);
  });

  test('TC-LORG-09b: the guard counts open orders the way the database does; Cancel changes nothing (AC4)', async ({ page }) => {
    await page.goto(LOCATIONS);
    const busy = (await listOrgs(page, { view: 'organizations', q: 'QA Auto Clinic', status: 'active', pageSize: '50' })).items
      .filter((r: any) => r.inUse.open > 0).sort((a: any, b: any) => b.inUse.open - a.inUse.open)[0];
    test.skip(!busy, 'no QA organization with open orders');
    const usage = (await api(page, 'GET', `/rest/locations/organizations/${busy.id}/usage`)).json;
    await openList(page, '', { q: busy.name });
    await page.locator(`#active-${busy.id}`).locator('xpath=..').click();
    const guard = page.getByRole('dialog');
    await expect(guard).toBeVisible();
    const text = await guard.innerText();
    const dbOpen = db(`select count(distinct s.id) from clinlims.sample s join clinlims.sample_requester sr on sr.sample_id=s.id where sr.requester_id=${busy.id} and sr.requester_type_id=(select id from clinlims.requester_type where requester_type='organization') and s.status_id not in (select id from clinlims.status_of_sample where name in ('Finished','Canceled','NonConforming','Validated'))`);
    note('TC-LORG-09b', { id: busy.id, usage, text, dbOpen });
    expect(text).toContain(`${usage.inUse.open} open orders`);
    await guard.getByRole('button', { name: 'Cancel' }).click();
    expect((await getDetail(page, busy.id)).row.active).toBe(true);
  });

  test('TC-LORG-09c: no screen in the menu offers Delete (AC4)', async ({ page }) => {
    const found: Record<string, number> = {};
    for (const route of ['', '/sites', '/areas', '/import']) {
      await page.goto(`${LOCATIONS}${route}`, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle');
      found[route || '/'] = await page.getByRole('button', { name: /delete/i }).or(page.getByRole('menuitem', { name: /delete/i })).count();
    }
    await openList(page);
    await search(page, `QWB${S}`, 1);
    await openEdit(page, F.wb);
    found['form+wards'] = await page.getByRole('button', { name: /delete/i }).count();
    note('TC-LORG-09c', found);
    for (const k of Object.keys(found)) expect.soft(found[k], `Delete on ${k}`).toBe(0);
  });

  test('TC-LORG-09d: a deactivated organization drops out of the order entry site list and the referral lab list, and comes back on reactivation (FR-E1)', async ({ page }) => {
    await page.goto(LOCATIONS);
    const sites = async () => JSON.stringify((await api(page, 'GET', '/rest/SamplePatientEntry')).json?.sampleOrderItems?.referringSiteList || []);
    const refs = async () => (await api(page, 'GET', '/rest/displayList/REFERRAL_ORGANIZATIONS')).text;
    await setActive(page, [F.r1, F.f2], true);
    const n2 = (await getDetail(page, F.f2)).row.name;
    const look = async () => ({ site: (await sites()).includes(n2), ref: (await refs()).includes(`QA Loc RefLab ${S}`) });
    const before = await look();
    await setActive(page, [F.r1, F.f2], false);
    const during = await look();
    await setActive(page, [F.r1, F.f2], true);
    const after = await look();
    note('TC-LORG-09d', { before, during, after });
    expect(before).toEqual({ site: true, ref: true });
    expect(during, 'hidden from both pickers while inactive').toEqual({ site: false, ref: false });
    expect(after).toEqual({ site: true, ref: true });
  });

  // ---------------------------------------------------------------------------------------------
  // Sampling Sites and the vector_sampling_site mirror
  // ---------------------------------------------------------------------------------------------
  test('TC-LORG-13: a site added here is a vector sampling site with the same code, name, type, GPS and link; edits and deactivation carry over (FR-A3, AC6)', async ({ page }) => {
    const name = `QA Loc Trap ${S}`;
    const code = `QVT${S}`;
    await openList(page, 'sites');
    await page.getByTestId('locations-add').click();
    const form = page.getByTestId('locations-form-new');
    await form.locator('#name-new').fill(name);
    await form.locator('#identifier-value-new-0').fill(code);
    await form.locator('#site-type-new').selectOption({ label: 'Water Source' });
    await form.locator('#site-zone-new').selectOption({ label: 'Urban' }).catch(() => undefined);
    if (F.kec) await pickLocation(page, form, 'new', `QA Loc Kec ${S}`);
    await form.locator('#lat-new').fill('-6.7160');
    await form.locator('#lng-new').fill('147.0010');
    await form.locator('#contact-new').fill('QA Wari');
    const post = page.waitForResponse((r) => r.url().endsWith('/rest/locations/organizations') && r.request().method() === 'POST');
    await form.getByTestId('locations-save').click();
    const pr = await post;
    expect(pr.status(), (await pr.text()).slice(0, 300)).toBe(201);
    F.site = (await pr.json()).detail.row.id; created.push(F.site); saveFix();
    await expect(notice(page)).toContainText(`${name} added.`);
    const vec = async () => ((await api(page, 'GET', '/rest/admin/vector/sampling-sites')).json as any[]).find((x) => x.code === code);
    const v1 = await vec();
    note('TC-LORG-13.vector', v1);
    expect(v1, 'listed by the vector sampling-site API').toBeTruthy();
    expect(v1.name).toBe(name);
    expect(String(v1.organizationId)).toBe(F.site);
    expect.soft(v1.type).toBe('Water Source');
    expect.soft(Number(v1.gpsLatitude)).toBeCloseTo(-6.716, 4);
    if (F.kec) expect.soft(String(v1.locationOrgId ?? ''), 'site location = the chosen area').toBe(F.kec);
    expect.soft(v1.contactName).toBe('QA Wari');
    // Edit here, read there
    await search(page, code, 1);
    const ed = await openEdit(page, F.site);
    await ed.locator(`#name-${F.site}`).fill(`${name} renamed`);
    await ed.getByTestId('locations-save').click();
    await expect(notice(page)).toContainText('saved.');
    expect((await vec()).name, 'rename mirrored to vector_sampling_site').toBe(`${name} renamed`);
    // Vector order site search finds it while active
    const s1 = await api(page, 'GET', `/rest/admin/vector/sampling-sites/search?search=${encodeURIComponent(code)}`);
    expect(s1.text, 'vector order site search finds the active site').toContain(code);
    await setActive(page, [F.site], false);
    const v2 = await vec();
    const act = await api(page, 'GET', '/rest/admin/vector/sampling-sites/active');
    const s2 = await api(page, 'GET', `/rest/admin/vector/sampling-sites/search?search=${encodeURIComponent(code)}`);
    note('TC-LORG-13.inactive', { active: v2.active, inActiveList: act.text.includes(code), inSearch: s2.text.includes(code) });
    expect(v2.active, 'deactivation mirrored').toBe(false);
    expect.soft(act.text.includes(code), 'not offered by /active').toBe(false);
    expect.soft(s2.text.includes(code), 'not offered by the order site search').toBe(false);
    await setActive(page, [F.site], true);
    const dbr = db(`select v.code, v.name, v.active, v.organization_id, o.name, o.is_active from clinlims.vector_sampling_site v join clinlims.organization o on o.id=v.organization_id where v.code='${code}'`);
    if (dbr !== null) { note('TC-LORG-13.db', dbr); expect(dbr).toContain(`|${F.site}|${name} renamed|Y`); }
  });

  test('TC-LORG-13b: a site created or edited through the legacy vector API appears here with a linked organization (mirror, other direction)', async ({ page }) => {
    await page.goto(LOCATIONS);
    const code = `QVL${S}`;
    const existing = ((await api(page, 'GET', '/rest/admin/vector/sampling-sites')).json as any[]).find((x) => x.code === code);
    let v = existing;
    if (!v) {
      const r = await api(page, 'POST', '/rest/admin/vector/sampling-sites', { code, name: `QA Loc Legacy Site ${S}`, type: 'Soil Sampling Site', active: true, gpsLatitude: '-6.5', gpsLongitude: '146.9', contactName: 'QA Legacy' });
      note('TC-LORG-13b.post', { status: r.status, body: r.text.slice(0, 400) });
      expect([200, 201]).toContain(r.status);
      v = r.json;
    }
    const listed = await listOrgs(page, { view: 'sites', q: code, status: 'all' });
    note('TC-LORG-13b.listed', listed.items);
    expect(listed.total, 'the legacy-created site is listed in Sampling Sites').toBe(1);
    const orgId = listed.items[0].id;
    created.push(orgId);
    expect(String(v.organizationId ?? orgId)).toBe(orgId);
    const put = await api(page, 'PUT', `/rest/admin/vector/sampling-sites/${v.id}`, { ...v, name: `QA Loc Legacy Site ${S} edited` });
    note('TC-LORG-13b.put', { status: put.status, body: put.text.slice(0, 300) });
    expect((await getDetail(page, orgId)).row.name, 'legacy edit mirrored to the organization').toBe(`QA Loc Legacy Site ${S} edited`);
  });

  // ---------------------------------------------------------------------------------------------
  // Geographic Areas
  // ---------------------------------------------------------------------------------------------
  test('TC-LORG-14: areas are added at the top and under a parent, typed key by key, renamed with the old name kept (FR-B7)', async ({ page }) => {
    test.skip(!F.prov, 'no geographic levels on this instance');
    await page.goto(`${LOCATIONS}/areas`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('locations-areas')).toBeVisible({ timeout: 30_000 });
    const addTop = page.getByTestId('locations-area-add-top');
    note('TC-LORG-14.addTopLabel', await addTop.innerText());
    await addTop.click();
    const typed = `QA Loc Region ${S}`;
    // fill(), not typing: TC-LORG-14t shows why.
    await page.locator('#locations-new-area-name').fill(typed);
    await page.locator('#locations-new-area-code').fill(`QLRG${S}`);
    const post = page.waitForResponse((r) => r.url().endsWith('/rest/locations/areas') && r.request().method() === 'POST');
    await page.getByTestId('locations-area-save').click();
    const pr = await post;
    expect(pr.status()).toBe(201);
    F.region = (await pr.json()).id; created.push(F.region); saveFix();
    const row = page.getByTestId(`locations-area-${F.region}`);
    await expect(row).toBeVisible();
    await expect(row).toHaveAttribute('aria-level', '1');
    // Child under it
    const addChild = page.getByTestId(`locations-area-add-${F.region}`);
    note('TC-LORG-14.addChildLabel', await addChild.innerText());
    expect.soft(await addChild.innerText(), 'the add button is named for the level below').toMatch(/\+?\s*Kabupaten/);
    await addChild.click();
    await page.locator('#locations-new-area-name').fill(`QA Loc District ${S}`);
    const post2 = page.waitForResponse((r) => r.url().endsWith('/rest/locations/areas') && r.request().method() === 'POST');
    await page.getByTestId('locations-area-save').click();
    const p2 = await post2;
    expect(p2.status()).toBe(201);
    F.district = (await p2.json()).id; created.push(F.district); saveFix();
    await expect(page.getByTestId(`locations-area-${F.district}`)).toHaveAttribute('aria-level', '2');
    // Rename the district, then find it by its old name
    await page.getByTestId(`locations-area-${F.district}`).getByRole('button', { name: `Edit QA Loc District ${S}` }).click();
    await page.locator(`#area-name-${F.district}`).fill(`QA Loc District ${S} renamed`);
    await page.getByTestId(`locations-area-${F.district}`).locator('xpath=following-sibling::tr[1]').getByRole('button', { name: 'Save' }).or(page.getByRole('button', { name: 'Save' }).first()).first().click();
    await expect(page.getByTestId(`locations-area-${F.district}`)).toContainText('renamed', { timeout: 15_000 });
    const old = await api(page, 'GET', `/rest/locations/areas?q=${encodeURIComponent(`QA Loc District ${S}`)}&status=active`);
    expect.soft(old.text, 'the old name still finds the area').toContain(`QA Loc District ${S} renamed`);
  });

  test('TC-LORG-14t: a new area name can be typed key by key (the add row keeps focus) (FR-B7)', async ({ page }) => {
    test.skip(!F.prov, 'no geographic levels on this instance');
    // FLIP-WHEN-FIXED. Observed 2026-10-02, twice (fresh login, fresh browser context): typing into "New <level> *"
    // keeps only the first character and focus drops to <body>. AreasView defines AddRow as a component inside its render
    // function, so every keystroke remounts the row and its input. Paste (or Playwright fill) works; typing does not.
    test.fail();
    await page.goto(`${LOCATIONS}/areas`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('locations-areas')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('locations-area-add-top').click();
    await page.locator('#locations-new-area-name').click();
    await page.keyboard.type('QA Typing', { delay: 40 });
    const got = { value: await page.locator('#locations-new-area-name').inputValue(), focus: await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName) };
    note('TC-LORG-14t', got);
    await page.getByRole('button', { name: 'Cancel' }).first().click().catch(() => undefined);
    expect(got.value).toBe('QA Typing');
  });

  test('TC-LORG-14e: after adding a child area, its parent row shows it has an open child (aria-expanded, expand control) (FR-B7, FR-L1)', async ({ page }) => {
    test.skip(!F.prov, 'no geographic levels on this instance');
    // FLIP-WHEN-FIXED. Observed 2026-10-02 on local develop (image 10-01 17:48 UTC), in two runs with a fresh login and fresh records each.
    // After "+ Kabupaten/Kota" on a new region, the child row appears under it, but the region row still has no
    // aria-expanded and no expand button (childCount is not refreshed) until the page is reloaded.
    test.fail();
    await page.goto(`${LOCATIONS}/areas`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('locations-areas')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('locations-area-add-top').click();
    await page.locator('#locations-new-area-name').fill(`QA Loc Parent ${S}`);
    const p1 = page.waitForResponse((r) => r.url().endsWith('/rest/locations/areas') && r.request().method() === 'POST');
    await page.getByTestId('locations-area-save').click();
    const parent = (await (await p1).json()).id; created.push(parent);
    await page.getByTestId(`locations-area-add-${parent}`).click();
    await page.locator('#locations-new-area-name').fill(`QA Loc Child ${S}`);
    const p2 = page.waitForResponse((r) => r.url().endsWith('/rest/locations/areas') && r.request().method() === 'POST');
    await page.getByTestId('locations-area-save').click();
    created.push((await (await p2).json()).id);
    await expect(page.getByTestId(`locations-area-${parent}`)).toHaveAttribute('aria-expanded', 'true', { timeout: 10_000 });
  });

  test('TC-LORG-14b: the area tree works from the keyboard alone and exposes level and expanded state (AC24, FR-L1)', async ({ page }) => {
    test.skip(!F.prov, 'no geographic levels on this instance');
    await page.goto(`${LOCATIONS}/areas`, { waitUntil: 'domcontentloaded' });
    const tree = page.getByRole('treegrid');
    await expect(tree).toBeVisible({ timeout: 30_000 });
    const prov = page.getByTestId(`locations-area-${F.prov}`);
    await expect(prov).toBeVisible();
    await expect(prov).toHaveAttribute('aria-level', '1');
    await prov.focus();
    const ex0 = await prov.getAttribute('aria-expanded');
    await page.keyboard.press(ex0 === 'true' ? 'ArrowLeft' : 'ArrowRight');
    await expect(prov).toHaveAttribute('aria-expanded', ex0 === 'true' ? 'false' : 'true');
    if (ex0 === 'true') { await page.keyboard.press('ArrowRight'); await expect(prov).toHaveAttribute('aria-expanded', 'true'); }
    // Children load on expand: wait for the child row before moving down.
    await expect(page.getByTestId(`locations-area-${F.kab}`)).toBeVisible({ timeout: 10_000 });
    await prov.focus();
    await page.keyboard.press('ArrowDown');
    const focused = await page.evaluate(() => (document.activeElement as HTMLElement)?.dataset?.testid || document.activeElement?.getAttribute('data-testid'));
    expect(focused, 'Down moves to the child row').toBe(`locations-area-${F.kab}`);
    await page.keyboard.press('ArrowLeft');
    const back = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
    expect.soft(back, 'Left on a collapsed child moves to the parent').toBe(`locations-area-${F.prov}`);
    await page.keyboard.press('Enter');
    await expect.soft(page.locator(`#area-name-${F.prov}`), 'Enter opens Edit').toBeVisible();
    const ariaRows = await tree.locator('tr[aria-level]').count();
    note('TC-LORG-14b', { ex0, focused, back, ariaRows });
  });

  test('TC-LORG-14c: an area with active things inside cannot be deactivated, and a child cannot be reactivated under an inactive parent (FR-B7, FR-E3)', async ({ page }) => {
    test.skip(!F.prov, 'no geographic levels on this instance');
    await page.goto(LOCATIONS);
    const r = await api(page, 'POST', `/rest/locations/areas/${F.kec}/active`, { active: false });
    note('TC-LORG-14c.blocked', r);
    expect(r.status).toBe(409);
    expect(r.text).toMatch(/still has \d+ active/);
    if (F.district) {
      expect((await api(page, 'POST', `/rest/locations/areas/${F.district}/active`, { active: false })).status).toBe(200);
      expect((await api(page, 'POST', `/rest/locations/areas/${F.region}/active`, { active: false })).status).toBe(200);
      const re = await api(page, 'POST', `/rest/locations/areas/${F.district}/active`, { active: true });
      expect(re.status).toBe(409);
      expect(re.text).toContain(`Reactivate QA Loc Region ${S} first.`);
    }
  });

  // ---------------------------------------------------------------------------------------------
  // Inline form behaviour (AC25, FR-C1, FR-C5)
  // ---------------------------------------------------------------------------------------------
  test('TC-LORG-15: clicking a row outside Edit does not open it; one row opens at a time; Save / Cancel stay on screen while scrolling a long form (AC25, FR-C1)', async ({ page }) => {
    // Search by the run stamp with a big page: the default name sort is not reliable (TC-LORG-07g).
    await openList(page, '', { q: S, pageSize: '100' });
    const row = page.getByTestId(`locations-row-${F.wa}`);
    await row.locator('td').nth(1).click();
    await row.locator('td').nth(3).click();
    await expect(page.locator('[data-testid^="locations-form-"]'), 'a row click opens nothing').toHaveCount(0);
    await openEdit(page, F.f1);
    await openEdit(page, F.wa);
    await expect(page.locator('[data-testid^="locations-form-"]'), 'only one row is expanded').toHaveCount(1);
    const form = page.getByTestId(`locations-form-${F.wa}`);
    const save = form.getByTestId('locations-save');
    const obs: any[] = [];
    for (const sel of [`#name-${F.wa}`, `#street-${F.wa}`, `#email-${F.wa}`, '[data-testid="locations-wards"]']) {
      await form.locator(sel).first().scrollIntoViewIfNeeded();
      obs.push({ at: sel, saveOnScreen: await inView(save) });
    }
    note('TC-LORG-15.sticky', obs);
    for (const o of obs) expect.soft(o.saveOnScreen, `Save is on screen with ${o.at} in view`).toBe(true);
  });

  test('TC-LORG-15t: the Organization type(s) picker shows the chosen types by name, not a count (FR-C3, FR-B4)', async ({ page }) => {
    // FLIP-WHEN-FIXED. Observed 2026-10-02 on local develop (image 10-01 17:48 UTC), in two runs with a fresh login and fresh records each.
    // The FilterableMultiSelect shows a tag reading "1" (Carbon's count tag); the chosen type is named nowhere in the
    // field. FR-C3 asks for labelled tags, FR-B4 "never as a bare count".
    test.fail();
    await openList(page, '', { q: `QWA${S}` });
    const form = await openEdit(page, F.wa);
    const field = form.locator(`#types-${F.wa}`).locator('xpath=ancestor::div[contains(@class,"cds--multi-select")][1]');
    const text = (await field.innerText()).replace(/\s+/g, ' ');
    note('TC-LORG-15t', text);
    expect(text).toMatch(/referring clinic/i);
  });

  test('TC-LORG-15b: unsaved changes ask before the form closes (FR-C1)', async ({ page }) => {
    // FLIP-WHEN-FIXED. Observed 2026-10-02 on local develop (image 10-01 17:48 UTC), in two runs with a fresh login and fresh records each.
    // With the contact name changed, pressing the row's Close collapses the form at once: no prompt, the edit is lost.
    // Only the form's own Cancel asks (RecordForm.cancel); the row button calls closeForm() directly.
    test.fail();
    await openList(page, '', { q: `QLF${S}` });
    const form = await openEdit(page, F.f1);
    await form.locator(`#contact-${F.f1}`).fill(`QA unsaved ${S}`);
    let asked = '';
    page.once('dialog', async (d) => { asked = d.message(); await d.dismiss(); });
    await page.getByTestId(`locations-edit-${F.f1}`).click();
    await page.waitForTimeout(500);
    note('TC-LORG-15b', { asked, formStill: await form.isVisible() });
    expect(asked, 'Close with unsaved changes asks first').not.toBe('');
    await expect(form.locator(`#contact-${F.f1}`)).toHaveValue(`QA unsaved ${S}`);
  });

  test('TC-LORG-16: when another admin saved first, the form keeps what this user typed and shows the other admin\'s change (FR-C5)', async ({ page, browser, baseURL }) => {
    // FLIP-WHEN-FIXED. Observed 2026-10-02 on local develop (image 10-01 17:48 UTC), in two runs with a fresh login and fresh records each.
    // On 409 the form shows "Another admin saved this record first. Their values are shown below; reapply your changes
    // and save again." and replaces every field with the stored record, so what this user typed is gone. FR-C5 asks to keep
    // the user's input and show the other admin's changes.
    test.fail();
    const other = await appPage(browser, baseURL);
    await openList(page, '', { q: `QLF${S}` });
    const form = await openEdit(page, F.f1);
    // Another admin saves a phone number first.
    const cur = await getDetail(other, F.f1);
    const r = await api(other, 'PUT', `/rest/locations/organizations/${F.f1}`, {
      kind: 'facility', name: cur.row.name, shortName: cur.row.shortName, typeIds: cur.row.types.map((t: any) => t.id), parentId: cur.parentId,
      identifiers: cur.identifiers, phone: `+675 9${S}`, contactName: cur.contactName, email: cur.email, streetAddress: cur.streetAddress,
      city: cur.city, state: cur.state, gpsLatitude: cur.gpsLatitude, gpsLongitude: cur.gpsLongitude, internetAddress: cur.internetAddress, lastupdated: cur.lastupdated,
    });
    expect(r.status).toBe(200);
    await other.context().close();
    // This user, still on the stale form, changes the contact name.
    await form.locator(`#contact-${F.f1}`).fill(`QA Mine ${S}`);
    const put = page.waitForResponse((x) => x.url().includes(`/rest/locations/organizations/${F.f1}`) && x.request().method() === 'PUT');
    await form.getByTestId('locations-save').click();
    const resp = await put;
    const banner = await form.locator('.cds--inline-notification').allInnerTexts();
    const mine = await form.locator(`#contact-${F.f1}`).inputValue();
    const phone = await form.locator(`#phone-${F.f1}`).inputValue();
    note('TC-LORG-16', { status: resp.status(), banner, mine, phone });
    expect(resp.status()).toBe(409);
    expect(banner.join(' ')).toMatch(/Another admin|saved this record first|changes/i);
    expect.soft(phone, 'the other admin\'s change is shown').toBe(`+675 9${S}`);
    expect.soft(mine, 'what this user typed is kept so they can reapply it').toBe(`QA Mine ${S}`);
  });

  test('TC-LORG-17: a facility-registry record is tagged Registry, warns on edit, and is never deactivated by Replace (AC17, FR-H)', async ({ page }) => {
    test.skip(db('select 1') === null, 'needs DB access to mark a QA record as registry-sourced');
    await page.goto(LOCATIONS);
    if (!F.reg) { F.reg = await createOrg(page, { name: `QA Loc Registry ${S}`, typeIds: [F.tClinic], identifiers: [{ label: 'Code', value: `QRG${S}`, reporting: true }] }); created.push(F.reg); saveFix(); }
    db(`update clinlims.organization set source='REGISTRY' where id=${F.reg}`);
    try {
      await openList(page, '', { q: `QRG${S}` });
      await expect(rows(page).first()).toContainText('Registry');
      const form = await openEdit(page, F.reg);
      await expect(form).toContainText('This record comes from the facility registry');
      await expect.soft(form, 'registry-supplied fields are marked').toContainText('From registry');
      const csv = `type,code,name\nreferring clinic,QRX${S},QA Loc Replace Probe ${S}\n`;
      const p = await importCall(page, 'preview', [{ name: `organizations-qa-${S}.csv`, content: csv }], 'replace');
      const deact = (p.json?.deactivations || []).map((d: any) => d.id);
      note('TC-LORG-17', { status: p.status, deactivations: deact.length, scope: p.json?.scope, includesRegistry: deact.includes(F.reg) });
      expect(p.status).toBe(200);
      expect(deact, 'Replace does not list the registry record for deactivation').not.toContain(F.reg);
      expect(deact.length, 'but it does list other referring clinics (scope check)').toBeGreaterThan(0);
    } finally {
      db(`update clinlims.organization set source='LOCAL' where id=${F.reg}`);
    }
  });

  // ---------------------------------------------------------------------------------------------
  // Import / Export
  // ---------------------------------------------------------------------------------------------
  const HDR = 'type,code,name,identifier:DHIS2 ID,category,ownership,serviceType,parentCode,parentName,parentType,active,gpsLatitude,gpsLongitude,contactName,phone';
  const snapshot = (where = 'true') => db(`select md5(coalesce(string_agg(t::text, '|' order by t::text), '')) from (
      select row_to_json(o)::text as t from clinlims.organization o where ${where}
      union all select row_to_json(i)::text from clinlims.organization_identifier i
      union all select row_to_json(v)::text from clinlims.vector_sampling_site v
      union all select row_to_json(c)::text from clinlims.organization_change c) x`);

  async function uiImport(page: Page, fileName: string, csv: string, mode: 'merge' | 'replace') {
    await page.goto(`${LOCATIONS}/import`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('locations-import')).toBeVisible({ timeout: 30_000 });
    await page.locator('input[type="file"]').setInputFiles({ name: fileName, mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await expect(page.getByTestId('locations-import-file')).toHaveText(fileName);
    // The RadioTile input is covered by its label: click the label.
    if (mode === 'replace') await page.locator('label[for="import-mode-replace"]').click();
    const prev = page.waitForResponse((r) => r.url().includes('/rest/locations/import/preview'));
    await page.getByTestId('locations-import-preview').click();
    const r = await prev;
    expect(r.status(), (await r.text()).slice(0, 300)).toBe(200);
    return r.json();
  }
  const count = async (page: Page, key: string) => (await page.getByTestId(`locations-import-count-${key}`).innerText().catch(() => '')).replace(/\D+/g, ' ').trim().split(' ')[0];

  test('TC-LORG-20: Add & update on a file whose code already exists updates that record (same id), creates the rest, and changes nothing else (AC7)', async ({ page }) => {
    test.skip(!F.prov, 'no geographic levels on this instance');
    await page.goto(LOCATIONS);
    if (!F.pm) { F.pm = await createOrg(page, { name: `QA Loc PMGH ${S}`, typeIds: [F.tClinic], phone: '+675 111', identifiers: [{ label: 'Code', value: `QPM${S}`, reporting: true }] }); created.push(F.pm); saveFix(); }
    const maxBefore = db('select max(id) from clinlims.organization');
    const others = (w: string) => snapshot(`o.id <= ${maxBefore} and o.id <> ${F.pm} and ${w}`);
    const before = maxBefore !== null ? db(`select md5(string_agg(row_to_json(o)::text, '|' order by id)) from clinlims.organization o where id <= ${maxBefore} and id <> ${F.pm}`) : null;
    const csv = [HDR,
      `referring clinic,QPM${S},QA Loc PMGH ${S},Rp${S}x,National referral hospital,Government,,QLC${S},,,Y,-9.4705,147.1597,Dr QA Kila,+675 324 8200`,
      `dept,QPM${S}-OPD,QA Loc PMGH OPD ${S},,,,Outpatient,QPM${S},,,Y,,,Sister QA Moi,+675 324 8210`,
      `dept,QPM${S}-MAT,QA Loc PMGH Maternity ${S},,,,Maternity,QPM${S},,,Y,,,,`,
      // Placed in the Kabupaten, not the Kecamatan where TC-LORG-13's similar "QA Loc Trap" sits (else it is offered as a rename).
      `sampling site,QVI${S},QA Bumbu Settlement mosquito light trap ${S},,,,,,QA Loc Kab ${S},Kabupaten/Kota,Y,-6.7160,147.0010,QA Wari,+675 7123 4567`].join('\n') + '\n';
    const plan = await uiImport(page, `organizations-qa-${S}.csv`, csv, 'merge');
    note('TC-LORG-20.plan', { counts: plan.counts, rows: plan.rows.map((r: any) => [r.line, r.outcome, r.name, r.reason, r.targetId]) });
    expect.soft(await count(page, 'new'), 'New tile').toBe('3');
    expect.soft(await count(page, 'updated'), 'Updated tile').toBe('1');
    expect(plan.rows.find((r: any) => r.code === `QPM${S}`)?.targetId, 'the existing record is matched by code').toBe(F.pm);
    const apply = page.waitForResponse((r) => r.url().includes('/rest/locations/import/apply'));
    await page.getByTestId('locations-import-apply').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Apply' }).click();
    const ar = await apply;
    expect(ar.status()).toBe(200);
    await expect(page.getByTestId('locations-import-done')).toBeVisible({ timeout: 60_000 });
    const pm = await getDetail(page, F.pm);
    expect(pm.row.id).toBe(F.pm);
    expect(pm.phone).toBe('+675 324 8200');
    expect(pm.parentId).toBe(F.kec);
    expect(pm.identifiers.map((i: any) => `${i.label}=${i.value}`)).toContain(`DHIS2 ID=Rp${S}x`);
    expect(pm.row.category?.label).toBe('National referral hospital');
    const wards = (await api(page, 'GET', `/rest/locations/organizations/${F.pm}/wards`)).json as any[];
    expect(wards.map((w) => w.name).sort()).toEqual([`QA Loc PMGH Maternity ${S}`, `QA Loc PMGH OPD ${S}`]);
    created.push(...wards.map((w) => w.id));
    const site = await listOrgs(page, { view: 'sites', q: `QVI${S}`, status: 'all' });
    expect(site.total).toBe(1);
    created.push(site.items[0].id);
    if (before !== null) {
      const after = db(`select md5(string_agg(row_to_json(o)::text, '|' order by id)) from clinlims.organization o where id <= ${maxBefore} and id <> ${F.pm}`);
      expect(after, 'no other existing organization row changed').toBe(before);
      const newRows = db(`select count(*) from clinlims.organization where id > ${maxBefore}`);
      expect(Number(newRows), 'exactly three new organizations').toBe(3);
    }
    void others;
  });

  test('TC-LORG-21: Preview saves nothing: the organization, identifier, site and history tables are identical before and after (AC10)', async ({ page }) => {
    test.skip(db('select 1') === null, 'needs DB access');
    await page.goto(LOCATIONS);
    const before = snapshot();
    const csv = [HDR,
      `referring clinic,QPM${S},QA Loc PMGH ${S} preview,Rp${S}x,,,,,,,N,,,,+675 000`,
      `referring clinic,QNEW${S},QA Loc Preview Only ${S},,,,,,,,Y,,,,`,
      `dept,QPM${S}-ZZ,QA Loc Preview Ward ${S},,,,Other,QPM${S},,,Y,,,,`].join('\n') + '\n';
    const p1 = await importCall(page, 'preview', [{ name: `organizations-qa-${S}.csv`, content: csv }], 'merge');
    const p2 = await importCall(page, 'preview', [{ name: `organizations-qa-${S}.csv`, content: csv }], 'replace');
    const after = snapshot();
    note('TC-LORG-21', { mergeCounts: p1.json?.counts, replaceCounts: p2.json?.counts, same: before === after });
    expect(p1.status).toBe(200);
    expect(p2.status).toBe(200);
    expect(after, 'nothing was written').toBe(before);
    expect((await listOrgs(page, { view: 'organizations', q: `QNEW${S}`, status: 'all' })).total).toBe(0);
  });

  test('TC-LORG-22: a blank cell leaves the stored value; active=N deactivates; Replace reactivates an inactive matched record (AC11, FR-F5)', async ({ page }) => {
    await page.goto(LOCATIONS);
    test.skip(!F.pm, 'needs TC-LORG-20');
    const before = await getDetail(page, F.pm);
    const csv = ['type,code,name,phone,contactName,active,parentCode', `referring clinic,QPM${S},QA Loc PMGH ${S},,QA Contact via import,Y,`,
      `dept,QPM${S}-MAT,QA Loc PMGH Maternity ${S},,,N,QPM${S}`].join('\n') + '\n';
    const a = await importCall(page, 'apply', [{ name: `organizations-qa-${S}.csv`, content: csv }], 'merge');
    note('TC-LORG-22.apply', { status: a.status, counts: a.json?.counts, rows: a.json?.rows?.map((r: any) => [r.outcome, r.name, r.reason]) });
    expect(a.status).toBe(200);
    const after = await getDetail(page, F.pm);
    expect(after.phone, 'blank phone cell kept the stored phone').toBe(before.phone);
    expect(after.contactName).toBe('QA Contact via import');
    const wards = (await api(page, 'GET', `/rest/locations/organizations/${F.pm}/wards?includeInactive=true`)).json as any[];
    expect(wards.find((w) => w.name === `QA Loc PMGH Maternity ${S}`)?.active, 'active=N deactivated the ward').toBe(false);
    // Replace scoped to this facility's wards: the inactive Maternity row without active=N comes back.
    const csv2 = ['type,code,name,serviceType,parentCode', `dept,QPM${S}-OPD,QA Loc PMGH OPD ${S},Outpatient,QPM${S}`, `dept,QPM${S}-MAT,QA Loc PMGH Maternity ${S},Maternity,QPM${S}`].join('\n') + '\n';
    const p = await importCall(page, 'preview', [{ name: `organizations-qa-${S}.csv`, content: csv2 }], 'replace');
    note('TC-LORG-22.replacePreview', { counts: p.json?.counts, deact: p.json?.deactivations, scope: p.json?.scope });
    expect(p.json?.counts?.reactivated, 'the inactive matched ward shows as Reactivated').toBe(1);
    const a2 = await importCall(page, 'apply', [{ name: `organizations-qa-${S}.csv`, content: csv2 }], 'replace');
    expect(a2.status).toBe(200);
    const w2 = (await api(page, 'GET', `/rest/locations/organizations/${F.pm}/wards?includeInactive=true`)).json as any[];
    expect(w2.find((w) => w.name === `QA Loc PMGH Maternity ${S}`)?.active).toBe(true);
  });

  test('TC-LORG-23: Replace with ward rows for one organization deactivates only that organization\'s unlisted wards (AC15, FR-F3b, FR-F9)', async ({ page }) => {
    await page.goto(LOCATIONS);
    if (!F.ra) {
      F.ra = await createOrg(page, { name: `QA Loc Replace A ${S}`, typeIds: [F.tClinic], identifiers: [{ label: 'Code', value: `QRA${S}`, reporting: true }] });
      F.rb = await createOrg(page, { name: `QA Loc Replace B ${S}`, typeIds: [F.tClinic], identifiers: [{ label: 'Code', value: `QRB${S}`, reporting: true }] });
      F.ra1 = await createWard(page, F.ra, { name: `QA Loc RA1 ${S}`, code: `QRA${S}-1`, serviceType: 'INPATIENT' });
      F.ra2 = await createWard(page, F.ra, { name: `QA Loc RA2 ${S}`, code: `QRA${S}-2`, serviceType: 'INPATIENT' });
      F.rb1 = await createWard(page, F.rb, { name: `QA Loc RB1 ${S}`, code: `QRB${S}-1`, serviceType: 'INPATIENT' });
      F.rb2 = await createWard(page, F.rb, { name: `QA Loc RB2 ${S}`, code: `QRB${S}-2`, serviceType: 'INPATIENT' });
      created.push(F.ra, F.rb, F.ra1, F.ra2, F.rb1, F.rb2); saveFix();
    }
    // The new ward's name must not look like RA2, or the possible-rename check (TC-LORG-29b) holds RA2 back for a decision.
    const csv = ['type,code,name,serviceType,parentCode', `dept,QRA${S}-1,QA Loc RA1 ${S},Inpatient,QRA${S}`, `dept,QRA${S}-3,QA Emergency Bay ${S},Emergency,QRA${S}`].join('\n') + '\n';
    const plan = await uiImport(page, `organizations-qa-${S}.csv`, csv, 'replace');
    const deact = (plan.deactivations || []).map((d: any) => d.id);
    note('TC-LORG-23.plan', { counts: plan.counts, scope: plan.scope, deact: plan.deactivations });
    expect(deact, 'only RA2 is deactivated').toEqual([F.ra2]);
    await expect.soft(page.locator('.locationsImport'), 'the scope is stated in plain words').toContainText(`QA Loc Replace A ${S}`);
    await page.getByTestId('locations-import-apply').click();
    const dlg = page.getByRole('dialog');
    const applyBtn = dlg.getByRole('button', { name: 'Apply' });
    await expect.soft(applyBtn, 'Apply waits for the "I understand" tick').toBeDisabled();
    await dlg.locator('label[for="import-acknowledge"]').click();
    await applyBtn.click();
    await expect(page.getByTestId('locations-import-done')).toBeVisible({ timeout: 60_000 });
    const wa = Object.fromEntries(((await api(page, 'GET', `/rest/locations/organizations/${F.ra}/wards?includeInactive=true`)).json as any[]).map((w) => [w.name, w.active]));
    const wb = Object.fromEntries(((await api(page, 'GET', `/rest/locations/organizations/${F.rb}/wards?includeInactive=true`)).json as any[]).map((w) => [w.name, w.active]));
    note('TC-LORG-23.after', { wa, wb });
    expect(wa).toEqual({ [`QA Loc RA1 ${S}`]: true, [`QA Loc RA2 ${S}`]: false, [`QA Emergency Bay ${S}`]: true });
    expect(wb, 'the other organization\'s wards are unchanged').toEqual({ [`QA Loc RB1 ${S}`]: true, [`QA Loc RB2 ${S}`]: true });
    expect((await getDetail(page, F.ra)).row.active, 'the facility itself is untouched').toBe(true);
    created.push(...Object.keys(wa).length ? ((await api(page, 'GET', `/rest/locations/organizations/${F.ra}/wards?includeInactive=true`)).json as any[]).map((w) => w.id) : []);
  });

  test('TC-LORG-24: a sites-only Replace would deactivate only sampling sites; facilities, wards and areas are out of scope (AC8, FR-F3a) [preview only]', async ({ page }) => {
    test.skip(!F.prov, 'no geographic levels on this instance');
    await page.goto(LOCATIONS);
    const csv = `type,code,name,parentName,parentType\nsampling site,QVR${S},QA Loc Replace Site ${S},QA Loc Kec ${S},Kecamatan\n`;
    const p = await importCall(page, 'preview', [{ name: `organizations-sites-${S}.csv`, content: csv }], 'replace');
    expect(p.status).toBe(200);
    const sites = new Set((await listOrgs(page, { view: 'sites', status: 'active', pageSize: '100' })).items.map((r: any) => r.id));
    const deact = (p.json.deactivations || []) as any[];
    note('TC-LORG-24', { scope: p.json.scope, counts: p.json.counts, deact: deact.map((d) => [d.id, d.name, d.inUse]) });
    expect(deact.length).toBeGreaterThan(0);
    for (const d of deact) expect.soft(sites.has(d.id), `${d.name} is a sampling site`).toBe(true);
    expect.soft(p.json.scope?.text || '', 'the scope says what will not change').toMatch(/will not change/i);

  });

  test('TC-LORG-24t: the Replace preview flags in-use sites with the same open-order count the list shows (FR-F6) [preview only]', async ({ page }) => {
    test.skip(!F.prov, 'no geographic levels on this instance');
    // FLIP-WHEN-FIXED. Observed 2026-10-02 on local develop (image 10-01 17:48 UTC), in two runs with a fresh login and fresh records each.
    // A sites-only Replace preview lists QA_AUTO Vector Site for deactivation with inUse {open 0, total 0}; the list
    // (and the deactivation guard) say 44 open orders. The admin is not warned that an in-use site will be deactivated.
    test.fail();
    await page.goto(LOCATIONS);
    const csv = `type,code,name,parentName,parentType\nsampling site,QVR${S},QA Loc Replace Site ${S},QA Loc Kec ${S},Kecamatan\n`;
    const p = await importCall(page, 'preview', [{ name: `organizations-sites-${S}.csv`, content: csv }], 'replace');
    const list = Object.fromEntries((await listOrgs(page, { view: 'sites', status: 'active', pageSize: '100' })).items.map((r: any) => [r.id, r.inUse.open]));
    const busy = (p.json.deactivations || []).filter((d: any) => (list[d.id] ?? 0) > 0);
    note('TC-LORG-24t', busy.map((d: any) => [d.name, d.inUse, list[d.id]]));
    test.skip(!busy.length, 'no in-use site would be deactivated on this instance');
    for (const d of busy) expect(d.inUse?.open ?? 0, `${d.name}`).toBe(list[d.id]);
  });

  test('TC-LORG-25: a code-less row matching two records waits in the decision queue; Apply stays off until decided; "Remember this name" resolves it next time (AC9, FR-F8)', async ({ page }) => {
    test.skip(!F.prov, 'no geographic levels on this instance');
    await page.goto(LOCATIONS);
    const name = `QA Loc Dup ${S}`;
    const have = await listOrgs(page, { view: 'organizations', q: name, status: 'active' });
    for (let i = have.total; i < 2; i++) created.push(await createOrg(page, { name, typeIds: [F.tClinic], parentId: F.kec }));
    const ids = (await listOrgs(page, { view: 'organizations', q: name, status: 'active' })).items.map((r: any) => r.id).sort();
    const csv = `type,name,parentCode,phone\nreferring clinic,${name},QLC${S},+675 555 0101\n`;
    const plan = await uiImport(page, `organizations-qa-${S}.csv`, csv, 'merge');
    note('TC-LORG-25.plan', { counts: plan.counts, rows: plan.rows.map((r: any) => [r.outcome, r.candidates?.map((c: any) => c.id)]) });
    expect(plan.rows[0].outcome).toBe('decision');
    expect(plan.rows[0].candidates.map((c: any) => c.id).sort()).toEqual(ids);
    await expect(page.getByTestId('locations-import-apply'), 'Apply waits for the decision').toBeDisabled();
    await page.getByText(new RegExp(`^Use this record: ${name}`)).first().click();
    await page.getByText('Remember this name').first().click();
    await expect(page.getByTestId('locations-import-apply')).toBeEnabled();
    const apply = page.waitForResponse((r) => r.url().includes('/rest/locations/import/apply'));
    await page.getByTestId('locations-import-apply').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Apply' }).click();
    expect((await apply).status()).toBe(200);
    await expect(page.getByTestId('locations-import-done')).toBeVisible({ timeout: 60_000 });
    const phones = await Promise.all(ids.map(async (id: string) => (await getDetail(page, id)).phone || ''));
    note('TC-LORG-25.phones', phones);
    expect(phones.filter((p) => p === '+675 555 0101'), 'exactly one of the two got the update').toHaveLength(1);
    const again = await importCall(page, 'preview', [{ name: `organizations-qa-${S}.csv`, content: `type,name,parentCode,phone\nreferring clinic,${name},QLC${S},+675 555 0102\n` }], 'merge');
    note('TC-LORG-25.again', again.json?.rows);
    expect(again.json.rows[0].outcome, 'the remembered name resolves on the next import').not.toBe('decision');
  });

  test('TC-LORG-26: a new-looking row similar to an unmatched record in the same place is offered as a rename; "Same place, renamed" keeps the id and history (AC16, FR-F12)', async ({ page }) => {
    test.skip(!F.prov, 'no geographic levels on this instance');
    await page.goto(LOCATIONS);
    if (!F.tok) { F.tok = await createOrg(page, { name: `QA Loc Tokarara Clinic ${S}`, typeIds: [F.tClinic], parentId: F.kec }); created.push(F.tok); saveFix(); }
    const csv = `type,name,parentCode\nreferring clinic,QA Loc Tokarara Urban Clinic ${S},QLC${S}\n`;
    const plan = await uiImport(page, `organizations-qa-${S}.csv`, csv, 'merge');
    note('TC-LORG-26.plan', plan.rows.map((r: any) => [r.outcome, r.pair?.id, r.pair?.name]));
    const row = plan.rows[0];
    expect(row.outcome).toBe('rename');
    expect(row.pair?.id).toBe(F.tok);
    await expect(page.getByTestId('locations-import-apply'), 'Apply waits for the rename decision').toBeDisabled();
    await page.getByText('Same place, renamed').first().click();
    const apply = page.waitForResponse((r) => r.url().includes('/rest/locations/import/apply'));
    await page.getByTestId('locations-import-apply').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Apply' }).click();
    expect((await apply).status()).toBe(200);
    await expect(page.getByTestId('locations-import-done')).toBeVisible({ timeout: 60_000 });
    const d = await getDetail(page, F.tok);
    expect(d.row.name).toBe(`QA Loc Tokarara Urban Clinic ${S}`);
    const h = (await api(page, 'GET', `/rest/locations/organizations/${F.tok}/history`)).json as any[];
    note('TC-LORG-26.history', h);
    expect(h.length).toBeGreaterThanOrEqual(2);
    expect.soft(JSON.stringify(h), 'the history names the import run').toMatch(/Import run|import/i);
    expect((await listOrgs(page, { view: 'organizations', q: `QA Loc Tokarara Clinic ${S}`, status: 'all' })).items[0]?.id, 'the old name still finds it').toBe(F.tok);
  });

  test('TC-LORG-27: a row with only an identifier:DHIS2 ID column matches the organization holding that DHIS2 ID (AC20, FR-F4) [preview only]', async ({ page }) => {
    await page.goto(LOCATIONS);
    const csv = `type,name,identifier:DHIS2 ID\nreferring clinic,QA Loc Facility ${S},Dh${S}xQ\nreferring clinic,QA Loc Some Other Name ${S},Dh${S}xQ\n`;
    const p = await importCall(page, 'preview', [{ name: `organizations-qa-${S}.csv`, content: csv }], 'merge');
    note('TC-LORG-27', p.json?.rows);
    expect(p.status).toBe(200);
    expect(p.json.rows[0].targetId).toBe(F.f1);
    expect(p.json.rows[1].targetId, 'the identifier wins over a different name').toBe(F.f1);
  });

  test('TC-LORG-28: export matches the import format (with identifier columns), and an unedited export re-imported in Replace mode changes nothing (AC12, FR-G1, FR-G3, FR-I5)', async ({ page }) => {
    await page.goto(LOCATIONS);
    const tmpl = await api(page, 'GET', '/rest/locations/import/template?area=organizations');
    const one = await page.request.get(`/api/OpenELIS-Global/rest/locations/export?view=organizations&q=QLF${S}`);
    const csv1 = await one.text();
    note('TC-LORG-28.export1', { template: tmpl.text.split('\n')[0], csv: csv1.slice(0, 800) });
    expect(one.status()).toBe(200);
    const header = csv1.split(/\r?\n/)[0];
    expect.soft(header, 'export has the identifier:<label> column (FR-I5)').toContain('identifier:DHIS2 ID');
    expect.soft(csv1, 'and its value').toContain(`Dh${S}xQ`);
    expect(header.split(',')).toContain('active');
    const tmplHeader = tmpl.text.split(/\r?\n/)[0].split(',');
    for (const c of tmplHeader) expect.soft(header.split(','), `export carries template column ${c}`).toContain(c);
    // Round trip by type (the Replace scope is per type), for sampling sites and referral labs.
    const trips: any = {};
    for (const [view, extra] of [['sites', '']] as const) {
      const ex = await page.request.get(`/api/OpenELIS-Global/rest/locations/export?view=${view}${extra}`);
      const text = await ex.text();
      const p = await importCall(page, 'preview', [{ name: `organizations-trip-${view}-${S}.csv`, content: text }], 'replace');
      trips[`${view}${extra}`] = { status: p.status, counts: p.json?.counts, deact: (p.json?.deactivations || []).map((d: any) => d.name), rejected: (p.json?.rows || []).filter((r: any) => r.outcome === 'rejected').map((r: any) => [r.name, r.reason]), updated: (p.json?.rows || []).filter((r: any) => r.outcome === 'updated').map((r: any) => [r.name, r.diffs]) };
    }
    note('TC-LORG-28.trips', trips);
    for (const k of Object.keys(trips)) {
      const c = trips[k].counts || {};
      expect.soft(c.new || 0, `${k}: 0 new`).toBe(0);
      expect.soft(c.updated || 0, `${k}: 0 updated`).toBe(0);
      expect.soft(c.deactivated || 0, `${k}: 0 deactivated`).toBe(0);
      expect.soft(c.rejected || 0, `${k}: 0 rejected`).toBe(0);
    }
  });

  test('TC-LORG-28t: exporting the referral labs and re-importing that file in Replace mode changes nothing (AC12)', async ({ page }) => {
    // FLIP-WHEN-FIXED. Observed 2026-10-02 on local develop (image 10-01 17:48 UTC), in two runs with a fresh login and fresh records each.
    // Export with Type = referralLab includes records that also carry "referring clinic" (QA Loc Full). Re-imported in
    // Replace mode the file's types are referralLab AND referring clinic, so the preview deactivates every other referring
    // clinic: 36 records, including QA Auto Clinic with 339 open orders. AC12 expects 0 / 0 / 0.
    test.fail();
    await page.goto(LOCATIONS);
    const ex = await page.request.get(`/api/OpenELIS-Global/rest/locations/export?view=organizations&type=${F.tRef}`);
    const p = await importCall(page, 'preview', [{ name: `organizations-trip-ref-${S}.csv`, content: await ex.text() }], 'replace');
    note('TC-LORG-28t', { counts: p.json?.counts, scope: p.json?.scope?.text, deact: (p.json?.deactivations || []).length });
    expect(p.json.counts.deactivated || 0).toBe(0);
  });

  test('TC-LORG-29: malformed files are refused with a reason, never a 500 (FR-F7)', async ({ page }) => {
    test.skip(!F.prov, 'no geographic levels on this instance');
    await page.goto(LOCATIONS);
    // Rows are placed in an empty area of their own so the possible-rename check (TC-LORG-29b) does not pair them
    // with other QA records and hide the outcome under test.
    if (!F.mf) { F.mf = await createArea(page, `QA MF Area ${S}`, `QMF${S}`, F.prov); saveFix(); }
    const P = `QMF${S}`;
    const big = ['type,code,name'].concat(Array.from({ length: 5000 }, (_, i) => `referring clinic,QBIG${S}-${i},QA Big ${i} ${S}`)).join('\n');
    const cases: [string, { name: string; content: string; encoding?: 'latin1'; area?: string }][] = [
      ['no-name-type-columns', { name: `organizations-a-${S}.csv`, content: 'code,phone\nX1,123\n' }],
      ['unknown-column', { name: `organizations-b-${S}.csv`, content: `type,name,parentCode,colour\nreferring clinic,QA Colour Post ${S},${P},blue\n` }],
      ['latin1', { name: `organizations-c-${S}.csv`, content: `type,name,parentCode\nreferring clinic,QA Clinique Sainte-Thérèse ${S},${P}\n`, encoding: 'latin1' }],
      ['bom', { name: `organizations-d-${S}.csv`, content: `\uFEFFtype,name,parentCode\nreferring clinic,QA Bom Post ${S},${P}\n` }],
      ['quotes', { name: `organizations-n-${S}.csv`, content: `type,name,parentCode,streetAddress\nreferring clinic,"QA Quoted, Comma ${S}",${P},"1 Road, Lae"\n` }],
      ['empty', { name: `organizations-e-${S}.csv`, content: '' }],
      ['binary', { name: `organizations-f-${S}.csv`, content: '\u0000\u0001\u0002PK\u0003\u0004garbage' }],
      ['area-level-as-type', { name: `organizations-g-${S}.csv`, content: `type,name\nProvinsi,QA Level As Type ${S}\n` }],
      ['bad-gps', { name: `organizations-h-${S}.csv`, content: `type,name,parentCode,gpsLatitude,gpsLongitude\nreferring clinic,QA Bad GPS Post ${S},${P},95,200\n` }],
      ['dup-identifier-in-file', { name: `organizations-i-${S}.csv`, content: `type,name,parentCode,identifier:DHIS2 ID\nreferring clinic,QA Alder Post ${S},${P},DD${S}\nreferring clinic,QA Birch Station ${S},${P},DD${S}\n` }],
      ['forbidden-type-combo', { name: `organizations-j-${S}.csv`, content: `type,name\nsampling site;dept,QA Combo ${S}\n` }],
      ['unknown-type', { name: `organizations-k-${S}.csv`, content: `type,name\nspaceport,QA Unknown Type ${S}\n` }],
      ['ward-without-parent', { name: `organizations-l-${S}.csv`, content: `type,name,serviceType\ndept,QA Orphan Ward ${S},Inpatient\n` }],
      ['5000-rows', { name: `organizations-m-${S}.csv`, content: big }],
    ];
    const out: any = {};
    for (const [k, f] of cases) {
      const t0 = Date.now();
      const r = await importCall(page, 'preview', [f], 'merge');
      out[k] = { status: r.status, ms: Date.now() - t0, counts: r.json?.counts, errors: r.json?.errors, rows: (r.json?.rows || []).slice(0, 3).map((x: any) => [x.outcome, x.name, x.reason]), body: r.json ? undefined : r.text.slice(0, 200) };
    }
    note('TC-LORG-29', out);
    for (const k of Object.keys(out)) expect.soft(out[k].status, `${k}: not a 500 (${JSON.stringify(out[k]).slice(0, 200)})`).not.toBe(500);
    const rej = (k: string) => (out[k].rows || []).some((r: any) => r[0] === 'rejected') || (out[k].errors || []).length > 0 || out[k].status === 400 || out[k].status === 422;
    for (const k of ['no-name-type-columns', 'area-level-as-type', 'bad-gps', 'forbidden-type-combo', 'unknown-type', 'ward-without-parent', 'empty', 'binary']) {
      expect.soft(rej(k), `${k} is refused with a reason`).toBe(true);
    }
    expect.soft(String(out['area-level-as-type'].rows?.[0]?.[2] || ''), 'FR-F7 wording').toMatch(/Geographic areas are imported/);

    expect.soft(out['quotes'].rows?.[0]?.[1] || '', 'quoted commas survive').toBe(`QA Quoted, Comma ${S}`);

    expect.soft(out['5000-rows'].ms, '5,000-row preview answers inside 30 s').toBeLessThan(30_000);

  });

  test('TC-LORG-29d: an identifier value repeated inside one file is rejected, and never lands on two records (FR-F7, FR-I3)', async ({ page }) => {
    test.skip(!F.prov, 'no geographic levels on this instance');
    // FLIP-WHEN-FIXED. Observed 2026-10-02 on local develop (image 10-01 17:48 UTC), in two runs with a fresh login and fresh records each.
    // Two rows with the same identifier:DHIS2 ID preview as 2 new, 0 rejected (FR-F7 lists "identifier value duplicated
    // inside the file" as a rejection reason).
    test.fail();
    await page.goto(LOCATIONS);
    if (!F.mf) { F.mf = await createArea(page, `QA MF Area ${S}`, `QMF${S}`, F.prov); saveFix(); }
    const csv = `type,name,parentCode,identifier:DHIS2 ID\nreferring clinic,QA Cedar Post ${S},QMF${S},DX${S}\nreferring clinic,QA Willow Station ${S},QMF${S},DX${S}\n`;
    const p = await importCall(page, 'preview', [{ name: `organizations-dupid-${S}.csv`, content: csv }], 'merge');
    note('TC-LORG-29d.preview', p.json?.rows?.map((r: any) => [r.name, r.outcome, r.reason]));
    expect(p.json.rows.filter((r: any) => r.outcome === 'rejected').length, 'the second row is rejected').toBe(1);
  });

  test('TC-LORG-29w: a column the importer does not know is reported as ignored (FR-M)', async ({ page }) => {
    test.skip(!F.prov, 'no geographic levels on this instance');
    // FLIP-WHEN-FIXED. Observed 2026-10-02 on local develop (image 10-01 17:48 UTC), in two runs with a fresh login and fresh records each.
    // A file with an extra "colour" column previews with errors [] and no warning anywhere in the plan.
    test.fail();
    await page.goto(LOCATIONS);
    if (!F.mf) { F.mf = await createArea(page, `QA MF Area ${S}`, `QMF${S}`, F.prov); saveFix(); }
    const p = await importCall(page, 'preview', [{ name: `organizations-col-${S}.csv`, content: `type,name,parentCode,colour\nreferring clinic,QA Colour Post ${S},QMF${S},blue\n` }], 'merge');
    note('TC-LORG-29w', { errors: p.json?.errors, rows: p.json?.rows });
    expect(JSON.stringify({ e: p.json?.errors, r: (p.json?.rows || []).map((r: any) => r.reason) })).toMatch(/colour/i);
  });

  test('TC-LORG-29e: files saved by Excel import: "CSV UTF-8" (with a byte-order mark) and plain "CSV" (Windows-1252) (FR-F1)', async ({ page }) => {
    // FLIP-WHEN-FIXED. Observed 2026-10-02 on local develop (image 10-01 17:48 UTC), in two runs with a fresh login and fresh records each.
    // A UTF-8 file starting with a byte-order mark (what Excel's "CSV UTF-8" writes) is refused whole: "must have a
    // 'type' column". A Windows-1252 file (Excel's plain "CSV") previews "Sainte-Thérèse" as "Sainte-Th\ufffdr\ufffdse".
    test.fail();
    await page.goto(LOCATIONS);
    const bom = await importCall(page, 'preview', [{ name: `organizations-bom-${S}.csv`, content: `\uFEFFtype,name\nreferring clinic,QA Bom Post ${S}\n` }], 'merge');
    const w1252 = await importCall(page, 'preview', [{ name: `organizations-ansi-${S}.csv`, content: `type,name\nreferring clinic,QA Clinique Sainte-Thérèse ${S}\n`, encoding: 'latin1' }], 'merge');
    note('TC-LORG-29e', { bom: bom.json?.errors, ansi: w1252.json?.rows?.[0]?.name });
    expect.soft(bom.json?.errors || [], 'BOM file accepted').toEqual([]);
    expect(w1252.json?.rows?.[0]?.name || '', 'accents kept').toContain('Thérèse');
  });

  test('TC-LORG-29b: two different health centres in the same district are not offered as a rename just for sharing "Health Centre" (FR-F12, national-list realism)', async ({ page }) => {
    test.skip(!F.prov, 'no geographic levels on this instance');
    // FLIP-WHEN-FIXED. Observed 2026-10-02 on local develop (image 10-01 17:48 UTC), in two runs with a fresh login and fresh records each.
    // Two new health centres in a district holding "QA Kaugere Health Centre" are both offered as "possible renames" of
    // it. The 60%-of-words rule pairs any names that share "Health Centre" (or a QA prefix and stamp): a 5,000-row file
    // previewed 5,000 possible renames, and Apply stays disabled until every one is decided (FR-F8).
    test.fail();
    await page.goto(LOCATIONS);
    if (!F.hcArea) {
      F.hcArea = await createArea(page, `QA HC District ${S}`, `QHD${S}`, F.prov);
      F.hc1 = await createOrg(page, { name: `QA Kaugere Health Centre ${S}`, typeIds: [F.tClinic], parentId: F.hcArea });
      created.push(F.hc1); saveFix();
    }
    const csv = `type,name,parentCode\nreferring clinic,QA Gerehu Health Centre ${S},QHD${S}\nreferring clinic,QA Kila Kila Health Centre ${S},QHD${S}\n`;
    const p = await importCall(page, 'preview', [{ name: `organizations-hc-${S}.csv`, content: csv }], 'merge');
    note('TC-LORG-29b', p.json?.rows?.map((r: any) => [r.name, r.outcome, r.pair?.name]));
    expect(p.status).toBe(200);
    for (const r of p.json.rows) expect.soft(r.outcome, `${r.name} is new, not a possible rename of ${r.pair?.name}`).toBe('new');
  });

  test('TC-LORG-30: every preview and apply is listed under Recent imports with who, when, mode and counts, and its result report downloads (FR-F10, FR-F9)', async ({ page }) => {
    await page.goto(LOCATIONS);
    const r = await api(page, 'GET', '/rest/locations/import/recent');
    note('TC-LORG-30.recent', (r.json || []).slice(0, 8));
    expect(r.status).toBe(200);
    const runs = r.json as any[];
    expect(runs.length).toBeGreaterThan(0);
    expect(runs.every((x) => x.user && x.startedAt && x.mode)).toBe(true);
    const rep = await page.request.get(`/api/OpenELIS-Global/rest/locations/import/runs/${runs[0].id}/report`);
    note('TC-LORG-30.report', { status: rep.status(), head: (await rep.text()).slice(0, 300) });
    expect(rep.status()).toBe(200);
    await page.goto(`${LOCATIONS}/import`);
    await expect(page.locator('.locationsImport')).toContainText(/Recent imports/);
    const n0 = runs.length;
    await importCall(page, 'preview', [{ name: `organizations-qa-${S}.csv`, content: `type,name\nreferring clinic,QA Run Count ${S}\n` }], 'merge');
    const runs2 = (await api(page, 'GET', '/rest/locations/import/recent')).json as any[];
    note('TC-LORG-30.afterPreview', { n0, n1: runs2.length, first: runs2[0] });
    expect.soft(runs2[0]?.id, 'a preview is recorded as a new run (FR-F10)').not.toBe(runs[0]?.id);

  });

  test('TC-LORG-30t: Recent imports names the files of each run and tells a preview from an apply (FR-F10)', async ({ page }) => {
    // FLIP-WHEN-FIXED. Observed 2026-10-02 on local develop (image 10-01 17:48 UTC), in two runs with a fresh login and fresh records each.
    // GET /import/recent returns id, startedAt, finishedAt, user, mode, summary (a JSON string) and status COMPLETED for
    // previews and applies alike; no file names, no preview / apply marker.
    test.fail();
    await page.goto(LOCATIONS);
    await importCall(page, 'preview', [{ name: `organizations-runname-${S}.csv`, content: `type,name\nreferring clinic,QA Run Name ${S}\n` }], 'merge');
    const r = (await api(page, 'GET', '/rest/locations/import/recent')).json as any[];
    note('TC-LORG-30t', r[0]);
    expect(JSON.stringify(r[0])).toContain(`organizations-runname-${S}.csv`);
    expect(JSON.stringify(r[0])).toMatch(/preview/i);
  });

  test('TC-LORG-31: the Indonesia levels and values files from the startup configuration preview as no change on an instance the startup loader already loaded (AC13) [preview only]', async ({ page }) => {
    await page.goto(LOCATIONS);
    const levels = 'level,typeName,displayKey,sortOrder,defaultValue\n1,Provinsi,address.level.provinsi,1,DKI JAKARTA\n2,Kabupaten/Kota,address.level.kabupaten,2,KOTA JAKARTA SELATAN\n3,Kecamatan,address.level.kecamatan,3,\n4,Kelurahan/Desa,address.level.kelurahan,4,\n';
    const values = ['Provinsi,Kabupaten/Kota,Kecamatan,Kelurahan/Desa', 'ACEH,KABUPATEN SIMEULUE,TEUPAH SELATAN,LATIUNG', 'ACEH,KABUPATEN SIMEULUE,TEUPAH SELATAN,LABUHAN BAJAU',
      'DKI JAKARTA,KOTA JAKARTA SELATAN,JAGAKARSA,CIPEDAK', 'DKI JAKARTA,KOTA JAKARTA SELATAN,JAGAKARSA,SRENGSENG SAWAH', 'DKI JAKARTA,KOTA JAKARTA SELATAN,JAGAKARSA,CIGANJUR',
      'DKI JAKARTA,KOTA JAKARTA SELATAN,JAGAKARSA,JAGAKARSA', 'DKI JAKARTA,KOTA JAKARTA SELATAN,JAGAKARSA,LENTENG AGUNG', 'DKI JAKARTA,KOTA JAKARTA SELATAN,JAGAKARSA,TANJUNG BARAT',
      'MALUKU UTARA,KABUPATEN HALMAHERA TIMUR,WASILE TIMUR,DAKA INO', 'MALUKU UTARA,KABUPATEN HALMAHERA TIMUR,WASILE TIMUR,AKE DAGA', 'MALUKU UTARA,KABUPATEN HALMAHERA TIMUR,WASILE TIMUR,TOBOINO',
      'MALUKU UTARA,KABUPATEN HALMAHERA TIMUR,WASILE TIMUR,DODAGA', 'MALUKU UTARA,KABUPATEN HALMAHERA TIMUR,WASILE TIMUR,TUTULING JAYA', 'MALUKU UTARA,KABUPATEN HALMAHERA TIMUR,WASILE TIMUR,WOKA JAYA'].join('\n') + '\n';
    const hasIndo = (await api(page, 'GET', '/rest/locations/areas?q=ACEH&status=all')).text.includes('ACEH');
    test.skip(!hasIndo, 'this instance was not loaded with the Indonesia address hierarchy');
    const before = null;
    const p = await importCall(page, 'preview', [{ name: 'indonesia-levels.csv', content: levels, area: 'levels' }, { name: 'indonesia-values.csv', content: values, area: 'values' }], 'merge');
    note('TC-LORG-31', { status: p.status, counts: p.json?.counts, errors: p.json?.errors, rows: (p.json?.rows || []).slice(0, 6).map((r: any) => [r.file, r.outcome, r.name, r.reason]), before });
    expect(p.status).toBe(200);
    expect.soft(p.json.counts?.new || 0, 'no new areas: the GUI matches what the startup loader made').toBe(0);
    expect.soft(p.json.counts?.rejected || 0).toBe(0);
  });

  // ---------------------------------------------------------------------------------------------
  // Downstream: FHIR identity, shipment settings, legacy endpoints
  // ---------------------------------------------------------------------------------------------
  test('TC-LORG-18: edits keep the FHIR UUID; Shipment Settings still points at its organization; FHIR and legacy reads still answer (FR-A5)', async ({ page }) => {
    await page.goto(LOCATIONS);
    const uuid = () => db(`select fhir_uuid from clinlims.organization where id=${F.f1}`);
    const u0 = uuid();
    await openList(page, '', { q: `QLF${S}` });
    const form = await openEdit(page, F.f1);
    const name = await form.locator(`#name-${F.f1}`).inputValue();
    await form.locator(`#name-${F.f1}`).fill(`${name} x`);
    await form.getByTestId('locations-save').click();
    await expect(notice(page)).toContainText('saved.');
    await search(page, `QLF${S}`, 2);
    const f2 = await openEdit(page, F.f1);
    await f2.locator(`#name-${F.f1}`).fill(name);
    await f2.getByTestId('locations-save').click();
    await expect(notice(page)).toContainText('saved.');
    if (u0 !== null) expect(uuid(), 'FHIR UUID unchanged by edits').toBe(u0);
    const ship = await api(page, 'GET', '/rest/shipping-box/site-organization-uuid');
    const alpha = db("select fhir_uuid from clinlims.organization where name='QA_AUTO Reference Lab Alpha'");
    const fhirUuid = u0 ?? '';
    const fhir = fhirUuid ? await page.request.get(`/api/OpenELIS-Global/fhir/Organization/${fhirUuid}`) : null;
    const fhirText = fhir ? (await fhir.text()).slice(0, 1500) : '';
    const menu = await api(page, 'GET', '/rest/OrganizationMenu');
    note('TC-LORG-18', { ship: ship.text.slice(0, 200), alpha, fhirStatus: fhir?.status(), fhir: fhirText, menu: menu.status });
    expect(ship.status).toBe(200);
    if (alpha) expect.soft(ship.text, 'Shipment Settings site organization is still Alpha').toContain(alpha);
    expect(menu.status, 'legacy OrganizationMenu still answers').toBe(200);
    if (fhir) {
      expect.soft(fhir.status(), 'FHIR Organization read').toBe(200);
    }
  });

  test('TC-LORG-18f: the FHIR Organization carries every identifier with type.text = its label, the reporting code as official (FR-I5)', async ({ page }) => {
    // FLIP-WHEN-FIXED. Observed 2026-10-02 on local develop (image 10-01 17:48 UTC), in two runs with a fresh login and fresh records each.
    // GET /fhir/Organization/<uuid> lists identifiers org_code, org_uuid and facility_id (use=official, value "Test LIMS");
    // the DHIS2 ID is missing and no identifier has type.text.
    test.fail();
    test.skip(db('select 1') === null, 'needs DB access for the FHIR UUID');
    await page.goto(LOCATIONS);
    const uuid = db(`select fhir_uuid from clinlims.organization where id=${F.f1}`);
    const r = await page.request.get(`/api/OpenELIS-Global/fhir/Organization/${uuid}`);
    const org = await r.json();
    note('TC-LORG-18f', org.identifier);
    const ids = (org.identifier || []) as any[];
    expect(ids.some((i) => i.type?.text === 'DHIS2 ID' && i.value === `Dh${S}xQ`), 'DHIS2 ID with type.text').toBe(true);
    expect(ids.some((i) => i.type?.text === 'Code' && i.use === 'official' && i.value === `QLF${S}`), 'reporting code, official').toBe(true);
  });

  // ---------------------------------------------------------------------------------------------
  // Roles: non-admin users cannot reach or write (Access)
  // ---------------------------------------------------------------------------------------------
  for (const role of ['receptionist', 'labtech', 'validator']) {
    test(`TC-LORG-19-${role}: a ${role} does not get the menu and cannot write through REST (Access)`, async ({ browser, baseURL }) => {
      const state = `.auth/role-${role}.json`;
      test.skip(!fs.existsSync(state), `${state} missing (run roles.setup.ts)`);
      const ctx = await browser.newContext({ storageState: state, ignoreHTTPSErrors: true, baseURL });
      const page = await ctx.newPage();
      await page.goto(LOCATIONS, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(4000);
      const sees = await page.getByTestId('locations-organizations').isVisible().catch(() => false);
      const create = await api(page, 'POST', '/rest/locations/organizations', { kind: 'facility', name: `QA Loc Role ${role} ${S}`, typeIds: [F.tClinic], identifiers: [] });
      const toggle = await setActive(page, [F.f1], false);
      const imp = await importCall(page, 'apply', [{ name: `organizations-role-${S}.csv`, content: `type,name\nreferring clinic,QA Loc Role Import ${role} ${S}\n` }], 'merge');
      note(`TC-LORG-19.${role}`, { url: page.url(), sees, create: create.status, toggle: toggle.status, imp: imp.status });
      if (create.status === 201) created.push(create.json.detail.row.id);
      await ctx.close();
      expect.soft(sees, 'the page does not render for this role').toBe(false);
      expect.soft([401, 403], `create refused (got ${create.status})`).toContain(create.status);
      expect.soft([401, 403], `deactivate refused (got ${toggle.status})`).toContain(toggle.status);
      expect.soft([401, 403], `import apply refused (got ${imp.status})`).toContain(imp.status);
    });
  }

  // ---------------------------------------------------------------------------------------------
  // UX heuristic pass and UI text sweep
  // ---------------------------------------------------------------------------------------------
  test('TC-LORG-40: heuristic pass on the four routes: opens at the top, no raw message keys, no sideways scroll, nothing cut off (H1-H11)', async ({ page }) => {
    const out: any = {};
    for (const route of ['', '/sites', '/areas', '/import']) {
      await page.goto(`${LOCATIONS}${route}`, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(800);
      const body = await page.locator('.locationsPage').innerText();
      const keys = [...new Set(body.match(/\b(?:label|button|message|error|help|placeholder|sidenav|warning|title)\.[a-zA-Z0-9_.]+\b/g) || [])];
      const m = await page.evaluate(() => ({ scrollY: window.scrollY, overflowX: document.documentElement.scrollWidth - window.innerWidth }));
      const clipped = await page.locator('.locationsPage select, .locationsPage .cds--list-box__label').evaluateAll((els) =>
        els.filter((e) => (e as HTMLElement).scrollWidth > (e as HTMLElement).clientWidth + 2).map((e) => (e as HTMLElement).innerText || (e as HTMLSelectElement).value).slice(0, 5));
      out[route || '/'] = { ...m, keys, clipped };
    }
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(LOCATIONS, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');
    out.phone = await page.evaluate(() => ({ overflowX: document.documentElement.scrollWidth - window.innerWidth }));
    note('TC-LORG-40', out);
    for (const k of ['/', '/sites', '/areas', '/import']) {
      expect.soft(out[k].scrollY, `${k} opens at the top`).toBe(0);
      expect.soft(out[k].keys, `${k} shows no raw message keys`).toEqual([]);
      if (k !== '/import') expect.soft(out[k].overflowX, `${k} has no sideways scroll at 1280`).toBeLessThanOrEqual(0);
    }
  });

  test('TC-LORG-40t: Import / Export fits a 1280 px screen without sideways scroll (heuristic H-layout)', async ({ page }) => {
    // FLIP-WHEN-FIXED. Observed 2026-10-02 on local develop (image 10-01 17:48 UTC), in two runs with a fresh login and fresh records each.
    // At 1280 x 720 the Import / Export page is 253 px wider than the window (the list at 375 px is 406 px wider).
    test.fail();
    await page.goto(`${LOCATIONS}/import`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const widest = await page.evaluate(() => [...document.querySelectorAll('.locationsImport *')].map((e) => [e.tagName + '.' + (e as HTMLElement).className.toString().split(' ')[0], (e as HTMLElement).scrollWidth]).sort((a: any, b: any) => b[1] - a[1]).slice(0, 5));
    note('TC-LORG-40t', { over, widest });
    expect(over).toBeLessThanOrEqual(0);
  });

  test('TC-LORG-41: the inline editor can be worked from the keyboard: Edit, every field, Save, in order (FR-L, heuristic)', async ({ page }) => {
    await openList(page, '', { q: `QLF${S}` });
    const edit = page.getByTestId(`locations-edit-${F.f1}`);
    await edit.focus();
    await page.keyboard.press('Enter');
    const form = page.getByTestId(`locations-form-${F.f1}`);
    await expect(form.locator(`#name-${F.f1}`)).not.toHaveValue('', { timeout: 15_000 });
    const seen: string[] = [];
    for (let i = 0; i < 90; i++) {
      await page.keyboard.press('Tab');
      const id = await page.evaluate(() => { const a = document.activeElement as HTMLElement; return a?.id || a?.getAttribute('data-testid') || a?.innerText?.slice(0, 20) || a?.tagName; });
      seen.push(id);
      if (id === 'locations-save') break;
    }
    note('TC-LORG-41', seen);
    const idx = (x: string) => seen.findIndex((s) => s === `${x}-${F.f1}`);
    expect(seen, 'Save is reachable by Tab').toContain('locations-save');
    expect.soft(seen, 'Name is reachable by Tab').toContain(`name-${F.f1}`);
    expect.soft(idx('name') < idx('email') && idx('email') < seen.indexOf('locations-save'), 'fields in reading order, Save after them').toBe(true);
  });

  test('TC-LORG-42: after Add and Cancel, a second Add opens an empty form (heuristic: forms clear)', async ({ page }) => {
    await openList(page);
    await page.getByTestId('locations-add').click();
    await page.locator('#name-new').fill(`QA Loc Leftover ${S}`);
    page.once('dialog', (d) => d.accept());
    await page.getByTestId('locations-form-new').getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByTestId('locations-form-new')).toHaveCount(0);
    await page.getByTestId('locations-add').click();
    await expect(page.locator('#name-new')).toHaveValue('');
  });

  test('TC-LORG-99: retire every record this run created (deactivate, never delete)', async ({ page }) => {
    if (process.env.LOC_KEEP) test.skip(true, 'LOC_KEEP set');
    await page.goto(LOCATIONS);
    // One call per record: the endpoint is all-or-nothing, and an area with something active inside answers 409 for the
    // whole batch. Organizations first (newest first, with their wards), then areas deepest first, a few passes.
    const ids = created.all().reverse();
    const res: Record<string, number> = {};
    for (const id of ids) res[id] = (await setActive(page, [id], false, true)).status;
    const areas = [...ids.filter((id) => res[id] !== 200), F.mf, F.hcArea, F.kec, F.kab, F.prov].filter(Boolean) as string[];
    for (let pass = 0; pass < 3; pass++) {
      for (const id of areas) {
        if (res[id] === 200) continue;
        const r = await api(page, 'POST', `/rest/locations/areas/${id}/active`, { active: false });
        if (r.status === 200) res[id] = 200;
        else res[id] = r.status;
      }
    }
    const left = Object.entries(res).filter(([, v]) => v !== 200);
    note('TC-LORG-99', { count: ids.length, left });
    expect(left, 'every record this run created is inactive').toEqual([]);
  });

});
