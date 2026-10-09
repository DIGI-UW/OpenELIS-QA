/**
 * test-catalog-chaos-access.spec.ts
 *
 * Test Catalog chaos, part 5 of 5: who may change the catalog, and what happens to an admin's
 * work when the session ends mid-edit (TC-CX-PS).
 *
 * Non-admin sessions come from roles.setup.ts (.auth/role-*.json; run --project=setup-roles
 * against the same BASE first). The session-expiry cases clear the cookies of ONE browser context,
 * which ends that context's session only; nobody else is signed out.
 * Catalogue: test-catalog-chaos-full.md.
 */
import { test, expect, type Page } from '@playwright/test';
import { apiGet, apiWrite } from './helpers/silentSave';
import { open, watchToasts, successToasts } from './helpers/catalogUi';
import { TC, RUN, seedTest, asRole, sampleResultsOf, observe } from './helpers/catalogChaos';

test.describe('Test Catalog chaos: permissions and session (TC-CX-PS)', () => {
  test('TC-CX-PS-01: a receptionist and a lab technician are refused (401/403) on every catalog write', async ({ page, browser }) => {
    test.fail(true, 'TRIPWIRE F4: PUT /rest/localizations/{id}/translations answers 200 to a receptionist and a lab technician');
    test.setTimeout(300_000);
    const t = await seedTest(page, 'PS1');
    const before = await sampleResultsOf(page, t.id);
    const writes: [string, 'PUT' | 'POST' | 'DELETE', string, unknown][] = [
      ['basic-info', 'PUT', `${TC}/tests/${t.id}/basic-info`, { testId: t.id, description: 'x' }],
      ['sample-results', 'PUT', `${TC}/tests/${t.id}/sample-results`, { testId: t.id, components: [] }],
      ['ranges', 'PUT', `${TC}/tests/${t.id}/ranges`, { testId: t.id, ranges: [] }],
      ['terminology', 'PUT', `${TC}/tests/${t.id}/terminology`, { testId: t.id, mappings: [] }],
      ['qc-targets', 'PUT', `${TC}/tests/${t.id}/qc-targets`, { testId: t.id, targets: [] }],
      ['storage', 'PUT', `${TC}/tests/${t.id}/storage`, { testId: t.id }],
      ['alerts', 'POST', `${TC}/${t.id}/alerts`, { name: 'x', triggerType: 'ALL' }],
      ['reagents', 'POST', `${TC}/${t.id}/reagents`, { reagentId: 1 }],
      ['methods', 'POST', `/rest/test/${t.id}/methods/inline-create`, { nameEnglish: 'QACX nope', nameFrench: 'QACX nope', code: 'QXNOPE', isDefault: false, effectiveDate: '2026-01-01' }],
      ['panels', 'POST', `${TC}/panels`, { name: `QACX nope ${RUN}` }],
      ['display order', 'PUT', `${TC}/sample-types/2/test-order`, { items: [] }],
      ['create test', 'POST', `${TC}/tests`, { name: 'x' }],
      ['activate', 'POST', `${TC}/tests/${t.id}/activate`, {}],
      ['group ranges', 'PUT', `${TC}/group/ranges`, { testIds: [t.id], ranges: [] }],
      ['label config', 'PUT', `/rest/api/tests/${t.id}/labelConfig`, { allowOrderEntryOverride: false, links: [] }],
      ['translations', 'PUT', `/rest/localizations/1/translations`, {}],
      ['sample type', 'PUT', '/rest/sample-types/2', { id: '2' }],
      ['sample type create', 'POST', '/rest/SampleTypeCreate', { sampleTypeEnglishName: `QACX nope ${RUN}` }],
      ['lab unit', 'PUT', '/rest/lab-units-management/56', { id: '56' }],
    ];
    for (const role of ['receptionist', 'labtech'] as const) {
      const p = await asRole(browser, role);
      for (const [what, m, path, body] of writes) {
        const r = await apiWrite(p, m, path, body);
        expect.soft([401, 403], `${role} ${what} (${m} ${path}): ${r.status} ${r.text.slice(0, 80)}`).toContain(r.status);
      }
      await p.context().close();
    }
    expect((await sampleResultsOf(page, t.id)).components.length, 'the test still has its component').toBe(before.components.length);
  });

  test('TC-CX-PS-02: a non-admin opening the test editor by URL does not get the editor', async ({ page, browser }) => {
    const t = await seedTest(page, 'PS2');
    const p = await asRole(browser, 'receptionist');
    p.on('dialog', (d) => void d.accept());
    await p.goto(`/MasterListsPage/TestCatalogEditor/${t.id}/basic-info`, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(4000);
    const desc = await p.locator('#basic-info-description').count();
    observe('editor inputs visible to a receptionist', desc);
    await p.context().close();
    expect(desc, 'no editor form for a receptionist').toBe(0);
  });

  const sections: [string, string, (p: Page) => Promise<void>, RegExp][] = [
    ['basic-info', '#basic-info-description', async (p) => { await p.locator('#basic-info-description').fill(`QA CX PS typed ${RUN}`); }, /\/basic-info$/],
    ['sample-results', '#comp-label-0', async (p) => { await p.locator('#comp-label-0').fill(`QA CX PS typed ${RUN}`); }, /\/sample-results$/],
    ['storage', '#storage-stability-notes', async (p) => { await p.locator('#storage-stability-notes').fill(`QA CX PS typed ${RUN}`); }, /\/storage$/],
  ];
  sections.forEach(([section, sel, type, re], i) => {
    test(`TC-CX-PS-0${i + 3}: the session ends while editing ${section}: Save is not shown as saved, nothing is written, and the typing is not thrown away`, async ({ browser }) => {
      const ctx = await browser.newContext({ storageState: '.auth/user.json', ignoreHTTPSErrors: true });
      const page = await ctx.newPage();
      const t = await seedTest(page, `PS${i + 3}`);
      await open(page, `/MasterListsPage/TestCatalogEditor/${t.id}/${section}`);
      await page.locator(sel).waitFor({ state: 'visible', timeout: 60_000 });
      await type(page);
      await watchToasts(page);
      const dialogs: string[] = [];
      page.on('dialog', (d) => { dialogs.push(d.message()); void d.accept(); });
      await ctx.clearCookies();
      const resp = page.waitForResponse((r) => r.request().method() === 'PUT' && re.test(new URL(r.url()).pathname), { timeout: 20_000 }).catch(() => null);
      await page.getByRole('button', { name: /^save$/i }).last().click();
      const r = await resp;
      await page.waitForTimeout(3000);
      test.info().annotations.push({ type: 'observed', description: `save answered ${r?.status()}; dialogs ${JSON.stringify(dialogs)}; url now ${page.url()}` });
      const typedStillThere = await page.locator(sel).inputValue().then((v) => v.includes(`QA CX PS typed ${RUN}`)).catch(() => false);
      const success = (await successToasts(page).catch(() => [])).length;
      // read the server with a fresh admin context
      const admin = await (await browser.newContext({ storageState: '.auth/user.json', ignoreHTTPSErrors: true })).newPage();
      await open(admin, '/');
      const stored = JSON.stringify((await apiGet(admin, `${TC}/tests/${t.id}/${section}`)).json ?? '');
      await admin.context().close();
      await ctx.close();
      expect.soft(success, 'no success notification').toBe(0);
      expect.soft(stored.includes(`QA CX PS typed ${RUN}`), 'nothing was written').toBe(false);
      expect(typedStillThere, 'what the admin typed is still on screen (or kept as a draft) to save after signing in again').toBe(true);
    });
  });

  test('TC-CX-PS-06: deep links to a record that does not exist show "not found", not an endless spinner', async ({ page }) => {

    test.fail(true, 'TRIPWIRE F15: unknown sample type and lab unit ids spin forever with no message');
    await open(page, '/');
    for (const path of ['/MasterListsPage/TestCatalogEditor/99999999/basic-info', '/MasterListsPage/TestCatalogEditor/panel/99999999/basic-info',
      '/MasterListsPage/SampleTypeEditor/99999999/basic-info', '/MasterListsPage/LabUnitManagement/99999999/basic-info']) {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(8000);
      const spinning = await page.locator('.cds--loading:visible, .cds--loading-overlay:visible, .cds--skeleton:visible').count();
      const message = await page.locator('.cds--inline-notification, .cds--toast-notification, [role="alert"]').count();
      test.info().annotations.push({ type: 'observed', description: `${path}: spinners ${spinning}, messages ${message}` });
      expect.soft(spinning === 0 && message > 0, `${path}: a message, and no spinner after 8 s`).toBe(true);
    }
  });
});
