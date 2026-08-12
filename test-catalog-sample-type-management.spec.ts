/**
 * OpenELIS Global — Sample Type Management: create flow (OGC-296, PR #3625).
 *
 * Filename note: this file is deliberately named `test-catalog-*` so it matches the
 * `test-catalog` project's testMatch in all-tc.config.ts. The earlier draft on branch
 * qa/spec-sample-type-mgmt-pr3625 was named `sample-type-management.spec.ts`, which matches
 * NO project in that config — the documented run command silently selected zero tests.
 *
 * Source of truth order (per openelis-build-drift-check STEP 5b):
 *   1. FRS / OGC-296 acceptance criteria (Jira) — used for expected behavior.
 *   2. PR #3625 diff — pointer to the feature only.
 *   3. Live instance (testing.openelis-global.org, v3.2.1.11, build index-nhUvC0cn.js,
 *      probed 2026-08-10 via Claude in Chrome) — routes/selectors/endpoint mechanics only.
 *
 * ── Endpoint mechanics discovered 2026-08-10 (this is the important part) ──────────────
 * Create does NOT go through the REST resource path. The React admin UI posts to a legacy
 * form controller:
 *
 *   POST /rest/SampleTypeCreate
 *   {"formName":"sampleTypeCreateForm","sampleTypeEnglishName":"<name>",
 *    "sampleTypeFrenchName":"<name>","domain":"CLINICAL","active":true}
 *
 * Read and update use the REST resource:  GET /rest/sample-types[/{id}],  PUT /rest/sample-types/{id}.
 * `POST /rest/sample-types` returns 405 because create was never mapped there — that 405 is
 * the endpoint being absent, NOT a create outage. OGC-1152 was filed against that 405; the
 * create path itself works today (verified end-to-end through the real UI, records 40 and 41).
 *
 * Two derived behaviors matter for the assertions below:
 *   - `abbreviation` is never supplied by the client. The backend derives it from
 *     name.slice(0, 10). Confirmed on ids 38/39/40/41.
 *   - `description` is not part of the create contract at all. Adding a `description` key to
 *     the payload is rejected with 400 HttpMessageNotReadableException. The backend stores
 *     description = name.
 *
 * ── Divergence policy ─────────────────────────────────────────────────────────────────
 * Tests that encode behavior the FRS requires but the product does not yet deliver are marked
 * `test.fail()` with a SPEC-DIVERGENCE comment and a ticket link. The suite is green while the
 * defect is open, and turns RED the moment the defect is fixed — which is the signal to delete
 * the marker and keep the assertion. We do NOT assert the buggy-but-actual behavior; that would
 * enshrine the defect as the specification.
 *
 * Run: BASE=https://testing.openelis-global.org \
 *   npx playwright test --config=all-tc.config.ts test-catalog-sample-type-management.spec.ts
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

/** The legacy create-form payload the React UI actually sends. */
function createPayload(name: string, extra: Record<string, unknown> = {}) {
  return {
    formName: 'sampleTypeCreateForm',
    sampleTypeEnglishName: name,
    sampleTypeFrenchName: name,
    domain: 'CLINICAL',
    active: true,
    ...extra,
  };
}

/**
 * A per-run name whose FIRST TEN CHARACTERS are unique.
 *
 * This is not cosmetic. The backend derives `abbreviation` from name.slice(0, 10) and a
 * collision on that derived value is an unhandled 500 (OGC-1157). A fixed literal prefix —
 * as in the previous draft's `QA_AUTO_ST_${stamp}` — yields the same first ten characters on
 * every run, so the spec would pass once and then 500 forever after. 'Q' + 9 digits = 10 chars.
 */
function uniqueBase(): string {
  return `Q${String(Date.now()).slice(-9)}`;
}

async function findByName(page: Page, name: string) {
  const list = await api(page, '/sample-types');
  return ((list.body?.data as any[]) || []).find((s) => s.name === name);
}

/** LIMS rule: deactivate, never hard-delete. Sample Type Management exposes no delete action. */
async function deactivate(page: Page, rec: any) {
  if (rec?.id) await api(page, `/sample-types/${rec.id}`, 'PUT', { ...rec, isActive: false });
}

test.beforeEach(async ({ page }) => {
  await page.goto(`${BASE}/admin/SampleTypeManagement`);
  await page.waitForFunction(() => !!localStorage.getItem('CSRF'), null, { timeout: 15000 });
});

test.describe('Sample Type Management — create flow (OGC-296)', () => {
  test('ST-1: list renders known sample types with Name/Domain/Status/Test Count (ROUND-TRIP)', async ({ page }) => {
    const r = await api(page, '/sample-types');
    expect(r.status, 'GET /sample-types -> 200').toBe(200);
    expect(r.body.success, 'response reports success').toBe(true);

    const rows: any[] = r.body.data || [];
    expect(rows.length, 'at least the seeded Clinical sample types are present').toBeGreaterThanOrEqual(15);

    const serum = rows.find((s) => s.name === 'Serum');
    expect(serum, 'Serum row present').toBeTruthy();
    expect(serum).toEqual(
      expect.objectContaining({ domain: 'CLINICAL', isActive: true, testCount: expect.any(Number) }),
    );
    // Every record exposes the full editor contract, not just the list columns.
    expect(Object.keys(serum).sort()).toEqual(
      ['abbreviation', 'description', 'domain', 'id', 'isActive', 'name', 'sortOrder', 'testCount'],
    );
  });

  test('ST-2: a new sample type is created and round-trips through a different endpoint (ROUND-TRIP)', async ({ page }) => {
    const name = `${uniqueBase()}_CREATE`;

    const create = await api(page, '/SampleTypeCreate', 'POST', createPayload(name));
    expect(create.status, `POST /rest/SampleTypeCreate -> 2xx (got ${create.status})`).toBeGreaterThanOrEqual(200);
    expect(create.status).toBeLessThan(300);

    // Read back on a DIFFERENT endpoint than the write — this is what earns ROUND-TRIP.
    const created = await findByName(page, name);
    expect(created, 'new sample type round-trips via GET /rest/sample-types').toBeTruthy();
    expect(created).toEqual(
      expect.objectContaining({ name, domain: 'CLINICAL', isActive: true, testCount: 0 }),
    );

    // Undocumented but load-bearing: the client never sends `abbreviation`; the backend derives
    // it from the first ten characters of the name. Asserted so that a change to this rule
    // surfaces here rather than as a mystery 500 in ST-4.
    expect(created.abbreviation, 'abbreviation is auto-derived from name.slice(0,10)').toBe(name.slice(0, 10));

    await deactivate(page, created);
  });

  test('ST-2b: [SPEC-DIVERGENCE — OGC-1156] the Description captured on the create form is persisted', async ({ page }) => {
    // FRS/OGC-296: Basic Info carries "Name, description, active status", and the UI marks
    // Description required ("Provide a description of this sample type for lab staff reference").
    //
    // SPEC-DIVERGENCE (OGC-1156): the create contract has no description field. Sending one is
    // rejected 400 HttpMessageNotReadableException; omitting it stores description = name. So the
    // text an admin types is discarded with no error. Note this is NOT purely a backend
    // field-mapping defect as OGC-1156 currently states — the React form never sends the value
    // either (payload carries only sampleTypeEnglishName/FrenchName/domain/active), so the fix
    // spans both the create DTO and the form.
    test.fail();

    const name = `${uniqueBase()}_DESC`;
    const typed = 'QA probe description that must survive the round-trip';

    const create = await api(page, '/SampleTypeCreate', 'POST', createPayload(name, { description: typed }));
    expect(create.status, 'create accepts a description field').toBeLessThan(300);

    const created = await findByName(page, name);
    expect(created?.description, 'description persists as typed, not overwritten with name').toBe(typed);

    await deactivate(page, created);
  });

  test('ST-3: [SPEC-DIVERGENCE — OGC-1157] a duplicate sample type name is rejected with a validation error', async ({ page }) => {
    // OGC-296 AC: "Sample type names must be unique."
    //
    // SPEC-DIVERGENCE (OGC-1157): a duplicate name necessarily produces a duplicate derived
    // abbreviation, so this lands on the same unhandled-collision path and returns a bare 500
    // instead of a validation error. ST-3 and ST-4 are therefore ONE defect reached by two
    // premises, not two defects — confirmed live 2026-08-10 (Serum -> 500).
    test.fail();

    const dup = await api(page, '/SampleTypeCreate', 'POST', createPayload('Serum'));
    expect(dup.status, 'duplicate name -> 4xx validation error').toBeGreaterThanOrEqual(400);
    expect(dup.status, 'duplicate name -> 4xx, not an unhandled 500').toBeLessThan(500);
  });

  test('ST-4: [SPEC-DIVERGENCE — OGC-1157] a distinct name colliding on the derived abbreviation is rejected with a validation error', async ({ page }) => {
    // Distinct from ST-3: the full name is unique, only the first ten characters collide.
    // Borrows an existing seeded record as the collision donor so this case performs no writes
    // of its own (the create is expected to be refused).
    test.fail();

    const list = await api(page, '/sample-types');
    const donor = ((list.body?.data as any[]) || []).find((s) => (s.name || '').length >= 10);
    expect(donor, 'a seeded sample type with a name of at least 10 characters').toBeTruthy();

    const colliding = `${donor.name.slice(0, 10)}_QA_COLLIDE`;
    expect(colliding, 'collision candidate is a genuinely different name').not.toBe(donor.name);

    const res = await api(page, '/SampleTypeCreate', 'POST', createPayload(colliding));
    expect(res.status, 'abbreviation collision -> 4xx validation error').toBeGreaterThanOrEqual(400);
    expect(res.status, 'abbreviation collision -> 4xx, not an unhandled 500').toBeLessThan(500);

    // Defensive: if this is ever fixed by auto-disambiguating instead of refusing, don't leak a record.
    if (res.status < 300) await deactivate(page, await findByName(page, colliding));
  });
});
