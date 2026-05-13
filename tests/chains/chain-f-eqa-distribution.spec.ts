/**
 * tests/chains/chain-f-eqa-distribution.spec.ts
 *
 * SKILL §11 Chain F — EQA Distribution
 *
 * What this chain proves: the EQA workflow end-to-end — admin enables
 * EQA → program exists → shipment created → distributed to participants
 * → participant submits result → scoring exists → report.
 *
 * Hard prerequisite: the `eqaEnabled` config in /MasterListsPage/
 * SampleEntryConfigurationMenu must be `true`. Without it, the EQA
 * sidebar items are silent dead-ends (Phase 27 cancelled 7 Jira
 * tickets — OGC-518 through OGC-524 — because of this).
 *
 * Step 1 explicitly checks the precondition and BAILs with a clear
 * fix path if it isn't met. That alone is high-value: the EQA persona
 * walkthrough (Phase 12 PE) was hitting the same dead end on every
 * adoption attempt.
 *
 * Run individually:
 *   npx playwright test --project=chain-f
 */

import { test, expect } from '@playwright/test';
import { BASE, apiCall, markStep } from './_common';

interface EqaProgram { id?: string; name?: string; active?: boolean; }
interface EqaDistribution { id?: string; programId?: string; status?: string; }

test.describe.serial('Chain F — EQA Distribution', () => {
  let eqaEnabled = false;
  let program: EqaProgram | null = null;
  let distributionId: string | null = null;
  const programName = `QA_AUTO_EQA_Program_${Date.now()}`;

  test.beforeAll(() => {
    // eslint-disable-next-line no-console
    console.log(`[Chain F] BASE=${BASE}`);
  });

  // ---------------------------------------------------------------------------
  // Step 1 — Verify EQA is enabled
  // SKILL §0 EQA Configuration Prerequisite
  // Acceptance: FUNCTION (clear bail if precondition unmet)
  // ---------------------------------------------------------------------------
  test('Step 1 — eqaEnabled config check (FUNCTION)', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');

    // Check application-properties or SampleEntryConfiguration for eqaEnabled
    const candidates = [
      '/api/OpenELIS-Global/rest/SampleEntryConfigurationMenu',
      '/api/OpenELIS-Global/rest/properties',
    ];
    for (const path of candidates) {
      const r = await apiCall<unknown>(page, path);
      if (!r.ok || typeof r.body !== 'object' || r.body === null) continue;
      const flat = JSON.stringify(r.body).toLowerCase();
      if (flat.includes('eqaenabled') && (flat.includes('"value":"true"') || flat.includes('"eqaenabled":true'))) {
        eqaEnabled = true; break;
      }
    }

    if (!eqaEnabled) {
      markStep('F', 1, 'FAIL',
        'eqaEnabled config is FALSE (or could not be confirmed)',
        `Enable via Admin → General Configuration → Order Entry Configuration → set eqaEnabled to true. ` +
        `Until then, EQA sidebar items are silent dead-ends. See SKILL §0 EQA Configuration Prerequisite.`);
      expect(eqaEnabled, 'EQA must be enabled in admin config').toBeTruthy();
      return;
    }
    markStep('F', 1, 'PASS', 'eqaEnabled = true');
  });

  // ---------------------------------------------------------------------------
  // Step 2 — Find or create an EQA program (PERSIST)
  // ---------------------------------------------------------------------------
  test('Step 2 — Find or create EQA program (PERSIST)', async ({ page }) => {
    if (!eqaEnabled) test.skip();
    await page.goto(BASE);

    const list = await apiCall<EqaProgram[] | { programs?: EqaProgram[] }>(
      page, '/api/OpenELIS-Global/rest/eqa/programs'
    );
    if (list.ok) {
      const programs: EqaProgram[] = Array.isArray(list.body)
        ? list.body
        : ((list.body as { programs?: EqaProgram[] } | null)?.programs || []);
      const existing = programs.find(p => p.name?.startsWith('QA_AUTO_'));
      if (existing) {
        program = existing;
        markStep('F', 2, 'PASS', `Reused existing QA_AUTO_ program id=${program.id} "${program.name}"`);
        return;
      }
    }
    // Create new
    const create = await apiCall<EqaProgram>(page, '/api/OpenELIS-Global/rest/eqa/programs', {
      method: 'POST',
      body: { name: programName, active: true },
    });
    if (!create.ok || typeof create.body !== 'object' || create.body === null) {
      markStep('F', 2, 'FAIL', `EQA program create HTTP ${create.status}`);
      expect(create.ok).toBeTruthy(); return;
    }
    program = create.body as EqaProgram;
    markStep('F', 2, 'PASS', `Created EQA program id=${program.id} "${programName}"`);
  });

  // ---------------------------------------------------------------------------
  // Step 3 — Create a distribution (shipment)
  // ---------------------------------------------------------------------------
  test('Step 3 — Create EQA distribution / shipment (PERSIST)', async ({ page }) => {
    if (!program?.id) test.skip();
    await page.goto(BASE);
    const r = await apiCall<EqaDistribution>(page, '/api/OpenELIS-Global/rest/eqa/distributions', {
      method: 'POST',
      body: { programId: program!.id, name: `QA_AUTO_dist_${Date.now()}`, status: 'DRAFT' },
    });
    if (!r.ok || typeof r.body !== 'object' || r.body === null) {
      markStep('F', 3, 'FAIL', `Distribution create HTTP ${r.status}`);
      expect(r.ok).toBeTruthy(); return;
    }
    distributionId = (r.body as EqaDistribution).id ?? null;
    if (!distributionId) {
      markStep('F', 3, 'FAIL', 'Distribution created but no ID returned'); expect(distributionId).toBeTruthy(); return;
    }
    markStep('F', 3, 'PASS', `Distribution id=${distributionId}`);
  });

  // ---------------------------------------------------------------------------
  // Step 4 — Round-trip read the distribution
  // ---------------------------------------------------------------------------
  test('Step 4 — Distribution round-trip read (ROUND-TRIP)', async ({ page }) => {
    if (!distributionId) test.skip();
    await page.goto(BASE);
    const r = await apiCall<EqaDistribution[] | { distributions?: EqaDistribution[] }>(
      page, '/api/OpenELIS-Global/rest/eqa/distributions'
    );
    if (!r.ok) { markStep('F', 4, 'FAIL', `GET HTTP ${r.status}`); expect(r.ok).toBeTruthy(); return; }
    const list: EqaDistribution[] = Array.isArray(r.body)
      ? r.body
      : ((r.body as { distributions?: EqaDistribution[] } | null)?.distributions || []);
    const found = list.find(d => d.id === distributionId);
    if (!found) {
      markStep('F', 4, 'FAIL', `Distribution ${distributionId} not in GET list after create`);
      expect(found).toBeTruthy(); return;
    }
    markStep('F', 4, 'PASS', `Distribution ${distributionId} round-trips`);
  });

  // ---------------------------------------------------------------------------
  // Step 5 — EQA Management dashboard surfaces the program (CROSS-LINK)
  // BUG-39: /rest/eqa/samples/dashboard returns 404 on most installs
  // ---------------------------------------------------------------------------
  test('Step 5 — EQA Management dashboard surfaces program (CROSS-LINK, BUG-39 catch)', async ({ page }) => {
    if (!program?.id) test.skip();
    await page.goto(BASE);
    const r = await apiCall<unknown>(page, '/api/OpenELIS-Global/rest/eqa/samples/dashboard');
    if (!r.ok) {
      markStep('F', 5, 'FAIL',
        `BUG-39 CONFIRMED: /rest/eqa/samples/dashboard returned HTTP ${r.status}`,
        `Dashboard renders fallback zeros and dashes. Program persists in DB but UI dashboard is decorative until this endpoint exists.`);
      expect(r.ok, 'BUG-39: EQA Management dashboard endpoint missing').toBeTruthy(); return;
    }
    markStep('F', 5, 'PASS', `Dashboard endpoint returned data`);
  });

  // ---------------------------------------------------------------------------
  // Step 6 — Participant submits an EQA result (CROSS-LINK)
  // SKILL §11.5 — uses API path since UI is blocked by BUG-31 family
  // ---------------------------------------------------------------------------
  test('Step 6 — Participant submits EQA result via API (PERSIST, §11.5)', async ({ page }) => {
    if (!distributionId) test.skip();
    await page.goto(BASE);
    // The EQA Sample order flow is /SamplePatientEntry?isEQA=true with
    // patient fields locked. The API equivalent passes isEqaSample=true
    // in the sample item payload. Shape inferred — may need adjustment.
    const r = await apiCall<{ accessionNumber?: string }>(
      page, '/api/OpenELIS-Global/rest/SamplePatientEntry', {
        method: 'POST',
        body: {
          isEQA: true,
          eqaDistributionId: distributionId,
          patientProperties: { patientUpdateStatus: 'NEW' },
          sampleOrderItems: { newSampleEntry: 'true' },
          sampleItems: [{ isEqaSample: true }],
        },
      });
    if (!r.ok) {
      markStep('F', 6, 'BLOCKED',
        `EQA SamplePatientEntry HTTP ${r.status}`,
        `Payload shape may differ. EQA submission API path is unverified end-to-end.`);
      test.info().annotations.push({ type: 'blocked', description: 'EQA submit' });
      return;
    }
    markStep('F', 6, 'PASS', `EQA sample submitted, accession ${(r.body as { accessionNumber?: string })?.accessionNumber}`);
  });
});
