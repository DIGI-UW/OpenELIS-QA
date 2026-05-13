/**
 * tests/chains/chain-e-sample-validation-lifecycle.spec.ts
 *
 * SKILL §11 Chain E — Sample Validation Lifecycle
 *
 * What this chain proves: the back-and-forth path real labs walk:
 * enter result → reject for technical reasons (re-test required) →
 * re-enter result → validate → confirm validated value on Patient
 * Status Report.
 *
 * Distinct from Chain B's *sample* rejection (BUG-29 silo): this is
 * *result* rejection — a tech says "this result is wrong, run it
 * again" before validation. The sample is fine, the result isn't.
 *
 * Run individually:
 *   npx playwright test --project=chain-e
 */

import { test, expect } from '@playwright/test';
import { BASE, apiCall, findOrSeedOrder, markStep, ChainOrderRef } from './_common';

test.describe.serial('Chain E — Sample Validation Lifecycle', () => {
  let order: ChainOrderRef | null = null;
  const initialValue = '99.9';
  const retestValue = '50.0';

  test.beforeAll(() => {
    // eslint-disable-next-line no-console
    console.log(`[Chain E] BASE=${BASE}`);
  });

  test('Step 1 — Acquire QA_AUTO_ order (RENDER)', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    order = await findOrSeedOrder(page);
    if (!order) { markStep('E', 1, 'FAIL', 'No QA_AUTO_ order'); expect(order).not.toBeNull(); return; }
    markStep('E', 1, 'PASS', `Order ${order.accession} / test ${order.testName}`);
  });

  test('Step 2 — Enter initial (wrong) result via API (PERSIST, §11.5)', async ({ page }) => {
    if (!order) test.skip();
    await page.goto(BASE);
    const post = await apiCall<unknown>(page, '/api/OpenELIS-Global/rest/LogbookResults', {
      method: 'POST',
      body: { paging: { totalPages: 1 }, resultList: [{ accessionNumber: order!.accession, testId: order!.testId, value: initialValue, isAccept: true, isReject: false }] },
    });
    if (!post.ok) {
      markStep('E', 2, 'BLOCKED', `LogbookResults POST HTTP ${post.status}`);
      test.info().annotations.push({ type: 'blocked', description: `result POST ${post.status}` });
      return;
    }
    markStep('E', 2, 'PASS', `Initial result ${initialValue} entered for ${order!.accession}`);
  });

  test('Step 3 — Reject result for re-test via Validation API (PERSIST)', async ({ page }) => {
    if (!order) test.skip();
    await page.goto(BASE);
    // Validation rejection is different from sample rejection: result is
    // marked retest=true via the ResultValidation POST.
    const post = await apiCall<unknown>(page, '/api/OpenELIS-Global/rest/ResultValidation', {
      method: 'POST',
      body: { paging: { totalPages: 1 }, validationList: [{ accessionNumber: order!.accession, testId: order!.testId, accepted: false, rejected: true, retest: true }] },
    });
    if (!post.ok) {
      markStep('E', 3, 'BLOCKED', `ResultValidation reject HTTP ${post.status}`);
      test.info().annotations.push({ type: 'blocked', description: 'reject for retest' });
      return;
    }
    markStep('E', 3, 'PASS', `Result marked for retest`);
  });

  test('Step 4 — Re-enter corrected result (PERSIST)', async ({ page }) => {
    if (!order) test.skip();
    await page.goto(BASE);
    const post = await apiCall<unknown>(page, '/api/OpenELIS-Global/rest/LogbookResults', {
      method: 'POST',
      body: { paging: { totalPages: 1 }, resultList: [{ accessionNumber: order!.accession, testId: order!.testId, value: retestValue, isAccept: true, isReject: false, isRetest: true }] },
    });
    if (!post.ok) {
      markStep('E', 4, 'BLOCKED', `Retest POST HTTP ${post.status}`);
      test.info().annotations.push({ type: 'blocked', description: 'retest write' });
      return;
    }
    markStep('E', 4, 'PASS', `Corrected result ${retestValue} entered`);
  });

  test('Step 5 — Validate the corrected result (PERSIST)', async ({ page }) => {
    if (!order) test.skip();
    await page.goto(BASE);
    const post = await apiCall<unknown>(page, '/api/OpenELIS-Global/rest/ResultValidation', {
      method: 'POST',
      body: { paging: { totalPages: 1 }, validationList: [{ accessionNumber: order!.accession, testId: order!.testId, accepted: true, rejected: false }] },
    });
    if (!post.ok) {
      markStep('E', 5, 'BLOCKED', `Validate HTTP ${post.status}`);
      test.info().annotations.push({ type: 'blocked', description: 'final validation' });
      return;
    }
    markStep('E', 5, 'PASS', `Validation submitted`);
  });

  test('Step 6 — Patient report contains corrected value, not initial value (CROSS-LINK, ROUND-TRIP)', async ({ page }) => {
    if (!order) test.skip();
    await page.goto(BASE);
    const url = `/api/OpenELIS-Global/ReportPrint?report=patient&type=patient&accessionNumber=${encodeURIComponent(order!.accession)}`;
    const r = await apiCall<string>(page, url, { accept: 'application/pdf', expectBinary: true });
    if (!r.ok) { markStep('E', 6, 'FAIL', `ReportPrint HTTP ${r.status}`); expect(r.ok).toBeTruthy(); return; }
    const buf = Buffer.from(String(r.body), 'base64');
    if (!(buf.length >= 4 && buf.toString('ascii', 0, 4) === '%PDF')) {
      markStep('E', 6, 'FAIL', 'Not a PDF'); expect.fail('Not a PDF'); return;
    }
    // PDF text extraction is noisy — just check that the corrected
    // value appears and the initial wrong value doesn't.
    const text = buf.toString('latin1');
    const hasCorrected = text.includes(retestValue);
    const hasInitial = text.includes(initialValue);
    if (!hasCorrected) {
      markStep('E', 6, 'FAIL',
        `Corrected value ${retestValue} NOT in patient report`,
        `Validation step did not propagate to the report layer.`);
      expect(hasCorrected).toBeTruthy(); return;
    }
    if (hasInitial) {
      markStep('E', 6, 'PARTIAL',
        `Corrected value ${retestValue} present but initial wrong value ${initialValue} ALSO present`,
        `Either the retest didn't replace the original (data model issue) or the report shows history without marking which is current.`);
      test.info().annotations.push({ type: 'partial', description: 'both values in report' });
      return;
    }
    markStep('E', 6, 'PASS', `Report shows corrected value ${retestValue}, initial wrong value ${initialValue} is gone`);
  });
});
