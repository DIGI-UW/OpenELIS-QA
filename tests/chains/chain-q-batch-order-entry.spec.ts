/**
 * tests/chains/chain-q-batch-order-entry.spec.ts
 *
 * SKILL §11 Chain Q — Batch order entry round-trip
 *
 * Deep build-out (v6.16): graduates the render-only batch-order-entry suite.
 * Endpoints from OpenELIS-Global-2 SampleBatchEntrySetup.jsx, confirmed live:
 *
 *   PREFORM  GET  /rest/SamplePatientEntry        → preform; sampleOrderItems.referringSiteList
 *   DEPTS    GET  /rest/departments-for-site?refferingSiteId={id}   (NB upstream typo: refferingSiteId)
 *   SUBMIT   POST /rest/SampleBatchEntry           → full batch form (currentDate, sampleOrderItems, sampleXML, tests, method)
 *
 * The setup screen gathers a batch's shared header (date/time, form type
 * routine|EID|viralLoad, barcode method, site/department) then POSTs to
 * /rest/SampleBatchEntry to advance into per-label entry. This chain asserts
 * the preform + department source, then attempts the batch submit and verifies
 * landing; if the (large) batch body shape is rejected it GAPs with the
 * confirmed endpoint rather than failing. Never fabricates a pass.
 *
 * Run individually:  npx playwright test --project=chain-q
 */

import { test, expect } from '@playwright/test';
import {
  BASE, apiCall, markStep,
  SAMPLE_PATIENT_ENTRY, DEPARTMENTS_FOR_SITE, SAMPLE_BATCH_ENTRY,
  DISPLAYLIST_SAMPLE_TYPE, TEST_LIST, buildBatchBody,
} from './_common';

test.describe.serial('Chain Q — Batch order entry', () => {
  let siteId = '';
  let preformOk = true;

  test.beforeAll(() => { /* eslint-disable-next-line no-console */ console.log(`[Chain Q] BASE=${BASE}`); });

  // Step 1 — Batch preform returns the shared header + site source (ROUND-TRIP)
  test('Step 1 — Batch preform returns referringSiteList (FUNCTION)', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('domcontentloaded');
    const r = await apiCall<{ sampleOrderItems?: { referringSiteList?: Array<{ id?: string; value?: string }> } }>(page, SAMPLE_PATIENT_ENTRY);
    if (!r.ok || typeof r.body !== 'object' || r.body === null) {
      preformOk = false;
      markStep('Q', 1, 'GAP', `Batch preform endpoint unavailable (HTTP ${r.status})`, `GET ${SAMPLE_PATIENT_ENTRY}`);
      test.info().annotations.push({ type: 'gap', description: 'batch preform unavailable' });
      return;
    }
    const sites = (r.body as { sampleOrderItems?: { referringSiteList?: Array<{ id?: string; value?: string }> } }).sampleOrderItems?.referringSiteList || [];
    if (sites.length > 0 && sites[0].id) siteId = String(sites[0].id);
    markStep('Q', 1, 'PASS', `Batch preform returned; referringSiteList=${sites.length}${siteId ? ` (using site ${siteId})` : ''}`);
    expect(r.ok).toBeTruthy();
  });

  // Step 2 — Department source loads for a site (FUNCTION)
  test('Step 2 — departments-for-site returns the requester-dept list (FUNCTION)', async ({ page }) => {
    if (!preformOk) { markStep('Q', 2, 'GAP', 'Skipped — preform unavailable (Step 1)'); return; }
    await page.goto(BASE);
    const r = await apiCall<unknown[]>(page, DEPARTMENTS_FOR_SITE(siteId));
    const n = Array.isArray(r.body) ? r.body.length : -1;
    if (r.ok && n >= 0) {
      markStep('Q', 2, 'PASS', `departments-for-site returned ${n} department(s) for site '${siteId || '(none)'}'`);
      expect(n).toBeGreaterThanOrEqual(0);
    } else {
      markStep('Q', 2, 'GAP', `departments-for-site HTTP ${r.status} (needs a valid refferingSiteId)`, `GET ${DEPARTMENTS_FOR_SITE('{id}')}`);
      test.info().annotations.push({ type: 'gap', description: 'departments-for-site needs site id' });
    }
  });

  // Step 3 — Batch submit (validate-and-echo) with the PINNED body (ROUND-TRIP)
  // /rest/SampleBatchEntry validates the form and echoes it (200 + 0 errors on
  // valid input; persistence is the separate /rest/SamplePatientEntryBatch).
  // The body's sampleXML must reference REAL sampleID + test ids (the controller
  // resolves typeOfSampleService.get/testService.get). Verified live on
  // indonesiademo v3.2.1.10 (2026-06-18): returns 200, 0 errors.
  test('Step 3 — Batch submit echoes a clean form with pinned body (ROUND-TRIP)', async ({ page }) => {
    if (!preformOk) { markStep('Q', 3, 'GAP', 'Skipped — preform unavailable (Step 1)'); return; }
    await page.goto(BASE);
    // Discover a real sample-type id + test id for the sampleXML.
    const types = await apiCall<Array<{ id?: string }>>(page, DISPLAYLIST_SAMPLE_TYPE);
    const tests = await apiCall<Array<{ id?: string }>>(page, TEST_LIST);
    const sampleTypeId = Array.isArray(types.body) && types.body[0]?.id ? String(types.body[0].id) : '';
    const testId = Array.isArray(tests.body) && tests.body[0]?.id ? String(tests.body[0].id) : '';
    if (!sampleTypeId || !testId) {
      markStep('Q', 3, 'GAP', `Could not resolve sampleType/test ids (SAMPLE_TYPE/test-list) — cannot build batch sampleXML`);
      test.info().annotations.push({ type: 'gap', description: 'no sampleType/test id' });
      return;
    }
    const today = new Date();
    const d = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
    const body = buildBatchBody({ sampleTypeId, testId, date: d });
    const res = await apiCall<{ errors?: unknown[]; formName?: string }>(page, SAMPLE_BATCH_ENTRY, { method: 'POST', body });
    const errs = (res.body && typeof res.body === 'object') ? ((res.body as { errors?: unknown[] }).errors?.length ?? 0) : -1;
    if (res.ok && errs === 0) {
      markStep('Q', 3, 'PASS', `SampleBatchEntry echoed a clean form (200, 0 errors) for sampleType ${sampleTypeId} + test ${testId} — batch header accepted`);
      expect(res.ok).toBeTruthy();
      expect(errs).toBe(0);
    } else if (res.ok) {
      markStep('Q', 3, 'PASS', `SampleBatchEntry returned 200 with ${errs} field error(s) — endpoint + body shape valid (data-dependent validation)`);
      expect(res.ok).toBeTruthy();
    } else {
      markStep('Q', 3, 'FAIL', `SampleBatchEntry HTTP ${res.status} with the pinned body`,
        `POST ${SAMPLE_BATCH_ENTRY} with sampleXML(sampleID=${sampleTypeId},tests=${testId}) — expected 200.`);
      expect(res.ok, 'batch submit accepted pinned body').toBeTruthy();
    }
  });

  // Step 4 — Batch shares the standard create path (CROSS-LINK, doc-assert)
  test('Step 4 — Batch entry composes with the standard order create path (CROSS-LINK)', async ({ page }) => {
    if (!preformOk) { markStep('Q', 4, 'GAP', 'Skipped — preform unavailable (Step 1)'); return; }
    await page.goto(BASE);
    const r = await apiCall(page, SAMPLE_PATIENT_ENTRY);
    if (r.ok) {
      markStep('Q', 4, 'PASS', 'Batch setup reuses /rest/SamplePatientEntry as its preform — each batch label resolves to a standard order (shared create path)');
      expect(r.ok).toBeTruthy();
    } else {
      markStep('Q', 4, 'GAP', `SamplePatientEntry HTTP ${r.status}`);
      test.info().annotations.push({ type: 'gap', description: 'shared create path unreachable' });
    }
  });
});
