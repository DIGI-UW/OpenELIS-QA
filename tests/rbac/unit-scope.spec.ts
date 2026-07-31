/**
 * tests/rbac/unit-scope.spec.ts — the SECOND axis of permission: role × lab unit.
 *
 * The matrix in rbac-matrix.spec.ts answers "may this ROLE touch this surface?".
 * It cannot answer the question a multi-section lab actually cares about: a
 * Hematology tech holds the same *role* as a Serology tech, so role-only testing
 * would call them identical. If section scoping leaks, one bench sees another
 * bench's patients — a confidentiality problem that no role-axis test can see.
 *
 * MECHANISM (captured live on testing v3.2.1.11, 2026-07-31 — do not assume 403):
 * out-of-scope sections are enforced by SILENT FILTERING. The request returns
 * HTTP 200 with an empty `resultList`, not a 403. So the assertions here are
 * DIFFERENTIAL: "the scoped user sees 0 rows" is worthless on its own (the
 * section may be empty for everyone), so every out-of-scope check is compared
 * against what admin sees for the same section, and SKIPS when admin sees
 * nothing either. That is the difference between proving enforcement and
 * observing an empty database.
 *
 * Also captured: `userLabRolesMap` is keyed by section NAME for a scoped user
 * ({"Hematology":["Validation"]}) but by the literal "AllLabUnits" for an
 * unscoped one — so the map itself is an assertion target.
 *
 * Run:
 *   npx playwright test -c rbac.config.ts --project=unit-scope
 */

import { test, expect, Browser } from '@playwright/test';
import * as fs from 'fs';
import { BASE, apiCall } from '../chains/_common';
import { UNIT_SCOPED_USERS, UnitScopedUser, assertIdentity, SessionPayload } from './_rbac';

const API = '/api/OpenELIS-Global/rest';

/** The validation queue for one section. Returns accession numbers. */
async function queueAccessions(
  page: import('@playwright/test').Page, sectionId: string
): Promise<{ status: number; accessions: string[] }> {
  const r = await apiCall<{ resultList?: Array<{ accessionNumber?: string }> }>(
    page, `${API}/AccessionValidation?accessionNumber=&unitType=${sectionId}&date=&doRange=true`);
  const rows = (r.ok && r.body && typeof r.body === 'object')
    ? ((r.body as { resultList?: Array<{ accessionNumber?: string }> }).resultList ?? []) : [];
  return { status: r.status, accessions: rows.map(x => x.accessionNumber ?? '').filter(Boolean) };
}

/** Admin's view of a section — the denominator for every differential check. */
async function adminQueue(browser: Browser, sectionId: string): Promise<string[]> {
  const ctx = await browser.newContext({ storageState: '.auth/user.json' });
  const page = await ctx.newPage();
  try {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle').catch(() => {});
    return (await queueAccessions(page, sectionId)).accessions;
  } finally {
    await ctx.close();
  }
}

for (const user of UNIT_SCOPED_USERS) {
  test.describe(`Unit scope — ${user.displayName} (${user.login})`, () => {
    let identityOk = false;
    let session: SessionPayload | null = null;

    test.beforeAll(async ({ browser }) => {
      if (!fs.existsSync(user.storageState)) return;
      const ctx = await browser.newContext({ storageState: user.storageState });
      const page = await ctx.newPage();
      await page.goto(BASE, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => {});
      const id = await assertIdentity(page, user.login);
      identityOk = id.ok;
      const s = await apiCall<SessionPayload>(page, '/api/OpenELIS-Global/session');
      session = (s.ok && s.body && typeof s.body === 'object') ? s.body as SessionPayload : null;
      // eslint-disable-next-line no-console
      console.log(`[unit-scope · ${user.key}] identity ${id.ok ? 'OK' : 'FAILED'} — ${id.detail}`);
      await ctx.close();
    });

    const guard = () => test.skip(!identityOk,
      `Identity guard failed for ${user.login}. Re-run: npx playwright test -c rbac.config.ts --project=setup-roles`);

    test('U-01 — session lab-role map is scoped, not AllLabUnits (FUNCTION)', async () => {
      guard();
      const map = session?.userLabRolesMap ?? {};
      const keys = Object.keys(map);
      expect(
        keys.includes('AllLabUnits'),
        `${user.login} is scoped to ${user.sectionNames.join(', ')} but its session says AllLabUnits ` +
        `(${JSON.stringify(map)}) — the section scope was not applied at all.`
      ).toBeFalsy();
      expect(
        keys.sort(),
        `Session lab-role map should name exactly the scoped section(s). Got ${JSON.stringify(map)}`
      ).toEqual([...user.sectionNames].sort());
    });

    test('U-02 — the role\'s section list contains ONLY in-scope sections (FUNCTION)', async ({ browser }) => {
      guard();
      const ctx = await browser.newContext({ storageState: user.storageState });
      const page = await ctx.newPage();
      await page.goto(BASE); await page.waitForLoadState('networkidle').catch(() => {});
      const r = await apiCall<Array<{ id?: string; value?: string }>>(page, `${API}/user-test-sections/${user.role}`);
      await ctx.close();

      const got = (Array.isArray(r.body) ? r.body as Array<{ id?: string; value?: string }> : [])
        .map(x => String(x.id));
      // eslint-disable-next-line no-console
      console.log(`[unit-scope · ${user.key}] user-test-sections/${user.role} -> ${JSON.stringify(got)}`);
      const leaked = got.filter(id => !user.sectionIds.includes(id));
      expect(
        leaked,
        `SCOPE LEAK: ${user.login} is scoped to sections ${user.sectionIds.join(',')} but the ` +
        `${user.role} section picker also offers ${leaked.join(',')}. A scoped tech must not be able ` +
        `to select another bench's section.`
      ).toEqual([]);
      expect(got.sort(), 'Scoped sections should be exactly the granted ones').toEqual([...user.sectionIds].sort());
    });

    test('U-03 — a role the user does NOT hold yields no sections (FUNCTION)', async ({ browser }) => {
      guard();
      const other = user.roleNotHeld;
      const ctx = await browser.newContext({ storageState: user.storageState });
      const page = await ctx.newPage();
      await page.goto(BASE); await page.waitForLoadState('networkidle').catch(() => {});
      const r = await apiCall<Array<unknown>>(page, `${API}/user-test-sections/${other}`);
      await ctx.close();
      const n = Array.isArray(r.body) ? (r.body as unknown[]).length : -1;
      // eslint-disable-next-line no-console
      console.log(`[unit-scope · ${user.key}] user-test-sections/${other} (not held) -> n=${n}`);
      expect(
        n,
        `${user.login} holds only "${user.role}" yet the "${other}" section list returned ${n} entries — ` +
        `role scoping is not applied to the section lookup.`
      ).toBe(0);
    });

    test('U-04 — in-scope queue matches admin (no OVER-restriction) (CROSS-LINK)', async ({ browser }) => {
      guard();
      const sectionId = user.sectionIds[0];
      const adminSees = await adminQueue(browser, sectionId);
      const ctx = await browser.newContext({ storageState: user.storageState });
      const page = await ctx.newPage();
      await page.goto(BASE); await page.waitForLoadState('networkidle').catch(() => {});
      const mine = await queueAccessions(page, sectionId);
      await ctx.close();
      // eslint-disable-next-line no-console
      console.log(`[unit-scope · ${user.key}] in-scope ${sectionId}: user=${mine.accessions.length} admin=${adminSees.length}`);

      test.skip(adminSees.length === 0,
        `Admin sees no ${user.sectionNames[0]} work either — nothing to compare. Seed the section first.`);
      const missing = adminSees.filter(a => !mine.accessions.includes(a));
      expect(
        missing,
        `OVER-RESTRICTION: ${user.login} is granted ${user.sectionNames[0]} but cannot see ` +
        `${missing.join(', ')} which admin sees in that same section. A tech who cannot see their own ` +
        `bench's work is a lab-down incident, not a security win.`
      ).toEqual([]);
    });

    test('U-05 — out-of-scope sections are filtered out (differential) (CROSS-LINK)', async ({ browser }) => {
      guard();
      const leaks: string[] = [];
      let compared = 0;
      for (const [name, id] of Object.entries(user.outOfScopeSections)) {
        const adminSees = await adminQueue(browser, id);
        if (adminSees.length === 0) {
          // Vacuous: the scoped user seeing 0 here proves nothing.
          // eslint-disable-next-line no-console
          console.log(`[unit-scope · ${user.key}] ${name} (${id}) skipped — admin sees 0 rows, not a valid control`);
          continue;
        }
        compared++;
        const ctx = await browser.newContext({ storageState: user.storageState });
        const page = await ctx.newPage();
        await page.goto(BASE); await page.waitForLoadState('networkidle').catch(() => {});
        const mine = await queueAccessions(page, id);
        await ctx.close();
        // eslint-disable-next-line no-console
        console.log(`[unit-scope · ${user.key}] out-of-scope ${name} (${id}): user=${mine.accessions.length} admin=${adminSees.length} (HTTP ${mine.status})`);
        if (mine.accessions.length > 0) leaks.push(`${name}: ${mine.accessions.join(', ')}`);
      }

      test.skip(compared === 0,
        'No out-of-scope section has data on this instance, so filtering cannot be demonstrated. ' +
        'Seed work into a second section to make this assertion meaningful.');
      expect(
        leaks,
        `CONFIDENTIALITY LEAK: ${user.login} is scoped to ${user.sectionNames.join(', ')} but can read ` +
        `other benches' validation queues — ${leaks.join(' | ')}. Enforcement on this build is silent ` +
        `filtering (HTTP 200 + empty list), so a non-empty list here means the filter did not apply.`
      ).toEqual([]);
    });

    test('U-06 — the section picker itself is scoped (RENDER)', async ({ browser }) => {
      guard();
      const ctx = await browser.newContext({ storageState: user.storageState });
      const page = await ctx.newPage();
      await page.goto(BASE); await page.waitForLoadState('networkidle').catch(() => {});
      const r = await apiCall<{ testSections?: Array<{ id?: string; value?: string }> }>(
        page, `${API}/AccessionValidation?accessionNumber=&unitType=&date=&doRange=true`);
      await ctx.close();
      const secs = (r.ok && r.body && typeof r.body === 'object')
        ? ((r.body as { testSections?: Array<{ id?: string; value?: string }> }).testSections ?? []) : [];
      const ids = secs.map(x => String(x.id));
      // eslint-disable-next-line no-console
      console.log(`[unit-scope · ${user.key}] Validation section picker -> ${JSON.stringify(secs.map(x => x.value))}`);
      const extra = ids.filter(id => !user.sectionIds.includes(id));
      expect(
        extra,
        `The Validation screen's section dropdown offers out-of-scope sections (${extra.join(',')}) to ` +
        `${user.login}. Selecting one returns an empty list (the server filters), so this is a UI-gating ` +
        `defect rather than a data leak — but it invites the user into a dead end.`
      ).toEqual([]);
    });
  });
}
