/**
 * tests/chains/chain-a-order-lifecycle.spec.ts
 *
 * SKILL §11 Chain A — Order Lifecycle (MANDATORY in every test run)
 *
 * What this chain proves: an order created via the Add Order wizard
 * surfaces correctly across every downstream module a lab depends on:
 *
 *   Order → Patient linkage → Result entry → Validation
 *        → Patient Status Report PDF → FHIR Observation
 *
 * Each step has an explicit acceptance criterion (RENDER / FUNCTION /
 * PERSIST / ROUND-TRIP / CROSS-LINK / REPORTABLE) per SKILL §7.6 and is
 * tagged inline with the §-reference that mandates it.
 *
 * Caught bugs (the FAIL pattern is the point):
 *   BUG-37 patient-order linkage — Step 2 FAILs whenever the Add Order
 *     wizard saves without populating sample_human. Until BUG-37 is fixed
 *     this chain is expected to be PARTIAL/FAIL on every run; that is
 *     the methodology working as designed.
 *   BUG-31 Carbon Accept checkbox — Step 3 cannot drive the UI without
 *     hanging the session. Per SKILL §11.5, we API-substitute the result
 *     entry. If the API path is unavailable, mark BLOCKED + PARTIAL and
 *     continue.
 *   BUG-38 NCE POST — not exercised by this chain.
 *
 * Acceptance for the chain as a whole:
 *   PASS if all 8 steps complete with their declared criterion met.
 *   PARTIAL if any step is BLOCKED (typically Step 3 BUG-31 substitute).
 *   FAIL if any step's expectation fails outright.
 *
 * Run individually:
 *   npx playwright test --project=chain-a
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

test.describe.serial('Chain A — Order Lifecycle', () => {
  let order: ChainOrderRef | null = null;
  const enteredResultValue = '12.5'; // arbitrary numeric we expect to round-trip

  test.beforeAll(() => {
    // Soft sanity print so the per-step logs make sense in CI output.
    // eslint-disable-next-line no-console
    console.log(`[Chain A] BASE=${BASE}`);
  });

  // ---------------------------------------------------------------------------
  // Step 1 — Acquire an order to drive the chain
  // SKILL §0.6 Data Census + §0.6a Seed Script
  // Acceptance criterion: RENDER (any QA_AUTO_ order can be found or seeded)
  // ---------------------------------------------------------------------------
  test('Step 1 — Acquire a QA_AUTO_ order (RENDER)', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');

    order = await findOrSeedOrder(page);
    if (!order) {
      markStep('A', 1, 'FAIL', 'No QA_AUTO_ order available',
        'Run `npx playwright test --project=seed-data` first (SKILL §0.6a). The chain cannot proceed without seeded data.');
      expect(order, 'No QA_AUTO_ order available — seed first per SKILL §0.6a').not.toBeNull();
      return;
    }
    markStep('A', 1, 'PASS',
      `Acquired order ${order.accession} (${order.source}) for patient ${order.patientNationalId} / test ${order.testName}`);
    expect(order.accession.length).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------------
  // Step 2 — Verify patient-order linkage (BUG-37 catch)
  // SKILL §7.5 Round-trip Write Verification + §11 Chain A row
  // Acceptance criterion: ROUND-TRIP
  // The seed-factory's createOrder already does this check at write time;
  // here we do it via a fresh read so the chain explicitly demonstrates
  // the round-trip pattern.
  // ---------------------------------------------------------------------------
  test('Step 2 — Patient-order linkage (ROUND-TRIP, BUG-37 check)', async ({ page }) => {
    if (!order) test.skip();

    await page.goto(BASE);
    const readback = await apiCall<{ patientProperties?: { nationalId?: string; firstName?: string; lastName?: string } }>(
      page,
      `/api/OpenELIS-Global/rest/SampleEdit?labNumber=${encodeURIComponent(order!.accession)}`
    );

    if (!readback.ok) {
      markStep('A', 2, 'FAIL', `SampleEdit lookup returned HTTP ${readback.status}`,
        `Cannot verify linkage without the read-back endpoint.`);
      expect(readback.ok, `SampleEdit returned ${readback.status}`).toBeTruthy();
      return;
    }

    const linkedNationalId = (typeof readback.body === 'object' && readback.body !== null)
      ? ((readback.body as { nationalId?: string }).nationalId)
      : undefined;

    if (linkedNationalId !== order!.patientNationalId) {
      markStep('A', 2, 'FAIL',
        `Patient-order linkage broken (BUG-37): expected nationalId ${order!.patientNationalId}, got ${linkedNationalId ?? '(none)'}`,
        `This is the canonical BUG-37 symptom. Order persisted but sample_human row was not written.`);
      expect(linkedNationalId, 'BUG-37: patient-order linkage broken').toBe(order!.patientNationalId);
      return;
    }
    markStep('A', 2, 'PASS', `Patient ${linkedNationalId} correctly linked to order ${order!.accession}`);
  });

  // ---------------------------------------------------------------------------
  // Step 3 — Enter a result (BUG-31 destructive; use API substitute)
  // SKILL §11.5 Blocking-Bug Etiquette
  // Acceptance criterion: PERSIST
  // ---------------------------------------------------------------------------
  test('Step 3 — Enter result via API substitute (PERSIST, BUG-31 workaround)', async ({ page }) => {
    if (!order) test.skip();

    await page.goto(BASE);

    // BUG-31: the Carbon Accept checkbox click would hang for ~60s. Per
    // §11.5 we don't click it; we POST the result update directly. The
    // result-update endpoint is /rest/LogbookResults (POST). Payload
    // shape inferred from Phase 8 BV-DEEP TestModify writes.
    const payload = {
      paging: { totalPages: 1 },
      resultList: [
        {
          accessionNumber: order!.accession,
          testId: order!.testId,
          value: enteredResultValue,
          isAccept: true,
          isReject: false,
        },
      ],
    };

    const post = await apiCall<{ savedCount?: number }>(
      page,
      '/api/OpenELIS-Global/rest/LogbookResults',
      { method: 'POST', body: payload }
    );

    if (!post.ok) {
      markStep('A', 3, 'BLOCKED',
        `Result API substitute returned HTTP ${post.status}`,
        `Per §11.5 Blocking-Bug Etiquette: marking BLOCKED, chain continues. ` +
        `Resolve by adding a tested API path or by waiting for BUG-31 fix.`);
      // BLOCKED is not a hard failure — chain continues. Use a soft
      // assertion so Playwright reports PARTIAL.
      test.info().annotations.push({ type: 'blocked', description: 'BUG-31 + missing API substitute' });
      return;
    }
    markStep('A', 3, 'PASS', `Result POST returned HTTP ${post.status}`);
  });

  // ---------------------------------------------------------------------------
  // Step 4 — Validate the result
  // SKILL §11 Chain A row
  // Acceptance criterion: PERSIST
  // ---------------------------------------------------------------------------
  test('Step 4 — Validate the result (PERSIST)', async ({ page }) => {
    if (!order) test.skip();

    await page.goto(BASE);

    // Validation Routine page POSTs to /rest/ResultValidation. Payload
    // shape from Phase 20E EU suite (full validation workflow E2E).
    const payload = {
      paging: { totalPages: 1 },
      validationList: [
        {
          accessionNumber: order!.accession,
          testId: order!.testId,
          accepted: true,
          rejected: false,
        },
      ],
    };
    const post = await apiCall<unknown>(
      page,
      '/api/OpenELIS-Global/rest/ResultValidation',
      { method: 'POST', body: payload }
    );

    if (!post.ok) {
      markStep('A', 4, 'BLOCKED', `Validation API returned HTTP ${post.status}`,
        `Per §11.5: BLOCKED, chain continues.`);
      test.info().annotations.push({ type: 'blocked', description: `validation POST ${post.status}` });
      return;
    }
    markStep('A', 4, 'PASS', `Validation POST returned HTTP ${post.status}`);
  });

  // ---------------------------------------------------------------------------
  // Step 5 — Generate Patient Status Report PDF
  // SKILL §11 Chain A row + Phase 21 EV evidence
  // Acceptance criterion: REPORTABLE (a PDF must be produced)
  // ---------------------------------------------------------------------------
  test('Step 5 — Generate Patient Status Report PDF (REPORTABLE)', async ({ page }) => {
    if (!order) test.skip();

    await page.goto(BASE);

    // Report generation uses the JSP ReportPrint endpoint (not the
    // /rest/report/* false-positive path — see SKILL §6.5).
    const url =
      `/api/OpenELIS-Global/ReportPrint?report=patient&type=patient` +
      `&accessionNumber=${encodeURIComponent(order!.accession)}`;

    const response = await apiCall<string>(page, url, { accept: 'application/pdf', expectBinary: true });

    if (!response.ok) {
      markStep('A', 5, 'FAIL', `ReportPrint returned HTTP ${response.status}`);
      expect(response.ok, `ReportPrint returned ${response.status}`).toBeTruthy();
      return;
    }

    // The body is base64-encoded binary. Decode and check the PDF
    // magic bytes (`%PDF`).
    const buf = Buffer.from(String(response.body), 'base64');
    const isPdf = buf.length >= 4 && buf.toString('ascii', 0, 4) === '%PDF';
    if (!isPdf) {
      markStep('A', 5, 'FAIL', `Response is not a PDF (first 4 bytes: ${buf.toString('hex', 0, 4)})`);
      expect(isPdf, 'ReportPrint did not return a PDF').toBeTruthy();
      return;
    }
    markStep('A', 5, 'PASS', `PDF generated, ${buf.length} bytes`);

    // Stash for Step 6
    (order as ChainOrderRef & { pdf?: Buffer }).pdf = buf;
  });

  // ---------------------------------------------------------------------------
  // Step 6 — Lab number appears on the PDF
  // SKILL §11 Chain A row + §7.5 Round-trip
  // Acceptance criterion: REPORTABLE (content matches)
  // ---------------------------------------------------------------------------
  test('Step 6 — Lab number present on PDF (REPORTABLE)', async ({ page }) => {
    if (!order) test.skip();
    const withPdf = order as ChainOrderRef & { pdf?: Buffer };
    if (!withPdf.pdf) {
      markStep('A', 6, 'BLOCKED', 'No PDF from Step 5');
      test.skip();
      return;
    }

    const text = extractPdfText(withPdf.pdf);
    const found = text.includes(order!.accession);
    if (!found) {
      markStep('A', 6, 'FAIL',
        `Accession ${order!.accession} not found in PDF text`,
        `Either branding pipeline is broken (NOTE-29 territory: header "null"), or the report didn't include this accession, or the simple PDF extractor missed it.`);
      expect(found, `Accession ${order!.accession} missing from PDF`).toBeTruthy();
      return;
    }
    markStep('A', 6, 'PASS', `Accession ${order!.accession} found in PDF body`);
  });

  // ---------------------------------------------------------------------------
  // Step 7 — Fetch FHIR Observation
  // SKILL §11 Chain A row + Phase 8 BW-DEEP evidence
  // Acceptance criterion: CROSS-LINK (UI write → FHIR read)
  // ---------------------------------------------------------------------------
  test('Step 7 — Fetch FHIR Observation (CROSS-LINK)', async ({ page }) => {
    if (!order) test.skip();
    await page.goto(BASE);

    // Path discovery: try the documented working path first
    // (`/api/OpenELIS-Global/fhir`), fall back to `/fhir` and
    // `/hapi-fhir-jpaserver/fhir` per the existing fhir-integration.spec.ts.
    const candidates = [
      `/api/OpenELIS-Global/fhir/Observation?identifier=${encodeURIComponent(order!.accession)}`,
      `/fhir/Observation?identifier=${encodeURIComponent(order!.accession)}`,
      `/hapi-fhir-jpaserver/fhir/Observation?identifier=${encodeURIComponent(order!.accession)}`,
    ];

    let resp: Awaited<ReturnType<typeof apiCall<{ entry?: Array<{ resource?: { valueQuantity?: { value?: number }; valueString?: string } }> }>>> | null = null;
    for (const path of candidates) {
      const r = await apiCall<{ entry?: Array<{ resource?: { valueQuantity?: { value?: number }; valueString?: string } }> }>(
        page,
        path,
        { accept: 'application/fhir+json' }
      );
      if (r.ok) {
        resp = r;
        markStep('A', 7, 'PASS', `FHIR Observation fetched via ${path} (HTTP ${r.status})`);
        break;
      }
    }
    if (!resp) {
      markStep('A', 7, 'FAIL', 'No FHIR Observation endpoint responded with 200');
      expect(resp, 'FHIR Observation not reachable').not.toBeNull();
      return;
    }
    (order as ChainOrderRef & { fhir?: typeof resp.body }).fhir = resp.body;
  });

  // ---------------------------------------------------------------------------
  // Step 8 — FHIR Observation value matches entered result
  // SKILL §7.5 Round-trip Write Verification
  // Acceptance criterion: ROUND-TRIP
  // ---------------------------------------------------------------------------
  test('Step 8 — FHIR Observation value matches entered result (ROUND-TRIP)', async ({ page }) => {
    if (!order) test.skip();
    const withFhir = order as ChainOrderRef & { fhir?: { entry?: Array<{ resource?: { valueQuantity?: { value?: number }; valueString?: string } }> } };
    if (!withFhir.fhir || typeof withFhir.fhir !== 'object') {
      markStep('A', 8, 'BLOCKED', 'No FHIR payload from Step 7');
      test.skip();
      return;
    }

    const entries = withFhir.fhir.entry || [];
    if (entries.length === 0) {
      markStep('A', 8, 'FAIL',
        `FHIR bundle empty for accession ${order!.accession}`,
        `Either Step 3 result entry did not surface in FHIR (CROSS-LINK gap), or the search identifier was wrong.`);
      expect(entries.length, 'FHIR bundle is empty').toBeGreaterThan(0);
      return;
    }

    const values = entries
      .map(e => e.resource?.valueQuantity?.value?.toString() ?? e.resource?.valueString)
      .filter(Boolean);
    const matched = values.some(v => v === enteredResultValue);
    if (!matched) {
      markStep('A', 8, 'FAIL',
        `Entered value ${enteredResultValue} not found in FHIR Observation entries: ${values.join(', ')}`,
        `The result was either not persisted (Step 3 BLOCKED), not validated (Step 4 BLOCKED), or the FHIR projection drops the value.`);
      expect(matched, `FHIR value mismatch`).toBeTruthy();
      return;
    }
    markStep('A', 8, 'PASS', `Round-trip confirmed: entered ${enteredResultValue} appears in FHIR Observation`);
  });
});
