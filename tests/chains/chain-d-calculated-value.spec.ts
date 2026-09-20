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
 * Calc Computing is now M4 — VERIFIED on v3.2.1.10 (indonesiadev), where
 * BUG-31 does NOT reproduce. The calc engine ADDS the output test (with
 * its computed result) on result SAVE, but ONLY when that test is not
 * already on the order — it does NOT back-fill a pre-ordered output row.
 * FALSE-NEGATIVE TRAP: never pre-order the output test (Step 2 already
 * orders operands only). Supports numeric AND select-list/dictionary
 * outputs (a relational rule sets a chosen dictionary value, e.g.
 * Creatinine >= 5 -> Urine pregnancy test = Positive). On builds where
 * BUG-31 is present, use the section 11.5 API substitute for result entry.
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
  createLegacyOrder,
  enterResultsForLabNumber,
  markStep,
  readResultsForLabNumber,
  recallChainState,
  rememberChainState,
  requireStep,
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
  // NUMBER on the wire. The server sends `"testId":4`; this was declared as a
  // string, and Step 5 compared it with `includes()` against the string ids the
  // result form serves. 4 !== '4', so the step reported "CALC ENGINE DID NOT
  // FIRE ... but the accession carries [4,5]" — naming the very test it claimed
  // was missing. Everything below goes through outputTestId().
  testId?: string | number;       // the test this rule PRODUCES
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

  /**
   * Chain D's state, surviving a worker restart.
   *
   * Same reason as Chain A: a failed step retries in a NEW worker, where every
   * module-level value above is undefined again, and the remaining steps used to
   * BLOCK on `!testAccession || !rule` and report a cascade around one real
   * failure. Written to the run's own output directory, which Playwright clears
   * at the start of every run, so this can only ever rehydrate THIS run.
   */
  interface ChainDState {
    rule: CalcRule | null;
    operandTestIds: string[];
    sampleId: string | null;
    testAccession: string | null;
    operandValues: Array<[string, number]>;
  }

  /**
   * The rule's output test id, as a string.
   *
   * Ids arrive as numbers from /rest/test-calculations and as strings from the
   * result form, and a mixed-type comparison here manufactures a calc-engine
   * defect out of a correctly working engine. Every comparison uses this.
   */
  const outputTestId = (): string => String(rule?.testId ?? '');

  const remember = () => rememberChainState('D', {
    rule, operandTestIds, sampleId, testAccession,
    operandValues: Array.from(operandValues.entries()),
  } as ChainDState);

  /** Rehydrate anything this worker is missing. Never invents: absent stays absent. */
  const recall = () => {
    if (rule && testAccession) return;
    const saved = recallChainState<ChainDState>('D');
    if (!saved) return;
    rule = rule ?? saved.rule;
    sampleId = sampleId ?? saved.sampleId;
    testAccession = testAccession ?? saved.testAccession;
    if (!operandTestIds.length) operandTestIds = saved.operandTestIds || [];
    if (!operandValues.size) for (const [k, v] of saved.operandValues || []) operandValues.set(k, v);
  };

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
    remember();
  });

  // ---------------------------------------------------------------------------
  // Step 2 — Seed an order whose sample carries every operand test
  // SKILL §0.6a Seed Script
  // Acceptance criterion: PERSIST
  // ---------------------------------------------------------------------------
  test('Step 2 — Seed an accession carrying all operand tests (PERSIST)', async ({ page }) => {
    recall();
    requireStep('D', 2, !!rule, '!rule');
    await page.goto(BASE);

    // The standard findOrSeedOrder() in _common.ts only creates a single-test
    // order, so Chain D orders the discovered operands itself.
    // Legacy-lane order creation. Step 2 used to POST an invented JSON body
    // (`sampleItems` / `collectionDate`, no labNo) which the controller cannot
    // read — it 400'd on every nightly run since the chain was written, and the
    // markStep only printed the status, so the body never made it into the log.
    // createLegacyOrder() carries the contract the server actually accepts
    // (real labNo from the generator + sampleXML whose `tests` attribute is the
    // comma-separated operand list) and returns the response body on failure.
    // ORDER_PATH DEVIATION, stated out loud rather than silently: this step always uses
    // the LEGACY lane, even when the run sets ORDER_PATH=domain. The domain wizard cannot
    // order an arbitrary set of tests (it walks a three-lane UI), and a calc rule only
    // fires when every one of its operands is on the sample. Retire this deviation when
    // the domain lane can take an explicit test list.
    // eslint-disable-next-line no-console
    console.log(`[Chain D · Step 2] ORDER_PATH=${process.env.ORDER_PATH ?? '(unset)'} — using the LEGACY lane regardless (see note above)`);

    let failReason = '';
    const order = await createLegacyOrder(page, {
      testIds: operandTestIds,
      sampleTypeId: sampleId || undefined,
      log: (m) => {
        failReason = m;
        // eslint-disable-next-line no-console
        console.log(`[Chain D · Step 2] ${m}`);
      },
    });
    if (!order) {
      // markStep FAIL raises; the reason carries the server's own response body.
      markStep('D', 2, 'FAIL', `Order creation failed: ${failReason || 'no detail'}`);
      return;
    }
    // A partial order cannot exercise the calc engine: the rule will not fire
    // without every operand present, so a missing operand would read as a calc
    // bug at Step 6 when it is really a fixture gap on this instance.
    if (order.missingTestIds.length) {
      markStep('D', 2, 'GAP',
        `No sample type on this instance binds all operands of rule ${rule!.id}: `
        + `got [${order.testIds.join(',')}] on sample type ${order.sampleTypeId} "${order.sampleTypeName}", `
        + `missing [${order.missingTestIds.join(',')}]. The calc rule is unorderable here, so Steps 3-7 `
        + `would read a fixture gap as a calc-engine defect.`);
      return;
    }
    // PERSIST round-trip, on a different surface than the one that created the order
    // (SKILL 7.5): the accession must actually CARRY every operand, or Steps 3-7 are
    // measuring the wrong thing. The old version of this step asserted nothing beyond
    // the POST's HTTP status. The rows come back unresulted at this point, so what is
    // asserted here is presence of the test, not a value.
    const back = await readResultsForLabNumber(page, order.labNo);
    const absent = operandTestIds.filter(tid => !back.values.has(tid));
    expect(absent,
      `Order ${order.labNo} was created but the result form does not carry operand test(s) `
      + `[${absent.join(',')}] — it carries [${Array.from(back.values.keys()).join(',')}]`).toEqual([]);

    testAccession = order.labNo;
    remember();
    markStep('D', 2, 'PASS',
      `Seeded ${testAccession} on sample type ${order.sampleTypeId} "${order.sampleTypeName}" `
      + `with operand tests [${order.testIds.join(',')}]${order.bug37 ? ' — WARNING: no patient linkage (BUG-37)' : ''}`);
  });

  // ---------------------------------------------------------------------------
  // Step 3 — Enter each operand result via API substitute
  // SKILL §11.5 (BUG-31)
  // Acceptance criterion: PERSIST
  // ---------------------------------------------------------------------------
  test('Step 3 — Enter every operand result via API (PERSIST, §11.5)', async ({ page }) => {
    recall();
    requireStep('D', 3, !!testAccession, '!testAccession');
    await page.goto(BASE);

    // Same correction as Chain A Step 3: POST /rest/LogbookResults binds a whole
    // LogbookResultsForm (`testResult`, reconciled against the page cached in the
    // session by the preceding GET), not a hand-built `resultList`. The old body
    // here returned HTTP 400 every run, which left the calc engine untested.
    const res = await enterResultsForLabNumber(page, testAccession!, {
      valueByTestId: Object.fromEntries(
        operandTestIds.map(tid => [tid, String(operandValues.get(tid))]),
      ),
    });
    if (!res.ok) {
      markStep('D', 3, 'BLOCKED',
        `Operand result entry failed: ${res.reason}`,
        `API substitute failed; can't probe whether the calc engine fires.`);
      test.info().annotations.push({ type: 'blocked', description: res.reason });
      return;
    }
    // The engine only fires when EVERY operand carries a value, so a partial
    // write has to be caught here rather than read as a calc failure at Step 5.
    const notEntered = operandTestIds.filter(tid => !res.entered.has(tid));
    expect(notEntered,
      `Operand test(s) [${notEntered.join(',')}] were not on the result form for ${testAccession} — `
      + `the form carried [${Array.from(res.entered.keys()).join(',')}]`).toEqual([]);

    markStep('D', 3, 'PASS',
      `Entered ${operandTestIds.length} operand result(s): `
      + operandTestIds.map(tid => `${tid}=${operandValues.get(tid)}`).join(', '));
  });

  // ---------------------------------------------------------------------------
  // Step 4 — Verify operands persisted
  // SKILL §7.5 Round-trip
  // Acceptance criterion: ROUND-TRIP
  // ---------------------------------------------------------------------------
  test('Step 4 — Verify all operand results persisted (ROUND-TRIP)', async ({ page }) => {
    recall();
    requireStep('D', 4, !!testAccession, '!testAccession');
    await page.goto(BASE);
    // Read back on the labNumber-keyed surface. This used to read
    // `resultList[].value` from an `accessionNumber=` GET, which that endpoint
    // answers with an empty page - so the round-trip could never see anything.
    const read = await readResultsForLabNumber(page, testAccession!);
    if (!read.ok) {
      markStep('D', 4, 'FAIL', `Read-back HTTP ${read.status}`);
      return;
    }
    const missing = operandTestIds.filter(tid => read.values.get(tid) !== String(operandValues.get(tid)));
    if (missing.length > 0) {
      markStep('D', 4, 'FAIL',
        `${missing.length} of ${operandTestIds.length} operands missing or wrong on read-back: [${missing.join(',')}]`,
        `Expected ${operandTestIds.map(t => `${t}=${operandValues.get(t)}`).join(', ')}; `
        + `read ${Array.from(read.values.entries()).map(([k, v]) => `${k}=${v}`).join(', ')}. `
        + `Either Step 3 silently dropped some values (BUG-8 class) or partial-write semantics.`);
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
    recall();
    requireStep('D', 5, !(!testAccession || !rule), '!testAccession || !rule');
    await page.goto(BASE);
    await page.waitForTimeout(4000); // grace for async server-side calc (row appears after save, sometimes only on a later read)

    // This step used to read GET /rest/SampleEdit?labNumber=, which returns the BLANK
    // form scaffold on this build regardless of the lab number (the same trap Chain A
    // Step 2 documents). It therefore reported "accession only carries []" every run -
    // a manufactured "calc engine did not fire" finding that says nothing about the
    // engine. The result form is the surface that actually lists every analysis on the
    // sample, including one the engine added.
    const orderRead = await readResultsForLabNumber(page, testAccession!);
    if (!orderRead.ok) {
      markStep('D', 5, 'FAIL', `LogbookResults read returned HTTP ${orderRead.status}`);
      return;
    }
    const allTestIds = Array.from(orderRead.values.keys());
    if (!allTestIds.length) {
      // No rows at all is a read problem, not an engine verdict. Say so rather than
      // blaming the calc engine for an empty page.
      markStep('D', 5, 'FAIL',
        `Read-back for ${testAccession} returned no analyses at all`,
        `Step 3 entered results against this accession, so an empty result form is a harness `
        + `or data problem - it is NOT evidence about the calculated-value engine.`);
      expect(allTestIds.length, 'result form returned no analyses').toBeGreaterThan(0);
      return;
    }
    const found = outputTestId() !== '' && allTestIds.includes(outputTestId());
    if (!found) {
      markStep('D', 5, 'FAIL',
        `CALC ENGINE DID NOT FIRE: rule id=${rule!.id} should have produced testId=${outputTestId()} on ${testAccession}, but the accession carries [${allTestIds.join(',')}]`,
        `Definitive answer to Phase 28's unverified question: the calc engine does NOT compute on API-direct writes. ` +
        `File new bug: "Calculated value engine does not fire on API result writes" or similar.`);
      expect(allTestIds, `Calc engine did not produce testId=${outputTestId()}`).toContain(outputTestId());
      return;
    }
    markStep('D', 5, 'PASS',
      `CALC ENGINE FIRED: testId=${outputTestId()} present on ${testAccession} after operand entries`);
  });

  // ---------------------------------------------------------------------------
  // Step 6 — Calculated value has a result
  // SKILL §11 Chain D row + §7.5 Round-trip
  // Acceptance criterion: ROUND-TRIP
  // ---------------------------------------------------------------------------
  test('Step 6 — Calculated value has a result row (ROUND-TRIP)', async ({ page }) => {
    recall();
    requireStep('D', 6, !(!testAccession || !rule), '!testAccession || !rule');
    await page.goto(BASE);

    // labNumber-keyed read (see readResultsForLabNumber): the accessionNumber
    // parameter returns an empty page from this endpoint, so the old version of
    // this step could only ever report "no calc row".
    const read = await readResultsForLabNumber(page, testAccession!);
    if (!read.ok) {
      markStep('D', 6, 'FAIL', `Read returned HTTP ${read.status}`);
      return;
    }
    const items = Array.from(read.values.entries()).map(([testId, value]) => ({ testId, value }));
    const calcRow = items.find(r => String(r.testId) === outputTestId());
    if (!calcRow || !calcRow.value) {
      markStep('D', 6, 'FAIL',
        `Calc test row present (Step 5) but value is empty`,
        `Engine added the test row but did not compute the value. Different bug than Step 5 failure.`);
      expect(calcRow?.value, 'Calc value missing').toBeTruthy();
      return;
    }
    markStep('D', 6, 'PASS', `Calc test ${outputTestId()} has value ${calcRow.value}`);

    // Stash for Step 7's math check
    test.info().attachments.push({
      name: 'calc-result.json',
      contentType: 'application/json',
      body: Buffer.from(JSON.stringify({ accession: testAccession, calcTestId: outputTestId(), calcValue: calcRow.value, operands: Array.from(operandValues.entries()) })),
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
    recall();
    requireStep('D', 7, !(!testAccession || !rule), '!testAccession || !rule');
    await page.goto(BASE);
    const read = await readResultsForLabNumber(page, testAccession!);
    if (!read.ok) {
      markStep('D', 7, 'FAIL', `LogbookResults read returned HTTP ${read.status}`,
        'The endpoint exists on this build, so a non-2xx is a failure and not a declarable gap ' +
        '(known-gaps.ts, "WHAT DOES NOT [belong here]").');
      return;
    }
    const items = Array.from(read.values.entries()).map(([testId, value]) => ({ testId, value }));
    const calcRow = items.find(r => String(r.testId) === outputTestId());
    if (!calcRow?.value) {
      markStep('D', 7, 'FAIL',
        `Calc engine wrote no value for output test ${outputTestId()} on ${testAccession}`,
        `LogbookResults returned ${items.length} row(s), none of them the rule's output test with a ` +
        `value. Steps 5-6 posted the trigger, so an empty output is the calculated-value gap this ` +
        `chain exists to detect — not a reason to opt out.`);
      return;
    }
    const calcValue = Number(calcRow.value);

    // Select-list / dictionary calc outputs are non-numeric (e.g. "Positive",
    // or a dictionary id) — they come from relational rules of the form
    // "if Test A >= X -> set [dictionary test] = [value]". Numeric plausibility
    // does not apply; assert the engine wrote a non-empty dictionary result.
    if (isNaN(calcValue)) {
      const dv = String(calcRow.value).trim();
      if (dv.length > 0) {
        markStep('D', 7, 'PASS',
          `Select-list calc output: ${outputTestId()} = "${dv}" (dictionary value set by relational rule; numeric plausibility N/A)`);
      } else {
        markStep('D', 7, 'FAIL', `Dictionary calc output present but empty for testId=${outputTestId()}`);
        expect(dv.length, 'Dictionary calc value empty').toBeGreaterThan(0);
      }
      return;
    }

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
