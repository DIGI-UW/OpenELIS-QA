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

import { test, expect, Page } from '@playwright/test';
import {
  BASE,
  apiCall,
  enterResultsForLabNumber,
  findOrSeedOrder,
  extractPdfText,
  markStep,
  ChainOrderRef,
  readResultsForLabNumber,
  recallChainState,
  rememberChainState,
  requireStep,
  validateResultsForLabNumber,
} from './_common';

// SERIAL REMOVED 2026-09-05 (harness reference 12.10).
//
// This chain was `test.describe.serial`, so one failing step skipped every
// later one. Step 2 (the BUG-37 patient-linkage check) fails on `testing`, and
// it was taking Steps 3-8 with it — the whole result -> validate -> report ->
// FHIR spine — even though nothing downstream reads anything Step 2 sets.
//
// Serial is not needed here: every step from 2 on already guards its own
// precondition (`requireStep(...)`, plus Step 6 on `order.pdf` and
// Step 8 on `order.fhir`). regression-chains.config.ts runs `workers: 1` with
// `fullyParallel: false`, so declaration order is still execution order — the
// only change is that one failing step no longer cancels the rest, and a retry
// re-runs just that step instead of the whole group.
//
// Chains whose later steps genuinely depend on an earlier one (C on `rule` and
// `triggerValue`, D on `testAccession`) keep `.serial` deliberately. Do not
// remove it there without redoing the dependency audit in 12.10.
test.describe('Chain A — Order Lifecycle', () => {
  let order: ChainOrderRef | null = null;
  const enteredResultValue = '12.5'; // arbitrary numeric we expect to round-trip

  /**
   * The order this chain is working on, surviving a worker restart.
   *
   * A failed step retries in a fresh worker, where the module-level `order` above
   * is undefined again — so every later step in that worker used to BLOCK on
   * `!order` and report a cascade for a chain whose Step 1 had succeeded. Step 1
   * writes the order to the run's output directory; this reads it back. If Step 1
   * never succeeded there is nothing to read and the step BLOCKs, as it should.
   */
  const currentOrder = (): ChainOrderRef | null => {
    if (!order) order = recallChainState<ChainOrderRef>('A');
    return order;
  };

  /** The Patient Status Report the Routine Reports screen sends. See Step 5. */
  const REPORT = 'patientCILNSP_vreduit';
  const reportUrl = (accession: string) =>
    `/api/OpenELIS-Global/ReportPrint?report=${REPORT}&type=patient`
    + `&accessionDirect=${encodeURIComponent(accession)}`
    + `&highAccessionDirect=${encodeURIComponent(accession)}`;

  /**
   * FHIR base paths, in the order fhir-integration.spec.ts established: the
   * app-mounted one first, then the two standalone mounts.
   */
  const fhirBases = ['/api/OpenELIS-Global/fhir', '/fhir', '/hapi-fhir-jpaserver/fhir'];

  interface FhirObservation {
    id?: string;
    valueQuantity?: { value?: number; unit?: string };
    valueString?: string;
    basedOn?: Array<{ reference?: string }>;
  }
  interface FhirLookup {
    base: string;
    serviceRequestId: string;
    observations: FhirObservation[];
  }

  /**
   * Resolve an accession to its Observations the way the data is actually linked:
   * the accession identifies a ServiceRequest, and the Observation points back at
   * it through basedOn. Returns what it found rather than asserting, so Step 7 and
   * Step 8 can each report the half they are responsible for.
   */
  async function fetchObservationBundle(page: Page, accession: string): Promise<FhirLookup> {
    type Bundle = { entry?: Array<{ resource?: Record<string, unknown> }> };
    for (const base of fhirBases) {
      const sr = await apiCall<Bundle>(
        page, `${base}/ServiceRequest?identifier=${encodeURIComponent(accession)}`,
        { accept: 'application/fhir+json' });
      if (!sr.ok) continue;

      const srEntry = ((sr.body as Bundle)?.entry || [])[0]?.resource as { id?: string } | undefined;
      const serviceRequestId = String(srEntry?.id ?? '');
      if (!serviceRequestId) return { base, serviceRequestId: '', observations: [] };

      const obs = await apiCall<Bundle>(
        page, `${base}/Observation?based-on=ServiceRequest/${encodeURIComponent(serviceRequestId)}`,
        { accept: 'application/fhir+json' });
      const observations = (((obs.body as Bundle)?.entry) || [])
        .map(e => e.resource as FhirObservation)
        .filter(Boolean);
      return { base, serviceRequestId, observations };
    }
    return { base: '', serviceRequestId: '', observations: [] };
  }

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
    rememberChainState('A', order);
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
    requireStep('A', 2, !!currentOrder(), '!order');

    await page.goto(BASE);
    const readback = await apiCall<{ patientSearchResults?: Array<{ nationalId?: string; firstName?: string; lastName?: string }> }>(
      page,
      // NOTE (2026-08-06): GET /rest/SampleEdit returns the BLANK form scaffold
      // (searchFinished:false, patient fields empty) regardless of labNumber — it does
      // not perform the lookup, so reading linkage from it produced a false BUG-37.
      // patient-search-results?labNumber= is the live-verified linkage surface.
      `/api/OpenELIS-Global/rest/patient-search-results?labNumber=${encodeURIComponent(order!.accession)}`
    );

    if (!readback.ok) {
      markStep('A', 2, 'FAIL', `patient-search-results lookup returned HTTP ${readback.status}`,
        `Cannot verify linkage without the read-back endpoint.`);
      expect(readback.ok, `patient-search-results returned ${readback.status}`).toBeTruthy();
      return;
    }

    const linkedNationalId = (typeof readback.body === 'object' && readback.body !== null)
      ? ((readback.body as { patientSearchResults?: Array<{ nationalId?: string }> }).patientSearchResults || [])[0]?.nationalId
      : undefined;

    // What can honestly be asserted depends on where the order came from.
    //
    // SEEDED: this run created the patient, so the exact nationalId is known and the
    // check is an identity match.
    //
    // REUSED: the patient is someone else's - the harness has no expected identity to
    // compare against, and asserting one produced a nightly false BUG-37 for months
    // (the domain lane returned an empty nationalId, so every reused order "failed").
    // The checkable symptom is the real one: BUG-37 is the sample_human row not being
    // written, which shows up as the lab number resolving to NO patient at all.
    if (order!.source === 'seeded') {
      if (linkedNationalId !== order!.patientNationalId) {
        markStep('A', 2, 'FAIL',
          `Patient-order linkage broken (BUG-37): expected nationalId ${order!.patientNationalId}, got ${linkedNationalId ?? '(none)'}`,
          `This is the canonical BUG-37 symptom. Order persisted but sample_human row was not written.`);
        return;
      }
      markStep('A', 2, 'PASS', `Seeded patient ${linkedNationalId} correctly linked to order ${order!.accession}`);
      return;
    }

    if (!linkedNationalId) {
      markStep('A', 2, 'FAIL',
        `Patient-order linkage broken (BUG-37): order ${order!.accession} resolves to no patient`,
        `Order persisted but sample_human row was not written. Reused order, so only presence is asserted, not identity.`);
      return;
    }
    markStep('A', 2, 'PASS',
      `Reused order ${order!.accession} resolves to patient ${linkedNationalId} `
      + `(presence check - identity is only asserted for orders this run seeded)`);
  });

  // ---------------------------------------------------------------------------
  // Step 3 — Enter a result (BUG-31 destructive; use API substitute)
  // SKILL §11.5 Blocking-Bug Etiquette
  // Acceptance criterion: PERSIST
  // ---------------------------------------------------------------------------
  test('Step 3 — Enter result via API substitute (PERSIST, BUG-31 workaround)', async ({ page }) => {
    requireStep('A', 3, !!currentOrder(), '!order');

    await page.goto(BASE);

    // BUG-31: the Carbon Accept checkbox click would hang for ~60s. Per §11.5 we
    // don't click it; we write the result through the API instead.
    //
    // This step used to POST a hand-built `{ paging, resultList: [...] }` body,
    // "shape inferred from Phase 8 BV-DEEP TestModify writes". It was inferred
    // wrongly and returned HTTP 400 on every run: the controller binds a whole
    // LogbookResultsForm whose list field is `testResult`, and it reconciles the
    // POST against the page it cached in the session on the preceding GET. A
    // hand-built list is a stale page by definition. enterResultsForLabNumber()
    // does the read-modify-write the seeder has always used.
    const res = await enterResultsForLabNumber(page, order!.accession, {
      valueByTestId: order!.testId ? { [order!.testId]: enteredResultValue } : undefined,
      defaultNumeric: enteredResultValue,
    });

    if (!res.ok) {
      markStep('A', 3, 'BLOCKED',
        `Result API substitute failed: ${res.reason}`,
        `Per §11.5 Blocking-Bug Etiquette: marking BLOCKED, chain continues.`);
      test.info().annotations.push({ type: 'blocked', description: res.reason });
      return;
    }

    // PERSIST is the declared criterion, so assert the write landed rather than
    // trusting a 200 (SKILL 7.5).
    const back = await readResultsForLabNumber(page, order!.accession);
    const landed = Array.from(res.entered.entries()).filter(([tid]) => !!back.values.get(tid));
    expect(landed.length,
      `Result POST reported success but no entered value read back on ${order!.accession} `
      + `(submitted [${Array.from(res.entered.keys()).join(',')}], read back `
      + `[${Array.from(back.values.entries()).map(([k, v]) => `${k}=${v}`).join(', ')}])`).toBeGreaterThan(0);

    markStep('A', 3, 'PASS', `${res.reason}; ${landed.length} value(s) verified on read-back`);
  });

  // ---------------------------------------------------------------------------
  // Step 4 — Validate the result
  // SKILL §11 Chain A row
  // Acceptance criterion: PERSIST
  // ---------------------------------------------------------------------------
  test('Step 4 — Validate the result (PERSIST)', async ({ page }) => {
    requireStep('A', 4, !!currentOrder(), '!order');

    await page.goto(BASE);

    // /rest/ResultValidation with a hand-built `validationList` was invented and
    // never worked. The surface the Validation page actually uses is
    // /rest/AccessionValidation, read-modify-written the same way as result entry:
    // GET the form, flip `isAccepted` on each row of `resultList`, POST it back.
    const val = await validateResultsForLabNumber(page, order!.accession);

    if (!val.ok) {
      markStep('A', 4, 'BLOCKED', `Validation failed: ${val.reason}`, `Per §11.5: BLOCKED, chain continues.`);
      test.info().annotations.push({ type: 'blocked', description: val.reason });
      return;
    }
    // PERSIST: nothing should still be sitting in the validation queue for this
    // accession once every row has been accepted.
    const pending = await apiCall<{ resultList?: Array<unknown> }>(
      page, `/api/OpenELIS-Global/rest/AccessionValidation?accessionNumber=${encodeURIComponent(order!.accession)}`
    );
    const stillPending = ((pending.ok && typeof pending.body === 'object' && pending.body !== null
      ? (pending.body as { resultList?: Array<unknown> }).resultList
      : []) || []).length;
    expect(stillPending,
      `Validation POST reported success but ${stillPending} row(s) are still pending validation on ${order!.accession}`)
      .toBe(0);

    markStep('A', 4, 'PASS', `${val.reason}; validation queue for ${order!.accession} is now empty`);
  });

  // ---------------------------------------------------------------------------
  // Step 5 — Generate Patient Status Report PDF
  // SKILL §11 Chain A row + Phase 21 EV evidence
  // Acceptance criterion: REPORTABLE (a PDF must be produced)
  // ---------------------------------------------------------------------------
  test('Step 5 — Generate Patient Status Report PDF (REPORTABLE)', async ({ page }) => {
    requireStep('A', 5, !!currentOrder(), '!order');

    await page.goto(BASE);

    // Report generation uses the JSP ReportPrint endpoint (not the
    // /rest/report/* false-positive path — see SKILL §6.5).
    //
    // This step asked for `report=patient&accessionNumber=<labNo>` and had been
    // answering HTTP 500 on every run. Neither half was real:
    //   * ReportImplementationFactory.getReportCreator() matches the report name
    //     against a fixed list, and "patient" is not in it. An unmatched name
    //     returns null, the controller writes nothing, and the request 500s.
    //   * the accession is passed as accessionDirect + highAccessionDirect (a
    //     lab-number RANGE); there is no accessionNumber parameter here.
    // Both are taken from PatientStatusReport.jsx / ReportByLabNo.jsx, which is
    // what the Routine Reports screen itself sends, and verified live
    // 2026-09-20: this URL returns a 3.2KB %PDF where the old one returned 500.
    const url = reportUrl(order!.accession);

    const response = await apiCall<string>(page, url, { accept: 'application/pdf', expectBinary: true });

    if (!response.ok) {
      markStep('A', 5, 'FAIL', `ReportPrint (${REPORT}) returned HTTP ${response.status}`);
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
    markStep('A', 5, 'PASS', `PDF generated by ${REPORT}, ${buf.length} bytes`);

    // Stash for Step 6
    (order as ChainOrderRef & { pdf?: Buffer }).pdf = buf;
  });

  // ---------------------------------------------------------------------------
  // Step 6 — Lab number appears on the PDF
  // SKILL §11 Chain A row + §7.5 Round-trip
  // Acceptance criterion: REPORTABLE (content matches)
  // ---------------------------------------------------------------------------
  test('Step 6 — Lab number present on PDF (REPORTABLE)', async ({ page }) => {
    requireStep('A', 6, !!currentOrder(), '!order');
    const withPdf = order as ChainOrderRef & { pdf?: Buffer };
    if (!withPdf.pdf) {
      // Not a cascade, and no longer a reason to BLOCK: a failed step retries in a
      // fresh worker where Step 5's buffer no longer exists, and report generation
      // is an idempotent GET. Fetch it again rather than reporting a blockage that
      // says nothing about the product.
      await page.goto(BASE);
      const again = await apiCall<string>(page, reportUrl(order!.accession),
        { accept: 'application/pdf', expectBinary: true });
      if (!again.ok) {
        markStep('A', 6, 'FAIL',
          `No PDF from Step 5, and re-generating it returned HTTP ${again.status}`);
        return;
      }
      withPdf.pdf = Buffer.from(String(again.body), 'base64');
      // eslint-disable-next-line no-console
      console.log('[Chain A · Step 6] re-generated the report (worker restart), '
        + `${withPdf.pdf.length} bytes`);
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
  // Step 7 — Reach the order's Observation in FHIR
  // SKILL §11 Chain A row + Phase 8 BW-DEEP evidence
  // Acceptance criterion: CROSS-LINK (UI write -> FHIR read)
  //
  // How this used to work, and why it proved nothing:
  //   GET fhir/Observation?identifier=<accession>, PASS on HTTP 200.
  // An Observation's identifier is its `result_uuid`, never the lab number, so
  // that search answers 200 with total=0 for every accession that has ever
  // existed — and the step passed on it every run, then handed Step 8 an empty
  // bundle to report as a product failure.
  //
  // The route that actually exists, measured 2026-09-20 on a freshly resulted
  // accession:
  //   ServiceRequest?identifier=<accession>          -> 1 entry, id = analysis uuid
  //   Observation?based-on=ServiceRequest/<that id>  -> the result Observation,
  //                                                     basedOn pointing back
  // Both hops are asserted, because they fail for different reasons: no
  // ServiceRequest means the ORDER never reached FHIR; a ServiceRequest with no
  // Observation means the RESULT did not.
  // ---------------------------------------------------------------------------
  test('Step 7 — Reach the order Observation through its ServiceRequest (CROSS-LINK)', async ({ page }) => {
    requireStep('A', 7, !!currentOrder(), '!order');
    await page.goto(BASE);

    const found = await fetchObservationBundle(page, order!.accession);
    if (!found.base) {
      markStep('A', 7, 'FAIL',
        `No FHIR endpoint answered for ${order!.accession}`,
        `Tried: ${fhirBases.join(', ')}. This is reachability, not a mapping question.`);
      expect(found.base, 'no FHIR endpoint answered').not.toBe('');
      return;
    }
    if (!found.serviceRequestId) {
      markStep('A', 7, 'FAIL',
        `No ServiceRequest carries accession ${order!.accession} (searched ${found.base})`,
        `The order itself never reached FHIR, so there is nothing for a result to hang off. `
        + `This is the CROSS-LINK failure the chain exists to catch, not a search-syntax problem: `
        + `the same search returns the ServiceRequest for an order that did publish.`);
      expect(found.serviceRequestId, 'no ServiceRequest carries this accession').not.toBe('');
      return;
    }

    markStep('A', 7, 'PASS',
      `ServiceRequest ${found.serviceRequestId} found for ${order!.accession} via ${found.base}; `
      + `${found.observations.length} Observation(s) hang off it`);
    (order as ChainOrderRef & { fhir?: FhirLookup }).fhir = found;
  });

  // ---------------------------------------------------------------------------
  // Step 8 — The FHIR Observation carries the value the LIS stored
  // SKILL §7.5 Round-trip Write Verification
  // Acceptance criterion: ROUND-TRIP
  //
  // Compared against what the LIS ITSELF stored, not against the string this
  // chain typed: the product rounds a result to the test's significant digits,
  // so entering 12.5 on a test that reports whole numbers stores 12 and
  // publishes 12. Asserting the typed string would report a FHIR mapping defect
  // for correct rounding. What matters here is that FHIR and the LIS agree.
  // ---------------------------------------------------------------------------
  test('Step 8 — FHIR Observation matches the stored result (ROUND-TRIP)', async ({ page }) => {
    requireStep('A', 8, !!currentOrder(), '!order');
    await page.goto(BASE);

    // Re-fetch rather than BLOCK when Step 7's payload is missing: a failed step
    // retries in a fresh worker, and this is an idempotent read.
    const withFhir = order as ChainOrderRef & { fhir?: FhirLookup };
    let lookup = withFhir.fhir;
    if (!lookup || typeof lookup !== 'object') {
      lookup = await fetchObservationBundle(page, order!.accession);
      // eslint-disable-next-line no-console
      console.log('[Chain A · Step 8] re-fetched the FHIR bundle (worker restart)');
    }
    if (!lookup.serviceRequestId) {
      markStep('A', 8, 'FAIL',
        `No ServiceRequest for ${order!.accession}, so no Observation can be checked`,
        `Step 7 reports the same thing; fix the publish, not this step.`);
      expect(lookup.serviceRequestId, 'no ServiceRequest for this accession').not.toBe('');
      return;
    }
    if (!lookup.observations.length) {
      markStep('A', 8, 'FAIL',
        `ServiceRequest ${lookup.serviceRequestId} exists for ${order!.accession} but carries no Observation`,
        `The order reached FHIR and the result did not. Either the result was never `
        + `persisted (Step 3), never validated (Step 4), or the result publish is broken.`);
      expect(lookup.observations.length, 'ServiceRequest carries no Observation').toBeGreaterThan(0);
      return;
    }

    // What the LIS stored, read from its own result form.
    const stored = await readResultsForLabNumber(page, order!.accession);
    const storedValues = Array.from(stored.values.values()).filter(v => v !== '');
    const fhirValues = lookup.observations
      .map(o => (o.valueQuantity?.value !== undefined ? String(o.valueQuantity.value) : o.valueString))
      .filter((v): v is string => !!v);

    const same = (a: string, b: string) => {
      const na = Number(a);
      const nb = Number(b);
      return Number.isFinite(na) && Number.isFinite(nb) ? Math.abs(na - nb) < 0.005 : a === b;
    };
    const matched = fhirValues.some(f => storedValues.some(sv => same(f, sv)));
    if (!matched) {
      markStep('A', 8, 'FAIL',
        `FHIR and the LIS disagree on ${order!.accession}: FHIR has [${fhirValues.join(', ')}], `
        + `the LIS stored [${storedValues.join(', ')}]`,
        `A value present on both sides but different is a mapping defect; the typed value was `
        + `${enteredResultValue}, which the product may legitimately round.`);
      expect(matched, 'FHIR value does not match the stored result').toBeTruthy();
      return;
    }
    markStep('A', 8, 'PASS',
      `Round-trip confirmed: FHIR [${fhirValues.join(', ')}] agrees with the stored result `
      + `[${storedValues.join(', ')}] (typed ${enteredResultValue})`);
  });
});
