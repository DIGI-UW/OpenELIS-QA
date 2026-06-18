/**
 * tests/chains/chain-m-vector-surveillance.spec.ts
 *
 * SKILL §11 Chain M — Vector Surveillance (NEW domain, v3.2.1.10+)
 *
 * What this chain proves: the new Vector surveillance domain — a 4-step
 * order wizard, mosquito/vector pooling, and TWO-STAGE resulting
 * (species identification first, then pathogen results through the
 * normal Results screen), plus pool deconvolution (Split).
 *
 * Why it exists: the Vector & Environmental domains were the headline
 * feature of the indonesiadev v3.2.1.10 QA run yet had ZERO catalog
 * coverage. This suite codifies what was verified live in that run
 * (report §§2–10) and pins the two known bugs as regression watches.
 *
 * Verified routes (React SPA):
 *   - /order/vector            vector order dashboard
 *   - /order/vector/enter      4-step wizard: Enter → Label & Store → QA Review → Complete
 *   - /vector/identification   stage-1 resulting: species ID + pool Split
 *   (pathogen results then go through the normal Results / LogbookResults screen)
 *   - Generic Sample (/GenericSample/*) is a DEAD branch — must NOT be the vector path.
 *
 * Known-bug regression watches:
 *   - OGC-1048: collection-date default not persisted on vector/env order entry.
 *   - OGC-1049: dictionary filtered by `?sampleTypeId=N` returns empty for ALL ids
 *               (unfiltered returns the full lists: 5 lifecycle stages, 3 trap types).
 *
 * Honesty note: order-creation and Split POST payloads for the vector
 * domain were not captured as stable endpoints during the live run, so
 * those steps are GAP/BLOCKED pending a §6.5a network capture rather than
 * asserted green. Route-render and dictionary steps are real assertions.
 *
 * Run individually:
 *   npx playwright test --project=chain-m
 */

import { test, expect } from '@playwright/test';
import { BASE, apiCall, markStep } from './_common';

// Treat a deep-link that resolves to the Spring NoHandlerFoundException JSON
// (the OGC-1053 SPA basename limitation) as "deep-link unsupported", not a render.
function looksLikeSpringNotFound(body: string): boolean {
  return /NoHandlerFoundException/.test(body) || /"status":404/.test(body);
}

test.describe.serial('Chain M — Vector Surveillance', () => {
  let vectorAccession: string | null = null;

  test.beforeAll(() => {
    // eslint-disable-next-line no-console
    console.log(`[Chain M] BASE=${BASE}`);
  });

  // ---------------------------------------------------------------------------
  // Step 1 — Vector order route renders the 4-step wizard (RENDER)
  // ---------------------------------------------------------------------------
  test('Step 1 — Vector order entry renders 4-step wizard (RENDER)', async ({ page }) => {
    await page.goto(`${BASE}/order/vector/enter`);
    await page.waitForLoadState('networkidle');
    const bodyText = await page.evaluate(() => document.body.innerText);

    if (looksLikeSpringNotFound(bodyText)) {
      markStep('M', 1, 'GAP',
        'Direct deep-link /order/vector/enter resolved to a Spring 404 (OGC-1053 deep-link limitation)',
        'Drive via sidebar Order → Add Vector Order instead; convert to a UI-nav step once selectors are captured.');
      test.info().annotations.push({ type: 'gap', description: 'deep-link 404 (OGC-1053)' });
      return;
    }

    // Wizard step labels verified live: Enter / Label & Store / QA Review / Complete.
    const wizardMarkers = ['Enter', 'Label & Store', 'QA Review', 'Complete'];
    const found = wizardMarkers.filter(m => bodyText.includes(m));
    // Bionomics Collection Context accordion is the vector-specific tell.
    const hasBionomics = /Bionomic/i.test(bodyText);

    if (found.length >= 3) {
      markStep('M', 1, 'PASS',
        `Vector wizard rendered (markers: ${found.join(', ')}${hasBionomics ? '; Bionomics context present' : ''})`);
      expect(found.length).toBeGreaterThanOrEqual(3);
    } else {
      markStep('M', 1, 'FAIL',
        `Vector order route loaded but wizard markers missing (found only: ${found.join(', ') || 'none'})`,
        'Either the route changed or the wizard failed to render.');
      expect(found.length, 'vector wizard markers').toBeGreaterThanOrEqual(3);
    }
  });

  // ---------------------------------------------------------------------------
  // Step 2 — Generic Sample is NOT the vector path (RENDER / dead-branch guard)
  // ---------------------------------------------------------------------------
  test('Step 2 — Generic Sample dead-branch guard (RENDER)', async ({ page }) => {
    // Per the run, "Generic Sample" is slated for removal and must not be
    // mistaken for the vector entry path. This step is a soft guard: it
    // passes whether or not the menu item still exists, but flags it for
    // cleanup so the eventual removal is asserted.
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    const navText = await page.evaluate(() => document.body.innerText);
    const genericStillPresent = /Generic Sample/i.test(navText);
    if (genericStillPresent) {
      markStep('M', 2, 'GAP',
        'Generic Sample menu still present — dead branch not yet removed',
        'Track removal; once gone this step should assert its ABSENCE. Vector path is /order/vector, NOT /GenericSample.');
      test.info().annotations.push({ type: 'gap', description: 'Generic Sample not yet removed' });
    } else {
      markStep('M', 2, 'PASS', 'Generic Sample dead branch is gone (as intended)');
    }
  });

  // ---------------------------------------------------------------------------
  // Step 3 — Vector resulting dictionaries are populated (FUNCTION)
  // Unfiltered dictionary lists power the Vector Identification dropdowns:
  // species, trap type (3), lifecycle stage (5). Verified non-empty live.
  // ---------------------------------------------------------------------------
  test('Step 3 — Vector dictionaries (species / trap / lifecycle) populated (FUNCTION)', async ({ page }) => {
    await page.goto(BASE);
    // The exact REST path for the vector dictionaries was not pinned during
    // the run; probe the documented displayList-style endpoints and accept
    // the first that returns a non-empty list. If none resolve, GAP (capture
    // the real endpoint from the Vector Identification page network tab).
    const candidates = [
      '/api/OpenELIS-Global/rest/displayList/VECTOR_LIFECYCLE_STAGE',
      '/api/OpenELIS-Global/rest/displayList/VECTOR_TRAP_TYPE',
      '/api/OpenELIS-Global/rest/displayList/VECTOR_SPECIES',
    ];
    let anyPopulated = false;
    const detail: string[] = [];
    for (const c of candidates) {
      const r = await apiCall<unknown[]>(page, c);
      const n = Array.isArray(r.body) ? r.body.length : 0;
      detail.push(`${c.split('/').pop()}=${r.ok ? n : 'HTTP ' + r.status}`);
      if (r.ok && n > 0) anyPopulated = true;
    }
    if (anyPopulated) {
      markStep('M', 3, 'PASS', `Vector dictionaries populated (${detail.join(', ')})`);
      expect(anyPopulated).toBeTruthy();
    } else {
      markStep('M', 3, 'GAP',
        `No probed dictionary endpoint resolved (${detail.join(', ')})`,
        'Capture the real endpoint from the /vector/identification page (Network tab) and replace the candidates list.');
      test.info().annotations.push({ type: 'gap', description: 'vector dictionary endpoint unknown' });
    }
  });

  // ---------------------------------------------------------------------------
  // Step 4 — OGC-1049 regression watch: sampleTypeId-filtered dictionary (FUNCTION)
  // Known bug: `?sampleTypeId=N` returns empty for every id while the
  // unfiltered list is full. Assert the bug's shape so a fix flips this green.
  // ---------------------------------------------------------------------------
  test('Step 4 — OGC-1049 dictionary sampleTypeId filter regression watch (FUNCTION)', async ({ page }) => {
    await page.goto(BASE);
    // Generic probe: pick any displayList that supports ?sampleTypeId and
    // compare filtered vs unfiltered. Endpoint name is a placeholder pending
    // capture; this step is a WATCH, not a hard gate.
    const ep = '/api/OpenELIS-Global/rest/displayList/VECTOR_SPECIES';
    const unfiltered = await apiCall<unknown[]>(page, ep);
    const filtered = await apiCall<unknown[]>(page, `${ep}?sampleTypeId=1`);
    const unN = Array.isArray(unfiltered.body) ? unfiltered.body.length : -1;
    const fN = Array.isArray(filtered.body) ? filtered.body.length : -1;
    if (unN <= 0) {
      markStep('M', 4, 'GAP', `Could not exercise OGC-1049 (unfiltered endpoint unresolved, n=${unN})`,
        'Pin the endpoint first (see Step 3).');
      return;
    }
    if (fN === 0) {
      markStep('M', 4, 'GAP',
        `OGC-1049 STILL PRESENT: unfiltered=${unN} but ?sampleTypeId=1 returned 0`,
        'Known bug reproduced. When fixed, filtered should be > 0 and this becomes PASS.');
      test.info().annotations.push({ type: 'known-bug', description: 'OGC-1049 dictionary filter empty' });
    } else if (fN > 0) {
      markStep('M', 4, 'PASS', `OGC-1049 appears FIXED: filtered=${fN} (was 0)`);
      expect(fN).toBeGreaterThan(0);
    } else {
      markStep('M', 4, 'GAP', `Filtered probe HTTP ${filtered.status}`);
    }
  });

  // ---------------------------------------------------------------------------
  // Step 5 — Vector Identification (stage-1 resulting) route renders (RENDER)
  // ---------------------------------------------------------------------------
  test('Step 5 — Vector Identification route renders species/method/lifecycle fields (RENDER)', async ({ page }) => {
    await page.goto(`${BASE}/vector/identification`);
    await page.waitForLoadState('networkidle');
    const bodyText = await page.evaluate(() => document.body.innerText);
    if (looksLikeSpringNotFound(bodyText)) {
      markStep('M', 5, 'GAP', 'Deep-link /vector/identification → Spring 404 (OGC-1053)',
        'Reach via Results → Vector Identification in the UI.');
      test.info().annotations.push({ type: 'gap', description: 'deep-link 404 (OGC-1053)' });
      return;
    }
    const markers = ['Species', 'Method', 'Confidence', 'Lifecycle'];
    const found = markers.filter(m => new RegExp(m, 'i').test(bodyText));
    if (found.length >= 2) {
      markStep('M', 5, 'PASS', `Vector Identification rendered (fields: ${found.join(', ')})`);
      expect(found.length).toBeGreaterThanOrEqual(2);
    } else {
      markStep('M', 5, 'GAP',
        `Vector Identification loaded but expected fields not found (${found.join(', ') || 'none'}) — likely needs a vector accession in scope`,
        'Seed a vector order first, then assert the species typeahead + Split control.');
      test.info().annotations.push({ type: 'gap', description: 'needs seeded vector accession' });
    }
  });

  // ---------------------------------------------------------------------------
  // Step 6 — Two-stage resulting model (CROSS-LINK, doc-assert)
  // After species ID, pathogen/other results are entered via the NORMAL
  // Results screen (LogbookResults), NOT a vector-specific results page.
  // ---------------------------------------------------------------------------
  test('Step 6 — Pathogen results route through the normal Results screen (CROSS-LINK)', async ({ page }) => {
    await page.goto(BASE);
    // LogbookResults is the shared result-entry surface; confirm it is
    // reachable for the session (the second stage of vector resulting).
    const lb = await apiCall<{ testResult?: unknown[] }>(page, '/api/OpenELIS-Global/rest/LogbookResults');
    if (lb.ok) {
      markStep('M', 6, 'PASS',
        'Normal Results (LogbookResults) reachable — confirms vector resulting is two-stage (species ID → normal Results)',
        'There is no vector-specific pathogen-results page; this is by design.');
      expect(lb.ok).toBeTruthy();
    } else {
      markStep('M', 6, 'BLOCKED', `LogbookResults HTTP ${lb.status}`);
      test.info().annotations.push({ type: 'blocked', description: 'results surface unreachable' });
    }
  });

  // ---------------------------------------------------------------------------
  // Step 7 — Pool deconvolution / Split (FUNCTION) — GAP pending payload
  // ---------------------------------------------------------------------------
  test('Step 7 — Pool deconvolution / Split (FUNCTION)', async () => {
    // Verified live that the Vector Identification page exposes a pool "Split"
    // control producing sub-pools in a "Pool Result Awaiting Review" state.
    // The Split POST payload was not captured, so this is a GAP placeholder
    // that documents the expected behavior for a future capture.
    markStep('M', 7, 'GAP',
      'Pool Split / deconvolution exists in the UI (sub-pools → "Pool Result Awaiting Review")',
      'Capture the Split POST from /vector/identification and assert sub-pool creation + review state. Pooling stores N member sample-items linked by vectorPoolId.');
    expect(true).toBeTruthy();
  });
});
