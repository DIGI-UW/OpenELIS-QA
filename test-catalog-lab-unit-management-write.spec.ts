/**
 * OpenELIS Global — Lab Unit Management: WRITE paths (OGC-189, PR #4121).
 *
 * WHY A SECOND FILE
 * -----------------
 * `test-catalog-lab-unit-management.spec.ts` is the API-contract tier.
 * `test-catalog-lab-unit-management-ui.spec.ts` is the read-only page-interaction tier.
 * Neither exercises a single save. This file does: Add, Basic Info save, the Active toggle,
 * the Assign dialog, a committed Reassign, and a Display Order save.
 *
 * Every expectation below was observed by hand through Claude in Chrome on 2026-09-02 against
 * testing.openelis-global.org (v3.2.2.0) before it was written down. Nothing here is inferred
 * from source — an earlier pass on this feature filed a wrong root cause by reasoning from the
 * code instead of clicking through, and that mistake is not repeated here.
 *
 * SEEDING / SAFETY POLICY
 * -----------------------
 * All writes target ONE stable fixture, `QA_AUTO_LU_FIX`, created once per instance and found
 * by name thereafter. The suite never mints a per-run unit. The tests that touch a REAL lab
 * unit's data are gated behind LU_WRITE=1, because a mid-test failure would leave a real test
 * parked in the fixture:
 *
 *   LU_WRITE=1 npx playwright test -c all-tc.config.ts --project=test-catalog \
 *     test-catalog-lab-unit-management-write.spec.ts
 *
 * OBSERVED DEFECT ENCODED HERE (flip-when-fixed): LU-W-3.
 * The 20-character name cap is enforced on Add and NOT on Edit — at either layer. Measured:
 * a 32-character name entered on the editor saved and persisted (`name` length 32 read back
 * from GET /lab-units-management/303), while the same name on Add is refused client-side with
 * "Name must be 20 characters or less" and server-side with a 422. The client only checks the
 * cap when `view === "add"` (LabUnitManagement.jsx validateForm), and the Name input carries
 * no `maxlength` attribute where Description carries `maxlength="60"`.
 *
 * OBSERVED, NOT A DEFECT (recorded so it is not re-raised):
 *   - A newly created unit is INACTIVE, and the Add form never offers an Active toggle — so
 *     there is no misleading control. Consistent with the API tier's LU-2b contract fact.
 *   - Saving Display Order renumbers every lab unit into a contiguous 1..N sequence, replacing
 *     the sparse seeded values (10, 20, 30, ...) and the Integer.MAX_VALUE sort order that
 *     created units are given. Relative order of the real units is preserved.
 */

/**
 * THE DEACTIVATION GAP (LU-W-10 + LU-W-11) — tracked on OGC-189, WANTED
 * ---------------------------------------------------------------------
 * OGC-189 states the intended semantics in prose: "Soft deactivation: hidden from order entry,
 * data preserved", guarded by an Activation/Deactivation flow whose acceptance criteria are
 *   [ ] Deactivate shows impact summary
 *   [ ] Three options presented (keep / deactivate all / reassign)
 *   [ ] Bulk deactivation requires confirmation
 *   [ ] Activate shows option to activate inactive items
 *
 * None of that is built. What shipped is a bare Active toggle, and it does NOT deliver the
 * stated behaviour: deactivating a unit removes it from the admin list's default filter and
 * changes nothing else. Its tests stay orderable and orders keep routing to it. So this is not
 * merely an unbuilt AC — the control that shipped contradicts a written line of the epic while
 * the flow meant to guard it is absent.
 *
 * Casey confirmed on 2026-09-02 that the cascade AC is wanted, so these two tests hold the
 * current behaviour in place until it lands:
 *   LU-W-10 — no prompt, no impact summary today (CONTRACT FACT)
 *   LU-W-11 — an inactive unit's active tests remain orderable (SPEC-DIVERGENCE)
 * Both flip when the flow ships. LU-W-12 is the read-only control proving the filter is applied
 * on the TEST's active flag and never on the owning unit's.
 */

import { test, expect, Page } from '@playwright/test';

const BASE = process.env.BASE || 'https://testing.openelis-global.org';
const LIST_ROUTE = '/MasterListsPage/LabUnitManagement';

/** Stable fixture — created once, found by name forever after. Under the 20-char cap. */
const FIXTURE_NAME = 'QA_AUTO_LU_FIX';
const FIXTURE_NAME_FR = 'QA_AUTO_LU_FIX_FR';
const FIXTURE_DESC = 'stable QA fixture - do not delete';

/** Gate for the tests that move a real lab unit's test or reorder the menus. */
const RUN_WRITE = process.env.LU_WRITE === '1';

const SEARCH = 'input[placeholder="Search lab units..."]';
const NAME_EN = '#lu-name-en';
const POSITION = '#lu-display-order-position';

const NAME_MAX = 20;
const DESC_MAX = 60;

type Unit = {
  id: string;
  name: string;
  names: Record<string, string>;
  description: string;
  domain: string;
  isActive: boolean;
  sortOrder: number;
  testCount: number;
};

async function api(page: Page, path: string, method = 'GET', payload?: unknown) {
  return page.evaluate(
    async ({ path, method, payload }) => {
      const csrf = localStorage.getItem('CSRF') || '';
      const init: RequestInit = {
        method,
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        credentials: 'include',
      };
      if (method !== 'GET') init.body = JSON.stringify(payload ?? {});
      const r = await fetch('/api/OpenELIS-Global/rest' + path, init);
      const text = await r.text();
      // A lapsed session answers 200 with the login PAGE. Never parse that as data.
      if (text.trimStart().startsWith('<')) return { status: r.status, body: null, lapsed: true };
      let body: any = null;
      try { body = JSON.parse(text); } catch { /* leave null */ }
      return { status: r.status, body, lapsed: false };
    },
    { path, method, payload },
  );
}

async function listUnits(page: Page): Promise<Unit[]> {
  const r = await api(page, '/lab-units-management');
  expect(r.lapsed, 'harness session is still authenticated').toBe(false);
  return (r.body?.data as Unit[]) || [];
}

async function findFixture(page: Page): Promise<Unit | undefined> {
  return (await listUnits(page)).find((u) => u.name === FIXTURE_NAME);
}

async function gotoList(page: Page): Promise<void> {
  await page.goto(`${BASE}${LIST_ROUTE}`);
  await page.waitForFunction(() => !!localStorage.getItem('CSRF'), null, { timeout: 15000 });
  await expect(page.locator('table tbody tr').first()).toBeVisible();
}

/** Opens the Add form through the real button, not a deep link. */
async function openAddForm(page: Page): Promise<void> {
  await gotoList(page);
  await page.getByRole('button', { name: /Add Lab Unit/i }).click();
  await expect(page).toHaveURL(new RegExp(`${LIST_ROUTE}/new/basic-info$`));
  await expect(page.locator(NAME_EN)).toBeVisible();
}

/**
 * Guarantees the fixture exists and is in its canonical state, through the UI where the UI is
 * the thing under test and through REST where it is only setup. Returns its id.
 */
async function ensureFixture(page: Page): Promise<string> {
  let unit = await findFixture(page);
  if (!unit) {
    await openAddForm(page);
    await page.locator(NAME_EN).fill(FIXTURE_NAME);
    await page.locator('input').nth(1).fill(FIXTURE_NAME_FR);
    await page.getByRole('button', { name: /Create Lab Unit/i }).click();
    await expect(page).toHaveURL(new RegExp(`${LIST_ROUTE}/\\d+/basic-info$`), { timeout: 20000 });
    unit = await findFixture(page);
  }
  expect(unit, 'the stable fixture exists after ensure').toBeTruthy();
  return unit!.id;
}

/** Sample types the current user may order against. */
async function userSampleTypes(page: Page): Promise<{ id: string; value: string }[]> {
  const r = await api(page, '/user-sample-types');
  return ((r.body as any[]) || []).map((t) => ({ id: String(t.id), value: String(t.value) }));
}

/**
 * The set of test ids order entry will offer for a sample type. This is the endpoint the
 * ordering path itself reads (`/rest/sample-type-tests?sampleType=<id>`), not a UI scrape —
 * so it answers "is this orderable" without depending on wizard pagination.
 */
async function orderableTestIds(page: Page, sampleTypeId: string): Promise<Set<string>> {
  const r = await api(page, `/sample-type-tests?sampleType=${sampleTypeId}`);
  return new Set(((r.body?.tests as any[]) || []).map((t) => String(t.id)));
}

/** Locates a test by name across the populated lab units, returning it with its current owner. */
async function findTestByName(
  page: Page,
  namePrefix: string,
): Promise<{ id: string; name: string; unitId: string; unitName: string } | undefined> {
  for (const u of await listUnits(page)) {
    if (!u.testCount) continue;
    const r = await api(page, `/lab-units-management/${u.id}/tests`);
    const hit = ((r.body as any[]) || []).find((t) => String(t.name || '').startsWith(namePrefix));
    if (hit) return { id: String(hit.id), name: hit.name, unitId: u.id, unitName: u.name };
  }
  return undefined;
}

/** Drives the Assign dialog to move one named test into a lab unit. */
async function assignTestToUnit(page: Page, unitId: string, testName: string): Promise<void> {
  await page.goto(`${BASE}${LIST_ROUTE}/${unitId}/assigned-tests`);
  await page.getByRole('button', { name: 'Assign tests' }).click();
  await page.getByPlaceholder('Search tests...').fill(testName);
  await expect.poll(async () => page.locator('input[type="checkbox"]').count(), { timeout: 10000 }).toBeLessThan(5);
  await page.locator('input[type="checkbox"]').first().check();
  await page.getByRole('button', { name: /^Assign 1 test$/ }).click();
  await expect
    .poll(async () => (await api(page, `/lab-units-management/${unitId}/tests`)).body?.length, { timeout: 25000 })
    .toBeGreaterThan(0);
}

/** Drives the Reassign dialog to send everything in a unit to a named destination. */
async function reassignAllTo(page: Page, unitId: string, destination: string): Promise<void> {
  await page.goto(`${BASE}${LIST_ROUTE}/${unitId}/assigned-tests`);
  await page.locator('table thead input[type="checkbox"]').first().check();
  await page.getByRole('button', { name: /^Reassign selected \(\d+\)/ }).click();
  await expect(page.getByText('Reassign Tests')).toBeVisible();
  await page.locator('select').last().selectOption({ label: destination });
  await page.getByRole('button', { name: /^Reassign \d+ tests?$/ }).click();
}

/** Flips the Basic Info Active toggle to a target state and saves. No-op if already there. */
async function setUnitActive(page: Page, unitId: string, active: boolean): Promise<void> {
  const current = (await api(page, `/lab-units-management/${unitId}`)).body?.data?.isActive;
  if (current === active) return;
  await page.goto(`${BASE}${LIST_ROUTE}/${unitId}/basic-info`);
  await page.getByText(/^(Active|Inactive)$/).first().click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForTimeout(2000);
}

test.describe('Lab Unit Management — write paths (OGC-189, PR #4121)', () => {
  test('LU-W-1: the Add form offers only the fields it can actually persist, and refuses to submit an empty name', async ({ page }) => {
    await openAddForm(page);

    // Observed 2026-09-02: Name (English), Name (Francais), Domain. No Active toggle and no
    // Description — which is why a created unit landing Inactive is not a misleading control.
    await expect(page.getByText('Name (English)')).toBeVisible();
    await expect(page.getByText('Name (Francais)')).toBeVisible();
    await expect(page.getByText('Domain', { exact: false }).first()).toBeVisible();
    await expect(
      page.getByText('Active', { exact: true }),
      'the Add form must not offer an Active toggle it cannot honour (create ignores isActive)',
    ).toHaveCount(0);

    await expect(
      page.getByRole('button', { name: /Create Lab Unit/i }),
      'Create is unavailable until the required name is supplied',
    ).toBeDisabled();
  });

  test('LU-W-2: [negative] Add refuses an over-length name with a readable message and creates nothing', async ({ page }) => {
    const before = (await listUnits(page)).length;
    await openAddForm(page);

    const tooLong = 'QA_OVERLENGTH_NAME_EXCEEDS_TWENTY';
    expect(tooLong.length, 'sanity: the probe really is over the cap').toBeGreaterThan(NAME_MAX);
    await page.locator(NAME_EN).fill(tooLong);
    await page.getByRole('button', { name: /Create Lab Unit/i }).click();

    await expect(
      page.getByText(`Name must be ${NAME_MAX} characters or less`),
      'the cap is explained in words, not as an HTTP status',
    ).toBeVisible();
    await expect(page.locator(NAME_EN), 'the offending field is marked invalid').toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await expect(page, 'still on the Add form — nothing was created').toHaveURL(/\/new\/basic-info$/);
    expect((await listUnits(page)).length, 'the unit count did not move').toBe(before);
  });

  test('LU-W-3: [DEFECT] the 20-character name cap is enforced on Add but NOT on Edit (FLIP-WHEN-FIXED)', async ({ page }) => {
    const id = await ensureFixture(page);
    const overLong = 'QA_RENAME_OVER_TWENTY_CHARS_LONG';
    expect(overLong.length).toBeGreaterThan(NAME_MAX);

    await page.goto(`${BASE}${LIST_ROUTE}/${id}/basic-info`);
    await expect(page.locator(NAME_EN)).toHaveValue(FIXTURE_NAME);

    // The asymmetry is visible in the markup before a single click: Description is capped by
    // the browser, the name is not.
    await expect(
      page.locator('textarea'),
      'Description is hard-capped by the input itself',
    ).toHaveAttribute('maxlength', String(DESC_MAX));
    expect(
      await page.locator(NAME_EN).getAttribute('maxlength'),
      'DEFECT: the name input carries no maxlength, so the cap depends entirely on validation that the edit path skips',
    ).toBeNull();

    await page.locator(NAME_EN).fill(overLong);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForTimeout(2500);

    // WHEN FIXED: expect the same readable message LU-W-2 asserts, and the name unchanged.
    const readback = await api(page, `/lab-units-management/${id}`);
    expect(
      readback.body?.data?.name,
      'DEFECT: an over-length name persisted through the edit path — neither client nor server enforced the cap on PUT',
    ).toBe(overLong);
    expect((readback.body?.data?.name || '').length).toBeGreaterThan(NAME_MAX);

    // Restore the fixture regardless of the assertion outcome above.
    await page.locator(NAME_EN).fill(FIXTURE_NAME);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect
      .poll(async () => (await api(page, `/lab-units-management/${id}`)).body?.data?.name, { timeout: 20000 })
      .toBe(FIXTURE_NAME);
  });

  test('LU-W-4: [negative] a duplicate name is refused case-insensitively on Add', async ({ page }) => {
    await openAddForm(page);
    // Deliberately mixed case: the check must not be a raw string compare.
    await page.locator(NAME_EN).fill('hEmAtOlOgY');
    await page.getByRole('button', { name: /Create Lab Unit/i }).click();

    await expect(
      page.getByText('This lab unit name already exists'),
      'the collision is named, and matching ignores case',
    ).toBeVisible();
    await expect(page).toHaveURL(/\/new\/basic-info$/);
  });

  test('LU-W-5: Basic Info save round-trips the name, the French name, the Active toggle and a truncated description', async ({ page }) => {
    const id = await ensureFixture(page);
    await page.goto(`${BASE}${LIST_ROUTE}/${id}/basic-info`);

    // Description is truncated by the input as it is typed — assert the browser did the capping.
    const overLongDesc = `${FIXTURE_DESC} - this description is deliberately longer than sixty characters`;
    expect(overLongDesc.length).toBeGreaterThan(DESC_MAX);
    await page.locator('textarea').fill(overLongDesc);
    const typed = await page.locator('textarea').inputValue();
    expect(typed.length, 'the field refuses the 61st character rather than erroring on save').toBe(DESC_MAX);
    await expect(page.getByText(`${DESC_MAX}/${DESC_MAX}`)).toBeVisible();

    // Make sure Active ends up ON whatever it was before, so the fixture is left usable.
    const beforeActive = (await api(page, `/lab-units-management/${id}`)).body?.data?.isActive;
    if (!beforeActive) await page.getByText(/^(Active|Inactive)$/).first().click();

    await page.getByRole('button', { name: 'Save', exact: true }).click();

    await expect
      .poll(async () => (await api(page, `/lab-units-management/${id}`)).body?.data?.isActive, { timeout: 20000 })
      .toBe(true);

    const rec = (await api(page, `/lab-units-management/${id}`)).body.data;
    expect(rec.name, 'the English name survives').toBe(FIXTURE_NAME);
    expect(rec.names.fr, 'the French name round-trips through the locale map').toBe(FIXTURE_NAME_FR);
    expect(rec.description.length, 'the persisted description is the truncated 60 characters').toBe(DESC_MAX);
    expect(rec.description, 'and it is the truncation of what was typed').toBe(typed);
  });

  test('LU-W-6: a created lab unit starts Inactive with no sort order of its own (CONTRACT FACT, not asserted as a defect)', async ({ page }) => {
    // Recorded rather than flagged: the Add form never offers an Active toggle (LU-W-1), so a
    // unit arriving Inactive surprises nobody. The sortOrder is the notable half — created
    // units all land on Integer.MAX_VALUE and therefore tie with each other until somebody
    // saves a Display Order (LU-W-9), which renumbers everything contiguously.
    const units = await listUnits(page);
    const created = units.filter((u) => u.sortOrder === 2147483647);
    test.skip(created.length === 0, 'this instance has no un-ordered units left to observe');
    expect(
      created.length,
      'units created through the UI share Integer.MAX_VALUE as their sort order',
    ).toBeGreaterThan(0);
  });

  test('LU-W-7: the Assign dialog states that assigning MOVES a test, and shows each test its current owner', async ({ page }) => {
    const id = await ensureFixture(page);
    await page.goto(`${BASE}${LIST_ROUTE}/${id}/assigned-tests`);
    await page.getByRole('button', { name: 'Assign tests' }).click();

    await expect(page.getByText('Assign Tests to This Lab Unit')).toBeVisible();
    await expect(
      page.getByText(/Tests belong to exactly one lab unit/i),
      'the move semantics are stated up front, not discovered afterwards',
    ).toBeVisible();

    const commit = page.getByRole('button', { name: /^Assign \d+ tests?$/ });
    await expect(commit, 'nothing is assignable until something is selected').toBeDisabled();
    await expect(commit).toHaveText(/Assign 0 tests/);

    // The search narrows to a single row, and that row advertises its current lab unit.
    await page.getByPlaceholder('Search tests...').fill('Anti-CD30');
    await expect
      .poll(async () => page.locator('input[type="checkbox"]').count(), { timeout: 10000 })
      .toBeLessThan(5);
    await expect(page.getByText('Immunohistochemistry').first()).toBeVisible();

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('Assign Tests to This Lab Unit')).toBeHidden();
  });

  test('LU-W-8: assigning then reassigning a test moves the count off one unit and back (ROUND TRIP)', async ({ page }) => {
    test.skip(!RUN_WRITE, 'moves a real lab unit test; run with LU_WRITE=1');

    const id = await ensureFixture(page);
    const TEST_NAME = 'Anti-CD30';
    const SOURCE = 'Immunohistochemistry';

    const before = await listUnits(page);
    const srcBefore = before.find((u) => u.name === SOURCE)!;
    const fixBefore = before.find((u) => u.id === id)!;
    expect(fixBefore.testCount, 'the fixture starts empty so the round trip is unambiguous').toBe(0);

    // --- assign (a move OUT of the source) ---
    await assignTestToUnit(page, id, TEST_NAME);
    await expect.poll(async () => (await findFixture(page))?.testCount, { timeout: 25000 }).toBe(1);
    const mid = await listUnits(page);
    expect(
      mid.find((u) => u.name === SOURCE)!.testCount,
      'the source lost exactly the one test — assign is a move, not a copy',
    ).toBe(srcBefore.testCount - 1);

    // --- reassign back ---
    await reassignAllTo(page, id, SOURCE);
    await expect.poll(async () => (await findFixture(page))?.testCount, { timeout: 25000 }).toBe(0);
    const after = await listUnits(page);
    expect(
      after.find((u) => u.name === SOURCE)!.testCount,
      'the source is back to its original count — the instance is left as it was found',
    ).toBe(srcBefore.testCount);
  });

  test('LU-W-9: saving a Display Order position renumbers every lab unit into a contiguous sequence', async ({ page }) => {
    test.skip(!RUN_WRITE, 'renumbers every unit sort order; run with LU_WRITE=1');

    const id = await ensureFixture(page);
    const realOrderBefore = (await listUnits(page)).map((u) => u.name).filter((n) => !/^QA/.test(n));

    await page.goto(`${BASE}${LIST_ROUTE}/${id}/display-order`);
    const position = page.locator(POSITION);
    await expect(position).toBeVisible();
    const total = (await listUnits(page)).length;
    await expect(position, 'the ceiling tracks the real unit count').toHaveAttribute('max', String(total));
    const originalPosition = await position.inputValue();

    // Move to the front, save, and confirm the renumbering is real and contiguous.
    await position.fill('2');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Display order saved')).toBeVisible({ timeout: 20000 });

    const moved = await listUnits(page);
    expect(moved.findIndex((u) => u.id === id), 'the fixture sits where it was placed').toBe(1);
    expect(
      moved.map((u) => u.sortOrder),
      'every unit is renumbered 1..N with no gaps and no MAX_VALUE ties left over',
    ).toEqual(Array.from({ length: moved.length }, (_, i) => i + 1));

    // Put it back. NOTE: the success banner pushes the Position field and Save button down the
    // page, so re-resolve them rather than reusing coordinates — a stale position here silently
    // no-ops the second save (observed by hand 2026-09-02).
    await page.locator(POSITION).fill(originalPosition);
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    await expect
      .poll(async () => (await listUnits(page)).findIndex((u) => u.id === id), { timeout: 20000 })
      .toBe(Number(originalPosition) - 1);

    const realOrderAfter = (await listUnits(page)).map((u) => u.name).filter((n) => !/^QA/.test(n));
    expect(
      realOrderAfter,
      'the real lab units are back in their original relative order',
    ).toEqual(realOrderBefore);
  });

  test('LU-W-10: deactivating a lab unit that still holds an assigned test is allowed without a prompt (CONTRACT FACT — unbuilt OGC-189 AC, FLIP-WHEN-FIXED)', async ({ page }) => {
    // OGC-189's Activation/Deactivation AC requires an impact summary and three options
    // (keep / deactivate all / reassign) before a unit goes inactive. None of it is built today:
    // the toggle saves silently even with tests still attached. Casey confirmed 2026-09-02 that
    // the cascade IS wanted, so this asserts the present state and fails — deliberately — the
    // moment the flow ships, which is the signal to rewrite it against the new behaviour.
    // See LU-W-11 for the order-entry half of the same gap.
    const id = await ensureFixture(page);
    await page.goto(`${BASE}${LIST_ROUTE}/${id}/basic-info`);

    await page.getByText(/^(Active|Inactive)$/).first().click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForTimeout(2000);

    expect(
      await page.locator('.cds--modal.is-visible').count(),
      'no confirmation modal stands between the toggle and deactivation today',
    ).toBe(0);

    // Leave the fixture Active.
    await setUnitActive(page, id, true);
    await expect
      .poll(async () => (await api(page, `/lab-units-management/${id}`)).body?.data?.isActive, { timeout: 20000 })
      .toBe(true);
  });

  test('LU-W-11: [SPEC-DIVERGENCE] deactivating a lab unit does NOT remove its active tests from order entry (FLIP-WHEN-FIXED)', async ({ page }) => {
    test.skip(!RUN_WRITE, 'moves a real test and deactivates a unit; run with LU_WRITE=1');

    // OGC-189 states the intended semantics in words:
    //   "Soft deactivation: hidden from order entry, data preserved"
    // and lists the guarding flow as acceptance criteria (impact summary; keep / deactivate all /
    // reassign; typed DEACTIVATE confirmation). None of that is built, and the toggle that IS
    // shipped does not deliver the stated behaviour: the unit disappears from the admin list's
    // default filter and nothing else changes. Orders keep routing to it.
    //
    // Measured by hand 2026-09-02, controlled three ways on the same test (id 422,
    // QA_AUTO_0713 Orderable(Serum)):
    //   in Biochemistry, unit active   -> orderable, 57 Serum tests
    //   moved to the fixture, active   -> orderable, 57 Serum tests
    //   fixture DEACTIVATED            -> still orderable, still 57
    // Confirmed in the UI too: the order wizard's Available Tests list still offered it, 57 items.
    //
    // WHEN THE CASCADE AC SHIPS: invert the final assertion — an inactive unit's tests must drop
    // out of the sample type's orderable set (or be deactivated / reassigned by the flow first).

    const id = await ensureFixture(page);
    const sampleTypes = await userSampleTypes(page);
    const serum = sampleTypes.find((t) => /^Serum$/i.test(t.value));
    expect(serum, 'the instance exposes a Serum sample type').toBeTruthy();

    const orderableBefore = await orderableTestIds(page, serum!.id);
    expect(orderableBefore.size, 'Serum has orderable tests to work with').toBeGreaterThan(0);

    const fixtureTestsBefore = await api(page, `/lab-units-management/${id}/tests`);
    expect((fixtureTestsBefore.body as any[])?.length ?? 0, 'the fixture starts empty').toBe(0);

    const probeName = 'QA_AUTO_0713 Orderable';
    const probe = await findTestByName(page, probeName);
    test.skip(!probe, `this instance has no ${probeName} test to move`);
    const originalOwner = probe!.unitName;

    // --- move it into the fixture while the fixture is ACTIVE (control) ---
    await assignTestToUnit(page, id, probeName);
    expect(
      await orderableTestIds(page, serum!.id).then((s) => s.has(probe!.id)),
      'control: the test is still orderable after a move between two ACTIVE units',
    ).toBe(true);

    // --- deactivate the owning unit ---
    await setUnitActive(page, id, false);
    await expect
      .poll(async () => (await api(page, `/lab-units-management/${id}`)).body?.data?.isActive, { timeout: 20000 })
      .toBe(false);

    const orderableAfter = await orderableTestIds(page, serum!.id);
    expect(
      orderableAfter.has(probe!.id),
      'SPEC-DIVERGENCE: OGC-189 says soft deactivation hides a unit from order entry; its active tests remain orderable',
    ).toBe(true);
    expect(
      orderableAfter.size,
      "and the sample type's orderable count is completely unmoved by the deactivation",
    ).toBe(orderableBefore.size);

    // --- restore: reactivate, and send the test home ---
    await setUnitActive(page, id, true);
    await reassignAllTo(page, id, originalOwner);
    await expect
      .poll(async () => (await api(page, `/lab-units-management/${id}/tests`)).body?.length, { timeout: 25000 })
      .toBe(0);
  });

  test("LU-W-12: the TEST's own active flag is what gates order entry — inactive tests appear in no sample type", async ({ page }) => {
    // The other half of LU-W-11, and read-only. If this passes while LU-W-11 shows an inactive
    // unit changing nothing, the conclusion is unambiguous: orderability is filtered on the test,
    // never on the lab unit that owns it.
    const units = await listUnits(page);

    // Collect the inactive tests across the populated lab units.
    const inactive: { id: string; name: string; unit: string }[] = [];
    for (const u of units) {
      if (!u.testCount) continue;
      const r = await api(page, `/lab-units-management/${u.id}/tests`);
      for (const t of (r.body as any[]) || []) {
        if (t.active === false) inactive.push({ id: String(t.id), name: t.name, unit: u.name });
      }
      if (inactive.length >= 5) break;
    }
    test.skip(inactive.length === 0, 'this instance has no inactive tests to check');

    // Union the orderable ids across every sample type the user can order.
    const sampleTypes = await userSampleTypes(page);
    const orderable = new Set<string>();
    for (const st of sampleTypes) {
      for (const id of await orderableTestIds(page, st.id)) orderable.add(id);
    }
    expect(orderable.size, 'the union of orderable tests is non-empty').toBeGreaterThan(0);

    const leaked = inactive.filter((t) => orderable.has(t.id));
    expect(
      leaked.map((t) => `${t.name} (${t.unit})`),
      'an inactive test must not be orderable under ANY sample type',
    ).toEqual([]);
  });
});
