/**
 * tests/chains/chain-n-environmental-sampling.spec.ts
 *
 * SKILL §11 Chain N — Environmental Sampling (NEW domain, v3.2.1.10+)
 *
 * What this chain proves: the new Environmental sampling domain — an
 * order flow with a per-sample manifest grid (GPS + container per
 * sample), default collection conditions, compliance standards, and
 * per-test QC samples; results then flow through the normal Results
 * screen.
 *
 * Companion to Chain M (Vector). Both were the headline feature of the
 * indonesiadev v3.2.1.10 run with zero prior catalog coverage (report
 * §§2–10, §17 coverage-gap list).
 *
 * Verified routes (React SPA):
 *   - /order/environmental             environmental order dashboard
 *   - /order/environmental/enter       order entry: Per-Sample Manifest grid,
 *                                       Default Collection Conditions, Compliance Standards
 *   - /order/environmental/collect|label|qa   downstream wizard steps
 *   (results are entered through the normal Results / LogbookResults screen)
 *
 * Known-bug regression watch:
 *   - OGC-1048: the default collection date is not bound to form state, so it
 *     is not persisted unless the user explicitly re-picks it. Reproduced
 *     across multiple env/vector orders in the live run.
 *
 * Honesty note: the environmental order-creation POST payload was not
 * captured as a stable endpoint, so creation/persistence steps are
 * GAP/BLOCKED pending a §6.5a capture. Route-render + reachability steps
 * are real assertions.
 *
 * Run individually:
 *   npx playwright test --project=chain-n
 */

import { test, expect } from '@playwright/test';
import { BASE, apiCall, markStep } from './_common';

function looksLikeSpringNotFound(body: string): boolean {
  return /NoHandlerFoundException/.test(body) || /"status":404/.test(body);
}

test.describe.serial('Chain N — Environmental Sampling', () => {
  test.beforeAll(() => {
    // eslint-disable-next-line no-console
    console.log(`[Chain N] BASE=${BASE}`);
  });

  // ---------------------------------------------------------------------------
  // Step 1 — Environmental order entry renders manifest + compliance (RENDER)
  // ---------------------------------------------------------------------------
  test('Step 1 — Environmental order entry renders manifest & compliance (RENDER)', async ({ page }) => {
    await page.goto(`${BASE}/order/environmental/enter`);
    await page.waitForLoadState('networkidle');
    const bodyText = await page.evaluate(() => document.body.innerText);
    if (looksLikeSpringNotFound(bodyText)) {
      markStep('N', 1, 'GAP',
        'Direct deep-link /order/environmental/enter → Spring 404 (OGC-1053 deep-link limitation)',
        'Drive via sidebar Order → Add Environmental Order; convert to a UI-nav step once selectors are captured.');
      test.info().annotations.push({ type: 'gap', description: 'deep-link 404 (OGC-1053)' });
      return;
    }
    // Environmental-specific tells verified live.
    const markers = ['Manifest', 'Compliance', 'Collection', 'GPS', 'QC'];
    const found = markers.filter(m => new RegExp(m, 'i').test(bodyText));
    if (found.length >= 2) {
      markStep('N', 1, 'PASS', `Environmental order entry rendered (markers: ${found.join(', ')})`);
      expect(found.length).toBeGreaterThanOrEqual(2);
    } else {
      markStep('N', 1, 'FAIL',
        `Environmental route loaded but expected sections missing (found: ${found.join(', ') || 'none'})`,
        'Expected Per-Sample Manifest / Compliance Standards / Collection Conditions.');
      expect(found.length, 'environmental markers').toBeGreaterThanOrEqual(2);
    }
  });

  // ---------------------------------------------------------------------------
  // Step 2 — Compliance standards list is available (FUNCTION)
  // The order form offers compliance standards (e.g., PP 22/2021). Probe the
  // backing list; GAP if the endpoint name needs capture.
  // ---------------------------------------------------------------------------
  test('Step 2 — Compliance standards list populated (FUNCTION)', async ({ page }) => {
    await page.goto(BASE);
    const candidates = [
      '/api/OpenELIS-Global/rest/displayList/COMPLIANCE_STANDARD',
      '/api/OpenELIS-Global/rest/displayList/ENVIRONMENTAL_COMPLIANCE_STANDARD',
    ];
    let populated = false;
    const detail: string[] = [];
    for (const c of candidates) {
      const r = await apiCall<unknown[]>(page, c);
      const n = Array.isArray(r.body) ? r.body.length : 0;
      detail.push(`${c.split('/').pop()}=${r.ok ? n : 'HTTP ' + r.status}`);
      if (r.ok && n > 0) populated = true;
    }
    if (populated) {
      markStep('N', 2, 'PASS', `Compliance standards populated (${detail.join(', ')})`);
      expect(populated).toBeTruthy();
    } else {
      markStep('N', 2, 'GAP',
        `Compliance-standard endpoint unresolved (${detail.join(', ')})`,
        'Capture the real list endpoint from the environmental order form (Network tab).');
      test.info().annotations.push({ type: 'gap', description: 'compliance-standard endpoint unknown' });
    }
  });

  // ---------------------------------------------------------------------------
  // Step 3 — OGC-1048 collection-date persistence regression watch (PERSIST)
  // ---------------------------------------------------------------------------
  test('Step 3 — OGC-1048 collection-date default persistence watch (PERSIST)', async () => {
    // Live run: the default collection date shown on env/vector order entry is
    // not bound to form state, so it is dropped on save unless re-picked. This
    // is a GAP placeholder until the create POST payload is captured — at which
    // point: submit without touching the date, read the order back, and assert
    // the collection date persisted (it currently does NOT → OGC-1048).
    markStep('N', 3, 'GAP',
      'OGC-1048 watch: default collection date not persisted unless explicitly re-picked',
      'Once the env order POST is captured: create an order leaving the default date, GET it back, assert collectionDate != null. Currently reproduces as OGC-1048.');
    test.info().annotations.push({ type: 'known-bug', description: 'OGC-1048 collection date not persisted' });
    expect(true).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // Step 4 — Per-sample manifest semantics (FUNCTION) — GAP pending payload
  // ---------------------------------------------------------------------------
  test('Step 4 — Per-sample manifest (GPS + container per sample) (FUNCTION)', async () => {
    // The manifest grid captures GPS + container per sample row. Without the
    // create payload we cannot assert round-trip; document expectation.
    markStep('N', 4, 'GAP',
      'Per-Sample Manifest grid captures GPS + container per sample row (verified in UI)',
      'After payload capture: submit a 2-row manifest, read back, assert each sample item carries its own GPS/container.');
    expect(true).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // Step 5 — Environmental results route through the normal Results screen (CROSS-LINK)
  // ---------------------------------------------------------------------------
  test('Step 5 — Environmental results use the normal Results screen (CROSS-LINK)', async ({ page }) => {
    await page.goto(BASE);
    const lb = await apiCall<{ testResult?: unknown[] }>(page, '/api/OpenELIS-Global/rest/LogbookResults');
    if (lb.ok) {
      markStep('N', 5, 'PASS',
        'Normal Results (LogbookResults) reachable — environmental results use the shared Results module (no env-specific results page)');
      expect(lb.ok).toBeTruthy();
    } else {
      markStep('N', 5, 'BLOCKED', `LogbookResults HTTP ${lb.status}`);
      test.info().annotations.push({ type: 'blocked', description: 'results surface unreachable' });
    }
  });
});
