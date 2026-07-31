/**
 * roles.setup.ts — provision + authenticate the static role-scoped QA users.
 *
 * PRE-SEEDED STATIC USERS ARE THE PRIMARY PATH. Permission coverage must not be
 * hostage to the UserCreate bug (BUG-3/BUG-20) — that's why Chain H alone has
 * never given durable RBAC coverage. Seed the three users once (User Management
 * UI or the API fallback below when it works) and this setup just verifies
 * login, handles the forced-password-change trap, runs the identity guard, and
 * saves one storage state per role (.auth/role-*.json).
 *
 * Fallback order per role:
 *   1. Login with the static creds (env-overridable: OE_RECEPT_USER/PASS,
 *      OE_LABTECH_USER/PASS, OE_VALID_USER/PASS).
 *   2. If login fails → ONE API create attempt as admin (Chain H pattern).
 *      If that 500s (BUG-3), fail with manual seeding instructions.
 *   3. Retry login, save storage state.
 *
 * Runs after auth.setup.ts (admin state is needed for the provisioning fallback).
 */

import { test as setup, expect, Browser } from '@playwright/test';
import * as fs from 'fs';
import { ROLE_USERS, RoleUser, UNIT_SCOPED_USERS, UnitScopedUser, assertIdentity } from './tests/rbac/_rbac';
import { apiCall } from './tests/chains/_common';

const BASE = process.env.BASE_URL || process.env.BASE || 'https://testing.openelis-global.org';

type LoginOutcome = 'ok' | 'badcreds' | 'pwchange-stuck';

async function loginAndSaveState(browser: Browser, user: RoleUser | UnitScopedUser): Promise<LoginOutcome> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' }).catch(() => page.goto(BASE));
    const userSel =
      'input[name="loginName"], #loginName, input[name="username"], input[placeholder*="ser" i], input[type="text"]:not([type="password"])';
    await page.waitForSelector(userSel, { timeout: 20_000 });
    await page.fill(userSel, user.login);
    await page.fill('input[name="password"], #password, input[type="password"]', user.password);
    await Promise.all([
      page.waitForLoadState('networkidle').catch(() => {}),
      page.getByRole('button', { name: /sign in|log ?in|submit/i }).first().click()
        .catch(() => page.keyboard.press('Enter')),
    ]);

    // Forced first-login password change — same trap auth.setup.ts handles for admin.
    if (/ChangePassword/i.test(page.url())) {
      await page.fill('input[name="newPassword"], #newPassword', user.password).catch(() => {});
      await page.fill('input[name="confirmPassword"], #confirmPassword', user.password).catch(() => {});
      await page.getByRole('button', { name: /submit|save|change/i }).first().click().catch(() => {});
      await page.waitForLoadState('networkidle').catch(() => {});
      if (/ChangePassword/i.test(page.url())) return 'pwchange-stuck';
    }

    // Authenticated? Poll the pinned /session endpoint. Do NOT use
    // locator.isVisible({timeout}) here — it returns immediately in modern
    // Playwright and races the SPA render (source of a false 'badcreds' on
    // 2026-07-30). /session also doubles as the setup-time identity guard:
    // never save a storage state that belongs to someone else.
    let id = { ok: false, method: 'none', detail: 'not checked' };
    for (let attempt = 0; attempt < 8 && !id.ok; attempt++) {
      await page.waitForTimeout(2_000);
      if (/ChangePassword/i.test(page.url())) return 'pwchange-stuck';
      id = await assertIdentity(page, user.login);
    }
    if (!id.ok) {
      if (/authenticated=true/.test(id.detail)) {
        // Session exists but belongs to someone else — hard stop, not badcreds.
        throw new Error(`[roles.setup] identity guard failed after login as ${user.login} — ${id.method}: ${id.detail}`);
      }
      return 'badcreds';
    }

    await ctx.storageState({ path: user.storageState });
    return 'ok';
  } finally {
    await ctx.close();
  }
}

/**
 * One-shot API provisioning fallback, using the EXACT UnifiedSystemUserForm
 * shape (pinned 2026-07-30 from OpenELIS-Global-2 source + live probe on
 * testing — see rbac-README.md).
 *
 * Corrections vs the old Chain H payload (which was NEVER deserializable):
 *  - field names are userLoginName/userPassword/userFirstName/... (the old
 *    loginName/password/systemRoles keys → HttpMessageNotReadableException 400)
 *  - loginUserId/systemUserId MUST be '' for new users ('0' routes the
 *    controller to loginService.get(0) → NPE → the historic "UserCreate 500")
 *  - expirationDate is @NotBlank @ValidDate(FUTURE), dd/MM/yyyy
 *  - bench roles are LAB-UNIT roles: selectedTestSectionLabUnits
 *    {sectionId|'AllLabUnits': [roleId]}, resolved from the GET preform
 *  - success is HTTP 200 + {forward: 'redirect:/UnifiedSystemUser'}; failure
 *    is ALSO HTTP 200 (forward: 'unifiedSystemUserDefinition') — read the body
 */
async function createViaAdmin(
  browser: Browser,
  user: RoleUser | UnitScopedUser,
  /** Grant the role on ONE section instead of AllLabUnits (unit-scoped users). */
  sectionId?: string
): Promise<{ ok: boolean; status: number; detail: string }> {
  const ctx = await browser.newContext({ storageState: '.auth/user.json' });
  const page = await ctx.newPage();
  try {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle').catch(() => {});

    // Resolve the role ID from the live preform (role names drift per instance).
    const pre = await apiCall<Record<string, unknown>>(page, '/api/OpenELIS-Global/rest/UnifiedSystemUser');
    const preBody = (pre.body && typeof pre.body === 'object' ? pre.body : {}) as Record<string, unknown>;
    const allRoles = ([] as Array<Record<string, unknown>>).concat(
      (preBody.labUnitRoles as Array<Record<string, unknown>>) ?? [],
      (preBody.globalRoles as Array<Record<string, unknown>>) ?? []
    );
    const candidates = 'roleCandidates' in user ? user.roleCandidates : [user.role];
    const match = candidates
      .map(cand => allRoles.find(r => String(r.roleName ?? '').trim().toLowerCase() === cand.toLowerCase()))
      .find(Boolean);
    if (!match) {
      return {
        ok: false, status: pre.status,
        detail: `none of [${candidates.join(', ')}] found in preform roles: ` +
          allRoles.map(r => String(r.roleName ?? '').trim()).join(', '),
      };
    }
    const roleId = String(match.roleId);
    const isLabUnitRole = ((preBody.labUnitRoles as Array<Record<string, unknown>>) ?? []).includes(match);

    const expiry = new Date();
    expiry.setFullYear(expiry.getFullYear() + 5);
    const dd = String(expiry.getDate()).padStart(2, '0');
    const mm = String(expiry.getMonth() + 1).padStart(2, '0');

    const r = await apiCall<{ forward?: string }>(page, '/api/OpenELIS-Global/rest/UnifiedSystemUser', {
      method: 'POST',
      body: {
        loginUserId: '',
        systemUserId: '',
        userLoginName: user.login,
        userPassword: user.password,
        confirmPassword: user.password,
        userFirstName: 'QA',
        userLastName: user.displayName.replace(/[^A-Za-z ]/g, ''),
        expirationDate: `${dd}/${mm}/${expiry.getFullYear()}`,
        accountLocked: 'N',
        accountDisabled: 'N',
        accountActive: 'Y',
        timeout: '480',
        selectedRoles: isLabUnitRole ? [] : [roleId],
        testSectionId: '',
        selectedLabUnitRoles: [],
        selectedTestSectionLabUnits: isLabUnitRole
          ? { [sectionId ?? 'AllLabUnits']: [roleId] }
          : {},
        systemUserIdToCopy: '',
        allowCopyUserRoles: 'N',
      },
    });
    const forward = (r.body && typeof r.body === 'object' ? (r.body as { forward?: string }).forward : '') ?? '';
    const ok = r.ok && /redirect:\/UnifiedSystemUser/.test(forward);
    return {
      ok, status: r.status,
      detail: ok
        ? `created ${user.login} with role "${String(match.roleName).trim()}" (id ${roleId}, ${isLabUnitRole ? (sectionId ? `section ${sectionId}` : 'AllLabUnits') : 'global'})`
        : `POST ${r.status}, forward="${forward}" — validation/save failure (body: ${(typeof r.body === 'string' ? r.body : JSON.stringify(r.body)).slice(0, 300)})`,
    };
  } finally {
    await ctx.close();
  }
}

for (const user of ROLE_USERS) {
  setup(`role user ready — ${user.key} (${user.login})`, async ({ browser }) => {
    fs.mkdirSync('.auth', { recursive: true });

    let outcome = await loginAndSaveState(browser, user);

    if (outcome === 'badcreds') {
      // eslint-disable-next-line no-console
      console.log(`[roles.setup] ${user.login} cannot log in — attempting one-time API provision as admin (fallback; pre-seeding is the primary path)`);
      const r = await createViaAdmin(browser, user);
      console.log(`[roles.setup] provision ${user.login}: ${r.detail}`);
      if (!r.ok) {
        throw new Error(
          `[roles.setup] ${user.login} is missing and the API create failed (HTTP ${r.status}: ${r.detail}).\n` +
          `Seed once manually: Admin → User Management → Add User → login "${user.login}", ` +
          `role ${user.roleCandidates.map(r2 => `"${r2}"`).join(' or ')} (whichever exists on this instance), ` +
          `password per tests/rbac/_rbac.ts (or override via env). Then re-run:\n` +
          `  npx playwright test -c rbac.config.ts --project=setup-roles`
        );
      }
      outcome = await loginAndSaveState(browser, user);
    }

    if (outcome === 'pwchange-stuck') {
      throw new Error(
        `[roles.setup] ${user.login}: forced-password-change loop — the server rejected reusing the same password. ` +
        `Reset the account password manually and pass it via env (e.g. OE_${user.key === 'receptionist' ? 'RECEPT' : user.key === 'labtech' ? 'LABTECH' : 'VALID'}_PASS).`
      );
    }

    expect(outcome, `${user.login} must be able to log in with a verified identity`).toBe('ok');
  });
}

// ---------------------------------------------------------------------------
// Unit-scoped users (second axis). Same reuse-first contract: verify login,
// provision only as a fallback, never save a state that fails the guard.
// ---------------------------------------------------------------------------
for (const user of UNIT_SCOPED_USERS) {
  setup(`unit-scoped user ready — ${user.key} (${user.login})`, async ({ browser }) => {
    fs.mkdirSync('.auth', { recursive: true });
    let outcome = await loginAndSaveState(browser, user);

    if (outcome === 'badcreds') {
      // eslint-disable-next-line no-console
      console.log(`[roles.setup] ${user.login} cannot log in — provisioning scoped to section ${user.sectionIds[0]}`);
      const r = await createViaAdmin(browser, user, user.sectionIds[0]);
      // eslint-disable-next-line no-console
      console.log(`[roles.setup] provision ${user.login}: ${r.detail}`);
      if (!r.ok) {
        throw new Error(
          `[roles.setup] ${user.login} is missing and the API create failed (HTTP ${r.status}: ${r.detail}).\n` +
          `Seed once manually: Admin -> User Management -> Add User -> login "${user.login}", ` +
          `role "${user.role}" granted ONLY on ${user.sectionNames.join(', ')} (not All Lab Units). ` +
          `Then re-run:\n  npx playwright test -c rbac.config.ts --project=setup-roles\n` +
          `NOTE: a 500 here is a known transient server-side condition, not a payload problem ` +
          `(helpers/apiShapes.ts §v6.22) — retry before hand-seeding.`);
      }
      outcome = await loginAndSaveState(browser, user);
    }

    expect(outcome, `${user.login} must be able to log in with a verified identity`).toBe('ok');
  });
}
