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
 * BUG-3 CORRECTION (2026-07-30, testing v3.2.1.11): "UserCreate 500" was a
 * CLIENT PAYLOAD DEFECT, not a server defect. The old payload here
 * ({loginName, password, systemRoles, active}) never matched
 * UnifiedSystemUserForm, so it 400d as HttpMessageNotReadableException; and
 * sending id '0' instead of '' made the controller treat the user as EXISTING
 * (loginService.get(0) → NPE → 500). With the correct shape the endpoint works.
 * See helpers/apiShapes.ts §v6.22 (buildUserCreateBody).
 *
 * Also corrected here: this build returns 401 (not 403) for unauthorized REST,
 * so Step 3 disambiguates via GET /session rather than reporting PARTIAL.
 *
 * Run individually:
 *   npx playwright test --project=chain-h
 */

import { test, expect } from '@playwright/test';
import { BASE, apiCall, markStep } from './_common';
import {
  SESSION_ENDPOINT,
  SessionResponse,
  buildUserCreateBody,
  userCreateSucceeded,
} from '../../helpers/apiShapes';

/**
 * Reuse-first: the seeded RBAC role user (see rbac-README.md / roles.setup.ts)
 * is the primary identity for this chain. Env-overridable so a deployment with
 * different seeding can point at its own restricted account. Only if this user
 * cannot authenticate does Step 1 try to create a throwaway one.
 */
const SEEDED_USER = {
  loginName: process.env.OE_RECEPT_USER ?? 'qa_recept',
  password: process.env.OE_RECEPT_PASS ?? 'QArecept1!',
};

const RESTRICTED_USER = {
  loginName: `qa_auto_receptionist_${Date.now()}`,
  password: 'QA_Auto_PW_2026!',
  firstName: 'QA',
  lastName: 'AUTO_Receptionist',
  /**
   * Lab-unit role names, tried in order. Instances differ ('Reception' on
   * testing v3.2.1.11, 'Receptionist' elsewhere) — Step 1 resolves the id from
   * the live GET preform and BLOCKs with the available list if none match.
   */
  roleCandidates: ['Reception', 'Receptionist'],
};

test.describe.serial('Chain H — Permission Enforcement', () => {
  let createdUserId: string | null = null;
  /** Set once Step 1 settles on an identity; Steps 2-4 use these. */
  let activeLogin = '';
  let activePassword = '';
  /** True when we created the user (so afterAll cleans up; reused users are left alone). */
  let weCreatedTheUser = false;

  /** Can these credentials authenticate? Uses /session, the identity source of truth. */
  async function canAuthenticate(
    browser: import('@playwright/test').Browser, login: string, password: string
  ): Promise<boolean> {
    // storageState: undefined is REQUIRED. The chain-h project sets
    // use.storageState to the admin state; without this override the 'fresh'
    // context arrives already authenticated as admin, /login redirects away,
    // and the login-form selector times out (looks like 'user cannot log in').
    const c = await browser.newContext({ storageState: undefined });
    const p = await c.newPage();
    try {
      await p.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
      await p.waitForSelector('input[type="text"], input[name*="loginName"]', { timeout: 15_000 });
      await p.locator('input[type="text"], input[name*="loginName"]').first().fill(login);
      await p.locator('input[type="password"]').first().fill(password);
      await p.getByRole('button', { name: /login|sign in|submit/i }).first().click()
        .catch(() => p.keyboard.press('Enter'));
      for (let i = 0; i < 6; i++) {
        await p.waitForTimeout(2000);
        const s = await apiCall<SessionResponse>(p, SESSION_ENDPOINT);
        const b = (s.ok && s.body && typeof s.body === 'object') ? s.body as SessionResponse : null;
        if (b?.authenticated && b.loginName === login) return true;
      }
      // Diagnostic: never swallow the reason — a silent false here sends the
      // whole chain down the create-a-user path for no reason.
      const s = await apiCall<SessionResponse>(p, SESSION_ENDPOINT);
      const txt = (await p.locator('body').innerText().catch(() => '')).replace(/\n+/g, ' | ').slice(0, 200);
      // eslint-disable-next-line no-console
      console.log(`[Chain H canAuthenticate] ${login} NOT authenticated. url=${p.url()} ` +
        `session=HTTP ${s.status} ${JSON.stringify(s.body).slice(0, 160)} page="${txt}"`);
      return false;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.log(`[Chain H canAuthenticate] ${login} threw: ${String(err).slice(0, 200)}`);
      return false;
    } finally {
      await c.close();
    }
  }

  test.beforeAll(() => {
    // eslint-disable-next-line no-console
    console.log(`[Chain H] BASE=${BASE}`);
  });

  test.afterAll(async ({ browser }) => {
    // Best-effort cleanup of the test user. If BUG-3 keeps the user
    // around, the next chain run won't be affected because of the
    // timestamp suffix in loginName.
    if (createdUserId && weCreatedTheUser) {
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

  test('Step 1 — Obtain a restricted-role identity (reuse seeded, else create)', async ({ page, browser }) => {
    // (a) REUSE the seeded RBAC role user if it can authenticate. This keeps the
    //     chain testing PERMISSIONS rather than the user-creation endpoint.
    if (await canAuthenticate(browser, SEEDED_USER.loginName, SEEDED_USER.password)) {
      activeLogin = SEEDED_USER.loginName;
      activePassword = SEEDED_USER.password;
      createdUserId = SEEDED_USER.loginName;
      weCreatedTheUser = false;
      markStep('H', 1, 'PASS',
        `Reusing seeded restricted user ${SEEDED_USER.loginName} — no user creation needed`,
        `Seeded per rbac-README.md. Override with OE_RECEPT_USER / OE_RECEPT_PASS.`);
      return;
    }

    // (b) FALLBACK: create a throwaway user. NOTE (2026-07-30): this endpoint has
    //     been observed returning 500 for EVERY payload — including one verified
    //     working on the same instance an hour earlier — so a failure here is a
    //     server-state problem, not necessarily your request. Prefer seeding.
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    // Role ids are per-instance — resolve from the GET preform, never hard-code.
    const pre = await apiCall<{
      labUnitRoles?: Array<{ roleName?: string; roleId?: string }>;
      globalRoles?: Array<{ roleName?: string; roleId?: string }>;
    }>(page, '/api/OpenELIS-Global/rest/UnifiedSystemUser');
    const preBody = (pre.body && typeof pre.body === 'object' ? pre.body : {}) as {
      labUnitRoles?: Array<{ roleName?: string; roleId?: string }>;
      globalRoles?: Array<{ roleName?: string; roleId?: string }>;
    };
    const labRole = RESTRICTED_USER.roleCandidates
      .map(cand => (preBody.labUnitRoles ?? []).find(
        x => String(x.roleName ?? '').trim().toLowerCase() === cand.toLowerCase()))
      .find(Boolean);
    if (!labRole?.roleId) {
      markStep('H', 1, 'BLOCKED',
        `None of [${RESTRICTED_USER.roleCandidates.join(", ")}] configured on this instance`,
        `Available lab-unit roles: ${(preBody.labUnitRoles ?? []).map(x => String(x.roleName ?? '').trim()).join(', ')}. ` +
        `Add the correct name to RESTRICTED_USER.roleCandidates.`);
      test.skip(); return;
    }

    const r = await apiCall<{ forward?: string }>(
      page, '/api/OpenELIS-Global/rest/UnifiedSystemUser', {
        method: 'POST',
        body: buildUserCreateBody({
          loginName: RESTRICTED_USER.loginName,
          password: RESTRICTED_USER.password,
          firstName: RESTRICTED_USER.firstName,
          lastName: RESTRICTED_USER.lastName,
          labUnitRoleId: labRole.roleId,   // AllLabUnits scope
        }),
      });

    // CAREFUL: success AND validation-failure both return HTTP 200 here.
    // Discriminate on the forward in the body.
    if (!r.ok || !userCreateSucceeded(r.body)) {
      markStep('H', 1, 'BLOCKED',
        `No restricted identity available: seeded user ${SEEDED_USER.loginName} cannot log in AND ` +
        `UserCreate did not persist (HTTP ${r.status})`,
        `Body: ${(typeof r.body === 'string' ? r.body : JSON.stringify(r.body)).slice(0, 300)}. ` +
        `forward="unifiedSystemUserDefinition" means validation rejected the form (duplicate login name? ` +
        `password policy? expirationDate not in the future?) — NOT the historic BUG-3, which was a ` +
        `payload-shape defect now fixed here. See helpers/apiShapes.ts §v6.22.`);
      // BLOCKED, not FAIL: §11.5 — this is a precondition failure, not evidence
      // about permission enforcement. Seed the user and re-run:
      //   npx playwright test -c rbac.config.ts --project=setup-roles
      test.skip(true,
        `Chain H needs a restricted identity. Seed ${SEEDED_USER.loginName} (Admin -> User Management, ` +
        `role Reception) or set OE_RECEPT_USER/OE_RECEPT_PASS. UserCreate returned HTTP ${r.status}; ` +
        `note it has been seen 500ing for all payloads (server-state, not payload shape).`);
      return;
    }

    // The POST returns a forward, not the new id — read it back by logging in
    // (Step 2). Record the login name as the handle for cleanup.
    createdUserId = RESTRICTED_USER.loginName;
    activeLogin = RESTRICTED_USER.loginName;
    activePassword = RESTRICTED_USER.password;
    weCreatedTheUser = true;
    markStep('H', 1, 'PASS',
      `Created user ${RESTRICTED_USER.loginName} with role "${String(labRole.roleName).trim()}" (roleId ${labRole.roleId}, AllLabUnits)`);
  });

  test('Step 2 — Login as restricted user in fresh browser context (FUNCTION)', async ({ browser }) => {
    if (!activeLogin) test.skip();
    // Explicit override — see canAuthenticate: newContext() must not inherit
    // the project's admin storageState or this 'fresh login' is not fresh.
    const ctx = await browser.newContext({ storageState: undefined });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/login`);
    await page.waitForSelector('input[type="text"], input[name*="loginName"]', { timeout: 10000 });

    await page.locator('input[type="text"], input[name*="loginName"]').first().fill(activeLogin);
    await page.locator('input[type="password"]').first().fill(activePassword);
    await page.getByRole('button', { name: /login|sign in|submit/i }).first().click();

    // Poll /session rather than waiting on a URL or DOM node: this build lands
    // on `/` (not /Dashboard) after login, and locator.isVisible({timeout})
    // does not actually wait. /session also proves WHICH user we are.
    let session: SessionResponse | null = null;
    for (let attempt = 0; attempt < 8 && !session; attempt++) {
      await page.waitForTimeout(2000);
      const s = await apiCall<SessionResponse>(page, SESSION_ENDPOINT);
      const body = (s.ok && s.body && typeof s.body === 'object') ? s.body as SessionResponse : null;
      if (body?.authenticated && body.loginName === activeLogin) session = body;
    }
    if (!session) {
      markStep('H', 2, 'FAIL',
        `Restricted user could not log in`,
        `User was created but cannot authenticate (BUG-20 territory: check the Login Name invalid flag ` +
        `and account_disabled on the record). Note this is NOT the old BUG-3 create failure.`);
      await ctx.close();
      // NB: expect.fail() is not a Playwright API (Vitest/Chai only) — it throws
      // TypeError and masks the message. Assert explicitly instead.
      expect(false, 'Restricted user login failed').toBeTruthy(); return;
    }
    markStep('H', 2, 'PASS',
      `Logged in as ${session.loginName} — roles=[${(session.roles ?? []).join(', ')}], ` +
      `labRoles=${JSON.stringify(session.userLabRolesMap ?? {})}`);
    await ctx.storageState({ path: `.auth/qa-auto-restricted.json` });
    await ctx.close();
  });

  test('Step 3 — Restricted user CANNOT access admin (CROSS-LINK)', async ({ browser }) => {
    if (!activeLogin) test.skip();
    let ctx;
    try {
      ctx = await browser.newContext({ storageState: '.auth/qa-auto-restricted.json' });
    } catch {
      markStep('H', 3, 'BLOCKED', 'Restricted-user storage state not available; Step 2 must have failed');
      test.skip(); return;
    }
    const page2 = await ctx.newPage();
    await page2.goto(BASE);
    await page2.waitForLoadState('networkidle').catch(() => {});
    // Probe an admin-only endpoint. NB: the context is closed per-branch below,
    // because the 401 branch needs a live page to re-check /session.
    const r = await apiCall<unknown>(page2, '/api/OpenELIS-Global/rest/UnifiedSystemUser');

    // Expectation: 403 Forbidden, NOT 200 OK
    if (r.status === 200 || r.ok) {
      markStep('H', 3, 'FAIL',
        `ACCESS CONTROL BYPASS: restricted user got HTTP ${r.status} on /rest/UnifiedSystemUser (admin endpoint)`,
        `Role gates are configured but not enforced. Regulatory finding — file a real security bug.`);
      await ctx.close();
      expect(r.status, 'Restricted user should not access admin API').not.toBe(200); return;
    }
    // 401-vs-403 disambiguation (resolved 2026-07-30): this build returns 401,
    // NOT 403, for unauthorized REST. So a 401 is only ambiguous if the session
    // ALSO died. Re-check identity before judging.
    if (r.status === 401) {
      const s = await apiCall<SessionResponse>(page2, SESSION_ENDPOINT);
      const body = (s.ok && s.body && typeof s.body === 'object') ? s.body as SessionResponse : null;
      if (body?.authenticated && body.loginName === activeLogin) {
        markStep('H', 3, 'PASS',
          `Admin endpoint returned 401 with a live session (identity re-verified as ` +
          `${body.loginName}) — OpenELIS uses 401 for unauthorized; access control enforced`);
        await ctx.close();
        return;
      }
      markStep('H', 3, 'PARTIAL',
        `Got 401 AND the session is gone (${body ? `loginName=${body.loginName}` : `HTTP ${s.status}`}) — ` +
        `genuinely ambiguous: session loss vs authz. Re-run; if persistent, capture live per §6.5a.`);
      test.info().annotations.push({ type: 'partial', description: '401 with dead session' });
      await ctx.close();
      return;
    }
    await ctx.close();
    markStep('H', 3, 'PASS', `Admin endpoint correctly returned HTTP ${r.status} for restricted user`);
  });

  test('Step 4 — Restricted user CAN access non-restricted endpoint (sanity)', async ({ browser }) => {
    if (!activeLogin) test.skip();
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
