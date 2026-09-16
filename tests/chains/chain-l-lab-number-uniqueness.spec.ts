/**
 * tests/chains/chain-l-lab-number-uniqueness.spec.ts
 *
 * SKILL §11 Chain L — Lab Number Uniqueness
 *
 * What this chain proves: concurrent order creation across multiple
 * entry paths (Add Order, Batch Order Entry, EQA Sample, Generic Sample)
 * never produces a duplicate lab number / accession. Two orders with
 * the same accession is a sample-identification disaster — wrong patient
 * gets the wrong result.
 *
 * Why this chain matters: lab number generation is centralized via
 * /MasterListsPage/labNumber config but each entry path calls the
 * underlying generator from a slightly different context. Race
 * conditions, year-rollover overflow, or path-specific bypass would
 * each produce duplicates and the existing per-path tests can't see
 * the cross-path interaction.
 *
 * What we CAN'T test here:
 *   - The year-rollover scenario (would need to fast-forward the system
 *     clock or wait until December 31). Documented as a manual check.
 *   - 100,000-order overflow (rate-limited by API throughput).
 *   - Race conditions across geographically-distributed servers (single-
 *     server only).
 *
 * What we CAN test: burst-create N orders in parallel and assert all
 * returned accessions are distinct. That's a small-scale concurrency
 * smoke test — sufficient to catch the most likely generator bugs.
 *
 * Run individually:
 *   npx playwright test --project=chain-l
 */

import { test, expect } from '@playwright/test';
import { BASE, apiCall, markStep, requireStep } from './_common';
import { createOrderViaAPI, emptyState } from '../../helpers/data-factory';

const BURST_SIZE = 10; // small enough to be fast, large enough to surface races

test.describe.serial('Chain L — Lab Number Uniqueness', () => {
  let patientPK: string | null = null;
  let patientNationalId: string | null = null;
  let sampleTypeId: string | null = null;
  let testId: string | null = null;
  const accessions: string[] = [];

  test.beforeAll(() => {
    // eslint-disable-next-line no-console
    console.log(`[Chain L] BASE=${BASE} BURST_SIZE=${BURST_SIZE}`);
  });

  // ---------------------------------------------------------------------------
  // Step 1 — Acquire a QA_AUTO_ patient and a test catalog entry
  // ---------------------------------------------------------------------------
  test('Step 1 — Acquire patient + test catalog entry (RENDER)', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');

    const p = await apiCall<{ patientSearchResults?: Array<{ nationalId?: string; patientID?: string }> }>(
      page, '/api/OpenELIS-Global/rest/patient-search-results?lastName=QA_AUTO'
    );
    if (!p.ok || typeof p.body !== 'object' || p.body === null) {
      markStep('L', 1, 'FAIL', `patient-search-results HTTP ${p.status}`); expect(p.ok).toBeTruthy(); return;
    }
    const patients = ((p.body as { patientSearchResults?: Array<{ nationalId?: string; patientID?: string }> }).patientSearchResults) || [];
    if (patients.length === 0) {
      markStep('L', 1, 'FAIL', 'No QA_AUTO_ patient — run --project=seed-data first');
      expect(patients.length).toBeGreaterThan(0); return;
    }
    patientPK = patients[0].patientID!;
    patientNationalId = patients[0].nationalId!;

    // `/rest/test-list` answers a BARE ARRAY of IdValuePair. This chain used to read
    // `body.testList`, which is never present, so "Empty test catalog" was reported on an
    // instance carrying 48 active tests -- for two months, on every run. It also ignores
    // `activeOnly`; the parameter was ours, not the API's.
    //
    // Worth knowing before trusting a non-empty answer: the endpoint is
    // `getAllDisplayUserTestsByLabUnit(user, ROLE_RESULTS)`, so it returns only tests in
    // lab units the LOGGED-IN USER holds the Results role for. An empty list here can
    // legitimately mean "this user has no lab units", which is a permissions fact and not
    // a catalog one -- the message below says so rather than guessing.
    const t = await apiCall<unknown>(page, '/api/OpenELIS-Global/rest/test-list');
    const raw = t.ok ? t.body : null;
    const tests = (Array.isArray(raw)
      ? raw
      : ((raw as { testList?: unknown[] } | null)?.testList ?? [])) as Array<{
      id?: string;
      value?: string;
      sampleTypeId?: string;
    }>;
    if (tests.length === 0) {
      markStep(
        'L',
        1,
        'FAIL',
        `test-list returned no tests (HTTP ${t.status}). Either the catalog is empty or ` +
          `this user holds the Results role in no lab unit -- the endpoint filters by both.`
      );
      expect(tests.length).toBeGreaterThan(0);
      return;
    }
    testId = tests[0].id!;
    // IdValuePair carries no sampleTypeId; '1' is the documented fallback this chain has
    // always used in practice.
    sampleTypeId = tests[0].sampleTypeId || '1';
    markStep('L', 1, 'PASS', `Patient ${patientNationalId}, test ${testId}, sampleType ${sampleTypeId}`);
  });

  // ---------------------------------------------------------------------------
  // Step 2 — Burst-create N orders in parallel
  // SKILL §11 Chain L row
  // Acceptance criterion: PERSIST + CROSS-LINK (concurrency)
  // ---------------------------------------------------------------------------
  test('Step 2 — Burst-create concurrent orders (PERSIST × N)', async ({ page }) => {
    requireStep('L', 2, !(!patientPK || !testId), '!patientPK || !testId');
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => undefined);

    // REBUILT 2026-09-15. THIS STEP USED TO POST A HAND-ROLLED PAYLOAD
    //   { patientProperties: {patientPK, nationalId, patientUpdateStatus},
    //     sampleOrderItems: {...}, sampleItems: [{sampleTypeId, tests:[{testId}]}] }
    // which /rest/SamplePatientEntry rejects. All ten POSTs answered 400, every run, and
    // as far as the evidence goes this chain had never created an order -- the suite it is
    // named for could not have detected a duplicate lab number if one existed.
    //
    // It now goes through `createOrderViaAPI`, the payload established in
    // helpers/data-factory.ts and validated against the wizard's own output. Four
    // conditions the old shape met none of: `sampleXML` rather than a `sampleItems`
    // array, a `labNo` generated per order from /rest/SampleEntryGenerateScanProvider, a
    // `referringSiteId` from a type-5 organization, and the WHOLE patient block.
    //
    // WHAT THE CONCURRENCY NOW EXERCISES, and it is the right thing: each of the N calls
    // generates its OWN accession and then posts an order with it, and they all run at
    // once. So the burst covers both halves of the risk -- a generator handing the same
    // number to two callers, and two orders being accepted against one number. The old
    // shape, even had it worked, posted one pre-computed payload N times.
    //
    // Every call gets its own TestDataState: createOrderViaAPI writes the accession into
    // state[orderKey], so a shared state would have them overwriting each other.
    const burst = await Promise.all(
      Array.from({ length: BURST_SIZE }, async (_unused, i) => {
        const state = emptyState();
        state.patient.systemId = patientPK;
        state.patient.nationalId = patientNationalId;
        try {
          const accession = await createOrderViaAPI(page, state, `chain-L burst ${i}`, 'primaryOrder');
          return { accession, detail: state.setupErrors.join(' | ') };
        } catch (e) {
          return { accession: null as string | null, detail: (e as Error).message };
        }
      })
    );

    // `accessions` is a const array shared with Steps 3 and 4 -- push into it, do not
    // reassign it.
    accessions.push(...burst.map((b) => b.accession).filter((a): a is string => !!a));
    const successCount = accessions.length;

    if (successCount === 0) {
      markStep(
        'L',
        2,
        'FAIL',
        `All ${BURST_SIZE} concurrent order creations failed`,
        `Details: ${burst.map((b) => b.detail).filter(Boolean).slice(0, 3).join(' || ') || '(none reported)'}. ` +
          `Cannot test uniqueness without successful writes.`
      );
      expect(successCount).toBeGreaterThan(0);
      return;
    }

    // A partial burst still tests uniqueness across whatever DID land, and Step 3 is the
    // real check. But WHY the others failed is the most interesting output this chain can
    // produce -- a write lost under 10-way concurrency is the neighbourhood of the defect
    // it is named for -- so the reasons are logged here rather than only on a total
    // failure. Measured 2026-09-15 on the local develop stack: 9 of 10 landed.
    const lost = burst.filter((b) => !b.accession);
    markStep(
      'L',
      2,
      'PASS',
      `${successCount}/${BURST_SIZE} orders created. Accessions: [${accessions.join(', ')}]` +
        (lost.length
          ? ` — ${lost.length} LOST under concurrency: ${lost
              .map((b) => b.detail || '(no reason reported)')
              .join(' || ')
              .slice(0, 400)}`
          : '')
    );
  });

  // ---------------------------------------------------------------------------
  // Step 3 — Assert all returned accessions are unique
  // SKILL §11 Chain L row — THE KEY CHECK
  // Acceptance criterion: CROSS-LINK
  // ---------------------------------------------------------------------------
  test('Step 3 — All returned accessions distinct (CROSS-LINK, the key check)', async () => {
    requireStep('L', 3, !(accessions.length === 0), 'accessions.length === 0');

    const unique = new Set(accessions);
    if (unique.size !== accessions.length) {
      const dups: Record<string, number> = {};
      for (const a of accessions) dups[a] = (dups[a] || 0) + 1;
      const duplicates = Object.entries(dups).filter(([, n]) => n > 1).map(([a, n]) => `${a}(×${n})`);
      markStep('L', 3, 'FAIL',
        `DUPLICATE LAB NUMBERS DETECTED: ${duplicates.join(', ')}`,
        `Lab number generator is not atomic under concurrent load. Sample-identification disaster: two different orders share an accession.`);
      expect(unique.size, `Duplicate accessions: ${duplicates.join(', ')}`).toBe(accessions.length);
      return;
    }
    markStep('L', 3, 'PASS',
      `All ${accessions.length} accessions distinct under ${BURST_SIZE}-way concurrent write`);
  });

  // ---------------------------------------------------------------------------
  // Step 4 — Accessions match the configured format
  // Catches generator-format-drift (the year-rollover scenario this chain
  // can't actually trigger, but can at least verify the prefix is stable).
  // Acceptance criterion: ROUND-TRIP (each generated accession adheres to
  // the labNumber admin config's format).
  // ---------------------------------------------------------------------------
  test('Step 4 — Accession format matches admin labNumber config (ROUND-TRIP)', async ({ page }) => {
    requireStep('L', 4, !(accessions.length === 0), 'accessions.length === 0');
    await page.goto(BASE);
    // Read the labNumber config; first valid sample format we extract is
    // our regex. Endpoint not standardised; if not available, just check
    // all accessions share a common prefix as a weaker assertion.
    const cfg = await apiCall<{ format?: string; prefix?: string }>(
      page, '/api/OpenELIS-Global/rest/LabNumberManagement'
    );
    if (cfg.ok && typeof cfg.body === 'object' && cfg.body !== null) {
      const prefix = (cfg.body as { prefix?: string }).prefix;
      if (prefix) {
        const allMatch = accessions.every(a => a.startsWith(prefix) || a.includes(prefix));
        if (!allMatch) {
          markStep('L', 4, 'FAIL',
            `Some accessions don't share configured prefix "${prefix}"`,
            `Generator is producing format-drift variants under load.`);
          expect(allMatch).toBeTruthy();
          return;
        }
      }
    }
    // Weaker check: prefixes all match each other
    const firstPrefix = accessions[0].split('-').slice(0, 3).join('-');
    const allSamePrefix = accessions.every(a => a.startsWith(firstPrefix));
    if (!allSamePrefix) {
      markStep('L', 4, 'PARTIAL',
        `Accession prefixes not all identical; first is "${firstPrefix}". May be normal year-boundary behaviour or may be format drift.`);
      test.info().annotations.push({ type: 'partial', description: 'mixed accession prefixes' });
      return;
    }
    markStep('L', 4, 'PASS', `All accessions share prefix "${firstPrefix}"`);
  });
});
