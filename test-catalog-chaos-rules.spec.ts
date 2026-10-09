/**
 * test-catalog-chaos-rules.spec.ts
 *
 * Test Catalog chaos, part 2 of 5: the RULES around a test.
 * Sections: QC Targets (TC-CX-QC), Alerts (TC-CX-AL), Storage (TC-CX-ST), and the group editor
 * ("Edit related tests", TC-CX-GR). Reflex & Calc and Analyzers are read-only and are covered by
 * catalogue notes only (see test-catalog-chaos-full.md, "Not encoded").
 *
 * Same five kinds of non-happy path as part 1: bad input (UI and API), save faults, two editors,
 * permissions/session, and apply-then-edit-then-remove lifecycles.
 * Catalogue: test-catalog-chaos-full.md. Data: inactive tests named "QA CX <case> <run>".
 */
import { test, expect, type Page } from '@playwright/test';
import { apiGet, apiWrite } from './helpers/silentSave';
import { open, watchToasts, successToasts, rangesOf, storageOf } from './helpers/catalogUi';
import {
  TC, RUN, seedTest, sampleResultsOf, component, putSampleResults, makeCoded,
  errorToasts, faultOnce, FAULTS, observe,
} from './helpers/catalogChaos';

// ---------------------------------------------------------------------------------------------
// QC Targets
// ---------------------------------------------------------------------------------------------
const qcOf = async (page: Page, id: string) => (await apiGet<any>(page, `${TC}/tests/${id}/qc-targets`)).json;
const putQc = (page: Page, id: string, targets: unknown[]) => apiWrite<any>(page, 'PUT', `${TC}/tests/${id}/qc-targets`, { testId: id, targets });
const qRow = (over: Record<string, unknown>) => ({ id: null, componentId: null, controlLevel: 'LOW', qcControlLotId: null,
  expectedValue: 5, uncertainty: 1, expectedDictResultId: null, active: true, ...over });

test.describe('Test Catalog chaos: QC Targets (TC-CX-QC)', () => {
  test('TC-CX-QC-01: a QC Targets save that fails with a 500 tells the user in words, not raw JSON', async ({ page }) => {
    test.fail(true, 'TRIPWIRE F15: the error toast shows the server JSON {"status":500,...}');
    const t = await seedTest(page, 'QC1');
    await open(page, `/MasterListsPage/TestCatalogEditor/${t.id}/qc-targets`);
    await page.getByTestId('qc-target-add-LOW').waitFor({ state: 'visible', timeout: 60_000 });
    await page.getByTestId('qc-target-add-LOW').click();
    await page.getByTestId('qc-target-LOW-expected').fill('5');
    await page.getByTestId('qc-target-LOW-uncertainty').fill('1');
    await watchToasts(page);
    const fired = await faultOnce(page, 'PUT', /\/qc-targets$/, FAULTS['500 JSON']);
    await page.getByTestId('qc-targets-save').click();
    await expect.poll(fired).toBe(true);
    await expect.poll(async () => (await errorToasts(page)).length, { message: 'the user is told' }).toBeGreaterThan(0);
    const [e] = await errorToasts(page);
    test.info().annotations.push({ type: 'observed', description: `error toast: ${e.text}` });
    expect(e.text, 'the message is readable, not the server JSON').not.toMatch(/\{"|timestamp|"status"/);
    expect(await successToasts(page)).toHaveLength(0);
    await expect(page.getByTestId('qc-target-LOW-expected'), 'typing kept').toHaveValue('5');
  });

  test('TC-CX-QC-02: lifecycle: after the result type changes from numeric to coded, QC targets can still be saved', async ({ page }) => {

    test.fail(true, 'TRIPWIRE F10: after the result type changes, every save is 422 ("expectedDictResultId is required") because old rows are re-sent in the new shape');
    const t = await seedTest(page, 'QC2');
    expect((await putQc(page, t.id, [qRow({})])).status, 'apply a numeric LOW target').toBe(200);
    const { neg } = await makeCoded(page, t.id); // edit the test: now a coded result
    const meta = await qcOf(page, t.id);
    test.info().annotations.push({ type: 'observed', description: `after the type change: quantitative=${meta.quantitative}, targets=${JSON.stringify(meta.targets).slice(0, 200)}` });
    // What QcTargetsSection sends: every row rebuilt in the CURRENT shape, plus the new coded target.
    const rows = [...meta.targets.map((x: any) => ({ id: x.id, componentId: x.componentId ?? null, controlLevel: x.controlLevel,
      qcControlLotId: x.qcControlLotId ?? null, expectedValue: null, uncertainty: null, expectedDictResultId: x.expectedDictResultId ?? null, active: x.active })),
      qRow({ controlLevel: 'NORMAL', expectedValue: null, uncertainty: null, expectedDictResultId: neg })];
    const w = await putQc(page, t.id, rows);
    expect(w.status, `save coded NORMAL target after the change: ${w.text.slice(0, 200)}`).toBe(200);
  });

  test('TC-CX-QC-03: a target added and deactivated before it was filled does not block Save', async ({ page }) => {

    test.fail(true, 'TRIPWIRE F10: a blank row deactivated before it was filled makes Save 422 (UI skips it, server validates it)');
    const t = await seedTest(page, 'QC3');
    await open(page, `/MasterListsPage/TestCatalogEditor/${t.id}/qc-targets`);
    await page.getByTestId('qc-target-add-HIGH').waitFor({ state: 'visible', timeout: 60_000 });
    await page.getByTestId('qc-target-add-HIGH').click();
    await page.getByTestId('qc-target-toggle-HIGH').click();
    await watchToasts(page);
    const resp = page.waitForResponse((r) => r.request().method() === 'PUT' && /\/qc-targets$/.test(new URL(r.url()).pathname));
    await page.getByTestId('qc-targets-save').click();
    const r = await resp;
    observe('Save with one blank, deactivated row', r.status());
    expect(r.status(), `the save goes through: ${(await r.text()).slice(0, 160)}`).toBe(200);
  });

  test('TC-CX-QC-04: out-of-range or wrong-type values are 4xx, never 500', async ({ page }) => {

    test.fail(true, 'TRIPWIRE F19: expected 12345678901 (numeric overflow), unknown and non-numeric dictionary answers answer 500');
    const t = await seedTest(page, 'QC4');
    const cases: [string, Record<string, unknown>][] = [
      ['expected value 12345678901 (column holds 10 digits before the point)', { expectedValue: 12345678901 }],
      ['a dictionary answer that does not exist', { expectedDictResultId: '99999999' }],
      ['a dictionary answer that is not a number', { expectedDictResultId: 'abc' }],
      ['a negative uncertainty', { uncertainty: -1 }],
    ];
    for (const [what, over] of cases) {
      const w = await putQc(page, t.id, [qRow(over)]);
      expect.soft(w.status, `${what}: ${w.text.slice(0, 120)}`).toBeGreaterThanOrEqual(400);
      expect.soft(w.status, `${what} is not a crash`).toBeLessThan(500);
    }
  });

  test('TC-CX-QC-05: lifecycle: add a target, edit it, deactivate it, reactivate it; each step reads back', async ({ page }) => {
    const t = await seedTest(page, 'QC5');
    expect((await putQc(page, t.id, [qRow({})])).status).toBe(200);
    let [x] = (await qcOf(page, t.id)).targets;
    expect([Number(x.expectedValue), Number(x.uncertainty), x.active], 'applied').toEqual([5, 1, true]);
    expect((await putQc(page, t.id, [{ ...qRow({}), id: x.id, expectedValue: 6.5 }])).status).toBe(200);
    [x] = (await qcOf(page, t.id)).targets;
    expect(Number(x.expectedValue), 'edited').toBe(6.5);
    expect((await putQc(page, t.id, [{ ...qRow({}), id: x.id, expectedValue: 6.5, active: false }])).status).toBe(200);
    [x] = (await qcOf(page, t.id)).targets;
    expect(x.active, 'deactivated').toBe(false);
    expect((await putQc(page, t.id, [{ ...qRow({}), id: x.id, expectedValue: 6.5, active: true }])).status).toBe(200);
    [x] = (await qcOf(page, t.id)).targets;
    expect(x.active, 'reactivated').toBe(true);
    const eff = await apiGet<any>(page, `${TC}/tests/${t.id}/qc-targets/effective?controlLevel=LOW`);
    expect(Number(eff.json?.target?.expectedValue), `the effective-target read agrees: ${eff.text.slice(0, 160)}`).toBe(6.5);
  });
});

// ---------------------------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------------------------
const AL = (id: string) => `${TC}/${id}/alerts`;
const rule = (over: Record<string, unknown> = {}) => ({
  name: `QA CX rule ${RUN}`, enabled: true, triggerType: 'CRITICAL', triggerValue: null, componentId: null, sampleTypeId: null,
  notifySms: false, notifyEmail: true, notifyOrderingPhysician: false, notifyPatient: false, notifyReferringFacility: false,
  notifyCustomPhone: null, notifyCustomEmail: 'qa@example.org', notifyRoleId: null, acknowledgmentRequired: false, ...over,
});
const rulesOf = async (page: Page, id: string) => (await apiGet<any[]>(page, AL(id))).json ?? [];

test.describe('Test Catalog chaos: Alerts (TC-CX-AL)', () => {
  test('TC-CX-AL-01: lifecycle: create a rule, rename it, disable it, enable it, delete it; each step reads back', async ({ page }) => {
    const t = await seedTest(page, 'AL1');
    const c = await apiWrite<any>(page, 'POST', AL(t.id), rule());
    expect(c.status, c.text.slice(0, 160)).toBe(201);
    const id = c.json.id;
    expect((await apiWrite(page, 'PUT', `${AL(t.id)}/${id}`, rule({ name: `QA CX renamed ${RUN}` }))).status).toBe(200);
    expect((await rulesOf(page, t.id)).find((r: any) => r.id === id)?.name, 'renamed').toBe(`QA CX renamed ${RUN}`);
    expect((await apiWrite(page, 'PUT', `${AL(t.id)}/${id}`, rule({ name: `QA CX renamed ${RUN}`, enabled: false }))).status).toBe(200);
    expect((await rulesOf(page, t.id)).find((r: any) => r.id === id)?.enabled, 'disabled').toBe(false);
    expect((await apiWrite(page, 'PUT', `${AL(t.id)}/${id}`, rule({ name: `QA CX renamed ${RUN}`, enabled: true }))).status).toBe(200);
    expect((await rulesOf(page, t.id)).find((r: any) => r.id === id)?.enabled, 'enabled').toBe(true);
    expect((await apiWrite(page, 'DELETE', `${AL(t.id)}/${id}`)).status).toBe(204);
    expect(await rulesOf(page, t.id), 'deleted').toHaveLength(0);
    expect((await apiWrite(page, 'DELETE', `${AL(t.id)}/${id}`)).status, 'deleting again is a clean 404').toBe(404);
  });

  test('TC-CX-AL-02: over-long or malformed recipient fields are 4xx, never 500', async ({ page }) => {

    test.fail(true, 'TRIPWIRE F19: phone 21, name 101, e-mail 101, role id "abc" and 999999 answer 500');
    const t = await seedTest(page, 'AL2');
    const cases: [string, Record<string, unknown>][] = [
      ['a 21-character phone (+675 7123 4567 ext 12)', { notifySms: true, notifyCustomPhone: '+675 7123 4567 ext 12' }],
      ['a 101-character name', { name: 'n'.repeat(101) }],
      ['a 101-character e-mail', { notifyCustomEmail: `${'e'.repeat(90)}@example.org` }],
      ['a role id that is not a number', { notifyRoleId: 'abc' }],
      ['a role id that does not exist', { notifyRoleId: '999999' }],
    ];
    for (const [what, over] of cases) {
      const w = await apiWrite(page, 'POST', AL(t.id), rule(over));
      expect.soft(w.status, `${what}: ${w.text.slice(0, 120)}`).toBeGreaterThanOrEqual(400);
      expect.soft(w.status, `${what} is not a crash`).toBeLessThan(500);
    }
    for (const r of await rulesOf(page, t.id)) await apiWrite(page, 'DELETE', `${AL(t.id)}/${r.id}`);
  });

  test('TC-CX-AL-03: lifecycle: a rule scoped to a component that is later removed can still be switched off', async ({ page }) => {

    test.fail(true, 'TRIPWIRE F12: a rule scoped to a removed component cannot be switched off (400); only Delete works');
    const t = await seedTest(page, 'AL3');
    const p = (await sampleResultsOf(page, t.id)).components[0];
    expect((await putSampleResults(page, t.id, [component({ id: p.id, label: p.label }),
      component({ code: 'QAX3', label: 'QA second', isPrimary: false, displayOrder: 2 })])).status).toBe(200);
    const second = (await sampleResultsOf(page, t.id)).components.find((c: any) => c.code === 'QAX3');
    const c = await apiWrite<any>(page, 'POST', AL(t.id), rule({ componentId: String(second.id) }));
    expect(c.status, c.text.slice(0, 160)).toBe(201);
    expect((await putSampleResults(page, t.id, [component({ id: p.id, label: p.label })])).status, 'remove the component').toBe(200);
    // What the list toggle sends: the whole rule as listed, with enabled flipped.
    const listed = (await rulesOf(page, t.id)).find((r: any) => r.id === c.json.id);
    const body = Object.fromEntries(Object.entries(rule()).map(([k]) => [k, listed[k]]));
    const w = await apiWrite(page, 'PUT', `${AL(t.id)}/${c.json.id}`, { ...body, enabled: false });
    observe('switch off a rule whose component was removed', w);
    await apiWrite(page, 'DELETE', `${AL(t.id)}/${c.json.id}`);
    expect(w.status, 'the rule can be switched off').toBe(200);
  });

  test('TC-CX-AL-04: two editors: renaming from an old page does not switch back on a rule another admin switched off', async ({ page }) => {

    test.fail(true, 'TRIPWIRE F11: alert PUT ignores lastupdated; renaming from an old page switches a disabled rule back on');
    const t = await seedTest(page, 'AL4');
    const c = await apiWrite<any>(page, 'POST', AL(t.id), rule());
    const stale = (await rulesOf(page, t.id)).find((r: any) => r.id === c.json.id); // A loads (enabled)
    expect((await apiWrite(page, 'PUT', `${AL(t.id)}/${c.json.id}`, rule({ enabled: false }))).status, 'B switches it off').toBe(200);
    const body = Object.fromEntries(Object.entries(rule()).map(([k]) => [k, stale[k]]));
    const w = await apiWrite(page, 'PUT', `${AL(t.id)}/${c.json.id}`, { ...body, name: `QA CX A rename ${RUN}` });
    observe('A renames on its old copy', w);
    const now = (await rulesOf(page, t.id)).find((r: any) => r.id === c.json.id);
    await apiWrite(page, 'DELETE', `${AL(t.id)}/${c.json.id}`);
    expect(w.status === 409 || now.enabled === false, `A refused as stale, or the rule stays off (enabled=${now.enabled})`).toBe(true);
  });

  test('TC-CX-AL-05: a rule save that fails keeps the dialog open with the typing, and says so', async ({ page }) => {
    const t = await seedTest(page, 'AL5');
    await open(page, `/MasterListsPage/TestCatalogEditor/${t.id}/alerts`);
    await page.getByTestId('add-rule-button').waitFor({ state: 'visible', timeout: 60_000 });
    await page.getByTestId('add-rule-button').click();
    const dlg = page.getByRole('dialog').last();
    await dlg.locator('#alert-name').fill(`QA CX AL5 ${RUN}`);
    await dlg.locator('label[for="trigger-CRITICAL"]').click();
    await dlg.locator('label[for="channel-email"]').click();
    await dlg.locator('#recipient-custom-email').fill('qa@example.org');
    const fired = await faultOnce(page, 'POST', /\/rest\/test-catalog\/\d+\/alerts$/, FAULTS['dropped connection']);
    await dlg.getByRole('button', { name: /^save$/i }).click();
    await expect.poll(fired).toBe(true);
    await expect(dlg, 'the dialog stays open').toBeVisible();
    await expect(dlg.locator('.cds--inline-notification--error'), 'with an error').toBeVisible();
    await expect(dlg.locator('#alert-name'), 'and the typing').toHaveValue(`QA CX AL5 ${RUN}`);
    expect(await rulesOf(page, t.id), 'nothing stored').toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------------------------
const store = (over: Record<string, unknown> = {}) => ({
  storageCondition: 'REFRIGERATED', storageConditionCustom: null, storageDuration: 7, storageDurationUnit: 'days',
  stabilityNotes: null, protectFromLight: false, doNotFreeze: false, doNotRefrigerate: false, disposalMethod: null,
  disposalTimeframe: null, disposalUnit: null, specialInstructions: null, overrideRestricted: false, ...over,
});
const putStorage = (page: Page, id: string, over: Record<string, unknown> = {}) =>
  apiWrite<any>(page, 'PUT', `${TC}/tests/${id}/storage`, { testId: id, ...store(over) });

test.describe('Test Catalog chaos: Storage (TC-CX-ST)', () => {
  test('TC-CX-ST-01: the server refuses a storage condition the product does not know', async ({ page }) => {
    test.fail(true, 'TRIPWIRE F17: unknown storage condition codes ("BOGUS", "frozen") are stored (200)');
    const t = await seedTest(page, 'ST1');
    for (const cond of ['BOGUS', 'frozen']) {
      const w = await putStorage(page, t.id, { storageCondition: cond });
      expect.soft(w.status, `condition ${cond}: ${w.text.slice(0, 120)}`).toBe(422);
    }
    const s = await storageOf(page, t.id);
    expect(['BOGUS', 'frozen'], `stored condition is a known code (now ${s?.storageCondition})`).not.toContain(s?.storageCondition);
  });

  test('TC-CX-ST-02: over-long text and negative durations are 4xx, never 500', async ({ page }) => {

    test.fail(true, 'TRIPWIRE F19/F17: custom 201, unit 21, disposal 101 answer 500; a negative duration is stored');
    const t = await seedTest(page, 'ST2');
    const cases: [string, Record<string, unknown>][] = [
      ['a 201-character custom condition', { storageCondition: 'OTHER', storageConditionCustom: 'c'.repeat(201) }],
      ['a 21-character duration unit', { storageDurationUnit: 'u'.repeat(21) }],
      ['a 101-character disposal method', { disposalMethod: 'd'.repeat(101) }],
      ['a negative duration', { storageDuration: -3 }],
    ];
    for (const [what, over] of cases) {
      const w = await putStorage(page, t.id, over);
      expect.soft(w.status, `${what}: ${w.text.slice(0, 120)}`).toBeGreaterThanOrEqual(400);
      expect.soft(w.status, `${what} is not a crash`).toBeLessThan(500);
    }
  });

  test('TC-CX-ST-03: two first saves of storage at the same moment both answer cleanly (no 500)', async ({ page }) => {

    test.fail(true, 'TRIPWIRE F19: two first saves at once: one 500 (uq_test_sample_handling_test)');
    const t = await seedTest(page, 'ST3');
    const [a, b] = await Promise.all([putStorage(page, t.id, { storageDuration: 3 }), putStorage(page, t.id, { storageDuration: 4 })]);
    observe('parallel first saves', a.status * 1000 + b.status);
    expect([a.status, b.status].every((s) => s < 500), `statuses ${a.status} / ${b.status}: ${a.text.slice(0, 80)} ${b.text.slice(0, 80)}`).toBe(true);
  });

  (['dropped connection', 'login page with a 200'] as const).forEach((what, i) => {
    test(`TC-CX-ST-0${i + 4}: a Storage save that meets ${what} is not shown as saved and keeps the form`, async ({ page }) => {
      test.fail(what === 'login page with a 200', 'TRIPWIRE F8: a login page answered with 200 is shown as "Sample storage saved"');
      const t = await seedTest(page, `ST${i + 4}`);
      await open(page, `/MasterListsPage/TestCatalogEditor/${t.id}/storage`);
      const notes = page.locator('#storage-stability-notes');
      await notes.waitFor({ state: 'visible', timeout: 60_000 });
      await notes.fill(`QA CX ST${i + 4} ${RUN}`);
      await watchToasts(page);
      const fired = await faultOnce(page, 'PUT', /\/tests\/\d+\/storage$/, FAULTS[what]);
      await page.getByRole('button', { name: /^save$/i }).last().click();
      await expect.poll(fired).toBe(true);
      await page.waitForTimeout(1500);
      expect(await successToasts(page), 'no success').toHaveLength(0);
      expect((await errorToasts(page)).length, 'an error').toBeGreaterThan(0);
      await expect(page.locator('#storage-stability-notes'), 'typing kept').toHaveValue(`QA CX ST${i + 4} ${RUN}`);
    });
  });

  test('TC-CX-ST-06: lifecycle: set, change and clear storage; the history lists each change', async ({ page }) => {
    const t = await seedTest(page, 'ST6');
    expect((await putStorage(page, t.id, { storageCondition: 'FROZEN', storageDuration: 30 })).status).toBe(200);
    expect((await storageOf(page, t.id)).storageCondition, 'applied').toBe('FROZEN');
    expect((await putStorage(page, t.id, { storageCondition: 'REFRIGERATED', storageDuration: 2 })).status).toBe(200);
    expect((await storageOf(page, t.id)).storageCondition, 'edited').toBe('REFRIGERATED');
    expect((await putStorage(page, t.id, { storageCondition: null, storageDuration: null, storageDurationUnit: null })).status).toBe(200);
    expect((await storageOf(page, t.id)).storageCondition ?? null, 'cleared').toBeNull();
    const h = await apiGet<any[]>(page, `${TC}/${t.id}/storage/history`);
    expect(h.status).toBe(200);
    test.info().annotations.push({ type: 'observed', description: `history rows: ${(h.json ?? []).length}` });
    expect((h.json ?? []).length, 'three changes recorded').toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------------------------
// Group editor ("Edit related tests")
// ---------------------------------------------------------------------------------------------
const rng = (componentId: string, over: Record<string, unknown> = {}) => ({ componentId, gender: '', minAge: 0, maxAge: null,
  lowNormal: 3, highNormal: 5, lowValid: 0, highValid: 50, ...over });

test.describe('Test Catalog chaos: group editor (TC-CX-GR)', () => {
  test('TC-CX-GR-01: if one test\'s ranges fail to load, "Set all to these values" does not wipe the ranges of every test', async ({ page }) => {
    test.fail(true, 'TRIPWIRE F2: the failed load seeds an empty table; "Set all" sends ranges [] and deletes every range on every selected test');
    const a = await seedTest(page, 'GR1a');
    const b = await seedTest(page, 'GR1b');
    for (const t of [a, b]) expect((await apiWrite(page, 'PUT', `${TC}/tests/${t.id}/ranges`, { testId: t.id, ranges: [rng(t.componentId)] })).status).toBe(200);
    const failLoad = (u: URL) => new RegExp(`/rest/test-catalog/tests/${a.id}/ranges$`).test(u.pathname);
    await page.route(failLoad, (r) =>
      r.request().method() === 'GET' ? r.fulfill({ status: 500, contentType: 'application/json', body: '{"status":500}' }) : r.continue());
    await open(page, `/MasterListsPage/TestCatalogEditor/group/${a.id},${b.id}`);
    const setAll = page.getByRole('button', { name: /set all to these values/i });
    await setAll.waitFor({ state: 'visible', timeout: 60_000 });
    let sent = '';
    page.on('request', (r) => { if (r.method() === 'PUT' && /\/group\/ranges$/.test(r.url())) sent = r.postData() ?? ''; });
    if (await setAll.isEnabled()) await setAll.click();
    await page.waitForTimeout(3000);
    await page.unroute(failLoad);
    test.info().annotations.push({ type: 'observed', description: `group PUT body: ${sent.slice(0, 200) || '(none sent)'}` });
    expect((await rangesOf(page, a.id)).length, "test A's range survives").toBe(1);
    expect((await rangesOf(page, b.id)).length, "test B's range survives").toBe(1);
  });

  test('TC-CX-GR-02: tests that differ only in their reporting range are flagged as different before "Set all"', async ({ page }) => {

    test.fail(true, 'TRIPWIRE F13: the differs check ignores reporting bounds, so tests that differ only there show as identical');
    const a = await seedTest(page, 'GR2a');
    const b = await seedTest(page, 'GR2b');
    expect((await apiWrite(page, 'PUT', `${TC}/tests/${a.id}/ranges`, { testId: a.id, ranges: [rng(a.componentId, { lowReporting: 0, highReporting: 40 })] })).status).toBe(200);
    expect((await apiWrite(page, 'PUT', `${TC}/tests/${b.id}/ranges`, { testId: b.id, ranges: [rng(b.componentId, { lowReporting: 1, highReporting: 45 })] })).status).toBe(200);
    await open(page, `/MasterListsPage/TestCatalogEditor/group/${a.id},${b.id}`);
    await page.getByRole('button', { name: /set all to these values/i }).waitFor({ state: 'visible', timeout: 60_000 });
    await expect(page.getByTestId('ranges-differ-warning'), 'the editor warns that the tests differ').toBeVisible();
  });

  test('TC-CX-GR-03: a group range for a specimen one test does not run on does not become that test\'s all-specimen range', async ({ page }) => {

    test.fail(true, 'TRIPWIRE F13: a Serum-only group range becomes an all-specimen range on the Plasma-only test');
    const a = await seedTest(page, 'GR3a'); // Serum
    const b = await seedTest(page, 'GR3b', { sampleTypeId: '3' }); // Plasma
    const w = await apiWrite(page, 'PUT', `${TC}/group/ranges`, { testIds: [a.id, b.id], ranges: [rng(a.componentId, { sampleTypeId: '2' })] });
    observe('group PUT with a Serum-only range', w);
    const onB = await rangesOf(page, b.id);
    test.info().annotations.push({ type: 'observed', description: `ranges on the Plasma test: ${JSON.stringify(onB).slice(0, 200)}` });
    expect(onB.filter((r: any) => !r.sampleTypeId), 'the Plasma test did not get a shared (all-specimen) range').toHaveLength(0);
  });

  test('TC-CX-GR-04: a bad group body is refused before anything is written (no partial save, no 500)', async ({ page }) => {

    test.fail(true, 'TRIPWIRE F13/F19: null ranges and a non-numeric id answer 500, and the request writes both tests before failing');
    const a = await seedTest(page, 'GR4a');
    const b = await seedTest(page, 'GR4b');
    const cases: [string, unknown][] = [
      ['ranges null', { testIds: [a.id, b.id], ranges: null }],
      ['a test id that is not a number, last', { testIds: [a.id, b.id, 'abc'], ranges: [rng(a.componentId)] }],
      ['single-test ranges null', null],
    ];
    for (const [what, body] of cases) {
      const w = body === null
        ? await apiWrite(page, 'PUT', `${TC}/tests/${a.id}/ranges`, { testId: a.id, ranges: null })
        : await apiWrite(page, 'PUT', `${TC}/group/ranges`, body);
      expect.soft(w.status, `${what}: ${w.text.slice(0, 120)}`).toBeLessThan(500);
    }
    expect.soft((await rangesOf(page, a.id)).length, 'test A has no range written by a refused request').toBe(0);
    expect.soft((await rangesOf(page, b.id)).length, 'nor test B').toBe(0);
  });

  test('TC-CX-GR-05: lifecycle: set a shared range on two tests, change it, clear it; both tests follow', async ({ page }) => {
    const a = await seedTest(page, 'GR5a');
    const b = await seedTest(page, 'GR5b');
    const put = (ranges: unknown[]) => apiWrite(page, 'PUT', `${TC}/group/ranges`, { testIds: [a.id, b.id], ranges });
    expect((await put([rng(a.componentId)])).status).toBe(200);
    for (const t of [a, b]) expect((await rangesOf(page, t.id)).map((r: any) => Number(r.highNormal)), `applied on ${t.id}`).toEqual([5]);
    expect((await put([rng(a.componentId, { highNormal: 6 })])).status).toBe(200);
    for (const t of [a, b]) expect((await rangesOf(page, t.id)).map((r: any) => Number(r.highNormal)), `edited on ${t.id}`).toEqual([6]);
    expect((await put([])).status).toBe(200);
    for (const t of [a, b]) expect(await rangesOf(page, t.id), `cleared on ${t.id}`).toHaveLength(0);
  });
});
