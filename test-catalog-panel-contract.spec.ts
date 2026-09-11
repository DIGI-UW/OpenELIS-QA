/**
 * OpenELIS Global — Panel catalogue: API CONTRACT.
 *
 * Companion to `test-catalog-admin-list-screens.spec.ts`, which covers the rendered Panel
 * Editor list. This file covers the contract underneath it. Neither subsumes the other;
 * the same split already exists for sample types (see
 * `test-catalog-sample-type-management.spec.ts`, which is contract-only).
 *
 * ── Endpoint census, probed live on develop 5fe0ecb (2026-09-11) ──────────────────────
 *   GET /rest/test-catalog/panels        200  array of panel DTOs
 *   GET /rest/test-catalog/panels/{id}   200  one panel, same shape
 *   GET /rest/PanelCreate                200  LEGACY form controller; `existingPanelList`
 *                                             groups panels by `typeOfSampleName`
 *   GET /rest/panels                     404
 *   GET /rest/test-panels                404
 *   GET /rest/AllPanels                  404
 *
 * The three 404s are asserted below ON PURPOSE. They are the paths a reasonable person
 * guesses first, and PC-5 records that they do not exist so nobody re-derives that by
 * probing. If one of them starts answering, this file turns red and someone decides
 * deliberately which path is canonical.
 *
 * ── Why PC-4 exists ───────────────────────────────────────────────────────────────────
 * `sampleTypes[]` is DERIVED from the panel's member tests, and the Panel Editor renders it
 * as the "Sample Types (derived)" column. A panel spanning more than one sample type is the
 * configuration behind the panel/sample-type leak (`tests/panel-sample-type-leak.spec.ts`),
 * so the UI and the API disagreeing about it would hide the risky rows. PC-4 pins them
 * together.
 *
 * READING THE CELL: the column renders one Carbon <Tag> per sample type, each on its own
 * line. `innerText.split('\n')[0]` returns only the FIRST tag and makes a five-sample-type
 * panel look like a one-sample-type panel. Read the whole cell. This cost a false "the UI
 * under-reports derived sample types" finding before it was caught.
 */
import { test, expect, Page } from '@playwright/test';

type ApiResult = { status: number; body: any };

async function api(page: Page, path: string): Promise<ApiResult> {
  return page.evaluate(async (p) => {
    const r = await fetch('/api/OpenELIS-Global/rest' + p, {
      headers: { Accept: 'application/json' }, credentials: 'include',
    });
    let body: any = null;
    try { body = await r.json(); } catch { body = null; }
    return { status: r.status, body };
  }, path);
}

/** Bootstrap a session. The route is incidental; any authenticated page serves. */
test.beforeEach(async ({ page }) => {
  await page.goto('/MasterListsPage/TestCatalogList?entity=panels', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
});

test.describe('Panel catalogue — API contract', () => {
  test('PC-1: GET /test-catalog/panels returns panels with the documented DTO shape', async ({ page }) => {
    const r = await api(page, '/test-catalog/panels');
    expect(r.status, 'GET /test-catalog/panels -> 200').toBe(200);
    expect(Array.isArray(r.body), 'the response is a JSON array').toBe(true);
    expect(r.body.length, 'at least one panel is configured').toBeGreaterThan(0);

    for (const p of r.body.slice(0, 5)) {
      expect(p, `panel ${p?.id} shape`).toEqual(expect.objectContaining({
        id: expect.anything(),
        name: expect.any(String),
        domain: expect.any(String),
        active: expect.any(Boolean),
        testCount: expect.any(Number),
        sampleTypes: expect.any(Array),
      }));
      expect(p.name.trim(), `panel ${p.id} has a non-empty name`).not.toBe('');
    }
  });

  test('PC-2: GET /test-catalog/panels/{id} round-trips a panel from the list', async ({ page }) => {
    const list = await api(page, '/test-catalog/panels');
    const first = (list.body || [])[0];
    expect(first, 'a panel to fetch').toBeTruthy();

    const one = await api(page, `/test-catalog/panels/${first.id}`);
    expect(one.status, `GET /test-catalog/panels/${first.id} -> 200`).toBe(200);
    expect(one.body.id?.toString(), 'the id round-trips').toBe(first.id?.toString());
    expect(one.body.name, 'the name round-trips').toBe(first.name);
    expect(one.body.testCount, 'testCount round-trips').toBe(first.testCount);
    expect((one.body.sampleTypes || []).slice().sort(),
      'the derived sample types round-trip').toEqual((first.sampleTypes || []).slice().sort());
  });

  test('PC-3: a panel with member tests derives at least one sample type', async ({ page }) => {
    const r = await api(page, '/test-catalog/panels');
    const withTests = (r.body || []).filter((p: any) => p.testCount > 0);
    expect(withTests.length, 'no panel has member tests; nothing to verify').toBeGreaterThan(0);

    const empty = withTests.filter((p: any) => !p.sampleTypes || p.sampleTypes.length === 0);
    expect(empty.map((p: any) => `${p.id}:${p.name}`),
      'these panels have member tests but derive no sample type').toEqual([]);

    const multi = withTests.filter((p: any) => (p.sampleTypes || []).length > 1);
    console.log('PC-3 multi-sample-type panels = ' +
      JSON.stringify(multi.map((p: any) => `${p.name} -> ${p.sampleTypes.join(', ')}`)));
  });

  test('PC-4: the "Sample Types (derived)" column agrees with the API, tag for tag', async ({ page }) => {
    const r = await api(page, '/test-catalog/panels');
    const byName: Record<string, any> = {};
    for (const p of r.body || []) byName[p.name] = p;

    // Read the WHOLE cell: one Carbon <Tag> per sample type, one per line.
    const ui = await page.$$eval('table tbody tr', (trs: any[]) =>
      trs.map(tr => {
        const tds = [...tr.querySelectorAll('td')];
        return {
          name: ((tds[0] as any)?.innerText || '').split('\n')[0].trim(),
          derived: ((tds[4] as any)?.innerText || '').split('\n').map(s => s.trim()).filter(Boolean),
        };
      }));
    expect(ui.length, 'the Panel Editor rendered no rows to compare').toBeGreaterThan(0);

    const disagreements: string[] = [];
    let compared = 0;
    for (const row of ui) {
      const p = byName[row.name];
      if (!p) continue;
      const apiTypes = (p.sampleTypes || []).slice().sort();
      // The column renders an em dash when there are none.
      const uiTypes = row.derived.filter(t => t !== '—' && t !== '-').slice().sort();
      compared++;
      if (JSON.stringify(apiTypes) !== JSON.stringify(uiTypes)) {
        disagreements.push(`${row.name}: UI [${uiTypes.join(', ')}] vs API [${apiTypes.join(', ')}]`);
      }
    }
    console.log(`PC-4 compared ${compared} panel(s)`);
    expect(compared, 'no panel row could be matched to the API; the comparison was vacuous').toBeGreaterThan(0);
    expect(disagreements, 'the derived column disagrees with the API').toEqual([]);
  });

  test('PC-5: the guessable panel paths do not exist (contract fact — do not re-probe)', async ({ page }) => {
    for (const p of ['/panels', '/test-panels', '/AllPanels']) {
      const r = await api(page, p);
      expect(r.status,
        `${p} answered ${r.status}; if this path is now real, decide which one is canonical`).toBe(404);
    }
  });

  test('PC-6: PanelCreate still groups panels by sample type (the leak-detection surface)', async ({ page }) => {
    const r = await api(page, '/PanelCreate');
    expect(r.status, 'GET /PanelCreate -> 200').toBe(200);
    const groups = r.body?.existingPanelList;
    expect(Array.isArray(groups), '`existingPanelList` is an array of sample-type groups').toBe(true);
    expect(groups.length, 'at least one sample-type group').toBeGreaterThan(0);
    expect(groups.some((g: any) => typeof g.typeOfSampleName === 'string' && g.typeOfSampleName.trim()),
      'groups are keyed by typeOfSampleName').toBe(true);
  });
});
