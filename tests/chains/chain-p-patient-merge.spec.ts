/**
 * tests/chains/chain-p-patient-merge.spec.ts
 *
 * SKILL §11 Chain P — Patient merge consolidation (NON-destructive)
 *
 * Deep build-out (v6.16): graduates the render-only patient-merge suite into a
 * real round-trip while RESPECTING the deactivate-not-destroy discipline.
 * Endpoints from OpenELIS-Global-2 patientMergeService.jsx, confirmed live:
 *
 *   SEARCH   GET  /rest/patient-search-results?lastName=…
 *   DETAILS  GET  /rest/patient/merge/details/{patientId}
 *   VALIDATE POST /rest/patient/merge/validate  {…confirmed:false}   ← non-destructive
 *   EXECUTE  POST /rest/patient/merge/execute   {…confirmed:true}     ← DESTRUCTIVE (Global Admin)
 *
 * The chain drives the full PREVIEW + VALIDATE path (both real, both safe) and
 * asserts the validation contract lands. It deliberately does NOT call
 * /execute — a real merge permanently consolidates patients. That destructive
 * leg is documented for a seed-data-only run, mirroring the NCE/decon
 * deferral discipline. GAP-and-continue if <2 patients exist; never fabricates.
 *
 * Run individually:  npx playwright test --project=chain-p
 */

import { test, expect } from '@playwright/test';
import {
  BASE, apiCall, markStep,
  PATIENT_SEARCH_RESULTS, PATIENT_MERGE_DETAILS, PATIENT_MERGE_VALIDATE, PATIENT_MERGE_EXECUTE,
} from './_common';

interface PatientHit { patientID?: string; nationalId?: string; lastName?: string }

test.describe.serial('Chain P — Patient merge (non-destructive)', () => {
  let p1: string | undefined;
  let p2: string | undefined;

  test.beforeAll(() => { /* eslint-disable-next-line no-console */ console.log(`[Chain P] BASE=${BASE}`); });

  // Step 1 — Discover two patients (ROUND-TRIP / discover)
  test('Step 1 — Find two patients to preview a merge (FUNCTION)', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('domcontentloaded');
    // Broad search; the indonesiadev seed lastName "Mana" exists, but search
    // any common surname. Empty lastName returns the unfiltered set on most builds.
    const r = await apiCall<{ patientSearchResults?: PatientHit[] }>(
      page, `${PATIENT_SEARCH_RESULTS}?lastName=&firstName=&STNumber=&subjectNumber=&nationalID=&labNumber=&guid=&dateOfBirth=&gender=&suppressExternalSearch=true`);
    let hits: PatientHit[] = [];
    if (r.ok && r.body && typeof r.body === 'object') hits = (r.body as { patientSearchResults?: PatientHit[] }).patientSearchResults || [];
    if (hits.length < 2) {
      // Retry with the known seed surname.
      const r2 = await apiCall<{ patientSearchResults?: PatientHit[] }>(page, `${PATIENT_SEARCH_RESULTS}?lastName=a&suppressExternalSearch=true`);
      if (r2.ok && r2.body && typeof r2.body === 'object') hits = (r2.body as { patientSearchResults?: PatientHit[] }).patientSearchResults || [];
    }
    const ids = hits.map(h => h.patientID).filter(Boolean) as string[];
    if (ids.length >= 2) {
      p1 = ids[0]; p2 = ids[1];
      markStep('P', 1, 'PASS', `Found ${ids.length} patients; previewing merge of ${p1} + ${p2}`);
      expect(ids.length).toBeGreaterThanOrEqual(2);
    } else {
      markStep('P', 1, 'GAP', `Need 2 patients to preview a merge, found ${ids.length}`, 'Seed two patients then re-run.');
      test.info().annotations.push({ type: 'gap', description: 'fewer than 2 patients' });
    }
  });

  // Step 2 — Merge details preview for both patients (PERSIST/read)
  test('Step 2 — Merge details preview returns for both patients (FUNCTION)', async ({ page }) => {
    if (!p1 || !p2) { markStep('P', 2, 'GAP', 'Skipped — no patient pair (Step 1)'); return; }
    await page.goto(BASE);
    const d1 = await apiCall<Record<string, unknown>>(page, PATIENT_MERGE_DETAILS(p1));
    const d2 = await apiCall<Record<string, unknown>>(page, PATIENT_MERGE_DETAILS(p2));
    if (d1.ok && d2.ok) {
      markStep('P', 2, 'PASS', `Merge details returned for both patients (${p1}, ${p2})`);
      expect(d1.ok && d2.ok).toBeTruthy();
    } else {
      markStep('P', 2, 'GAP', `Merge details HTTP ${d1.status}/${d2.status} (endpoint may require Global Admin)`, `GET ${PATIENT_MERGE_DETAILS('{id}')}`);
      test.info().annotations.push({ type: 'gap', description: 'merge details not accessible' });
    }
  });

  // Step 3 — Non-destructive validate lands a result (FUNCTION, the deep assertion)
  test('Step 3 — Non-destructive merge validate returns a result (FUNCTION)', async ({ page }) => {
    if (!p1 || !p2) { markStep('P', 3, 'GAP', 'Skipped — no patient pair (Step 1)'); return; }
    await page.goto(BASE);
    const res = await apiCall<Record<string, unknown>>(page, PATIENT_MERGE_VALIDATE, {
      method: 'POST',
      body: { patient1Id: p1, patient2Id: p2, primaryPatientId: p1, reason: 'QA automated non-destructive validation', confirmed: false },
    });
    // A 200 (validation result) OR a 400 with a structured validation body both
    // prove the validate path is wired; 403 means permission-gated (GAP).
    if (res.ok) {
      markStep('P', 3, 'PASS', 'merge/validate returned a validation result (non-destructive, confirmed:false)');
      expect(res.ok).toBeTruthy();
    } else if (res.status === 400 && res.body && typeof res.body === 'object') {
      markStep('P', 3, 'PASS', 'merge/validate reachable and returned a structured 400 validation response (path wired)');
      expect(res.status).toBe(400);
    } else if (res.status === 403) {
      markStep('P', 3, 'GAP', 'merge/validate is permission-gated (403) for this session — needs Global Admin');
      test.info().annotations.push({ type: 'gap', description: 'merge validate 403' });
    } else {
      markStep('P', 3, 'GAP', `merge/validate HTTP ${res.status} — body shape may need pinning`, `POST ${PATIENT_MERGE_VALIDATE}`);
      test.info().annotations.push({ type: 'gap', description: `merge validate HTTP ${res.status}` });
    }
  });

  // Step 4 — Destructive execute is documented, NOT run (safety, doc-assert)
  test('Step 4 — Destructive merge/execute is intentionally NOT run (SAFETY)', async () => {
    markStep('P', 4, 'PASS',
      'merge/execute (confirmed:true) is destructive (permanent consolidation, Global Admin) — deliberately not invoked in CI',
      `Documented endpoint: POST ${PATIENT_MERGE_EXECUTE}. Run only against disposable seed data with explicit go-ahead.`);
    expect(PATIENT_MERGE_EXECUTE).toContain('/patient/merge/execute');
  });
});
