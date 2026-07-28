/**
 * QA/QC control-lot lifecycle — deep round-trip (self-seeding, self-cleaning)   [OGC-41 Westgard QC]
 *
 * Exercises the write surface of the new QA→QC module's control-lot management, driving the real
 * endpoints captured from QCRestController + ControlLotSetup.jsx on pngdemo (index-Np3i_e3L.js):
 *
 *   GET  /rest/analyzer/analyzers                    -> { analyzers:[{id,name,...}] }   (instrument source)
 *   GET  /rest/displayList/ALL_TESTS                 -> [{id,value}]                     (test source)
 *   POST /rest/qc/controlLot                         -> 200 + saved lot (create when id blank)
 *   GET  /rest/qc/controlLot/{id}                    -> lot detail
 *   GET  /rest/qc/controlLot/byLotNumber/{lotNumber} -> lot by natural key
 *   GET  /rest/qc/control-lots                       -> all lots (list membership)
 *   PUT  /rest/qc/controlLot/{id}/activate           -> ESTABLISHMENT -> ACTIVE
 *   PUT  /rest/qc/controlLot/{id}/deactivate         -> -> EXPIRED   (used here to clean up)
 *
 * The lot payload mirrors ControlLotSetup's submit shape: controlLevel LOW|NORMAL|HIGH,
 * calculationMethod MANUFACTURER_FIXED, ISO dates, numeric instrumentId/testId. The test creates a
 * QA-AUTO- lot in ESTABLISHMENT, verifies read-back by id + lot number, activates it (asserts the
 * state transition), confirms list membership, then DEACTIVATES it (EXPIRED) so it never lingers as
 * active QC data. Skips cleanly where the QC module or an analyzer/test is absent — never fabricates.
 *
 * Run:  BASE=https://pngdemo.openelis-global.org npx playwright test --project=qc-control-lot
 */
import { test, expect, Page } from '@playwright/test';

const REST = '/api/OpenELIS-Global/rest';

async function getJson<T = any>(page: Page, path: string): Promise<{ status: number; body: T | null }> {
  return page.evaluate(async (p) => {
    try { const r = await fetch(p, { credentials: 'include', headers: { Accept: 'application/json' } }); let b: any = null; try { b = await r.json(); } catch {} return { status: r.status, body: b }; }
    catch { return { status: 0, body: null }; }
  }, path);
}
async function send(page: Page, method: 'POST' | 'PUT', path: string, body?: any): Promise<{ status: number; body: any }> {
  return page.evaluate(async ([m, p, b]) => {
    const csrf = localStorage.getItem('CSRF') || '';
    const init: RequestInit = { method: m as string, credentials: 'include', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-Token': csrf } };
    if (b !== undefined) init.body = JSON.stringify(b);
    try { const r = await fetch(p as string, init); let j: any = null; try { j = await r.json(); } catch {} return { status: r.status, body: j }; }
    catch (e) { return { status: 0, body: String(e) }; }
  }, [method, path, body] as any);
}

test.describe('QA/QC control-lot lifecycle [pngdemo]', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => !!localStorage.getItem('CSRF'), null, { timeout: 15000 }).catch(() => {});
    const probe = await getJson(page, `${REST}/qc/control-lots`);
    test.skip(probe.status === 404 || probe.status === 0,
      `QA→QC module not present (GET /rest/qc/control-lots -> ${probe.status})`);
  });

  test('CL: create → read-back → activate → list → deactivate (self-seeding, cleans up)', async ({ page }, info) => {
    test.setTimeout(120000);

    // discover an instrument + a test (skip if the instance has none)
    const an = await getJson(page, `${REST}/analyzer/analyzers`);
    const analyzers = Array.isArray((an.body as any)?.analyzers) ? (an.body as any).analyzers
      : (Array.isArray(an.body) ? an.body as any[] : []);
    const tl = await getJson(page, `${REST}/displayList/ALL_TESTS`);
    const tests = Array.isArray(tl.body) ? tl.body as any[] : [];
    test.skip(analyzers.length === 0 || tests.length === 0,
      `no analyzer (${analyzers.length}) or test (${tests.length}) available to bind a control lot`);

    const instrumentId = parseInt(String(analyzers[0].id), 10);
    const testId = parseInt(String(tests[0].id), 10);
    const lotNumber = 'QA-AUTO-LOT-' + Date.now().toString().slice(-9);

    // 1. create in ESTABLISHMENT (mirrors ControlLotSetup submit shape)
    const created = await send(page, 'POST', `${REST}/qc/controlLot`, {
      productName: 'QA AUTO Control', lotNumber, controlLevel: 'NORMAL',
      expirationDate: new Date('2027-01-01T12:00:00').toISOString(),
      instrumentId, testId, calculationMethod: 'MANUFACTURER_FIXED',
      initialRunsCount: 20, manufacturerMean: 10, manufacturerStdDev: 1,
      activationDate: new Date().toISOString(), status: 'ESTABLISHMENT',
    });
    expect(created.status, `POST /rest/qc/controlLot -> 200 (body: ${JSON.stringify(created.body).slice(0, 160)})`).toBe(200);
    const id = String(created.body?.id || '');
    expect(id, 'create returned a lot id').toMatch(/.+/);
    expect(String(created.body?.lotNumber), 'lotNumber persisted').toBe(lotNumber);

    try {
      // 2. read-back by id + by natural key (lotNumber)
      const byId = await getJson(page, `${REST}/qc/controlLot/${id}`);
      expect(byId.status, 'GET controlLot/{id} -> 200').toBe(200);
      expect(Number(byId.body?.instrumentId), 'instrumentId round-trips').toBe(instrumentId);
      expect(Number(byId.body?.testId), 'testId round-trips').toBe(testId);
      const byLot = await getJson(page, `${REST}/qc/controlLot/byLotNumber/${encodeURIComponent(lotNumber)}`);
      expect(byLot.status, 'GET controlLot/byLotNumber -> 200').toBe(200);
      expect(String(byLot.body?.id), 'byLotNumber resolves the same lot').toBe(id);

      // 3. activate: ESTABLISHMENT -> ACTIVE (state-machine transition)
      const act = await send(page, 'PUT', `${REST}/qc/controlLot/${id}/activate`);
      expect(act.status, 'PUT activate -> 200').toBe(200);
      const afterAct = await getJson(page, `${REST}/qc/controlLot/${id}`);
      expect(String(afterAct.body?.status), 'status is ACTIVE after activate').toBe('ACTIVE');

      // 4. the active lot is a member of the all-lots list
      const all = await getJson(page, `${REST}/qc/control-lots`);
      expect(Array.isArray(all.body), 'control-lots is an array').toBeTruthy();
      expect((all.body as any[]).some((l) => String(l.id) === id), 'created lot appears in /rest/qc/control-lots').toBeTruthy();
    } finally {
      // 5. cleanup: deactivate -> EXPIRED so the seeded lot never lingers as active QC data
      const de = await send(page, 'PUT', `${REST}/qc/controlLot/${id}/deactivate`);
      if (de.status !== 200) info.annotations.push({ type: 'gap', description: `cleanup deactivate returned ${de.status} for lot ${id}` });
    }
    const finalState = await getJson(page, `${REST}/qc/controlLot/${id}`);
    expect(String(finalState.body?.status), 'lot deactivated (EXPIRED) on cleanup').toBe('EXPIRED');
  });
});
