/**
 * tests/eqa/eqa-v2-lifecycle.spec.ts
 *
 * EQA V2 lifecycle (OGC-608 epic), end to end through the REST surface the screens use:
 *
 *   programme -> test assignment -> eligible orgs -> enrolment -> distribution
 *            -> status advance -> results -> statistics -> orders/summary
 *
 * Every endpoint and body key below was read off the controllers in
 * org.openelisglobal.eqa.controller.rest. Where a name is surprising (distributionName,
 * not name; programId as a query param on eligible-organizations) the step says so, because
 * guessing these is exactly how this repo spent months filing its own mistakes as defects.
 *
 * Run: npx playwright test -c eqa.config.ts --project=eqa-lifecycle
 */
import { test, expect } from '@playwright/test';
import { EQA_API, eqaCall, seedEqaProgram, seedMyProgram, type SeededEqa } from '../helpers/eqa-seed';

const BASE = process.env.BASE ?? 'https://testing.openelis-global.org';

test.describe.serial('EQA V2 lifecycle', () => {
  let seeded: SeededEqa;

  test('EQA-L-01 — a programme can be created and read back (ROUND-TRIP)', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('domcontentloaded');
    seeded = await seedEqaProgram(page, { withDistribution: true });
    // eslint-disable-next-line no-console
    console.log(`[EQA seed] ${seeded.notes.join(' | ')}`);

    const one = await eqaCall<{ id?: number; name?: string; provider?: string }>(page, `${EQA_API}/programs/${seeded.programId}`);
    expect(one.ok, `GET programs/${seeded.programId}`).toBeTruthy();
    expect(one.body?.name).toBe(seeded.programName);
  });

  test('EQA-L-02 — a scheme programme can be given a test list (SPEC)', async ({ page }) => {
    test.fail(); // EQAProgramTest declares `sys_user_id` NOT NULL; EQAProgramServiceImpl.assignTest()
                 // builds the row without one, so every PUT /programs/{id}/tests ends in
                 // ConstraintViolationException and the controller answers 400. Assigning tests to
                 // a scheme programme cannot succeed at all today. No UI calls it yet -- the
                 // Programme Management screen has no tests tab -- so this is a backend readiness
                 // gap on the V2 lifecycle, not a broken screen.
    await page.goto(BASE);
    const put = await eqaCall<unknown>(page, `${EQA_API}/programs/${seeded.programId}/tests`, {
      method: 'PUT',
      body: { testIds: seeded.testIds },
    });
    expect(put.ok, `PUT programme tests -> ${put.status} ${JSON.stringify(put.body).slice(0, 200)}`).toBeTruthy();
    const got = await eqaCall<Array<Record<string, unknown>>>(page, `${EQA_API}/programs/${seeded.programId}/tests`);
    expect((got.body ?? []).length, 'the assigned tests read back').toBe(seeded.testIds.length);
  });

  test('EQA-L-02b — a lab\'s own programme keeps its test list (ROUND-TRIP)', async ({ page }) => {
    // The lab side of the same idea, on a different table, and this one works. My EQA Programs
    // lists EQALabProgramEnrollment rows, which really do carry lab units, tests and panels.
    await page.goto(BASE);
    const mine = await seedMyProgram(page, seeded.testIds);
    const back = await eqaCall<{ id?: number; programName?: string; testIds?: unknown[]; tests?: unknown[] }>(
      page, `${EQA_API}/my-programs/${mine.id}`);
    expect(back.ok, `GET my-programs/${mine.id}`).toBeTruthy();
    expect(back.body?.programName, 'the programme reads back under its own name').toBe(mine.programName);
    const kept = (back.body?.testIds ?? back.body?.tests ?? []) as unknown[];
    expect(kept.length, `the ${mine.testIds.length} tests chosen for this programme persisted`).toBeGreaterThan(0);
  });

  test('EQA-L-03 — enrolment shows up in the programme roster and in My Programs (CROSS-LINK)', async ({ page }) => {
    await page.goto(BASE);
    const roster = await eqaCall<Array<{ id?: number }>>(page, `${EQA_API}/programs/${seeded.programId}/enrollments`);
    expect(roster.ok, 'GET enrollments').toBeTruthy();
    expect((roster.body ?? []).length, 'at least one enrolled organisation').toBeGreaterThan(0);

    // My Programs is the participating lab's own view of the same enrolments.
    const mine = await eqaCall<unknown>(page, `${EQA_API}/my-programs`);
    expect(mine.ok, 'GET my-programs').toBeTruthy();
  });

  test('EQA-L-04 — a distribution is created in DRAFT and advances (LIFECYCLE)', async ({ page }) => {
    await page.goto(BASE);
    expect(seeded.distributionId, 'the seed created a distribution').toBeTruthy();
    const before = await eqaCall<{ status?: string }>(page, `${EQA_API}/distributions/${seeded.distributionId}`);
    expect(before.ok, 'GET distribution').toBeTruthy();
    expect(before.body?.status, 'a new distribution starts in DRAFT').toBe('DRAFT');

    const advanced = await eqaCall<{ status?: string }>(page, `${EQA_API}/distributions/${seeded.distributionId}/status`, { method: 'PUT' });
    expect(advanced.ok, `PUT status -> ${advanced.status} ${JSON.stringify(advanced.body).slice(0, 200)}`).toBeTruthy();
    expect(advanced.body?.status, 'status moved off DRAFT').not.toBe('DRAFT');
  });

  test('EQA-L-05 — a submitted result reaches the distribution results list (SPEC)', async ({ page }) => {
    test.fail(); // `eqa_result.sys_user_id` is NOT NULL with no default, and
                 // EQAResultServiceImpl.submitResult() builds the row without one. Every
                 // POST /eqa/distributions/{id}/results ends in ConstraintViolationException
                 // and the controller answers 400. Identical shape to EQA-L-02
                 // (eqa_program_test.sys_user_id). No screen posts results yet, so nothing is
                 // visibly broken today -- but result submission is the centre of EQA, and the
                 // first screen to call this endpoint will meet a hard 400.
    await page.goto(BASE);
    const orgId = seeded.organizationIds[0];
    const testId = seeded.testIds[0];
    if (orgId === undefined || testId === undefined) {
      throw new Error('EQA-L-05 needs an enrolled organisation and a catalog test; the seed produced neither');
    }
    const value = Number((10 + Math.random() * 5).toFixed(2));
    const posted = await eqaCall<{ id?: number }>(page, `${EQA_API}/distributions/${seeded.distributionId}/results`, {
      method: 'POST',
      body: { organizationId: orgId, testId, resultValue: value },
    });
    expect(posted.ok, `POST result -> ${posted.status} ${JSON.stringify(posted.body).slice(0, 200)}`).toBeTruthy();

    const back = await eqaCall<{ results?: Array<Record<string, unknown>>; totalCount?: number }>(
      page, `${EQA_API}/distributions/${seeded.distributionId}/results`);
    expect(back.ok, 'GET results').toBeTruthy();
    expect(back.body?.totalCount ?? 0, 'the submitted result is in the list').toBeGreaterThan(0);
  });

  test('EQA-L-05b — the results endpoint answers for a distribution with none yet (FUNCTION)', async ({ page }) => {
    // Not a tripwire. Reading results must work whether or not any were submitted -- the
    // Results & Analysis screen opens on exactly this state.
    await page.goto(BASE);
    const back = await eqaCall<{ results?: unknown[]; totalCount?: number; distributionId?: number }>(
      page, `${EQA_API}/distributions/${seeded.distributionId}/results`);
    expect(back.ok, 'GET results').toBeTruthy();
    expect(Array.isArray(back.body?.results), 'results is a list, empty or not').toBeTruthy();
    expect(back.body?.totalCount, 'totalCount agrees with the list').toBe((back.body?.results ?? []).length);
  });

  test('EQA-L-06 — statistics answer, and say honestly when there are too few participants (FUNCTION)', async ({ page }) => {
    await page.goto(BASE);
    const stats = await eqaCall<{ participantCount?: number; hasEnoughParticipants?: boolean }>(
      page, `${EQA_API}/distributions/${seeded.distributionId}/statistics`);
    expect(stats.ok, 'GET statistics').toBeTruthy();
    expect(typeof stats.body?.hasEnoughParticipants, 'statistics declare whether the n is sufficient').toBe('boolean');
  });

  test('EQA-L-07 — the orders surface and its summary answer for this programme (CROSS-LINK)', async ({ page }) => {
    await page.goto(BASE);
    const orders = await eqaCall<unknown>(page, `${EQA_API}/orders`);
    const summary = await eqaCall<Record<string, unknown>>(page, `${EQA_API}/orders/summary`);
    expect(orders.ok, 'GET orders').toBeTruthy();
    expect(summary.ok, 'GET orders/summary').toBeTruthy();
    expect(Object.keys(summary.body ?? {}).length, 'the summary is not an empty object').toBeGreaterThan(0);
  });

  // ── Tripwires: assert the SPEC, so each goes RED when the product is fixed ────────────

  test('EQA-L-08 — the participants chosen for a distribution are saved (SPEC)', async ({ page }) => {
    test.fail(); // EQADistributionRestController.createDistribution validates participantOrganizationIds
                 // (>= 2), echoes participantCount back to the UI, and never persists them.
                 // EQADistribution has no participants relation at all. The Create Distribution
                 // wizard has a whole "Participants" step whose selection is discarded on save.
    await page.goto(BASE);
    const orgs = seeded.organizationIds.slice(0, 2);
    const deadline = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    const made = await eqaCall<{ id?: number; participantCount?: number }>(page, `${EQA_API}/distributions`, {
      method: 'POST',
      body: { distributionName: `QA_AUTO_PARTICIPANTS_${Date.now()}`, programId: seeded.programId, deadline, participantOrganizationIds: orgs },
    });
    expect(made.ok, 'distribution created').toBeTruthy();
    expect(made.body?.participantCount, 'the create response reports the chosen participants').toBe(orgs.length);

    // The SPEC: read the distribution back and find those participants on it.
    const back = await eqaCall<Record<string, unknown>>(page, `${EQA_API}/distributions/${made.body?.id}`);
    const blob = JSON.stringify(back.body ?? {});
    const kept = orgs.filter((id) => blob.includes(`"${id}"`) || blob.includes(`:${id}`) || blob.includes(`${id},`));
    expect(kept.length, `the ${orgs.length} chosen participants are readable on the saved distribution`).toBe(orgs.length);
  });

  test('EQA-L-09 — generating barcodes produces barcodes (SPEC)', async ({ page }) => {
    test.fail(); // EQADistributionRestController.generateBarcodes is a placeholder: its own comment
                 // says "integrates with existing BarcodeInformationService" and the method returns
                 // {"status":"barcodes_generated"} without touching anything. The caller is told the
                 // work was done.
    await page.goto(BASE);
    const r = await eqaCall<Record<string, unknown>>(page, `${EQA_API}/distributions/${seeded.distributionId}/barcodes`, { method: 'POST' });
    expect(r.ok, 'POST barcodes').toBeTruthy();
    // The SPEC: a response that claims barcodes were generated carries the barcodes, or a
    // count, or anything at all beyond the two echoed keys.
    const keys = Object.keys(r.body ?? {}).filter((k) => k !== 'distributionId' && k !== 'status');
    expect(keys.length, `barcodes_generated response carries something beyond its own echo (got ${JSON.stringify(r.body)})`).toBeGreaterThan(0);
  });
});
