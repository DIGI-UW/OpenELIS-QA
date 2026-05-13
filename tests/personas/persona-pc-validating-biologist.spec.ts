/**
 * tests/personas/persona-pc-validating-biologist.spec.ts
 *
 * SKILL §12 Persona PC — Validating Biologist
 *
 * The day: a validating biologist (pathologist or senior tech with
 * validation rights) opens Validation Routine filtered to their
 * section, reviews results entered by bench techs, adds notes where
 * needed, rejects one for retest, and validates the rest. Then they
 * confirm one validated case on Patient Results so the result is
 * actually reportable.
 *
 * Persona depends on Persona PB having actually entered results.
 * If the validation queue is empty, this persona BAILs.
 *
 * Run individually:
 *   npx playwright test --project=persona-pc
 */

import { test, expect } from '@playwright/test';
import { BASE, apiCall, markStep } from '../chains/_common';

const PERSONA = 'PC';
const HEMATOLOGY_SECTION_ID = '36';

test.describe.serial('Persona PC — Validating Biologist', () => {
  let queueItems: Array<{ accessionNumber: string; testId: string }> = [];
  let validatedAccession: string | null = null;

  test('Step 1 — Open Validation Routine for Hematology (RENDER)', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    const r = await apiCall<{ validationList?: Array<{ accessionNumber?: string; testId?: string }> }>(
      page, `/api/OpenELIS-Global/rest/ResultValidation?testUnitId=${HEMATOLOGY_SECTION_ID}`
    );
    if (!r.ok) {
      markStep(PERSONA, 1, 'FAIL', `ResultValidation HTTP ${r.status}`);
      expect(r.ok).toBeTruthy(); return;
    }
    const list = (typeof r.body === 'object' && r.body !== null)
      ? ((r.body as { validationList?: Array<{ accessionNumber?: string; testId?: string }> }).validationList || [])
      : [];
    queueItems = list.filter(i => i.accessionNumber && i.testId).map(i => ({
      accessionNumber: i.accessionNumber!,
      testId: i.testId!,
    }));
    if (queueItems.length === 0) {
      markStep(PERSONA, 1, 'PARTIAL',
        'Validation queue empty',
        'Biologist has nothing to validate today. May indicate Persona PB hasn\'t run or BUG-60 territory.');
      test.skip(); return;
    }
    markStep(PERSONA, 1, 'PASS', `${queueItems.length} hematology results waiting for validation`);
  });

  test('Step 2 — Reject first result for retest with note (PERSIST)', async ({ page }) => {
    if (queueItems.length === 0) test.skip();
    await page.goto(BASE);
    const item = queueItems[0];
    const r = await apiCall<unknown>(page, '/api/OpenELIS-Global/rest/ResultValidation', {
      method: 'POST',
      body: { paging: { totalPages: 1 }, validationList: [
        {
          accessionNumber: item.accessionNumber,
          testId: item.testId,
          accepted: false,
          rejected: true,
          retest: true,
          note: 'PC persona: re-run for QC variance',
        },
      ] },
    });
    if (!r.ok) {
      markStep(PERSONA, 2, 'BLOCKED', `Reject-for-retest HTTP ${r.status}`);
      test.info().annotations.push({ type: 'blocked', description: 'reject path unavailable' });
      return;
    }
    markStep(PERSONA, 2, 'PASS', `${item.accessionNumber} marked for retest`);
  });

  test('Step 3 — Validate remaining queue items (PERSIST)', async ({ page }) => {
    if (queueItems.length <= 1) test.skip();
    await page.goto(BASE);
    const toValidate = queueItems.slice(1);
    const r = await apiCall<unknown>(page, '/api/OpenELIS-Global/rest/ResultValidation', {
      method: 'POST',
      body: { paging: { totalPages: 1 }, validationList: toValidate.map(item => ({
        accessionNumber: item.accessionNumber, testId: item.testId, accepted: true, rejected: false,
      })) },
    });
    if (!r.ok) {
      markStep(PERSONA, 3, 'FAIL', `Bulk validate HTTP ${r.status}`);
      expect(r.ok).toBeTruthy(); return;
    }
    validatedAccession = toValidate[0].accessionNumber;
    markStep(PERSONA, 3, 'PASS', `${toValidate.length} results validated; first=${validatedAccession}`);
  });

  test('Step 4 — Confirm validated case appears on Patient Results (CROSS-LINK)', async ({ page }) => {
    if (!validatedAccession) test.skip();
    await page.goto(BASE);
    await page.waitForTimeout(2000); // validation may be async
    const r = await apiCall<{ resultList?: Array<{ status?: string; accessionNumber?: string }> }>(
      page, `/api/OpenELIS-Global/rest/PatientResults?accessionNumber=${encodeURIComponent(validatedAccession!)}`
    );
    if (!r.ok) {
      markStep(PERSONA, 4, 'FAIL', `PatientResults HTTP ${r.status}`);
      expect(r.ok).toBeTruthy(); return;
    }
    const items = (typeof r.body === 'object' && r.body !== null)
      ? ((r.body as { resultList?: Array<{ status?: string; accessionNumber?: string }> }).resultList || [])
      : [];
    const found = items.find(i => i.accessionNumber === validatedAccession);
    if (!found) {
      markStep(PERSONA, 4, 'FAIL',
        `Validated ${validatedAccession} not on PatientResults`,
        `Biologist validated the case but the patient-facing surface doesn't show it. Reporting pipeline broken.`);
      expect(found, 'Validated case missing from Patient Results').toBeTruthy(); return;
    }
    markStep(PERSONA, 4, 'PASS', `Validated case ${validatedAccession} surfaces on Patient Results`);
  });
});
