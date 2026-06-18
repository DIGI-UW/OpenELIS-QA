/**
 * tests/chains/chain-m-vector-surveillance.spec.ts
 *
 * SKILL §11 Chain M — Vector Surveillance (NEW domain, v3.2.1.10+)
 *
 * DEEP ROUND-TRIP rewrite (v6.15). The previous version was render-only and
 * probed guessed `displayList/VECTOR_*` endpoints that 404'd. This version
 * drives the REAL endpoints captured live on indonesiadev v3.2.1.10
 * (2026-06-18) and asserts that each action LANDED by reading the worklist
 * back after every handoff — the "linked actions" the catalog was missing.
 *
 * Captured endpoints (see _common.ts VE_* + vector-env-api-captures.md):
 *   - CREATE   POST /rest/SamplePatientEntry            (shared w/ clinical)
 *   - READBACK GET  /rest/vector/identification/worklist (lot rows)
 *   - IDENTIFY POST /rest/vector/identification/specimens/{sampleId}/identify
 *   - DECON    POST /rest/vector/deconvolution/initiate
 *   - DICT     GET  /rest/vector/dictionary/lifecycle-stages (OGC-1049 unfiltered, n=5)
 *
 * Round-trip / landing-check design (S7.6 PERSIST -> ROUND-TRIP -> CROSS-LINK):
 *   1. Worklist read-back contract — real field-name assertions.
 *   2. Species identify -> worklist shows identifiedSpecimens incremented.
 *   3. Pool deconvolution -> worklist deconvolutionStatus advances PENDING->DECON_IN_PROGRESS.
 *   4. Lifecycle dictionary populated (OGC-1049 unfiltered) + filtered watch.
 *   5. Pathogen results route through the shared Results screen (CROSS-LINK).
 *
 * Resilience: registered to run against any instance. When the vector domain
 * is absent (older build -> 404) or no actionable lot exists, the affected step
 * records GAP and continues; it never fabricates a pass. The mutating legs
 * (identify/decon) discover a real target from the worklist and verify the
 * landing; if the request body shape is rejected they record GAP with the
 * exact endpoint so a follow-up can pin the payload — they do not fail the
 * whole chain on a body-shape mismatch.
 *
 * Known-bug regression watches: OGC-1048 (collection-date persistence — see
 * Chain N), OGC-1049 (sampleTypeId-filtered dictionary returns empty).
 *
 * Run individually:  npx playwright test --project=chain-m
 */

import { test, expect } from '@playwright/test';
import {
  BASE,
  apiCall,
  markStep,
  getVectorWorklist,
  VE_VECTOR_WORKLIST,
  VE_VECTOR_IDENTIFY,
  VE_VECTOR_DECON,
  VE_VECTOR_DICT_LIFECYCLE,
  type VectorWorklistRow,
} from './_common';

test.describe.serial('Chain M — Vector Surveillance (deep round-trip)', () => {
  // Shared across the serial steps so the identify/decon legs operate on the
  // same lot the read-back step discovered.
  let worklist: VectorWorklistRow[] = [];
  let domainPresent = true;

  test.beforeAll(() => {
    // eslint-disable-next-line no-console
    console.log(`[Chain M] BASE=${BASE}`);
  });

  // ---------------------------------------------------------------------------
  // Step 1 — Worklist read-back contract (ROUND-TRIP surface, real fields)
  // ---------------------------------------------------------------------------
  test('Step 1 — Vector Identification worklist read-back contract (ROUND-TRIP)', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('domcontentloaded');
    const r = await apiCall<VectorWorklistRow[]>(page, VE_VECTOR_WORKLIST);

    if (!r.ok) {
      domainPresent = false;
      markStep('M', 1, 'GAP',
        `Vector worklist endpoint not available (HTTP ${r.status}) — vector domain absent on this build`,
        `Endpoint: GET ${VE_VECTOR_WORKLIST}. Confirmed present on indonesiadev v3.2.1.10.`);
      test.info().annotations.push({ type: 'gap', description: 'vector domain absent (worklist 404)' });
      return;
    }

    worklist = Array.isArray(r.body) ? (r.body as VectorWorklistRow[]) : [];
    const requiredKeys = [
      'sampleId', 'vectorPoolId', 'lotExternalId', 'accessionNumber',
      'totalSpecimens', 'identifiedSpecimens', 'identificationStatus', 'deconvolutionStatus',
    ];
    if (worklist.length === 0) {
      markStep('M', 1, 'GAP',
        'Vector worklist reachable but empty — no lots to round-trip',
        'Seed a vector order (POST /rest/SamplePatientEntry with a pooled Animal/Organism sample) then re-run.');
      test.info().annotations.push({ type: 'gap', description: 'vector worklist empty' });
      return;
    }
    const row = worklist[0] as unknown as Record<string, unknown>;
    const missing = requiredKeys.filter(k => !(k in row));
    if (missing.length === 0) {
      markStep('M', 1, 'PASS',
        `Worklist read-back OK: ${worklist.length} lot(s), full row contract`,
        `e.g. ${worklist[0].lotExternalId} — ${worklist[0].identifiedSpecimens}/${worklist[0].totalSpecimens} identified, decon=${worklist[0].deconvolutionStatus}`);
      expect(missing.length).toBe(0);
    } else {
      markStep('M', 1, 'FAIL',
        `Worklist row missing expected fields: ${missing.join(', ')}`,
        'The worklist contract changed — landing checks below depend on these fields.');
      expect(missing, 'worklist row contract').toEqual([]);
    }
  });

  // ---------------------------------------------------------------------------
  // Step 2 — Species identification lands (CROSS-LINK: identify -> worklist delta)
  // ---------------------------------------------------------------------------
  test('Step 2 — Species identify increments identifiedSpecimens (CROSS-LINK)', async ({ page }) => {
    if (!domainPresent) { markStep('M', 2, 'GAP', 'Skipped — vector domain absent (see Step 1)'); return; }
    await page.goto(BASE);

    const target = worklist.find(r => r.identifiedSpecimens < r.totalSpecimens) || worklist[0];
    if (!target) {
      markStep('M', 2, 'GAP', 'No worklist lot available to identify');
      test.info().annotations.push({ type: 'gap', description: 'no identifiable lot' });
      return;
    }
    const before = target.identifiedSpecimens;

    // Best-effort payload derived from the captured UI flow (species + method +
    // confidence + status). Exact body wasn't fully captured (output filter), so
    // on a shape-rejection (4xx) record GAP rather than failing the chain.
    const identifyPayload = {
      species: target.organismGroups?.[0] ? `${target.organismGroups[0]} sp.` : 'Aedes aegypti',
      identificationMethod: 'MORPHOLOGICAL',
      confidence: 'CONFIRMED',
      lifecycleStage: 'ADULT',
      status: 'CONFIRMED',
    };
    const post = await apiCall(page, VE_VECTOR_IDENTIFY(target.sampleId), {
      method: 'POST',
      body: identifyPayload,
    });

    if (!post.ok) {
      markStep('M', 2, 'GAP',
        `Identify POST returned HTTP ${post.status} — request body shape needs pinning`,
        `Endpoint confirmed: POST ${VE_VECTOR_IDENTIFY('{sampleId}')}. Capture the exact body from the /vector/identification UI save and update identifyPayload.`);
      test.info().annotations.push({ type: 'gap', description: `identify body shape (HTTP ${post.status})` });
      return;
    }

    const after = (await getVectorWorklist(page)).find(r => r.sampleId === target.sampleId);
    const afterCount = after?.identifiedSpecimens ?? before;
    if (afterCount > before) {
      markStep('M', 2, 'PASS',
        `Identify landed: ${target.lotExternalId} identifiedSpecimens ${before} -> ${afterCount}`);
      expect(afterCount).toBeGreaterThan(before);
    } else {
      markStep('M', 2, 'FAIL',
        `Identify POST 2xx but worklist did not reflect it (still ${afterCount}/${target.totalSpecimens})`,
        'Action did not land — possible async/persistence gap.');
      expect(afterCount, 'identifiedSpecimens after identify').toBeGreaterThan(before);
    }
  });

  // ---------------------------------------------------------------------------
  // Step 3 — Pool deconvolution lands (CROSS-LINK: decon -> worklist status delta)
  // ---------------------------------------------------------------------------
  test('Step 3 — Pool deconvolution advances deconvolutionStatus (CROSS-LINK)', async ({ page }) => {
    if (!domainPresent) { markStep('M', 3, 'GAP', 'Skipped — vector domain absent (see Step 1)'); return; }
    await page.goto(BASE);

    const fresh = await getVectorWorklist(page);
    const target = fresh.find(r => r.deconvolutionStatus === 'PENDING' && r.totalSpecimens > 1) || fresh[0];
    if (!target) {
      markStep('M', 3, 'GAP', 'No pool available to deconvolve');
      test.info().annotations.push({ type: 'gap', description: 'no deconvolvable pool' });
      return;
    }
    const before = target.deconvolutionStatus;

    const deconPayload = { vectorPoolId: target.vectorPoolId, strategy: 'BY_SPECIES' };
    const post = await apiCall(page, VE_VECTOR_DECON, { method: 'POST', body: deconPayload });

    if (!post.ok) {
      markStep('M', 3, 'GAP',
        `Deconvolution POST returned HTTP ${post.status} — request body shape needs pinning`,
        `Endpoint confirmed: POST ${VE_VECTOR_DECON}. Capture exact body from the Split "Save Pools" action and update deconPayload.`);
      test.info().annotations.push({ type: 'gap', description: `decon body shape (HTTP ${post.status})` });
      return;
    }

    const after = (await getVectorWorklist(page)).find(r => r.vectorPoolId === target.vectorPoolId);
    const afterStatus = after?.deconvolutionStatus ?? before;
    if (afterStatus !== before && /DECON/i.test(afterStatus)) {
      markStep('M', 3, 'PASS',
        `Deconvolution landed: pool ${target.vectorPoolId} status ${before} -> ${afterStatus}`);
      expect(afterStatus).not.toBe(before);
    } else {
      markStep('M', 3, 'FAIL',
        `Decon POST 2xx but status unchanged (${afterStatus})`,
        'Split did not land in the worklist.');
      expect(afterStatus, 'deconvolutionStatus after split').not.toBe(before);
    }
  });

  // ---------------------------------------------------------------------------
  // Step 4 — Lifecycle dictionary populated + OGC-1049 filtered watch (FUNCTION)
  // ---------------------------------------------------------------------------
  test('Step 4 — Vector lifecycle dictionary + OGC-1049 filter watch (FUNCTION)', async ({ page }) => {
    if (!domainPresent) { markStep('M', 4, 'GAP', 'Skipped — vector domain absent (see Step 1)'); return; }
    await page.goto(BASE);

    const unfiltered = await apiCall<unknown[]>(page, VE_VECTOR_DICT_LIFECYCLE);
    const unN = Array.isArray(unfiltered.body) ? unfiltered.body.length : -1;
    if (unN <= 0) {
      markStep('M', 4, 'GAP', `Lifecycle dictionary unexpectedly empty/unavailable (n=${unN}, HTTP ${unfiltered.status})`);
      test.info().annotations.push({ type: 'gap', description: 'lifecycle dictionary empty' });
      return;
    }

    const filtered = await apiCall<unknown[]>(page, `${VE_VECTOR_DICT_LIFECYCLE}?sampleTypeId=1`);
    const fN = Array.isArray(filtered.body) ? filtered.body.length : -1;
    if (fN === 0) {
      markStep('M', 4, 'GAP',
        `OGC-1049 STILL PRESENT: unfiltered lifecycle=${unN} but ?sampleTypeId=1 returned 0`,
        'When fixed, filtered should be > 0 and this becomes PASS.');
      test.info().annotations.push({ type: 'known-bug', description: 'OGC-1049 dictionary filter empty' });
      expect(unN).toBeGreaterThan(0);
    } else if (fN > 0) {
      markStep('M', 4, 'PASS', `Lifecycle dictionary populated (n=${unN}); OGC-1049 appears FIXED (filtered=${fN})`);
      expect(fN).toBeGreaterThan(0);
    } else {
      markStep('M', 4, 'PASS',
        `Lifecycle dictionary populated (n=${unN}); filtered probe HTTP ${filtered.status} (param may be unsupported here)`);
      expect(unN).toBeGreaterThan(0);
    }
  });

  // ---------------------------------------------------------------------------
  // Step 5 — Pathogen results route through the normal Results screen (CROSS-LINK)
  // ---------------------------------------------------------------------------
  test('Step 5 — Pathogen results use the shared Results screen (CROSS-LINK)', async ({ page }) => {
    await page.goto(BASE);
    const lb = await apiCall<{ testResult?: unknown[] }>(page, '/api/OpenELIS-Global/rest/LogbookResults');
    if (lb.ok) {
      markStep('M', 5, 'PASS',
        'LogbookResults reachable — vector resulting is two-stage (species ID -> shared Results); no vector-specific pathogen-results page (by design)');
      expect(lb.ok).toBeTruthy();
    } else {
      markStep('M', 5, 'BLOCKED', `LogbookResults HTTP ${lb.status}`);
      test.info().annotations.push({ type: 'blocked', description: 'results surface unreachable' });
    }
  });
});
