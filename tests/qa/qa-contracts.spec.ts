/**
 * tests/qa/qa-contracts.spec.ts
 *
 * The /qa module's REST surface, read as an admin: every endpoint the screens depend on
 * answers, and answers with the envelope its caller expects.
 *
 * Endpoints and body keys here were read off the controllers on `demo-png`, not guessed.
 * That is not a style note: this repo has repeatedly filed its own invented routes as
 * product defects, so a 404 in this file means "the contract moved", and the first thing to
 * check is the controller, not the product.
 *
 * Run: npx playwright test -c qa.config.ts --project=qa-contracts
 */
import { test, expect } from '@playwright/test';
import { apiCall, API } from '../chains/_common';

const BASE = process.env.BASE ?? 'https://pngdemo.openelis-global.org';

/** Endpoints that must answer 2xx for an admin, grouped by the lane that depends on them. */
const READ_CONTRACTS: Array<{ lane: string; path: string; expect?: (body: unknown) => boolean; note?: string }> = [
  // Overview
  { lane: 'overview', path: '/qa/overview/summary' },

  // Quality Control
  { lane: 'qc', path: '/qc/dashboard/summary' },
  { lane: 'qc', path: '/qc/dashboard/instruments' },
  { lane: 'qc', path: '/qc/dashboard/bench' },
  { lane: 'qc', path: '/qc/control-lots' },
  { lane: 'qc', path: '/qc/violations' },
  { lane: 'qc', path: '/qc/violations/counts' },
  { lane: 'qc', path: '/qc/ruleConfig/summaries' },
  { lane: 'qc', path: '/qc/ruleConfig/unconfigured' },
  // /ruleConfig/enabled takes REQUIRED testId and instrumentId params — a bare call is a 400,
  // which is the contract working, not a fault. Ids that do not exist are fine here: the
  // question is whether the endpoint binds and answers, not what it finds.
  { lane: 'qc', path: '/qc/ruleConfig/enabled?testId=1&instrumentId=1' },
  { lane: 'qc', path: '/qc/alerts/count/unread' },

  // EQA — scheme side
  { lane: 'eqa', path: '/eqa/programs' },
  // /eqa/panels refuses a bare call on purpose: "Ask for panels by cycleId or by schemeId".
  // Probing it unscoped answers 422, which is the contract holding, not a fault.
  { lane: 'eqa', path: '/eqa/panels?schemeId=1' },
  { lane: 'eqa', path: '/eqa/testable-tests' },
  { lane: 'eqa', path: '/eqa/provider/schemes' },
  { lane: 'eqa', path: '/eqa/provider/followups' },
  // EQA — lab side
  { lane: 'eqa', path: '/eqa/my-programs' },
  { lane: 'eqa', path: '/eqa/cycles/mine' },
  { lane: 'eqa', path: '/eqa/followups' },
  { lane: 'eqa', path: '/eqa/lab-performance' },
  { lane: 'eqa', path: '/eqa/analyst-competency' },
  { lane: 'eqa', path: '/eqa/orders' },
  { lane: 'eqa', path: '/eqa/report-comments' },

  // Quality Indicators
  { lane: 'qi', path: '/qi-config' },
  { lane: 'qi', path: '/qi-config/test-sections' },
  { lane: 'qi', path: '/qi-config/resolve?indicator=TAT' },

  // QMS
  { lane: 'qms', path: '/esig/enabled' },
  { lane: 'qms', path: '/nce/capa-register' },
  { lane: 'qms', path: '/accreditation/summary' },
  { lane: 'qms', path: '/accreditation/bodies' },
  { lane: 'qms', path: '/accreditation/enrollments' },
  { lane: 'qms', path: '/accreditation/eqa-coverage' },
];

test.describe('QA module REST contracts', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('domcontentloaded');
  });

  test('QA-C-00 — the admin session can read the module at all (CANARY)', async ({ page }) => {
    // Unmarked. If this fails, every 403 below is about the session rather than the product.
    const r = await apiCall(page, `${API}/qa/overview/summary`);
    expect(r.ok, `GET /rest/qa/overview/summary answered ${r.status}`).toBeTruthy();
  });

  for (const c of READ_CONTRACTS) {
    test(`QA-C-${c.lane}-${c.path.replace(/[^a-z0-9]+/gi, '-')} — ${c.path} answers (CONTRACT)`, async ({ page }) => {
      const r = await apiCall<unknown>(page, `${API}${c.path}`);
      expect(
        r.ok,
        `GET /rest${c.path} -> ${r.status}. A 404 means the contract moved: check the controller on demo-png before treating this as a product fault.`
      ).toBeTruthy();
      expect(r.body, `${c.path} returned a body`).not.toBeNull();
    });
  }

  // ── Findings, pinned ─────────────────────────────────────────────────────────────────

  // NOT ASSERTED, and recorded rather than dropped.
  //
  // The /qa module introduces an authority model — qa.view.eqa, qa.manage.eqa,
  // qa.eqa.participant, qa.eqa.provider, qa.manage.qi, qa.view.qms, qa.manage.accreditation —
  // and EQA, QI and QMS use it throughout. /rest/qc/* is mid-migration: QCRestController,
  // QCViolationRestController, QCChartDataRestController and QCAlertRestController are still
  // guarded class-wide by hasAnyRole('ANALYSER_IMPORT','ADMIN'), while three exports and
  // /qc/dashboard/bench have moved to hasAuthority('qa.view.qc'). QCExportRestController's own
  // comment calls itself "the first @PreAuthorize on the /rest/qc/* surface".
  //
  // Casey's call, 2026-09-17: not a concern. A migration in progress is not a defect, and a
  // tripwire on it would go red nightly for as long as the migration takes. Left here so the
  // split is documented rather than rediscovered; if it is still split once the module lands
  // on develop, that is the moment to ask, not now.
});
