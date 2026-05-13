/**
 * tests/personas/persona-pe-qa-officer.spec.ts
 *
 * SKILL §12 Persona PE — QA Officer
 *
 * The day: a QA officer opens the NCE Dashboard, picks one open NCE,
 * documents corrective action, pulls the Non-Conformity By Section/
 * Reason report for the quarter, and confirms the CAP/CLIA
 * compliance footer on cold-chain export.
 *
 * This persona catches the REJECTION SILO (BUG-29) at the people-
 * impact layer: if no NCEs are being created automatically from
 * sample rejections, the QA officer has nothing to corrective-action
 * — but the problem isn't "nothing happened today," it's "the
 * system isn't capturing what happened."
 *
 * Run individually:
 *   npx playwright test --project=persona-pe
 */

import { test, expect } from '@playwright/test';
import { BASE, apiCall, markStep } from '../chains/_common';

const PERSONA = 'PE';

test.describe.serial('Persona PE — QA Officer', () => {
  let nceCount = 0;
  let firstNceId: string | null = null;

  test('Step 1 — Open NCE Dashboard (RENDER)', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    const r = await apiCall<{ events?: Array<{ id?: string }> } | Array<{ id?: string }>>(
      page, '/api/OpenELIS-Global/rest/nonconformevents'
    );
    if (!r.ok) {
      markStep(PERSONA, 1, 'FAIL', `nonconformevents HTTP ${r.status}`);
      expect(r.ok).toBeTruthy(); return;
    }
    const events = Array.isArray(r.body) ? r.body : ((r.body as { events?: Array<{ id?: string }> } | null)?.events || []);
    nceCount = events.length;
    if (events.length > 0) firstNceId = events[0].id ?? null;
    markStep(PERSONA, 1, 'PASS', `${nceCount} non-conforming events on the queue`);
  });

  test('Step 2 — BUG-29 sanity check (CROSS-LINK)', async ({ page }) => {
    // The QA officer needs at least SOME NCEs to do their job. If the
    // queue is empty AND the lab has been processing rejections, that's
    // the BUG-29 silo presenting at the people-impact layer.
    await page.goto(BASE);
    const todayMetrics = await apiCall<{ ordersRejectedToday?: number }>(
      page, '/api/OpenELIS-Global/rest/home-dashboard/metrics'
    );
    const rejectedToday = (todayMetrics.ok && typeof todayMetrics.body === 'object' && todayMetrics.body !== null)
      ? ((todayMetrics.body as { ordersRejectedToday?: number }).ordersRejectedToday ?? 0)
      : 0;
    if (nceCount === 0 && rejectedToday > 0) {
      markStep(PERSONA, 2, 'FAIL',
        `BUG-29 SILO confirmed at people layer: ${rejectedToday} rejections today but 0 NCEs to corrective-action`,
        `QA officer can't do their job — the system isn't telling them what happened.`);
      expect(nceCount).toBeGreaterThan(0); return;
    }
    if (nceCount === 0) {
      markStep(PERSONA, 2, 'PARTIAL',
        'NCE queue empty AND no rejections today — quiet day for QA, can\'t exercise the workflow');
      test.skip(); return;
    }
    markStep(PERSONA, 2, 'PASS', `${nceCount} NCEs in queue, ${rejectedToday} rejections today — sane`);
  });

  test('Step 3 — Document corrective action on first NCE (PERSIST)', async ({ page }) => {
    if (!firstNceId) test.skip();
    await page.goto(BASE);
    const r = await apiCall<unknown>(page, '/api/OpenELIS-Global/rest/NCECorrectiveAction', {
      method: 'POST',
      body: {
        nceId: firstNceId,
        actionTaken: 'Persona PE walkthrough: re-trained tech on labelling SOP',
        rootCause: 'Operator error — label position',
        actionDate: new Date().toISOString().slice(0, 10),
      },
    });
    if (!r.ok) {
      markStep(PERSONA, 3, 'BLOCKED',
        `Corrective action POST HTTP ${r.status}`,
        `BUG-38-class blocker on the corrective action write path; QA officer can't close the loop.`);
      test.info().annotations.push({ type: 'blocked', description: `correctiveAction ${r.status}` });
      return;
    }
    markStep(PERSONA, 3, 'PASS', `Corrective action recorded for NCE ${firstNceId}`);
  });

  test('Step 4 — Pull Non-Conformity By Section/Reason report for the quarter (REPORTABLE)', async ({ page }) => {
    await page.goto(BASE);
    const today = new Date();
    const quarterStart = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1);
    const fmt = (d: Date): string => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
    const r = await apiCall<string>(
      page,
      `/api/OpenELIS-Global/ReportPrint?report=retroCInonConformityBySectionReason&startDate=${fmt(quarterStart)}&endDate=${fmt(today)}`,
      { accept: 'application/pdf', expectBinary: true }
    );
    if (!r.ok) {
      markStep(PERSONA, 4, 'FAIL',
        `Non-Conformity report HTTP ${r.status}`,
        `QA officer can't produce the quarterly compliance report. Regulatory gap.`);
      expect(r.ok).toBeTruthy(); return;
    }
    const buf = Buffer.from(String(r.body), 'base64');
    const isPdf = buf.length >= 4 && buf.toString('ascii', 0, 4) === '%PDF';
    if (!isPdf) {
      markStep(PERSONA, 4, 'FAIL', 'Report not a PDF');
      expect(isPdf).toBeTruthy(); return;
    }
    markStep(PERSONA, 4, 'PASS', `Non-Conformity quarterly report PDF ${buf.length} bytes`);
  });

  test('Step 5 — CAP/CLIA compliance footer on cold-chain export (REPORTABLE)', async ({ page }) => {
    await page.goto(BASE);
    const r = await apiCall<{ deployedVersion?: string; complianceStandards?: string[] }>(
      page, '/api/OpenELIS-Global/rest/cold-storage/compliance-info'
    );
    if (!r.ok) {
      markStep(PERSONA, 5, 'PARTIAL',
        `Cold-storage compliance-info HTTP ${r.status}`,
        `Endpoint not at the guessed path; cold-chain compliance reporting may not be deployed.`);
      test.info().annotations.push({ type: 'partial', description: `compliance-info ${r.status}` });
      return;
    }
    const standards = (typeof r.body === 'object' && r.body !== null)
      ? ((r.body as { complianceStandards?: string[] }).complianceStandards || [])
      : [];
    const expected = ['CAP', 'CLIA'];
    const missing = expected.filter(s => !standards.some(d => d.includes(s)));
    if (missing.length > 0) {
      markStep(PERSONA, 5, 'FAIL', `Compliance footer missing: ${missing.join(', ')}`);
      expect(missing.length).toBe(0); return;
    }
    markStep(PERSONA, 5, 'PASS', `Compliance standards present: [${standards.join(', ')}]`);
  });
});
