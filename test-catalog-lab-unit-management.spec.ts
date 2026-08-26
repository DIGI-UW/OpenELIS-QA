/**
 * OpenELIS Global — Lab Unit Management: first-increment CRUD contract (OGC-189, PR #4121).
 *
 * Source of truth order (per openelis-build-drift-check STEP 5b):
 *   1. FRS / OGC-189 epic acceptance criteria (Jira) — used for expected behavior.
 *   2. PR #4121 diff/body — pointer to what THIS increment actually claims to deliver.
 *   3. Live instance (testing.openelis-global.org, v3.2.2.0, build index-DhyHHvJn.js,
 *      probed 2026-08-25 via Claude in Chrome) — routes/selectors/endpoint mechanics only.
 *
 * ── Scope note (important) ─────────────────────────────────────────────────────────────
 * OGC-189 is a large epic (list drag-and-drop, Domain MultiSelect filter, Workflows/Panels/
 * Programs/Projects tabs, deactivation cascade prompts with impact summary, JSON/CSV
 * import-export). PR #4121 is explicitly its "first increment": list + Basic Info + Assigned
 * Tests (bulk assign/reassign) + Display Order (1-based move), locale-generic names, and an
 * ADMIN-gated REST controller. This spec covers ONLY what #4121 claims. The remaining epic
 * acceptance criteria (drag-and-drop, Domain MultiSelect, Workflows/Panels/Programs/Projects,
 * deactivate-cascade, import/export) are NOT yet built — they are future-PR scope, not
 * defects, and are deliberately left off this spec rather than encoded as SPEC-DIVERGENCE.
 *
 * ── Endpoint mechanics discovered 2026-08-25 (live, via network-request capture + probes) ──
 *   GET  /rest/lab-units-management            list, {success,message,data:[...]}
 *   GET  /rest/lab-units-management/{id}       single record, same shape as a list row
 *   GET  /rest/lab-units-management/{id}/tests assigned tests: [{id,name,domain,active}, ...]
 *   POST /rest/lab-units-management            create; body {names:{en,fr}, domain, description,
 *                                               isActive}
 *
 * Two derived behaviors matter for the assertions below:
 *   - `isActive` in the create payload is NOT honored — a create sent with isActive:true came
 *     back isActive:false (id 183, probed live). No FRS/PR text documents an intended default,
 *     so this is recorded as a live-confirmed CONTRACT FACT (LU-2b) rather than asserted as a
 *     bug — flagging for Casey in the PR body since "new units start inactive" is a reasonable
 *     but unconfirmed product decision.
 *   - `name` is capped at 20 characters server-side (422 "name must be at most 20 characters"),
 *     and duplicate names are rejected (422 "A lab unit with this name already exists") —
 *     both confirmed live, not visible in the PR diff's description.
 *
 * UI-level behaviors claimed by the PR body but NOT exercised by this API-contract-tier spec
 * (would need real page interaction, not just fetch/round-trip — gap-queued for a follow-up
 * page-interaction pass): the OGC-748-style Domain-change confirmation modal, the
 * Assign/Reassign dialog flows, Display Order drag/move, and the Deactivate-in-use warning.
 *
 * Run: BASE=https://testing.openelis-global.org \
 *   npx playwright test --config=all-tc.config.ts --project=test-catalog test-catalog-lab-unit-management.spec.ts
 */

import { test, expect, Page } from '@playwright/test';

const BASE = process.env.BASE || 'https://testing.openelis-global.org';

type ApiResult = { status: number; body: any };

async function api(
  page: Page,
  path: string,
  method: 'GET' | 'POST' | 'PUT' = 'GET',
  payload?: any,
): Promise<ApiResult> {
  return page.evaluate(
    async ({ path, method, payload }) => {
      const csrf = localStorage.getItem('CSRF') || '';
      const init: RequestInit = {
        method,
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        credentials: 'include',
      };
      if (method !== 'GET') init.body = JSON.stringify(payload ?? {});
      const r = await fetch('/api/OpenELIS-Global/rest' + path, init);
      let body: any;
      try { body = await r.json(); } catch { body = null; }
      return { status: r.status, body };
    },
    { path, method, payload },
  );
}

/** A per-run name whose length stays under the server's 20-character cap (LU-3). */
function uniqueName(prefix = 'QAprobe'): string {
  const stamp = String(Date.now()).slice(-6);
  return `${prefix}${stamp}`.slice(0, 20);
}

function createPayload(name: string, extra: Record<string, unknown> = {}) {
  return {
    names: { en: name, fr: name },
    domain: 'CLINICAL',
    description: 'qa probe',
    isActive: true,
    ...extra,
  };
}

async function findByName(page: Page, name: string) {
  const list = await api(page, '/lab-units-management');
  return ((list.body?.data as any[]) || []).find((u) => u.name === name);
}

/** LIMS rule: deactivate, never hard-delete. Lab Unit Management exposes no delete action. */
async function deactivate(page: Page, rec: any) {
  if (rec?.id) {
    await api(page, `/lab-units-management/${rec.id}`, 'PUT', {
      names: rec.names,
      domain: rec.domain,
      description: rec.description,
      isActive: false,
    });
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto(`${BASE}/MasterListsPage/LabUnitManagement`);
  await page.waitForFunction(() => !!localStorage.getItem('CSRF'), null, { timeout: 15000 });
});

test.describe('Lab Unit Management — first-increment CRUD contract (OGC-189, PR #4121)', () => {
  test('LU-1: list renders known lab units with the editor contract shape (ROUND-TRIP)', async ({ page }) => {
    const r = await api(page, '/lab-units-management');
    expect(r.status, 'GET /lab-units-management -> 200').toBe(200);
    expect(r.body.success, 'response reports success').toBe(true);

    const rows: any[] = r.body.data || [];
    expect(rows.length, 'at least the seeded lab units are present').toBeGreaterThanOrEqual(10);

    const biochem = rows.find((u) => u.name === 'Biochemistry');
    expect(biochem, 'Biochemistry row present').toBeTruthy();
    expect(biochem).toEqual(
      expect.objectContaining({ domain: 'CLINICAL', isActive: true, testCount: expect.any(Number) }),
    );
    // locale-generic names: PR #4121 carries a names map keyed by locale (OGC-1112), not
    // hard-coded english/french fields.
    expect(biochem.names, 'names is a locale-keyed map, not hard-coded english/french fields').toEqual(
      expect.objectContaining({ en: expect.any(String) }),
    );
    expect(Object.keys(biochem).sort()).toEqual(
      ['description', 'domain', 'id', 'isActive', 'isExternal', 'name', 'names', 'sortOrder', 'testCount'],
    );
  });

  test('LU-2: a new lab unit is created and round-trips through GET /{id} (ROUND-TRIP)', async ({ page }) => {
    const name = uniqueName();
    const create = await api(page, '/lab-units-management', 'POST', createPayload(name));
    expect(create.status, `POST /lab-units-management -> 201 (got ${create.status})`).toBe(201);
    expect(create.body.success, 'create reports success').toBe(true);

    const id = create.body.data?.id;
    expect(id, 'created record carries an id').toBeTruthy();

    // Round-trip on a DIFFERENT endpoint (single-record GET) than the write.
    const single = await api(page, `/lab-units-management/${id}`);
    expect(single.status).toBe(200);
    expect(single.body.data).toEqual(
      expect.objectContaining({ id, name, domain: 'CLINICAL', description: 'qa probe', testCount: 0 }),
    );

    await deactivate(page, single.body.data);
  });

  test('LU-2b: a newly created lab unit is inactive regardless of the isActive sent (CONTRACT FACT, not asserted as a defect)', async ({ page }) => {
    // Neither the OGC-189 epic AC nor the PR #4121 body documents an intended default
    // activation state for a freshly created lab unit. Live probe 2026-08-25 (id 183):
    // POST with isActive:true still came back isActive:false. Recording as a passing
    // assertion of ACTUAL behavior (not a SPEC-DIVERGENCE — there is no stated spec to
    // diverge from) so a future change to this default is visible here rather than as a
    // silent surprise. Casey: worth confirming with the dev whether this is intentional
    // ("new units start inactive until tests are assigned") or an oversight.
    const name = uniqueName('QAforce');
    const create = await api(page, '/lab-units-management', 'POST', createPayload(name, { isActive: true }));
    expect(create.status).toBe(201);
    expect(create.body.data?.isActive, 'created record is inactive even though isActive:true was sent').toBe(false);

    await deactivate(page, create.body.data);
  });

  test('LU-3: [negative] a name over 20 characters is rejected with a validation error', async ({ page }) => {
    const tooLong = 'QA_PROBE_LAB_UNIT_NAME_TOO_LONG_' + Date.now();
    expect(tooLong.length, 'sanity: the probe name really is over 20 chars').toBeGreaterThan(20);

    const r = await api(page, '/lab-units-management', 'POST', createPayload(tooLong));
    expect(r.status, 'over-length name -> 422 validation error').toBe(422);
    expect(r.body.success).toBe(false);
    expect(r.body.message, 'error message names the 20-character cap').toMatch(/20 characters/i);
  });

  test('LU-4: [negative] a duplicate lab unit name is rejected with a validation error, original record untouched', async ({ page }) => {
    const name = uniqueName('QAdup');
    const create = await api(page, '/lab-units-management', 'POST', createPayload(name));
    expect(create.status).toBe(201);
    const original = create.body.data;

    const dup = await api(page, '/lab-units-management', 'POST', createPayload(name, { description: 'different description' }));
    expect(dup.status, 'duplicate name -> 4xx validation error').toBeGreaterThanOrEqual(400);
    expect(dup.status, 'duplicate name -> 4xx, not an unhandled 500').toBeLessThan(500);
    expect(dup.body.message, 'error message names the collision').toMatch(/already exists/i);

    // The original record must be untouched by the rejected duplicate attempt.
    const readback = await api(page, `/lab-units-management/${original.id}`);
    expect(readback.body.data.description, 'original record is unaffected by the rejected duplicate').toBe('qa probe');

    await deactivate(page, original);
  });

  test('LU-5: assigned-tests contract returns the expected per-test shape for a populated lab unit (ROUND-TRIP)', async ({ page }) => {
    // NOTE: unlike every other endpoint in this file, /tests returns the array directly —
    // it is NOT wrapped in {success,message,data}. Confirmed live 2026-08-25 (a first draft
    // of this spec assumed the wrapped shape by analogy with the other endpoints and got a
    // real Playwright failure on this exact line — corrected here rather than papered over).
    const r = await api(page, '/lab-units-management/56/tests'); // 56 = Biochemistry, live-confirmed 441 tests
    expect(r.status, 'GET /lab-units-management/56/tests -> 200').toBe(200);

    const tests: any[] = Array.isArray(r.body) ? r.body : [];
    expect(Array.isArray(r.body), '/tests responds with a bare array, not {success,data}').toBe(true);
    expect(tests.length, 'Biochemistry has a substantial assigned-test count').toBeGreaterThanOrEqual(400);
    expect(tests[0]).toEqual(
      expect.objectContaining({ id: expect.anything(), name: expect.any(String), domain: expect.any(String), active: expect.any(Boolean) }),
    );
  });

  test('LU-6: a lab unit with zero assigned tests returns an empty (not error) tests list (ROUND-TRIP, edge case)', async ({ page }) => {
    const name = uniqueName('QAempty');
    const create = await api(page, '/lab-units-management', 'POST', createPayload(name));
    expect(create.status).toBe(201);
    const id = create.body.data.id;

    const r = await api(page, `/lab-units-management/${id}/tests`);
    expect(r.status, 'a freshly created (test-less) lab unit still returns 200, not 404/500').toBe(200);
    expect(r.body, 'tests list is a bare empty array, not null/wrapped/error').toEqual([]);

    await deactivate(page, create.body.data);
  });
});
