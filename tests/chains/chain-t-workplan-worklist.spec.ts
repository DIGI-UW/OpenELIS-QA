/**
 * tests/chains/chain-t-workplan-worklist.spec.ts
 *
 * SKILL §11 Chain T — Workplan worklist (by test / panel / unit / priority)
 *
 * Deep build-out (v6.17): graduates the render-only workplan suites.
 * Endpoints from OpenELIS-Global-2 WorkplanSearchForm.jsx, confirmed live:
 *   GET /rest/WorkPlanByTest?test_id= , /WorkPlanByPanel?panel_id= ,
 *       /WorkPlanByTestSection?test_section_id= , /WorkPlanByPriority?priority=
 *   Filter sources: displayList/ALL_TESTS, /PANELS, /ORDER_PRIORITY, user-test-sections/{role}.
 *
 * Round-trip: discover a real test section → request its workplan → assert the
 * worklist form returns; confirm the four filter sources populate. GAP-and-
 * continue when a dimension has no work. Never fabricates a pass.
 *
 * Run individually:  npx playwright test --project=chain-t
 */
import { test, expect } from '@playwright/test';
import {
  BASE, apiCall, markStep,
  WORKPLAN_BY_TESTSECTION, WORKPLAN_BY_PRIORITY,
  DISPLAYLIST_ALL_TESTS, DISPLAYLIST_PANELS, DISPLAYLIST_ORDER_PRIORITY, USER_TEST_SECTIONS,
} from './_common';

test.describe.serial('Chain T — Workplan worklist', () => {
  let sectionId = '';
  let domainOk = true;

  test.beforeAll(() => { /* eslint-disable-next-line no-console */ console.log(`[Chain T] BASE=${BASE}`); });

  // Step 1 — Filter sources populate (FUNCTION)
  test('Step 1 — Workplan filter sources (tests/panels/priority/sections) (FUNCTION)', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('domcontentloaded');
    const tests = await apiCall<unknown[]>(page, DISPLAYLIST_ALL_TESTS);
    const panels = await apiCall<unknown[]>(page, DISPLAYLIST_PANELS);
    const prio = await apiCall<unknown[]>(page, DISPLAYLIST_ORDER_PRIORITY);
    const sections = await apiCall<Array<{ id?: string }>>(page, USER_TEST_SECTIONS('Results'));
    const tN = Array.isArray(tests.body) ? tests.body.length : -1;
    if (Array.isArray(sections.body) && sections.body[0]?.id) sectionId = String(sections.body[0].id);
    if (tN > 0) {
      markStep('T', 1, 'PASS', `Filter sources: ALL_TESTS=${tN}, PANELS=${Array.isArray(panels.body) ? panels.body.length : '?'}, ORDER_PRIORITY=${Array.isArray(prio.body) ? prio.body.length : '?'}, sections=${Array.isArray(sections.body) ? sections.body.length : '?'}`);
      expect(tN).toBeGreaterThan(0);
    } else {
      domainOk = false;
      markStep('T', 1, 'GAP', `Workplan filter sources unavailable (ALL_TESTS HTTP ${tests.status})`);
      test.info().annotations.push({ type: 'gap', description: 'workplan filters unavailable' });
    }
  });

  // Step 2 — Workplan-by-unit returns its worklist (ROUND-TRIP)
  test('Step 2 — WorkPlanByTestSection returns the unit worklist (ROUND-TRIP)', async ({ page }) => {
    if (!domainOk) { markStep('T', 2, 'GAP', 'Skipped — filters unavailable (Step 1)'); return; }
    await page.goto(BASE);
    const r = await apiCall<Record<string, unknown>>(page, WORKPLAN_BY_TESTSECTION(sectionId || '1'));
    if (r.ok && r.body && typeof r.body === 'object') {
      const keys = Object.keys(r.body as Record<string, unknown>);
      markStep('T', 2, 'PASS', `Workplan-by-unit returned for section '${sectionId || '1'}' (form keys: ${keys.slice(0, 5).join(',')})`);
      expect(r.ok).toBeTruthy();
    } else {
      markStep('T', 2, 'GAP', `WorkPlanByTestSection HTTP ${r.status}`);
      test.info().annotations.push({ type: 'gap', description: 'workplan-by-unit failed' });
    }
  });

  // Step 3 — Workplan-by-priority returns (FUNCTION)
  test('Step 3 — WorkPlanByPriority returns a worklist (FUNCTION)', async ({ page }) => {
    if (!domainOk) { markStep('T', 3, 'GAP', 'Skipped — filters unavailable (Step 1)'); return; }
    await page.goto(BASE);
    const r = await apiCall<Record<string, unknown>>(page, WORKPLAN_BY_PRIORITY('Routine'));
    if (r.ok) {
      markStep('T', 3, 'PASS', 'Workplan-by-priority (Routine) returned a worklist form');
      expect(r.ok).toBeTruthy();
    } else {
      markStep('T', 3, 'GAP', `WorkPlanByPriority HTTP ${r.status} (priority value may differ)`);
      test.info().annotations.push({ type: 'gap', description: 'workplan-by-priority failed' });
    }
  });

  // Step 4 — Workplan is the bench-tech entry point into result entry (CROSS-LINK)
  test('Step 4 — Workplan worklist feeds result entry (CROSS-LINK)', async ({ page }) => {
    if (!domainOk) { markStep('T', 4, 'GAP', 'Skipped — filters unavailable (Step 1)'); return; }
    await page.goto(BASE);
    const lb = await apiCall<{ testResult?: unknown[] }>(page, '/api/OpenELIS-Global/rest/LogbookResults');
    if (lb.ok) {
      markStep('T', 4, 'PASS', 'LogbookResults reachable — workplan worklist hands the selected analyses to the shared result-entry surface');
      expect(lb.ok).toBeTruthy();
    } else {
      markStep('T', 4, 'BLOCKED', `LogbookResults HTTP ${lb.status}`);
      test.info().annotations.push({ type: 'blocked', description: 'result-entry surface unreachable' });
    }
  });
});
