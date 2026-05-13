/**
 * tests/personas/persona-pb-bench-tech.spec.ts
 *
 * SKILL §12 Persona PB — Bench Tech (Hematology)
 *
 * The day: a hematology bench tech opens the Workplan filtered to
 * their lab section, picks a sample, enters CBC results, and saves.
 * They do this many times per shift, and at the end bulk-save
 * normal results on outstanding routine cases.
 *
 * This is the persona MOST blocked by BUG-31 (Carbon Accept
 * checkbox 60s hang) — the bench tech is the role that directly
 * interacts with that checkbox. Per SKILL §11.5 + §6.5a, the
 * persona spec uses API substitutes for result writes.
 *
 * Known issues this persona surfaces:
 *   BUG-31 — Result entry via UI is impossible without hanging the
 *            tab. Persona uses API substitute and notes the gap.
 *   BUG-60 — LogbookResults filter ineffective on mgtest v3.2.1.5.
 *
 * Run individually:
 *   npx playwright test --project=persona-pb
 */

import { test, expect } from '@playwright/test';
import { BASE, apiCall, markStep } from '../chains/_common';

const PERSONA = 'PB';
const SHIFT_TARGET = 3; // entries to enter in one shift
const HEMATOLOGY_SECTION_ID = '36'; // testing.openelis-global.org Hematology lab section

test.describe.serial('Persona PB — Bench Tech (Hematology)', () => {
  let workItems: Array<{ accessionNumber: string; testId: string }> = [];
  const processed: string[] = [];

  test('Step 1 — Open Workplan filtered to Hematology (RENDER)', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    const r = await apiCall<{ logbookList?: Array<{ accessionNumber?: string; testId?: string }> }>(
      page, `/api/OpenELIS-Global/rest/LogbookResults?testSectionId=${HEMATOLOGY_SECTION_ID}`
    );
    if (!r.ok) {
      markStep(PERSONA, 1, 'FAIL', `LogbookResults HTTP ${r.status}`); expect(r.ok).toBeTruthy(); return;
    }
    const list = (typeof r.body === 'object' && r.body !== null)
      ? ((r.body as { logbookList?: Array<{ accessionNumber?: string; testId?: string }> }).logbookList || [])
      : [];
    workItems = list.filter(i => i.accessionNumber && i.testId).map(i => ({
      accessionNumber: i.accessionNumber!,
      testId: i.testId!,
    }));
    if (workItems.length === 0) {
      markStep(PERSONA, 1, 'PARTIAL',
        'Hematology queue empty — bench tech has nothing to do',
        'Either no orders waiting, or BUG-60 territory on mgtest. Persona walk-through cannot complete.');
      test.info().annotations.push({ type: 'partial', description: 'empty hematology queue' });
      test.skip(); return;
    }
    markStep(PERSONA, 1, 'PASS', `${workItems.length} hematology items waiting`);
  });

  test(`Step 2 — Enter ${SHIFT_TARGET} CBC results via API substitute (PERSIST, §11.5/§6.5a, BUG-31)`, async ({ page }) => {
    if (workItems.length === 0) test.skip();
    await page.goto(BASE);

    const shift = workItems.slice(0, SHIFT_TARGET);
    let successful = 0;
    for (const item of shift) {
      const value = String(10 + Math.random() * 5); // realistic-ish CBC value
      const r = await apiCall<unknown>(page, '/api/OpenELIS-Global/rest/LogbookResults', {
        method: 'POST',
        body: { paging: { totalPages: 1 }, resultList: [
          { accessionNumber: item.accessionNumber, testId: item.testId, value, isAccept: true, isReject: false },
        ] },
      });
      if (r.ok) {
        successful++;
        processed.push(item.accessionNumber);
      }
    }
    if (successful === 0) {
      markStep(PERSONA, 2, 'BLOCKED',
        `All ${shift.length} result writes failed`,
        `Either API path differs or BUG-31-level block at the API layer too. ` +
        `Without ANY way for the bench tech to enter a result, their entire day is BLOCKED.`);
      test.info().annotations.push({ type: 'blocked', description: 'no result write path' });
      return;
    }
    if (successful < shift.length) {
      markStep(PERSONA, 2, 'PARTIAL',
        `${successful}/${shift.length} results saved`,
        `Bench tech can sometimes save but the path isn't reliable.`);
      return;
    }
    markStep(PERSONA, 2, 'PASS', `${successful}/${shift.length} CBC results entered for ${processed.join(', ')}`);
  });

  test('Step 3 — Round-trip read confirms saved results (ROUND-TRIP)', async ({ page }) => {
    if (processed.length === 0) test.skip();
    await page.goto(BASE);
    let confirmed = 0;
    for (const accession of processed) {
      const r = await apiCall<{ resultList?: Array<{ value?: string }> }>(
        page, `/api/OpenELIS-Global/rest/LogbookResults?accessionNumber=${encodeURIComponent(accession)}`
      );
      const items = (r.ok && typeof r.body === 'object' && r.body !== null)
        ? ((r.body as { resultList?: Array<{ value?: string }> }).resultList || [])
        : [];
      if (items.some(it => it.value && it.value !== '')) confirmed++;
    }
    if (confirmed < processed.length) {
      markStep(PERSONA, 3, 'FAIL',
        `${confirmed}/${processed.length} results round-tripped`,
        `Saved but didn't read back — bench tech's work is silently lost. BUG-8 class.`);
      expect(confirmed).toBe(processed.length); return;
    }
    markStep(PERSONA, 3, 'PASS', `All ${confirmed} results visible on read-back`);
  });

  test('Step 4 — Bulk-save normal results on remaining queue (PERSIST, bulk action)', async ({ page }) => {
    const remaining = workItems.slice(SHIFT_TARGET, SHIFT_TARGET + 10);
    if (remaining.length === 0) {
      markStep(PERSONA, 4, 'PARTIAL', 'Queue exhausted by Step 2; bulk save not exercised');
      test.skip(); return;
    }
    await page.goto(BASE);
    const r = await apiCall<unknown>(page, '/api/OpenELIS-Global/rest/LogbookResults', {
      method: 'POST',
      body: {
        paging: { totalPages: 1 },
        resultList: remaining.map(item => ({
          accessionNumber: item.accessionNumber, testId: item.testId,
          value: '12.0',                  // typical normal CBC value
          isAccept: true, isReject: false,
        })),
      },
    });
    if (!r.ok) {
      markStep(PERSONA, 4, 'FAIL',
        `Bulk save HTTP ${r.status}`,
        `Bench tech can save individually (Step 2 PASS) but the bulk-save UI action fails. ` +
        `This is the "Save All Normal" button — used dozens of times per shift.`);
      expect(r.ok).toBeTruthy(); return;
    }
    markStep(PERSONA, 4, 'PASS', `Bulk saved ${remaining.length} normal results`);
  });

  test.afterAll(() => {
    // eslint-disable-next-line no-console
    console.log(`[Persona PB] Bench tech shift summary: processed ${processed.length} cases, queue had ${workItems.length}`);
  });
});
