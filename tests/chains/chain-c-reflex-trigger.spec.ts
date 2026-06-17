/**
 * tests/chains/chain-c-reflex-trigger.spec.ts
 *
 * SKILL §11 Chain C — Reflex Trigger
 *
 * What this chain proves: reflex rules defined in
 * /MasterListsPage/reflex actually fire when a matching result is
 * entered. The rule should auto-order the downstream "reflex test" for
 * the same accession, and that test should appear in the Workplan/
 * Logbook.
 *
 * Why this chain is high-leverage: per the maturity dashboard, Reflex
 * Rule *Admin* is M2 (saves correctly). Reflex Rule *Firing* is now M4 —
 * VERIFIED firing on v3.2.1.10 (indonesiadev), where BUG-31 does NOT
 * reproduce: GPT/ALAT >= 40 auto-added GOT/ASAT on result save. On builds
 * where BUG-31 is present, this chain keeps the API substitute (Step 3).
 *
 * Per SKILL §11.5 Blocking-Bug Etiquette, this chain uses an API
 * substitute for result entry (Step 3) so we can finally answer the
 * question: do the rules fire or not?
 *
 * Expected outcomes (the test is informative either way):
 *   - All 6 steps PASS: the engine works on API writes. Mark Reflex
 *     Firing M3 (round-trip verified) in the maturity dashboard.
 *   - Step 5 FAILs (reflex test not auto-added): engine doesn't fire,
 *     or doesn't fire on API writes. File a real bug.
 *   - Step 2 BAILs (no reflex rule found): instance has no rules. Pre-
 *     seeding step needs to be added to the seed-data script.
 *
 * Run individually:
 *   npx playwright test --project=chain-c
 */

import { test, expect } from '@playwright/test';
import {
  BASE,
  apiCall,
  findOrSeedOrder,
  markStep,
  ChainOrderRef,
} from './_common';

interface ReflexRule {
  id: string;
  ruleName?: string;
  overall?: string;
  active?: boolean;
  conditions?: Array<{ sampleId?: string; testId?: string; relation?: string; value?: string }>;
  actions?: Array<{ reflexTestId?: string; sampleId?: string; addNotification?: boolean }>;
}

test.describe.serial('Chain C — Reflex Trigger', () => {
  let order: ChainOrderRef | null = null;
  let rule: ReflexRule | null = null;
  let triggerValue: string | null = null;

  test.beforeAll(() => {
    // eslint-disable-next-line no-console
    console.log(`[Chain C] BASE=${BASE}`);
  });

  // ---------------------------------------------------------------------------
  // Step 1 — Acquire an order
  // SKILL §0.6 + §0.6a
  // Acceptance criterion: RENDER
  // ---------------------------------------------------------------------------
  test('Step 1 — Acquire a QA_AUTO_ order (RENDER)', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');

    order = await findOrSeedOrder(page);
    if (!order) {
      markStep('C', 1, 'FAIL', 'No QA_AUTO_ order available', 'Run --project=seed-data first.');
      expect(order, 'No QA_AUTO_ order — seed first per SKILL §0.6a').not.toBeNull();
      return;
    }
    markStep('C', 1, 'PASS',
      `Acquired order ${order.accession} with test ${order.testName} (testId=${order.testId})`);
  });

  // ---------------------------------------------------------------------------
  // Step 2 — Find a reflex rule whose source matches the order's test
  // SKILL §11 Chain C row
  // Acceptance criterion: FUNCTION (rule exists and has a usable condition)
  // ---------------------------------------------------------------------------
  test('Step 2 — Find matching reflex rule (FUNCTION)', async ({ page }) => {
    if (!order) test.skip();
    await page.goto(BASE);

    const rulesResp = await apiCall<{ rules?: ReflexRule[] } | ReflexRule[]>(
      page, '/api/OpenELIS-Global/rest/reflexrules'
    );
    if (!rulesResp.ok) {
      markStep('C', 2, 'FAIL', `Reflex rules endpoint returned HTTP ${rulesResp.status}`);
      expect(rulesResp.ok, '/rest/reflexrules not reachable').toBeTruthy();
      return;
    }
    const rules: ReflexRule[] = Array.isArray(rulesResp.body)
      ? rulesResp.body
      : ((rulesResp.body as { rules?: ReflexRule[] } | null)?.rules || []);
    if (rules.length === 0) {
      markStep('C', 2, 'FAIL',
        'No reflex rules configured on this instance',
        'Either run /MasterListsPage/reflex admin setup first, or extend seed-data script to create QA_AUTO_ rules.');
      expect(rules.length, 'No reflex rules configured').toBeGreaterThan(0);
      return;
    }

    // Find a rule whose first active condition uses our order's testId
    rule = rules.find(r =>
      r.active !== false &&
      r.conditions &&
      r.conditions.length > 0 &&
      r.conditions.some(c => c.testId === order!.testId)
    ) || null;

    if (!rule) {
      markStep('C', 2, 'FAIL',
        `Found ${rules.length} reflex rules but none target testId=${order!.testId} (${order!.testName})`,
        `Seed an order whose test matches a configured rule, or add a QA_AUTO_ rule for the current test.`);
      expect(rule, 'No reflex rule targets the order\'s test').not.toBeNull();
      return;
    }
    // Pick a value that triggers the rule. We assume `>` relation with a
    // numeric threshold; pick threshold+1 if the rule is `GREATER_THAN`,
    // pick the matching string otherwise.
    const cond = rule.conditions!.find(c => c.testId === order!.testId)!;
    if (cond.relation === 'GREATER_THAN' && cond.value) {
      const n = Number(cond.value);
      triggerValue = isNaN(n) ? cond.value : String(n + 1);
    } else {
      triggerValue = cond.value ?? '999';
    }
    markStep('C', 2, 'PASS',
      `Selected rule id=${rule.id} "${rule.ruleName || ''}" — condition ${cond.relation} ${cond.value}, trigger value ${triggerValue}`);
  });

  // ---------------------------------------------------------------------------
  // Step 3 — Enter triggering result via API substitute
  // SKILL §11.5 (BUG-31 Carbon Accept checkbox)
  // Acceptance criterion: PERSIST
  // ---------------------------------------------------------------------------
  test('Step 3 — Enter triggering result via API substitute (PERSIST, §11.5)', async ({ page }) => {
    if (!order || !rule || !triggerValue) test.skip();
    await page.goto(BASE);

    const payload = {
      paging: { totalPages: 1 },
      resultList: [
        {
          accessionNumber: order!.accession,
          testId: order!.testId,
          value: triggerValue,
          isAccept: true,
          isReject: false,
        },
      ],
    };
    const post = await apiCall<unknown>(
      page,
      '/api/OpenELIS-Global/rest/LogbookResults',
      { method: 'POST', body: payload }
    );

    if (!post.ok) {
      markStep('C', 3, 'BLOCKED',
        `LogbookResults POST returned HTTP ${post.status}`,
        `API substitute failed; can't probe whether the reflex engine fires on this path.`);
      test.info().annotations.push({ type: 'blocked', description: `LogbookResults POST ${post.status}` });
      return;
    }
    markStep('C', 3, 'PASS', `Triggering result ${triggerValue} posted to ${order!.accession}`);
  });

  // ---------------------------------------------------------------------------
  // Step 4 — Verify result persisted
  // SKILL §7.5 Round-trip
  // Acceptance criterion: ROUND-TRIP
  // ---------------------------------------------------------------------------
  test('Step 4 — Verify result persisted (ROUND-TRIP)', async ({ page }) => {
    if (!order) test.skip();
    await page.goto(BASE);
    const read = await apiCall<{ resultList?: Array<{ testId?: string; value?: string }> }>(
      page,
      `/api/OpenELIS-Global/rest/LogbookResults?accessionNumber=${encodeURIComponent(order!.accession)}`
    );
    if (!read.ok) {
      markStep('C', 4, 'FAIL', `LogbookResults read returned HTTP ${read.status}`);
      expect(read.ok).toBeTruthy();
      return;
    }
    const items = (typeof read.body === 'object' && read.body !== null)
      ? ((read.body as { resultList?: Array<{ testId?: string; value?: string }> }).resultList || [])
      : [];
    const matched = items.some(r => r.testId === order!.testId && r.value === triggerValue);
    if (!matched) {
      markStep('C', 4, 'FAIL',
        `Read-back missing the entered value`,
        `${items.length} results returned for the accession; none match testId=${order!.testId} value=${triggerValue}. ` +
        `Either Step 3 silently dropped data (BUG-8 class) or the read endpoint is filtering.`);
      expect(matched, 'Entered result not found in read-back').toBeTruthy();
      return;
    }
    markStep('C', 4, 'PASS', `Entered value ${triggerValue} read back from ${order!.accession}`);
  });

  // ---------------------------------------------------------------------------
  // Step 5 — Reflex target test auto-added to accession
  // THIS IS THE KEY STEP — the engine either fired or it didn't.
  // SKILL §11 Chain C row
  // Acceptance criterion: CROSS-LINK
  // ---------------------------------------------------------------------------
  test('Step 5 — Reflex target test auto-added (CROSS-LINK)', async ({ page }) => {
    if (!order || !rule) test.skip();
    await page.goto(BASE);

    const expectedReflexTestId = rule!.actions?.[0]?.reflexTestId;
    if (!expectedReflexTestId) {
      markStep('C', 5, 'FAIL', 'Rule has no action.reflexTestId');
      expect(expectedReflexTestId).toBeTruthy();
      return;
    }

    // Allow a short grace period — some engines run asynchronously
    await page.waitForTimeout(2000);

    const orderRead = await apiCall<{
      tests?: Array<{ testId?: string }>;
      sampleItems?: Array<{ tests?: Array<{ testId?: string }> }>;
    }>(page, `/api/OpenELIS-Global/rest/SampleEdit?labNumber=${encodeURIComponent(order!.accession)}`);

    if (!orderRead.ok) {
      markStep('C', 5, 'FAIL', `SampleEdit read returned HTTP ${orderRead.status}`);
      expect(orderRead.ok).toBeTruthy();
      return;
    }

    // The accession's test list might be flat or under sampleItems
    const allTestIds: string[] = [];
    const body = orderRead.body as {
      tests?: Array<{ testId?: string }>;
      sampleItems?: Array<{ tests?: Array<{ testId?: string }> }>;
    };
    if (Array.isArray(body?.tests)) {
      for (const t of body.tests) if (t.testId) allTestIds.push(t.testId);
    }
    if (Array.isArray(body?.sampleItems)) {
      for (const si of body.sampleItems) {
        if (Array.isArray(si.tests)) {
          for (const t of si.tests) if (t.testId) allTestIds.push(t.testId);
        }
      }
    }

    const found = allTestIds.includes(expectedReflexTestId);
    if (!found) {
      markStep('C', 5, 'FAIL',
        `REFLEX ENGINE DID NOT FIRE: rule id=${rule!.id} should have added testId=${expectedReflexTestId} to ${order!.accession}, but only these tests are present: [${allTestIds.join(', ')}]`,
        `This is a definitive answer to Phase 28's unverified question. ` +
        `Either the reflex engine doesn't process API-direct writes, or it doesn't process this rule, or it isn't enabled. ` +
        `If this fails consistently, file a new bug: "Reflex engine does not fire on API result writes."`);
      expect(found, `Reflex engine did not auto-add testId=${expectedReflexTestId}`).toBeTruthy();
      return;
    }
    markStep('C', 5, 'PASS',
      `REFLEX ENGINE FIRED: testId=${expectedReflexTestId} auto-added to ${order!.accession} after triggering result`);
  });

  // ---------------------------------------------------------------------------
  // Step 6 — Reflex test appears in Workplan/Logbook
  // SKILL §11 Chain C row + §13 Y-RECON spillover
  // Acceptance criterion: CROSS-LINK (different surface than Step 5)
  // ---------------------------------------------------------------------------
  test('Step 6 — Reflex test appears in Logbook for the patient (CROSS-LINK)', async ({ page }) => {
    if (!order || !rule) test.skip();
    await page.goto(BASE);

    const expectedReflexTestId = rule!.actions?.[0]?.reflexTestId;
    if (!expectedReflexTestId) test.skip();

    const list = await apiCall<{ logbookList?: Array<{ accessionNumber?: string; testId?: string }> }>(
      page,
      `/api/OpenELIS-Global/rest/LogbookResults?patientPK=${encodeURIComponent(order!.patientID)}`
    );
    if (!list.ok) {
      markStep('C', 6, 'FAIL', `LogbookResults returned HTTP ${list.status}`);
      expect(list.ok).toBeTruthy();
      return;
    }
    const items = (typeof list.body === 'object' && list.body !== null)
      ? ((list.body as { logbookList?: Array<{ accessionNumber?: string; testId?: string }> }).logbookList || [])
      : [];
    const found = items.some(
      r => r.accessionNumber === order!.accession && r.testId === expectedReflexTestId
    );
    if (!found) {
      markStep('C', 6, 'FAIL',
        `Reflex test ${expectedReflexTestId} present on accession (Step 5) but missing from Logbook`,
        `Engine fired but projection to the work queue is broken — different bug than Step 5 failure.`);
      expect(found).toBeTruthy();
      return;
    }
    markStep('C', 6, 'PASS', `Reflex test ${expectedReflexTestId} surfaces in Logbook for patient ${order!.patientNationalId}`);
  });
});
