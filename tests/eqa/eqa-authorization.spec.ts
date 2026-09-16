/**
 * tests/eqa/eqa-authorization.spec.ts
 *
 * Every EQA REST controller carries a class-level guard of
 *
 *     @PreAuthorize("hasAnyRole('RECEPTION', 'RESULTS')")
 *
 * and then, on each privileged write, the guard that was meant to apply sits COMMENTED OUT:
 *
 *   EQAProgramRestController        createProgram           // @PreAuthorize("hasRole('Global Administrator')")
 *                                   updateProgram           // @PreAuthorize("hasRole('Global Administrator')")
 *                                   updateTestAssignments   // @PreAuthorize("hasRole('Global Administrator')")
 *   EQADistributionRestController   createDistribution      // @PreAuthorize("hasRole('EQA Coordinator')")
 *                                   advanceStatus           // @PreAuthorize("hasRole('EQA Coordinator')")
 *                                   generateBarcodes        // @PreAuthorize("hasRole('EQA Coordinator')")
 *   EQAEnrollmentRestController     createEnrollments       // @PreAuthorize("hasRole('EQA Coordinator')")
 *                                   updateEnrollmentStatus  // @PreAuthorize("hasRole('EQA Coordinator')")
 *
 * So a bench user with Reception or Results rights can create and rewrite EQA programmes,
 * enrol and withdraw laboratories, and advance a distribution through its lifecycle. That is
 * the scheme operator's authority, handed to every logged-in technician.
 *
 * These are SPEC assertions with test.fail(): each goes GREEN when the guard is restored,
 * which turns the run RED and says delete the marker. Never weaken the assertion to match.
 *
 * Run: npx playwright test -c eqa.config.ts --project=eqa-authorization
 */
import { test, expect } from '@playwright/test';
import { EQA_API, eqaCall, seedEqaProgram, type SeededEqa } from '../helpers/eqa-seed';

const BASE = process.env.BASE ?? 'https://testing.openelis-global.org';

/**
 * The storageState this project runs under belongs to a NON-ADMIN persona (see
 * eqa.config.ts). If that persona can perform the write, the guard is not there.
 * A 403 is the pass; a 2xx is the finding.
 */

/**
 * Report what the persona actually got. "Not 403" is not the finding -- "the write SUCCEEDED"
 * is. A 400 would mean the guard is still absent but the body was wrong, and that must not
 * read as the same result, so the status goes in the assertion message either way.
 */
function refused(label: string, status: number) {
  const verdict = status === 403 || status === 401 ? 'REFUSED'
    : status >= 200 && status < 300 ? 'ALLOWED — the write went through as a non-privileged user'
    : `NEITHER (HTTP ${status}) — not refused, but the call did not land either`;
  // eslint-disable-next-line no-console
  console.log(`[EQA authz] ${label}: HTTP ${status} — ${verdict}`);
  return status;
}

test.describe.serial('EQA authorization — the guards that are commented out', () => {
  let seeded: SeededEqa;

  test.beforeAll(() => {
    // eslint-disable-next-line no-console
    console.log('[EQA authz] every case here asserts a 403 that the product does not currently return');
  });

  test('EQA-AZ-00 — the non-admin persona can reach the EQA read surface at all (CANARY)', async ({ page }) => {
    // NOT marked test.fail(). If this one starts failing the persona lost its session or its
    // roles, and every "the guard is missing" result below would be a false negative.
    await page.goto(BASE);
    await page.waitForLoadState('domcontentloaded');
    const list = await eqaCall<unknown>(page, `${EQA_API}/programs`);
    expect(list.ok, `this persona can read /eqa/programs (HTTP ${list.status})`).toBeTruthy();
    seeded = await seedEqaProgram(page);
  });

  test('EQA-AZ-01 — creating an EQA programme requires Global Administrator (SPEC)', async ({ page }) => {
    test.fail();
    await page.goto(BASE);
    const r = await eqaCall(page, `${EQA_API}/programs`, {
      method: 'POST',
      body: { name: `QA_AUTO_AZ_${Date.now()}`, description: 'authorization probe', provider: 'QA_AUTO' },
    });
    expect(refused(test.info().title.split(' ')[0], r.status), 'a non-administrator is refused').toBe(403);
  });

  test('EQA-AZ-02 — editing an EQA programme requires Global Administrator (SPEC)', async ({ page }) => {
    test.fail();
    await page.goto(BASE);
    const r = await eqaCall(page, `${EQA_API}/programs/${seeded.programId}`, {
      method: 'PUT',
      body: { description: `authorization probe ${Date.now()}` },
    });
    expect(refused(test.info().title.split(' ')[0], r.status), 'a non-administrator is refused').toBe(403);
  });

  test('EQA-AZ-03 — reassigning a programme\'s tests requires Global Administrator (SPEC)', async ({ page }) => {
    test.fail();
    await page.goto(BASE);
    const r = await eqaCall(page, `${EQA_API}/programs/${seeded.programId}/tests`, {
      method: 'PUT',
      body: { testIds: seeded.testIds },
    });
    expect(refused(test.info().title.split(' ')[0], r.status), 'a non-administrator is refused').toBe(403);
  });

  test('EQA-AZ-04 — enrolling a laboratory requires EQA Coordinator (SPEC)', async ({ page }) => {
    test.fail();
    await page.goto(BASE);
    const eligible = await eqaCall<Array<{ id?: number }>>(page, `${EQA_API}/eligible-organizations?programId=${seeded.programId}`);
    const orgId = (Array.isArray(eligible.body) ? eligible.body : [])[0]?.id;
    const r = await eqaCall(page, `${EQA_API}/programs/${seeded.programId}/enrollments`, {
      method: 'POST',
      body: { organizationIds: orgId === undefined ? [1] : [Number(orgId)] },
    });
    expect(refused(test.info().title.split(' ')[0], r.status), 'a non-coordinator is refused').toBe(403);
  });

  test('EQA-AZ-05 — withdrawing a laboratory requires EQA Coordinator (SPEC)', async ({ page }) => {
    test.fail();
    await page.goto(BASE);
    const enrollmentId = seeded.enrollmentIds[0];
    test.skip(enrollmentId === undefined, 'no enrolment to act on');
    const r = await eqaCall(page, `${EQA_API}/programs/${seeded.programId}/enrollments/${enrollmentId}`, {
      method: 'PUT',
      body: { status: 'WITHDRAWN', reason: 'authorization probe' },
    });
    expect(refused(test.info().title.split(' ')[0], r.status), 'a non-coordinator is refused').toBe(403);
  });

  test('EQA-AZ-06 — creating a distribution requires EQA Coordinator (SPEC)', async ({ page }) => {
    test.fail();
    await page.goto(BASE);
    const deadline = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    const r = await eqaCall(page, `${EQA_API}/distributions`, {
      method: 'POST',
      body: {
        distributionName: `QA_AUTO_AZ_DIST_${Date.now()}`,
        programId: seeded.programId,
        deadline,
        participantOrganizationIds: seeded.organizationIds.slice(0, 2),
      },
    });
    expect(refused(test.info().title.split(' ')[0], r.status), 'a non-coordinator is refused').toBe(403);
  });

  test('EQA-AZ-07 — advancing a distribution requires EQA Coordinator (SPEC)', async ({ page }) => {
    test.fail();
    await page.goto(BASE);
    const list = await eqaCall<{ distributions?: Array<{ id?: number }> }>(page, `${EQA_API}/distributions`);
    const id = list.body?.distributions?.[0]?.id;
    test.skip(id === undefined, 'no distribution to advance');
    const r = await eqaCall(page, `${EQA_API}/distributions/${id}/status`, { method: 'PUT' });
    expect(refused(test.info().title.split(' ')[0], r.status), 'a non-coordinator is refused').toBe(403);
  });
});
