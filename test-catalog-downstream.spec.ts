/**
 * OpenELIS Global — Test Catalog editor: DOWNSTREAM cross-link coverage.
 * Target: testing.openelis-global.org (v3.2.1.10). Authored 2026-07-06.
 *
 * The point of a catalog that replaces the old one: config changes must LAND DOWNSTREAM.
 * These tests verify the catalog → order-entry data link at the API layer (reliable/automatable),
 * plus a robustness guard, and document the UI order→results→flags chain that must be run by a
 * human until the order-wizard Carbon Sample-Type dropdown can be driven by automation.
 *
 * Order entry is domain-split: new shared wizard at /order/enter (Sample Category Clinical |
 * Environmental/Other; Vector via its path). Legacy /SamplePatientEntry is deprecated — not tested.
 *
 * Order source of truth for a sample type:
 *   GET /rest/sample-type-tests?sampleType={id}
 *     → { sampleTypeId, panels:[{ id, name, testIds:"1,2,...", panelOrder }], ... }
 */

import { test, expect, request as pwRequest } from '@playwright/test';

const BASE = process.env.BASE || 'https://testing.openelis-global.org';
const REST = `${BASE}/api/OpenELIS-Global/rest`;
const SERUM_ID = process.env.SERUM_ID || '2';

test.describe('Test Catalog — downstream cross-links', () => {

  // TCG-01 — CROSS-LINK: a test linked to a panel in the editor shows up in the order source.
  // Verified live: QA test 379 linked to "Bilan Biochimique" appears in Serum's sample-type-tests.
  test('TCG-01: catalog panel membership propagates to /sample-type-tests (Serum)', async ({ request }) => {
    const res = await request.get(`${REST}/sample-type-tests?sampleType=${SERUM_ID}`, { headers: { Accept: 'application/json' } });
    expect(res.status(), 'sample-type-tests with sampleType param').toBe(200);
    const body = await res.json();
    expect(body.sampleTypeId).toBe(SERUM_ID);
    expect(Array.isArray(body.panels), 'panels array').toBeTruthy();

    // Union of every panel's testIds = the orderable test ids for this sample type.
    const testIds = new Set<string>();
    for (const p of body.panels) String(p.testIds || '').split(',').filter(Boolean).forEach((id: string) => testIds.add(id.trim()));

    // Amylase(Serum) is id 5 — a known orderable Serum test — must be present.
    expect(testIds.has('5'), 'Amylase(Serum) id=5 present in Serum orderable tests').toBeTruthy();

    // If a QA_AUTO test id is provided (linked to a panel via the editor), assert it propagated.
    if (process.env.QA_TEST_ID) {
      expect(testIds.has(process.env.QA_TEST_ID),
        `catalog-linked test ${process.env.QA_TEST_ID} propagated to order source`).toBeTruthy();
    }
  });

  // Robustness guard: the param-less endpoint 500s (should be empty/400). FIXME when fixed.
  // Filed as OGC-1120 (re-verified 500 on 2026-07-07; ?sampleType=2 returns 200).
  test('sample-type-tests without a sampleType param returns 500 (robustness bug guard) [OGC-1120]', async ({ request }) => {
    const res = await request.get(`${REST}/sample-type-tests`, { headers: { Accept: 'application/json' } });
    // FIXME(OGC-1120): currently 500; when handled gracefully this becomes 200 (empty) or 400 → update.
    expect(res.status(), 'param-less sample-type-tests currently errors').toBe(500);
  });

  /**
   * TCG-02..07 — UI chains. The new order entry IS driveable by the harness:
   *   - Sample Type is a native <select id="sampleType-0"> → use page.selectOption('#sampleType-0', '2')
   *     (Playwright's selectOption fires React onChange; in Chrome the §6.1 native-setter + 'change' does the same).
   *   - Panel/skip-storage are Carbon checkboxes → check via the DOM setter + 'change' (no 60s hang here),
   *     or Playwright .check() with { force: true } after asserting visibility.
   * Verified 2026-07-06: selecting Serum populated panels+tests; selecting the "Bilan Biochimique" panel
   * pulled its tests (incl. catalog-linked QA test 379) onto the order; wizard saved to Sample Item ID 3.
   * TCG-02 below is implementable now (was wrongly thought harness-blocked); left as fixme only until the
   * Results-Entry value-entry selectors are pinned against a test whose ranges cover the patient's age.
   */
  // VERIFIED MANUALLY 2026-07-06 (end-to-end): editor range (Normal 5-100 / Critical 2-150 on test 379)
  //  -> new /order/enter Clinical order (panel "Bilan Biochimique" pulls 379 onto the order) -> sample placed
  //  -> Results > By Unit (Biochemistry) shows the test with "Normal Range 5.000-100.0" (the configured range)
  //  -> entering 42 = no flag (white), 120 = yellow abnormal, 2 = yellow abnormal. Range drives flagging.
  // CRITICAL-INDICATOR GAP (OGC-1121, verified 2026-07-07): a value beyond the CRITICAL range (200 > critical-high 150)
  //  renders the SAME yellow (rgb(255,255,160), aria-invalid=null, no icon/title) as a merely-abnormal value (120).
  //  No distinct critical indicator at result entry. Downstream (validation/report/HH-LL flag) unverified — session timed out.
  // Automatable outline (pin the abnormal-cell CSS class before enabling):
  test.fixme('TCG-02: ranges -> Results Entry flags (patient safety) [verified manually]', async ({ page }) => {
    // 1) Editor: /TestCatalogEditor/<id>/ranges -> Add/Edit range Normal 5-100 Critical 2-150, Any age -> section Save.
    // 2) /order/enter: Sample Category Clinical; select patient; page.selectOption('#sampleType-0', '2') (Serum);
    //    select panel/test; fill Qty + collection date; Save&Next -> Label&Store skip-storage -> Save.
    // 3) /LogbookResults: page.selectOption('#unitType', '56') (Biochemistry); locate the QA test row;
    //    assert the "Normal Range" cell shows the configured range; type 42 -> assert result cell NOT flagged;
    //    120 -> assert abnormal (yellow) flag; 2 -> assert abnormal flag. Do NOT click Accept (overwrites state).
    // 4) Restore the test's original ranges.
  });
  test.fixme('TCG-03: result type -> Results Entry control renders per config', async () => {
    // Numeric -> number field; dictionary -> dropdown; titer -> titer field; multi-select -> multi control.
  });
  test.fixme('TCG-04: panels -> Worklist / order-by-panel', async () => {});
  test.fixme('TCG-06: display order -> order-entry test order', async () => {});
  test.fixme('TCG-07: localization -> runtime label (fr/id) in Order + Results', async () => {});
});
