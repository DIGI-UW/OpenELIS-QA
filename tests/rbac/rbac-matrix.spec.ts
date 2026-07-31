/**
 * tests/rbac/rbac-matrix.spec.ts — Role × probe permission matrix (scoped, non-admin runs).
 *
 * Run:
 *   BASE_URL=https://testing.openelis-global.org npx playwright test -c rbac.config.ts
 *   npx playwright test -c rbac.config.ts --project=rbac-matrix     (roles already set up)
 *
 * What one role block does:
 *   1. Opens a context from that role's storage state (.auth/role-*.json).
 *   2. IDENTITY GUARD — asserts the session actually belongs to the role user.
 *      If it fails, every probe for that role SKIPS: grading probes on the
 *      wrong session (usually stale admin cookies) false-PASSes deny-tests.
 *   3. Executes each probe in the matrix (tests/rbac/_rbac.ts) and grades:
 *        invariant/expected → hard assert allow/deny
 *        baseline           → record; assert only against committed rbac-baseline.json
 *   4. Writes the observed matrix to rbac-results/ for baseline review and
 *      for the freshness board's future rbac lane.
 *
 * Grading language (SKILL §7.6): REST allow-probes are FUNCTION-tier evidence
 * (endpoint answered 2xx under the role session); deny-probes are CROSS-LINK
 * (admin config → enforcement on another surface). Menu probes are RENDER-tier
 * only — never report menu visibility as proof of enforcement.
 */

import { test, expect, BrowserContext, Page } from '@playwright/test';
import * as fs from 'fs';
import { BASE, apiCall } from '../chains/_common';
import {
  ROLE_USERS,
  PROBES,
  ProbeResult,
  Verdict,
  assertIdentity,
  classifyRest,
  classifyRoute,
  classifyMenu,
  writeResults,
  loadBaseline,
} from './_rbac';

const baseline = loadBaseline();

for (const role of ROLE_USERS) {
  // NOT .serial — probes are independent; one failed probe must not skip the
  // rest of the matrix (workers=1 keeps execution sequential anyway).
  test.describe(`RBAC matrix — ${role.displayName} (${role.login})`, () => {
    let ctx: BrowserContext | undefined;
    let page: Page;
    let identityOk = false;
    let identityDetail = 'not checked';
    const results: ProbeResult[] = [];

    test.beforeAll(async ({ browser }) => {
      if (!fs.existsSync(role.storageState)) {
        identityDetail = `${role.storageState} missing — setup-roles did not complete for this role`;
        return;
      }
      ctx = await browser.newContext({ storageState: role.storageState });
      page = await ctx.newPage();
      await page.goto(BASE, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => {});
      const id = await assertIdentity(page, role.login);
      identityOk = id.ok;
      identityDetail = `${id.method}: ${id.detail}`;
      // eslint-disable-next-line no-console
      console.log(`[RBAC · ${role.key} · identity ${id.ok ? 'OK' : 'FAILED'}] ${identityDetail}`);
    });

    test.afterAll(async () => {
      if (results.length) {
        // eslint-disable-next-line no-console
        console.log(`[RBAC · ${role.key}] ${results.length} probes → ${writeResults(results, role.key)}`);
      }
      await ctx?.close();
    });

    for (const probe of PROBES) {
      const expectation = probe.expect[role.key];
      if (!expectation) continue;

      test(`${probe.id} [${probe.tier}] ${probe.kind}:${probe.target} → expect ${expectation}`, async () => {
        test.skip(
          !identityOk,
          `Identity guard failed (${identityDetail}) — probes on the wrong session would ` +
          `false-PASS deny-tests. Re-run setup-roles (delete ${role.storageState} first).`
        );

        // Annotated: without these, assigning the literal 'deny' in the 401
        // disambiguation below widens `verdict` to string and it no longer
        // satisfies ProbeResult.verdict.
        let verdict: Verdict;
        let detail: string;
        if (probe.kind === 'rest') {
          const r = await apiCall(page, probe.target);
          ({ verdict, detail } = classifyRest(r.status, r.body));
        } else if (probe.kind === 'route' || probe.kind === 'jsp') {
          ({ verdict, detail } = await classifyRoute(ctx!, BASE, probe.target));
        } else {
          ({ verdict, detail } = await classifyMenu(page, BASE, probe.target));
        }

        // 401 disambiguation (the Chain H "401 vs 403" problem, resolved live):
        // re-verify the session. If it is still authenticated as this role,
        // the 401 is an authorization denial — OpenELIS returns 401, not 403,
        // for unauthorized access — and grades as deny. If the session is also
        // gone, it stays ambiguous.
        if (probe.kind === 'rest' && verdict === 'ambiguous' && /401/.test(detail)) {
          const recheck = await assertIdentity(page, role.login);
          if (recheck.ok) {
            verdict = 'deny';
            detail = 'HTTP 401 with live session (identity re-verified) — OpenELIS uses 401 for unauthorized; graded as deny';
          } else {
            detail += `; session ALSO lost (${recheck.detail}) — genuinely ambiguous`;
          }
        }

        results.push({
          role: role.key, probeId: probe.id, kind: probe.kind, target: probe.target,
          tier: probe.tier, expected: expectation, verdict, detail, at: new Date().toISOString(),
        });
        // eslint-disable-next-line no-console
        console.log(`[RBAC · ${role.key} · ${probe.id} · ${verdict.toUpperCase()}] expected=${expectation} — ${detail}`);

        // Baseline tier: record; only assert against a committed, reviewed baseline.
        if (expectation === 'baseline') {
          const key = `${role.key}:${probe.id}`;
          if (baseline && baseline[key]) {
            expect(
              verdict,
              `BASELINE DRIFT on ${key}: committed baseline says "${baseline[key]}", observed "${verdict}" (${detail}). ` +
              `If the change is intentional (e.g. role-builder rollout), update rbac-baseline.json in the same commit.`
            ).toBe(baseline[key]);
          } else {
            test.info().annotations.push({ type: 'baseline-recorded', description: `${key}=${verdict} (${detail})` });
          }
          return;
        }

        // Ambiguous results are never silently graded (401 vs 403, SPA blank page, 404-vs-gating).
        if (verdict === 'ambiguous' || verdict === 'error') {
          test.info().annotations.push({ type: verdict, description: detail });
          expect.soft(
            verdict,
            `Not gradeable (${detail}). Resolve per §6.5/§6.5a (live capture) before treating as ${expectation}-FAIL.`
          ).toBe(expectation);
          return;
        }

        expect(verdict, `${probe.description} — observed: ${detail}`).toBe(expectation);
      });
    }
  });
}
