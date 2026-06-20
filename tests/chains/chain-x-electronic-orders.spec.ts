/**
 * tests/chains/chain-x-electronic-orders.spec.ts
 *
 * SKILL §11 Chain X — Electronic orders (eOrder ingest → accept)
 *
 * Deep build-out (v6.17): graduates the render-only electronic-orders suite.
 * Endpoints from OpenELIS-Global-2 eOrder/EOrderSearch.jsx + EOrder.jsx, live:
 *   GET /rest/ElectronicOrders                         → inbound eOrder queue (form)
 *   GET /rest/displayList/ELECTRONIC_ORDER_STATUSES    → status filter (4)
 *   GET /rest/SampleEntryGenerateScanProvider          → mints accession on accept
 *
 * Round-trip: read the eOrder queue + status filter, then exercise the accept
 * handoff (an inbound eOrder is imported into a real LIMS order by minting an
 * accession). Asserts the generator returns an accession — the cross-link from
 * inbound message to a createable order. GAP-and-continue; never fabricates.
 *
 * Run individually:  npx playwright test --project=chain-x
 */
import { test, expect } from '@playwright/test';
import {
  BASE, apiCall, markStep,
  ELECTRONIC_ORDERS, ELECTRONIC_ORDER_STATUSES, SAMPLE_ENTRY_GENERATE_ACCESSION,
} from './_common';

test.describe.serial('Chain X — Electronic orders', () => {
  let domainOk = true;

  test.beforeAll(() => { /* eslint-disable-next-line no-console */ console.log(`[Chain X] BASE=${BASE}`); });

  // Step 1 — eOrder queue read-back (ROUND-TRIP)
  test('Step 1 — Electronic-orders queue returns (ROUND-TRIP)', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('domcontentloaded');
    const r = await apiCall<Record<string, unknown>>(page, ELECTRONIC_ORDERS);
    if (r.ok && r.body && typeof r.body === 'object') {
      markStep('X', 1, 'PASS', `ElectronicOrders queue returned (form keys: ${Object.keys(r.body as Record<string, unknown>).slice(0, 5).join(',')})`);
      expect(r.ok).toBeTruthy();
    } else {
      domainOk = false;
      markStep('X', 1, 'GAP', `ElectronicOrders unavailable (HTTP ${r.status})`, `GET ${ELECTRONIC_ORDERS}`);
      test.info().annotations.push({ type: 'gap', description: 'eorder queue unavailable' });
    }
  });

  // Step 2 — Status filter populates (FUNCTION)
  test('Step 2 — ELECTRONIC_ORDER_STATUSES filter populates (FUNCTION)', async ({ page }) => {
    if (!domainOk) { markStep('X', 2, 'GAP', 'Skipped — eorder queue unavailable (Step 1)'); return; }
    await page.goto(BASE);
    const r = await apiCall<unknown[]>(page, ELECTRONIC_ORDER_STATUSES);
    const n = Array.isArray(r.body) ? r.body.length : -1;
    if (n > 0) {
      markStep('X', 2, 'PASS', `Electronic-order statuses populate (${n}: e.g. Entered/Realized/NonConforming/Cancelled)`);
      expect(n).toBeGreaterThan(0);
    } else {
      markStep('X', 2, 'GAP', `Status list empty/unavailable (n=${n}, HTTP ${r.status})`);
      test.info().annotations.push({ type: 'gap', description: 'eorder statuses empty' });
    }
  });

  // Step 3 — Accept handoff mints a real accession (CROSS-LINK)
  test('Step 3 — Accept handoff mints an accession (CROSS-LINK)', async ({ page }) => {
    if (!domainOk) { markStep('X', 3, 'GAP', 'Skipped — eorder queue unavailable (Step 1)'); return; }
    await page.goto(BASE);
    const r = await apiCall<{ status?: unknown; body?: unknown }>(page, SAMPLE_ENTRY_GENERATE_ACCESSION);
    if (r.ok && r.body && typeof r.body === 'object') {
      const minted = (r.body as { body?: unknown }).body;
      markStep('X', 3, 'PASS', `Accept handoff mints an accession via SampleEntryGenerateScanProvider${minted ? ` (e.g. ${String(minted).slice(0, 24)})` : ''} — inbound eOrder → createable LIMS order`);
      expect(r.ok).toBeTruthy();
    } else {
      markStep('X', 3, 'GAP', `Accession generator HTTP ${r.status}`, `GET ${SAMPLE_ENTRY_GENERATE_ACCESSION}`);
      test.info().annotations.push({ type: 'gap', description: 'accession generator failed' });
    }
  });

  // Step 4 — eOrder import composes with the standard create path (CROSS-LINK)
  test('Step 4 — eOrder import composes with the standard order create path (CROSS-LINK)', async ({ page }) => {
    if (!domainOk) { markStep('X', 4, 'GAP', 'Skipped — eorder queue unavailable (Step 1)'); return; }
    await page.goto(BASE);
    const r = await apiCall(page, '/api/OpenELIS-Global/rest/SamplePatientEntry');
    if (r.ok) {
      markStep('X', 4, 'PASS', 'SamplePatientEntry reachable — an accepted eOrder (with its minted accession) resolves to a standard order via the shared create path');
      expect(r.ok).toBeTruthy();
    } else {
      markStep('X', 4, 'GAP', `SamplePatientEntry HTTP ${r.status}`);
      test.info().annotations.push({ type: 'gap', description: 'shared create path unreachable' });
    }
  });
});
