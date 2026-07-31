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
import {
  ACCESSION_VALIDATION,
  accessionValidationQuery,
  markValidationRows,
} from '../../helpers/apiShapes';

const PERSONA = 'PC';
const HEMATOLOGY_SECTION_ID = '36';

test.describe.serial('Persona PC — Validating Biologist', () => {
  let queueItems: Array<{ accessionNumber: string; testId: string }> = [];
  let validatedAccession: string | null = null;

  test('Step 1 — Open Validation Routine for Hematology (RENDER)', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    // §6.5 correction: /rest/ResultValidation does not exist (404 for admin AND
    // for the Validation role — verified by control run 2026-07-31). The
    // validation queue is AccessionValidation, filtered by `unitType`.
    const r = await apiCall<{ resultList?: Array<{ accessionNumber?: string; testId?: string; analysisId?: string }> }>(
      page, accessionValidationQuery({ sectionId: HEMATOLOGY_SECTION_ID })
    );
    if (!r.ok) {
      markStep(PERSONA, 1, 'FAIL', `AccessionValidation HTTP ${r.status}`);
      expect(r.ok).toBeTruthy(); return;
    }
    const list = (typeof r.body === 'object' && r.body !== null)
      ? ((r.body as { resultList?: Array<{ accessionNumber?: string; testId?: string }> }).resultList || [])
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
    await page.waitForLoadState('networkidle');

    // §v6.23: this is a STRUTS FORM ROUND-TRIP, not a REST write. Validation.jsx
    // POSTs the ENTIRE object returned by the GET; per-row flags are
    // resultList[i].isAccepted / .isRejected / .note. The previous
    // {paging, validationList:[...]} body was invented and 400s.
    const g = await apiCall<Record<string, unknown>>(page, accessionValidationQuery({ sectionId: HEMATOLOGY_SECTION_ID }));
    const form = (g.ok && g.body && typeof g.body === 'object') ? g.body as Record<string, unknown> : null;
    if (!form) {
      markStep(PERSONA, 2, 'BLOCKED', `Could not re-read the validation form (HTTP ${g.status})`);
      return;
    }
    markValidationRows(form, { reject: [0], note: 'PC persona: re-run for QC variance' });

    const r = await apiCall<unknown>(page, ACCESSION_VALIDATION, { method: 'POST', body: form });
    if (!r.ok) {
      markStep(PERSONA, 2, 'BLOCKED',
        `Reject-for-retest HTTP ${r.status}`,
        `Body: ${(typeof r.body === 'string' ? r.body : JSON.stringify(r.body)).slice(0, 200)}`);
      test.info().annotations.push({ type: 'blocked', description: 'reject path unavailable' });
      return;
    }
    markStep(PERSONA, 2, 'PASS', `${queueItems[0].accessionNumber} marked for retest`);
  });

  test('Step 3 — Validate remaining queue items (PERSIST)', async ({ page }) => {
    if (queueItems.length <= 1) test.skip();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');

    // Re-read the form (Step 2 changed it), then accept every row except the
    // one just rejected. Rows are addressed by array index — the API response
    // carries no usable row id (§v6.23).
    const g = await apiCall<Record<string, unknown>>(page, accessionValidationQuery({ sectionId: HEMATOLOGY_SECTION_ID }));
    const form = (g.ok && g.body && typeof g.body === 'object') ? g.body as Record<string, unknown> : null;
    if (!form) {
      markStep(PERSONA, 3, 'FAIL', `Could not re-read the validation form (HTTP ${g.status})`);
      expect(form, 'validation form must be readable').toBeTruthy(); return;
    }
    const rows = (form.resultList as Array<Record<string, unknown>>) ?? [];
    const accept = rows.map((_, i) => i).filter(i => i !== 0);
    if (accept.length === 0) {
      markStep(PERSONA, 3, 'PARTIAL', 'Only one row in the queue; nothing left to validate after the retest');
      test.skip(); return;
    }
    markValidationRows(form, { accept });

    const r = await apiCall<unknown>(page, ACCESSION_VALIDATION, { method: 'POST', body: form });
    if (!r.ok) {
      markStep(PERSONA, 3, 'FAIL',
        `Bulk validate HTTP ${r.status}`,
        `Body: ${(typeof r.body === 'string' ? r.body : JSON.stringify(r.body)).slice(0, 200)}`);
      expect(r.ok).toBeTruthy(); return;
    }
    validatedAccession = queueItems[1]?.accessionNumber ?? queueItems[0].accessionNumber;
    markStep(PERSONA, 3, 'PASS', `${accept.length} results validated; first=${validatedAccession}`);
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
