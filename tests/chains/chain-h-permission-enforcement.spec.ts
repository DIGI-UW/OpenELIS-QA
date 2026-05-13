/**
 * tests/chains/chain-h-permission-enforcement.spec.ts
 *
 * SKILL §11 Chain H — Permission Enforcement
 *
 * What this chain proves: access control configured in admin is
 * actually enforced. A user with a restricted role attempts a
 * privileged action and the system denies it.
 *
 * Why this matters: the existing admin tests (Phase 23C, Phase 47)
 * confirm the User Management UI can create users with specific roles.
 * What's never been verified is whether the role gates actually do
 * anything. A regulator looking for evidence of access control needs
 * a behavioural test, not a configuration screenshot.
 *
 * Hard prerequisite: BUG-3 (UserCreate 500) — if creating users via
 * /rest/UnifiedSystemUser still 500s on the target instance, this
 * chain BAILs in Step 1. The fix path is documented inline.
 *
 * Run individually:
 *   npx playwright test --project=chain-h
 */

import { test, expect } from '@playwright/test';
import { BASE, apiCall, markStep } from './_common';

const RESTRICTED_USER = {
  loginName: `qa_auto_receptionist_${Date.now()}`,
  password: 'QA_Auto_PW_2026!',
  firstName: 'QA',
  lastName: 'AUTO_Receptionist',
  role: 'Receptionist', // role name; reality may differ — Step 2 verifies
};

test.describe.serial('Chain H — Permission Enforcement', () => {
  let createdUserId: string | null = null;

  test.beforeAll(() => {
    // eslint-disable-next-line no-console
    console.log(`[Chain H] BASE=${BASE}`);
  });

  test.afterAll(async ({ browser }) => {
    // Best-effort cleanup of the test user. If BUG-3 keeps the user
    // around, the next chain run won't be affected because of the
    // timestamp suffix in loginName.
    if (createdUserId) {
      // eslint-disable-next-line no-console
      console.log(`[Chain H afterAll] Deactivating test user ${RESTRICTED_USER.loginName}`);
      const ctx = await browser.newContext({ storageState: '.auth/user.json' });
      const page = await ctx.newPage();
      await page.goto(BASE);
      await apiCall(page, `/api/OpenELIS-Global/rest/UnifiedSystemUser/${createdUserId}/deactivate`, {
        method: 'POST', body: {},
      });
      await ctx.close();
    }
  });

  test('Step 1 — Create restricted-role user via API (PERSIST, BUG-3 dependent)', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    const r = await apiCall<{ id?: string; systemUserId?: string }>(
      page, '/api/OpenELIS-Global/rest/UnifiedSystemUser', {
        method: 'POST',
        body: {
          loginName: RESTRICTED_USER.loginName,
          password: RESTRICTED_USER.password,
          confirmPassword: RESTRICTED_USER.password,
          firstName: RESTRICTED_USER.firstName,
          lastName: RESTRICTED_USER.lastName,
          systemRoles: [RESTRICTED_USER.role],
          active: 'true',
        },
      });
    if (!r.ok) {
      markStep('H', 1, 'FAIL',
        `UserCreate HTTP ${r.status} — likely BUG-3 still open or CSRF-masked`,
        `If POST returns 500: BUG-3 is still in the un-retested set per the 2026-05-12 calibration delta. ` +
        `Retest with CSRF token + valid payload before declaring this chain BLOCKED on the user-creation step.`);
      expect(r.ok, 'BUG-3: cannot create test user').toBeTruthy(); return;
    }
    createdUserId = (typeof r.body === 'object' && r.body !== null)
      ? ((r.body as { id?: string; systemUserId?: string }).id ?? (r.body as { systemUserId?: string }).systemUserId ?? null)
      : null;
    markStep('H', 1, 'PASS', `Created user ${RESTRICTED_USER.loginName} (id=${createdUserId})`);
  });

  test('Step 2 — Login as restricted user in fresh browser context (FUNCTION)', async ({ browser }) => {
    if (!createdUserId) test.skip();
    const ctx = await browser.newContext(); // no storage state — fresh login
    const page = await ctx.newPage();
    await page.goto(`${BASE}/login`);
    await page.waitForSelector('input[type="text"], input[name*="loginName"]', { timeout: 10000 });

    await page.locator('input[type="text"], input[name*="loginName"]').first().fill(RESTRICTED_USER.loginName);
    await page.locator('input[type="password"]').first().fill(RESTRICTED_USER.password);
    await page.getByRole('button', { name: /login|sign in|submit/i }).first().click();

    try {
      await page.waitForURL(/Dashboard|Home/, { timeout: 15000 });
    } catch {
      markStep('H', 2, 'FAIL',
        `Restricted user could not log in`,
        `Likely BUG-3 / BUG-20: user was created but is in an unusable state. Check Login Name invalid flag on the user record.`);
      await ctx.close();
      expect.fail('Restricted user login failed'); return;
    }
    markStep('H', 2, 'PASS', `Logged in as ${RESTRICTED_USER.loginName}`);
    await ctx.storageState({ path: `.auth/qa-auto-restricted.json` });
    await ctx.close();
  });

  test('Step 3 — Restricted user CANNOT access admin (CROSS-LINK)', async ({ browser }) => {
    if (!createdUserId) test.skip();
    let ctx;
    try {
      ctx = await browser.newContext({ storageState: '.auth/qa-auto-restricted.json' });
    } catch {
      markStep('H', 3, 'BLOCKED', 'Restricted-user storage state not available; Step 2 must have failed');
      test.skip(); return;
    }
    const page = await ctx.newPage();
    // Probe an admin-only endpoint
    const r = await apiCall<unknown>(page, '/api/OpenELIS-Global/rest/UnifiedSystemUser');
    await ctx.close();

    // Expectation: 403 Forbidden, NOT 200 OK
    if (r.status === 200 || r.ok) {
      markStep('H', 3, 'FAIL',
        `ACCESS CONTROL BYPASS: restricted user got HTTP ${r.status} on /rest/UnifiedSystemUser (admin endpoint)`,
        `Role gates are configured but not enforced. Regulatory finding — file a real security bug.`);
      expect(r.status, 'Restricted user should not access admin API').not.toBe(200); return;
    }
    if (r.status === 401) {
      markStep('H', 3, 'PARTIAL',
        `Got 401 (session expired?) rather than 403 (access denied). Ambiguous; verify role enforcement separately.`);
      test.info().annotations.push({ type: 'partial', description: '401 vs 403' });
      return;
    }
    markStep('H', 3, 'PASS', `Admin endpoint correctly returned HTTP ${r.status} for restricted user`);
  });

  test('Step 4 — Restricted user CAN access non-restricted endpoint (sanity)', async ({ browser }) => {
    if (!createdUserId) test.skip();
    let ctx;
    try {
      ctx = await browser.newContext({ storageState: '.auth/qa-auto-restricted.json' });
    } catch { test.skip(); return; }
    const page = await ctx.newPage();
    // Patient search is open to most roles including Receptionist
    const r = await apiCall<unknown>(
      page, '/api/OpenELIS-Global/rest/patient-search-results?lastName=A'
    );
    await ctx.close();
    if (!r.ok) {
      markStep('H', 4, 'FAIL',
        `Restricted user blocked from patient-search-results (HTTP ${r.status})`,
        `Either the role is more restrictive than intended, or all endpoints are gated equally — confirm via SiteInformation roles list.`);
      expect(r.ok).toBeTruthy(); return;
    }
    markStep('H', 4, 'PASS', `Patient search accessible to restricted user — gating is per-endpoint, not blanket`);
  });
});
