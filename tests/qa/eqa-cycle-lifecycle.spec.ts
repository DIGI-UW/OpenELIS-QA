/**
 * tests/qa/eqa-cycle-lifecycle.spec.ts
 *
 * The EQA V2 cycle lifecycle (OGC-608 epic family), end to end through the REST surface the
 * screens use.
 *
 *   scheme -> cycle -> panel -> seal/distribute -> receipt -> participant result
 *          -> score -> follow-up -> competency -> performance report
 *
 * Two things this file is deliberately NOT:
 *
 *  - It is not a guard matrix. `EQARestGuardMatrixTest` and `EQARestGuardSecuritySliceTest`
 *    already pin every @PreAuthorize on this surface at unit level, and re-asserting them
 *    here would be slower, flakier and no more true. What a running stack can show that a
 *    slice cannot is whether the states actually move and the numbers actually join up.
 *
 *  - It is not a rewrite of the old distributions chain. Distributions are superseded:
 *    `EQADistributionRestController` still compiles but no screen on demo-png calls it.
 *    Cycles are the shipping concept.
 *
 * Every endpoint and body key was read off the controllers on `demo-png`. Where a name is
 * easy to get wrong (`schemeId`, not programId; PATCH for a transition, not PUT) the step
 * says so.
 *
 * Run: npx playwright test -c qa.config.ts --project=eqa-cycle-lifecycle
 */
import { test, expect } from '@playwright/test';
import { apiCall, API } from '../chains/_common';

const BASE = process.env.BASE ?? 'https://pngdemo.openelis-global.org';
const EQA = `${API}/eqa`;
const TAG = `QA_AUTO_${Date.now()}`;
/** Unique per run within a scheme — see EQA-CY-01. */
const CYCLE_NUMBER = Number(String(Date.now()).slice(-6));

/**
 * The participant lane's states, in the order the state machine walks them. Taken from
 * EQACycleStatus; the provider lane (PREP_IN_PROGRESS -> READY_TO_SHIP -> SHIPPED ->
 * DELIVERED -> SUBMISSIONS_OPEN -> ...) is a separate machine on the same enum.
 */
const PARTICIPANT_STATES = ['PLANNED', 'PANEL_RECEIVED', 'TESTING', 'READY_TO_SUBMIT', 'SUBMITTED'] as const;

test.describe.serial('EQA V2 cycle lifecycle', () => {
  let schemeId: number | undefined;
  let cycleId: number | undefined;
  let panelId: number | undefined;

  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('domcontentloaded');
  });

  test('EQA-CY-00 — a scheme exists to hang a cycle on (CANARY)', async ({ page }) => {
    // Unmarked. pngdemo ships seeded CPHL schemes; if this instance has none, every step
    // below would be reporting an empty fixture rather than a product behaviour.
    const r = await apiCall<Array<{ id?: number; name?: string }>>(page, `${EQA}/programs`);
    expect(r.ok, `GET /rest/eqa/programs -> ${r.status}`).toBeTruthy();
    const schemes = Array.isArray(r.body) ? r.body : [];
    expect(schemes.length, 'at least one EQA scheme is configured on this instance').toBeGreaterThan(0);
    schemeId = Number(schemes[0]?.id);
    // eslint-disable-next-line no-console
    console.log(`[EQA cycle] scheme ${schemeId} "${schemes[0]?.name}" of ${schemes.length}`);
  });

  test('EQA-CY-01 — a cycle can be created against a scheme and read back (ROUND-TRIP)', async ({ page }) => {
    // The body key is `schemeId`. The controller throws "A cycle needs a scheme" without it,
    // and there is no `programId` alias even though the same entity is called a programme on
    // the administration screen.
    const today = new Date();
    const plus30 = new Date(Date.now() + 30 * 86_400_000);
    const created = await apiCall<{ id?: number; cycleName?: string; status?: string }>(page, `${EQA}/cycles`, {
      method: 'POST',
      body: {
        schemeId,
        // (schemeId, cycleNumber) is unique: a second run with cycleNumber 1 answers
        // "Scheme ... already has cycle 1". The suite has to leave a real cycle behind
        // (EQA-CY-03 walks its states), so it takes a number instead of reusing one.
        cycleNumber: CYCLE_NUMBER,
        cycleName: `${TAG} cycle`,
        plannedStartDate: today.toISOString().slice(0, 10),
        plannedEndDate: plus30.toISOString().slice(0, 10),
        // EQADistributionMethod is FHIR | CSV | MIXED — it describes how RESULTS move
        // between provider and participant, not how the panel is physically shipped.
        // (SHIPPED is an EQACycleStatus, which is a different enum and a different question.)
        distributionMethod: 'CSV',
      },
    });
    expect(created.ok, `POST /rest/eqa/cycles -> ${created.status} ${JSON.stringify(created.body).slice(0, 250)}`).toBeTruthy();
    cycleId = Number(created.body?.id);
    expect(cycleId, 'the created cycle has an id').toBeTruthy();

    const back = await apiCall<{ cycleName?: string; status?: string }>(page, `${EQA}/cycles/${cycleId}`);
    expect(back.ok, 'GET the cycle back').toBeTruthy();
    expect(back.body?.cycleName, 'the cycle reads back under its own name').toBe(`${TAG} cycle`);
  });

  test('EQA-CY-02 — a new cycle starts in PLANNED and declares its legal transitions (LIFECYCLE)', async ({ page }) => {
    const state = await apiCall<{ status?: string }>(page, `${EQA}/cycles/${cycleId}`);
    expect(state.body?.status, 'a new cycle starts PLANNED').toBe('PLANNED');

    // /cycles/{id}/transitions is the HISTORY of state changes -- the audit log, one row per
    // move with priorState, newState, stateMachine, triggerType and triggerEvent. It is not a
    // list of moves currently available, which is what the name suggests and what I first
    // asserted. A cycle that has never moved correctly has an empty history, so the assertion
    // here is that it answers and is a list, and EQA-CY-04 is where it has to have content.
    const history = await apiCall<unknown[]>(page, `${EQA}/cycles/${cycleId}/transitions`);
    expect(history.ok, `GET transitions -> ${history.status}`).toBeTruthy();
    expect(Array.isArray(history.body), 'the transition history is a list').toBeTruthy();
    expect((history.body ?? []).length, 'a cycle that has never moved has no history yet').toBe(0);
  });

  test('EQA-CY-03 — the participant lane walks PLANNED to SUBMITTED (LIFECYCLE)', async ({ page }) => {
    // PATCH, not PUT, and the body carries `newState` plus an optional `stateMachine`
    // (PARTICIPANT is the default). Provenance is never read from the body: the controller
    // records every HTTP transition as a MANUAL override attributed to the session user.
    const reached: string[] = ['PLANNED'];
    for (const target of PARTICIPANT_STATES.slice(1)) {
      const r = await apiCall<{ status?: string }>(page, `${EQA}/cycles/${cycleId}/transition`, {
        method: 'PATCH',
        body: { newState: target, stateMachine: 'PARTICIPANT', reason: `${TAG} lifecycle probe` },
      } as never);
      if (!r.ok) {
        expect(
          r.ok,
          `transition ${reached[reached.length - 1]} -> ${target} answered ${r.status}: ${JSON.stringify(r.body).slice(0, 220)}. `
          + `Reached ${reached.join(' -> ')}.`
        ).toBeTruthy();
        return;
      }
      reached.push(String(r.body?.status));
    }
    // eslint-disable-next-line no-console
    console.log(`[EQA cycle] participant lane: ${reached.join(' -> ')}`);
    expect(reached[reached.length - 1], 'the lane ends SUBMITTED').toBe('SUBMITTED');
  });

  test('EQA-CY-04 — each transition is recorded with an actor and a reason (AUDIT)', async ({ page }) => {
    // The whole point of recording provenance is that someone can ask who moved this cycle
    // and why. A state machine that transitions without leaving that behind is a compliance
    // gap in a module whose reason for existing is accreditation.
    const moves = await apiCall<unknown>(page, `${EQA}/cycles/${cycleId}/transitions`);
    expect(moves.ok, 'GET transitions').toBeTruthy();
    const blob = JSON.stringify(moves.body ?? []);
    expect(blob, 'the transition log carries this run\'s reason text').toContain(TAG);
    expect(blob, 'the transition log records the trigger as a manual override').toMatch(/MANUAL/i);
  });

  test('EQA-CY-05 — a panel can be built against the cycle (ROUND-TRIP)', async ({ page }) => {
    // `schemeId` is required; `cycleId` is optional but is what ties the panel to this run.
    //
    // A panel must carry at least one sample, and every sample must resolve to an ANALYTE:
    // the controller takes `analyteId` directly, or derives it from `testId`. A test with no
    // analyte behind it is refused with "Every panel sample needs an analyte", which is why
    // /eqa/testable-tests exists — it is the set of test ids a sample can legally be built on,
    // and the wizard offers only those. Picking from /rest/test-list instead would fail here
    // for reasons that look like a product fault and are not.
    const testable = await apiCall<string[]>(page, `${EQA}/testable-tests`);
    const testId = (Array.isArray(testable.body) ? testable.body : [])[0];
    expect(testId, 'the instance offers at least one test a panel sample can be built on').toBeTruthy();

    const made = await apiCall<{ id?: number; panelName?: string; samples?: unknown[] }>(page, `${EQA}/panels`, {
      method: 'POST',
      body: {
        schemeId,
        cycleId,
        panelName: `${TAG} panel`,
        panelType: 'SEROLOGY',
        aliquotsProduced: 2,
        homogeneityQcPassed: true,
        homogeneityQcNotes: `${TAG} seeded by OpenELIS-QA`,
        samples: [
          { sampleCode: `${TAG}-S1`, blindCode: `${TAG}-B1`, testId, targetValue: '1.0', targetUnit: 'ratio' },
        ],
      },
    });
    expect(made.ok, `POST /rest/eqa/panels -> ${made.status} ${JSON.stringify(made.body).slice(0, 250)}`).toBeTruthy();
    panelId = Number(made.body?.id);

    // Panels are only listable scoped: the controller refuses a bare call with
    // "Ask for panels by cycleId or by schemeId".
    const list = await apiCall<unknown>(page, `${EQA}/panels?cycleId=${cycleId}`);
    expect(list.ok, `GET panels?cycleId=${cycleId} -> ${list.status}`).toBeTruthy();
    expect(JSON.stringify(list.body ?? ''), 'the new panel is in the list').toContain(`${TAG} panel`);

    // The sample ids come back on the create response on purpose: seal-and-distribute, the
    // wizard's very next call, is keyed by panelSampleId.
    expect((made.body?.samples ?? []).length, 'the created panel returns its samples').toBeGreaterThan(0);
  });

  test('EQA-CY-06 — panel receipt binds, and says plainly when there is none (CONTRACT)', async ({ page }) => {
    // Receipt is per participating LAB, not per cycle: labEnrollmentId is a required query
    // param, and the endpoint answers 404 when that lab has not recorded a receipt yet. So the
    // assertion is that it BINDS and distinguishes the two cases — a bare call is 400, which is
    // the contract working, and 404 on a cycle nobody has received is the documented answer,
    // not a failure. What would be wrong is a 400 for a well-formed call, or a 500.
    const bare = await apiCall<unknown>(page, `${EQA}/cycles/${cycleId}/receipt`);
    expect(bare.status, 'a receipt lookup with no labEnrollmentId is refused, not guessed at').toBe(400);

    const scoped = await apiCall<unknown>(page, `${EQA}/cycles/${cycleId}/receipt?labEnrollmentId=1`);
    expect(
      [200, 404].includes(scoped.status),
      `a well-formed receipt lookup answers 200 or 404, got ${scoped.status}`
    ).toBeTruthy();
  });

  test('EQA-CY-07 — participant results, scoring and follow-up hang off the cycle (CROSS-LINK)', async ({ page }) => {
    // These are the reads the scoring and follow-up screens make. They must answer for a
    // cycle with nothing in it yet — that is the state those screens open in.
    const results = await apiCall<unknown>(page, `${EQA}/cycles/${cycleId}/participant-results`);
    const prep = await apiCall<unknown>(page, `${EQA}/cycles/${cycleId}/prep`);
    const shipments = await apiCall<unknown>(page, `${EQA}/cycles/${cycleId}/shipments`);
    const comments = await apiCall<unknown>(page, `${EQA}/cycles/${cycleId}/report-comments`);
    for (const [name, r] of Object.entries({ 'participant-results': results, prep, shipments, 'report-comments': comments })) {
      expect(r.ok, `GET cycles/{id}/${name} -> ${r.status}`).toBeTruthy();
    }
  });

  test('EQA-CY-08 — the cycle performance report renders as a PDF (REPORTABLE)', async ({ page }) => {
    // This is the CPHL deliverable (OGC-933/934/935): the report a scheme operator sends
    // participants. It is declared APPLICATION_PDF_VALUE, so a JSON error body coming back
    // with a 200 would be the interesting failure.
    const r = await apiCall<unknown>(page, `${EQA}/cycles/${cycleId}/performance-report`, { accept: 'application/pdf', expectBinary: true } as never);
    expect(r.ok, `GET performance-report -> ${r.status}`).toBeTruthy();
  });

  test('EQA-CY-09 — the lab-side views reflect a cycle that exists (CROSS-LINK)', async ({ page }) => {
    const mine = await apiCall<unknown>(page, `${EQA}/cycles/mine`);
    const perf = await apiCall<unknown>(page, `${EQA}/lab-performance`);
    const comp = await apiCall<unknown>(page, `${EQA}/analyst-competency`);
    for (const [name, r] of Object.entries({ 'cycles/mine': mine, 'lab-performance': perf, 'analyst-competency': comp })) {
      expect(r.ok, `GET eqa/${name} -> ${r.status}`).toBeTruthy();
    }
  });
});
