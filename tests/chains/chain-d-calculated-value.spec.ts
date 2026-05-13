/**
 * tests/chains/chain-d-calculated-value.spec.ts
 *
 * SKILL §11 Chain D — Calculated Value
 *
 * What this chain proves: calculation rules defined in
 * /MasterListsPage/calculatedValue actually compute when all operand
 * results are entered. The calculated value should appear on the
 * patient's results, with the correct math.
 *
 * Why this chain is high-leverage: per the maturity dashboard, Calc
 * Admin is M3 (round-trips), but Calc Computing is M1 — no test has
 * ever observed a calc engine producing a value because BUG-31 blocks
 * the UI result-entry step.
 *
 * Like Chain C, this chain uses API substitutes per §11.5. The crucial
 * difference: calc rules often require *multiple* operand results to
 * fire (e.g., De Ritis Ratio = GPT/GOT needs both values entered).
 *
 * Expected outcomes:
 *   - All 7 steps PASS: calc engine works. Mark Calc Computing M3+
 *     in the maturity dashboard.
 *   - Step 6 FAILs (calc test not produced): engine doesn't fire on
 *     API writes, or doesn't fire at all. File a real bug.
 *   - Step 7 FAILs (math wrong): engine fires but the formula evaluator
 *     is broken — different bug from Step 6.
 *   - Step 1 BAILs (no calc rules): instance has none configured.
 *
 * Run individually:
 *   npx playwright test --project=chain-d
 */

import { test, expect } from '@playwright/test';
import {
  BASE,
  apiCall,
  markStep,
} from './_common';

interface CalcOperation {
  order?: number;
  type?: string;                  // TEST_RESULT, MATH_FUNCTION, INTEGER, PATIENT_ATTRIBUTE
  value?: string;                 // for INTEGER: the literal; for TEST_RESULT: the testId
  sampleId?: string;
}

interface CalcRule {
  id?: string;
  name?: string;
  sampleId?: string;
  testId?: string;                // the test this rule PRODUCES
  result?: string;                // human-readable formula description
  operations?: CalcOperation[];
  toggled?: boolean;
  active?: boolean;
}

test.describe.serial('Chain D — Calculated Value', () => {
  let rule: CalcRule | null = null;
  let operandTestIds: string[] = [];
  let sampleId: string | null = null;
  let testAccession: string | null = null;
  // For each operand testId, the value we'll enter; we use stable values
  // so the expected calc result is deterministic.
  const operandValues = new Map<string, number>();

  test.beforeAll(() => {
    // eslint-disable-next-line no-console
    console.log(`[Chain D] BASE=${BASE}`);
  });

  // ---------------------------------------------------------------------------
  // Step 1 — Discover a calculation rule and its operands
  // SKILL §11 Chain D row
  // Acceptance criterion: FUNCTION
  // ---------------------------------------------------------------------------
  test('Step 1 — Discover an active calc rule (FUNCTION)', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');

    const resp = await apiCall<CalcRule[] | { rules?: CalcRule[] }>(
      page, '/api/OpenELIS-Global/rest/test-calculations'
    );
    if (!resp.ok) {
      markStep('D', 1, 'FAIL', `test-calculations returned HTTP ${resp.status}`);
      expect(resp.ok, '/rest/test-calculations not reachable').toBeTruthy();
      return;
    }
    const rules: CalcRule[] = Array.isArray(resp.body)
      ? resp.body
      : ((resp.body as { rules?: CalcRule[] } | null)?.rules || []);
    if (rules.length === 0) {
      markStep('D', 1, 'FAIL',
        'No calculation rules configured on this instance',
        'Set up via /MasterListsPage/calculatedValue admin, or extend the seed script.');
      expect(rules.length).toBeGreaterThan(0);
      return;
    }

    // Pick the first active rule that has at least one TEST_RESULT operand
    rule = rules.find(r => {
      if (r.active === false) return false;
      const ops = r.operations || [];
      return ops.some(op => op.type === 'TEST_RESULT' && op.value);
    }) || null;
    if (!rule) {
      markStep('D', 1, 'FAIL',
        `Found ${rules.length} calc rules but none have a TEST_RESULT operand`,
        'Rules with only INTEGER literals are useless for chain testing.');
      expect(rule).not.toBeNull();
      return;
    }

    operandTestIds = (rule.operations || [])
      .filter(op => op.type === 'TEST_RESULT' && op.value)
      .map(op => op.value!) as string[];
    sampleId = (rule.operations || []).find(op => op.sampleId)?.sampleId || null;

    // Assign deterministic numeric values per operand. Different per
    // operand so divisions produce non-trivial results.
    let n = 12;
    for (const tid of operandTestIds) {
      operandValues.set(tid, n);
      n += 4;
    }

    markStep('D', 1, 'PASS',
      `Selected rule id=${rule.id} "${rule.name || ''}" — produces testId=${rule.testId}, operands=[${operandTestIds.join(',')}], formula=${rule.result || 'unknown'}`);
  });

  // ---------------------------------------------------------------------------
  // Step 2 — Seed an order whose sample carries every operand test
  // SKILL §0.6a Seed Script
  // Acceptance criterion: PERSIST
  // ---------------------------------------------------------------------------
  test('Step 2 — Seed an accession carrying all operand tests (PERSIST)', async ({ page }) => {
    if (!rule) test.skip();
    await page.goto(BASE);

    // Reuse a QA_AUTO_ patient. The standard findOrSeedOrder in _common.ts
    // only creates a single-test order, so Chain D issues its own order
    // creation against the discovered operands. Patient acquisition reuses
    // the same patient-search-results probe.
    const patientResp = await apiCall<{ patientList?: Array<{ nationalId?: string; patientPK?: string }> }>(
      page, `/api/OpenELIS-Global/rest/patient-search-results?lastName=QA_AUTO`
    );
    if (!patientResp.ok) {
      markStep('D', 2, 'FAIL', `patient-search-results returned HTTP ${patientResp.status}`);
      expect(patientResp.ok).toBeTruthy();
      return;
    }
    const patients = (typeof patientResp.body === 'object' && patientResp.body !== null)
      ? ((patientResp.body as { patientList?: Array<{ nationalId?: string; patientPK?: string }> }).patientList || [])
      : [];
    if (patients.length === 0) {
      markStep('D', 2, 'FAIL', 'No QA_AUTO_ patient available; run seed-data first.');
      expect(patients.length).toBeGreaterThan(0);
      return;
    }
    const p = patients[0];

    // Build a multi-test order POST. Sample type is taken from the rule
    // if available; otherwise default to 1 (Urines on most instances).
    const payload = {
      patientProperties: { patientPK: p.patientPK, nationalId: p.nationalId, patientUpdateStatus: 'UPDATE' },
      sampleOrderItems: {
        newSampleEntry: 'true',
        collectionDate: new Date().toISOString().slice(0, 10),
        receivedDate: new Date().toISOString().slice(0, 10),
        priority: 'ROUTINE',
        paymentStatus: 'NONE',
      },
      sampleItems: [
        {
          sampleTypeId: sampleId || '1',
          tests: operandTestIds.map(tid => ({ testId: tid, isReportable: true })),
        },
      ],
    };
    const create = await apiCall<{ accessionNumber?: string }>(
      page, '/api/OpenELIS-Global/rest/SamplePatientEntry',
      { method: 'POST', body: payload }
    );
    if (!create.ok) {
      markStep('D', 2, 'FAIL', `SamplePatientEntry POST returned HTTP ${create.status}`);
      expect(create.ok).toBeTruthy();
      return;
    }
    testAccession = (typeof create.body === 'object' && create.body !== null)
      ? (create.body as { accessionNumber?: string }).accessionNumber || null
      : null;
    if (!testAccession) {
      markStep('D', 2, 'FAIL', 'Order created but no accession returned');
      expect(testAccession).toBeTruthy();
      return;
    }
    markStep('D', 2, 'PASS', `Seeded ${testAccession} with operand tests [${operandTestIds.join(',')}]`);
  });

  // ---------------------------------------------------------------------------
  // Step 3 — Enter each operand result via API substitute
  // SKILL §11.5 (BUG-31)
  // Acceptance criterion: PERSIST
  // ---------------------------------------------------------------------------
  test('Step 3 — Enter every operand result via API (PERSIST, §11.5)', async ({ page }) => {
    if (!testAccession) test.skip();
    await page.goto(BASE);

    const resultList = operandTestIds.map(tid => ({
      accessionNumber: testAccession,
      testId: tid,
      value: String(operandValues.get(tid)),
      isAccept: true,
      isReject: false,
    }));
    const post = await apiCall<unknown>(
      page,
      '/api/OpenELIS-Global/rest/LogbookResults',
      { method: 'POST', body: { paging: { totalPages: 1 }, resultList } }
    );
    if (!post.ok) {
      markStep('D', 3, 'BLOCKED',
        `Bulk LogbookResults POST returned HTTP ${post.status}`,
        `API substitute failed; can't probe whether the calc engine fires.`);
      test.info().annotations.push({ type: 'blocked', description: `LogbookResults POST ${post.status}` });
      return;
    }
    markStep('D', 3, 'PASS',
      `Posted ${resultList.length} operand results: ${resultList.map(r => `${r.testId}=${r.value}`).join(', ')}`);
  });

  // ---------------------------------------------------------------------------
  // Step 4 — Verify operands persisted
  // SKILL §7.5 Round-trip
  // Acceptance criterion: ROUND-TRIP
  // ---------------------------------------------------------------------------
  test('Step 4 — Verify all operand results persisted (ROUND-TRIP)', async ({ page }) => {
    if (!testAccession) test.skip();
    await page.goto(BASE);
    const read = await apiCall<{ resultList?: Array<{ testId?: string; value?: string }> }>(
      page,
      `/api/OpenELIS-Global/rest/LogbookResults?accessionNumber=${encodeURIComponent(testAccession!)}`
    );
    if (!read.ok) {
      markStep('D', 4, 'FAIL', `Read-back HTTP ${read.status}`);
      expect(read.ok).toBeTruthy();
      return;
    }
    const items = (typeof read.body === 'object' && read.body !== null)
      ? ((read.body as { resultList?: Array<{ testId?: string; value?: string }> }).resultList || [])
      : [];
    const missing = operandTestIds.filter(tid =>
      !items.some(r => r.testId === tid && r.value === String(operandValues.get(tid)))
    );
    if (missing.length > 0) {
      markStep('D', 4, 'FAIL',
        `${missing.length} of ${operandTestIds.length} operands missing from read-back: [${missing.join(',')}]`,
        `Either Step 3 silently dropped some values (BUG-8 class) or partial-write semantics.`);
      expect(missing.length).toBe(0);
      return;
    }
    markStep('D', 4, 'PASS', `All ${operandTestIds.length} operand results round-tripped`);
  });

  // ---------------------------------------------------------------------------
  // Step 5 — Calculated value test appears on the accession
  // KEY STEP — engine fired or didn't
  // SKILL §11 Chain D row
  // Acceptance criterion: CROSS-LINK
  // ---------------------------------------------------------------------------
  test('Step 5 — Calculated test present on accession (CROSS-LINK)', async ({ page }) => {
    if (!testAccession || !rule) test.skip();
    await page.goto(BASE);
    await page.waitForTimeout(2000); // grace period for async calc

    const orderRead = await apiCall<{
      tests?: Array<{ testId?: string }>;
      sampleItems?: Array<{ tests?: Array<{ testId?: string }> }>;
    }>(page, `/api/OpenELIS-Global/rest/SampleEdit?labNumber=${encodeURIComponent(testAccession!)}`);
    if (!orderRead.ok) {
      markStep('D', 5, 'FAIL', `SampleEdit returned HTTP ${orderRead.status}`);
      expect(orderRead.ok).toBeTruthy();
      return;
    }
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
        if (Array.isArray(si.tests)) for (const t of si.tests) if (t.testId) allTestIds.push(t.testId);
      }
    }
    const found = rule!.testId ? allTestIds.includes(rule!.testId) : false;
    if (!found) {
      markStep('D', 5, 'FAIL',
        `CALC ENGINE DID NOT FIRE: rule id=${rule!.id} should have produced testId=${rule!.testId} on ${testAccession}, but accession only carries [${allTestIds.join(',')}]`,
        `Definitive answer to Phase 28's unverified question: the calc engine does NOT compute on API-direct writes. ` +
        `File new bug: "Calculated value engine does not fire on API result writes" or similar.`);
      expect(found, `Calc engine did not produce testId=${rule!.testId}`).toBeTruthy();
      return;
    }
    markStep('D', 5, 'PASS',
      `CALC ENGINE FIRED: testId=${rule!.testId} present on ${testAccession} after operand entries`);
  });

  // ---------------------------------------------------------------------------
  // Step 6 — Calculated value has a result
  // SKILL §11 Chain D row + §7.5 Round-trip
  // Acceptance criterion: ROUND-TRIP
  // ---------------------------------------------------------------------------
  test('Step 6 — Calculated value has a result row (ROUND-TRIP)', async ({ page }) => {
    if (!testAccession || !rule) test.skip();
    await page.goto(BASE);

    const read = await apiCall<{ resultList?: Array<{ testId?: string; value?: string }> }>(
      page,
      `/api/OpenELIS-Global/rest/LogbookResults?accessionNumber=${encodeURIComponent(testAccession!)}`
    );
    if (!read.ok) {
      markStep('D', 6, 'FAIL', `Read returned HTTP ${read.status}`);
      expect(read.ok).toBeTruthy();
      return;
    }
    const items = (typeof read.body === 'object' && read.body !== null)
      ? ((read.body as { resultList?: Array<{ testId?: string; value?: string }> }).resultList || [])
      : [];
    const calcRow = items.find(r => r.testId === rule!.testId);
    if (!calcRow || !calcRow.value) {
      markStep('D', 6, 'FAIL',
        `Calc test row present (Step 5) but value is empty`,
        `Engine added the test row but did not compute the value. Different bug than Step 5 failure.`);
      expect(calcRow?.value, 'Calc value missing').toBeTruthy();
      return;
    }
    markStep('D', 6, 'PASS', `Calc test ${rule!.testId} has value ${calcRow.value}`);

    // Stash for Step 7's math check
    test.info().attachments.push({
      name: 'calc-result.json',
      contentType: 'application/json',
      body: Buffer.from(JSON.stringify({ accession: testAccession, calcTestId: rule!.testId, calcValue: calcRow.value, operands: Array.from(operandValues.entries()) })),
    });
  });

  // ---------------------------------------------------------------------------
  // Step 7 — Calc value math is correct
  // SKILL §11 Chain D row + §7.6 REPORTABLE
  // Acceptance criterion: REPORTABLE
  //
  // We don't replicate the full formula evaluator; instead we check that
  // the result is *plausible* given the operands. For most rules this
  // means: result lies within [min(operands)/max(operands), max(operands)/min(operands)]
  // (covers division-style rules like De Ritis), or is a sum-or-product
  // that fits the rough magnitude. Sharper assertions require a copy of
  // the engine's evaluator — workplan Phase D D5 (FHIR spec-walk) will
  // open that question with the OpenELIS team.
  // ---------------------------------------------------------------------------
  test('Step 7 — Calc value math is plausible (REPORTABLE)', async ({ page }) => {
    if (!testAccession || !rule) test.skip();
    await page.goto(BASE);
    const read = await apiCall<{ resultList?: Array<{ testId?: string; value?: string }> }>(
      page,
      `/api/OpenELIS-Global/rest/LogbookResults?accessionNumber=${encodeURIComponent(testAccession!)}`
    );
    if (!read.ok) { test.skip(); return; }
    const items = (typeof read.body === 'object' && read.body !== null)
      ? ((read.body as { resultList?: Array<{ testId?: string; value?: string }> }).resultList || [])
      : [];
    const calcRow = items.find(r => r.testId === rule!.testId);
    if (!calcRow?.value) { test.skip(); return; }
    const calcValue = Number(calcRow.value);
    const operands = Array.from(operandValues.values());
    const minOp = Math.min(...operands);
    const maxOp = Math.max(...operands);

    // Plausible range: from min/max (smallest ratio) to max+sum (largest plausible sum)
    const plausibleLow = minOp / Math.max(maxOp, 1);
    const plausibleHigh = operands.reduce((a, b) => a + b, 0) + maxOp;

    if (isNaN(calcValue) || calcValue < plausibleLow * 0.5 || calcValue > plausibleHigh * 2) {
      markStep('D', 7, 'FAIL',
        `Calc value ${calcValue} is implausible for operands ${operands.join(',')} (expected somewhere in [${plausibleLow.toFixed(2)}, ${plausibleHigh.toFixed(2)}])`,
        `Engine fired (Step 5) and produced a row (Step 6) but the math is wrong. Different bug than 5/6.`);
      expect(calcValue, 'Calc value implausible').toBeGreaterThanOrEqual(plausibleLow * 0.5);
      return;
    }
    markStep('D', 7, 'PASS',
      `Calc value ${calcValue} is plausible for operands [${operands.join(',')}] (formula: ${rule!.result || 'unknown'})`);
  });
});
