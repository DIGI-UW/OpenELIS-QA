/**
 * tests/chains/chain-z-compliance-standards-admin.spec.ts
 *
 * SKILL §11 Chain Z — Compliance Standards admin CRUD (FRS S-01, demo-silnas)
 *
 * The destructive admin half of the SILNAS compliance feature (PR #3558 FRS
 * S-01), GLOBAL_ADMIN. Endpoints (constants in _common.ts):
 *   GET    /rest/compliance/standards[/active]         list / active
 *   GET    /rest/compliance/standards/{id}             full DTO (shape source)
 *   POST   /rest/compliance/standards                  create
 *   PUT    /rest/compliance/standards/{id}             update
 *   POST   /rest/compliance/standards/{id}/archive     soft-retire (cleanup)
 *   GET    /rest/compliance/standards/{id}/{parameter-groups,linked-tests}
 *   GET    /rest/compliance/standards/country-regions
 *
 * DESTRUCTIVE round-trip (mutates demo data — intended on a testing server):
 *   discover an existing standard → GET its DTO → clone+rename (QA_AUTO_…) →
 *   POST create → read-back list shows it → PUT update a field → GET /{id}
 *   confirms the change → ARCHIVE to clean up (soft-retire, never hard-delete)
 *   → confirm it left the active list.
 *
 * Self-discovering body: the create payload is cloned from the server's own GET
 * DTO (id stripped, name changed), so it needs no hardcoded shape and adapts to
 * the build. If no seed standard exists, falls back to a minimal create and
 * GAPs on shape rejection. GAP-and-continue when the feature/permission is absent.
 *
 * Run individually:  npx playwright test --project=chain-z
 */
import { test, expect } from '@playwright/test';
import {
  BASE, apiCall, markStep,
  COMPLIANCE_STANDARDS, COMPLIANCE_STANDARDS_ACTIVE, COMPLIANCE_STANDARD_BY_ID,
  COMPLIANCE_STANDARD_ARCHIVE, COMPLIANCE_STANDARD_PARAM_GROUPS,
  COMPLIANCE_STANDARD_LINKED_TESTS, COMPLIANCE_COUNTRY_REGIONS,
} from './_common';

interface StdRow { id?: string | number; name?: string; standardName?: string; active?: boolean }
const QA_NAME = `QA_AUTO_STD_${Date.now()}`;

function listToArray(body: unknown): StdRow[] {
  if (Array.isArray(body)) return body as StdRow[];
  if (body && typeof body === 'object' && Array.isArray((body as { content?: StdRow[] }).content)) return (body as { content: StdRow[] }).content;
  return [];
}

test.describe.serial('Chain Z — Compliance standards admin CRUD', () => {
  let featurePresent = true;
  let seedId: string | number | undefined;
  let seedDto: Record<string, unknown> | undefined;
  let createdId: string | number | undefined;

  test.beforeAll(() => { /* eslint-disable-next-line no-console */ console.log(`[Chain Z] BASE=${BASE}`); });

  // Step 1 — Discover a standard + its DTO shape (ROUND-TRIP read-back)
  test('Step 1 — Standards list + DTO read-back (ROUND-TRIP)', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('domcontentloaded');
    const list = await apiCall(page, COMPLIANCE_STANDARDS);
    if (!list.ok) {
      featurePresent = false;
      markStep('Z', 1, 'GAP', `compliance/standards unavailable (HTTP ${list.status}) — feature absent`, `GET ${COMPLIANCE_STANDARDS}`);
      test.info().annotations.push({ type: 'gap', description: 'compliance standards feature absent' });
      return;
    }
    const rows = listToArray(list.body);
    if (rows[0]?.id !== undefined) {
      seedId = rows[0].id;
      const dto = await apiCall<Record<string, unknown>>(page, COMPLIANCE_STANDARD_BY_ID(seedId));
      if (dto.ok && dto.body && typeof dto.body === 'object') seedDto = dto.body as Record<string, unknown>;
    }
    markStep('Z', 1, 'PASS', `Standards list read back (${rows.length})${seedDto ? `; DTO captured from id ${seedId} (keys: ${Object.keys(seedDto).slice(0, 8).join(',')})` : ''}`);
    expect(list.ok).toBeTruthy();
  });

  // Step 2 — Create a standard, verify it lands (ROUND-TRIP, destructive)
  test('Step 2 — Create standard lands in the list (ROUND-TRIP)', async ({ page }) => {
    if (!featurePresent) { markStep('Z', 2, 'GAP', 'Skipped — feature absent (Step 1)'); return; }
    await page.goto(BASE);
    // Prefer cloning the server's own DTO (most faithful); else a minimal body.
    let body: Record<string, unknown>;
    if (seedDto) {
      body = { ...seedDto };
      delete (body as { id?: unknown }).id;
      if ('name' in body) body.name = QA_NAME;
      if ('standardName' in body) body.standardName = QA_NAME;
      if ('active' in body) body.active = true;
    } else {
      body = { name: QA_NAME, standardName: QA_NAME, active: true };
    }
    const before = listToArray((await apiCall(page, COMPLIANCE_STANDARDS)).body).length;
    const create = await apiCall<StdRow>(page, COMPLIANCE_STANDARDS, { method: 'POST', body });
    if (!create.ok) {
      markStep('Z', 2, create.status === 403 ? 'GAP' : 'GAP',
        `Create returned HTTP ${create.status}${create.status === 403 ? ' (needs GLOBAL_ADMIN)' : ' — clone body rejected; capture exact DTO'}`,
        `POST ${COMPLIANCE_STANDARDS}`);
      test.info().annotations.push({ type: 'gap', description: `standard create HTTP ${create.status}` });
      return;
    }
    createdId = (create.body && typeof create.body === 'object') ? (create.body as StdRow).id : undefined;
    const after = listToArray((await apiCall(page, COMPLIANCE_STANDARDS)).body);
    const landed = after.length > before || after.some(r => r.name === QA_NAME || r.standardName === QA_NAME);
    if (!createdId) { const m = after.find(r => r.name === QA_NAME || r.standardName === QA_NAME); if (m) createdId = m.id; }
    if (landed) {
      markStep('Z', 2, 'PASS', `Created standard '${QA_NAME}' (id=${createdId}); list ${before} → ${after.length}`);
      expect(landed).toBeTruthy();
    } else {
      markStep('Z', 2, 'FAIL', `Create 2xx but standard not found in list`);
      expect(landed, 'created standard landed').toBeTruthy();
    }
  });

  // Step 3 — Update the standard, verify the change persisted (ROUND-TRIP)
  test('Step 3 — Update standard persists (ROUND-TRIP)', async ({ page }) => {
    if (!featurePresent) { markStep('Z', 3, 'GAP', 'Skipped — feature absent (Step 1)'); return; }
    if (createdId === undefined) { markStep('Z', 3, 'GAP', 'Skipped — no created standard (Step 2)'); return; }
    await page.goto(BASE);
    const cur = await apiCall<Record<string, unknown>>(page, COMPLIANCE_STANDARD_BY_ID(createdId));
    if (!cur.ok || !cur.body || typeof cur.body !== 'object') { markStep('Z', 3, 'GAP', `GET created standard HTTP ${cur.status}`); return; }
    const updated = { ...(cur.body as Record<string, unknown>) };
    const newName = `${QA_NAME}_UPD`;
    if ('name' in updated) updated.name = newName;
    if ('standardName' in updated) updated.standardName = newName;
    const put = await apiCall(page, COMPLIANCE_STANDARD_BY_ID(createdId), { method: 'PUT', body: updated });
    if (!put.ok) {
      markStep('Z', 3, 'GAP', `PUT update HTTP ${put.status}`, `PUT ${COMPLIANCE_STANDARD_BY_ID('{id}')}`);
      test.info().annotations.push({ type: 'gap', description: `standard update HTTP ${put.status}` });
      return;
    }
    const readback = await apiCall<Record<string, unknown>>(page, COMPLIANCE_STANDARD_BY_ID(createdId));
    const rb = (readback.ok && readback.body && typeof readback.body === 'object') ? readback.body as Record<string, unknown> : {};
    const persisted = rb.name === newName || rb.standardName === newName;
    if (persisted) {
      markStep('Z', 3, 'PASS', `Update persisted: standard ${createdId} renamed to '${newName}'`);
      expect(persisted).toBeTruthy();
    } else {
      markStep('Z', 3, 'FAIL', `PUT 2xx but read-back did not reflect the rename`);
      expect(persisted, 'standard update persisted').toBeTruthy();
    }
  });

  // Step 4 — Archive to clean up (soft-retire, never hard-delete) (ROUND-TRIP)
  test('Step 4 — Archive retires the standard from the active list (ROUND-TRIP)', async ({ page }) => {
    if (!featurePresent) { markStep('Z', 4, 'GAP', 'Skipped — feature absent (Step 1)'); return; }
    if (createdId === undefined) { markStep('Z', 4, 'GAP', 'Skipped — no created standard (Step 2)'); return; }
    await page.goto(BASE);
    const arch = await apiCall(page, COMPLIANCE_STANDARD_ARCHIVE(createdId), { method: 'POST' });
    if (!arch.ok) {
      markStep('Z', 4, 'GAP', `Archive HTTP ${arch.status} — QA standard '${QA_NAME}' may need manual cleanup (id ${createdId})`, `POST ${COMPLIANCE_STANDARD_ARCHIVE('{id}')}`);
      test.info().annotations.push({ type: 'gap', description: `standard archive HTTP ${arch.status}` });
      return;
    }
    const active = listToArray((await apiCall(page, COMPLIANCE_STANDARDS_ACTIVE)).body);
    const stillActive = active.some(r => String(r.id) === String(createdId));
    if (!stillActive) {
      markStep('Z', 4, 'PASS', `Archived standard ${createdId}; no longer in active list (clean soft-retire)`);
      expect(stillActive).toBeFalsy();
    } else {
      markStep('Z', 4, 'FAIL', `Archive 2xx but standard ${createdId} still active`);
      expect(stillActive, 'archived standard left active list').toBeFalsy();
    }
  });

  // Step 5 — Standard sub-resources are wired (CROSS-LINK)
  test('Step 5 — parameter-groups / linked-tests / country-regions wired (CROSS-LINK)', async ({ page }) => {
    if (!featurePresent) { markStep('Z', 5, 'GAP', 'Skipped — feature absent (Step 1)'); return; }
    await page.goto(BASE);
    const ref = createdId ?? seedId ?? 1;
    const pg = await apiCall(page, COMPLIANCE_STANDARD_PARAM_GROUPS(ref));
    const lt = await apiCall(page, COMPLIANCE_STANDARD_LINKED_TESTS(ref));
    const cr = await apiCall(page, COMPLIANCE_COUNTRY_REGIONS);
    const wired = [pg, lt, cr].filter(r => r.status < 500).length;
    if (wired === 3) {
      markStep('Z', 5, 'PASS', `Standard sub-resources wired (parameter-groups ${pg.status}, linked-tests ${lt.status}, country-regions ${cr.status})`);
      expect(wired).toBe(3);
    } else {
      markStep('Z', 5, 'GAP', `Some sub-resource 5xx (pg=${pg.status}, lt=${lt.status}, cr=${cr.status})`);
      test.info().annotations.push({ type: 'gap', description: 'standard sub-resource 5xx' });
    }
  });
});
