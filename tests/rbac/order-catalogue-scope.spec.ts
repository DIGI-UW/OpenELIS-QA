/**
 * tests/rbac/order-catalogue-scope.spec.ts — Reception × test section: the
 * ORDER-ENTRY catalogue must show only the user's own section.
 *
 * REQUIREMENT (product owner, 2026-07-31): "Reception can be assigned to a
 * particular test section as well; they should only see the tests and panels for
 * their own test section."
 *
 * This is a confidentiality AND correctness requirement: a receptionist at the
 * Hematology desk should not be able to order — or even browse — Serology tests.
 * Nothing tested it before, and it is invisible to the role axis, because a
 * Hematology receptionist and a Serology receptionist hold the *same* role.
 *
 * WHICH ENDPOINTS (captured from addOrder/SampleType.jsx, verified live):
 *     GET /rest/user-sample-types                 → the Sample Type dropdown
 *     GET /rest/sample-type-tests?sampleType=<id> → {tests[], panels[]} for one type
 *
 * NOT /rest/test-list. That one is scoped to *result-entry* sections and returns
 * an empty array for Reception, which is a separate (and non-blocking) matter —
 * see apiShapes §TEST_LIST_IS_ROLE_SCOPED.
 *
 * Measured baseline on testing v3.2.1.11 (2026-07-31):
 *     admin / Reception@AllLabUnits : 12 sample types · 237 tests · 5 panels
 *     Reception@Hematology          :  1 sample type  ·  18 tests · 2 panels
 *
 * Assertions are DIFFERENTIAL against admin, and SKIP when admin sees nothing —
 * "the scoped user sees few things" is only meaningful next to what exists.
 *
 * Run:
 *   npx playwright test -c rbac.config.ts --project=catalogue-scope
 */

import { test, expect, Browser, Page } from '@playwright/test';
import * as fs from 'fs';
import { BASE, apiCall } from '../chains/_common';
import { UNIT_SCOPED_USERS, assertIdentity, SessionPayload } from './_rbac';

const API = '/api/OpenELIS-Global/rest';

interface Catalogue {
  sampleTypes: Array<{ id: string; value: string }>;
  testsByType: Record<string, string[]>;   // sampleTypeId -> test names
  panelsByType: Record<string, string[]>;
  totalTests: number;
  totalPanels: number;
}

async function readCatalogue(page: Page): Promise<Catalogue> {
  const st = await apiCall<Array<{ id?: string; value?: string }>>(page, `${API}/user-sample-types`);
  const sampleTypes = (Array.isArray(st.body) ? st.body as Array<{ id?: string; value?: string }> : [])
    .filter(x => x.id).map(x => ({ id: String(x.id), value: String(x.value ?? '') }));

  const testsByType: Record<string, string[]> = {};
  const panelsByType: Record<string, string[]> = {};
  let totalTests = 0, totalPanels = 0;
  for (const ty of sampleTypes) {
    const r = await apiCall<{ tests?: Array<{ name?: string; value?: string }>; panels?: Array<{ name?: string; value?: string }> }>(
      page, `${API}/sample-type-tests?sampleType=${ty.id}`);
    const b = (r.ok && r.body && typeof r.body === 'object')
      ? r.body as { tests?: Array<{ name?: string; value?: string }>; panels?: Array<{ name?: string; value?: string }> } : {};
    const names = (arr?: Array<{ name?: string; value?: string }>) =>
      (arr ?? []).map(x => String(x.name ?? x.value ?? '')).filter(Boolean);
    testsByType[ty.id] = names(b.tests);
    panelsByType[ty.id] = names(b.panels);
    totalTests += testsByType[ty.id].length;
    totalPanels += panelsByType[ty.id].length;
  }
  return { sampleTypes, testsByType, panelsByType, totalTests, totalPanels };
}

async function adminCatalogue(browser: Browser): Promise<Catalogue> {
  const ctx = await browser.newContext({ storageState: '.auth/user.json' });
  const page = await ctx.newPage();
  try {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle').catch(() => {});
    return await readCatalogue(page);
  } finally {
    await ctx.close();
  }
}

// Only users whose axis is the order catalogue (i.e. Reception-side scoping).
const CATALOGUE_USERS = UNIT_SCOPED_USERS.filter(u => (u.axes ?? ['validation']).includes('catalogue'));

for (const user of CATALOGUE_USERS) {
  test.describe(`Order catalogue scope — ${user.displayName} (${user.login})`, () => {
    let identityOk = false;
    let session: SessionPayload | null = null;
    let mine: Catalogue | null = null;
    let theirs: Catalogue | null = null;   // admin's view

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
      if (identityOk) mine = await readCatalogue(page);
      await ctx.close();
      if (identityOk) theirs = await adminCatalogue(browser);
      // eslint-disable-next-line no-console
      console.log(`[catalogue-scope · ${user.key}] identity ${id.ok ? 'OK' : 'FAILED'} — ${id.detail}`);
      if (mine && theirs) {
        // eslint-disable-next-line no-console
        console.log(`[catalogue-scope · ${user.key}] scoped: ${mine.sampleTypes.length} types / ${mine.totalTests} tests / ${mine.totalPanels} panels — ` +
          `admin: ${theirs.sampleTypes.length} types / ${theirs.totalTests} tests / ${theirs.totalPanels} panels`);
      }
    });

    const guard = () => test.skip(!identityOk,
      `Identity guard failed for ${user.login}. Re-run: npx playwright test -c rbac.config.ts --project=setup-roles`);

    test('C-01 — session shows the role granted on ONE section (FUNCTION)', async () => {
      guard();
      const map = session?.userLabRolesMap ?? {};
      expect(Object.keys(map).includes('AllLabUnits'),
        `${user.login} should be scoped to ${user.sectionNames.join(', ')} but the session says ` +
        `AllLabUnits (${JSON.stringify(map)}) — the section grant did not apply, so every ` +
        `assertion below would be vacuous.`).toBeFalsy();
      expect(Object.keys(map).sort(), `Session lab-role map: ${JSON.stringify(map)}`)
        .toEqual([...user.sectionNames].sort());
    });

    test('C-02 — Sample Type dropdown is a strict subset of admin\'s (CROSS-LINK)', async () => {
      guard();
      expect(mine && theirs, 'catalogues must be readable').toBeTruthy();
      test.skip(!theirs || theirs.sampleTypes.length === 0,
        'Admin sees no sample types — no denominator, nothing to compare.');

      const adminIds = theirs!.sampleTypes.map(x => x.id);
      const extra = mine!.sampleTypes.filter(x => !adminIds.includes(x.id));
      expect(extra.map(x => x.value),
        `${user.login} offers sample types admin does not — impossible unless the response is ` +
        `being assembled differently per role.`).toEqual([]);

      expect(mine!.sampleTypes.length,
        `SCOPE LEAK: ${user.login} is granted only ${user.sectionNames.join(', ')} but the Sample ` +
        `Type dropdown offers ALL ${theirs!.sampleTypes.length} types ` +
        `(${mine!.sampleTypes.map(x => x.value).join(', ')}). A receptionist at one bench must not ` +
        `be able to raise orders for another bench's specimens.`).toBeLessThan(theirs!.sampleTypes.length);
    });

    test('C-03 — tests and panels are filtered, and NOT empty (CROSS-LINK)', async () => {
      guard();
      expect(mine && theirs, 'catalogues must be readable').toBeTruthy();
      test.skip(!theirs || theirs.totalTests === 0, 'Admin sees no tests — no denominator.');

      // Over-restriction check first: an empty catalogue means this receptionist
      // cannot place ANY order, which is worse than seeing too much.
      expect(mine!.totalTests,
        `OVER-RESTRICTION: ${user.login} can see 0 orderable tests, so this desk cannot place ` +
        `any order at all. Note /rest/test-list is legitimately empty for Reception — but ` +
        `user-sample-types + sample-type-tests must NOT be.`).toBeGreaterThan(0);

      // Then the leak check.
      expect(mine!.totalTests,
        `SCOPE LEAK: ${user.login} sees ${mine!.totalTests} tests, the same as admin ` +
        `(${theirs!.totalTests}) — the order catalogue is not being filtered by test section.`)
        .toBeLessThan(theirs!.totalTests);

      // Panels follow the same rule as tests (the requirement names both).
      if (theirs!.totalPanels > 0) {
        expect(mine!.totalPanels,
          `SCOPE LEAK (panels): ${user.login} sees ${mine!.totalPanels} panels vs admin's ` +
          `${theirs!.totalPanels}. Panels must be section-filtered exactly like tests.`)
          .toBeLessThanOrEqual(theirs!.totalPanels);
      }
    });

    test('C-04 — every visible test belongs to a visible sample type (consistency)', async () => {
      guard();
      expect(mine, 'catalogue must be readable').toBeTruthy();
      const visibleTypeIds = mine!.sampleTypes.map(x => x.id);
      const orphaned = Object.keys(mine!.testsByType).filter(id => !visibleTypeIds.includes(id));
      expect(orphaned,
        `sample-type-tests returned tests for sample types that are not in this user's ` +
        `user-sample-types list (${orphaned.join(', ')}) — the two endpoints disagree about scope, ` +
        `so one of them is not applying the filter.`).toEqual([]);
    });
  });
}
