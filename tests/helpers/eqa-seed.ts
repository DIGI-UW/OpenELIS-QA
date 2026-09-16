/**
 * tests/helpers/eqa-seed.ts
 *
 * Seeds the EQA V2 surface: a programme, its test assignments, enrolled organisations and
 * a distribution. Every EQA screen on a fresh instance renders an empty table, so without
 * this every EQA assertion degenerates into "the page loaded".
 *
 * The contracts here were read off the controllers in
 * `org.openelisglobal.eqa.controller.rest`, not guessed. Where a body key is unusual it is
 * called out at the call site.
 *
 * Idempotent by name: re-running reuses the QA_AUTO_EQA programme it already made.
 */
import type { Page } from '@playwright/test';
import { apiCall } from '../chains/_common';

export const EQA_API = '/api/OpenELIS-Global/rest/eqa';
export const EQA_PROGRAM_NAME = 'QA_AUTO_EQA Programme';

/**
 * The EQA helpers deliberately do NOT roll their own fetch. `apiCall` in tests/chains/_common
 * already knows where this app keeps its CSRF token (localStorage 'CSRF', not a meta tag or a
 * cookie) and puts it on every non-GET. A second implementation that guessed differently got
 * `403 CSRF token missing or invalid` on the first write.
 */
export { apiCall as eqaCall } from '../chains/_common';

export interface SeededMyProgram { id: number; programName: string; testIds: number[] }

export interface SeededEqa {
  programId: number;
  programName: string;
  organizationIds: number[];
  enrollmentIds: number[];
  distributionId?: number;
  testIds: number[];
  notes: string[];
}

/**
 * Ensure a QA_AUTO programme exists with tests assigned, at least two organisations
 * enrolled, and one distribution. Returns what it found or made.
 */
export async function seedEqaProgram(page: Page, opts: { withDistribution?: boolean } = {}): Promise<SeededEqa> {
  const notes: string[] = [];

  // 1. Programme (reuse by name).
  const list = await apiCall<Array<{ id?: number; name?: string }>>(page, `${EQA_API}/programs`);
  const existing = Array.isArray(list.body) ? list.body.find((p) => p?.name === EQA_PROGRAM_NAME) : undefined;
  let programId: number;
  if (existing?.id !== undefined) {
    programId = Number(existing.id);
    notes.push(`reused programme ${programId}`);
  } else {
    const made = await apiCall<{ id?: number }>(page, `${EQA_API}/programs`, {
      method: 'POST',
      body: { name: EQA_PROGRAM_NAME, description: 'Seeded by OpenELIS-QA', provider: 'QA_AUTO Provider' },
    });
    if (!made.ok || made.body?.id === undefined) {
      throw new Error(`EQA seed: could not create programme (HTTP ${made.status} ${JSON.stringify(made.body).slice(0, 200)})`);
    }
    programId = Number(made.body.id);
    notes.push(`created programme ${programId}`);
  }

  // 2. Test assignments on the SCHEME-side programme.
  //
  //    Non-fatal on purpose. `PUT /programs/{id}/tests` cannot currently succeed:
  //    EQAProgramTest declares sys_user_id NOT NULL and EQAProgramServiceImpl.assignTest()
  //    never sets it, so every call ends in a ConstraintViolationException the controller
  //    reports as 400. Recorded in notes and pinned by EQA-L-02 rather than aborting the
  //    seed, because nothing else in the lifecycle depends on it -- the LAB side keeps its
  //    own test list on EQALabProgramEnrollment (see seedMyProgram).
  const catalog = await apiCall<Array<{ id?: string; value?: string }>>(page, '/api/OpenELIS-Global/rest/test-list');
  const testIds = (Array.isArray(catalog.body) ? catalog.body : [])
    .map((t) => Number(t?.id ?? t?.value))
    .filter((n) => Number.isFinite(n))
    .slice(0, 3);
  if (testIds.length) {
    const assigned = await apiCall(page, `${EQA_API}/programs/${programId}/tests`, { method: 'PUT', body: { testIds } });
    notes.push(`test assignment PUT -> ${assigned.status} (${testIds.join(',')})${assigned.ok ? '' : ` :: ${JSON.stringify(assigned.body).slice(0, 200)}`}`);
  }

  // 3. Enrolment. `eligible-organizations` takes programId as a QUERY param and already
  //    excludes anyone enrolled, so an idempotent re-run legitimately sees fewer of them.
  const eligible = await apiCall<Array<{ id?: number | string }>>(page, `${EQA_API}/eligible-organizations?programId=${programId}`);
  const eligibleIds = (Array.isArray(eligible.body) ? eligible.body : [])
    .map((o) => Number(o?.id)).filter((n) => Number.isFinite(n));
  const enrollmentIds: number[] = [];
  const organizationIds: number[] = [];
  const already = await apiCall<Array<{ id?: number; organizationId?: number }>>(page, `${EQA_API}/programs/${programId}/enrollments`);
  for (const e of Array.isArray(already.body) ? already.body : []) {
    if (e?.id !== undefined) enrollmentIds.push(Number(e.id));
    if (e?.organizationId !== undefined) organizationIds.push(Number(e.organizationId));
  }
  if (enrollmentIds.length < 2 && eligibleIds.length) {
    const want = eligibleIds.slice(0, Math.max(2 - enrollmentIds.length, 0) + 1);
    const enrolled = await apiCall<Array<{ id?: number; organizationId?: number }>>(
      page, `${EQA_API}/programs/${programId}/enrollments`, { method: 'POST', body: { organizationIds: want } });
    if (enrolled.ok && Array.isArray(enrolled.body)) {
      for (const e of enrolled.body) {
        if (e?.id !== undefined) enrollmentIds.push(Number(e.id));
        if (e?.organizationId !== undefined) organizationIds.push(Number(e.organizationId));
      }
    }
    notes.push(`enrolment POST -> ${enrolled.status} for orgs ${want.join(',')}`);
  }

  // 4. Distribution. `distributionName` (not `name`), `deadline` is a bare yyyy-mm-dd that
  //    the controller widens to 23:59:59, and it demands >= 2 participantOrganizationIds.
  let distributionId: number | undefined;
  if (opts.withDistribution) {
    const deadline = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    const dist = await apiCall<{ id?: number }>(page, `${EQA_API}/distributions`, {
      method: 'POST',
      body: {
        distributionName: `QA_AUTO_DIST_${Date.now()}`,
        programId,
        deadline,
        participantOrganizationIds: organizationIds.slice(0, 2),
      },
    });
    if (dist.ok && dist.body?.id !== undefined) distributionId = Number(dist.body.id);
    notes.push(`distribution POST -> ${dist.status}${distributionId ? ` id ${distributionId}` : ''}`);
  }

  return { programId, programName: EQA_PROGRAM_NAME, organizationIds, enrollmentIds, distributionId, testIds, notes };
}

/**
 * The LAB side of EQA: an EQALabProgramEnrollment, which is what "My EQA Programs" lists and
 * what EQAOrders joins against. Distinct from the scheme-side EQAProgram above -- different
 * table, different controller, and this one really does keep lab units, tests and panels.
 *
 * Required: programName AND provider (both non-blank, both 400 otherwise).
 */
export async function seedMyProgram(page: Page, testIds: number[]): Promise<SeededMyProgram> {
  const name = `QA_AUTO_MYPROG_${Date.now()}`;
  const made = await apiCall<{ id?: number }>(page, `${EQA_API}/my-programs`, {
    method: 'POST',
    body: {
      programName: name,
      provider: 'QA_AUTO Provider',
      description: 'Seeded by OpenELIS-QA',
      isActive: true,
      testIds,
    },
  });
  if (!made.ok || made.body?.id === undefined) {
    throw new Error(`EQA seed: could not create my-program (HTTP ${made.status} ${JSON.stringify(made.body).slice(0, 200)})`);
  }
  return { id: Number(made.body.id), programName: name, testIds };
}
