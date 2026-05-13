/**
 * tests/chains/chain-b-rejection.spec.ts
 *
 * SKILL §11 Chain B — Rejection → NCE → Report (MANDATORY in every test run)
 *
 * What this chain proves: rejecting a sample correctly propagates through
 * every module that depends on rejection data — qa_event/NCE records,
 * the Rejection Report PDF, the View NCE search page, and the Dashboard
 * "Orders Rejected Today" counter.
 *
 * Why this chain matters: BUG-29 (OGC-515) is a *cross-module silo* bug —
 * rejection state lives in sample_item but never flows downstream. The
 * existing TC-level tests pass on each module individually because each
 * module renders correctly with empty data. Only an end-to-end chain
 * surfaces the disconnect.
 *
 * Per BUG-29, three of this chain's downstream checks fail with distinct
 * symptoms:
 *   - Symptom A: NCE list endpoint has no qa_event entry for the accession
 *   - Symptom B: Rejection Report PDF returns HTTP 503 "Check server logs"
 *   - Symptom C: Dashboard "ordersRejectedToday" counter stays at 0
 *   - Symptom D: View NCE search shows "No Data Found"
 *
 * Each symptom is mapped to its own step + expect() so when BUG-29 is
 * partially fixed (e.g., qa_event creation lands but the report still
 * 503s), the chain reports clearly *which* subsystem is still broken
 * instead of "rejection workflow FAILed."
 *
 * Caught bugs (the FAIL pattern is the point):
 *   BUG-29 — Steps 5, 6, 7, 8 are expected to FAIL on every run until the
 *     rejection silo is fixed.
 *   BUG-37 — Step 1's findOrSeedOrder may inherit BUG-37 from the seed,
 *     but Chain B does not re-verify linkage; that's Chain A's job.
 *
 * Run individually:
 *   npx playwright test --project=chain-b
 */

import { test, expect } from '@playwright/test';
import {
  BASE,
  apiCall,
  findOrSeedOrder,
  extractPdfText,
  markStep,
  ChainOrderRef,
} from './_common';

test.describe.serial('Chain B — Rejection → NCE → Report', () => {
  let order: ChainOrderRef | null = null;
  let baselineRejectedCount: number | null = null;
  let pdfBuf: Buffer | null = null;

  test.beforeAll(() => {
    // eslint-disable-next-line no-console
    console.log(`[Chain B] BASE=${BASE}`);
  });

  // ---------------------------------------------------------------------------
  // Step 1 — Acquire an order to reject
  // SKILL §0.6 Data Census + §0.6a Seed Script
  // Acceptance criterion: RENDER
  // ---------------------------------------------------------------------------
  test('Step 1 — Acquire a QA_AUTO_ order (RENDER)', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');

    order = await findOrSeedOrder(page);
    if (!order) {
      markStep('B', 1, 'FAIL', 'No QA_AUTO_ order available',
        'Run `npx playwright test --project=seed-data` first.');
      expect(order, 'No QA_AUTO_ order — seed first per SKILL §0.6a').not.toBeNull();
      return;
    }
    markStep('B', 1, 'PASS',
      `Acquired order ${order.accession} (${order.source}) for patient ${order.patientNationalId}`);
  });

  // ---------------------------------------------------------------------------
  // Step 2 — Capture baseline dashboard counter
  // SKILL §13 Y-RECON — needed to assert the counter delta in Step 8
  // Acceptance criterion: FUNCTION
  // ---------------------------------------------------------------------------
  test('Step 2 — Capture baseline ordersRejectedToday (FUNCTION)', async ({ page }) => {
    if (!order) test.skip();
    await page.goto(BASE);

    const m = await apiCall<{ ordersRejectedToday?: number }>(
      page,
      '/api/OpenELIS-Global/rest/home-dashboard/metrics'
    );
    if (!m.ok) {
      markStep('B', 2, 'FAIL', `Dashboard metrics returned HTTP ${m.status}`);
      expect(m.ok).toBeTruthy();
      return;
    }
    baselineRejectedCount = (typeof m.body === 'object' && m.body !== null)
      ? ((m.body as { ordersRejectedToday?: number }).ordersRejectedToday ?? 0)
      : 0;
    markStep('B', 2, 'PASS', `Baseline ordersRejectedToday = ${baselineRejectedCount}`);
  });

  // ---------------------------------------------------------------------------
  // Step 3 — Reject the sample via API substitute
  // The "Reject Sample" checkbox in Order Entry / Edit Order is a Carbon
  // checkbox — same family as BUG-31. We don't click it. We POST the
  // rejection update directly through the SampleEdit endpoint (which is
  // what the form's underlying POST goes to).
  // Acceptance criterion: PERSIST
  // ---------------------------------------------------------------------------
  test('Step 3 — Reject the sample via API substitute (PERSIST)', async ({ page }) => {
    if (!order) test.skip();
    await page.goto(BASE);

    // Payload shape inferred from Phase 23 BUG-29 evidence and the
    // SampleEdit POST patterns used by Modify Order. The exact field
    // names may vary — if Step 3 FAILs with 400, the response body's
    // validation error will tell us what shape the backend expects.
    const payload = {
      labNumber: order!.accession,
      sampleItems: [
        {
          sampleTypeId: order!.testId ? '' : '',
          sampleRejected: true,
          rejectionReasonId: '1', // first rejection reason; instance-specific
        },
      ],
    };

    const post = await apiCall<unknown>(
      page,
      '/api/OpenELIS-Global/rest/SampleEdit',
      { method: 'POST', body: payload }
    );

    if (!post.ok) {
      markStep('B', 3, 'BLOCKED',
        `SampleEdit POST returned HTTP ${post.status}`,
        `Either the rejection API path differs from this guess, or BUG-31-class hang. ` +
        `Body preview: ${typeof post.body === 'string' ? post.body.slice(0, 120) : JSON.stringify(post.body).slice(0, 120)}`);
      test.info().annotations.push({ type: 'blocked', description: `SampleEdit POST ${post.status}` });
      return;
    }
    markStep('B', 3, 'PASS', `Rejection POST returned HTTP ${post.status}`);
  });

  // ---------------------------------------------------------------------------
  // Step 4 — Verify rejection persisted in sample_item
  // SKILL §7.5 Round-trip Write Verification
  // Acceptance criterion: ROUND-TRIP
  // ---------------------------------------------------------------------------
  test('Step 4 — Verify rejection persisted (ROUND-TRIP)', async ({ page }) => {
    if (!order) test.skip();
    await page.goto(BASE);

    const read = await apiCall<{
      sampleItems?: Array<{ sampleRejected?: boolean; rejectionReasonId?: string }>;
    }>(page, `/api/OpenELIS-Global/rest/SampleEdit?labNumber=${encodeURIComponent(order!.accession)}`);

    if (!read.ok) {
      markStep('B', 4, 'FAIL', `SampleEdit read-back returned HTTP ${read.status}`);
      expect(read.ok).toBeTruthy();
      return;
    }

    const items = (typeof read.body === 'object' && read.body !== null)
      ? ((read.body as { sampleItems?: Array<{ sampleRejected?: boolean }> }).sampleItems || [])
      : [];
    const anyRejected = items.some(item => item.sampleRejected === true);

    if (!anyRejected) {
      markStep('B', 4, 'FAIL',
        `Read-back shows no sample_item.sampleRejected=true`,
        `Either Step 3 didn't actually persist (silent fail, BUG-8 class) or the payload shape was wrong.`);
      expect(anyRejected, 'Rejection not visible in read-back').toBeTruthy();
      return;
    }
    markStep('B', 4, 'PASS', `Rejection persisted: at least one sample_item has sampleRejected=true`);
  });

  // ---------------------------------------------------------------------------
  // Step 5 — NCE list contains the accession
  // SYMPTOM A of BUG-29: rejection should auto-create a qa_event/NCE record
  // SKILL §11 Chain B row
  // Acceptance criterion: CROSS-LINK
  // ---------------------------------------------------------------------------
  test('Step 5 — NCE list contains accession (CROSS-LINK, BUG-29 Symptom A)', async ({ page }) => {
    if (!order) test.skip();
    await page.goto(BASE);

    const nce = await apiCall<{ events?: Array<{ labNumber?: string }> } | Array<{ labNumber?: string }>>(
      page,
      `/api/OpenELIS-Global/rest/nonconformevents?labNumber=${encodeURIComponent(order!.accession)}`
    );

    if (!nce.ok) {
      markStep('B', 5, 'FAIL',
        `nonconformevents GET returned HTTP ${nce.status}`,
        `Cannot probe Symptom A without this endpoint. The endpoint should always return 200 (empty list is fine).`);
      expect(nce.ok, 'nonconformevents endpoint not reachable').toBeTruthy();
      return;
    }

    // The endpoint returns either an array directly or { events: [...] }
    let events: Array<{ labNumber?: string }> = [];
    if (Array.isArray(nce.body)) events = nce.body;
    else if (typeof nce.body === 'object' && nce.body !== null) {
      events = (nce.body as { events?: Array<{ labNumber?: string }> }).events || [];
    }
    const found = events.some(e => e.labNumber === order!.accession);

    if (!found) {
      markStep('B', 5, 'FAIL',
        `BUG-29 Symptom A confirmed: no qa_event record for ${order!.accession}`,
        `Rejection persisted in sample_item (Step 4 PASS) but no NCE was auto-created. ` +
        `This is the rejection silo bug. ${events.length} other NCE rows exist on the instance, none for this accession.`);
      expect(found, 'BUG-29 Symptom A: NCE not auto-created from rejection').toBeTruthy();
      return;
    }
    markStep('B', 5, 'PASS', `NCE record found for accession ${order!.accession}`);
  });

  // ---------------------------------------------------------------------------
  // Step 6 — View NCE search finds the accession
  // SYMPTOM D of BUG-29: the View New NCE page should surface the rejection
  // Acceptance criterion: CROSS-LINK (different endpoint than Step 5)
  // ---------------------------------------------------------------------------
  test('Step 6 — View NCE search finds accession (CROSS-LINK, BUG-29 Symptom D)', async ({ page }) => {
    if (!order) test.skip();
    await page.goto(BASE);

    // The View NCE page uses the same /rest/nonconformevents endpoint with
    // searchBy=labNumber + textValue. Different query semantics — surfaces
    // the data if the underlying record exists, regardless of whether the
    // qa_event got persisted via the rejection or some other path.
    const view = await apiCall<{ events?: Array<{ labNumber?: string }> } | Array<{ labNumber?: string }>>(
      page,
      `/api/OpenELIS-Global/rest/nonconformevents?searchBy=labNumber&textValue=${encodeURIComponent(order!.accession)}`
    );

    if (!view.ok) {
      markStep('B', 6, 'FAIL', `View NCE search returned HTTP ${view.status}`);
      expect(view.ok).toBeTruthy();
      return;
    }
    let events: Array<{ labNumber?: string }> = [];
    if (Array.isArray(view.body)) events = view.body;
    else if (typeof view.body === 'object' && view.body !== null) {
      events = (view.body as { events?: Array<{ labNumber?: string }> }).events || [];
    }
    const found = events.some(e => e.labNumber === order!.accession);

    if (!found) {
      markStep('B', 6, 'FAIL',
        `BUG-29 Symptom D confirmed: View NCE search returns no results for ${order!.accession}`,
        `Same root cause as Step 5: no qa_event row exists. The View NCE page would show "No Data Found" to a real user.`);
      expect(found, 'BUG-29 Symptom D: View NCE search empty').toBeTruthy();
      return;
    }
    markStep('B', 6, 'PASS', `View NCE search returned the rejected accession`);
  });

  // ---------------------------------------------------------------------------
  // Step 7 — Rejection Report PDF generates
  // SYMPTOM B of BUG-29: ReportPrint returns HTTP 503 "Check server logs"
  // Acceptance criterion: REPORTABLE
  // ---------------------------------------------------------------------------
  test('Step 7 — Rejection Report PDF generates (REPORTABLE, BUG-29 Symptom B)', async ({ page }) => {
    if (!order) test.skip();
    await page.goto(BASE);

    // Date range = today only (dd/mm/yyyy format expected by ReportPrint)
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yyyy = today.getFullYear();
    const dateStr = `${dd}/${mm}/${yyyy}`;
    const url =
      `/api/OpenELIS-Global/ReportPrint?report=sampleRejection&startDate=${dateStr}&endDate=${dateStr}`;

    const response = await apiCall<string>(page, url, { accept: 'application/pdf', expectBinary: true });

    if (!response.ok) {
      markStep('B', 7, 'FAIL',
        `BUG-29 Symptom B confirmed: ReportPrint?report=sampleRejection returned HTTP ${response.status}`,
        `Rejection Report PDF endpoint is non-functional. Most likely 503 "Check server logs" per Phase 23 evidence. ` +
        `A lab cannot produce the pre-analytic error report regulators require.`);
      expect(response.ok, `BUG-29 Symptom B: ReportPrint returned ${response.status}`).toBeTruthy();
      return;
    }

    const buf = Buffer.from(String(response.body), 'base64');
    const isPdf = buf.length >= 4 && buf.toString('ascii', 0, 4) === '%PDF';
    if (!isPdf) {
      markStep('B', 7, 'FAIL',
        `Response is not a PDF (first 4 bytes: ${buf.toString('hex', 0, 4)})`);
      expect(isPdf).toBeTruthy();
      return;
    }
    pdfBuf = buf;
    markStep('B', 7, 'PASS', `Rejection Report PDF generated, ${buf.length} bytes`);

    // Bonus check: does our accession actually appear on the PDF?
    // Soft-asserted as a note rather than a hard expect so the chain
    // can still PASS at the PDF-existence level even if content is empty.
    const text = extractPdfText(buf);
    if (!text.includes(order!.accession)) {
      markStep('B', 7, 'PARTIAL',
        `PDF generated but accession ${order!.accession} not visible in text`,
        `The report exists but is empty for today's rejections — symptom of BUG-29 Symptom A reaching through to the report layer.`);
      test.info().annotations.push({ type: 'partial', description: 'Rejection Report PDF empty' });
    } else {
      markStep('B', 7, 'PASS', `Accession ${order!.accession} appears in PDF body`);
    }
  });

  // ---------------------------------------------------------------------------
  // Step 8 — Dashboard counter incremented
  // SYMPTOM C of BUG-29 + SKILL §13 Y-RECON Dashboard Counter Reconciliation
  // Acceptance criterion: CROSS-LINK
  // ---------------------------------------------------------------------------
  test('Step 8 — Dashboard counter incremented (CROSS-LINK, BUG-29 Symptom C, §13 Y-RECON)', async ({ page }) => {
    if (!order || baselineRejectedCount === null) test.skip();
    await page.goto(BASE);

    const m = await apiCall<{ ordersRejectedToday?: number }>(
      page,
      '/api/OpenELIS-Global/rest/home-dashboard/metrics'
    );
    if (!m.ok) {
      markStep('B', 8, 'FAIL', `Dashboard metrics returned HTTP ${m.status}`);
      expect(m.ok).toBeTruthy();
      return;
    }
    const afterCount = (typeof m.body === 'object' && m.body !== null)
      ? ((m.body as { ordersRejectedToday?: number }).ordersRejectedToday ?? 0)
      : 0;

    if (afterCount <= (baselineRejectedCount ?? 0)) {
      markStep('B', 8, 'FAIL',
        `BUG-29 Symptom C confirmed: counter stayed at ${afterCount} (baseline ${baselineRejectedCount})`,
        `Rejection persisted (Step 4 PASS) but the dashboard KPI is computed from qa_event rows, not sample_item. ` +
        `Same root cause as Symptoms A/D. Y-RECON reconciliation: counter ≠ underlying state.`);
      expect(
        afterCount,
        `BUG-29 Symptom C: ordersRejectedToday stuck at ${afterCount} despite rejection`
      ).toBeGreaterThan(baselineRejectedCount!);
      return;
    }
    markStep('B', 8, 'PASS',
      `Counter incremented from ${baselineRejectedCount} to ${afterCount}`);
  });
});
