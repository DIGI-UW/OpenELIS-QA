/**
 * tests/rbac/role-identity.guard.ts — dependency gate for role-scoped runs.
 *
 * WHY THIS EXISTS AS A SEPARATE PROJECT
 * ------------------------------------
 * The persona specs (tests/personas/*) use the plain `page` fixture, so which
 * user they run as is decided entirely by the project's `use.storageState`.
 * That makes them trivially reusable under a scoped session — and trivially
 * WRONG in a silent way: point a persona at a stale or admin storage state and
 * it will happily "pass" while proving nothing about that role.
 *
 * Playwright config cannot inject a beforeEach into someone else's spec, so the
 * guard is expressed as a project DEPENDENCY instead: each `persona-*-role`
 * project depends on the guard project carrying the same storageState. If the
 * guard fails, Playwright refuses to run the dependent persona at all — the
 * same "skip rather than false-PASS" contract the RBAC matrix uses internally.
 *
 * One test per role; each guard project selects its role with `grep`.
 * See personas-roles.config.ts.
 */

import { test, expect } from '@playwright/test';
import { BASE, apiCall } from '../chains/_common';
import { ROLE_USERS, assertIdentity } from './_rbac';

for (const role of ROLE_USERS) {
  test(`identity guard — ${role.key} (${role.login})`, async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => {});

    const id = await assertIdentity(page, role.login);
    // eslint-disable-next-line no-console
    console.log(`[guard · ${role.key}] ${id.ok ? 'OK' : 'FAILED'} — ${id.method}: ${id.detail}`);

    expect(
      id.ok,
      `Role-scoped run aborted for ${role.key}. Expected the session to belong to ` +
      `"${role.login}" but got: ${id.detail}. ` +
      `Storage state ${role.storageState} is missing or stale — re-run: ` +
      `npx playwright test -c rbac.config.ts --project=setup-roles`
    ).toBeTruthy();

    // Record what this role can actually see, so the persona output below can be
    // read in context (a persona "failing" because its role legitimately lacks a
    // surface is a different finding from the feature being broken).
    const s = await apiCall<{ roles?: string[]; userLabRolesMap?: Record<string, string[]> }>(
      page, '/api/OpenELIS-Global/session');
    const b = (s.ok && s.body && typeof s.body === 'object') ? s.body : {};
    test.info().annotations.push({
      type: 'role-context',
      description: `${role.login}: roles=${JSON.stringify((b as { roles?: string[] }).roles ?? [])} ` +
        `labRoles=${JSON.stringify((b as { userLabRolesMap?: unknown }).userLabRolesMap ?? {})}`,
    });
  });
}
