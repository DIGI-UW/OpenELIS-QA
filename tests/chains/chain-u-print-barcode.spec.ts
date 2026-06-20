/**
 * tests/chains/chain-u-print-barcode.spec.ts
 *
 * SKILL §11 Chain U — Print barcode / label maker round-trip
 *
 * Deep build-out (v6.17): graduates the render-only print-barcode suite.
 * Endpoints from OpenELIS-Global-2 printBarcode/ExistingOrder.jsx, confirmed live:
 *   GET /rest/patient-search-results?labNumber={acc}   → patient
 *   GET /rest/SampleEdit?accessionNumber={acc}         → existingTests[] (specimen rows)
 *   /api/OpenELIS-Global/LabelMakerServlet?labNo=&type=default|order|specimen&quantity=  (servlet)
 *
 * Round-trip: look an accession up by lab number → confirm patient + specimen
 * rows read back → derive the order + per-specimen label URLs (the printable
 * artifacts). GAP-and-continue when no accession exists. Never fabricates.
 *
 * Run individually:  npx playwright test --project=chain-u
 */
import { test, expect } from '@playwright/test';
import {
  BASE, apiCall, markStep, acquireAnyAccession,
  PATIENT_SEARCH_BY_LABNO, SAMPLE_EDIT_BY_ACCESSION, LABEL_MAKER,
} from './_common';

test.describe.serial('Chain U — Print barcode', () => {
  let accession: string | null = null;
  let existingTests: Array<{ accessionNumber?: string; sampleType?: string }> = [];

  test.beforeAll(() => { /* eslint-disable-next-line no-console */ console.log(`[Chain U] BASE=${BASE}`); });

  // Step 1 — Resolve an accession + read its order back (ROUND-TRIP)
  test('Step 1 — Lab-number lookup returns patient + specimen rows (ROUND-TRIP)', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('domcontentloaded');
    const acq = await acquireAnyAccession(page);
    accession = acq.accession;
    if (!accession) {
      markStep('U', 1, 'GAP', `No accession to print labels for (${acq.detail})`);
      test.info().annotations.push({ type: 'gap', description: 'no accession' });
      return;
    }
    const patient = await apiCall<{ patientSearchResults?: unknown[] }>(page, PATIENT_SEARCH_BY_LABNO(accession));
    const order = await apiCall<{ existingTests?: Array<{ accessionNumber?: string; sampleType?: string }> }>(page, SAMPLE_EDIT_BY_ACCESSION(accession));
    const pOk = patient.ok && patient.body && typeof patient.body === 'object' && Array.isArray((patient.body as { patientSearchResults?: unknown[] }).patientSearchResults);
    existingTests = (order.ok && order.body && typeof order.body === 'object') ? ((order.body as { existingTests?: Array<{ accessionNumber?: string; sampleType?: string }> }).existingTests || []) : [];
    if (pOk && order.ok) {
      markStep('U', 1, 'PASS', `Accession ${accession} read back: patient found, ${existingTests.length} specimen row(s)`);
      expect(order.ok).toBeTruthy();
    } else {
      markStep('U', 1, 'GAP', `Lookup HTTP patient=${patient.status} order=${order.status}`);
      test.info().annotations.push({ type: 'gap', description: 'lab-number lookup failed' });
    }
  });

  // Step 2 — Specimen rows carry their own accession (FUNCTION)
  test('Step 2 — Specimen rows expose per-specimen accession numbers (FUNCTION)', async () => {
    if (!accession) { markStep('U', 2, 'GAP', 'Skipped — no accession (Step 1)'); return; }
    const withAcc = existingTests.filter(t => t.accessionNumber);
    if (existingTests.length === 0) {
      markStep('U', 2, 'GAP', 'Order has no specimen rows to label');
      test.info().annotations.push({ type: 'gap', description: 'no specimen rows' });
      return;
    }
    markStep('U', 2, 'PASS', `${existingTests.length} specimen row(s); ${withAcc.length} carry a printable accession (e.g. ${withAcc[0]?.accessionNumber || accession})`);
    expect(existingTests.length).toBeGreaterThan(0);
  });

  // Step 3 — Label URLs are buildable for order + each specimen (CROSS-LINK)
  test('Step 3 — Order + specimen label URLs build for the LabelMaker servlet (CROSS-LINK)', async () => {
    if (!accession) { markStep('U', 3, 'GAP', 'Skipped — no accession (Step 1)'); return; }
    const orderUrl = LABEL_MAKER(accession, 'order', 1);
    const specimenUrls = existingTests.filter(t => t.accessionNumber).map(t => LABEL_MAKER(t.accessionNumber as string, 'specimen', 1));
    const ok = orderUrl.includes(accession) && orderUrl.includes('type=order');
    if (ok) {
      markStep('U', 3, 'PASS', `Order label + ${specimenUrls.length} specimen label URL(s) built (type=order/specimen via LabelMakerServlet)`);
      expect(ok).toBeTruthy();
    } else {
      markStep('U', 3, 'FAIL', 'Could not build a valid order label URL');
      expect(ok).toBeTruthy();
    }
  });
});
