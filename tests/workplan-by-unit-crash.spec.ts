import { test, expect } from '@playwright/test';

/**
 * TC-WP-UNIT — Workplan By Unit must not 500, and must not blank the app when it does.
 *
 * WHAT WAS FOUND (2026-08-25, testing.openelis-global.org v3.2.2.0)
 * Selecting a unit on /WorkPlanByTestSection issues
 *
 *     GET /rest/WorkPlanByTestSection?test_section_id={id}
 *
 * and for unit 56 (Biochemistry) that returns 500. The React app responds by unmounting
 * everything — `document.getElementById('root').children.length` goes to 0 and the user is left
 * on a blank white page with no error message and no way back except a manual reload.
 *
 * Ten of the eleven units answer 200, so this is data-dependent rather than a dead endpoint:
 *   Hematology 36, Serology-Immunology 117, Immunology 59, Molecular Biology 136, Cytology 165,
 *   Bacteria 57, Serology 97, Virology 76, Pathology 163, Immunohistochemistry 164 — all 200.
 *   Biochemistry 56 — 500, repeatably, on a fresh tab and via direct fetch.
 *
 * TWO SEPARATE DEFECTS, hence two tests:
 *   TC-WP-UNIT-1 is the back end. A workplan query that trips over one row should not 500.
 *   TC-WP-UNIT-2 is the front end, and is the more serious of the pair for a lab user: a failed
 *     API call must surface an error, not unmount the application. This one is worth fixing even
 *     if the 500 is fixed first, because any future 5xx on this route reproduces the blank page.
 *
 * TC-WP-UNIT-2 deliberately stubs the 500 rather than depending on unit 56 staying broken, so it
 * keeps testing the front end after the back end is fixed.
 */

const WORKPLAN_UNIT_API = '**/rest/WorkPlanByTestSection**';

test.describe('TC-WP-UNIT — Workplan By Unit', () => {
  test('TC-WP-UNIT-1: every unit in the picker answers without a 5xx', async ({ page }) => {
    await page.goto('/WorkPlanByTestSection?type=');
    const picker = page.locator('#select-1');
    await expect(picker).toBeVisible();

    const units = await picker.locator('option').evaluateAll((opts) =>
      opts
        .filter((o) => (o as HTMLOptionElement).value)
        .map((o) => ({ id: (o as HTMLOptionElement).value, name: o.textContent?.trim() ?? '' })),
    );
    expect(units.length, 'the unit picker should offer units to test').toBeGreaterThan(0);

    const failures: string[] = [];
    for (const unit of units) {
      const res = await page.request.get(
        `/api/OpenELIS-Global/rest/WorkPlanByTestSection?test_section_id=${unit.id}`,
      );
      if (res.status() >= 500) failures.push(`${unit.name} (id ${unit.id}) -> ${res.status()}`);
    }

    expect(failures, 'units whose workplan query returns a 5xx').toEqual([]);
  });

  test('TC-WP-UNIT-2: a 5xx on the workplan query must not unmount the app', async ({ page }) => {
    // Force the failure so this test keeps its value once the 500 itself is fixed.
    //
    // Fail ONLY the query that carries a unit id. The very same endpoint, called with no
    // test_section_id, is what populates the unit picker on mount — stubbing that too leaves the
    // page with no picker and the test fails for the wrong reason. (Learned the hard way.)
    await page.route(WORKPLAN_UNIT_API, (route) => {
      const url = route.request().url();
      const hasUnit = /[?&]test_section_id=[^&]+/.test(url);
      if (!hasUnit) return route.continue();
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ status: 500, error: 'Internal Server Error' }),
      });
    });

    await page.goto('/WorkPlanByTestSection?type=');
    const picker = page.locator('#select-1');
    await expect(picker).toBeVisible();

    const firstUnit = await picker
      .locator('option')
      .evaluateAll((opts) => (opts.find((o) => (o as HTMLOptionElement).value) as HTMLOptionElement)?.value);
    expect(firstUnit, 'the picker should have a selectable unit').toBeTruthy();

    await picker.selectOption(firstUnit as string);
    await page.waitForTimeout(2000);

    const rootChildren = await page.evaluate(
      () => document.getElementById('root')?.children.length ?? -1,
    );
    expect(
      rootChildren,
      'the app unmounted (root has no children) after the workplan query failed — the user sees a blank page',
    ).toBeGreaterThan(0);

    // And the failure should be visible rather than silent.
    const body = (await page.locator('body').innerText().catch(() => '')) ?? '';
    expect(body.trim().length, 'the page rendered no text at all after the failure').toBeGreaterThan(0);
  });
});
